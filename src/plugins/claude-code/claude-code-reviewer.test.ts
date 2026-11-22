import { describe, expect, it } from "@effect/vitest";
import { Effect, FileSystem, Path } from "effect";

import type { ReviewTask } from "../../index.ts";
import { Reviewer } from "../../index.ts";
import type { PluginUnderTest } from "./claude-code-harness.ts";
import { nodeFiles, pluginUnderTest, promptOf, reviewTask } from "./claude-code-harness.ts";

const approved = [{ _tag: "replays", transcript: "review-approved" }] as const;

const reviewedOn = (setup: PluginUnderTest, task: ReviewTask = reviewTask) =>
  Effect.gen(function* () {
    const plugin = yield* pluginUnderTest(setup);
    const verdict = yield* Effect.flatMap(Reviewer, (reviewer) => reviewer.review(task)).pipe(
      Effect.provide(plugin.layer),
    );
    const [run] = plugin.claude.spawned();
    return { verdict, plugin, args: run?.args ?? [], cwd: run?.cwd };
  });

const reviewPromptFor = (task: ReviewTask) =>
  Effect.flatMap(reviewedOn({ runs: approved }, task), ({ args }) =>
    promptOf(args, "rouage-review"),
  );

describe("the Claude Code reviewer", () => {
  it.effect("approves when Claude does, storing its review in the work item's review file", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const { verdict, plugin } = yield* reviewedOn({ runs: approved });
      expect(verdict).toStrictEqual({ _tag: "approved" });
      expect(
        yield* fs.readFileString(path.join(plugin.artifactsDir, "work-item-7", "review.md")),
      ).toBe(
        "# Review\n\nThe change saves a new draft as the spec asks, and the reproduction passes.",
      );
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("requests the changes Claude asks for, as feedback for Build", () =>
    Effect.gen(function* () {
      const { verdict } = yield* reviewedOn({
        runs: [{ _tag: "replays", transcript: "review-changes-requested" }],
      });
      expect(verdict).toStrictEqual({
        _tag: "changesRequested",
        feedback: "Saving an empty draft still crashes; guard it too.",
      });
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect(
    "asks Claude in the review role, in the sandbox's workspace, to judge against the spec, plan and evidence",
    () =>
      Effect.gen(function* () {
        const { args, cwd } = yield* reviewedOn({ runs: approved });
        expect(cwd).toBe("/sandboxes/work-item-7");
        const prompt = yield* promptOf(args, "rouage-review");
        expect(prompt).toContain("/work/acme/.rouage/artifacts/work-item-7/spec.md");
        expect(prompt).toContain("/work/acme/.rouage/artifacts/work-item-7/plan.md");
        expect(prompt).toContain("/work/acme/.rouage/artifacts/work-item-7/reproduction.md");
        expect(prompt).toContain("The change has not been sent back to Build.");
      }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("asks Claude to check the changes Review last requested were made", () =>
    Effect.gen(function* () {
      const prompt = yield* reviewPromptFor({
        ...reviewTask,
        changeRequest: { from: "review", text: "Guard the empty draft too" },
      });
      expect(prompt).toContain(
        "The change was last sent back to Build because Review requested: Guard the empty draft too.",
      );
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("tells Claude a human rejected the change at the ship gate without saying why", () =>
    Effect.gen(function* () {
      const prompt = yield* reviewPromptFor({
        ...reviewTask,
        changeRequest: { from: "shipGate", text: null },
      });
      expect(prompt).toContain(
        "The change was last sent back to Build because a human rejected it at the ship gate, without saying why.",
      );
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("gives up with claude's exit code and stderr when it crashes", () =>
    Effect.gen(function* () {
      const gaveUp = yield* Effect.flip(
        reviewedOn({ runs: [{ _tag: "crashes", stderr: "Error: boom\n", exitCode: 2 }] }),
      );
      expect(gaveUp._tag).toBe("ReviewerGaveUp");
      expect(gaveUp.message).toBe("claude exited with code 2 without a result: Error: boom");
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );
});
