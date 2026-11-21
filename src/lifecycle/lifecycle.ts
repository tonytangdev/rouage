import { absurd } from "effect/Function";

import { demoCalledFor, retrySkipsDemo } from "./demo-decision.ts";
import { noFactsYet } from "./facts.ts";
import { lifecycleSetup } from "./lifecycle-setup.ts";
import { noLoopsYet } from "./loops.ts";
import { demoStageInput, stageInput } from "./stage.ts";
import { innermostState } from "./state-value.ts";
import {
  cancelled,
  demoOverridden,
  finished,
  gateApproved,
  gateRejected,
  retried,
  sentBackToSpec,
  soleOutcome,
} from "./transition.ts";
import { blockedAfter, blockedIn, workItemAfter } from "./work-item-after.ts";

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
      context: workItemAfter(context, cancelled(innermostState(self.getSnapshot().value), event)),
    }),
    requireDemo: ({ context, event, self }) => ({
      context: workItemAfter(
        context,
        demoOverridden(true, innermostState(self.getSnapshot().value), event),
      ),
    }),
    skipDemo: ({ context, event, self }) => ({
      context: workItemAfter(
        context,
        demoOverridden(false, innermostState(self.getSnapshot().value), event),
      ),
    }),
  },
  states: {
    working: {
      initial: "intake",
      on: {
        "xstate.error.actor": ({ context, event }) => ({
          target: "#blocked",
          context: blockedAfter(context, {
            _tag: "stageErrored",
            stage: event.actorId,
            error: event.error,
          }),
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
              context: workItemAfter(context, soleOutcome("intake", output)),
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
              context: workItemAfter(context, soleOutcome("spec", output)),
            }),
          },
        },
        specGate: {
          on: {
            approve: ({ context, event }) => ({
              target: "provision",
              context: workItemAfter(context, gateApproved("specGate", event)),
            }),
            reject: ({ context, event }) => ({
              target: "spec",
              context: workItemAfter(context, gateRejected("specGate", event)),
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
                  const prepared = workItemAfter(context, finished("provision", output));
                  return context.facts.kind === "bug"
                    ? { target: "reproduce", context: prepared }
                    : { target: "plan", context: prepared };
                }
                case "awaitingRun": {
                  return {
                    target: "sampleGate",
                    context: workItemAfter(context, finished("provision", output)),
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
              context: workItemAfter(context, gateApproved("sampleGate", event)),
            }),
            reject: ({ context, event }) => ({
              target: "provision",
              context: workItemAfter(context, gateRejected("sampleGate", event)),
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
                    context: workItemAfter(context, finished("reproduce", output)),
                  };
                }
                case "cannotReproduce":
                case "checkPassed": {
                  return {
                    target: "#blocked",
                    context: blockedAfter(context, finished("reproduce", output)),
                  };
                }
                case "needsSample": {
                  const next = workItemAfter(context, finished("reproduce", output));
                  const blocked = blockedIn(next);
                  return blocked === null
                    ? { target: "provision", context: next }
                    : { target: "#blocked", context: blocked };
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
              context: workItemAfter(context, soleOutcome("plan", output)),
            }),
          },
        },
        build: {
          invoke: {
            id: "build",
            src: "build",
            input: stageInput,
            onDone: ({ context, event: { output } }) => {
              const built = workItemAfter(context, soleOutcome("build", output));
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
              context: workItemAfter(context, soleOutcome("demo", output)),
            }),
          },
          on: {
            skipDemo: ({ context, event }) => ({
              target: "review",
              context: workItemAfter(context, demoOverridden(false, "demo", event)),
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
                    context: workItemAfter(context, finished("review", output)),
                  };
                }
                case "changesRequested": {
                  const next = workItemAfter(context, finished("review", output));
                  const blocked = blockedIn(next);
                  return blocked === null
                    ? { target: "build", context: next }
                    : { target: "#blocked", context: blocked };
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
              context: workItemAfter(context, gateApproved("shipGate", event)),
            }),
            reject: ({ context, event }) => ({
              target: "build",
              context: workItemAfter(context, gateRejected("shipGate", event)),
            }),
          },
        },
        ship: {
          invoke: {
            id: "ship",
            src: "ship",
            input: stageInput,
            onDone: ({ context, event: { output } }) => {
              switch (output._tag) {
                case "shipped": {
                  return {
                    target: "#shipped",
                    context: workItemAfter(context, finished("ship", output)),
                  };
                }
                case "needsRebuild": {
                  const next = workItemAfter(context, finished("ship", output));
                  const blocked = blockedIn(next);
                  return blocked === null
                    ? { target: "build", context: next }
                    : { target: "#blocked", context: blocked };
                }
                default: {
                  return absurd(output);
                }
              }
            },
          },
        },
        lastStage: { type: "history", target: "intake" },
      },
    },
    blocked: {
      id: "blocked",
      on: {
        retry: ({ context, event }) => {
          const next = workItemAfter(context, retried(event));
          return retrySkipsDemo(context.blocked.from, context.facts)
            ? { target: "working.review", context: next }
            : { target: "working.lastStage", context: next };
        },
        backToSpec: ({ context, event }) => {
          const next = workItemAfter(context, sentBackToSpec(event));
          // An unclassified work item would reach Provision without a kind and be routed as a feature.
          return context.facts.kind === null
            ? { target: "working.intake", context: next }
            : { target: "working.spec", context: next };
        },
      },
    },
    shipped: { id: "shipped", type: "final" },
    cancelled: { type: "final" },
  },
});
