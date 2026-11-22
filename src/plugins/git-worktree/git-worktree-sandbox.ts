import { Context, Data, Effect, FileSystem, Layer, Path, Semaphore } from "effect";
import type { ChildProcessSpawner } from "effect/process";

import {
  Provisioner,
  ProvisionerGaveUp,
  SandboxProbe,
  SandboxTeardown,
  TeardownGaveUp,
} from "../../index.ts";
import { runGit } from "./git.ts";

/** Options of the git-worktree Sandbox plugin; only `repoDir` is required. */
export interface GitWorktreeOptions {
  /** The repository the worktrees are made from. */
  readonly repoDir: string;
  /** The folder each work item's worktree is made in; `<repoDir>/.rouage/worktrees` by default. */
  readonly worktreesDir?: string | undefined;
  /** The commit, branch or tag a new worktree starts from; `HEAD` by default. */
  readonly baseRef?: string | undefined;
  /** What a work item's branch name starts with, before its work item ID; `rouage/` by default. */
  readonly branchPrefix?: string | undefined;
}

// A work item ID becomes a folder name and part of a branch name, so it may
// not hold a separator or anything else git or the file system reads specially.
const safeWorkItemId = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

const isSafe = (workItemId: string) =>
  safeWorkItemId.test(workItemId) && !workItemId.includes("..") && !workItemId.endsWith(".lock");

const settingsOf = Effect.fnUntraced(function* (options: GitWorktreeOptions) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const repoDir = path.resolve(options.repoDir);
  yield* runGit(repoDir, ["rev-parse", "--git-dir"]);
  const configured = path.resolve(repoDir, options.worktreesDir ?? ".rouage/worktrees");
  yield* fs.makeDirectory(configured, { recursive: true });
  // Git lists worktrees by their real path, so the probe compares real paths.
  const worktreesDir = yield* fs.realPath(configured);
  return {
    repoDir,
    worktreesDir,
    baseRef: options.baseRef ?? "HEAD",
    branchPrefix: options.branchPrefix ?? "rouage/",
  };
});

// A work item ID that cannot name a worktree folder and a branch.
class UnsafeWorkItemId extends Data.TaggedError("UnsafeWorkItemId")<{
  readonly message: string;
}> {}

type Settings = Effect.Success<ReturnType<typeof settingsOf>>;

const worktrees = Effect.fnUntraced(function* (settings: Settings) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const pathOf = (workItemId: string) => path.join(settings.worktreesDir, workItemId);
  const branchOf = (workItemId: string) => `${settings.branchPrefix}${workItemId}`;
  const context = yield* Effect.context<ChildProcessSpawner.ChildProcessSpawner>();
  const git = (args: readonly string[]) =>
    runGit(settings.repoDir, args).pipe(Effect.provide(context));

  const remove = Effect.fnUntraced(function* (workItemId: string) {
    yield* fs.remove(pathOf(workItemId), { recursive: true, force: true });
    yield* git(["worktree", "prune"]);
    const branch = branchOf(workItemId);
    const branches = yield* git(["for-each-ref", "--format=%(refname)", `refs/heads/${branch}`]);
    if (branches.trim() !== "") {
      yield* git(["branch", "--delete", "--force", branch]);
    }
  });

  const add = Effect.fnUntraced(function* (workItemId: string) {
    const sandboxRef = pathOf(workItemId);
    yield* git([
      "worktree",
      "add",
      "--quiet",
      "-B",
      branchOf(workItemId),
      sandboxRef,
      settings.baseRef,
    ]);
    return sandboxRef;
  });

  const replace = Effect.fnUntraced(function* (workItemId: string) {
    if (!isSafe(workItemId)) {
      return yield* new UnsafeWorkItemId({
        message: `${workItemId} cannot name a git worktree and branch`,
      });
    }
    yield* remove(workItemId);
    return { sandboxRef: yield* add(workItemId) };
  });

  const count = Effect.fnUntraced(function* (workItemId: string) {
    const listed = yield* git(["worktree", "list", "--porcelain"]);
    const entry = `worktree ${pathOf(workItemId)}`;
    return listed.split("\n").filter((line) => line === entry).length;
  });

  return { remove, replace, count };
});

/**
 * A Sandbox plugin that gives each work item its own git worktree of
 * `repoDir`, on a branch of its own, made from `baseRef`. The sandbox
 * reference is the worktree's absolute path, so a plugin that works in a
 * directory can use it as is. Provisioning again replaces the worktree with a
 * fresh one, and teardown removes the worktree and its branch, succeeding
 * when there is none. Every provision and teardown runs one at a time, so a
 * teardown arriving while a provision unwinds runs after it (ADR 0007).
 * Needs a child process spawner, a file system and paths, which the
 * NodeServices layer of @effect/platform-node provides; fails to build when
 * `repoDir` is not a git repository.
 */
export const gitWorktreeSandbox = (options: GitWorktreeOptions) =>
  Layer.effectContext(
    Effect.gen(function* () {
      const settings = yield* settingsOf(options);
      const tree = yield* worktrees(settings);
      const oneAtATime = yield* Semaphore.make(1);
      const serial = <A, E, R>(effect: Effect.Effect<A, E, R>) => oneAtATime.withPermit(effect);
      const provisioner = Provisioner.of({
        provision: ({ workItemId }) =>
          tree.replace(workItemId).pipe(
            serial,
            Effect.mapError((error) => new ProvisionerGaveUp({ message: error.message })),
          ),
      });
      const teardown = SandboxTeardown.of({
        teardown: ({ workItemId }) =>
          (isSafe(workItemId) ? tree.remove(workItemId) : Effect.void).pipe(
            serial,
            Effect.mapError((error) => new TeardownGaveUp({ message: error.message })),
          ),
      });
      const probe = SandboxProbe.of({
        liveSandboxes: (workItemId) =>
          isSafe(workItemId) ? tree.count(workItemId) : Effect.succeed(0),
      });
      return Context.make(Provisioner, provisioner).pipe(
        Context.add(SandboxTeardown, teardown),
        Context.add(SandboxProbe, probe),
      );
    }),
  );
