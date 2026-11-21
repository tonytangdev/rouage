import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { fakeSandboxTeardown } from "./fake-sandbox-teardown.ts";
import { goldenRefs, inputAfter, reviewer, stageInputWith } from "./golden-route.ts";
import { startWorkItem, startWorkItemAt } from "./lifecycle-harness.ts";
import { defaultLifecycle } from "./lifecycle.ts";
import { createWorkItem } from "./work-item-actor.ts";

describe("lifecycle", () => {
  it.effect("blocks a work item on a stage nothing implements", () =>
    Effect.gen(function* () {
      const workItem = yield* createWorkItem(defaultLifecycle, {
        id: goldenRefs.workItemId,
        issueRef: goldenRefs.issueRef,
      }).pipe(Effect.provide(fakeSandboxTeardown().layer));
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
      expect(workItem.state()).toStrictEqual("spec");
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
      const workItem = yield* startWorkItemAt("specGate", { kind: "bug" });
      expect(workItem.state()).toStrictEqual("specGate");
      workItem.send({ type: "approve", ...reviewer, comment: "looks right" });
      expect(workItem.state()).toStrictEqual("provision");
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
      const workItem = yield* startWorkItemAt("specGate", { kind: "bug" });
      workItem.send({ type: "reject", ...reviewer, comment: "missing edge case" });
      expect(workItem.state()).toStrictEqual("spec");
      expect(workItem.stageInput("spec")).toStrictEqual(
        inputAfter("spec", { kind: "bug" }, { feedback: "missing edge case" }),
      );
    }),
  );

  it.effect("passes the written spec on to the stages after Spec", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItemAt("provision", { kind: "feature" });
      expect(workItem.stageInput("provision")).toStrictEqual(
        stageInputWith({ kind: "feature", specRef: "spec-1" }),
      );
    }),
  );

  it.effect("sends a bug from Provision to Reproduce, then to Plan with its reproduction", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItemAt("provision", { kind: "bug" });
      workItem.finish("provision", { _tag: "provisioned", sandboxRef: "box-1", sampleRef: null });
      expect(workItem.state()).toStrictEqual("reproduce");
      workItem.finish("reproduce", { _tag: "reproduced", reproductionRef: "repro-1" });
      expect(workItem.state()).toStrictEqual("plan");
      expect(workItem.stageInput("plan")).toMatchObject({ reproductionRef: "repro-1" });
    }),
  );

  it.effect("sends a feature from Provision straight to Plan", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItemAt("provision", { kind: "feature" });
      workItem.finish("provision", { _tag: "provisioned", sandboxRef: "box-1", sampleRef: null });
      expect(workItem.state()).toStrictEqual("plan");
    }),
  );

  it.effect(
    "clears the feedback Reproduce acted on when it finds the bug cannot be reproduced",
    () =>
      Effect.gen(function* () {
        const workItem = yield* startWorkItemAt("reproduce", { kind: "bug" });
        workItem.fail("reproduce", { tag: "ReproducerGaveUp", message: "the sandbox timed out" });
        workItem.send({ type: "retry", ...reviewer, comment: "use the staging data" });
        workItem.finish("reproduce", { _tag: "cannotReproduce", reason: "works on staging" });
        workItem.send({ type: "retry", ...reviewer });
        expect(workItem.stageInput("reproduce")?.feedback).toBeNull();
      }),
  );

  it.effect("blocks a bug that cannot be reproduced, and a human can send it back to Spec", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItemAt("provision", { kind: "bug" });
      workItem.finish("provision", { _tag: "provisioned", sandboxRef: "box-1", sampleRef: null });
      workItem.finish("reproduce", { _tag: "cannotReproduce", reason: "works on staging" });
      expect(workItem.state()).toStrictEqual("blocked");
      expect(workItem.context().blocked).toStrictEqual({
        from: "reproduce",
        reason: { tag: "CannotReproduce", message: "works on staging" },
      });
      workItem.send({ type: "backToSpec", ...reviewer, comment: "clarify the steps" });
      expect(workItem.state()).toStrictEqual("spec");
      expect(workItem.context().blocked).toBeNull();
      expect(workItem.stageInput("spec")).toStrictEqual(
        inputAfter("provision", { kind: "bug" }, { feedback: "clarify the steps" }),
      );
    }),
  );

  it.effect("blocks a bug whose check passed, keeping the reproduction for a retry to revise", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItemAt("reproduce", { kind: "bug" });
      workItem.finish("reproduce", {
        _tag: "checkPassed",
        reproductionRef: "repro-1",
        output: "1 test passed",
      });
      expect(workItem.context().blocked).toStrictEqual({
        from: "reproduce",
        reason: {
          tag: "ReproductionDidNotFail",
          message: "The reproduction repro-1 passed, so it does not show the bug: 1 test passed",
        },
      });
      workItem.send({ type: "retry", ...reviewer, comment: "the bug needs a logged-in user" });
      expect(workItem.stageInput("reproduce")).toStrictEqual(
        inputAfter(
          "provision",
          { kind: "bug" },
          { reproductionRef: "repro-1", feedback: "the bug needs a logged-in user" },
        ),
      );
    }),
  );

  it.effect(
    "runs Reproduce again before Plan when a bug whose check passed goes back to Spec",
    () =>
      Effect.gen(function* () {
        const workItem = yield* startWorkItemAt("reproduce", { kind: "bug" });
        workItem.finish("reproduce", {
          _tag: "checkPassed",
          reproductionRef: "repro-1",
          output: "1 test passed",
        });
        workItem.send({ type: "backToSpec", ...reviewer, comment: "the bug is in the export" });
        workItem.advanceTo("reproduce", { kind: "bug" });
        expect(workItem.stageInput("reproduce")?.reproductionRef).toStrictEqual("repro-1");
      }),
  );

  it.effect(
    "passes Reproduce's sample request to Provision, and the sample it took to Reproduce",
    () =>
      Effect.gen(function* () {
        const workItem = yield* startWorkItemAt("provision", { kind: "bug" });
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
        const workItem = yield* startWorkItemAt("provision", { kind: "bug" });
        const askForSample = () => {
          workItem.finish("provision", {
            _tag: "provisioned",
            sandboxRef: "box-1",
            sampleRef: null,
          });
          workItem.finish("reproduce", { _tag: "needsSample", sampleRequest: "orders over 100" });
        };
        askForSample();
        expect(workItem.state()).toStrictEqual("provision");
        askForSample();
        askForSample();
        expect(workItem.state()).toStrictEqual("provision");
        askForSample();
        expect(workItem.state()).toStrictEqual("blocked");
        expect(workItem.context().blocked).toStrictEqual({
          from: "reproduce",
          reason: { tag: "LoopLimitReached", message: "Reproduce went back to Provision 3 times" },
        });
      }),
  );

  it.effect(
    "waits at the sample gate for an extraction run, then approving sends it back to Provision with its loop count kept",
    () =>
      Effect.gen(function* () {
        const workItem = yield* startWorkItemAt("provision", { kind: "bug" });
        workItem.finish("provision", { _tag: "provisioned", sandboxRef: "box-1", sampleRef: null });
        workItem.finish("reproduce", { _tag: "needsSample", sampleRequest: "orders over 100" });
        workItem.finish("provision", {
          _tag: "awaitingRun",
          sandboxRef: "box-2",
          scriptRef: "script-1",
        });
        expect(workItem.state()).toStrictEqual("sampleGate");
        workItem.send({ type: "approve", ...reviewer });
        expect(workItem.state()).toStrictEqual("provision");
        expect(workItem.stageInput("provision")).toMatchObject({
          sandboxRef: "box-2",
          scriptRef: "script-1",
          feedback: null,
        });
        expect(workItem.context().counters).toStrictEqual({ review: 0, reproduce: 1 });
        expect(workItem.context().decisions.at(-1)).toMatchObject({
          action: "approve",
          state: "sampleGate",
        });
      }),
  );

  it.effect(
    "sends a rejected extraction script back to Provision with the comment as feedback",
    () =>
      Effect.gen(function* () {
        const workItem = yield* startWorkItemAt("provision", { kind: "bug" });
        workItem.finish("provision", { _tag: "provisioned", sandboxRef: "box-1", sampleRef: null });
        workItem.finish("reproduce", { _tag: "needsSample", sampleRequest: "orders over 100" });
        workItem.finish("provision", {
          _tag: "awaitingRun",
          sandboxRef: "box-1",
          scriptRef: "script-1",
        });
        workItem.send({ type: "reject", ...reviewer, comment: "leave out the emails" });
        expect(workItem.state()).toStrictEqual("provision");
        expect(workItem.stageInput("provision")).toMatchObject({
          scriptRef: "script-1",
          feedback: "leave out the emails",
        });
        workItem.finish("provision", {
          _tag: "provisioned",
          sandboxRef: "box-1",
          sampleRef: "s-1",
        });
        expect(workItem.context().facts.feedback).toBeNull();
      }),
  );

  it.effect(
    "blocks a failed stage, and retrying re-enters that stage with fresh loop counters",
    () =>
      Effect.gen(function* () {
        const workItem = yield* startWorkItemAt("provision", { kind: "bug" });
        workItem.finish("provision", { _tag: "provisioned", sandboxRef: "box-1", sampleRef: null });
        workItem.finish("reproduce", { _tag: "needsSample", sampleRequest: "orders over 100" });
        workItem.fail("provision", { tag: "SandboxUnavailable", message: "docker is not running" });
        expect(workItem.state()).toStrictEqual("blocked");
        expect(workItem.context().blocked).toStrictEqual({
          from: "provision",
          reason: { tag: "SandboxUnavailable", message: "docker is not running" },
        });
        workItem.send({ type: "retry", ...reviewer });
        expect(workItem.state()).toStrictEqual("provision");
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

  it.effect("gives a retry's comment to the stage it re-runs as feedback", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItemAt("plan");
      workItem.fail("plan", { tag: "PlannerGaveUp", message: "the spec is ambiguous" });
      workItem.send({ type: "retry", ...reviewer, comment: "totals exclude VAT" });
      expect(workItem.stageInput("plan")).toStrictEqual(
        inputAfter("provision", {}, { feedback: "totals exclude VAT" }),
      );
    }),
  );

  it.effect("keeps the feedback a failed stage never acted on when a retry has no comment", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItemAt("shipGate");
      workItem.send({ type: "reject", ...reviewer, comment: "wait for the release freeze" });
      workItem.fail("build", { tag: "BuilderGaveUp", message: "the build timed out" });
      workItem.send({ type: "retry", ...reviewer });
      expect(workItem.stageInput("build")).toStrictEqual(
        inputAfter("review", {}, { feedback: "wait for the release freeze" }),
      );
    }),
  );

  it.effect("passes the plan on to Build", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItemAt("plan", { kind: "feature" });
      workItem.finish("plan", { _tag: "planned", planRef: "plan-1", demo: true });
      expect(workItem.stageInput("build")).toStrictEqual(
        stageInputWith({
          kind: "feature",
          specRef: "spec-1",
          sandboxRef: "box-1",
          planRef: "plan-1",
        }),
      );
    }),
  );

  it.effect("runs a planned demo between Build and Review", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItemAt("build", { demo: true });
      expect(workItem.state()).toStrictEqual("build");
      workItem.finish("build", { _tag: "built" });
      expect(workItem.state()).toStrictEqual("demo");
      workItem.finish("demo", { _tag: "demonstrated", demoRef: "demo-1" });
      expect(workItem.state()).toStrictEqual("review");
    }),
  );

  it.effect("passes the demo on to Review", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItemAt("demo", { demo: true });
      workItem.finish("demo", { _tag: "demonstrated", demoRef: "demo-1" });
      expect(workItem.stageInput("review")).toStrictEqual(
        stageInputWith({
          kind: "feature",
          specRef: "spec-1",
          sandboxRef: "box-1",
          planRef: "plan-1",
          demoRef: "demo-1",
        }),
      );
    }),
  );

  it.effect("skips the demo when none is planned", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItemAt("build", { demo: false });
      workItem.finish("build", { _tag: "built" });
      expect(workItem.state()).toStrictEqual("review");
    }),
  );

  it.effect(
    "sends requested changes back to Build, and blocks once the review loop limit is reached",
    () =>
      Effect.gen(function* () {
        const workItem = yield* startWorkItemAt("build", { demo: false });
        const requestChanges = () => {
          workItem.finish("build", { _tag: "built" });
          workItem.finish("review", { _tag: "changesRequested", feedback: "rename the flag" });
        };
        requestChanges();
        expect(workItem.state()).toStrictEqual("build");
        expect(workItem.context().counters).toStrictEqual({ review: 1, reproduce: 0 });
        expect(workItem.stageInput("build")).toStrictEqual(
          inputAfter("review", {}, { feedback: "rename the flag" }),
        );
        requestChanges();
        requestChanges();
        requestChanges();
        expect(workItem.state()).toStrictEqual("blocked");
        expect(workItem.context().blocked).toStrictEqual({
          from: "review",
          reason: {
            tag: "LoopLimitReached",
            message:
              "Review sent the change back to Build 3 times, and last asked: rename the flag",
          },
        });
      }),
  );

  it.effect("keeps a bug's references when a later decision sets other facts", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItemAt("shipGate", { kind: "bug" });
      workItem.send({ type: "reject", ...reviewer, comment: "the flag is still on" });
      expect(workItem.stageInput("build")).toStrictEqual(
        stageInputWith({
          kind: "bug",
          feedback: "the flag is still on",
          specRef: "spec-1",
          sandboxRef: "box-1",
          reproductionRef: "repro-1",
          planRef: "plan-1",
        }),
      );
    }),
  );

  it.effect("ships an approved change once a human approves the ship gate", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItemAt("shipGate");
      expect(workItem.state()).toStrictEqual("shipGate");
      workItem.send({ type: "approve", ...reviewer });
      expect(workItem.state()).toStrictEqual("ship");
      workItem.finish("ship", { _tag: "shipped", deliveryRef: "pr-1" });
      expect(workItem.state()).toStrictEqual("shipped");
      expect(workItem.status()).toStrictEqual("done");
      expect(workItem.context().facts).toMatchObject({ deliveryRef: "pr-1" });
    }),
  );

  it.effect("shows stages no demo once the latest plan calls for none, but keeps it", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItemAt("review", { demo: true });
      workItem.fail("review", { tag: "ReviewerGaveUp", message: "plan is wrong" });
      workItem.send({ type: "backToSpec", ...reviewer });
      workItem.finish("spec", { _tag: "written", specRef: goldenRefs.specRef });
      workItem.send({ type: "approve", ...reviewer });
      workItem.finish("provision", {
        _tag: "provisioned",
        sandboxRef: goldenRefs.sandboxRef,
        sampleRef: null,
      });
      workItem.finish("plan", { _tag: "planned", planRef: "plan-2", demo: false });
      expect(workItem.stageInput("build")?.demoRef).toBeNull();
      expect(workItem.context().facts.demoRef).toStrictEqual(goldenRefs.demoRef);
    }),
  );

  it.effect("sends a change rejected at the ship gate back to Build with the comment", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItemAt("shipGate");
      workItem.send({ type: "reject", ...reviewer, comment: "wait for the release freeze" });
      expect(workItem.state()).toStrictEqual("build");
      expect(workItem.stageInput("build")).toStrictEqual(
        inputAfter("review", {}, { feedback: "wait for the release freeze" }),
      );
    }),
  );

  it.effect(
    "cancels from any stage, stops the running stage machine and records who cancelled",
    () =>
      Effect.gen(function* () {
        const workItem = yield* startWorkItemAt("build", { demo: false });
        workItem.send({ type: "cancel", ...reviewer, comment: "out of scope" });
        expect(workItem.state()).toStrictEqual("cancelled");
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
      expect(workItem.state()).toStrictEqual("blocked");
      expect(workItem.context().blocked).toStrictEqual({
        from: "intake",
        reason: { tag: "StageCrashed", message: "agent exited with code 1" },
      });
    }),
  );

  it.effect("cancels a work item waiting at a gate", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItemAt("specGate", { kind: "bug" });
      workItem.send({ type: "cancel", ...reviewer });
      expect(workItem.state()).toStrictEqual("cancelled");
      expect(workItem.context().decisions.at(-1)?.state).toStrictEqual("specGate");
    }),
  );

  it.effect("sends an unclassified work item back to Intake rather than to Spec", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItem();
      workItem.fail("intake", { tag: "IssueUnreadable", message: "the issue body is empty" });
      workItem.send({ type: "backToSpec", ...reviewer, comment: "body filled in" });
      expect(workItem.state()).toStrictEqual("intake");
      expect(workItem.stageInput("intake")).toStrictEqual(
        stageInputWith({ feedback: "body filled in" }),
      );
    }),
  );
});
