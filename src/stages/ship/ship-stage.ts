import { builtChangeTask } from "../built-change.ts";
import { singleStepStage } from "../single-step-stage.ts";
import type { Shipped, ShipTask } from "./shipper.ts";
import { Shipper } from "./shipper.ts";

/**
 * The Ship stage machine: asks the `Shipper` in context to deliver the change
 * a human approved at the ship gate, and finishes with where it was
 * delivered. Fails when there is no sandbox, or with the shipper's reason
 * when it gives up; either blocks the work item.
 */
export const shipStage = singleStepStage(Shipper, {
  stage: "ship",
  task: (input) =>
    builtChangeTask("Ship", input, {
      demoRef: input.demoPlanned === true ? input.demoRef : null,
    }),
  ask: (shipper, task: ShipTask) => shipper.ship(task),
  outcome: ({ deliveryRef }: Shipped) => ({ _tag: "shipped", deliveryRef }),
});
