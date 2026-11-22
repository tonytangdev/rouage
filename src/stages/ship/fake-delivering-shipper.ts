import { Effect, Layer } from "effect";

import { Shipper } from "./shipper.ts";

/** A promise of the shipper contract a fake shipper breaks, so a test shows the contract catches it. */
export type ShipperFlaw = "deliversEachTime";

/**
 * A Shipper plugin that records deliveries in memory by work item, keeping
 * every promise of the shipper contract unless it has `flaw`.
 */
export const fakeDeliveringShipper = (flaw?: ShipperFlaw) => {
  const deliveries = new Map<string, string>();
  let made = 0;
  return Layer.succeed(
    Shipper,
    Shipper.of({
      ship: (task) =>
        Effect.sync(() => {
          const delivered = deliveries.get(task.workItemId);
          if (delivered !== undefined && flaw !== "deliversEachTime") {
            return { _tag: "shipped", deliveryRef: delivered } as const;
          }
          made += 1;
          const deliveryRef = `delivery-${made}`;
          deliveries.set(task.workItemId, deliveryRef);
          return { _tag: "shipped", deliveryRef } as const;
        }),
    }),
  );
};
