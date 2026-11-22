import { describe, expect, it } from "@effect/vitest";
import { Effect, FileSystem, Path } from "effect";

import type { CaptureTask, ConfirmTask } from "../../index.ts";
import { Reproducer } from "../../index.ts";
import type { PluginUnderTest } from "./claude-code-harness.ts";
import { flagValue, nodeFiles, pluginUnderTest, promptOf } from "./claude-code-harness.ts";

const confirmTaskIn = (sandboxRef: string): ConfirmTask => ({
  workItemId: "work-item-7",
  sandboxRef,
  reproductionRef: "/work/acme/.rouage/artifacts/work-item-7/reproduction.md",
});

const captureTaskIn = (sandboxRef: string): CaptureTask => ({
  workItemId: "work-item-7",
  issueRef: "tonytangdev/rouage#7",
  feedback: null,
  specRef: "/work/acme/.rouage/artifacts/work-item-7/spec.md",
  sandboxRef,
  sampleRef: null,
  sampleRequest: null,
  previousReproductionRef: null,
});

const capturedOn = (setup: PluginUnderTest) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const sandbox = yield* fs.makeTempDirectoryScoped({ prefix: "rouage-sandbox-" });
    const plugin = yield* pluginUnderTest(setup);
    const captured = yield* Effect.flatMap(Reproducer, (reproducer) =>
      reproducer.capture(captureTaskIn(sandbox)),
    ).pipe(Effect.provide(plugin.layer));
    const [run] = plugin.claude.spawned();
    return { captured, plugin, sandbox, args: run?.args ?? [], cwd: run?.cwd };
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

  it.effect(
    "captures a reproduction, storing Claude's record of it in the work item's reproduction file",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const { captured, plugin } = yield* capturedOn({
          runs: [{ _tag: "replays", transcript: "capture-captured" }],
        });
        const reproductionRef = path.join(plugin.artifactsDir, "work-item-7", "reproduction.md");
        expect(captured).toStrictEqual({ _tag: "captured", reproductionRef });
        expect(yield* fs.readFileString(reproductionRef)).toContain(
          "`test/draft.test.ts` saves a draft and checks its title.",
        );
      }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect(
    "asks Claude in the capture role, in the workspace, accepting its edits and letting it run Bash",
    () =>
      Effect.gen(function* () {
        const { args, cwd, sandbox } = yield* capturedOn({
          runs: [{ _tag: "replays", transcript: "capture-captured" }],
        });
        expect(cwd).toBe(sandbox);
        expect(flagValue(args, "--agent")).toBe("rouage-capture");
        expect(flagValue(args, "--permission-mode")).toBe("acceptEdits");
        expect(flagValue(args, "--agents")).toContain('"Bash"');
        expect(yield* promptOf(args, "rouage-capture")).toContain(
          "/work/acme/.rouage/artifacts/work-item-7/spec.md",
        );
      }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("asks for a sample when Claude needs data the sandbox does not hold", () =>
    Effect.gen(function* () {
      const { captured } = yield* capturedOn({
        runs: [{ _tag: "replays", transcript: "capture-needs-sample" }],
      });
      expect(captured).toStrictEqual({
        _tag: "needsSample",
        sampleRequest: "A draft exported from the account that reported the bug",
      });
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("reports the bug cannot be reproduced when Claude could not make it show", () =>
    Effect.gen(function* () {
      const { captured } = yield* capturedOn({
        runs: [{ _tag: "replays", transcript: "capture-cannot-reproduce" }],
      });
      expect(captured).toStrictEqual({
        _tag: "cannotReproduce",
        reason: "Saving a draft keeps its title with every input the issue gives",
      });
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("gives up with claude's exit code and stderr when a capture run crashes", () =>
    Effect.gen(function* () {
      const gaveUp = yield* Effect.flip(
        capturedOn({ runs: [{ _tag: "crashes", stderr: "Error: boom\n", exitCode: 2 }] }),
      );
      expect(gaveUp._tag).toBe("ReproducerGaveUp");
      expect(gaveUp.message).toBe("claude exited with code 2 without a result: Error: boom");
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );
});
