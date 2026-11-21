import { Match } from "effect";

import type { OutcomeOf } from "../../lifecycle/stage.ts";
import { builtChangeTask } from "../built-change.ts";
import { singleStepStage } from "../single-step-stage.ts";
import type { Shipment, ShipTask } from "./shipper.ts";
import { ShipTaskSchema, Shipper } from "./shipper.ts";

/**
 * The Ship stage machine: asks the `Shipper` in context to deliver the change
 * a human approved at the ship gate, and finishes with where it was
 * delivered, or with what Build must address for it to land. Fails when there is no sandbox, or with the shipper's reason
 * when it gives up; either blocks the work item.
 */
export const shipStage = singleStepStage(Shipper, {
  stage: "ship",
  task: (input) => builtChangeTask("Ship", input, { demoRef: input.demoRef }),
  taskSchema: ShipTaskSchema,
  ask: (shipper, task: ShipTask) => shipper.ship(task),
  outcome: (shipment: Shipment): OutcomeOf<"ship"> =>
    Match.valueTags(shipment, {
      shipped: ({ deliveryRef }): OutcomeOf<"ship"> => ({ _tag: "shipped", deliveryRef }),
      needsRebuild: ({ feedback }): OutcomeOf<"ship"> => ({ _tag: "needsRebuild", feedback }),
    }),
});
