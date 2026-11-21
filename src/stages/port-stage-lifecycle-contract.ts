import { describe, expect, it } from "@effect/vitest";
import type { Scope } from "effect";
import { Effect } from "effect";
import type { AnyStateMachine } from "xstate";

import type { RealStages, Route, Waypoint } from "../lifecycle/lifecycle-harness.ts";
import { restoredWorkItem, startWorkItem, throughJson } from "../lifecycle/lifecycle-harness.ts";
import type { StageName } from "../lifecycle/stage.ts";
import type { Fake, FakePort, Misbehaving } from "./fake-script.ts";
import { gaveUpMessage } from "./fake-script.ts";
import type { PortGaveUp } from "./port-stage.ts";

/** A port stage and its fake, ready to run inside the default lifecycle. */
export interface ScriptedPortStage<Step extends string> {
  readonly fake: Pick<Fake<unknown, Step>, "calls" | "started">;
  readonly stage: AnyStateMachine;
}

export interface PortStageInLifecycle<Step extends string> {
  readonly name: StageName;
  readonly port: FakePort<Step, PortGaveUp>;
  /** Builds the stage with a fresh fake whose script finishes the stage unless `misbehaving` says otherwise. */
  readonly scripted: (
    misbehaving?: Misbehaving<Step>,
  ) => Effect.Effect<ScriptedPortStage<Step>, unknown, Scope.Scope>;
  /** The route the work item takes to reach the stage; a feature with no demo unless set. */
  readonly route?: Route;
  /** Where the work item goes once the stage finishes on `route`. */
  readonly next: Waypoint;
  /** What the stage's first step is asked on its first run along `route`. */
  readonly firstTask: unknown;
}

const lifecycleWith = (name: StageName, stage: AnyStateMachine): RealStages => ({ [name]: stage });

/**
 * Declares the tests every port stage must pass inside the default
 * lifecycle: a first step that gives up blocks the work item on the stage
 * with the port's reason, and a work item restored mid-first-step runs that
 * step again with the same task and moves on.
 */
export const describePortStageInLifecycle = <Step extends string>(
  stage: PortStageInLifecycle<Step>,
) => {
  const [firstStep] = stage.port.steps;
  const gaveUp = stage.port.gaveUp(gaveUpMessage(stage.port.port, firstStep));

  describe(`port stage contract in the lifecycle, ${stage.name}`, () => {
    it.effect("blocks the work item on the stage when its port gives up", () =>
      Effect.gen(function* () {
        const { stage: machine } = yield* stage.scripted({ step: firstStep, as: "failing" });
        const workItem = yield* startWorkItem(lifecycleWith(stage.name, machine));
        workItem.advanceTo(stage.name, stage.route);
        yield* workItem.reaches("blocked");
        expect(workItem.context().blocked).toStrictEqual({
          from: stage.name,
          reason: { tag: gaveUp._tag, message: gaveUp.message },
        });
      }),
    );

    it.effect("runs its first step again with the same task when restored mid-step", () =>
      Effect.gen(function* () {
        const before = yield* stage.scripted({ step: firstStep, as: "hanging" });
        const original = yield* startWorkItem(lifecycleWith(stage.name, before.stage));
        original.advanceTo(stage.name, stage.route);
        yield* before.fake.started(firstStep);
        const after = yield* stage.scripted();
        const workItem = yield* restoredWorkItem(
          throughJson(original.save()),
          lifecycleWith(stage.name, after.stage),
        );
        yield* workItem.reaches(stage.next);
        expect(after.fake.calls()[0]).toStrictEqual({ step: firstStep, task: stage.firstTask });
      }),
    );
  });
};
