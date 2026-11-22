import * as NodeChildProcessSpawner from "@effect/platform-node/NodeChildProcessSpawner";
import { Deferred, Effect, FileSystem, Layer, Path, Redacted, Sink, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

/** The recorded `stream-json` transcripts the fake replays, by file name in `transcripts/`. */
export type Transcript =
  | "classified-as-bug"
  | "not-logged-in"
  | "planned-with-demo"
  | "review-approved"
  | "review-changes-requested"
  | "spec-unclear"
  | "spec-written"
  | "turn-limit"
  | "unreadable-answer"
  | "usage-limit"
  | "without-structured-output";

/** How one fake `claude` run goes: it replays a transcript, or crashes, or never ends. */
export type FakeRun =
  | { readonly _tag: "replays"; readonly transcript: Transcript }
  | { readonly _tag: "crashes"; readonly stderr: string; readonly exitCode: number }
  | { readonly _tag: "hangs" };

/** What the plugin started a fake run with, as `claude` would see it. */
export interface Spawned {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string | undefined;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly extendEnv: boolean;
}

const encoder = new TextEncoder();
const bytes = (text: string) => Stream.make(encoder.encode(text));

const plain = (word: string | Redacted.Redacted) =>
  Redacted.isRedacted(word) ? Redacted.value(word) : word;

const spawnedOf = (command: ChildProcess.Command): Spawned => {
  if (!ChildProcess.isStandardCommand(command)) {
    return { command: "<piped>", args: [], cwd: undefined, env: {}, extendEnv: false };
  }
  const { env } = command.options;
  return {
    command: command.command,
    args: command.args.map(plain),
    cwd: command.options.cwd,
    env: Object.fromEntries(
      Object.entries(env ?? {}).map(([name, value]) => [
        name,
        value === undefined ? value : plain(value),
      ]),
    ),
    extendEnv: command.options.extendEnv === true,
  };
};

const outputOf = (run: FakeRun, transcripts: ReadonlyMap<Transcript, string>) => {
  if (run._tag === "replays") {
    return { stdout: bytes(transcripts.get(run.transcript) ?? ""), stderr: Stream.empty, exit: 0 };
  }
  return run._tag === "crashes"
    ? { stdout: Stream.empty, stderr: bytes(run.stderr), exit: run.exitCode }
    : { stdout: Stream.never, stderr: Stream.never, exit: null };
};

const handleOf = (run: FakeRun, transcripts: ReadonlyMap<Transcript, string>, pid: number) => {
  const output = outputOf(run, transcripts);
  return ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(pid),
    exitCode:
      output.exit === null
        ? Effect.never
        : Effect.succeed(ChildProcessSpawner.ExitCode(output.exit)),
    isRunning: Effect.succeed(output.exit === null),
    kill: () => Effect.void,
    stdin: Sink.drain,
    stdout: output.stdout,
    stderr: output.stderr,
    all: Stream.merge(output.stdout, output.stderr),
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
    unref: Effect.succeed(Effect.void),
  });
};

const isClaude = (command: ChildProcess.Command) =>
  ChildProcess.isStandardCommand(command) && /(?:^|\/)claude$/u.test(command.command);

const loadTranscripts = Effect.fnUntraced(function* (runs: readonly FakeRun[]) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const transcripts = new Map<Transcript, string>();
  for (const run of runs) {
    if (run._tag === "replays") {
      const file = yield* path.fromFileUrl(
        new URL(`transcripts/${run.transcript}.jsonl`, import.meta.url),
      );
      transcripts.set(run.transcript, yield* fs.readFileString(file));
    }
  }
  return transcripts;
});

/**
 * A `ChildProcessSpawner` standing in for `claude`: each spawn goes as the
 * next of `runs` says, the last repeating. It records what each run was
 * started with, signals when the nth has started, and counts the runs
 * stopped while still running, as a timeout or an interruption stops them.
 * Any other command, such as a test command, really runs.
 */
export const fakeClaude = Effect.fnUntraced(function* (runs: readonly [FakeRun, ...FakeRun[]]) {
  const transcripts = yield* loadTranscripts(runs);
  const real = yield* Effect.provide(
    ChildProcessSpawner.ChildProcessSpawner,
    NodeChildProcessSpawner.layer,
  );
  const spawned: Spawned[] = [];
  const starts = yield* Effect.forEach(runs, () => Deferred.make<boolean>());
  let stopped = 0;
  const fake = (command: ChildProcess.Command) =>
    Effect.gen(function* () {
      const index = spawned.length;
      const run = runs[Math.min(index, runs.length - 1)] ?? runs[0];
      spawned.push(spawnedOf(command));
      if (run._tag === "hangs") {
        yield* Effect.addFinalizer(() => Effect.sync(() => (stopped += 1)));
      }
      const started = starts[index];
      if (started !== undefined) {
        yield* Deferred.succeed(started, true);
      }
      return handleOf(run, transcripts, 1000 + index);
    });
  const spawn = (command: ChildProcess.Command) =>
    isClaude(command) ? fake(command) : real.spawn(command);
  return {
    layer: Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, ChildProcessSpawner.make(spawn)),
    spawned: () => spawned,
    started: (nth: number) => {
      const started = starts[nth - 1];
      return started === undefined
        ? Effect.die(`The fake claude has no run ${nth} to start`)
        : Deferred.await(started);
    },
    stopped: () => stopped,
  };
});
