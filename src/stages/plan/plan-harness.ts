import { Effect } from "effect";
import { createActor } from "xstate";

import type { StageInput } from "../../lifecycle/stage.ts";
import { aloneInput, runAlone } from "../stage-harness.ts";
import type { FakePlannerScript } from "./fake-planner.ts";
import { fakePlanner } from "./fake-planner.ts";
import { planStage } from "./plan-stage.ts";

export const plannedWithDemo = { planRef: "plan-1", demo: true } as const;

/** The input a Plan stage run alone starts with: a provisioned feature. */
export const provisionedFeature: StageInput = {
  ...aloneInput,
  kind: "feature",
  specRef: "spec-1",
  sandboxRef: "box-1",
};

/** What the planner is asked on a feature's first plan. */
export const firstPlan = {
  workItemId: "wi-1",
  issueRef: "#1",
  kind: "feature",
  specRef: "spec-1",
  sandboxRef: "box-1",
  sampleRef: null,
  reproductionRef: null,
  previousPlanRef: null,
} as const;

export const scriptedPlan = Effect.fnUntraced(function* (script: FakePlannerScript) {
  const planner = yield* fakePlanner(script);
  return { planner, plan: yield* planStage.pipe(Effect.provide(planner.layer)) };
});

/** Runs a Plan stage outside any lifecycle until it finishes or fails. */
export const runPlan = Effect.fnUntraced(function* (
  script: FakePlannerScript,
  input: StageInput = provisionedFeature,
) {
  const { planner, plan } = yield* scriptedPlan(script);
  const settled = yield* runAlone(createActor(plan, { input }));
  return { settled, tasks: planner.tasks() };
});
