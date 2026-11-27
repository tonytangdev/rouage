import { absurd } from "effect/Function";

import { demoCalledFor, retrySkipsDemo } from "./demo-decision.ts";
import { gateGatekeeper } from "./gate-gatekeeper.ts";
import { lifecycleSetup } from "./lifecycle-setup.ts";
import { placeOfState } from "./place.ts";
import { stageInputs } from "./stage.ts";
import {
  cancelled,
  demoOverridden,
  errored,
  finished,
  gateApproved,
  gateRejected,
  retried,
  sentBackToSpec,
  soleOutcome,
} from "./transition.ts";
import { workItemAfter } from "./work-item-after.ts";
import { newWorkItemContext } from "./work-item.ts";

// Every transition names its target as a literal, even where a helper could
// compute it, so Stately's editor can draw every arrow (ADR 0002).
export const defaultLifecycle = lifecycleSetup.createMachine({
  id: "lifecycle",
  version: "1",
  context: ({ input }) => newWorkItemContext(input),
  initial: "working",
  on: {
    cancel: ({ context, event, self }) => ({
      target: ".cancelled",
      context: workItemAfter(context, cancelled(placeOfState(self.getSnapshot().value), event)),
    }),
    requireDemo: ({ context, event, self }) => ({
      context: workItemAfter(
        context,
        demoOverridden(true, placeOfState(self.getSnapshot().value), event),
      ),
    }),
    skipDemo: ({ context, event, self }) => ({
      context: workItemAfter(
        context,
        demoOverridden(false, placeOfState(self.getSnapshot().value), event),
      ),
    }),
  },
  states: {
    working: {
      initial: "intake",
      on: {
        // A gatekeeper's error never reaches here, because its gate handles it: a
        // gatekeeper that gives up leaves the decision to a human (ADR 0021).
        "xstate.error.actor": ({ context, event }) =>
          event.actorId === "gatekeeper"
            ? undefined
            : {
                target: "#blocked",
                context: workItemAfter(context, errored(event.actorId, event.error)),
              },
      },
      states: {
        intake: {
          invoke: {
            id: "intake",
            src: "intake",
            input: stageInputs.intake,
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
            input: stageInputs.spec,
            onDone: ({ context, event: { output } }) => ({
              target: "specGate",
              context: workItemAfter(context, soleOutcome("spec", output)),
            }),
          },
        },
        specGate: {
          invoke: gateGatekeeper("specGate"),
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
            input: stageInputs.provision,
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
            input: stageInputs.reproduce,
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
                    context: workItemAfter(context, finished("reproduce", output)),
                  };
                }
                case "needsSample": {
                  const after = workItemAfter(context, finished("reproduce", output));
                  return after._tag === "sentAround"
                    ? { target: "provision", context: after.around }
                    : { target: "#blocked", context: after.blocked };
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
            input: stageInputs.plan,
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
            input: stageInputs.build,
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
            input: stageInputs.demo,
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
            input: stageInputs.review,
            onDone: ({ context, event: { output } }) => {
              switch (output._tag) {
                case "approved": {
                  return {
                    target: "shipGate",
                    context: workItemAfter(context, finished("review", output)),
                  };
                }
                case "changesRequested": {
                  const after = workItemAfter(context, finished("review", output));
                  return after._tag === "sentAround"
                    ? { target: "build", context: after.around }
                    : { target: "#blocked", context: after.blocked };
                }
                default: {
                  return absurd(output);
                }
              }
            },
          },
        },
        shipGate: {
          invoke: gateGatekeeper("shipGate"),
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
            input: stageInputs.ship,
            onDone: ({ context, event: { output } }) => {
              switch (output._tag) {
                case "shipped": {
                  return {
                    target: "#shipped",
                    context: workItemAfter(context, finished("ship", output)),
                  };
                }
                case "needsRebuild": {
                  const after = workItemAfter(context, finished("ship", output));
                  return after._tag === "sentAround"
                    ? { target: "build", context: after.around }
                    : { target: "#blocked", context: after.blocked };
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
