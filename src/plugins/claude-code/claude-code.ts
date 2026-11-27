import { Effect, Layer } from "effect";

import { makeArtifactStore } from "./artifacts.ts";
import type { ClaudeCodeOptions } from "./claude-code-options.ts";
import { resolvePluginSettings } from "./claude-code-options.ts";
import { claudePorts } from "./claude-ports.ts";
import { makeClaudeRunner } from "./claude-runner.ts";
import type { PluginParts } from "./port-run.ts";
import type { RoleName } from "./role-name.ts";
import { loadRole } from "./roles.ts";
import { makeTestCommandRunner } from "./test-command.ts";

/**
 * The Claude Code Agent plugin: fills the Agent ports by running the user's
 * own `claude` CLI in print mode, once per port call, in a role made for
 * that job, and decoding a structured answer checked against the port's
 * schema. It never handles credentials (ADR 0019). Every port shares one
 * cap on concurrent runs. Needs a child process spawner, a file system
 * and paths, which the NodeServices layer of @effect/platform-node provides;
 * fails to build when a role file or an env var prefixed ROUAGE_CLAUDE_CODE_
 * is invalid.
 */
export const claudeCode = (options: ClaudeCodeOptions = {}) =>
  Layer.effectContext(
    Effect.gen(function* () {
      const plugin = yield* resolvePluginSettings(options);
      const runner = yield* makeClaudeRunner(plugin);
      const store = yield* makeArtifactStore(plugin.artifactsDir);
      const tests = yield* makeTestCommandRunner(plugin.testCommand);
      const parts: PluginParts = { runner, plugin, store, tests };
      return yield* claudePorts(parts, (name: RoleName) => loadRole(name, plugin, options));
    }),
  );
