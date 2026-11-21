import { builtChangeTask } from "../built-change.ts";
import { singleStepStage } from "../single-step-stage.ts";
import type { DemoTask } from "./demonstrator.ts";
import { DemoTaskSchema, Demonstrator } from "./demonstrator.ts";

/**
 * The Demo stage machine: makes a demo of the built change with the
 * `Demonstrator` in context, given the previous demo to revise, and finishes
 * with the reference to it. Fails when there is no sandbox, or with the demonstrator's reason when it gives up; either blocks
 * the work item.
 */
export const demoStage = singleStepStage(Demonstrator, {
  stage: "demo",
  task: (input) => builtChangeTask("Demo", input, { previousDemoRef: input.demoRef }),
  taskSchema: DemoTaskSchema,
  ask: (demonstrator, task: DemoTask) => demonstrator.demonstrate(task),
  outcome: ({ demoRef }) => ({ _tag: "demonstrated", demoRef }),
});
