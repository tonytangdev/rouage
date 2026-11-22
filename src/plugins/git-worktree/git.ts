import { Data, Effect, Stream } from "effect";
import type { PlatformError } from "effect/PlatformError";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

/** A git command could not run or exited with a failure. */
export class GitFailed extends Data.TaggedError("GitFailed")<{
  readonly message: string;
}> {}

// Git sets these while it runs a hook such as pre-commit, and they would point
// every command at the hook's repository instead of the one in `-C`.
const repositoryVars = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_COMMON_DIR",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_PREFIX",
] as const;

const gitEnv = Object.fromEntries(repositoryVars.map((name) => [name, undefined]));

const finishedGit = (repoDir: string, args: readonly string[]) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const handle = yield* spawner.spawn(
      ChildProcess.make("git", ["-C", repoDir, ...args], {
        env: gitEnv,
        extendEnv: true,
        stdin: "ignore",
      }),
    );
    const [stdout, stderr, exitCode] = yield* Effect.all(
      [
        handle.stdout.pipe(Stream.decodeText(), Stream.mkString),
        handle.stderr.pipe(Stream.decodeText(), Stream.mkString),
        handle.exitCode,
      ],
      { concurrency: "unbounded" },
    );
    return { stdout, stderr, exitCode };
  }).pipe(
    Effect.scoped,
    Effect.mapError(
      (error: PlatformError) => new GitFailed({ message: `git could not run: ${error.message}` }),
    ),
  );

/** Runs `git args` in `repoDir`, answering with its standard output; fails when git exits non-zero. */
export const runGit = Effect.fnUntraced(function* (repoDir: string, args: readonly string[]) {
  const { stdout, stderr, exitCode } = yield* finishedGit(repoDir, args);
  if (exitCode !== 0) {
    return yield* new GitFailed({
      message: `git ${args.join(" ")} exited with code ${exitCode}: ${stderr.trim()}`,
    });
  }
  return stdout;
});
