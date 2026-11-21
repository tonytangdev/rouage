import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import type { Route, Waypoint } from "./lifecycle-harness.ts";
import {
  goldenRefs,
  inputAfter,
  reviewer,
  stageInputWith,
  startWorkItem,
} from "./lifecycle-harness.ts";
import { defaultLifecycle } from "./lifecycle.ts";
import { createWorkItem } from "./work-item-actor.ts";

const startAt = Effect.fnUntraced(function* (waypoint: Waypoint, route: Route = {}) {
  const workItem = yield* startWorkItem();
  workItem.advanceTo(waypoint, route);
  return workItem;
});

describe("lifecycle", () => {
  it.effect("blocks a work item on a stage nothing implements", () =>
    Effect.gen(function* () {
      const workItem = yield* createWorkItem(defaultLifecycle, {
        id: goldenRefs.workItemId,
        issueRef: goldenRefs.issueRef,
      });
      yield* workItem.reaches("blocked");
      expect(workItem.context().blocked).toStrictEqual({
        from: "intake",
        reason: { tag: "StageNotProvided", message: "No implementation for the intake stage" },
      });
    }),
  );

  it.effect("moves a classified work item from Intake to Spec", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItem();
      workItem.finish("intake", { _tag: "classified", kind: "bug" });
      expect(workItem.stage()).toStrictEqual("spec");
      expect(workItem.context().facts.kind).toStrictEqual("bug");
    }),
  );

  it.effect(
    "gives a comment sent back from Blocked to an unclassified work item to Intake only",
    () =>
      Effect.gen(function* () {
        const workItem = yield* startWorkItem();
        workItem.fail("intake", { tag: "ClassifierGaveUp", message: "unclear issue" });
        workItem.send({ type: "backToSpec", ...reviewer, comment: "It is a feature" });
        workItem.finish("intake", { _tag: "classified", kind: "feature" });
        expect(workItem.stageInput("spec")).toStrictEqual(inputAfter("intake"));
      }),
  );

  it.effect("waits at the spec gate until a human approves, and records the decision", () =>
    Effect.gen(function* () {
      const workItem = yield* startAt("specGate", { kind: "bug" });
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
      const workItem = yield* startAt("specGate", { kind: "bug" });
      workItem.send({ type: "reject", ...reviewer, comment: "missing edge case" });
      expect(workItem.stage()).toStrictEqual("spec");
      expect(workItem.stageInput("spec")).toStrictEqual(
        inputAfter("spec", { kind: "bug" }, { feedback: "missing edge case" }),
      );
    }),
  );

  it.effect("passes the written spec on to the stages after Spec", () =>
    Effect.gen(function* () {
      const workItem = yield* startAt("provision", { kind: "feature" });
      expect(workItem.stageInput("provision")).toStrictEqual(
        stageInputWith({ kind: "feature", specRef: "spec-1" }),
      );
    }),
  );

  it.effect("sends a bug from Provision to Reproduce, then to Plan with its reproduction", () =>
    Effect.gen(function* () {
      const workItem = yield* startAt("provision", { kind: "bug" });
      workItem.finish("provision", { _tag: "provisioned", sandboxRef: "box-1", sampleRef: null });
      expect(workItem.stage()).toStrictEqual("reproduce");
      workItem.finish("reproduce", { _tag: "reproduced", reproductionRef: "repro-1" });
      expect(workItem.stage()).toStrictEqual("plan");
      expect(workItem.stageInput("plan")).toMatchObject({ reproductionRef: "repro-1" });
    }),
  );

  it.effect("sends a feature from Provision straight to Plan", () =>
    Effect.gen(function* () {
      const workItem = yield* startAt("provision", { kind: "feature" });
      workItem.finish("provision", { _tag: "provisioned", sandboxRef: "box-1", sampleRef: null });
      expect(workItem.stage()).toStrictEqual("plan");
    }),
  );

  it.effect("blocks a bug that cannot be reproduced, and a human can send it back to Spec", () =>
    Effect.gen(function* () {
      const workItem = yield* startAt("provision", { kind: "bug" });
      workItem.finish("provision", { _tag: "provisioned", sandboxRef: "box-1", sampleRef: null });
      workItem.finish("reproduce", { _tag: "cannotReproduce", reason: "works on staging" });
      expect(workItem.stage()).toStrictEqual("blocked");
      expect(workItem.context().blocked).toStrictEqual({
        from: "reproduce",
        reason: { tag: "CannotReproduce", message: "works on staging" },
      });
      workItem.send({ type: "backToSpec", ...reviewer, comment: "clarify the steps" });
      expect(workItem.stage()).toStrictEqual("spec");
      expect(workItem.context().blocked).toBeNull();
      expect(workItem.stageInput("spec")).toStrictEqual(
        inputAfter("provision", { kind: "bug" }, { feedback: "clarify the steps" }),
      );
    }),
  );

  it.effect(
    "passes Reproduce's sample request to Provision, and the sample it took to Reproduce",
    () =>
      Effect.gen(function* () {
        const workItem = yield* startAt("provision", { kind: "bug" });
        workItem.finish("provision", { _tag: "provisioned", sandboxRef: "box-1", sampleRef: null });
        workItem.finish("reproduce", { _tag: "needsSample", sampleRequest: "orders over 100" });
        expect(workItem.stageInput("provision")).toMatchObject({
          sandboxRef: "box-1",
          sampleRequest: "orders over 100",
          sampleRef: null,
        });
        workItem.finish("provision", {
          _tag: "provisioned",
          sandboxRef: "box-1",
          sampleRef: "s-1",
        });
        expect(workItem.stageInput("reproduce")).toStrictEqual(
          inputAfter(
            "provision",
            { kind: "bug" },
            { sampleRequest: "orders over 100", sampleRef: "s-1" },
          ),
        );
      }),
  );

  it.effect(
    "goes back to Provision for a sample, and blocks once the reproduce loop limit is reached",
    () =>
      Effect.gen(function* () {
        const workItem = yield* startAt("provision", { kind: "bug" });
        const askForSample = () => {
          workItem.finish("provision", {
            _tag: "provisioned",
            sandboxRef: "box-1",
            sampleRef: null,
          });
          workItem.finish("reproduce", { _tag: "needsSample", sampleRequest: "orders over 100" });
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
        const workItem = yield* startAt("provision", { kind: "bug" });
        workItem.finish("provision", { _tag: "provisioned", sandboxRef: "box-1", sampleRef: null });
        workItem.finish("reproduce", { _tag: "needsSample", sampleRequest: "orders over 100" });
        workItem.fail("provision", { tag: "SandboxUnavailable", message: "docker is not running" });
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

  it.effect("passes the plan and its demo decision on to Build", () =>
    Effect.gen(function* () {
      const workItem = yield* startAt("plan", { kind: "feature" });
      workItem.finish("plan", { _tag: "planned", planRef: "plan-1", demo: true });
      expect(workItem.stageInput("build")).toStrictEqual(
        stageInputWith({
          kind: "feature",
          specRef: "spec-1",
          sandboxRef: "box-1",
          planRef: "plan-1",
          demoPlanned: true,
        }),
      );
    }),
  );

  it.effect("runs a planned demo between Build and Review", () =>
    Effect.gen(function* () {
      const workItem = yield* startAt("build", { demo: true });
      expect(workItem.stage()).toStrictEqual("build");
      workItem.finish("build", { _tag: "built" });
      expect(workItem.stage()).toStrictEqual("demo");
      workItem.finish("demo", { _tag: "demonstrated", demoRef: "demo-1" });
      expect(workItem.stage()).toStrictEqual("review");
    }),
  );

  it.effect("passes the demo on to Review", () =>
    Effect.gen(function* () {
      const workItem = yield* startAt("demo", { demo: true });
      workItem.finish("demo", { _tag: "demonstrated", demoRef: "demo-1" });
      expect(workItem.stageInput("review")).toStrictEqual(
        stageInputWith({
          kind: "feature",
          specRef: "spec-1",
          sandboxRef: "box-1",
          planRef: "plan-1",
          demoPlanned: true,
          demoRef: "demo-1",
        }),
      );
    }),
  );

  it.effect("skips the demo when none is planned", () =>
    Effect.gen(function* () {
      const workItem = yield* startAt("build", { demo: false });
      workItem.finish("build", { _tag: "built" });
      expect(workItem.stage()).toStrictEqual("review");
    }),
  );

  it.effect(
    "sends requested changes back to Build, and blocks once the review loop limit is reached",
    () =>
      Effect.gen(function* () {
        const workItem = yield* startAt("build", { demo: false });
        const requestChanges = () => {
          workItem.finish("build", { _tag: "built" });
          workItem.finish("review", { _tag: "changesRequested", feedback: "rename the flag" });
        };
        requestChanges();
        expect(workItem.stage()).toStrictEqual("build");
        expect(workItem.stageInput("build")).toStrictEqual(
          inputAfter("review", {}, { feedback: "rename the flag" }),
        );
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

  it.effect("keeps a bug's references when a later decision sets other facts", () =>
    Effect.gen(function* () {
      const workItem = yield* startAt("shipGate", { kind: "bug" });
      workItem.send({ type: "reject", ...reviewer, comment: "the flag is still on" });
      expect(workItem.stageInput("build")).toStrictEqual(
        stageInputWith({
          kind: "bug",
          feedback: "the flag is still on",
          specRef: "spec-1",
          sandboxRef: "box-1",
          reproductionRef: "repro-1",
          planRef: "plan-1",
          demoPlanned: false,
        }),
      );
    }),
  );

  it.effect("ships an approved change once a human approves the ship gate", () =>
    Effect.gen(function* () {
      const workItem = yield* startAt("shipGate");
      expect(workItem.stage()).toStrictEqual("shipGate");
      workItem.send({ type: "approve", ...reviewer });
      expect(workItem.stage()).toStrictEqual("ship");
      workItem.finish("ship", { _tag: "shipped", deliveryRef: "pr-1" });
      expect(workItem.stage()).toStrictEqual("shipped");
      expect(workItem.status()).toStrictEqual("done");
      expect(workItem.context().facts).toMatchObject({ deliveryRef: "pr-1" });
    }),
  );

  it.effect("sends a change rejected at the ship gate back to Build with the comment", () =>
    Effect.gen(function* () {
      const workItem = yield* startAt("shipGate");
      workItem.send({ type: "reject", ...reviewer, comment: "wait for the release freeze" });
      expect(workItem.stage()).toStrictEqual("build");
      expect(workItem.stageInput("build")).toStrictEqual(
        inputAfter("review", {}, { feedback: "wait for the release freeze" }),
      );
    }),
  );

  it.effect(
    "cancels from any stage, stops the running stage machine and records who cancelled",
    () =>
      Effect.gen(function* () {
        const workItem = yield* startAt("build", { demo: false });
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
      const workItem = yield* startAt("specGate", { kind: "bug" });
      workItem.send({ type: "cancel", ...reviewer });
      expect(workItem.stage()).toStrictEqual("cancelled");
      expect(workItem.context().decisions.at(-1)?.state).toStrictEqual("specGate");
    }),
  );

  it.effect("sends an unclassified work item back to Intake rather than to Spec", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItem();
      workItem.fail("intake", { tag: "IssueUnreadable", message: "the issue body is empty" });
      workItem.send({ type: "backToSpec", ...reviewer, comment: "body filled in" });
      expect(workItem.stage()).toStrictEqual("intake");
      expect(workItem.stageInput("intake")).toStrictEqual(
        stageInputWith({ feedback: "body filled in" }),
      );
    }),
  );
});
