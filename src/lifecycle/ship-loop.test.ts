import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import type { TestWorkItem } from "./lifecycle-harness.ts";
import { startWorkItemAt } from "./lifecycle-harness.ts";
import { reviewer } from "./test-fixtures.ts";

const conflict = "conflicts in src/totals.ts against main";

/** Approves the change at the ship gate and has Ship send it back to Build. */
const cannotLand = (workItem: TestWorkItem, feedback = conflict) => {
  workItem.send({ type: "approve", ...reviewer });
  workItem.finish("ship", { _tag: "needsRebuild", feedback });
};

/** Rebuilds the change and has Review approve it, back to the ship gate. */
const rebuildAndApprove = (workItem: TestWorkItem) => {
  workItem.finish("build", { _tag: "built" });
  workItem.finish("review", { _tag: "approved" });
};

/** Sends the change around the ship loop as many times as its limit of 3 allows. */
const goAroundTheLimit = (workItem: TestWorkItem) => {
  cannotLand(workItem);
  rebuildAndApprove(workItem);
  cannotLand(workItem);
  rebuildAndApprove(workItem);
  cannotLand(workItem);
  rebuildAndApprove(workItem);
};

describe("a change Ship cannot land", () => {
  it.effect("goes back to Build with what kept it from landing", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItemAt("shipGate");
      cannotLand(workItem);
      expect(workItem.state()).toStrictEqual("build");
      expect(workItem.stageInput("build")).toMatchObject({
        feedback: conflict,
        changeRequest: { from: "ship", text: conflict },
      });
      expect(workItem.context().counters.ship).toBe(1);
    }),
  );

  it.effect("is judged by Review and approved at the ship gate again once rebuilt", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItemAt("shipGate");
      cannotLand(workItem);
      workItem.finish("build", { _tag: "built" });
      expect(workItem.state()).toStrictEqual("review");
      expect(workItem.stageInput("review")?.changeRequest).toStrictEqual({
        from: "ship",
        text: conflict,
      });
      workItem.finish("review", { _tag: "approved" });
      expect(workItem.state()).toStrictEqual("shipGate");
    }),
  );

  it.effect("gets its demo made again when a demo is called for", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItemAt("shipGate", { demo: true });
      cannotLand(workItem);
      workItem.finish("build", { _tag: "built" });
      expect(workItem.state()).toStrictEqual("demo");
    }),
  );

  it.effect(
    "blocks once the ship loop reaches its limit, keeping the request Build last addressed",
    () =>
      Effect.gen(function* () {
        const workItem = yield* startWorkItemAt("shipGate");
        goAroundTheLimit(workItem);
        cannotLand(workItem, "checks fail after the rebase");
        expect(workItem.state()).toStrictEqual("blocked");
        expect(workItem.context().blocked).toStrictEqual({
          from: "ship",
          reason: {
            tag: "LoopLimitReached",
            message:
              "Ship sent the change back to Build 3 times, and last asked: checks fail after the rebase",
          },
        });
        expect(workItem.context().facts).toMatchObject({
          feedback: null,
          changeRequest: { from: "ship", text: conflict },
        });
      }),
  );

  it.effect("runs Ship again on the same change when retried at the loop limit", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItemAt("shipGate");
      goAroundTheLimit(workItem);
      cannotLand(workItem);
      workItem.send({ type: "retry", ...reviewer });
      expect(workItem.state()).toStrictEqual("ship");
      workItem.finish("ship", { _tag: "shipped", deliveryRef: "pr-1" });
      expect(workItem.state()).toStrictEqual("shipped");
    }),
  );
});
