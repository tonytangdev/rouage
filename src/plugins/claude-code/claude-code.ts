import { Context, Effect, Layer } from "effect";

import { Builder, Classifier, Planner, Reproducer, Reviewer, SpecWriter } from "../../index.ts";
import { makeArtifactStore } from "./artifacts.ts";
import { claudeBuilder } from "./claude-builder.ts";
import { claudeClassifier } from "./claude-classifier.ts";
import type { ClaudeCodeOptions } from "./claude-code-options.ts";
import { resolvePluginSettings } from "./claude-code-options.ts";
import { claudePlanner } from "./claude-planner.ts";
import { claudeReproducer } from "./claude-reproducer.ts";
import { claudeReviewer } from "./claude-reviewer.ts";
import { makeClaudeRunner } from "./claude-runner.ts";
import { claudeSpecWriter } from "./claude-spec-writer.ts";
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
      const role = (name: Parameters<typeof loadRole>[0]) => loadRole(name, plugin, options);
      return Context.make(
        Classifier,
        claudeClassifier(runner, yield* role("classify"), plugin),
      ).pipe(
        Context.add(SpecWriter, claudeSpecWriter(runner, yield* role("write"), plugin, store)),
        Context.add(
          Reproducer,
          claudeReproducer({
            runner,
            capture: yield* role("capture"),
            confirm: yield* role("confirm"),
            plugin,
            store,
            tests,
          }),
        ),
        Context.add(
          Builder,
          claudeBuilder({
            runner,
            implement: yield* role("implement"),
            test: yield* role("test"),
            fix: yield* role("fix"),
            checkReproduction: yield* role("checkReproduction"),
            plugin,
            tests,
          }),
        ),
        Context.add(Planner, claudePlanner(runner, yield* role("plan"), plugin, store)),
        Context.add(Reviewer, claudeReviewer(runner, yield* role("review"), plugin, store)),
      );
    }),
  );
