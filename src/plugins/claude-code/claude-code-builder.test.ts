import { describe, expect, it } from "@effect/vitest";
import { Effect, FileSystem } from "effect";

import type { BuildTask } from "../../index.ts";
import { Builder } from "../../index.ts";
import type { PluginUnderTest } from "./claude-code-harness.ts";
import { flagValue, nodeFiles, pluginUnderTest, promptOf } from "./claude-code-harness.ts";

const buildTaskIn = (sandboxRef: string): BuildTask => ({
  workItemId: "work-item-7",
  issueRef: "tonytangdev/rouage#7",
  kind: "bug",
  feedback: null,
  specRef: "/work/acme/.rouage/artifacts/work-item-7/spec.md",
  planRef: "/work/acme/.rouage/artifacts/work-item-7/plan.md",
  sandboxRef,
  reproductionRef: "/work/acme/.rouage/artifacts/work-item-7/reproduction.md",
  changeRequest: null,
});

const builtOn = <A, E>(
  setup: PluginUnderTest,
  step: (builder: Builder["Service"], sandbox: string) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const sandbox = yield* fs.makeTempDirectoryScoped({ prefix: "rouage-sandbox-" });
    const plugin = yield* pluginUnderTest(setup);
    const outcome = yield* Effect.flatMap(Builder, (builder) => step(builder, sandbox)).pipe(
      Effect.provide(plugin.layer),
    );
    const [run] = plugin.claude.spawned();
    return { outcome, plugin, sandbox, args: run?.args ?? [], cwd: run?.cwd };
  });

describe("the Claude Code builder", () => {
  it.effect(
    "implements the change in the implement role, in the workspace, accepting its edits and letting it run Bash",
    () =>
      Effect.gen(function* () {
        const { args, cwd, sandbox } = yield* builtOn(
          { runs: [{ _tag: "replays", transcript: "implement-done" }] },
          (builder, workspace) => builder.implement(buildTaskIn(workspace)),
        );
        expect(cwd).toBe(sandbox);
        expect(flagValue(args, "--agent")).toBe("rouage-implement");
        expect(flagValue(args, "--permission-mode")).toBe("acceptEdits");
        expect(flagValue(args, "--agents")).toContain('"Bash"');
        expect(yield* promptOf(args, "rouage-implement")).toContain(
          "/work/acme/.rouage/artifacts/work-item-7/plan.md",
        );
      }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );
});
