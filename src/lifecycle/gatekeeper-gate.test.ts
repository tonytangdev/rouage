import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { fakeGatekeeper } from "./fake-gatekeeper.ts";
import { inputAfter, restoredWorkItem, startWorkItem, throughJson } from "./lifecycle-harness.ts";
import { reviewer } from "./test-fixtures.ts";

// A macrotask, so every promise the gatekeeper settles with has settled.
const judged = Effect.promise(
  () =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    }),
);

describe("a gate kept by a plugin", () => {
  it.effect("moves on when its gatekeeper approves, recording the gatekeeper as deciding", () =>
    Effect.gen(function* () {
      const gatekeeper = fakeGatekeeper({ answers: [{ _tag: "approved" }] });
      const workItem = yield* startWorkItem({ gatekeepers: { specGate: "plugin" }, gatekeeper });
      workItem.advanceTo("specGate");
      yield* workItem.reaches("provision");
      expect(workItem.context().decisions).toMatchObject([
        { action: "approve", state: "specGate", by: "plugin", comment: null },
      ]);
    }),
  );

  it.effect("sends a rejected spec back to Spec with the gatekeeper's comment as feedback", () =>
    Effect.gen(function* () {
      const gatekeeper = fakeGatekeeper({
        answers: [{ _tag: "rejected", comment: "missing edge case" }],
      });
      const workItem = yield* startWorkItem({ gatekeepers: { specGate: "plugin" }, gatekeeper });
      workItem.advanceTo("specGate");
      yield* workItem.reaches("spec");
      expect(workItem.stageInput("spec")).toStrictEqual(
        inputAfter("spec", {}, { feedback: "missing edge case" }),
      );
      expect(workItem.context().decisions).toMatchObject([
        { action: "reject", state: "specGate", by: "plugin", comment: "missing edge case" },
      ]);
    }),
  );

  it.effect("asks its gatekeeper to decide from the gate and the work item's facts", () =>
    Effect.gen(function* () {
      const gatekeeper = fakeGatekeeper({ answers: [{ _tag: "approved" }] });
      const workItem = yield* startWorkItem({
        gatekeepers: { shipGate: "pluginMayHandOff" },
        gatekeeper,
      });
      workItem.advanceTo("shipGate");
      yield* workItem.reaches("ship");
      expect(gatekeeper.tasks()).toStrictEqual([{ gate: "shipGate", ...inputAfter("review") }]);
      expect(workItem.context().decisions.at(-1)).toMatchObject({
        action: "approve",
        state: "shipGate",
        by: "pluginMayHandOff",
      });
    }),
  );

  it.effect("waits for a human when its gatekeeper hands the decision off", () =>
    Effect.gen(function* () {
      const gatekeeper = fakeGatekeeper({
        answers: [{ _tag: "handedOff", reason: "touches payments" }],
      });
      const workItem = yield* startWorkItem({
        gatekeepers: { specGate: "pluginMayHandOff" },
        gatekeeper,
      });
      workItem.advanceTo("specGate");
      yield* judged;
      expect(workItem.state()).toStrictEqual("specGate");
      expect(workItem.context().handOff).toStrictEqual({
        gate: "specGate",
        reason: "touches payments",
      });
      workItem.send({ type: "approve", ...reviewer });
      expect(workItem.state()).toStrictEqual("provision");
      expect(workItem.context().handOff).toBeNull();
    }),
  );

  it.effect("waits for a human, unblocked, when its gatekeeper gives up", () =>
    Effect.gen(function* () {
      const gatekeeper = fakeGatekeeper({ answers: [], givesUp: true });
      const workItem = yield* startWorkItem({ gatekeepers: { specGate: "plugin" }, gatekeeper });
      workItem.advanceTo("specGate");
      yield* judged;
      expect(gatekeeper.tasks()).toHaveLength(1);
      expect(workItem.state()).toStrictEqual("specGate");
      expect(workItem.context().blocked).toBeNull();
      expect(workItem.context().handOff).toStrictEqual({
        gate: "specGate",
        reason: "The gatekeeper gave up",
      });
    }),
  );

  it.effect("waits for a human when a gatekeeper that may not hand off hands off", () =>
    Effect.gen(function* () {
      const gatekeeper = fakeGatekeeper({
        answers: [{ _tag: "handedOff", reason: "touches payments" }],
      });
      const workItem = yield* startWorkItem({ gatekeepers: { shipGate: "plugin" }, gatekeeper });
      workItem.advanceTo("shipGate");
      yield* judged;
      expect(workItem.state()).toStrictEqual("shipGate");
      expect(workItem.context().blocked).toBeNull();
      expect(workItem.context().handOff).toStrictEqual({
        gate: "shipGate",
        reason: "The gatekeeper may not hand off, yet handed off: touches payments",
      });
    }),
  );

  it.effect("takes a human's decision while its gatekeeper judges, and stops the judgement", () =>
    Effect.gen(function* () {
      const gatekeeper = fakeGatekeeper({ answers: [], judgesForever: true });
      const workItem = yield* startWorkItem({ gatekeepers: { specGate: "plugin" }, gatekeeper });
      workItem.advanceTo("specGate");
      yield* judged;
      expect(gatekeeper.judging()).toStrictEqual(1);
      workItem.send({ type: "reject", ...reviewer, comment: "too vague" });
      yield* judged;
      expect(gatekeeper.judging()).toStrictEqual(0);
      expect(workItem.state()).toStrictEqual("spec");
      expect(workItem.context().decisions).toMatchObject([
        { action: "reject", state: "specGate", by: reviewer.by, comment: "too vague" },
      ]);
    }),
  );

  it.effect("lets a human send the work item back to Spec after its gatekeeper approved", () =>
    Effect.gen(function* () {
      const gatekeeper = fakeGatekeeper({ answers: [{ _tag: "approved" }] });
      const workItem = yield* startWorkItem({ gatekeepers: { specGate: "plugin" }, gatekeeper });
      workItem.advanceTo("specGate");
      yield* workItem.reaches("provision");
      workItem.crash("provision", "no sandbox");
      expect(workItem.state()).toStrictEqual("blocked");
      workItem.send({ type: "backToSpec", ...reviewer });
      expect(workItem.state()).toStrictEqual("spec");
    }),
  );

  it.effect("lets a human cancel while its gatekeeper judges", () =>
    Effect.gen(function* () {
      const gatekeeper = fakeGatekeeper({ answers: [], judgesForever: true });
      const workItem = yield* startWorkItem({ gatekeepers: { specGate: "plugin" }, gatekeeper });
      workItem.advanceTo("specGate");
      yield* judged;
      workItem.send({ type: "cancel", ...reviewer });
      yield* judged;
      expect(workItem.state()).toStrictEqual("cancelled");
      expect(gatekeeper.judging()).toStrictEqual(0);
    }),
  );

  it.effect("waits for a human when no gatekeeper plugin is provided", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItem({ gatekeepers: { specGate: "plugin" } });
      workItem.advanceTo("specGate");
      yield* judged;
      expect(workItem.state()).toStrictEqual("specGate");
      expect(workItem.context().blocked).toBeNull();
    }),
  );

  it.effect("keeps its gatekeeper when restored, and asks it again", () =>
    Effect.gen(function* () {
      const original = yield* startWorkItem({
        gatekeepers: { specGate: "plugin" },
        gatekeeper: fakeGatekeeper({ answers: [{ _tag: "handedOff", reason: "unsure" }] }),
      });
      original.advanceTo("specGate");
      const saved = throughJson(original.save());
      const gatekeeper = fakeGatekeeper({ answers: [{ _tag: "approved" }] });
      const workItem = yield* restoredWorkItem(saved, { gatekeeper });
      yield* workItem.reaches("provision");
      expect(workItem.context().gatekeepers).toStrictEqual({
        specGate: "plugin",
        sampleGate: "human",
        shipGate: "human",
      });
    }),
  );
});

describe("a gate kept by a human", () => {
  it.effect("waits for the human without asking the gatekeeper", () =>
    Effect.gen(function* () {
      const gatekeeper = fakeGatekeeper({ answers: [] });
      const workItem = yield* startWorkItem({ gatekeeper });
      workItem.advanceTo("specGate");
      yield* judged;
      workItem.send({ type: "approve", ...reviewer });
      expect(gatekeeper.tasks()).toStrictEqual([]);
    }),
  );
});
