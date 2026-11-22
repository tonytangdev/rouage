import { goldenRefs } from "../../lifecycle/golden-route.ts";
import { portStageUnderTest, scriptedStage } from "../port-stage-under-test.ts";
import { fakeShipper, shipperPort } from "./fake-shipper.ts";
import { shipStage } from "./ship-stage.ts";

export const delivered = { _tag: "shipped", deliveryRef: goldenRefs.deliveryRef } as const;
export const needsRebuild = {
  _tag: "needsRebuild",
  feedback: "conflicts in src/totals.ts against main",
} as const;

/** What the shipper is asked when a feature is first shipped. */
export const firstShipment = {
  workItemId: goldenRefs.workItemId,
  issueRef: goldenRefs.issueRef,
  kind: "feature",
  specRef: goldenRefs.specRef,
  planRef: goldenRefs.planRef,
  sandboxRef: goldenRefs.sandboxRef,
  reproductionRef: null,
  demoRef: null,
  feedback: null,
} as const;

export const shipUnderTest = portStageUnderTest({
  name: "ship",
  port: shipperPort,
  scripted: scriptedStage(fakeShipper, shipStage),
  passing: (misbehaving) => ({ shipments: [delivered], misbehaving }),
  outcome: delivered,
  firstTask: firstShipment,
});

/** A fake shipper following the Ship stage's passing script. */
export const passingShipper = fakeShipper(shipUnderTest.passing());
