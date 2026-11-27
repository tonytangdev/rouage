import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { fakeGatekeeper } from "../../lifecycle/fake-gatekeeper.ts";
import type { GatekeeperTask } from "../../lifecycle/gatekeeper.ts";
import { stageInputWith } from "../../lifecycle/test-fixtures.ts";
import { howBroken } from "../plugin-contract.ts";
import { describeGatekeeperContract, gatekeeperContract } from "./gatekeeper-contract.ts";

const atShipGate: GatekeeperTask = { gate: "shipGate", ...stageInputWith({ specRef: "spec-1" }) };

describeGatekeeperContract(
  "the fake gatekeeper",
  fakeGatekeeper({ answers: [{ _tag: "handedOff", reason: "The change touches billing" }] }).layer,
  atShipGate,
);

describe("the gatekeeper contract against a gatekeeper that breaks it", () => {
  it.effect("fails when the gatekeeper rejects without a comment", () =>
    Effect.gen(function* () {
      const error = yield* howBroken(
        gatekeeperContract(atShipGate).answersWithADecision,
        fakeGatekeeper({ answers: [{ _tag: "rejected", comment: "" }] }).layer,
      );
      expect(error).toMatchObject({ _tag: "PluginBrokeContract" });
    }),
  );

  it.effect("fails when the gatekeeper hands off without a reason", () =>
    Effect.gen(function* () {
      const error = yield* howBroken(
        gatekeeperContract(atShipGate).answersWithADecision,
        fakeGatekeeper({ answers: [{ _tag: "handedOff", reason: "" }] }).layer,
      );
      expect(error).toMatchObject({ _tag: "PluginBrokeContract" });
    }),
  );

  it.effect("fails when the gatekeeper has no name to record its decisions by", () =>
    Effect.gen(function* () {
      const error = yield* howBroken(
        gatekeeperContract(atShipGate).namesItself,
        fakeGatekeeper({ name: "", answers: [] }).layer,
      );
      expect(error).toMatchObject({ _tag: "PluginBrokeContract" });
    }),
  );
});
