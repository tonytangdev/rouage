import type { StageFailure, StageInput } from "../../lifecycle/stage.ts";
import { sandboxMissing } from "../sandbox-missing.ts";
import { singleStepStage } from "../single-step-stage.ts";
import type { DemoTask } from "./demonstrator.ts";
import { Demonstrator } from "./demonstrator.ts";

const demoTask = (input: StageInput): DemoTask | StageFailure =>
  input.sandboxRef === null
    ? sandboxMissing("Demo")
    : {
        workItemId: input.workItemId,
        issueRef: input.issueRef,
        kind: input.kind,
        specRef: input.specRef,
        planRef: input.planRef,
        sandboxRef: input.sandboxRef,
        reproductionRef: input.reproductionRef,
        previousDemoRef: input.demoRef,
      };

/**
 * The Demo stage machine: makes a demo of the built change with the
 * `Demonstrator` in context, given the previous demo to revise, and finishes
 * with the reference to it. Fails when there is no sandbox, or with the demonstrator's reason when it gives up; either blocks
 * the work item.
 */
export const demoStage = singleStepStage(Demonstrator, {
  stage: "demo",
  task: demoTask,
  ask: (demonstrator, task: DemoTask) => demonstrator.demonstrate(task),
  outcome: ({ demoRef }) => ({ _tag: "demonstrated", demoRef }),
});
