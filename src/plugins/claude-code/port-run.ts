import { Effect } from "effect";
import type { Schema } from "effect";

import type { ArtifactStore } from "./artifacts.ts";
import type { PluginSettings } from "./claude-code-options.ts";
import { workingDirOf } from "./claude-code-options.ts";
import type { ClaudeRunner } from "./claude-runner.ts";
import type { Role } from "./roles.ts";
import { fillTemplate } from "./roles.ts";
import type { TestCommandRunner, TestRun } from "./test-command.ts";

/** What every port of the plugin works with, shared by all of them. */
export interface PluginParts {
  readonly runner: ClaudeRunner;
  readonly plugin: PluginSettings;
  readonly store: ArtifactStore;
  /** The test command's runner, or null when Claude judges the tests instead. */
  readonly tests: TestCommandRunner | null;
}

/** The answer a port's run gives, and the JSON Schema Claude checks it against. */
export interface PortAnswer<A> {
  readonly answer: Schema.Decoder<{ readonly answer: A }>;
  readonly jsonSchema: unknown;
}

/** A task as a role runs it: its fields fill the role's template, and Claude works in its sandbox when it has one. */
export type RoleTask = Readonly<Record<string, unknown>> & {
  readonly workItemId: string;
  readonly sandboxRef?: string | null;
};

/** The port's answer from one run of `role` on `task`, in the task's sandbox, or the repository checkout before Provision. */
export const runRole = <A>(parts: PluginParts, role: Role, port: PortAnswer<A>, task: RoleTask) =>
  Effect.map(
    parts.runner.run(
      {
        role,
        workItemId: task.workItemId,
        instructions: fillTemplate(role.template, task),
        jsonSchema: port.jsonSchema,
        cwd: workingDirOf(parts.plugin, task.sandboxRef ?? null),
      },
      port.answer,
    ),
    ({ answer }) => answer,
  );

/**
 * `fromTests` of the test command's run in the task's sandbox when one is
 * set, so the check rests on the tests and not on the agent that made the
 * change; `fromClaude` otherwise (ADR 0010).
 */
export const judgedByTests = <A, E>(
  parts: PluginParts,
  task: { readonly sandboxRef: string },
  fromTests: (run: TestRun) => A,
  fromClaude: () => Effect.Effect<A, E>,
) =>
  parts.tests === null
    ? fromClaude()
    : Effect.map(parts.tests.run(workingDirOf(parts.plugin, task.sandboxRef)), fromTests);
