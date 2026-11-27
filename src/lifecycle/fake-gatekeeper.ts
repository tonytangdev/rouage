import { Effect, Layer } from "effect";

import type { GatekeeperDecision, GatekeeperTask } from "./gatekeeper.ts";
import { Gatekeeper, GatekeeperGaveUp } from "./gatekeeper.ts";

export interface FakeGatekeeperScript {
  /** The name the gatekeeper gives, `"fake"` unless set. */
  readonly name?: string;
  /** What each decision answers, in order; a decision beyond them dies, so an under-scripted test fails loudly. */
  readonly answers: readonly GatekeeperDecision[];
  /** Every decision gives up instead of answering. */
  readonly givesUp?: boolean;
  /** Every decision judges until it is stopped, as a slow plugin's would. */
  readonly judgesForever?: boolean;
}

export type FakeGatekeeper = ReturnType<typeof fakeGatekeeper>;

/** A gatekeeper that follows a script instead of judging, and records each task. */
export const fakeGatekeeper = (script: FakeGatekeeperScript) => {
  const tasks: GatekeeperTask[] = [];
  let judging = 0;
  const judgingForever = Effect.suspend(() => {
    judging += 1;
    return Effect.never;
  }).pipe(
    Effect.onInterrupt(() =>
      Effect.sync(() => {
        judging -= 1;
      }),
    ),
  );
  return {
    layer: Layer.succeed(
      Gatekeeper,
      Gatekeeper.of({
        name: script.name ?? "fake",
        decide: (task) =>
          Effect.suspend(() => {
            tasks.push(task);
            if (script.judgesForever === true) {
              return judgingForever;
            }
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
    /** How many decisions are still being judged, so a test sees a stopped one end. */
    judging: () => judging,
  };
};
