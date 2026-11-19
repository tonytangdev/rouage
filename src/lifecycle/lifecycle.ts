import { blockedOn, loopLimitReached, stageCrashed } from "./blocked.ts";
import { lifecycleSetup, stageInput } from "./lifecycle-setup.ts";
import { innermostState } from "./state-value.ts";
import { approved, noLoopsYet, recordDecision, rejected } from "./work-item.ts";

// Every transition names its target as a literal, even where a helper could
// compute it, so Stately's editor can draw every arrow (ADR 0002).
export const defaultLifecycle = lifecycleSetup.createMachine({
  id: "lifecycle",
  version: "1",
  context: ({ input }) => ({
    id: input.id,
    issueRef: input.issueRef,
    kind: null,
    limits: input.limits,
    counters: noLoopsYet,
    demoPlanned: false,
    feedback: null,
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
      states: {
        intake: {
          invoke: {
            id: "intake",
            src: "intake",
            input: stageInput,
            onDone: ({ event: { output } }) =>
              output._tag === "classified"
                ? { target: "spec", context: { kind: output.kind } }
                : { target: "#blocked", context: blockedOn("intake", output.reason) },
            onError: ({ event }) => ({
              target: "#blocked",
              context: stageCrashed("intake", event.error),
            }),
          },
        },
        spec: {
          invoke: {
            id: "spec",
            src: "spec",
            input: stageInput,
            onDone: ({ event: { output } }) =>
              output._tag === "written"
                ? { target: "specGate", context: { feedback: null } }
                : { target: "#blocked", context: blockedOn("spec", output.reason) },
            onError: ({ event }) => ({
              target: "#blocked",
              context: stageCrashed("spec", event.error),
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
              if (output._tag === "failed") {
                return { target: "#blocked", context: blockedOn("provision", output.reason) };
              }
              return context.kind === "bug" ? { target: "reproduce" } : { target: "plan" };
            },
            onError: ({ event }) => ({
              target: "#blocked",
              context: stageCrashed("provision", event.error),
            }),
          },
        },
        reproduce: {
          invoke: {
            id: "reproduce",
            src: "reproduce",
            input: stageInput,
            onDone: ({ context, event: { output } }) => {
              if (output._tag === "reproduced") {
                return { target: "plan" };
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
              if (output._tag === "failed") {
                return { target: "#blocked", context: blockedOn("reproduce", output.reason) };
              }
              if (context.counters.reproduce >= context.limits.reproduce) {
                return {
                  target: "#blocked",
                  context: loopLimitReached(
                    "reproduce",
                    `Reproduce went back to Provision ${context.limits.reproduce} times`,
                  ),
                };
              }
              return {
                target: "provision",
                context: {
                  counters: { ...context.counters, reproduce: context.counters.reproduce + 1 },
                },
              };
            },
            onError: ({ event }) => ({
              target: "#blocked",
              context: stageCrashed("reproduce", event.error),
            }),
          },
        },
        plan: {
          invoke: {
            id: "plan",
            src: "plan",
            input: stageInput,
            onDone: ({ event: { output } }) =>
              output._tag === "planned"
                ? { target: "build", context: { demoPlanned: output.demo } }
                : { target: "#blocked", context: blockedOn("plan", output.reason) },
            onError: ({ event }) => ({
              target: "#blocked",
              context: stageCrashed("plan", event.error),
            }),
          },
        },
        build: {
          invoke: {
            id: "build",
            src: "build",
            input: stageInput,
            onDone: ({ context, event: { output } }) => {
              if (output._tag === "failed") {
                return { target: "#blocked", context: blockedOn("build", output.reason) };
              }
              return context.demoPlanned
                ? { target: "demo", context: { feedback: null } }
                : { target: "review", context: { feedback: null } };
            },
            onError: ({ event }) => ({
              target: "#blocked",
              context: stageCrashed("build", event.error),
            }),
          },
        },
        demo: {
          invoke: {
            id: "demo",
            src: "demo",
            input: stageInput,
            onDone: ({ event: { output } }) =>
              output._tag === "demonstrated"
                ? { target: "review" }
                : { target: "#blocked", context: blockedOn("demo", output.reason) },
            onError: ({ event }) => ({
              target: "#blocked",
              context: stageCrashed("demo", event.error),
            }),
          },
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
              if (output._tag === "failed") {
                return { target: "#blocked", context: blockedOn("review", output.reason) };
              }
              if (context.counters.review >= context.limits.review) {
                return {
                  target: "#blocked",
                  context: loopLimitReached(
                    "review",
                    `Review sent the change back to Build ${context.limits.review} times`,
                  ),
                };
              }
              return {
                target: "build",
                context: {
                  feedback: output.feedback,
                  counters: { ...context.counters, review: context.counters.review + 1 },
                },
              };
            },
            onError: ({ event }) => ({
              target: "#blocked",
              context: stageCrashed("review", event.error),
            }),
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
            onDone: ({ event: { output } }) =>
              output._tag === "shipped"
                ? { target: "#shipped" }
                : { target: "#blocked", context: blockedOn("ship", output.reason) },
            onError: ({ event }) => ({
              target: "#blocked",
              context: stageCrashed("ship", event.error),
            }),
          },
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
