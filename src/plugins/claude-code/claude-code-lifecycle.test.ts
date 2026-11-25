import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path } from "effect";

import type { NewWorkItem } from "../../index.ts";
import {
  Sampler,
  SamplerGaveUp,
  Shipper,
  ShipperGaveUp,
  createWorkItem,
  withDefaultStages,
} from "../../index.ts";
import { sandboxUnderTest } from "../git-worktree/git-worktree-harness.ts";
import { flagValue, pluginUnderTest } from "./claude-code-harness.ts";

// Fake claude writes no files, so the reproduction cannot really start
// passing; this command fails on its first run, when Reproduce confirms the
// bug, and passes on every run after, when Build tests the fix.
const failsFirstThenPasses = "[ -f .rouage-ran ] || { touch .rouage-ran; exit 1; }";

const newWorkItem: NewWorkItem = { id: "work-item-7", issueRef: "tonytangdev/rouage#7" };

const reviewer = { by: "ada", at: "2026-11-19T10:00:00.000Z" } as const;

// Neither plugin fills the Sampler or the Shipper, and a bug that needs no
// sample and stops at the ship gate never calls them.
const portsNeitherPluginFills = Layer.mergeAll(
  Layer.succeed(Sampler)(
    Sampler.of({
      sample: () => Effect.fail(new SamplerGaveUp({ message: "no sample is expected" })),
    }),
  ),
  Layer.succeed(Shipper)(
    Shipper.of({
      ship: () => Effect.fail(new ShipperGaveUp({ message: "no ship is expected" })),
    }),
  ),
);

describe("the default lifecycle with the Claude Code and git-worktree plugins", () => {
  it.effect(
    "carries a bug to the ship gate with claude filling every Agent port, in a git worktree",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const sandbox = yield* sandboxUnderTest();
        const plugin = yield* pluginUnderTest({
          runs: [
            { _tag: "replays", transcript: "classified-as-bug" },
            { _tag: "replays", transcript: "spec-written" },
            { _tag: "replays", transcript: "capture-captured" },
            { _tag: "replays", transcript: "planned-with-demo" },
            { _tag: "replays", transcript: "implement-done" },
            { _tag: "replays", transcript: "demonstrate-demonstrated" },
            { _tag: "replays", transcript: "review-approved" },
          ],
          options: { repoDir: sandbox.repoDir, testCommand: failsFirstThenPasses },
        });
        const layer = Layer.mergeAll(portsNeitherPluginFills, sandbox.layer, plugin.layer);
        const lifecycle = yield* withDefaultStages().pipe(Effect.provide(layer));
        const workItem = yield* createWorkItem(lifecycle, newWorkItem).pipe(Effect.provide(layer));
        yield* workItem.reaches("specGate");
        workItem.send({ type: "approve", ...reviewer });
        yield* workItem.reaches("shipGate");
        const worktree = yield* fs.realPath(
          path.join(sandbox.repoDir, ".rouage", "worktrees", newWorkItem.id),
        );
        const artifactOf = (name: string) => path.join(plugin.artifactsDir, newWorkItem.id, name);
        expect(workItem.context().facts).toMatchObject({
          kind: "bug",
          specRef: artifactOf("spec.md"),
          sandboxRef: worktree,
          reproductionRef: artifactOf("reproduction.md"),
          planRef: artifactOf("plan.md"),
          demoRef: artifactOf("demo.md"),
        });
        expect(yield* fs.exists(artifactOf("demo.md"))).toBe(true);
        expect(
          plugin.claude.spawned().map(({ args, cwd }) => [flagValue(args, "--agent"), cwd]),
        ).toStrictEqual([
          ["rouage-classify", sandbox.repoDir],
          ["rouage-write", sandbox.repoDir],
          ["rouage-capture", worktree],
          ["rouage-plan", worktree],
          ["rouage-implement", worktree],
          ["rouage-demonstrate", worktree],
          ["rouage-review", worktree],
        ]);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
