import { Effect } from "effect";
import { createActor, createMachine } from "xstate";

export const toggleMachine = createMachine({
  id: "toggle",
  initial: "inactive",
  context: { count: 0 },
  states: {
    inactive: { on: { TOGGLE: { target: "active" } } },
    active: {
      entry: ({ context }) => ({ context: { count: context.count + 1 } }),
      on: { TOGGLE: { target: "inactive" } },
    },
  },
});

export const toggleTimes = Effect.fn("toggleTimes")(function* (times: number) {
  const actor = createActor(toggleMachine);
  yield* Effect.acquireRelease(
    Effect.sync(() => actor.start()),
    () => Effect.sync(() => actor.stop()),
  );
  for (let index = 0; index < times; index += 1) {
    actor.send({ type: "TOGGLE" });
  }
  return actor.getSnapshot().context.count;
});
