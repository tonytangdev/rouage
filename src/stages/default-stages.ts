import { Effect } from "effect";

import { providedGatekeeper } from "../lifecycle/gatekeeper-step.ts";
import type { Lifecycle } from "../lifecycle/lifecycle-logic.ts";
import { defaultLifecycle } from "../lifecycle/lifecycle.ts";
import type { BuildOptions } from "./build/build-stage.ts";
import { buildStage } from "./build/build-stage.ts";
import { demoStage } from "./demo/demo-stage.ts";
import { intakeStage } from "./intake/intake-stage.ts";
import { planStage } from "./plan/plan-stage.ts";
import { provisionStage } from "./provision/provision-stage.ts";
import { reproduceStage } from "./reproduce/reproduce-stage.ts";
import { reviewStage } from "./review/review-stage.ts";
import { shipStage } from "./ship/ship-stage.ts";
import { specStage } from "./spec/spec-stage.ts";

/** How each of Rouage's stage machines is made, by stage. */
export interface DefaultStagesOptions {
  readonly build?: BuildOptions;
}

/**
 * Every one of Rouage's stage machines, by stage name, each running its steps
 * through its port taken from the Effect context.
 */
export const defaultStages = Effect.fnUntraced(function* (options: DefaultStagesOptions = {}) {
  return {
    intake: yield* intakeStage,
    spec: yield* specStage,
    provision: yield* provisionStage,
    reproduce: yield* reproduceStage,
    plan: yield* planStage,
    build: yield* buildStage(options.build),
    demo: yield* demoStage,
    review: yield* reviewStage,
    ship: yield* shipStage,
  };
});

/**
 * The default lifecycle running Rouage's stage machines on the ports in the
 * Effect context, ready to create or restore work items on, which also need
 * the lifecycle's sandbox teardown port. Plugin-kept gates are decided
 * through the Gatekeeper port when the context has one, and otherwise wait
 * for a human (ADR 0021).
 */
export const withDefaultStages = Effect.fnUntraced(function* (options: DefaultStagesOptions = {}) {
  const stages = yield* defaultStages(options);
  const gatekeeper = yield* providedGatekeeper;
  const lifecycle: Lifecycle = defaultLifecycle.provide({ actors: { ...stages, gatekeeper } });
  return lifecycle;
});
