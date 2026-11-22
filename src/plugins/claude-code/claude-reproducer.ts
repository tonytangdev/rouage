import { Effect, Schema } from "effect";

import type { Captured } from "../../index.ts";
import { Reproducer, ReproducerGaveUp } from "../../index.ts";
import { portAnswerOf } from "./port-answer.ts";
import type { PluginParts } from "./port-run.ts";
import { judgedByTests, runRole } from "./port-run.ts";
import type { Role } from "./roles.ts";
import type { TestRun } from "./test-command.ts";

// Claude gives the reproduction's content as well as writing its check in
// the sandbox, because the artifact must outlive the sandbox; the plugin
// stores it outside and answers with its reference.
const capturing = portAnswerOf(
  Schema.Union([
    Schema.TaggedStruct("captured", { reproduction: Schema.NonEmptyString }),
    Schema.TaggedStruct("needsSample", { sampleRequest: Schema.NonEmptyString }),
    Schema.TaggedStruct("cannotReproduce", { reason: Schema.NonEmptyString }),
  ]),
);

const confirming = portAnswerOf(
  Schema.Union([
    Schema.TaggedStruct("failed", {}),
    Schema.TaggedStruct("passed", { output: Schema.String }),
  ]),
);

/** The code-changing roles the Claude Code reproducer runs, one per Reproducer method. */
export interface ReproducerRoles {
  readonly capture: Role;
  readonly confirm: Role;
}

const gaveUp = (failure: { readonly message: string }) =>
  new ReproducerGaveUp({ message: failure.message });

type CaptureAnswer = typeof capturing.answer.Type.answer;

const isNotCaptured = (
  answer: CaptureAnswer,
): answer is Exclude<CaptureAnswer, { readonly _tag: "captured" }> => answer._tag !== "captured";

const confirmationOf = (run: TestRun) =>
  run._tag === "failed" ? { _tag: "failed" as const } : run;

/**
 * The Reproducer port done in the code-changing `capture` and `confirm`
 * roles, in the sandbox's workspace. `confirm` runs the test command instead of
 * asking Claude when it is set, failing when the command does (ADR 0010).
 */
export const claudeReproducer = (parts: PluginParts, roles: ReproducerRoles) =>
  Reproducer.of({
    capture: (task) =>
      runRole(parts, roles.capture, capturing, task).pipe(
        Effect.filterOrElse(isNotCaptured, (answer) =>
          Effect.map(
            parts.store(task.workItemId, "reproduction", answer.reproduction),
            (reproductionRef): Captured => ({ _tag: "captured", reproductionRef }),
          ),
        ),
        Effect.mapError(gaveUp),
      ),
    confirm: (task) =>
      judgedByTests(parts, task, confirmationOf, () =>
        runRole(parts, roles.confirm, confirming, task),
      ).pipe(Effect.mapError(gaveUp)),
  });
