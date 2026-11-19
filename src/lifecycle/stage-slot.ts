import type { ActorLogic, Snapshot } from "xstate";

import type { OutcomeOf, StageInput, StageName } from "./stage.ts";
import { StageFailure } from "./stage.ts";

/**
 * The type a lifecycle declares for one stage. XState accepts as its
 * implementation any logic that takes `StageInput`, finishes with the stage's
 * outcome and needs no events from the lifecycle, whatever its own snapshot
 * holds.
 */
export type StageLogic<Stage extends StageName> = ActorLogic<
  Snapshot<OutcomeOf<Stage>>,
  never,
  StageInput
>;

type SlotSnapshot<Stage extends StageName> = Snapshot<OutcomeOf<Stage>>;

/**
 * A stage slot with no implementation yet: it fails with a `StageFailure`
 * tagged `StageNotProvided` as soon as it starts, so a lifecycle missing a
 * stage blocks the work item instead of hanging.
 */
export const stageSlot = <Stage extends StageName>(stage: Stage): StageLogic<Stage> => {
  const notProvided = (): SlotSnapshot<Stage> => ({
    status: "error",
    output: undefined,
    error: new StageFailure({
      reason: { tag: "StageNotProvided", message: `No implementation for the ${stage} stage` },
    }),
  });
  return {
    transition: (snapshot) => [snapshot, []],
    initialTransition: () => [notProvided(), []],
    getInitialSnapshot: notProvided,
    getPersistedSnapshot: (snapshot) => snapshot,
  };
};
