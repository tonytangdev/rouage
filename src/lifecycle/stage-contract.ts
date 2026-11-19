import { describe, expect, it } from "@effect/vitest";
import type { Scope } from "effect";
import { Effect } from "effect";

import type { FailureReason } from "./stage.ts";
import { failureReasonOf } from "./stage.ts";

/** How a stage run ended: its output when it finished, or the error it failed with. */
export interface Settled<Output> {
  readonly output: Output | undefined;
  readonly error: unknown;
}

/** One stage implementation run three ways, so the contract suite can check it finishes, fails and crashes as every stage must. */
export interface StageAdapter {
  readonly name: string;
  readonly finished: Effect.Effect<Settled<unknown>, unknown, Scope.Scope>;
  readonly outcome: unknown;
  readonly failed: Effect.Effect<Settled<unknown>, unknown, Scope.Scope>;
  readonly failure: FailureReason;
  readonly crashed: Effect.Effect<Settled<unknown>, unknown, Scope.Scope>;
  readonly crashMessage: string;
}

/** Declares the tests every stage implementation must pass to fit its slot in the lifecycle. */
export const describeStageContract = (adapter: StageAdapter) => {
  describe(`stage contract, ${adapter.name} adapter`, () => {
    it.effect("finishes with its outcome", () =>
      Effect.gen(function* () {
        const { output } = yield* adapter.finished;
        expect(output).toStrictEqual(adapter.outcome);
      }),
    );

    it.effect("fails with a StageFailure whose reason blocks the work item", () =>
      Effect.gen(function* () {
        const { error } = yield* adapter.failed;
        expect(failureReasonOf(error)).toStrictEqual(adapter.failure);
      }),
    );

    it.effect("counts any other error as a crash", () =>
      Effect.gen(function* () {
        const { error } = yield* adapter.crashed;
        expect(failureReasonOf(error)).toStrictEqual({
          tag: "StageCrashed",
          message: adapter.crashMessage,
        });
      }),
    );
  });
};
