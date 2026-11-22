import * as NodeServices from "@effect/platform-node/NodeServices";
import { Effect, FileSystem, Layer } from "effect";

import type { ProvisionTask } from "../../index.ts";
import type { GitWorktreeOptions } from "./git-worktree-sandbox.ts";
import { gitWorktreeSandbox } from "./git-worktree-sandbox.ts";
import { runGit } from "./git.ts";

/** A provision task as Provision first asks it. */
export const provisionTask: ProvisionTask = {
  workItemId: "work-item-7",
  issueRef: "tonytangdev/rouage#7",
  specRef: "/work/acme/.rouage/artifacts/work-item-7/spec.md",
  previousSandboxRef: null,
  feedback: null,
};

/** A fresh repository in a temporary folder, with one commit holding a README. */
export const tempRepo = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const repoDir = yield* fs.makeTempDirectoryScoped({ prefix: "rouage-git-worktree-" });
  yield* runGit(repoDir, ["init", "--quiet", "--initial-branch=main"]);
  yield* fs.writeFileString(`${repoDir}/README.md`, "# acme\n");
  yield* runGit(repoDir, ["add", "README.md"]);
  yield* runGit(repoDir, [
    "-c",
    "user.name=Rouage Test",
    "-c",
    "user.email=test@rouage.invalid",
    "commit",
    "--quiet",
    "-m",
    "Initial commit",
  ]);
  return repoDir;
});

/** The plugin's Layer on a fresh repository, with the repository's folder. */
export const sandboxUnderTest = Effect.fnUntraced(function* (
  options: Omit<GitWorktreeOptions, "repoDir"> = {},
) {
  const repoDir = yield* tempRepo;
  const layer = gitWorktreeSandbox({ repoDir, ...options }).pipe(Layer.provide(NodeServices.layer));
  return { repoDir, layer };
});

/** The plugin's Layer on a fresh repository that lives as long as the Layer. */
export const sandboxLayer = Layer.unwrap(
  Effect.map(sandboxUnderTest(), (sandbox) => sandbox.layer),
).pipe(Layer.provide(NodeServices.layer));
