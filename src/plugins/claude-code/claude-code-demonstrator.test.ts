import { describe, expect, it } from "@effect/vitest";
import { Effect, FileSystem, Path } from "effect";

import type { DemoTask } from "../../index.ts";
import { Demonstrator } from "../../index.ts";
import type { PluginUnderTest } from "./claude-code-harness.ts";
import { flagValue, nodeFiles, pluginUnderTest, promptOf } from "./claude-code-harness.ts";

const demoTaskIn = (sandboxRef: string): DemoTask => ({
  workItemId: "work-item-7",
  issueRef: "tonytangdev/rouage#7",
  kind: "bug",
  feedback: null,
  specRef: "/work/acme/.rouage/artifacts/work-item-7/spec.md",
  planRef: "/work/acme/.rouage/artifacts/work-item-7/plan.md",
  sandboxRef,
  reproductionRef: "/work/acme/.rouage/artifacts/work-item-7/reproduction.md",
  previousDemoRef: null,
});

const demonstratedOn = (setup: PluginUnderTest) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const sandbox = yield* fs.makeTempDirectoryScoped({ prefix: "rouage-sandbox-" });
    const plugin = yield* pluginUnderTest(setup);
    const demonstrated = yield* Effect.flatMap(Demonstrator, (demonstrator) =>
      demonstrator.demonstrate(demoTaskIn(sandbox)),
    ).pipe(Effect.provide(plugin.layer));
    const [run] = plugin.claude.spawned();
    return { demonstrated, plugin, sandbox, args: run?.args ?? [], cwd: run?.cwd };
  });

describe("the Claude Code demonstrator", () => {
  it.effect(
    "demonstrates the change in the demonstrate role, in the workspace, accepting its edits and letting it run Bash",
    () =>
      Effect.gen(function* () {
        const { args, cwd, sandbox } = yield* demonstratedOn({
          runs: [{ _tag: "replays", transcript: "demonstrate-demonstrated" }],
        });
        expect(cwd).toBe(sandbox);
        expect(flagValue(args, "--agent")).toBe("rouage-demonstrate");
        expect(flagValue(args, "--permission-mode")).toBe("acceptEdits");
        expect(flagValue(args, "--agents")).toContain('"Bash"');
        expect(yield* promptOf(args, "rouage-demonstrate")).toContain(
          "/work/acme/.rouage/artifacts/work-item-7/plan.md",
        );
      }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect(
    "stores Claude's record of the commands it ran as the work item's demo, replacing an earlier one",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const { demonstrated, plugin } = yield* demonstratedOn({
          runs: [{ _tag: "replays", transcript: "demonstrate-demonstrated" }],
        });
        const demoRef = path.join(plugin.artifactsDir, "work-item-7", "demo.md");
        expect(demonstrated).toStrictEqual({ demoRef });
        expect(yield* fs.readFileString(demoRef)).toBe(
          "# Demo\n\n```\n$ pnpm vitest run test/draft.test.ts\n1 passed: saving a draft keeps its title\n```",
        );
      }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("gives up with Claude's reason when it cannot demonstrate the change", () =>
    Effect.gen(function* () {
      const gaveUp = yield* Effect.flip(
        demonstratedOn({ runs: [{ _tag: "replays", transcript: "demonstrate-stuck" }] }),
      );
      expect(gaveUp._tag).toBe("DemonstratorGaveUp");
      expect(gaveUp.message).toBe("The change has no command that shows it working");
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );
});
