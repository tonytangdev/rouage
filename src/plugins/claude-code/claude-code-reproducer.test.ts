import { describe, expect, it } from "@effect/vitest";
import { Effect, FileSystem, Path } from "effect";

import type { ConfirmTask } from "../../index.ts";
import { Reproducer } from "../../index.ts";
import type { PluginUnderTest } from "./claude-code-harness.ts";
import { flagValue, nodeFiles, pluginUnderTest, promptOf } from "./claude-code-harness.ts";

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

  it.effect(
    "reports the bug did not show when the test command passes in the workspace, with all it printed",
    () =>
      Effect.gen(function* () {
        const { confirmation, sandbox } = yield* confirmedOn({
          runs: [{ _tag: "crashes", stderr: "claude should not run", exitCode: 1 }],
          options: {
            testCommand: 'echo "1 passed in $(basename "$PWD")"; echo \'no warnings\' >&2',
          },
        });
        const path = yield* Path.Path;
        expect(confirmation).toStrictEqual({
          _tag: "passed",
          output: `1 passed in ${path.basename(sandbox)}\nno warnings\n`,
        });
      }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect(
    "asks Claude in the confirm role, in the workspace, to run the reproduction when no test command is set",
    () =>
      Effect.gen(function* () {
        const { confirmation, plugin, sandbox } = yield* confirmedOn({
          runs: [{ _tag: "replays", transcript: "confirm-failed" }],
        });
        expect(confirmation).toStrictEqual({ _tag: "failed" });
        const [run] = plugin.claude.spawned();
        expect(run?.cwd).toBe(sandbox);
        expect(flagValue(run?.args ?? [], "--agent")).toBe("rouage-confirm");
        expect(yield* promptOf(run?.args ?? [], "rouage-confirm")).toContain(
          "/work/acme/.rouage/artifacts/work-item-7/reproduction.md",
        );
      }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect(
    "reports the bug did not show when Claude saw the reproduction pass, with what it printed",
    () =>
      Effect.gen(function* () {
        const { confirmation } = yield* confirmedOn({
          runs: [{ _tag: "replays", transcript: "confirm-passed" }],
        });
        expect(confirmation).toStrictEqual({
          _tag: "passed",
          output: "1 passed: saving a draft keeps its title",
        });
      }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );
});
