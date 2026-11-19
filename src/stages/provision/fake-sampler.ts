import { Effect, Layer } from "effect";

import type { FakePort, Misbehaving } from "../fake-script.ts";
import { scriptedAnswers, scriptedPort } from "../fake-script.ts";
import type { SampleTask, Sampled } from "./sampler.ts";
import { Sampler, SamplerGaveUp } from "./sampler.ts";

export type SampleStep = "sample";

interface SampleCall {
  readonly step: SampleStep;
  readonly task: SampleTask;
}

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
export const fakeSampler = Effect.fnUntraced(function* (script: FakeSamplerScript) {
  const port = yield* scriptedPort<SampleStep, SampleCall, SamplerGaveUp>({
    ...samplerPort,
    misbehaving: script.misbehaving,
  });
  const results = scriptedAnswers(script.results, samplerPort.port);
  const sampler = Sampler.of({
    sample: (task) => port.run({ step: "sample", task }, results),
  });
  return {
    layer: Layer.succeed(Sampler, sampler),
    calls: (): readonly SampleTask[] => port.calls().map((call) => call.task),
    started: port.started,
  };
});
