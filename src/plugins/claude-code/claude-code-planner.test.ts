import { describe, expect, it } from "@effect/vitest";
import { Effect, FileSystem, Path } from "effect";

import type { PlanTask } from "../../index.ts";
import { Planner } from "../../index.ts";
import type { PluginUnderTest } from "./claude-code-harness.ts";
import { nodeFiles, planTask, pluginUnderTest, promptOf } from "./claude-code-harness.ts";

const planned = [{ _tag: "replays", transcript: "planned-with-demo" }] as const;

const plannedOn = (setup: PluginUnderTest, task: PlanTask = planTask) =>
  Effect.gen(function* () {
    const plugin = yield* pluginUnderTest(setup);
    const answer = yield* Effect.flatMap(Planner, (planner) => planner.plan(task)).pipe(
      Effect.provide(plugin.layer),
    );
    const [run] = plugin.claude.spawned();
    return { answer, plugin, args: run?.args ?? [], cwd: run?.cwd };
  });

describe("the Claude Code planner", () => {
  it.effect(
    "stores the plan Claude wrote in the work item's plan file, with its demo decision",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const { answer, plugin } = yield* plannedOn({ runs: planned });
        const planRef = path.join(plugin.artifactsDir, "work-item-7", "plan.md");
        expect(answer).toStrictEqual({ planRef, demo: true });
        expect(yield* fs.readFileString(planRef)).toBe(
          "# Plan\n\n1. Guard the null draft in DraftStore.save.\n2. Add a test saving a new draft.",
        );
      }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect(
    "asks Claude in the plan role, in the sandbox's workspace, to plan from the spec and reproduction",
    () =>
      Effect.gen(function* () {
        const { args, cwd } = yield* plannedOn({
          runs: planned,
          options: { workspace: (sandboxRef) => `${sandboxRef}/checkout` },
        });
        expect(cwd).toBe("/sandboxes/work-item-7/checkout");
        const prompt = yield* promptOf(args, "rouage-plan");
        expect(prompt).toContain("/work/acme/.rouage/artifacts/work-item-7/spec.md");
        expect(prompt).toContain("/work/acme/.rouage/artifacts/work-item-7/reproduction.md");
      }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("plans in the repository checkout when the work item has no sandbox", () =>
    Effect.gen(function* () {
      const { cwd } = yield* plannedOn(
        { runs: planned, options: { repoDir: "/work/acme" } },
        { ...planTask, sandboxRef: null },
      );
      expect(cwd).toBe("/work/acme");
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("gives up when Claude uses every turn its role allows", () =>
    Effect.gen(function* () {
      const gaveUp = yield* Effect.flip(
        plannedOn({ runs: [{ _tag: "replays", transcript: "turn-limit" }] }),
      );
      expect(gaveUp._tag).toBe("PlannerGaveUp");
      expect(gaveUp.message).toMatch(/^Claude used every turn its role allows/u);
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );
});
