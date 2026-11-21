import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type { AnyStateMachine } from "xstate";

import type { RealStages } from "../lifecycle/golden-route.ts";
import { reviewer } from "../lifecycle/golden-route.ts";
import { restoredWorkItem, startWorkItem, throughJson } from "../lifecycle/lifecycle-harness.ts";
import type { StageName } from "../lifecycle/stage.ts";
import type { PortStageUnderTest, ScriptedPortStage } from "./port-stage-under-test.ts";

const lifecycleWith = (name: StageName, stage: AnyStateMachine): RealStages => ({ [name]: stage });

/**
 * Declares the tests every port stage must pass inside the default
 * lifecycle: a first step that gives up blocks the work item on the stage
 * with the port's reason, a work item restored mid-first-step runs that step
 * again with the same task and moves on, and cancelling a work item
 * interrupts the step its port is running.
 */
export const describePortStageInLifecycle = <
  Step extends string,
  Script,
  Scripted extends ScriptedPortStage<Step>,
>(
  stage: PortStageUnderTest<Step, Script, Scripted>,
) => {
  const { firstStep } = stage;

  describe(`port stage contract in the lifecycle, ${stage.name}`, () => {
    it.effect("blocks the work item on the stage when its port gives up", () =>
      Effect.gen(function* () {
        const { stage: machine } = yield* stage.scripted(
          stage.passing({ step: firstStep, as: "failing" }),
        );
        const workItem = yield* startWorkItem({ stages: lifecycleWith(stage.name, machine) });
        workItem.advanceTo(stage.name, stage.route);
        yield* workItem.reaches("blocked");
        expect(workItem.context().blocked).toStrictEqual({
          from: stage.name,
          reason: stage.gaveUp,
        });
      }),
    );

    it.effect("runs its first step again with the same task when restored mid-step", () =>
      Effect.gen(function* () {
        const before = yield* stage.scripted(stage.passing({ step: firstStep, as: "hanging" }));
        const original = yield* startWorkItem({ stages: lifecycleWith(stage.name, before.stage) });
        original.advanceTo(stage.name, stage.route);
        yield* before.fake.started(firstStep);
        const after = yield* stage.scripted(stage.passing());
        const workItem = yield* restoredWorkItem(throughJson(original.save()), {
          stages: lifecycleWith(stage.name, after.stage),
        });
        yield* workItem.reaches(stage.next);
        expect(after.fake.calls()[0]).toStrictEqual({ step: firstStep, task: stage.firstTask });
      }),
    );

    it.effect("interrupts its running first step when the work item is cancelled", () =>
      Effect.gen(function* () {
        const { fake, stage: machine } = yield* stage.scripted(
          stage.passing({ step: firstStep, as: "hanging" }),
        );
        const workItem = yield* startWorkItem({ stages: lifecycleWith(stage.name, machine) });
        workItem.advanceTo(stage.name, stage.route);
        yield* fake.started(firstStep);
        workItem.send({ type: "cancel", ...reviewer });
        yield* fake.interrupted(firstStep);
        expect(workItem.state()).toStrictEqual("cancelled");
      }),
    );
  });
};
