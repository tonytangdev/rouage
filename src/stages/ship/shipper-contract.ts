import type { Layer } from "effect";
import { Effect } from "effect";

import type { PluginPromise } from "../plugin-contract.ts";
import { describePluginContract, promiseKept } from "../plugin-contract.ts";
import type { Shipment, ShipTask } from "./shipper.ts";
import { Shipper } from "./shipper.ts";

const describeShipment = (shipment: Shipment) =>
  shipment._tag === "shipped"
    ? `shipped as ${shipment.deliveryRef}`
    : `needed a rebuild: ${shipment.feedback}`;

const deliveryRefOf = (shipment: Shipment) =>
  shipment._tag === "shipped" ? shipment.deliveryRef : null;

/** The promises of the Shipper port, each a check shipping `task`, a task the shipper delivers. */
export const shipperContract = (task: ShipTask) =>
  ({
    shippingAgainDeliversOnce: {
      name: "answers a second ship of the same task with the delivery it already made",
      check: Effect.gen(function* () {
        const shipper = yield* Shipper;
        const first = yield* shipper.ship(task);
        yield* promiseKept(
          deliveryRefOf(first) !== null,
          `The task given to the shipper contract must ship, but it ${describeShipment(first)}`,
        );
        const second = yield* shipper.ship(task);
        yield* promiseKept(
          deliveryRefOf(second) === deliveryRefOf(first),
          `Shipping again ${describeShipment(second)}, after it first ${describeShipment(first)}`,
        );
      }),
    },
  }) satisfies Record<string, PluginPromise<Shipper>>;

/** Declares the shipper contract's tests for the Shipper `layer` fills, shipping `task`. */
export const describeShipperContract = <E>(
  title: string,
  layer: Layer.Layer<Shipper, E>,
  task: ShipTask,
) => {
  describePluginContract(`shipper contract, ${title}`, shipperContract(task), layer);
};
