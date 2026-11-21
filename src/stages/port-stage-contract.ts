import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import type { StageAdapter } from "../lifecycle/stage-contract.ts";
import { describeStageContract } from "../lifecycle/stage-contract.ts";
import { failureReasonOf } from "../lifecycle/stage.ts";
import type { Misbehaving } from "./fake-script.ts";
import type { PortStageUnderTest, ScriptedPortStage } from "./port-stage-under-test.ts";

// A stage that runs its steps through a port fails and crashes the way its
// port does, so those cases come from making its first step misbehave.
const portAdapter = <Step extends string, Script, Scripted extends ScriptedPortStage<Step>>(
  stage: PortStageUnderTest<Step, Script, Scripted>,
): StageAdapter => {
  const { firstStep } = stage;
  const settled = (misbehaving?: Misbehaving<Step>) =>
    Effect.map(stage.run(stage.passing(misbehaving)), (run) => run.settled);
  return {
    name: stage.name,
    finished: settled(),
    outcome: stage.outcome,
    failed: settled({ step: firstStep, as: "failing" }),
    failure: stage.gaveUp,
    crashed: settled({ step: firstStep, as: "crashing" }),
    crashMessage: stage.crashMessage,
  };
};

/**
 * Declares the tests every port stage must pass run alone: the stage
 * contract, that every step after the first fails and crashes the stage as
 * the first does, that its first step is asked the same task as when the
 * lifecycle reaches the stage, and that its declared steps match its ports'
 * steps and what its passing script reaches.
 */
export const describePortStage = <
  Step extends string,
  Script,
  Scripted extends ScriptedPortStage<Step>,
>(
  stage: PortStageUnderTest<Step, Script, Scripted>,
) => {
  describeStageContract(portAdapter(stage));

  describe(`port stage contract, ${stage.name}`, () => {
    it.effect("asks its first step the task the lifecycle would", () =>
      Effect.gen(function* () {
        const { fake } = yield* stage.run(stage.passing());
        expect(fake.calls()[0]).toStrictEqual({
          step: stage.firstStep,
          task: stage.firstTask,
        });
      }),
    );

    it.effect("reaches exactly the steps it declares its passing script reaches", () =>
      Effect.gen(function* () {
        const { fake } = yield* stage.run(stage.passing());
        expect(new Set(fake.calls().map((call) => call.step))).toStrictEqual(
          new Set(stage.passingReaches),
        );
      }),
    );

    it.effect("declares every step of every port it calls", () =>
      Effect.sync(() => {
        for (const port of stage.ports) {
          const declared = stage.steps.filter((step) => step.port === port.port);
          expect(declared.map((step) => step.step).toSorted()).toStrictEqual(port.steps.toSorted());
        }
      }),
    );

    for (const step of stage.steps.slice(1)) {
      it.effect(`fails with the ${step.port}'s reason when it gives up during ${step.step}`, () =>
        Effect.gen(function* () {
          const { settled } = yield* stage.run(step.misbehaving("failing"), yield* step.input);
          expect(failureReasonOf(settled.error)).toStrictEqual(step.gaveUp);
        }),
      );

      it.effect(`counts the ${step.port} dying during ${step.step} as a crash`, () =>
        Effect.gen(function* () {
          const { settled } = yield* stage.run(step.misbehaving("crashing"), yield* step.input);
          expect(failureReasonOf(settled.error)).toStrictEqual({
            tag: "StageCrashed",
            message: step.crashMessage,
          });
        }),
      );
    }
  });
};
