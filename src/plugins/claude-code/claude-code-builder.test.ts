import { describe, expect, it } from "@effect/vitest";
import { Effect, FileSystem, Path } from "effect";

import type { BuildTask, FixTask, ReproductionCheckTask } from "../../index.ts";
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

const fixTaskIn = (sandboxRef: string): FixTask => ({
  ...buildTaskIn(sandboxRef),
  failures: "1 failed: saving a draft keeps its title",
});

const reproductionCheckIn = (sandboxRef: string): ReproductionCheckTask => ({
  workItemId: "work-item-7",
  sandboxRef,
  reproductionRef: "/work/acme/.rouage/artifacts/work-item-7/reproduction.md",
});

const claudeMustNotRun = [
  { _tag: "crashes", stderr: "claude should not run", exitCode: 1 },
] as const;

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

  it.effect(
    "runs the implement role's Bash in Claude Code's sandbox, writing only in the workspace",
    () =>
      Effect.gen(function* () {
        const { args } = yield* builtOn(
          { runs: [{ _tag: "replays", transcript: "implement-done" }] },
          (builder, workspace) => builder.implement(buildTaskIn(workspace)),
        );
        expect(JSON.parse(flagValue(args, "--settings") ?? "")).toStrictEqual({
          disableAllHooks: true,
          sandbox: {
            enabled: true,
            failIfUnavailable: true,
            allowUnsandboxedCommands: false,
            network: { allowedDomains: ["*"] },
          },
        });
        expect(args).not.toContain("--add-dir");
      }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("leaves Bash unsandboxed when the role bypasses permissions", () =>
    Effect.gen(function* () {
      const { args } = yield* builtOn(
        {
          runs: [{ _tag: "replays", transcript: "implement-done" }],
          options: { permissionMode: "bypassPermissions" },
        },
        (builder, workspace) => builder.implement(buildTaskIn(workspace)),
      );
      expect(flagValue(args, "--settings")).toBe('{"disableAllHooks":true}');
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("gives up with Claude's reason when it cannot make the change", () =>
    Effect.gen(function* () {
      const gaveUp = yield* Effect.flip(
        builtOn(
          { runs: [{ _tag: "replays", transcript: "implement-stuck" }] },
          (builder, workspace) => builder.implement(buildTaskIn(workspace)),
        ),
      );
      expect(gaveUp._tag).toBe("BuilderGaveUp");
      expect(gaveUp.message).toBe("The plan changes src/draft.ts, which the sandbox does not hold");
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect(
    "fails the tests with all the test command printed in the workspace, without asking Claude",
    () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const { outcome, plugin, sandbox } = yield* builtOn(
          {
            runs: claudeMustNotRun,
            options: {
              testCommand: 'echo "1 failed in $(basename "$PWD")"; echo oops >&2; exit 1',
            },
          },
          (builder, workspace) => builder.test(buildTaskIn(workspace)),
        );
        expect(outcome).toStrictEqual({
          _tag: "failed",
          failures: `1 failed in ${path.basename(sandbox)}\noops\n`,
        });
        expect(plugin.claude.spawned()).toStrictEqual([]);
      }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("passes the tests when the test command exits 0", () =>
    Effect.gen(function* () {
      const { outcome } = yield* builtOn(
        { runs: claudeMustNotRun, options: { testCommand: "echo '12 passed'" } },
        (builder, workspace) => builder.test(buildTaskIn(workspace)),
      );
      expect(outcome).toStrictEqual({ _tag: "passed" });
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("asks Claude in the test role, in the workspace, when no test command is set", () =>
    Effect.gen(function* () {
      const { outcome, args, cwd, sandbox } = yield* builtOn(
        { runs: [{ _tag: "replays", transcript: "test-failed" }] },
        (builder, workspace) => builder.test(buildTaskIn(workspace)),
      );
      expect(outcome).toStrictEqual({
        _tag: "failed",
        failures: '1 failed: saving a draft keeps its title (expected "Notes", got "")',
      });
      expect(cwd).toBe(sandbox);
      expect(flagValue(args, "--agent")).toBe("rouage-test");
      expect(flagValue(args, "--permission-mode")).toBe("acceptEdits");
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("passes the tests when Claude saw them pass", () =>
    Effect.gen(function* () {
      const { outcome } = yield* builtOn(
        { runs: [{ _tag: "replays", transcript: "test-passed" }] },
        (builder, workspace) => builder.test(buildTaskIn(workspace)),
      );
      expect(outcome).toStrictEqual({ _tag: "passed" });
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("fixes the change in the fix role, giving Claude what failed", () =>
    Effect.gen(function* () {
      const { args, cwd, sandbox } = yield* builtOn(
        { runs: [{ _tag: "replays", transcript: "fix-done" }] },
        (builder, workspace) => builder.fix(fixTaskIn(workspace)),
      );
      expect(cwd).toBe(sandbox);
      expect(flagValue(args, "--agent")).toBe("rouage-fix");
      expect(flagValue(args, "--permission-mode")).toBe("acceptEdits");
      expect(yield* promptOf(args, "rouage-fix")).toContain(
        "1 failed: saving a draft keeps its title",
      );
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect(
    "checks the reproduction still fails with the test command's output, without asking Claude",
    () =>
      Effect.gen(function* () {
        const { outcome, plugin } = yield* builtOn(
          { runs: claudeMustNotRun, options: { testCommand: "echo 'expected 2, got 3'; exit 1" } },
          (builder, workspace) => builder.checkReproduction(reproductionCheckIn(workspace)),
        );
        expect(outcome).toStrictEqual({ _tag: "failed", failures: "expected 2, got 3\n" });
        expect(plugin.claude.spawned()).toStrictEqual([]);
      }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect(
    "asks Claude in the checkReproduction role, in the workspace, to run the reproduction when no test command is set",
    () =>
      Effect.gen(function* () {
        const { outcome, args, cwd, sandbox } = yield* builtOn(
          { runs: [{ _tag: "replays", transcript: "check-reproduction-passed" }] },
          (builder, workspace) => builder.checkReproduction(reproductionCheckIn(workspace)),
        );
        expect(outcome).toStrictEqual({ _tag: "passed" });
        expect(cwd).toBe(sandbox);
        expect(flagValue(args, "--agent")).toBe("rouage-checkReproduction");
        expect(flagValue(args, "--permission-mode")).toBe("acceptEdits");
        expect(yield* promptOf(args, "rouage-checkReproduction")).toContain(
          "/work/acme/.rouage/artifacts/work-item-7/reproduction.md",
        );
      }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("gives up with claude's exit code and stderr when a fix run crashes", () =>
    Effect.gen(function* () {
      const gaveUp = yield* Effect.flip(
        builtOn(
          { runs: [{ _tag: "crashes", stderr: "Error: boom\n", exitCode: 2 }] },
          (builder, workspace) => builder.fix(fixTaskIn(workspace)),
        ),
      );
      expect(gaveUp._tag).toBe("BuilderGaveUp");
      expect(gaveUp.message).toBe("claude exited with code 2 without a result: Error: boom");
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("gives up when the test command cannot start in the workspace", () =>
    Effect.gen(function* () {
      const gaveUp = yield* Effect.flip(
        builtOn({ runs: claudeMustNotRun, options: { testCommand: "exit 0" } }, (builder) =>
          builder.test(buildTaskIn("/no/such/sandbox/work-item-7")),
        ),
      );
      expect(gaveUp._tag).toBe("BuilderGaveUp");
      expect(gaveUp.message).toContain("The test command `exit 0` could not run");
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );
});
