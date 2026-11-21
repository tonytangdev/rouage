import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import {
  restoredWorkItem,
  reviewer,
  startWorkItem,
  throughJson,
} from "../../lifecycle/lifecycle-harness.ts";
import { describePortStageInLifecycle } from "../port-stage-lifecycle-contract.ts";
import { provisionerPort } from "./fake-provisioner.ts";
import {
  awaitingRun,
  firstProvision,
  firstSample,
  sample,
  sandbox,
  scriptedProvision,
} from "./provision-harness.ts";

const askForSample = { _tag: "needsSample", sampleRequest: "orders over 100" } as const;

describe("a work item in the Provision stage", () => {
  it.effect("goes on to Plan holding the reference to a feature's sandbox", () =>
    Effect.gen(function* () {
      const { provision } = yield* scriptedProvision({ provisioner: { results: [sandbox] } });
      const workItem = yield* startWorkItem({ provision });
      workItem.advanceTo("provision", { kind: "feature" });
      yield* workItem.reaches("plan");
      expect(workItem.context().facts.sandboxRef).toStrictEqual("box-1");
    }),
  );

  it.effect("takes the sample Reproduce asks for into the sandbox and hands it to Reproduce", () =>
    Effect.gen(function* () {
      const { provisioner, provision } = yield* scriptedProvision({
        provisioner: { results: [sandbox, sandbox] },
        sampler: { results: [sample] },
      });
      const workItem = yield* startWorkItem({ provision });
      workItem.advanceTo("provision", { kind: "bug" });
      yield* workItem.reaches("reproduce");
      workItem.finish("reproduce", askForSample);
      yield* workItem.reaches("reproduce");
      expect(workItem.stageInput("reproduce")).toMatchObject({
        sandboxRef: "box-1",
        sampleRef: "sample-1",
      });
      expect(provisioner.calls().at(-1)).toStrictEqual({
        step: "provision",
        task: { ...firstProvision, previousSandboxRef: "box-1" },
      });
    }),
  );

  it.effect("blocks until the user runs the extraction script, then samples on retry", () =>
    Effect.gen(function* () {
      const { sampler, provision } = yield* scriptedProvision({
        provisioner: { results: [sandbox, sandbox, sandbox] },
        sampler: { results: [awaitingRun, sample] },
      });
      const workItem = yield* startWorkItem({ provision });
      workItem.advanceTo("provision", { kind: "bug" });
      yield* workItem.reaches("reproduce");
      workItem.finish("reproduce", askForSample);
      yield* workItem.reaches("blocked");
      expect(workItem.context().blocked).toStrictEqual({
        from: "provision",
        reason: {
          tag: "SampleAwaitingRun",
          message: "Review and run the extraction script script-1, then retry",
        },
      });
      workItem.send({ type: "retry", ...reviewer });
      yield* workItem.reaches("reproduce");
      expect(workItem.context().facts.sampleRef).toStrictEqual("sample-1");
      expect(sampler.tasks()).toStrictEqual([firstSample, firstSample]);
    }),
  );

  it.effect(
    "provisions and samples again when restored mid-sampling, in case the sandbox was lost",
    () =>
      Effect.gen(function* () {
        const before = yield* scriptedProvision({
          provisioner: { results: [sandbox, sandbox] },
          sampler: { results: [], misbehaving: { step: "sample", as: "hanging" } },
        });
        const original = yield* startWorkItem({ provision: before.provision });
        original.advanceTo("provision", { kind: "bug" });
        yield* original.reaches("reproduce");
        original.finish("reproduce", askForSample);
        yield* before.sampler.started("sample");
        const after = yield* scriptedProvision({
          provisioner: { results: [sandbox] },
          sampler: { results: [sample] },
        });
        const workItem = yield* restoredWorkItem(throughJson(original.save()), {
          provision: after.provision,
        });
        yield* workItem.reaches("reproduce");
        expect(after.sampler.tasks()).toStrictEqual([firstSample]);
        expect(after.provisioner.calls()).toStrictEqual([
          { step: "provision", task: { ...firstProvision, previousSandboxRef: "box-1" } },
        ]);
        expect(workItem.context().facts.sampleRef).toStrictEqual("sample-1");
      }),
  );
});

describePortStageInLifecycle({
  name: "provision",
  port: provisionerPort,
  scripted: (misbehaving) =>
    Effect.map(
      scriptedProvision({ provisioner: { results: [sandbox], misbehaving } }),
      ({ provisioner, provision }) => ({ fake: provisioner, stage: provision }),
    ),
  next: "plan",
  firstTask: firstProvision,
});
