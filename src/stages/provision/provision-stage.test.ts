import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { describeStageContract } from "../../lifecycle/stage-contract.ts";
import { failureReasonOf } from "../../lifecycle/stage.ts";
import { gaveUpMessage } from "../fake-script.ts";
import { portAdapter } from "../port-stage-contract.ts";
import { provisionerPort } from "./fake-provisioner.ts";
import {
  awaitingRun,
  firstProvision,
  firstSample,
  runProvision,
  sample,
  sampleRequestedInput,
  sandbox,
} from "./provision-harness.ts";

describe("provision stage", () => {
  it.effect("finishes with the sandbox it provisioned and no sample when none was requested", () =>
    Effect.gen(function* () {
      const { settled, provisions, samples } = yield* runProvision({
        provisioner: { results: [sandbox] },
      });
      expect(settled.output).toStrictEqual({
        _tag: "provisioned",
        sandboxRef: "box-1",
        sampleRef: null,
      });
      expect(provisions).toStrictEqual([{ step: "provision", task: firstProvision }]);
      expect(samples).toStrictEqual([]);
    }),
  );

  it.effect("reuses the current sandbox and takes the requested sample into it", () =>
    Effect.gen(function* () {
      const { settled, provisions, samples } = yield* runProvision(
        { provisioner: { results: [sandbox] }, sampler: { results: [sample] } },
        sampleRequestedInput,
      );
      expect(settled.output).toStrictEqual({
        _tag: "provisioned",
        sandboxRef: "box-1",
        sampleRef: "sample-1",
      });
      expect(provisions).toStrictEqual([
        { step: "provision", task: { ...firstProvision, previousSandboxRef: "box-1" } },
      ]);
      expect(samples).toStrictEqual([firstSample]);
    }),
  );

  it.effect("fails as SampleAwaitingRun when the user must run the extraction script first", () =>
    Effect.gen(function* () {
      const { settled } = yield* runProvision(
        { provisioner: { results: [sandbox] }, sampler: { results: [awaitingRun] } },
        sampleRequestedInput,
      );
      expect(failureReasonOf(settled.error)).toStrictEqual({
        tag: "SampleAwaitingRun",
        message: "Review and run the extraction script script-1, then retry",
      });
    }),
  );

  it.effect("fails with the sampler's reason when the sampler gives up", () =>
    Effect.gen(function* () {
      const { settled } = yield* runProvision(
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

describeStageContract(
  portAdapter({
    name: "provision",
    port: provisionerPort,
    outcome: { _tag: "provisioned", sandboxRef: "box-1", sampleRef: null },
    run: (misbehaving) => runProvision({ provisioner: { results: [sandbox], misbehaving } }),
  }),
);
