import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { reviewer } from "./golden-route.ts";
import { restoredWorkItem, startWorkItem, throughJson } from "./lifecycle-harness.ts";

describe("work item persistence", () => {
  it.effect("resumes a work item saved while it waits at a gate", () =>
    Effect.gen(function* () {
      const original = yield* startWorkItem();
      original.finish("intake", { _tag: "classified", kind: "feature" });
      original.finish("spec", { _tag: "written", specRef: "spec-1" });
      const workItem = yield* restoredWorkItem(throughJson(original.save()));
      expect(workItem.state()).toStrictEqual("specGate");
      workItem.send({ type: "approve", ...reviewer });
      expect(workItem.state()).toStrictEqual("provision");
    }),
  );

  it.effect("resumes a work item saved while a stage machine runs, keeping its loop counters", () =>
    Effect.gen(function* () {
      const original = yield* startWorkItem();
      original.finish("intake", { _tag: "classified", kind: "bug" });
      original.finish("spec", { _tag: "written", specRef: "spec-1" });
      original.send({ type: "approve", ...reviewer });
      original.finish("provision", { _tag: "provisioned", sandboxRef: "box-1", sampleRef: null });
      original.finish("reproduce", { _tag: "needsSample", sampleRequest: "orders over 100" });
      original.finish("provision", { _tag: "provisioned", sandboxRef: "box-1", sampleRef: null });
      const workItem = yield* restoredWorkItem(throughJson(original.save()));
      expect(workItem.context().counters).toStrictEqual(original.context().counters);
      expect(workItem.context().counters.reproduce).toBe(1);
      workItem.finish("reproduce", { _tag: "reproduced", reproductionRef: "repro-1" });
      expect(workItem.state()).toStrictEqual("plan");
    }),
  );

  it.effect("retries the stage a blocked work item came from after it is restored", () =>
    Effect.gen(function* () {
      const original = yield* startWorkItem();
      original.finish("intake", { _tag: "classified", kind: "bug" });
      original.fail("spec", { tag: "AgentTimedOut", message: "no answer" });
      const workItem = yield* restoredWorkItem(throughJson(original.save()));
      workItem.send({ type: "retry", ...reviewer });
      expect(workItem.state()).toStrictEqual("spec");
    }),
  );

  it.effect("refuses a snapshot saved under another lifecycle version", () =>
    Effect.gen(function* () {
      const original = yield* startWorkItem();
      const persisted = { ...original.save(), machine: { id: "lifecycle", version: "0" } };
      const error = yield* Effect.flip(restoredWorkItem(throughJson(persisted)));
      expect(error).toMatchObject({
        _tag: "LifecycleVersionMismatch",
        expected: { id: "lifecycle", version: "1" },
        found: { id: "lifecycle", version: "0" },
      });
    }),
  );

  it.effect("refuses a snapshot saved by another lifecycle", () =>
    Effect.gen(function* () {
      const original = yield* startWorkItem();
      const persisted = { ...original.save(), machine: { id: "hotfix", version: "1" } };
      const error = yield* Effect.flip(restoredWorkItem(throughJson(persisted)));
      expect(error._tag).toStrictEqual("LifecycleVersionMismatch");
    }),
  );

  it.effect("refuses a snapshot that names a state the lifecycle does not have", () =>
    Effect.gen(function* () {
      const original = yield* startWorkItem();
      const persisted = { ...original.save(), value: "deploy" };
      const error = yield* Effect.flip(restoredWorkItem(throughJson(persisted)));
      expect(error._tag).toStrictEqual("UnreadableSnapshot");
    }),
  );

  it.effect("refuses a snapshot whose decision names a place the lifecycle does not have", () =>
    Effect.gen(function* () {
      const original = yield* startWorkItem();
      original.send({ type: "cancel", ...reviewer });
      const context = original.context();
      const decisions = context.decisions.map((decision) => ({ ...decision, state: "deploy" }));
      const persisted = { ...original.save(), context: { ...context, decisions } };
      const error = yield* Effect.flip(restoredWorkItem(throughJson(persisted)));
      expect(error._tag).toStrictEqual("UnreadableSnapshot");
    }),
  );

  it.effect("refuses a snapshot whose work item lacks a fact", () =>
    Effect.gen(function* () {
      const original = yield* startWorkItem();
      const context = original.context();
      const olderFacts = { ...context.facts, deliveryRef: undefined };
      const persisted = { ...original.save(), context: { ...context, facts: olderFacts } };
      const error = yield* Effect.flip(restoredWorkItem(throughJson(persisted)));
      expect(error._tag).toStrictEqual("UnreadableSnapshot");
    }),
  );
});
