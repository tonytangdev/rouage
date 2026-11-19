import { assertEvent, setup, types } from "xstate";

import type { StageInput } from "./outcomes.ts";

/**
 * A stage machine that finishes with whichever outcome it is sent, or crashes
 * when sent `crash`, so the lifecycle can be driven by events before real
 * stages exist. It keeps its input in context so tests can see what the
 * lifecycle passed it.
 */
export const stubStage = <Outcome>() =>
  setup({
    schemas: {
      input: types<StageInput>(),
      context: types<{ input: StageInput }>(),
      events: {
        finish: types<{ outcome: Outcome }>(),
        crash: types<{ message: string }>(),
      },
    },
  }).createMachine({
    id: "stubStage",
    context: ({ input }) => ({ input }),
    initial: "working",
    states: {
      working: {
        on: {
          finish: { target: "finished" },
          crash: ({ event }) => {
            throw new Error(event.message);
          },
        },
      },
      finished: {
        type: "final",
        output: ({ event }) => {
          assertEvent(event, "finish");
          return event.outcome;
        },
      },
    },
  });
