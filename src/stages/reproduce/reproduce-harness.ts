import { Effect } from "effect";
import { createActor } from "xstate";

import type { StageInput } from "../../lifecycle/stage.ts";
import { aloneInput, runAlone } from "../stage-harness.ts";
import type { FakeReproducerScript } from "./fake-reproducer.ts";
import { fakeReproducer } from "./fake-reproducer.ts";
import { reproduceStage } from "./reproduce-stage.ts";

export const captured = { _tag: "captured", reproductionRef: "repro-1" } as const;
export const checkFailed = { _tag: "failed" } as const;
export const checkPassed = { _tag: "passed", output: "1 test passed: totals add VAT" } as const;

/** The input a Reproduce stage run alone starts with: a provisioned bug with no sample. */
export const provisionedInput: StageInput = {
  ...aloneInput,
  kind: "bug",
  specRef: "spec-1",
  sandboxRef: "box-1",
};

/** What the reproducer is asked on a bug's first capture. */
export const firstCapture = {
  workItemId: "wi-1",
  issueRef: "#1",
  specRef: "spec-1",
  sandboxRef: "box-1",
  sampleRef: null,
  sampleRequest: null,
  previousReproductionRef: null,
} as const;

/** What the reproducer is asked to confirm after the first capture. */
export const firstConfirm = {
  workItemId: "wi-1",
  sandboxRef: "box-1",
  reproductionRef: "repro-1",
} as const;

export const scriptedReproduce = Effect.fnUntraced(function* (script: FakeReproducerScript) {
  const reproducer = yield* fakeReproducer(script);
  return { reproducer, reproduce: yield* reproduceStage.pipe(Effect.provide(reproducer.layer)) };
});

/** Runs a Reproduce stage outside any lifecycle until it finishes or fails. */
export const runReproduce = Effect.fnUntraced(function* (
  script: FakeReproducerScript,
  input: StageInput = provisionedInput,
) {
  const { reproducer, reproduce } = yield* scriptedReproduce(script);
  const settled = yield* runAlone(createActor(reproduce, { input }));
  return { settled, calls: reproducer.calls() };
});
