import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { ConfigProvider, Effect, FileSystem, Layer, Schema } from "effect";

import type { ClassifyTask, PlanTask, ReviewTask, WriteTask } from "../../index.ts";
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

/** A write task as Spec first asks it, for a bug Intake classified. */
export const writeTask: WriteTask = {
  workItemId: "work-item-7",
  issueRef: "tonytangdev/rouage#7",
  kind: "bug",
  feedback: null,
  previousSpecRef: null,
};

/** A plan task as Plan first asks it, for a reproduced bug in its sandbox. */
export const planTask: PlanTask = {
  workItemId: "work-item-7",
  issueRef: "tonytangdev/rouage#7",
  kind: "bug",
  feedback: null,
  specRef: "/work/acme/.rouage/artifacts/work-item-7/spec.md",
  sandboxRef: "/sandboxes/work-item-7",
  sampleRef: null,
  reproductionRef: "/work/acme/.rouage/artifacts/work-item-7/reproduction.md",
  previousPlanRef: null,
};

/** A review task as Review first asks it, for a built and demonstrated bug fix. */
export const reviewTask: ReviewTask = {
  workItemId: "work-item-7",
  issueRef: "tonytangdev/rouage#7",
  kind: "bug",
  feedback: null,
  specRef: "/work/acme/.rouage/artifacts/work-item-7/spec.md",
  planRef: "/work/acme/.rouage/artifacts/work-item-7/plan.md",
  sandboxRef: "/sandboxes/work-item-7",
  reproductionRef: "/work/acme/.rouage/artifacts/work-item-7/reproduction.md",
  demoRef: null,
  changeRequest: null,
};

/** How a test sets up the plugin: the fake runs, the options and the env it reads. */
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

const AgentsSchema = Schema.fromJsonString(
  Schema.Record(
    Schema.String,
    Schema.Struct({
      description: Schema.String,
      prompt: Schema.String,
      tools: Schema.Array(Schema.String),
      model: Schema.optional(Schema.String),
    }),
  ),
);

/** The agents a run started with `args` was given in `--agents`, by name. */
export const agentsIn = (args: readonly string[]) =>
  Schema.decodeUnknownEffect(AgentsSchema)(flagValue(args, "--agents"));

/** The instructions the `agent` of a run started with `args` was given. */
export const promptOf = (args: readonly string[], agent: string) =>
  Effect.map(agentsIn(args), (agents) => agents[agent]?.prompt ?? "");

/** The value `flag` was given in `args`, or undefined when it was not passed. */
export const flagValue = (args: readonly string[], flag: string) => {
  const at = args.indexOf(flag);
  return at === -1 ? undefined : args[at + 1];
};
