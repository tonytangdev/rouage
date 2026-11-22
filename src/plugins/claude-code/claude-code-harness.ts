import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { ConfigProvider, Effect, FileSystem, Layer } from "effect";

import type { ClassifyTask } from "../../index.ts";
import type { ClaudeCodeOptions } from "./claude-code-options.ts";
import { claudeCode } from "./claude-code.ts";
import type { FakeRun } from "./fake-claude.ts";
import { fakeClaude } from "./fake-claude.ts";

/** The real file system and paths the plugin keeps its roles, artifacts and transcripts in. */
export const nodeFiles = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

/** A classify task as Intake first asks it. */
export const classifyTask: ClassifyTask = {
  workItemId: "work-item-7",
  issueRef: "tonytangdev/rouage#7",
  feedback: null,
};

export interface PluginUnderTest {
  /** The fake `claude` runs go as. */
  readonly runs: readonly [FakeRun, ...FakeRun[]];
  readonly options?: ClaudeCodeOptions | undefined;
  /** The env the plugin reads its env vars from, instead of the real one. */
  readonly env?: Readonly<Record<string, string>> | undefined;
}

/**
 * The plugin's Layer on a fake `claude` that goes as `runs` say, keeping its
 * artifacts in a fresh temporary folder, reading env vars only from `env`.
 */
export const pluginUnderTest = Effect.fnUntraced(function* (setup: PluginUnderTest) {
  const fs = yield* FileSystem.FileSystem;
  const claude = yield* fakeClaude(setup.runs);
  const artifactsDir = yield* fs.makeTempDirectoryScoped({ prefix: "rouage-claude-code-" });
  const layer = claudeCode({ artifactsDir, ...setup.options }).pipe(
    Layer.provide(claude.layer),
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env: setup.env ?? {} }))),
    Layer.provide(nodeFiles),
  );
  return { claude, layer, artifactsDir };
});

/** The value `flag` was given in `args`, or undefined when it was not passed. */
export const flagValue = (args: readonly string[], flag: string) => {
  const at = args.indexOf(flag);
  return at === -1 ? undefined : args[at + 1];
};
