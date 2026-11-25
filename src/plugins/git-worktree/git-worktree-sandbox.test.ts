import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Exit, FileSystem, Layer } from "effect";

import { Provisioner, SandboxTeardown } from "../../index.ts";
import { provisionTask, sandboxUnderTest } from "./git-worktree-harness.ts";
import { gitWorktreeSandbox } from "./git-worktree-sandbox.ts";
import { runGit } from "./git.ts";

const provision = Effect.flatMap(Provisioner, (provisioner) =>
  provisioner.provision(provisionTask),
);

describe("the git-worktree sandbox", () => {
  it.effect("provisions a checkout of the repository at the sandbox reference", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { layer } = yield* sandboxUnderTest();
      const { sandboxRef } = yield* provision.pipe(Effect.provide(layer));
      const readme = yield* fs.readFileString(`${sandboxRef}/README.md`);
      expect(readme).toBe("# acme\n");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("works on a branch named for the work item", () =>
    Effect.gen(function* () {
      const { layer } = yield* sandboxUnderTest();
      const { sandboxRef } = yield* provision.pipe(Effect.provide(layer));
      const branch = yield* runGit(sandboxRef, ["branch", "--show-current"]);
      expect(branch.trim()).toBe("rouage/work-item-7");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("starts again from the base commit when provisioned again", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { layer } = yield* sandboxUnderTest();
      const again = yield* Effect.gen(function* () {
        const first = yield* provision;
        yield* fs.writeFileString(`${first.sandboxRef}/left-over.txt`, "from an earlier run");
        return yield* provision;
      }).pipe(Effect.provide(layer));
      expect(yield* fs.exists(`${again.sandboxRef}/left-over.txt`)).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("removes the work item's branch when it tears the sandbox down", () =>
    Effect.gen(function* () {
      const { repoDir, layer } = yield* sandboxUnderTest();
      yield* Effect.gen(function* () {
        yield* provision;
        const sandbox = yield* SandboxTeardown;
        yield* sandbox.teardown({ workItemId: provisionTask.workItemId });
      }).pipe(Effect.provide(layer));
      const branches = yield* runGit(repoDir, ["branch", "--list", "rouage/*"]);
      expect(branches).toBe("");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("gives up on a work item ID that cannot name a branch", () =>
    Effect.gen(function* () {
      const { layer } = yield* sandboxUnderTest();
      const error = yield* Effect.flatMap(Provisioner, (provisioner) =>
        provisioner.provision({ ...provisionTask, workItemId: "../escape" }),
      ).pipe(Effect.provide(layer), Effect.flip);
      expect(error.message).toBe("../escape cannot name a git worktree and branch");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("fails to build when the repository folder is not a git repository", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const repoDir = yield* fs.makeTempDirectoryScoped({ prefix: "rouage-not-a-repo-" });
      const exit = yield* Layer.build(gitWorktreeSandbox({ repoDir })).pipe(Effect.exit);
      expect(Exit.isFailure(exit)).toBe(true);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
