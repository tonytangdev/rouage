import { Predicate } from "effect";
import type { StateValue } from "xstate";
import { setup, types } from "xstate";

import type { Blocked, StageName } from "./blocked.ts";
import { blockedOn, loopLimitReached, stageCrashed } from "./blocked.ts";
import type {
  BuildOutcome,
  DemoOutcome,
  IntakeOutcome,
  PlanOutcome,
  ProvisionOutcome,
  ReproduceOutcome,
  ReviewOutcome,
  ShipOutcome,
  SpecOutcome,
} from "./outcomes.ts";
import { stubStage } from "./stub-stage.ts";
import type { HumanDecision, WorkItemContext, WorkItemInput } from "./work-item.ts";
import { gate, noLoopsYet, recordDecision } from "./work-item.ts";

const lifecycleSetup = setup({
  schemas: {
    input: types<WorkItemInput>(),
    context: types<WorkItemContext>(),
    events: {
      approve: types<HumanDecision>(),
      reject: types<HumanDecision>(),
      retry: types<HumanDecision>(),
      backToSpec: types<HumanDecision>(),
      cancel: types<HumanDecision>(),
    },
  },
  actors: {
    intake: stubStage<IntakeOutcome>(),
    spec: stubStage<SpecOutcome>(),
    provision: stubStage<ProvisionOutcome>(),
    reproduce: stubStage<ReproduceOutcome>(),
    plan: stubStage<PlanOutcome>(),
    build: stubStage<BuildOutcome>(),
    demo: stubStage<DemoOutcome>(),
    review: stubStage<ReviewOutcome>(),
    ship: stubStage<ShipOutcome>(),
  },
  states: {
    intake: {},
    spec: {},
    specGate: {},
    provision: {},
    reproduce: {},
    plan: {},
    build: {},
    demo: {},
    review: {},
    shipGate: {},
    ship: {},
    blocked: { schemas: { context: types<{ blocked: Blocked }>() } },
    shipped: { type: "final" },
    cancelled: { type: "final" },
  },
});

const stateName = (value: StateValue) =>
  Predicate.isString(value) ? value : JSON.stringify(value);

const stage = (name: StageName) => ({
  id: name,
  input: ({ context }: { context: WorkItemContext }) => ({
    workItemId: context.id,
    kind: context.kind,
    feedback: context.feedback,
  }),
  onError: stageCrashed(name),
});

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
  initial: "intake",
  on: {
    cancel: ({ context, event, self }) => ({
      target: ".cancelled",
      context: {
        decisions: recordDecision(context, "cancel", stateName(self.getSnapshot().value), event),
      },
    }),
  },
  states: {
    intake: {
      invoke: {
        ...stage("intake"),
        src: "intake",
        onDone: ({ event: { output } }) =>
          output._tag === "classified"
            ? { target: "spec", context: { kind: output.kind } }
            : blockedOn("intake", output.reason),
      },
    },
    spec: {
      invoke: {
        ...stage("spec"),
        src: "spec",
        onDone: ({ event: { output } }) =>
          output._tag === "written"
            ? { target: "specGate", context: { feedback: null } }
            : blockedOn("spec", output.reason),
      },
    },
    specGate: gate("specGate", "provision", "spec"),
    provision: {
      invoke: {
        ...stage("provision"),
        src: "provision",
        onDone: ({ context, event: { output } }) => {
          if (output._tag === "failed") {
            return blockedOn("provision", output.reason);
          }
          return context.kind === "bug" ? { target: "reproduce" } : { target: "plan" };
        },
      },
    },
    reproduce: {
      invoke: {
        ...stage("reproduce"),
        src: "reproduce",
        onDone: ({ context, event: { output } }) => {
          if (output._tag === "reproduced") {
            return { target: "plan" };
          }
          if (output._tag === "cannotReproduce") {
            return blockedOn("reproduce", { tag: "CannotReproduce", message: output.reason });
          }
          if (output._tag === "failed") {
            return blockedOn("reproduce", output.reason);
          }
          return context.counters.reproduce >= context.limits.reproduce
            ? loopLimitReached(
                "reproduce",
                `Reproduce went back to Provision ${context.limits.reproduce} times`,
              )
            : {
                target: "provision",
                context: {
                  counters: { ...context.counters, reproduce: context.counters.reproduce + 1 },
                },
              };
        },
      },
    },
    plan: {
      invoke: {
        ...stage("plan"),
        src: "plan",
        onDone: ({ event: { output } }) =>
          output._tag === "planned"
            ? { target: "build", context: { demoPlanned: output.demo } }
            : blockedOn("plan", output.reason),
      },
    },
    build: {
      invoke: {
        ...stage("build"),
        src: "build",
        onDone: ({ context, event: { output } }) => {
          if (output._tag === "failed") {
            return blockedOn("build", output.reason);
          }
          return context.demoPlanned
            ? { target: "demo", context: { feedback: null } }
            : { target: "review", context: { feedback: null } };
        },
      },
    },
    demo: {
      invoke: {
        ...stage("demo"),
        src: "demo",
        onDone: ({ event: { output } }) =>
          output._tag === "demonstrated" ? { target: "review" } : blockedOn("demo", output.reason),
      },
    },
    review: {
      invoke: {
        ...stage("review"),
        src: "review",
        onDone: ({ context, event: { output } }) => {
          if (output._tag === "approved") {
            return { target: "shipGate" };
          }
          if (output._tag === "failed") {
            return blockedOn("review", output.reason);
          }
          return context.counters.review >= context.limits.review
            ? loopLimitReached(
                "review",
                `Review sent the change back to Build ${context.limits.review} times`,
              )
            : {
                target: "build",
                context: {
                  feedback: output.feedback,
                  counters: { ...context.counters, review: context.counters.review + 1 },
                },
              };
        },
      },
    },
    shipGate: gate("shipGate", "ship", "build"),
    ship: {
      invoke: {
        ...stage("ship"),
        src: "ship",
        onDone: ({ event: { output } }) =>
          output._tag === "shipped" ? { target: "shipped" } : blockedOn("ship", output.reason),
      },
    },
    shipped: { type: "final" },
    cancelled: { type: "final" },
    blocked: {
      on: {
        retry: ({ context, event }) => ({
          target: context.blocked.from,
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
            ? { target: "intake", context: restart }
            : { target: "spec", context: restart };
        },
      },
    },
  },
});
