import { absurd } from "effect/Function";

import { reproduceBlocked, stageErrored } from "./blocked.ts";
import { demoCalledFor, retrySkipsDemo } from "./demo-decision.ts";
import { finished, soleOutcome } from "./fact-event.ts";
import { factsAfter } from "./facts.ts";
import { lifecycleSetup } from "./lifecycle-setup.ts";
import { aroundLoop, noLoopsYet } from "./loops.ts";
import { demoStageInput, noFactsYet, stageInput } from "./stage.ts";
import { innermostState } from "./state-value.ts";
import {
  approved,
  demoRequired,
  demoSkipped,
  recordDecision,
  rejected,
  specRejected,
  retried,
  sentBack,
} from "./work-item.ts";

// Every transition names its target as a literal, even where a helper could
// compute it, so Stately's editor can draw every arrow (ADR 0002).
export const defaultLifecycle = lifecycleSetup.createMachine({
  id: "lifecycle",
  version: "1",
  context: ({ input }) => ({
    id: input.id,
    facts: { issueRef: input.issueRef, ...noFactsYet },
    limits: input.limits,
    counters: noLoopsYet,
    blocked: null,
    decisions: [],
  }),
  initial: "working",
  on: {
    cancel: ({ context, event, self }) => ({
      target: ".cancelled",
      context: {
        decisions: recordDecision(
          context,
          "cancel",
          innermostState(self.getSnapshot().value),
          event,
        ),
      },
    }),
    requireDemo: ({ context, event, self }) => ({
      context: demoRequired(context, innermostState(self.getSnapshot().value), event),
    }),
    skipDemo: ({ context, event, self }) => ({
      context: demoSkipped(context, innermostState(self.getSnapshot().value), event),
    }),
  },
  states: {
    working: {
      initial: "intake",
      on: {
        "xstate.error.actor": ({ event }) => ({
          target: "#blocked",
          context: stageErrored(event.actorId, event.error),
        }),
      },
      states: {
        intake: {
          invoke: {
            id: "intake",
            src: "intake",
            input: stageInput,
            onDone: ({ context, event: { output } }) => ({
              target: "spec",
              context: { facts: factsAfter(context.facts, soleOutcome("intake", output)) },
            }),
          },
        },
        spec: {
          invoke: {
            id: "spec",
            src: "spec",
            input: stageInput,
            onDone: ({ context, event: { output } }) => ({
              target: "specGate",
              context: { facts: factsAfter(context.facts, soleOutcome("spec", output)) },
            }),
          },
        },
        specGate: {
          on: {
            approve: ({ context, event }) => ({
              target: "provision",
              context: approved(context, "specGate", event),
            }),
            reject: ({ context, event }) => ({
              target: "spec",
              context: specRejected(context, event),
            }),
          },
        },
        provision: {
          invoke: {
            id: "provision",
            src: "provision",
            input: stageInput,
            onDone: ({ context, event: { output } }) => {
              switch (output._tag) {
                case "provisioned": {
                  const prepared = { facts: factsAfter(context.facts, finished(output)) };
                  return context.facts.kind === "bug"
                    ? { target: "reproduce", context: prepared }
                    : { target: "plan", context: prepared };
                }
                case "awaitingRun": {
                  return {
                    target: "sampleGate",
                    context: { facts: factsAfter(context.facts, finished(output)) },
                  };
                }
                default: {
                  return absurd(output);
                }
              }
            },
          },
        },
        sampleGate: {
          on: {
            approve: ({ context, event }) => ({
              target: "provision",
              context: approved(context, "sampleGate", event),
            }),
            reject: ({ context, event }) => ({
              target: "provision",
              context: rejected(context, "sampleGate", event),
            }),
          },
        },
        reproduce: {
          invoke: {
            id: "reproduce",
            src: "reproduce",
            input: stageInput,
            onDone: ({ context, event: { output } }) => {
              switch (output._tag) {
                case "reproduced": {
                  return {
                    target: "plan",
                    context: { facts: factsAfter(context.facts, finished(output)) },
                  };
                }
                case "cannotReproduce":
                case "checkPassed": {
                  return { target: "#blocked", context: reproduceBlocked(context, output) };
                }
                case "needsSample": {
                  const trip = aroundLoop(context, "reproduce", output);
                  return trip.exhausted
                    ? { target: "#blocked", context: trip.context }
                    : { target: "provision", context: trip.context };
                }
                default: {
                  return absurd(output);
                }
              }
            },
          },
        },
        plan: {
          invoke: {
            id: "plan",
            src: "plan",
            input: stageInput,
            onDone: ({ context, event: { output } }) => ({
              target: "build",
              context: { facts: factsAfter(context.facts, soleOutcome("plan", output)) },
            }),
          },
        },
        build: {
          invoke: {
            id: "build",
            src: "build",
            input: stageInput,
            onDone: ({ context, event: { output } }) => {
              const built = { facts: factsAfter(context.facts, soleOutcome("build", output)) };
              return demoCalledFor(context.facts)
                ? { target: "demo", context: built }
                : { target: "review", context: built };
            },
          },
        },
        demo: {
          invoke: {
            id: "demo",
            src: "demo",
            input: demoStageInput,
            onDone: ({ context, event: { output } }) => ({
              target: "review",
              context: { facts: factsAfter(context.facts, soleOutcome("demo", output)) },
            }),
          },
          on: {
            skipDemo: ({ context, event }) => ({
              target: "review",
              context: demoSkipped(context, "demo", event),
            }),
          },
        },
        review: {
          invoke: {
            id: "review",
            src: "review",
            input: stageInput,
            onDone: ({ context, event: { output } }) => {
              switch (output._tag) {
                case "approved": {
                  return {
                    target: "shipGate",
                    context: { facts: factsAfter(context.facts, finished(output)) },
                  };
                }
                case "changesRequested": {
                  const trip = aroundLoop(context, "review", output);
                  return trip.exhausted
                    ? { target: "#blocked", context: trip.context }
                    : { target: "build", context: trip.context };
                }
                default: {
                  return absurd(output);
                }
              }
            },
          },
        },
        shipGate: {
          on: {
            approve: ({ context, event }) => ({
              target: "ship",
              context: approved(context, "shipGate", event),
            }),
            reject: ({ context, event }) => ({
              target: "build",
              context: rejected(context, "shipGate", event),
            }),
          },
        },
        ship: {
          invoke: {
            id: "ship",
            src: "ship",
            input: stageInput,
            onDone: ({ context, event: { output } }) => ({
              target: "#shipped",
              context: { facts: factsAfter(context.facts, soleOutcome("ship", output)) },
            }),
          },
        },
        lastStage: { type: "history", target: "intake" },
      },
    },
    blocked: {
      id: "blocked",
      on: {
        retry: ({ context, event }) =>
          retrySkipsDemo(context.blocked.from, context.facts)
            ? { target: "working.review", context: retried(context, event) }
            : { target: "working.lastStage", context: retried(context, event) },
        backToSpec: ({ context, event }) =>
          // An unclassified work item would reach Provision without a kind and be routed as a feature.
          context.facts.kind === null
            ? { target: "working.intake", context: sentBack(context, event) }
            : { target: "working.spec", context: sentBack(context, event) },
      },
    },
    shipped: { id: "shipped", type: "final" },
    cancelled: { type: "final" },
  },
});
