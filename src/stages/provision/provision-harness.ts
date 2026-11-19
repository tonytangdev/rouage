import { Effect, Layer } from "effect";
import { createActor } from "xstate";

import type { StageInput } from "../../lifecycle/stage.ts";
import { aloneInput, runAlone } from "../stage-harness.ts";
import type { FakeProvisionerScript } from "./fake-provisioner.ts";
import { fakeProvisioner } from "./fake-provisioner.ts";
import type { FakeSamplerScript } from "./fake-sampler.ts";
import { fakeSampler } from "./fake-sampler.ts";
import { provisionStage } from "./provision-stage.ts";

export const sandbox = { sandboxRef: "box-1" } as const;
export const sample = { _tag: "sampled", sampleRef: "sample-1" } as const;
export const awaitingRun = { _tag: "awaitingRun", scriptRef: "script-1" } as const;

/** What the provisioner is asked on a work item's first provision. */
export const firstProvision = {
  workItemId: "wi-1",
  issueRef: "#1",
  specRef: "spec-1",
  previousSandboxRef: null,
} as const;

/** The input a Provision stage run alone starts with: an approved spec and no sandbox yet. */
export const approvedInput: StageInput = { ...aloneInput, kind: "bug", specRef: "spec-1" };

/** The input of a Provision run Reproduce sent back for a sample. */
export const sampleRequestedInput: StageInput = {
  ...approvedInput,
  sandboxRef: "box-1",
  sampleRequest: "orders over 100",
};

/** What the sampler is asked on a work item's first sample. */
export const firstSample = {
  workItemId: "wi-1",
  sandboxRef: "box-1",
  sampleRequest: "orders over 100",
  previousSampleRef: null,
} as const;

export interface ProvisionScript {
  readonly provisioner: FakeProvisionerScript;
  readonly sampler?: FakeSamplerScript;
}

export const scriptedProvision = Effect.fnUntraced(function* (script: ProvisionScript) {
  const provisioner = yield* fakeProvisioner(script.provisioner);
  const sampler = yield* fakeSampler(script.sampler ?? { results: [] });
  const provision = yield* provisionStage.pipe(
    Effect.provide(Layer.merge(provisioner.layer, sampler.layer)),
  );
  return { provisioner, sampler, provision };
});

/** Runs a Provision stage outside any lifecycle until it finishes or fails. */
export const runProvision = Effect.fnUntraced(function* (
  script: ProvisionScript,
  input: StageInput = approvedInput,
) {
  const { provisioner, sampler, provision } = yield* scriptedProvision(script);
  const settled = yield* runAlone(createActor(provision, { input }));
  return { settled, provisions: provisioner.calls(), samples: sampler.calls() };
});
