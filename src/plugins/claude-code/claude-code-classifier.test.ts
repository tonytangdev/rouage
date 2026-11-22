import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { Classifier } from "../../index.ts";
import { classifyTask, nodeFiles, pluginUnderTest } from "./claude-code-harness.ts";
import type { FakeRun } from "./fake-claude.ts";

const classifyOn = (run: FakeRun) =>
  Effect.gen(function* () {
    const plugin = yield* pluginUnderTest({ runs: [run] });
    return yield* Effect.flatMap(Classifier, (classifier) =>
      classifier.classify(classifyTask),
    ).pipe(Effect.provide(plugin.layer));
  });

const reasonGivenUpOn = (run: FakeRun) =>
  Effect.map(Effect.flip(classifyOn(run)), (gaveUp) => {
    expect(gaveUp._tag).toBe("ClassifierGaveUp");
    return gaveUp.message;
  });

describe("the Claude Code classifier", () => {
  it.effect("answers with the classification Claude gave", () =>
    Effect.gen(function* () {
      const classification = yield* classifyOn({
        _tag: "replays",
        transcript: "classified-as-bug",
      });
      expect(classification).toStrictEqual({ _tag: "classified", kind: "bug" });
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("gives up telling the user to log in when Claude Code is not logged in", () =>
    Effect.gen(function* () {
      const reason = yield* reasonGivenUpOn({ _tag: "replays", transcript: "not-logged-in" });
      expect(reason).toBe(
        "Claude Code is not logged in (Not logged in · Please run /login). Log in by running claude, or set CLAUDE_CODE_OAUTH_TOKEN from claude setup-token or ANTHROPIC_API_KEY, then retry",
      );
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("gives up with the time the usage limit resets", () =>
    Effect.gen(function* () {
      const reason = yield* reasonGivenUpOn({ _tag: "replays", transcript: "usage-limit" });
      expect(reason).toBe(
        "Claude's usage limit is reached until 2026-11-22T15:00:00.000Z; retry then, or turn on waitOnUsageLimit",
      );
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("gives up when Claude uses every turn its role allows", () =>
    Effect.gen(function* () {
      const reason = yield* reasonGivenUpOn({ _tag: "replays", transcript: "turn-limit" });
      expect(reason).toBe(
        "Claude used every turn its role allows without answering (Reached maximum number of turns (1))",
      );
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("gives up with what Claude said when it answers without a structured answer", () =>
    Effect.gen(function* () {
      const reason = yield* reasonGivenUpOn({
        _tag: "replays",
        transcript: "without-structured-output",
      });
      expect(reason).toBe(
        "Claude finished without a structured answer; it said: **Bug.** A null pointer crash on Save is unintended behavior, not a requested feature.",
      );
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("gives up when Claude's answer does not match the classification schema", () =>
    Effect.gen(function* () {
      const reason = yield* reasonGivenUpOn({ _tag: "replays", transcript: "unreadable-answer" });
      expect(reason).toBe(
        `Claude's answer does not match the port's schema: Expected "bug" | "feature"\n  at ["answer"]["kind"]`,
      );
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("gives up with claude's exit code and stderr when it crashes", () =>
    Effect.gen(function* () {
      const reason = yield* reasonGivenUpOn({
        _tag: "crashes",
        stderr: "Error: settings.json is not valid JSON\n",
        exitCode: 2,
      });
      expect(reason).toBe(
        "claude exited with code 2 without a result: Error: settings.json is not valid JSON",
      );
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );
});
