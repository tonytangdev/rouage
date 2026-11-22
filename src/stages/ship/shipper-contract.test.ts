import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { fakeDeliveringShipper } from "./fake-delivering-shipper.ts";
import { firstShipment } from "./ship-harness.ts";
import { describeShipperContract, shipperContract } from "./shipper-contract.ts";

describeShipperContract("the fake delivering shipper", fakeDeliveringShipper(), firstShipment);

describe("the shipper contract against a shipper that breaks it", () => {
  it.effect("fails when shipping the same task again delivers the change again", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        shipperContract(firstShipment).shippingAgainDeliversOnce.check.pipe(
          Effect.provide(fakeDeliveringShipper("deliversEachTime")),
        ),
      );
      expect(error).toMatchObject({ _tag: "PluginBrokeContract" });
    }),
  );
});
