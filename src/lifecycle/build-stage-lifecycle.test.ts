import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import type { FakeAgentScript } from "../plugins/fake-agent.ts";
import { fakeAgent } from "../plugins/fake-agent.ts";
import { buildStage } from "./build-stage.ts";
import { restoredWorkItem, startWorkItem } from "./lifecycle-harness.ts";

type Driven = Effect.Success<ReturnType<typeof startWorkItem>>;

const reviewer = { by: "ada", at: "2026-11-19T10:00:00.000Z" };

const passed = { _tag: "passed" } as const;
const failed = { _tag: "failed", failures: "1 test failed: totals add VAT" } as const;

const throughJson = (persisted: unknown): unknown => JSON.parse(JSON.stringify(persisted));

const agentBuild = Effect.fnUntraced(function* (script: FakeAgentScript) {
  const agent = yield* fakeAgent(script);
  return { agent, build: yield* buildStage().pipe(Effect.provide(agent.layer)) };
});

const throughPlan = (workItem: Driven) => {
  workItem.finish("intake", { _tag: "classified", kind: "feature" });
  workItem.finish("spec", { _tag: "written" });
  workItem.send({ type: "approve", ...reviewer });
  workItem.finish("provision", { _tag: "provisioned" });
  workItem.finish("plan", { _tag: "planned", demo: false });
};

describe("a work item in the Build stage", () => {
  it.effect("moves on to Review once Build's tests pass", () =>
    Effect.gen(function* () {
      const { build } = yield* agentBuild({ testReports: [failed, passed] });
      const workItem = yield* startWorkItem({ build });
      throughPlan(workItem);
      yield* workItem.reaches("review");
      expect(workItem.context().blocked).toBeNull();
    }),
  );

  it.effect("becomes blocked on Build when Build fails", () =>
    Effect.gen(function* () {
      const { build } = yield* agentBuild({ testReports: [passed], failing: "implement" });
      const workItem = yield* startWorkItem({ build });
      throughPlan(workItem);
      yield* workItem.reaches("blocked");
      expect(workItem.context().blocked).toStrictEqual({
        from: "build",
        reason: { tag: "AgentFailed", message: "The agent gave up during implement" },
      });
    }),
  );

  it.effect("resumes Build at the step it was saved in", () =>
    Effect.gen(function* () {
      const before = yield* agentBuild({ testReports: [], hanging: "test" });
      const original = yield* startWorkItem({ build: before.build });
      throughPlan(original);
      yield* before.agent.started("test");
      const after = yield* agentBuild({ testReports: [failed, passed] });
      const workItem = yield* restoredWorkItem(throughJson(original.save()), {
        build: after.build,
      });
      yield* workItem.reaches("review");
      expect(after.agent.steps()).toStrictEqual(["test", "fix", "test"]);
    }),
  );
});
