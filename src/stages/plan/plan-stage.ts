import type { StageInput } from "../../lifecycle/stage.ts";
import { singleStepStage } from "../single-step-stage.ts";
import type { PlanTask } from "./planner.ts";
import { Planner } from "./planner.ts";

const planTask = (input: StageInput): PlanTask => ({
  workItemId: input.workItemId,
  issueRef: input.issueRef,
  kind: input.kind,
  specRef: input.specRef,
  sandboxRef: input.sandboxRef,
  sampleRef: input.sampleRef,
  reproductionRef: input.reproductionRef,
  previousPlanRef: input.planRef,
});

/**
 * The Plan stage machine: plans the change with the `Planner` in context,
 * given the previous plan to revise, and finishes with the reference to the
 * plan and whether a demo is worth it. Fails with the planner's reason when it
 * gives up, which blocks the work item.
 */
export const planStage = singleStepStage(Planner, {
  stage: "plan",
  task: planTask,
  ask: (planner, task: PlanTask) => planner.plan(task),
  outcome: ({ planRef, demo }) => ({ _tag: "planned", planRef, demo }),
});
