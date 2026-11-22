import { describe, expect, it } from "@effect/vitest";
import { Effect, FileSystem } from "effect";

import type { ConfirmTask } from "../../index.ts";
import { Reproducer } from "../../index.ts";
import type { PluginUnderTest } from "./claude-code-harness.ts";
import { nodeFiles, pluginUnderTest } from "./claude-code-harness.ts";

const confirmTaskIn = (sandboxRef: string): ConfirmTask => ({
  workItemId: "work-item-7",
  sandboxRef,
  reproductionRef: "/work/acme/.rouage/artifacts/work-item-7/reproduction.md",
});

const confirmedOn = (setup: PluginUnderTest) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const sandbox = yield* fs.makeTempDirectoryScoped({ prefix: "rouage-sandbox-" });
    const plugin = yield* pluginUnderTest(setup);
    const confirmation = yield* Effect.flatMap(Reproducer, (reproducer) =>
      reproducer.confirm(confirmTaskIn(sandbox)),
    ).pipe(Effect.provide(plugin.layer));
    return { confirmation, plugin, sandbox };
  });

describe("the Claude Code reproducer", () => {
  it.effect("confirms the bug shows when the test command fails, without asking Claude", () =>
    Effect.gen(function* () {
      const { confirmation, plugin } = yield* confirmedOn({
        runs: [{ _tag: "crashes", stderr: "claude should not run", exitCode: 1 }],
        options: { testCommand: "echo 'expected 2, got 3'; exit 1" },
      });
      expect(confirmation).toStrictEqual({ _tag: "failed" });
      expect(plugin.claude.spawned()).toStrictEqual([]);
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );
});
