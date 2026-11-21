import type { FakePort, Misbehaving } from "../fake-script.ts";
import { everyStep, fakePort } from "../fake-script.ts";
import type { Shipment } from "./shipper.ts";
import { Shipper, ShipperGaveUp } from "./shipper.ts";

export type ShipStep = keyof Shipper["Service"];

/** The shipper as its fake and the stage contract suite know it. */
export const shipperPort: FakePort<ShipStep, ShipperGaveUp> = {
  port: "shipper",
  steps: everyStep<ShipStep>()(["ship"]),
  gaveUp: (message) => new ShipperGaveUp({ message }),
};

export interface FakeShipperScript {
  /** What each ship answers, in order. */
  readonly shipments: readonly Shipment[];
  readonly misbehaving?: Misbehaving<ShipStep> | undefined;
}

/** A shipper that follows a script instead of delivering anything. */
export const fakeShipper = (script: FakeShipperScript) =>
  fakePort(Shipper, shipperPort, script.misbehaving, ({ answer }) =>
    Shipper.of({ ship: (task) => answer("ship", task, script.shipments) }),
  );
