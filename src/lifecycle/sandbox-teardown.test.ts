import { describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Effect, Fiber } from "effect";
import { TestClock } from "effect/testing";

import { fakeSandboxTeardown } from "./fake-sandbox-teardown.ts";
import { goldenRefs, reviewer } from "./golden-route.ts";
import { restoredWorkItem, startWorkItem, throughJson } from "./lifecycle-harness.ts";

const tornDownOnce = [{ workItemId: goldenRefs.workItemId }];

describe("sandbox teardown", () => {
  it.effect("tears down the sandbox of a shipped work item, found by its ID", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItem();
      workItem.advanceTo("ship");
      workItem.finish("ship", { _tag: "shipped", deliveryRef: goldenRefs.deliveryRef });
      yield* workItem.tornDown;
      expect(workItem.teardowns()).toStrictEqual(tornDownOnce);
    }),
  );

  it.effect("tears down a work item cancelled before Provision ever ran", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItem();
      workItem.advanceTo("specGate");
      workItem.send({ type: "cancel", ...reviewer });
      yield* workItem.tornDown;
      expect(workItem.teardowns()).toStrictEqual(tornDownOnce);
    }),
  );

  it.effect(
    "tears down a work item cancelled while Provision runs, before it reports a sandbox",
    () =>
      Effect.gen(function* () {
        const workItem = yield* startWorkItem();
        workItem.advanceTo("provision");
        workItem.send({ type: "cancel", ...reviewer });
        yield* workItem.tornDown;
        expect(workItem.teardowns()).toStrictEqual(tornDownOnce);
      }),
  );

  it.effect("keeps the sandbox of a blocked work item until a human cancels it", () =>
    Effect.gen(function* () {
      const workItem = yield* startWorkItem();
      workItem.advanceTo("build");
      workItem.fail("build", { tag: "BuilderGaveUp", message: "tests keep failing" });
      yield* Effect.yieldNow;
      expect(workItem.teardowns()).toStrictEqual([]);
      workItem.send({ type: "cancel", ...reviewer });
      yield* workItem.tornDown;
      expect(workItem.teardowns()).toStrictEqual(tornDownOnce);
    }),
  );

  it.effect("tears down again a work item restored from a snapshot saved once cancelled", () =>
    Effect.gen(function* () {
      const original = yield* startWorkItem();
      original.send({ type: "cancel", ...reviewer });
      const workItem = yield* restoredWorkItem(throughJson(original.save()));
      yield* workItem.tornDown;
      expect(workItem.teardowns()).toStrictEqual(tornDownOnce);
    }),
  );

  it.effect(
    "gives up after ROUAGE_TEARDOWN_ATTEMPTS attempts at a teardown that keeps failing",
    () =>
      Effect.gen(function* () {
        const workItem = yield* startWorkItem({ sandbox: fakeSandboxTeardown({ givesUp: true }) });
        workItem.send({ type: "cancel", ...reviewer });
        const outcome = yield* Effect.forkChild(Effect.flip(workItem.tornDown));
        yield* TestClock.adjust("1 minute");
        const error = yield* Fiber.join(outcome);
        expect(error._tag).toStrictEqual("TeardownGaveUp");
        expect(workItem.teardowns()).toStrictEqual([...tornDownOnce, ...tornDownOnce]);
      }).pipe(
        Effect.provide(
          ConfigProvider.layer(ConfigProvider.fromUnknown({ ROUAGE_TEARDOWN_ATTEMPTS: "2" })),
        ),
      ),
  );

  it.effect("reports a restored cancelled work item whose teardown keeps giving up", () =>
    Effect.gen(function* () {
      const original = yield* startWorkItem();
      original.send({ type: "cancel", ...reviewer });
      const workItem = yield* restoredWorkItem(throughJson(original.save()), {
        sandbox: fakeSandboxTeardown({ givesUp: true }),
      });
      const outcome = yield* Effect.forkChild(Effect.flip(workItem.tornDown));
      yield* TestClock.adjust("1 minute");
      const error = yield* Fiber.join(outcome);
      expect(error._tag).toStrictEqual("TeardownGaveUp");
    }),
  );

  it.effect("waits for a teardown in flight when the work item's scope closes", () =>
    Effect.gen(function* () {
      const sandbox = fakeSandboxTeardown({ takes: "10 seconds" });
      const closing = yield* Effect.forkChild(
        Effect.scoped(
          Effect.gen(function* () {
            const workItem = yield* startWorkItem({ sandbox });
            workItem.send({ type: "cancel", ...reviewer });
            yield* Effect.yieldNow;
          }),
        ),
      );
      yield* TestClock.adjust("10 seconds");
      yield* Fiber.join(closing);
      expect(sandbox.completed()).toStrictEqual(tornDownOnce);
    }),
  );
});
