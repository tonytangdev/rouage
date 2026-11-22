import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { startWorkItemAt } from "./lifecycle-harness.ts";
import { reviewer } from "./test-fixtures.ts";

describe("change request", () => {
  it.effect("shows Review the changes it requested when it judges the change again", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItemAt("review");
      workItem.finish("review", { _tag: "changesRequested", feedback: "rename totals" });
      workItem.finish("build", { _tag: "built" });
      expect(workItem.stageInput("review")?.changeRequest).toStrictEqual({
        from: "review",
        text: "rename totals",
      });
    }),
  );

  it.effect("shows Review why a human rejected the change at the ship gate", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItemAt("review");
      workItem.finish("review", { _tag: "changesRequested", feedback: "rename totals" });
      workItem.finish("build", { _tag: "built" });
      workItem.finish("review", { _tag: "approved" });
      workItem.send({ type: "reject", ...reviewer, comment: "totals exclude VAT" });
      workItem.finish("build", { _tag: "built" });
      expect(workItem.stageInput("review")?.changeRequest).toStrictEqual({
        from: "shipGate",
        text: "totals exclude VAT",
      });
    }),
  );

  it.effect("tells Review a human rejected the change without saying why", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItemAt("shipGate");
      workItem.send({ type: "reject", ...reviewer });
      workItem.finish("build", { _tag: "built" });
      expect(workItem.stageInput("review")?.changeRequest).toStrictEqual({
        from: "shipGate",
        text: null,
      });
    }),
  );

  it.effect("drops the change request when a blocked work item is sent back to Spec", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItemAt("review");
      workItem.finish("review", { _tag: "changesRequested", feedback: "rename totals" });
      workItem.fail("build", { tag: "BuilderGaveUp", message: "the spec is contradictory" });
      workItem.send({ type: "backToSpec", ...reviewer });
      workItem.advanceTo("review");
      expect(workItem.stageInput("review")?.changeRequest).toBeNull();
    }),
  );

  it.effect("keeps Review's request for Build when a retry brings a comment of its own", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItemAt("review");
      workItem.finish("review", { _tag: "changesRequested", feedback: "rename totals" });
      workItem.fail("build", { tag: "BuilderGaveUp", message: "the build timed out" });
      workItem.send({ type: "retry", ...reviewer, comment: "the CI runner is back" });
      expect(workItem.stageInput("build")).toMatchObject({
        feedback: "the CI runner is back",
        changeRequest: { from: "review", text: "rename totals" },
      });
    }),
  );

  it.effect("keeps the request Build last addressed when Review reaches its loop limit", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItemAt("build", { demo: false });
      const requestChanges = (feedback: string) => {
        workItem.finish("build", { _tag: "built" });
        workItem.finish("review", { _tag: "changesRequested", feedback });
      };
      requestChanges("rename the flag");
      requestChanges("rename the flag");
      requestChanges("move the flag");
      requestChanges("drop the flag");
      workItem.send({ type: "retry", ...reviewer });
      expect(workItem.stageInput("review")?.changeRequest).toStrictEqual({
        from: "review",
        text: "move the flag",
      });
    }),
  );
});
