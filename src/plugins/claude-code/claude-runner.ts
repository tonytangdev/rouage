import { Clock, Duration, Effect, FileSystem, Path, Schema, Semaphore, Stream } from "effect";
import type { PlatformError } from "effect/PlatformError";
import { ChildProcessSpawner } from "effect/process";

import { runsDirOf } from "./artifacts.ts";
import type { PluginSettings } from "./claude-code-options.ts";
import type { RunRequest } from "./claude-invocation.ts";
import { invocationOf } from "./claude-invocation.ts";
import type { ClaudeRunFailure } from "./run-failures.ts";
import { AnswerUnreadable, ClaudeCrashed, RunTimedOut } from "./run-failures.ts";
import type { FinishedRun } from "./run-judgement.ts";
import { judgeRun } from "./run-judgement.ts";

/** Runs `claude` once per request, answering with the run's structured output decoded by `answer`. */
export interface ClaudeRunner {
  readonly run: <A>(
    request: RunRequest,
    answer: Schema.Decoder<A>,
  ) => Effect.Effect<A, ClaudeRunFailure>;
}

const couldNotRun = (error: PlatformError) =>
  new ClaudeCrashed({ message: `claude could not run: ${error.message}` });

const transcriptWriter = Effect.fnUntraced(function* (plugin: PluginSettings, request: RunRequest) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  if (!request.role.settings.keepTranscripts) {
    return (_line: string) => Effect.void;
  }
  const dir = runsDirOf(path, plugin.artifactsDir, request.workItemId);
  yield* fs.makeDirectory(dir, { recursive: true });
  const file = path.join(dir, `${request.role.name}-${yield* Clock.currentTimeMillis}.jsonl`);
  yield* fs.writeFileString(file, "");
  yield* Effect.log(`Saving the ${request.role.name} run's transcript to ${file}`);
  return (line: string) => fs.writeFileString(file, `${line}\n`, { flag: "a" });
});

const finishedRun = Effect.fnUntraced(function* (plugin: PluginSettings, request: RunRequest) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const save = yield* transcriptWriter(plugin, request);
  const handle = yield* spawner.spawn(invocationOf(plugin, request));
  const [lines, stderr, exitCode] = yield* Effect.all(
    [
      handle.stdout.pipe(
        Stream.decodeText(),
        Stream.splitLines,
        Stream.tap(save),
        Stream.runCollect,
      ),
      handle.stderr.pipe(Stream.decodeText(), Stream.mkString),
      handle.exitCode,
    ],
    { concurrency: "unbounded" },
  );
  return { lines, stderr, exitCode } satisfies FinishedRun;
});

const answerOf = <A>(run: FinishedRun, answer: Schema.Decoder<A>) =>
  Effect.fromResult(judgeRun(run)).pipe(
    Effect.flatMap((output) =>
      Schema.decodeUnknownEffect(answer)(output).pipe(
        Effect.mapError(
          (error) =>
            new AnswerUnreadable({
              message: `Claude's answer does not match the port's schema: ${error.message}`,
            }),
        ),
      ),
    ),
  );

const untilReset = Effect.fnUntraced(function* (resetsAt: Date) {
  const now = yield* Clock.currentTimeMillis;
  yield* Effect.log(`Waiting until ${resetsAt.toISOString()} for Claude's usage limit to reset`);
  yield* Effect.sleep(Duration.millis(Math.max(0, resetsAt.getTime() - now)));
});

/**
 * The runner every port of the plugin shares, so at most
 * `maxConcurrentRuns` runs at once and the rest queue. A run's timeout
 * starts once it has a slot; a run that times out or is interrupted closes
 * its scope, which kills `claude`'s process group. The only retry is
 * waiting out a usage limit, when the role's `waitOnUsageLimit` is on.
 */
export const makeClaudeRunner = Effect.fnUntraced(function* (plugin: PluginSettings) {
  const context = yield* Effect.context<
    ChildProcessSpawner.ChildProcessSpawner | FileSystem.FileSystem | Path.Path
  >();
  const slots = yield* Semaphore.make(plugin.maxConcurrentRuns);
  const once = (request: RunRequest) =>
    finishedRun(plugin, request).pipe(
      Effect.scoped,
      Effect.mapError(couldNotRun),
      Effect.timeoutOrElse({
        duration: request.role.settings.timeout,
        orElse: () =>
          Effect.fail(
            new RunTimedOut({
              message: `Claude ran past the ${request.role.name} role's timeout of ${Duration.format(request.role.settings.timeout)} and was stopped`,
            }),
          ),
      }),
      (timed) => slots.withPermit(timed),
    );
  const run = <A>(
    request: RunRequest,
    answer: Schema.Decoder<A>,
  ): Effect.Effect<A, ClaudeRunFailure> =>
    once(request).pipe(
      Effect.flatMap((finished) => answerOf(finished, answer)),
      Effect.catchTag("UsageLimitReached", (limit) =>
        request.role.settings.waitOnUsageLimit && limit.resetsAt !== null
          ? untilReset(limit.resetsAt).pipe(
              Effect.andThen(Effect.suspend(() => run(request, answer))),
            )
          : Effect.fail(limit),
      ),
      Effect.provide(context),
    );
  return { run } satisfies ClaudeRunner;
});
