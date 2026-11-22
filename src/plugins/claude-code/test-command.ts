import { Data, Effect, Stream } from "effect";
import type { PlatformError } from "effect/PlatformError";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

/** How one run of the test command went, judged by its exit code, with everything it printed. */
export type TestRun =
  | { readonly _tag: "passed"; readonly output: string }
  | { readonly _tag: "failed"; readonly output: string };

/** The test command could not be started at all, as opposed to it running and failing. */
export class TestCommandUnrunnable extends Data.TaggedError("TestCommandUnrunnable")<{
  readonly message: string;
}> {}

const finishedTestCommand = (command: string, cwd: string | undefined) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const handle = yield* spawner.spawn(
      ChildProcess.make("sh", ["-c", command], { cwd, extendEnv: true, stdin: "ignore" }),
    );
    const [output, exitCode] = yield* Effect.all(
      [handle.all.pipe(Stream.decodeText(), Stream.mkString), handle.exitCode],
      { concurrency: "unbounded" },
    );
    return { output, exitCode };
  }).pipe(Effect.scoped);

const runTestCommand = (command: string, cwd: string | undefined) =>
  finishedTestCommand(command, cwd).pipe(
    Effect.map(({ output, exitCode }): TestRun =>
      exitCode === 0 ? { _tag: "passed", output } : { _tag: "failed", output },
    ),
    Effect.mapError(
      (error: PlatformError) =>
        new TestCommandUnrunnable({
          message: `The test command \`${command}\` could not run: ${error.message}`,
        }),
    ),
  );

/** Runs the configured test command in a workspace. */
export interface TestCommandRunner {
  readonly run: (cwd: string | undefined) => Effect.Effect<TestRun, TestCommandUnrunnable>;
}

/**
 * The runner of `testCommand`, or null when none is configured and Claude
 * judges instead. It runs the command with `sh -c`, passing when it exits 0
 * and failing otherwise, so the check rests on the tests and not on the
 * agent that made the change (ADR 0010).
 */
export const makeTestCommandRunner = Effect.fnUntraced(function* (testCommand: string | undefined) {
  const context = yield* Effect.context<ChildProcessSpawner.ChildProcessSpawner>();
  if (testCommand === undefined) {
    return null;
  }
  const runner: TestCommandRunner = {
    run: (cwd) => runTestCommand(testCommand, cwd).pipe(Effect.provide(context)),
  };
  return runner;
});
