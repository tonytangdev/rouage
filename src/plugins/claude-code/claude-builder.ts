import { Effect, Schema } from "effect";

import type { BuildTask, FixTask, ReproductionCheckTask, TestReport } from "../../index.ts";
import { Builder, BuilderGaveUp } from "../../index.ts";
import { portAnswerOf } from "./port-answer.ts";
import type { PluginParts } from "./port-run.ts";
import { judgedByTests, runRole } from "./port-run.ts";
import type { Role } from "./roles.ts";
import type { TestRun } from "./test-command.ts";

const changeMade = portAnswerOf(
  Schema.Union([
    Schema.TaggedStruct("done", {}),
    Schema.TaggedStruct("stuck", { reason: Schema.NonEmptyString }),
  ]),
);

const testReport = portAnswerOf(
  Schema.Union([
    Schema.TaggedStruct("passed", {}),
    Schema.TaggedStruct("failed", { failures: Schema.String }),
  ]),
);

/** The code-changing roles the Claude Code builder runs, one per Builder method. */
export interface BuilderRoles {
  readonly implement: Role;
  readonly test: Role;
  readonly fix: Role;
  readonly checkReproduction: Role;
}

const gaveUp = (failure: { readonly message: string }) =>
  new BuilderGaveUp({ message: failure.message });

const reportOf = (run: TestRun): TestReport =>
  run._tag === "passed" ? { _tag: "passed" } : { _tag: "failed", failures: run.output };

const reported = (parts: PluginParts, role: Role, task: BuildTask | ReproductionCheckTask) =>
  judgedByTests(parts, task, reportOf, () =>
    Effect.map(runRole(parts, role, testReport, task), (answer): TestReport => answer),
  ).pipe(Effect.mapError(gaveUp));

const changed = (parts: PluginParts, role: Role, task: BuildTask | FixTask) =>
  runRole(parts, role, changeMade, task).pipe(
    Effect.mapError(gaveUp),
    Effect.flatMap((answer) =>
      answer._tag === "done"
        ? Effect.void
        : Effect.fail(new BuilderGaveUp({ message: answer.reason })),
    ),
  );

/**
 * The Builder port done in the code-changing `implement`, `test`, `fix` and
 * `checkReproduction` roles, in the sandbox's workspace. `test` and
 * `checkReproduction` run the test command instead of asking Claude when it is
 * set, passing only when it exits 0 (ADR 0010).
 */
export const claudeBuilder = (parts: PluginParts, roles: BuilderRoles) =>
  Builder.of({
    implement: (task) => changed(parts, roles.implement, task),
    test: (task) => reported(parts, roles.test, task),
    fix: (task) => changed(parts, roles.fix, task),
    checkReproduction: (task) => reported(parts, roles.checkReproduction, task),
  });
