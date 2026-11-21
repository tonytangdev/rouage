import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type { AnyStateMachine } from "xstate";

import type { RealStages } from "../lifecycle/golden-route.ts";
import { reviewer } from "../lifecycle/golden-route.ts";
import { restoredWorkItem, startWorkItem, throughJson } from "../lifecycle/lifecycle-harness.ts";
import type { StageName } from "../lifecycle/stage.ts";
import type { PortStageUnderTest, ScriptedPortStage } from "./port-stage-under-test.ts";

const lifecycleWith = (name: StageName, stage: AnyStateMachine): RealStages => ({ [name]: stage });

const itGivesARetrysCommentToItsFirstStep = <
  Step extends string,
  Script,
  Scripted extends ScriptedPortStage<Step>,
>(
  stage: PortStageUnderTest<Step, Script, Scripted>,
) => {
  it.effect("gives a retry's comment to its first step as feedback", () =>
    Effect.gen(function* () {
      const { fake, stage: machine } = yield* stage.scripted(
        stage.passing({ step: stage.firstStep, as: "failing" }),
      );
      const workItem = yield* startWorkItem({ stages: lifecycleWith(stage.name, machine) });
      workItem.advanceTo(stage.name, stage.route);
      yield* workItem.reaches("blocked");
      workItem.send({ type: "retry", ...reviewer, comment: "the CI runner is back" });
      yield* workItem.reaches("blocked");
      expect(fake.calls().at(-1)).toStrictEqual({
        step: stage.firstStep,
        task: { ...stage.firstTask, feedback: "the CI runner is back" },
      });
    }),
  );
};

/**
 * Declares the tests every port stage must pass inside the default
 * lifecycle: any of its ports giving up blocks the work item on the stage
 * with that port's reason, cancelling a work item interrupts the step any of
 * its ports is running, a retry's comment reaches its first step as feedback,
 * and a work item restored mid-first-step runs that step again with the same
 * task and moves on.
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
    for (const port of stage.ports) {
      it.effect(`blocks the work item on the stage when the ${port.port} gives up`, () =>
        Effect.gen(function* () {
          const { stage: machine } = yield* stage.scripted(port.misbehaving("failing"));
          const workItem = yield* startWorkItem({ stages: lifecycleWith(stage.name, machine) });
          yield* port.reach(workItem);
          yield* workItem.reaches("blocked");
          expect(workItem.context().blocked).toStrictEqual({
            from: stage.name,
            reason: port.gaveUp,
          });
        }),
      );

      it.effect(`interrupts the ${port.port}'s running step when the work item is cancelled`, () =>
        Effect.gen(function* () {
          const scripted = yield* stage.scripted(port.misbehaving("hanging"));
          const workItem = yield* startWorkItem({
            stages: lifecycleWith(stage.name, scripted.stage),
          });
          yield* port.reach(workItem);
          yield* port.started(scripted);
          workItem.send({ type: "cancel", ...reviewer });
          yield* port.interrupted(scripted);
          expect(workItem.state()).toStrictEqual("cancelled");
        }),
      );
    }

    itGivesARetrysCommentToItsFirstStep(stage);

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
  });
};
