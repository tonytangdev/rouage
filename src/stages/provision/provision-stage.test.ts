import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { failureReasonOf } from "../../lifecycle/stage.ts";
import { gaveUpMessage } from "../fake-script.ts";
import { describePortStage } from "../port-stage-contract.ts";
import {
  awaitingRun,
  firstProvision,
  firstSample,
  provisionUnderTest,
  sample,
  sampleRequestedInput,
  sandbox,
} from "./provision-harness.ts";

describe("provision stage", () => {
  it.effect("finishes with the sandbox it provisioned and no sample when none was requested", () =>
    Effect.gen(function* () {
      const { settled, fake, sampler } = yield* provisionUnderTest.run({
        provisioner: { results: [sandbox] },
      });
      expect(settled.output).toStrictEqual({
        _tag: "provisioned",
        sandboxRef: "box-1",
        sampleRef: null,
      });
      expect(fake.calls()).toStrictEqual([{ step: "provision", task: firstProvision }]);
      expect(sampler.tasks()).toStrictEqual([]);
    }),
  );

  it.effect("reuses the current sandbox and takes the requested sample into it", () =>
    Effect.gen(function* () {
      const { settled, fake, sampler } = yield* provisionUnderTest.run(
        { provisioner: { results: [sandbox] }, sampler: { results: [sample] } },
        sampleRequestedInput,
      );
      expect(settled.output).toStrictEqual({
        _tag: "provisioned",
        sandboxRef: "box-1",
        sampleRef: "sample-1",
      });
      expect(fake.calls()).toStrictEqual([
        { step: "provision", task: { ...firstProvision, previousSandboxRef: "box-1" } },
      ]);
      expect(sampler.tasks()).toStrictEqual([firstSample]);
    }),
  );

  it.effect("finishes awaiting a run of the extraction script, with the sandbox it is for", () =>
    Effect.gen(function* () {
      const { settled } = yield* provisionUnderTest.run(
        { provisioner: { results: [sandbox] }, sampler: { results: [awaitingRun] } },
        sampleRequestedInput,
      );
      expect(settled.output).toStrictEqual({
        _tag: "awaitingRun",
        sandboxRef: "box-1",
        scriptRef: "script-1",
      });
    }),
  );

  it.effect("fails with the sampler's reason when the sampler gives up", () =>
    Effect.gen(function* () {
      const { settled } = yield* provisionUnderTest.run(
        {
          provisioner: { results: [sandbox] },
          sampler: { results: [], misbehaving: { step: "sample", as: "failing" } },
        },
        sampleRequestedInput,
      );
      expect(failureReasonOf(settled.error)).toStrictEqual({
        tag: "SamplerGaveUp",
        message: gaveUpMessage("sampler", "sample"),
      });
    }),
  );
});

describePortStage(provisionUnderTest);
