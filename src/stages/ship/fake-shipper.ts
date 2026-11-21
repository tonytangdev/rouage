import type { FakePort, Misbehaving } from "../fake-script.ts";
import { fakePort } from "../fake-script.ts";
import type { Shipped } from "./shipper.ts";
import { Shipper, ShipperGaveUp } from "./shipper.ts";

export type ShipStep = "ship";

/** The shipper as its fake and the stage contract suite know it. */
export const shipperPort: FakePort<ShipStep, ShipperGaveUp> = {
  port: "shipper",
  steps: ["ship"],
  gaveUp: (message) => new ShipperGaveUp({ message }),
};

export interface FakeShipperScript {
  /** What each ship returns, in order. */
  readonly deliveries: readonly Shipped[];
  readonly misbehaving?: Misbehaving<ShipStep> | undefined;
}

/** A shipper that follows a script instead of delivering anything. */
export const fakeShipper = (script: FakeShipperScript) =>
  fakePort(Shipper, shipperPort, script.misbehaving, ({ answer }) =>
    Shipper.of({ ship: (task) => answer("ship", task, script.deliveries) }),
  );
