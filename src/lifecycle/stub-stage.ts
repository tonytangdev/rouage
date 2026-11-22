import { Record } from "effect";
import type { AnyActorRef } from "xstate";
import { createStepLogic } from "xstate";

import type { FailureReason, OutcomeOf, StageInput, StageName } from "./stage.ts";
import { StageFailure, StageOutcomeSchemas } from "./stage.ts";

export type StubEvent<Stage extends StageName> =
  | { readonly type: "finish"; readonly outcome: OutcomeOf<Stage> }
  | { readonly type: "fail"; readonly reason: FailureReason }
  | { readonly type: "crash"; readonly message: string };

/**
 * Called when a stub stage starts, and again when a work item holding it is
 * restored. `self` accepts `StubEvent`s for `stage`. The returned cleanup runs
 * when the stub stops.
 */
export type AttachStub = (stage: StageName, self: AnyActorRef, input: StageInput) => () => void;

const detached: AttachStub = () => () => {
  // A stub nobody drives has nothing to detach from.
};

// Step logic runs once for XState's initial event before any stub event.
type StubStep<Stage extends StageName> = StubEvent<Stage> | { readonly type: "xstate.init" };

/**
 * A stage that finishes with whichever outcome it is sent, fails with a
 * `StageFailure` when sent `fail`, or crashes when sent `crash`, so a test
 * can drive the lifecycle by events alone.
 */
export const stubStage = <Stage extends StageName>(stage: Stage, attach: AttachStub = detached) =>
  createStepLogic<{ readonly input: StageInput }, OutcomeOf<Stage>, StubStep<Stage>, StageInput>({
    context: ({ input }) => ({ input }),
    run: ({ context, event, self }, enq) => {
      // A keyed effect, because XState re-attaches it when the work item is restored.
      enq.effect("attach", () => attach(stage, self, context.input));
      if (event.type === "finish") {
        return { status: "done", output: event.outcome };
      }
      if (event.type === "fail") {
        return { status: "error", error: new StageFailure({ reason: event.reason }) };
      }
      if (event.type === "crash") {
        return { status: "error", error: new Error(event.message) };
      }
      return {};
    },
  });

/** A stub for every stage, each passing itself to `attach` when it starts. */
export const stubStages = (attach: AttachStub = detached) =>
  Record.map(StageOutcomeSchemas, (_, stage) => stubStage(stage, attach));
