import { describe, expect, it } from "@effect/vitest";
import { Effect, FileSystem, Path } from "effect";

import type { WriteTask } from "../../index.ts";
import { SpecWriter } from "../../index.ts";
import type { PluginUnderTest } from "./claude-code-harness.ts";
import { nodeFiles, pluginUnderTest, promptOf, writeTask } from "./claude-code-harness.ts";

const writtenSpec = [{ _tag: "replays", transcript: "spec-written" }] as const;

const writtenOn = (setup: PluginUnderTest, task: WriteTask = writeTask) =>
  Effect.gen(function* () {
    const plugin = yield* pluginUnderTest(setup);
    const written = yield* Effect.flatMap(SpecWriter, (writer) => writer.write(task)).pipe(
      Effect.provide(plugin.layer),
    );
    const [run] = plugin.claude.spawned();
    return { written, plugin, args: run?.args ?? [], cwd: run?.cwd };
  });

const specPathIn = (artifactsDir: string) =>
  Effect.map(Path.Path, (path) => path.join(artifactsDir, "work-item-7", "spec.md"));

describe("the Claude Code spec writer", () => {
  it.effect(
    "stores the spec Claude wrote in the work item's spec file, its path the reference",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const { written, plugin } = yield* writtenOn({ runs: writtenSpec });
        const specRef = yield* specPathIn(plugin.artifactsDir);
        expect(written).toStrictEqual({ _tag: "written", specRef });
        expect(yield* fs.readFileString(specRef)).toBe(
          "# Saving a draft\n\nClicking Save on a new draft stores it and shows it in the drafts list. Today it crashes with a null pointer error.",
        );
      }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("replaces the spec an earlier run stored for the work item", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const plugin = yield* pluginUnderTest({ runs: writtenSpec });
      const specRef = yield* specPathIn(plugin.artifactsDir);
      yield* fs.makeDirectory(`${plugin.artifactsDir}/work-item-7`);
      yield* fs.writeFileString(specRef, "# An older spec");
      yield* Effect.flatMap(SpecWriter, (writer) => writer.write(writeTask)).pipe(
        Effect.provide(plugin.layer),
      );
      expect(yield* fs.readFileString(specRef)).toMatch(/^# Saving a draft/u);
      expect(yield* fs.readDirectory(`${plugin.artifactsDir}/work-item-7`)).toStrictEqual(
        expect.arrayContaining(["spec.md", "runs"]),
      );
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("answers unclear with Claude's reason, storing no spec", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { written, plugin } = yield* writtenOn({
        runs: [{ _tag: "replays", transcript: "spec-unclear" }],
        options: { keepTranscripts: false },
      });
      expect(written).toStrictEqual({
        _tag: "unclear",
        reason: "The issue says the drafts page is wrong but not what it should show",
      });
      expect(yield* fs.readDirectory(plugin.artifactsDir)).toStrictEqual([]);
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect(
    "asks Claude in the write role, in the repository checkout, to revise the spec it wrote before",
    () =>
      Effect.gen(function* () {
        const { args, cwd } = yield* writtenOn(
          { runs: writtenSpec, options: { repoDir: "/work/acme" } },
          {
            ...writeTask,
            previousSpecRef: "/work/acme/.rouage/artifacts/work-item-7/spec.md",
            feedback: "Say what happens to an empty draft",
          },
        );
        expect(cwd).toBe("/work/acme");
        const prompt = yield* promptOf(args, "rouage-write");
        expect(prompt).toContain("The issue is: tonytangdev/rouage#7");
        expect(prompt).toContain("It was classified as a bug.");
        expect(prompt).toContain("/work/acme/.rouage/artifacts/work-item-7/spec.md");
        expect(prompt).toContain("Say what happens to an empty draft");
      }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("gives up telling the user to log in when Claude Code is not logged in", () =>
    Effect.gen(function* () {
      const gaveUp = yield* Effect.flip(
        writtenOn({ runs: [{ _tag: "replays", transcript: "not-logged-in" }] }),
      );
      expect(gaveUp._tag).toBe("SpecWriterGaveUp");
      expect(gaveUp.message).toMatch(/^Claude Code is not logged in/u);
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );
});
