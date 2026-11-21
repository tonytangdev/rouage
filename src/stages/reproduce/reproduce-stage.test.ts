import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { describeStageContract } from "../../lifecycle/stage-contract.ts";
import { failureReasonOf } from "../../lifecycle/stage.ts";
import { portAdapter } from "../port-stage-contract.ts";
import { reproducerPort } from "./fake-reproducer.ts";
import {
  captured,
  checkFailed,
  checkPassed,
  firstCapture,
  firstConfirm,
  provisionedInput,
  runReproduce,
} from "./reproduce-harness.ts";

describe("reproduce stage", () => {
  it.effect("finishes with the reproduction once its check fails in the sandbox", () =>
    Effect.gen(function* () {
      const { settled, calls } = yield* runReproduce({
        captures: [captured],
        confirmations: [checkFailed],
      });
      expect(settled.output).toStrictEqual({ _tag: "reproduced", reproductionRef: "repro-1" });
      expect(calls).toStrictEqual([
        { step: "capture", task: firstCapture },
        { step: "confirm", task: firstConfirm },
      ]);
    }),
  );

  it.effect("fails as ReproductionDidNotFail when the captured check passes", () =>
    Effect.gen(function* () {
      const { settled } = yield* runReproduce({
        captures: [captured],
        confirmations: [checkPassed],
      });
      expect(failureReasonOf(settled.error)).toStrictEqual({
        tag: "ReproductionDidNotFail",
        message:
          "The reproduction repro-1 passed, so it does not show the bug: 1 test passed: totals add VAT",
      });
    }),
  );

  it.effect("asks for a sample without confirming, given the sample and reproduction it had", () =>
    Effect.gen(function* () {
      const needsSample = { _tag: "needsSample", sampleRequest: "orders in EUR" } as const;
      const { settled, calls } = yield* runReproduce(
        { captures: [needsSample] },
        {
          ...provisionedInput,
          sampleRequest: "orders over 100",
          sampleRef: "sample-1",
          reproductionRef: "repro-0",
        },
      );
      expect(settled.output).toStrictEqual(needsSample);
      expect(calls).toStrictEqual([
        {
          step: "capture",
          task: {
            ...firstCapture,
            sampleRequest: "orders over 100",
            sampleRef: "sample-1",
            previousReproductionRef: "repro-0",
          },
        },
      ]);
    }),
  );

  it.effect("finishes as cannotReproduce with the reproducer's reason", () =>
    Effect.gen(function* () {
      const cannotReproduce = { _tag: "cannotReproduce", reason: "works on staging" } as const;
      const { settled } = yield* runReproduce({ captures: [cannotReproduce] });
      expect(settled.output).toStrictEqual(cannotReproduce);
    }),
  );

  it.effect("fails as SandboxMissing without asking the reproducer when there is no sandbox", () =>
    Effect.gen(function* () {
      const { settled, calls } = yield* runReproduce(
        { captures: [captured] },
        { ...provisionedInput, sandboxRef: null },
      );
      expect(failureReasonOf(settled.error)).toStrictEqual({
        tag: "SandboxMissing",
        message:
          "Reproduce started without a sandbox; send the work item back to Spec so Provision prepares one",
      });
      expect(calls).toStrictEqual([]);
    }),
  );
});

describeStageContract(
  portAdapter({
    name: "reproduce",
    port: reproducerPort,
    outcome: { _tag: "reproduced", reproductionRef: "repro-1" },
    run: (misbehaving) =>
      runReproduce({ captures: [captured], confirmations: [checkFailed], misbehaving }),
  }),
);
