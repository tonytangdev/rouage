import { Effect, Layer } from "effect";

import type { GatekeeperDecision, GatekeeperTask } from "./gatekeeper.ts";
import { Gatekeeper, GatekeeperGaveUp } from "./gatekeeper.ts";

export interface FakeGatekeeperScript {
  /** What each decision answers, in order; a decision beyond them dies, so an under-scripted test fails loudly. */
  readonly answers: readonly GatekeeperDecision[];
  /** Every decision gives up instead of answering. */
  readonly givesUp?: boolean;
}

export type FakeGatekeeper = ReturnType<typeof fakeGatekeeper>;

/** A gatekeeper that follows a script instead of judging, and records each task. */
export const fakeGatekeeper = (script: FakeGatekeeperScript) => {
  const tasks: GatekeeperTask[] = [];
  return {
    layer: Layer.succeed(
      Gatekeeper,
      Gatekeeper.of({
        decide: (task) =>
          Effect.suspend(() => {
            tasks.push(task);
            if (script.givesUp === true) {
              return Effect.fail(new GatekeeperGaveUp({ message: "The gatekeeper gave up" }));
            }
            const answer = script.answers[tasks.length - 1];
            return answer === undefined
              ? Effect.die(`The fake gatekeeper has no answer for decision ${tasks.length}`)
              : Effect.succeed(answer);
          }),
      }),
    ),
    /** Every decision asked for, in order. */
    tasks: (): readonly GatekeeperTask[] => tasks,
  };
};
