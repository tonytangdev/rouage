import { Effect } from "effect";
import { createActor } from "xstate";

import type { StageInput } from "../../lifecycle/stage.ts";
import { aloneInput, runAlone } from "../stage-harness.ts";
import { demoStage } from "./demo-stage.ts";
import type { FakeDemonstratorScript } from "./fake-demonstrator.ts";
import { fakeDemonstrator } from "./fake-demonstrator.ts";

export const firstDemoMade = { demoRef: "demo-1" } as const;

/** The input a Demo stage run alone starts with: a built feature whose plan calls for a demo. */
export const builtFeature: StageInput = {
  ...aloneInput,
  kind: "feature",
  specRef: "spec-1",
  sandboxRef: "box-1",
  planRef: "plan-1",
  demoPlanned: true,
};

/** What the demonstrator is asked on a feature's first demo. */
export const firstDemo = {
  workItemId: "wi-1",
  issueRef: "#1",
  kind: "feature",
  specRef: "spec-1",
  planRef: "plan-1",
  sandboxRef: "box-1",
  reproductionRef: null,
  previousDemoRef: null,
} as const;

export const scriptedDemo = Effect.fnUntraced(function* (script: FakeDemonstratorScript) {
  const demonstrator = yield* fakeDemonstrator(script);
  return { demonstrator, demo: yield* demoStage.pipe(Effect.provide(demonstrator.layer)) };
});

/** Runs a Demo stage outside any lifecycle until it finishes or fails. */
export const runDemo = Effect.fnUntraced(function* (
  script: FakeDemonstratorScript,
  input: StageInput = builtFeature,
) {
  const { demonstrator, demo } = yield* scriptedDemo(script);
  const settled = yield* runAlone(createActor(demo, { input }));
  return { settled, tasks: demonstrator.tasks() };
});
