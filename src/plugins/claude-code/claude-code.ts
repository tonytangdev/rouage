import { Effect, Layer } from "effect";

import { Classifier } from "../../index.ts";
import { claudeClassifier } from "./claude-classifier.ts";
import type { ClaudeCodeOptions } from "./claude-code-options.ts";
import { resolvePluginSettings } from "./claude-code-options.ts";
import { makeClaudeRunner } from "./claude-runner.ts";
import { loadRole } from "./roles.ts";

/**
 * The Claude Code Agent plugin: fills the Agent ports by running the user's
 * own `claude` CLI in print mode, once per port call, in a role made for
 * that job, and decoding a structured answer checked against the port's
 * schema. It never handles credentials (ADR 0019). Needs a child process
 * spawner, a file system and paths, which the NodeServices layer of
 * @effect/platform-node provides; fails to build when a role file or an env
 * var prefixed ROUAGE_CLAUDE_CODE_ is invalid.
 */
export const claudeCode = (options: ClaudeCodeOptions = {}) =>
  Layer.effect(
    Classifier,
    Effect.gen(function* () {
      const plugin = yield* resolvePluginSettings(options);
      const runner = yield* makeClaudeRunner(plugin);
      const classify = yield* loadRole("classify", plugin, options);
      return claudeClassifier(runner, classify, plugin);
    }),
  );
