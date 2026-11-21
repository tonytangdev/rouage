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
 * contract, that every later port fails and crashes the stage as its first
 * port does, and that its first step is asked the same task as when the
 * lifecycle reaches the stage.
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

    for (const port of stage.ports.slice(1)) {
      it.effect(`fails with the ${port.port}'s reason when the ${port.port} gives up`, () =>
        Effect.gen(function* () {
          const { settled } = yield* stage.run(port.misbehaving("failing"), port.input);
          expect(failureReasonOf(settled.error)).toStrictEqual(port.gaveUp);
        }),
      );

      it.effect(`counts the ${port.port} dying as a crash`, () =>
        Effect.gen(function* () {
          const { settled } = yield* stage.run(port.misbehaving("crashing"), port.input);
          expect(failureReasonOf(settled.error)).toStrictEqual({
            tag: "StageCrashed",
            message: port.crashMessage,
          });
        }),
      );
    }
  });
};
