import { Effect } from "effect";
import { setup, types } from "xstate";

import type { OutcomeOf, StageInput } from "../../lifecycle/stage.ts";
import type { PortStep } from "../port-stage.ts";
import { portStage } from "../port-stage.ts";
import type { PlanTask } from "./planner.ts";
import { Planner } from "./planner.ts";

const planTask = ({ context }: { readonly context: StageInput }): PlanTask => ({
  workItemId: context.workItemId,
  issueRef: context.issueRef,
  kind: context.kind,
  specRef: context.specRef,
  sandboxRef: context.sandboxRef,
  sampleRef: context.sampleRef,
  reproductionRef: context.reproductionRef,
  previousPlanRef: context.planRef,
});

const plan = (planner: Planner["Service"], task: PlanTask) =>
  Effect.map(planner.plan(task), ({ planRef, demo }) => ({
    _tag: "planned" as const,
    planRef,
    demo,
  }));

const planSetup = (step: PortStep<Planner["Service"]>) =>
  setup({
    schemas: {
      input: types<StageInput>(),
      context: types<StageInput>(),
      output: types<OutcomeOf<"plan">>(),
    },
    actors: { plan: step(plan) },
    states: {
      planning: {},
      planned: { type: "final", schemas: { input: types<OutcomeOf<"plan">>() } },
    },
  });

const planMachine = (step: PortStep<Planner["Service"]>) =>
  planSetup(step).createMachine({
    id: "plan",
    context: ({ input }) => input,
    initial: "planning",
    states: {
      planning: {
        invoke: {
          id: "plan",
          src: "plan",
          input: planTask,
          onDone: ({ event: { output } }) => ({ target: "planned", input: output }),
        },
      },
      planned: { type: "final", output: ({ input }) => input },
    },
  });

/**
 * The Plan stage machine: plans the change with the `Planner` in context,
 * given the previous plan to revise, and finishes with the reference to the
 * plan and whether a demo is worth it. Fails with the planner's reason when it
 * gives up, which blocks the work item.
 */
export const planStage = portStage(Planner, planMachine);
