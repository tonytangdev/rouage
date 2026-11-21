import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { describeStageContract } from "../../lifecycle/stage-contract.ts";
import { failureReasonOf } from "../../lifecycle/stage.ts";
import { portAdapter } from "../port-stage-contract.ts";
import { builtFeature, firstDemo, firstDemoMade, runDemo } from "./demo-harness.ts";
import { demonstratorPort } from "./fake-demonstrator.ts";

describe("demo stage", () => {
  it.effect("finishes with the demonstrator's demo", () =>
    Effect.gen(function* () {
      const { settled, tasks } = yield* runDemo({ demos: [firstDemoMade] });
      expect(settled.output).toStrictEqual({ _tag: "demonstrated", demoRef: "demo-1" });
      expect(tasks).toStrictEqual([firstDemo]);
    }),
  );

  it.effect("revises the previous demo, given the bug's reproduction", () =>
    Effect.gen(function* () {
      const { tasks } = yield* runDemo(
        { demos: [{ demoRef: "demo-2" }] },
        { ...builtFeature, kind: "bug", reproductionRef: "repro-1", demoRef: "demo-1" },
      );
      expect(tasks).toStrictEqual([
        { ...firstDemo, kind: "bug", reproductionRef: "repro-1", previousDemoRef: "demo-1" },
      ]);
    }),
  );

  it.effect("fails without asking the demonstrator when there is no sandbox", () =>
    Effect.gen(function* () {
      const { settled, tasks } = yield* runDemo(
        { demos: [firstDemoMade] },
        { ...builtFeature, sandboxRef: null },
      );
      expect(failureReasonOf(settled.error).tag).toStrictEqual("SandboxMissing");
      expect(tasks).toStrictEqual([]);
    }),
  );
});

describeStageContract(
  portAdapter({
    name: "demo",
    port: demonstratorPort,
    outcome: { _tag: "demonstrated", demoRef: "demo-1" },
    run: (misbehaving) => runDemo({ demos: [firstDemoMade], misbehaving }),
  }),
);
