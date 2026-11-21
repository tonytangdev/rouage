import type { FakePort, Misbehaving } from "../fake-script.ts";
import { fakePort } from "../fake-script.ts";
import type { Sampled } from "./sampler.ts";
import { Sampler, SamplerGaveUp } from "./sampler.ts";

export type SampleStep = "sample";

/** The sampler as its fake knows it. */
export const samplerPort: FakePort<SampleStep, SamplerGaveUp> = {
  port: "sampler",
  steps: ["sample"],
  gaveUp: (message) => new SamplerGaveUp({ message }),
};

export interface FakeSamplerScript {
  /** What each sample returns, in order. */
  readonly results: readonly Sampled[];
  readonly misbehaving?: Misbehaving<SampleStep> | undefined;
}

/** A sampler that follows a script instead of taking a sample. */
export const fakeSampler = (script: FakeSamplerScript) =>
  fakePort(Sampler, samplerPort, script.misbehaving, ({ answer }) =>
    Sampler.of({ sample: (task) => answer("sample", task, script.results) }),
  );
