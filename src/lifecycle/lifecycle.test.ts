import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { startWorkItem } from "./lifecycle-harness.ts";

const reviewer = { by: "ada", at: "2026-11-19T10:00:00.000Z" };

const startAtSpecGate = Effect.fnUntraced(function* () {
  const workItem = yield* startWorkItem();
  workItem.finish("intake", { _tag: "classified", kind: "bug" });
  workItem.finish("spec", { _tag: "written" });
  return workItem;
});

const startAtProvision = Effect.fnUntraced(function* (kind: "bug" | "feature") {
  const workItem = yield* startWorkItem();
  workItem.finish("intake", { _tag: "classified", kind });
  workItem.finish("spec", { _tag: "written" });
  workItem.send({ type: "approve", ...reviewer });
  return workItem;
});

const startAtBuild = Effect.fnUntraced(function* (demo: boolean) {
  const workItem = yield* startAtProvision("feature");
  workItem.finish("provision", { _tag: "provisioned" });
  workItem.finish("plan", { _tag: "planned", demo });
  return workItem;
});

const startAtShipGate = Effect.fnUntraced(function* () {
  const workItem = yield* startAtBuild(false);
  workItem.finish("build", { _tag: "built" });
  workItem.finish("review", { _tag: "approved" });
  return workItem;
});

describe("lifecycle", () => {
  it.effect("moves a classified work item from Intake to Spec", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItem();
      workItem.finish("intake", { _tag: "classified", kind: "bug" });
      expect(workItem.stage()).toStrictEqual("spec");
      expect(workItem.context().kind).toStrictEqual("bug");
    }),
  );

  it.effect("waits at the spec gate until a human approves, and records the decision", () =>
    Effect.gen(function* () {
      const workItem = yield* startAtSpecGate();
      expect(workItem.stage()).toStrictEqual("specGate");
      workItem.send({ type: "approve", ...reviewer, comment: "looks right" });
      expect(workItem.stage()).toStrictEqual("provision");
      expect(workItem.context().decisions).toStrictEqual([
        {
          action: "approve",
          state: "specGate",
          by: "ada",
          at: reviewer.at,
          comment: "looks right",
        },
      ]);
    }),
  );

  it.effect("sends a rejected spec back to Spec with the reviewer's comment as feedback", () =>
    Effect.gen(function* () {
      const workItem = yield* startAtSpecGate();
      workItem.send({ type: "reject", ...reviewer, comment: "missing edge case" });
      expect(workItem.stage()).toStrictEqual("spec");
      expect(workItem.stageInput("spec")).toStrictEqual({
        workItemId: "wi-1",
        kind: "bug",
        feedback: "missing edge case",
      });
    }),
  );

  it.effect("sends a bug from Provision to Reproduce, then to Plan once reproduced", () =>
    Effect.gen(function* () {
      const workItem = yield* startAtProvision("bug");
      workItem.finish("provision", { _tag: "provisioned" });
      expect(workItem.stage()).toStrictEqual("reproduce");
      workItem.finish("reproduce", { _tag: "reproduced" });
      expect(workItem.stage()).toStrictEqual("plan");
    }),
  );

  it.effect("sends a feature from Provision straight to Plan", () =>
    Effect.gen(function* () {
      const workItem = yield* startAtProvision("feature");
      workItem.finish("provision", { _tag: "provisioned" });
      expect(workItem.stage()).toStrictEqual("plan");
    }),
  );

  it.effect("blocks a bug that cannot be reproduced, and a human can send it back to Spec", () =>
    Effect.gen(function* () {
      const workItem = yield* startAtProvision("bug");
      workItem.finish("provision", { _tag: "provisioned" });
      workItem.finish("reproduce", { _tag: "cannotReproduce", reason: "works on staging" });
      expect(workItem.stage()).toStrictEqual("blocked");
      expect(workItem.context().blocked).toStrictEqual({
        from: "reproduce",
        reason: { tag: "CannotReproduce", message: "works on staging" },
      });
      workItem.send({ type: "backToSpec", ...reviewer, comment: "clarify the steps" });
      expect(workItem.stage()).toStrictEqual("spec");
      expect(workItem.context().blocked).toBeNull();
      expect(workItem.stageInput("spec")).toStrictEqual({
        workItemId: "wi-1",
        kind: "bug",
        feedback: "clarify the steps",
      });
    }),
  );

  it.effect(
    "goes back to Provision for a sample, and blocks once the reproduce loop limit is reached",
    () =>
      Effect.gen(function* () {
        const workItem = yield* startAtProvision("bug");
        const askForSample = () => {
          workItem.finish("provision", { _tag: "provisioned" });
          workItem.finish("reproduce", { _tag: "needsSample" });
        };
        askForSample();
        expect(workItem.stage()).toStrictEqual("provision");
        askForSample();
        askForSample();
        expect(workItem.stage()).toStrictEqual("provision");
        askForSample();
        expect(workItem.stage()).toStrictEqual("blocked");
        expect(workItem.context().blocked).toStrictEqual({
          from: "reproduce",
          reason: { tag: "LoopLimitReached", message: "Reproduce went back to Provision 3 times" },
        });
      }),
  );

  it.effect(
    "blocks a failed stage, and retrying re-enters that stage with fresh loop counters",
    () =>
      Effect.gen(function* () {
        const workItem = yield* startAtProvision("bug");
        workItem.finish("provision", { _tag: "provisioned" });
        workItem.finish("reproduce", { _tag: "needsSample" });
        workItem.finish("provision", {
          _tag: "failed",
          reason: { tag: "SandboxUnavailable", message: "docker is not running" },
        });
        expect(workItem.stage()).toStrictEqual("blocked");
        expect(workItem.context().blocked).toStrictEqual({
          from: "provision",
          reason: { tag: "SandboxUnavailable", message: "docker is not running" },
        });
        workItem.send({ type: "retry", ...reviewer });
        expect(workItem.stage()).toStrictEqual("provision");
        expect(workItem.context().counters).toStrictEqual({ review: 0, reproduce: 0 });
        expect(workItem.context().decisions.at(-1)).toStrictEqual({
          action: "retry",
          state: "blocked",
          by: "ada",
          at: reviewer.at,
          comment: null,
        });
      }),
  );

  it.effect("runs a planned demo between Build and Review", () =>
    Effect.gen(function* () {
      const workItem = yield* startAtBuild(true);
      expect(workItem.stage()).toStrictEqual("build");
      workItem.finish("build", { _tag: "built" });
      expect(workItem.stage()).toStrictEqual("demo");
      workItem.finish("demo", { _tag: "demonstrated" });
      expect(workItem.stage()).toStrictEqual("review");
    }),
  );

  it.effect("skips the demo when none is planned", () =>
    Effect.gen(function* () {
      const workItem = yield* startAtBuild(false);
      workItem.finish("build", { _tag: "built" });
      expect(workItem.stage()).toStrictEqual("review");
    }),
  );

  it.effect(
    "sends requested changes back to Build, and blocks once the review loop limit is reached",
    () =>
      Effect.gen(function* () {
        const workItem = yield* startAtBuild(false);
        const requestChanges = () => {
          workItem.finish("build", { _tag: "built" });
          workItem.finish("review", { _tag: "changesRequested", feedback: "rename the flag" });
        };
        requestChanges();
        expect(workItem.stage()).toStrictEqual("build");
        expect(workItem.stageInput("build")).toStrictEqual({
          workItemId: "wi-1",
          kind: "feature",
          feedback: "rename the flag",
        });
        requestChanges();
        requestChanges();
        requestChanges();
        expect(workItem.stage()).toStrictEqual("blocked");
        expect(workItem.context().blocked).toStrictEqual({
          from: "review",
          reason: {
            tag: "LoopLimitReached",
            message: "Review sent the change back to Build 3 times",
          },
        });
      }),
  );

  it.effect("ships an approved change once a human approves the ship gate", () =>
    Effect.gen(function* () {
      const workItem = yield* startAtShipGate();
      expect(workItem.stage()).toStrictEqual("shipGate");
      workItem.send({ type: "approve", ...reviewer });
      expect(workItem.stage()).toStrictEqual("ship");
      workItem.finish("ship", { _tag: "shipped" });
      expect(workItem.stage()).toStrictEqual("shipped");
      expect(workItem.status()).toStrictEqual("done");
    }),
  );

  it.effect("sends a change rejected at the ship gate back to Build with the comment", () =>
    Effect.gen(function* () {
      const workItem = yield* startAtShipGate();
      workItem.send({ type: "reject", ...reviewer, comment: "wait for the release freeze" });
      expect(workItem.stage()).toStrictEqual("build");
      expect(workItem.stageInput("build")).toStrictEqual({
        workItemId: "wi-1",
        kind: "feature",
        feedback: "wait for the release freeze",
      });
    }),
  );

  it.effect(
    "cancels from any stage, stops the running stage machine and records who cancelled",
    () =>
      Effect.gen(function* () {
        const workItem = yield* startAtBuild(false);
        workItem.send({ type: "cancel", ...reviewer, comment: "out of scope" });
        expect(workItem.stage()).toStrictEqual("cancelled");
        expect(workItem.status()).toStrictEqual("done");
        expect(workItem.stageInput("build")).toBeUndefined();
        expect(workItem.context().decisions.at(-1)).toStrictEqual({
          action: "cancel",
          state: "build",
          by: "ada",
          at: reviewer.at,
          comment: "out of scope",
        });
      }),
  );

  it.effect("blocks a work item whose stage machine crashes", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItem();
      workItem.crash("intake", "agent exited with code 1");
      expect(workItem.stage()).toStrictEqual("blocked");
      expect(workItem.context().blocked).toStrictEqual({
        from: "intake",
        reason: { tag: "StageCrashed", message: "agent exited with code 1" },
      });
    }),
  );

  it.effect("cancels a work item waiting at a gate", () =>
    Effect.gen(function* () {
      const workItem = yield* startAtSpecGate();
      workItem.send({ type: "cancel", ...reviewer });
      expect(workItem.stage()).toStrictEqual("cancelled");
      expect(workItem.context().decisions.at(-1)?.state).toStrictEqual("specGate");
    }),
  );
});
