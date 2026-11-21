import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { reviewer } from "./golden-route.ts";
import { restoredWorkItem, startWorkItemAt, throughJson } from "./lifecycle-harness.ts";

describe("demo override", () => {
  it.effect("skips a planned demo a human skipped, and records the decision", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItemAt("build", { demo: true });
      workItem.send({ type: "skipDemo", ...reviewer, comment: "too small to show" });
      workItem.finish("build", { _tag: "built" });
      expect(workItem.state()).toStrictEqual("review");
      expect(workItem.context().decisions.at(-1)).toStrictEqual({
        action: "skipDemo",
        state: "build",
        by: "ada",
        at: reviewer.at,
        comment: "too small to show",
      });
    }),
  );

  it.effect("runs a demo a human required though the plan called for none", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItemAt("review", { demo: false });
      workItem.send({ type: "requireDemo", ...reviewer });
      workItem.finish("review", { _tag: "changesRequested", feedback: "rename it" });
      workItem.finish("build", { _tag: "built" });
      expect(workItem.state()).toStrictEqual("demo");
    }),
  );

  it.effect("keeps a human's override when a later plan decides otherwise", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItemAt("plan", { demo: true });
      workItem.send({ type: "skipDemo", ...reviewer });
      workItem.finish("plan", { _tag: "planned", planRef: "plan-1", demo: true });
      workItem.finish("build", { _tag: "built" });
      expect(workItem.state()).toStrictEqual("review");
    }),
  );

  it.effect("drops a human's override when the work item is sent back to Spec", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItemAt("build", { demo: true });
      workItem.send({ type: "skipDemo", ...reviewer });
      workItem.fail("build", { tag: "BuilderGaveUp", message: "the spec is wrong" });
      workItem.send({ type: "backToSpec", ...reviewer });
      workItem.advanceTo("build", { demo: true });
      workItem.finish("build", { _tag: "built" });
      expect(workItem.state()).toStrictEqual("demo");
    }),
  );

  it.effect("accepts an override while the work item is blocked", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItemAt("build", { demo: true });
      workItem.fail("build", { tag: "BuilderGaveUp", message: "tests time out" });
      workItem.send({ type: "skipDemo", ...reviewer });
      workItem.send({ type: "retry", ...reviewer });
      workItem.finish("build", { _tag: "built" });
      expect(workItem.state()).toStrictEqual("review");
    }),
  );

  it.effect("stops a running demo a human skipped and moves on to Review", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItemAt("demo", { demo: true });
      workItem.send({ type: "skipDemo", ...reviewer });
      expect(workItem.state()).toStrictEqual("review");
      expect(workItem.stageInput("demo")).toBeUndefined();
      expect(workItem.context().decisions.at(-1)).toMatchObject({
        action: "skipDemo",
        state: "demo",
      });
    }),
  );

  it.effect("retries a work item blocked at a demo a human then skipped from Review", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItemAt("demo", { demo: true });
      workItem.fail("demo", { tag: "DemonstratorGaveUp", message: "no display" });
      workItem.send({ type: "skipDemo", ...reviewer });
      workItem.send({ type: "retry", ...reviewer });
      expect(workItem.state()).toStrictEqual("review");
    }),
  );

  it.effect("passes Review the demo a human required", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItemAt("build", { demo: false });
      workItem.send({ type: "requireDemo", ...reviewer });
      workItem.finish("build", { _tag: "built" });
      workItem.finish("demo", { _tag: "demonstrated", demoRef: "demo-1" });
      expect(workItem.stageInput("review")?.demoRef).toStrictEqual("demo-1");
    }),
  );

  it.effect("keeps a human's override across a save and restore", () =>
    Effect.gen(function* () {
      const original = yield* startWorkItemAt("build", { demo: true });
      original.send({ type: "skipDemo", ...reviewer });
      const workItem = yield* restoredWorkItem(throughJson(original.save()));
      workItem.finish("build", { _tag: "built" });
      expect(workItem.state()).toStrictEqual("review");
    }),
  );

  it.effect("waits for a rejection at the ship gate before making a demo a human required", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItemAt("shipGate", { demo: false });
      workItem.send({ type: "requireDemo", ...reviewer });
      expect(workItem.state()).toStrictEqual("shipGate");
      workItem.send({ type: "reject", ...reviewer });
      workItem.finish("build", { _tag: "built" });
      expect(workItem.state()).toStrictEqual("demo");
    }),
  );

  it.effect("leaves the feedback alone when a human overrides with a comment", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItemAt("review", { demo: true });
      workItem.finish("review", { _tag: "changesRequested", feedback: "rename it" });
      workItem.send({ type: "skipDemo", ...reviewer, comment: "not worth it" });
      expect(workItem.context().facts.feedback).toStrictEqual("rename it");
    }),
  );

  it.effect("retries a demo that blocked while a demo is still called for", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItemAt("demo", { demo: true });
      workItem.fail("demo", { tag: "DemonstratorGaveUp", message: "no display" });
      workItem.send({ type: "retry", ...reviewer });
      expect(workItem.state()).toStrictEqual("demo");
    }),
  );
});
