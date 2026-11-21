import { Effect, Layer } from "effect";

import { goldenRefs } from "../../lifecycle/golden-route.ts";
import type { StageInput } from "../../lifecycle/stage.ts";
import { portStageUnderTest } from "../port-stage-under-test.ts";
import type { FakeProvisionerScript } from "./fake-provisioner.ts";
import { fakeProvisioner, provisionerPort } from "./fake-provisioner.ts";
import type { FakeSamplerScript } from "./fake-sampler.ts";
import { fakeSampler } from "./fake-sampler.ts";
import { provisionStage } from "./provision-stage.ts";

export const sandbox = { sandboxRef: "box-1" } as const;
export const sample = { _tag: "sampled", sampleRef: "sample-1" } as const;
export const awaitingRun = { _tag: "awaitingRun", scriptRef: "script-1" } as const;

/** What the provisioner is asked on a work item's first provision. */
export const firstProvision = {
  workItemId: goldenRefs.workItemId,
  issueRef: goldenRefs.issueRef,
  specRef: goldenRefs.specRef,
  previousSandboxRef: null,
} as const;

/** What the sampler is asked on a work item's first sample. */
export const firstSample = {
  workItemId: goldenRefs.workItemId,
  sandboxRef: goldenRefs.sandboxRef,
  sampleRequest: "orders over 100",
  previousSampleRef: null,
} as const;

export interface ProvisionScript {
  readonly provisioner: FakeProvisionerScript;
  readonly sampler?: FakeSamplerScript;
}

export const provisionUnderTest = portStageUnderTest({
  name: "provision",
  port: provisionerPort,
  scripted: Effect.fnUntraced(function* (script: ProvisionScript) {
    const fake = yield* fakeProvisioner(script.provisioner);
    const sampler = yield* fakeSampler(script.sampler ?? { results: [] });
    const stage = yield* provisionStage.pipe(
      Effect.provide(Layer.merge(fake.layer, sampler.layer)),
    );
    return { fake, sampler, stage };
  }),
  passing: (misbehaving) => ({ provisioner: { results: [sandbox], misbehaving } }),
  outcome: { _tag: "provisioned", ...sandbox, sampleRef: null },
  firstTask: firstProvision,
});

/** The input of a Provision run Reproduce sent back for a sample. */
export const sampleRequestedInput: StageInput = {
  ...provisionUnderTest.input,
  sandboxRef: goldenRefs.sandboxRef,
  sampleRequest: "orders over 100",
};
