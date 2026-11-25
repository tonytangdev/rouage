import { describe, expect, it } from "@effect/vitest";
import { Effect, Fiber, Layer } from "effect";
import { TestClock } from "effect/testing";

import { Classifier } from "../../index.ts";
import { classifyTask, nodeFiles, pluginUnderTest } from "./claude-code-harness.ts";

const classifyIn = (classifier: Classifier["Service"], workItemId: string) =>
  Effect.forkChild(classifier.classify({ ...classifyTask, workItemId }));

describe("the Claude Code plugin's run timing", () => {
  it.effect("stops claude and gives up when a run passes its role's timeout", () =>
    Effect.gen(function* () {
      const plugin = yield* pluginUnderTest({ runs: [{ _tag: "hangs" }] });
      const classifier = yield* Effect.provide(Classifier, yield* Layer.build(plugin.layer));
      const run = yield* classifyIn(classifier, "work-item-7");
      yield* plugin.claude.started(1);
      yield* TestClock.adjust("10 minutes");
      const gaveUp = yield* Effect.flip(Fiber.join(run));
      expect(gaveUp.message).toBe(
        "Claude ran past the classify role's timeout of 10m and was stopped",
      );
      expect(plugin.claude.stopped()).toBe(1);
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("runs one claude at a time, starting a queued run's timeout once it runs", () =>
    Effect.gen(function* () {
      const plugin = yield* pluginUnderTest({ runs: [{ _tag: "hangs" }, { _tag: "hangs" }] });
      const classifier = yield* Effect.provide(Classifier, yield* Layer.build(plugin.layer));
      const first = yield* classifyIn(classifier, "work-item-1");
      const second = yield* classifyIn(classifier, "work-item-2");
      yield* plugin.claude.started(1);
      yield* TestClock.adjust("9 minutes");
      expect(plugin.claude.spawned()).toHaveLength(1);
      yield* TestClock.adjust("1 minute");
      yield* Effect.flip(Fiber.join(first));
      yield* plugin.claude.started(2);
      yield* TestClock.adjust("9 minutes");
      expect(second.pollUnsafe()).toBeUndefined();
      yield* TestClock.adjust("1 minute");
      expect((yield* Effect.flip(Fiber.join(second)))._tag).toBe("ClassifierGaveUp");
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("runs claude concurrently up to the cap it is given", () =>
    Effect.gen(function* () {
      const plugin = yield* pluginUnderTest({
        runs: [{ _tag: "hangs" }, { _tag: "hangs" }],
        options: { maxConcurrentRuns: 2 },
      });
      const classifier = yield* Effect.provide(Classifier, yield* Layer.build(plugin.layer));
      yield* classifyIn(classifier, "work-item-1");
      yield* classifyIn(classifier, "work-item-2");
      yield* plugin.claude.started(2);
      expect(plugin.claude.spawned()).toHaveLength(2);
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("waits until the usage limit resets and runs again when told to", () =>
    Effect.gen(function* () {
      const plugin = yield* pluginUnderTest({
        runs: [
          { _tag: "replays", transcript: "usage-limit" },
          { _tag: "replays", transcript: "classified-as-bug" },
        ],
        // Without transcripts, because a real file write in the run lets the
        // test clock pass the run's timeout before the usage limit is read.
        options: { waitOnUsageLimit: true, keepTranscripts: false },
      });
      yield* TestClock.setTime(Date.parse("2026-11-22T13:00:00Z"));
      const classifier = yield* Effect.provide(Classifier, yield* Layer.build(plugin.layer));
      const run = yield* classifyIn(classifier, "work-item-7");
      yield* plugin.claude.started(1);
      yield* TestClock.adjust("119 minutes");
      expect(plugin.claude.spawned()).toHaveLength(1);
      yield* TestClock.adjust("1 minute");
      expect(yield* Fiber.join(run)).toStrictEqual({ _tag: "classified", kind: "bug" });
      expect(plugin.claude.spawned()).toHaveLength(2);
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );
});
