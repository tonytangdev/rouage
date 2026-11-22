import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type { AnyStateMachine } from "xstate";

import {
  restoredWorkItem,
  startWorkItem,
  throughJson,
  withStageContext,
  withStepTask,
} from "../lifecycle/lifecycle-harness.ts";
import type { StageName } from "../lifecycle/stage.ts";
import type { RealStages } from "../lifecycle/stub-controller.ts";
import { reviewer } from "../lifecycle/test-fixtures.ts";
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

const itRestoresMidFirstStep = <
  Step extends string,
  Script,
  Scripted extends ScriptedPortStage<Step>,
>(
  stage: PortStageUnderTest<Step, Script, Scripted>,
) => {
  const { firstStep } = stage;
  const savedMidFirstStep = Effect.fnUntraced(function* () {
    const before = yield* stage.scripted(stage.passing({ step: firstStep, as: "hanging" }));
    const original = yield* startWorkItem({ stages: lifecycleWith(stage.name, before.stage) });
    original.advanceTo(stage.name, stage.route);
    yield* before.fake.started(firstStep);
    return throughJson(original.save());
  });

  it.effect("runs its first step again with the same task when restored mid-step", () =>
    Effect.gen(function* () {
      const saved = yield* savedMidFirstStep();
      const after = yield* stage.scripted(stage.passing());
      const workItem = yield* restoredWorkItem(saved, {
        stages: lifecycleWith(stage.name, after.stage),
      });
      yield* workItem.reaches(stage.next);
      expect(after.fake.calls()[0]).toStrictEqual({ step: firstStep, task: stage.firstTask });
    }),
  );

  it.effect("refuses a work item saved mid-step whose stage context no longer fits", () =>
    Effect.gen(function* () {
      const saved = yield* savedMidFirstStep();
      const after = yield* stage.scripted(stage.passing());
      const persisted = withStageContext(saved, stage.name, {});
      const error = yield* Effect.flip(
        restoredWorkItem(persisted, { stages: lifecycleWith(stage.name, after.stage) }),
      );
      expect(error._tag).toStrictEqual("UnreadableSnapshot");
      expect(error.message).toContain(`The saved ${stage.name} stage`);
      expect(after.fake.calls()).toStrictEqual([]);
    }),
  );

  it.effect("refuses a work item saved mid-step whose task no longer fits", () =>
    Effect.gen(function* () {
      const saved = yield* savedMidFirstStep();
      const after = yield* stage.scripted(stage.passing());
      const persisted = withStepTask(saved, stage.name, { workItemId: 1 });
      const error = yield* Effect.flip(
        restoredWorkItem(persisted, { stages: lifecycleWith(stage.name, after.stage) }),
      );
      expect(error._tag).toStrictEqual("UnreadableSnapshot");
      expect(error.message).toContain(`The task of the saved ${stage.name} stage's`);
      expect(after.fake.calls()).toStrictEqual([]);
    }),
  );
};

/**
 * Declares the tests every port stage must pass inside the default
 * lifecycle: any of its steps giving up blocks the work item on the stage
 * with its port's reason, cancelling a work item interrupts whichever step
 * is running, a retry's comment reaches its first step as feedback,
 * a work item restored mid-first-step runs that step again with the same
 * task and moves on, and one whose saved stage context, or the saved task of
 * its running step, no longer fits is refused before any step runs.
 */
export const describePortStageInLifecycle = <
  Step extends string,
  Script,
  Scripted extends ScriptedPortStage<Step>,
>(
  stage: PortStageUnderTest<Step, Script, Scripted>,
) => {
  describe(`port stage contract in the lifecycle, ${stage.name}`, () => {
    for (const step of stage.steps) {
      it.effect(
        `blocks the work item on the stage when the ${step.port} gives up during ${step.step}`,
        () =>
          Effect.gen(function* () {
            const { stage: machine } = yield* stage.scripted(step.misbehaving("failing"));
            const workItem = yield* startWorkItem({ stages: lifecycleWith(stage.name, machine) });
            yield* step.reach(workItem);
            yield* workItem.reaches("blocked");
            expect(workItem.context().blocked).toStrictEqual({
              from: stage.name,
              reason: step.gaveUp,
            });
          }),
      );

      it.effect(`interrupts the ${step.port}'s ${step.step} when the work item is cancelled`, () =>
        Effect.gen(function* () {
          const scripted = yield* stage.scripted(step.misbehaving("hanging"));
          const workItem = yield* startWorkItem({
            stages: lifecycleWith(stage.name, scripted.stage),
          });
          yield* step.reach(workItem);
          yield* step.started(scripted);
          workItem.send({ type: "cancel", ...reviewer });
          yield* step.interrupted(scripted);
          expect(workItem.state()).toStrictEqual("cancelled");
        }),
      );
    }

    itGivesARetrysCommentToItsFirstStep(stage);
    itRestoresMidFirstStep(stage);
  });
};
