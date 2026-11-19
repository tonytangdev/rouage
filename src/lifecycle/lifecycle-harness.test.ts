import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { StageNotRunning, startWorkItem } from "./lifecycle-harness.ts";

describe("lifecycle harness", () => {
  it.effect("fails at once when a test finishes a stage the work item is not in", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItem();
      expect(() => {
        workItem.finish("spec", { _tag: "written", specRef: "spec-1" });
      }).toThrow(StageNotRunning);
    }),
  );

  it.effect("advances a bug with a demo through Reproduce and Demo to the ship gate", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItem();
      workItem.advanceTo("shipGate", { kind: "bug", demo: true });
      expect(workItem.stage()).toStrictEqual("shipGate");
      expect(workItem.context()).toMatchObject({
        kind: "bug",
        demoPlanned: true,
        specRef: "spec-1",
      });
      expect(workItem.context().decisions.map((decision) => decision.state)).toStrictEqual([
        "specGate",
      ]);
    }),
  );

  it.effect("advances a feature to Plan without reproducing it", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItem();
      workItem.advanceTo("plan", { kind: "feature" });
      expect(workItem.stage()).toStrictEqual("plan");
    }),
  );
});
