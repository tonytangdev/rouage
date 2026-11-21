import type { Duration } from "effect";
import { Effect, Layer } from "effect";

import type { TeardownTask } from "./sandbox-teardown.ts";
import { SandboxTeardown, TeardownGaveUp } from "./sandbox-teardown.ts";

export interface FakeSandboxTeardownScript {
  /** Every teardown gives up instead of succeeding. */
  readonly givesUp?: boolean;
  /** How long each teardown takes before it finishes; none by default. */
  readonly takes?: Duration.Input;
}

export type FakeSandboxTeardown = ReturnType<typeof fakeSandboxTeardown>;

/** A sandbox teardown that records each task instead of tearing anything down. */
export const fakeSandboxTeardown = (script: FakeSandboxTeardownScript = {}) => {
  const tasks: TeardownTask[] = [];
  const completed: TeardownTask[] = [];
  return {
    layer: Layer.succeed(
      SandboxTeardown,
      SandboxTeardown.of({
        teardown: (task) =>
          Effect.suspend(() => {
            tasks.push(task);
            if (script.givesUp === true) {
              return Effect.fail(new TeardownGaveUp({ message: "The sandbox would not stop" }));
            }
            const finish = Effect.sync(() => {
              completed.push(task);
            });
            return script.takes === undefined
              ? finish
              : Effect.sleep(script.takes).pipe(Effect.andThen(finish));
          }),
      }),
    ),
    /** Every teardown asked for, in order. */
    tasks: (): readonly TeardownTask[] => tasks,
    /** Every teardown that ran to its end, in order. */
    completed: (): readonly TeardownTask[] => completed,
  };
};
