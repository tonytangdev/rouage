import { blockedOn, stageErrored } from "./blocked.ts";
import { lifecycleSetup } from "./lifecycle-setup.ts";
import { goneAround, loopExhausted, loopLimitReached, noLoopsYet } from "./loops.ts";
import { noFactsYet, stageInput } from "./stage.ts";
import { innermostState } from "./state-value.ts";
import { approved, recordDecision, rejected } from "./work-item.ts";

// Every transition names its target as a literal, even where a helper could
// compute it, so Stately's editor can draw every arrow (ADR 0002).
export const defaultLifecycle = lifecycleSetup.createMachine({
  id: "lifecycle",
  version: "1",
  context: ({ input }) => ({
    id: input.id,
    issueRef: input.issueRef,
    ...noFactsYet,
    limits: input.limits,
    counters: noLoopsYet,
    demoPlanned: false,
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
            onDone: ({ event: { output } }) => ({ target: "spec", context: { kind: output.kind } }),
          },
        },
        spec: {
          invoke: {
            id: "spec",
            src: "spec",
            input: stageInput,
            onDone: ({ event: { output } }) => ({
              target: "specGate",
              context: { feedback: null, specRef: output.specRef },
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
              context: rejected(context, "specGate", event),
            }),
          },
        },
        provision: {
          invoke: {
            id: "provision",
            src: "provision",
            input: stageInput,
            onDone: ({ context, event: { output } }) => {
              const prepared = { sandboxRef: output.sandboxRef, sampleRef: output.sampleRef };
              return context.kind === "bug"
                ? { target: "reproduce", context: prepared }
                : { target: "plan", context: prepared };
            },
          },
        },
        reproduce: {
          invoke: {
            id: "reproduce",
            src: "reproduce",
            input: stageInput,
            onDone: ({ context, event: { output } }) => {
              if (output._tag === "reproduced") {
                return { target: "plan", context: { reproductionRef: output.reproductionRef } };
              }
              if (output._tag === "cannotReproduce") {
                return {
                  target: "#blocked",
                  context: blockedOn("reproduce", {
                    tag: "CannotReproduce",
                    message: output.reason,
                  }),
                };
              }
              if (loopExhausted(context, "reproduce")) {
                return { target: "#blocked", context: loopLimitReached(context, "reproduce") };
              }
              return {
                target: "provision",
                context: {
                  sampleRequest: output.sampleRequest,
                  ...goneAround(context, "reproduce"),
                },
              };
            },
          },
        },
        plan: {
          invoke: {
            id: "plan",
            src: "plan",
            input: stageInput,
            onDone: ({ event: { output } }) => ({
              target: "build",
              context: { demoPlanned: output.demo },
            }),
          },
        },
        build: {
          invoke: {
            id: "build",
            src: "build",
            input: stageInput,
            onDone: ({ context }) =>
              context.demoPlanned
                ? { target: "demo", context: { feedback: null } }
                : { target: "review", context: { feedback: null } },
          },
        },
        demo: {
          invoke: { id: "demo", src: "demo", input: stageInput, onDone: { target: "review" } },
        },
        review: {
          invoke: {
            id: "review",
            src: "review",
            input: stageInput,
            onDone: ({ context, event: { output } }) => {
              if (output._tag === "approved") {
                return { target: "shipGate" };
              }
              if (loopExhausted(context, "review")) {
                return { target: "#blocked", context: loopLimitReached(context, "review") };
              }
              return {
                target: "build",
                context: { feedback: output.feedback, ...goneAround(context, "review") },
              };
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
          invoke: { id: "ship", src: "ship", input: stageInput, onDone: { target: "#shipped" } },
        },
        lastStage: { type: "history", target: "intake" },
      },
    },
    blocked: {
      id: "blocked",
      on: {
        retry: ({ context, event }) => ({
          target: "working.lastStage",
          context: {
            blocked: null,
            counters: noLoopsYet,
            decisions: recordDecision(context, "retry", "blocked", event),
          },
        }),
        backToSpec: ({ context, event }) => {
          const restart = {
            blocked: null,
            counters: noLoopsYet,
            feedback: event.comment ?? null,
            decisions: recordDecision(context, "backToSpec", "blocked", event),
          };
          // An unclassified work item would reach Provision without a kind and be routed as a feature.
          return context.kind === null
            ? { target: "working.intake", context: restart }
            : { target: "working.spec", context: restart };
        },
      },
    },
    shipped: { id: "shipped", type: "final" },
    cancelled: { type: "final" },
  },
});
