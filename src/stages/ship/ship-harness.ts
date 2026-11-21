import { goldenRefs } from "../../lifecycle/golden-route.ts";
import { portStageUnderTest, scriptedStage } from "../port-stage-under-test.ts";
import { fakeShipper, shipperPort } from "./fake-shipper.ts";
import { shipStage } from "./ship-stage.ts";

export const delivered = { deliveryRef: goldenRefs.deliveryRef } as const;

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
  passing: (misbehaving) => ({ deliveries: [delivered], misbehaving }),
  outcome: { _tag: "shipped", ...delivered },
  firstTask: firstShipment,
});
