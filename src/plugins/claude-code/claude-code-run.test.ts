import { describe, expect, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path, Schema } from "effect";

import { Classifier } from "../../index.ts";
import type { PluginUnderTest } from "./claude-code-harness.ts";
import { classifyTask, flagValue, nodeFiles, pluginUnderTest } from "./claude-code-harness.ts";

const answers = [{ _tag: "replays", transcript: "classified-as-bug" }] as const;

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

/** The command line, cwd and env of the one run a classification started, with the plugin's artifacts folder. */
const runOfClassifying = (setup: Omit<PluginUnderTest, "runs">) =>
  Effect.gen(function* () {
    const plugin = yield* pluginUnderTest({ runs: answers, ...setup });
    yield* Effect.flatMap(Classifier, (classifier) => classifier.classify(classifyTask)).pipe(
      Effect.provide(plugin.layer),
    );
    expect(plugin.claude.spawned()).toHaveLength(1);
    const [spawned] = plugin.claude.spawned();
    return { args: [], env: {}, ...spawned, artifactsDir: plugin.artifactsDir };
  });

const tempDir = Effect.flatMap(FileSystem.FileSystem, (fs) => fs.makeTempDirectoryScoped());

describe("the Claude Code run a classification starts", () => {
  it.effect("runs claude from the PATH in print mode in the classify role", () =>
    Effect.gen(function* () {
      const run = yield* runOfClassifying({});
      expect(run.command).toBe("claude");
      expect(run.args.slice(0, 1)).toStrictEqual(["-p"]);
      expect(flagValue(run.args, "--output-format")).toBe("stream-json");
      expect(flagValue(run.args, "--agent")).toBe("rouage-classify");
      const agents = yield* Schema.decodeUnknownEffect(AgentsSchema)(
        flagValue(run.args, "--agents"),
      );
      expect(agents["rouage-classify"]?.prompt).toContain("The issue is: tonytangdev/rouage#7");
      expect(agents["rouage-classify"]?.tools).toContain("StructuredOutput");
      expect(run.args).toContain("--no-session-persistence");
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("checks the answer against a schema made from the classification", () =>
    Effect.gen(function* () {
      const run = yield* runOfClassifying({});
      expect(JSON.parse(flagValue(run.args, "--json-schema") ?? "")).toMatchObject({
        type: "object",
        required: ["answer"],
        properties: {
          answer: { anyOf: [{ required: ["_tag", "kind"] }, { required: ["_tag", "reason"] }] },
        },
      });
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("gives claude only the role's own MCP servers", () =>
    Effect.gen(function* () {
      const github = { command: "github-mcp", env: { GITHUB_TOKEN: "${GITHUB_TOKEN}" } };
      const run = yield* runOfClassifying({ options: { mcpServers: { github } } });
      expect(JSON.parse(flagValue(run.args, "--mcp-config") ?? "")).toStrictEqual({
        mcpServers: { github },
      });
      expect(run.args).toContain("--strict-mcp-config");
      expect(flagValue(run.args, "--allowedTools")).toContain("mcp__github");
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("lets the read-only classify role read but not edit, denying undeclared skills", () =>
    Effect.gen(function* () {
      const run = yield* runOfClassifying({});
      expect(flagValue(run.args, "--permission-mode")).toBe("dontAsk");
      expect(flagValue(run.args, "--allowedTools")).toBe(
        "Read,Grep,Glob,Bash(gh issue view:*),Bash(git log:*),Bash(git show:*)",
      );
      expect(flagValue(run.args, "--disallowedTools")).toBe("Skill");
      expect(flagValue(run.args, "--settings")).toBe('{"disableAllHooks":true}');
      expect(run.args).toContain("--disable-slash-commands");
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("removes the launching Claude session's variables and keeps the rest of the env", () =>
    Effect.gen(function* () {
      const run = yield* runOfClassifying({});
      expect(run.extendEnv).toBe(true);
      expect(run.env).toMatchObject({
        CLAUDECODE: undefined,
        CLAUDE_CODE_SESSION_ID: undefined,
        CLAUDE_CODE_SIMPLE: undefined,
        CLAUDE_CODE_ENTRYPOINT: "rouage",
      });
      expect(Object.keys(run.env)).not.toContain("CLAUDE_CONFIG_DIR");
      expect(Object.keys(run.env)).not.toContain("HOME");
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("points claude at the Claude config folder it is given", () =>
    Effect.gen(function* () {
      const run = yield* runOfClassifying({
        options: { configDir: "/home/factory/.claude-rouage" },
      });
      expect(run.env["CLAUDE_CONFIG_DIR"]).toBe("/home/factory/.claude-rouage");
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("runs claude at the path and in the repository checkout it is given", () =>
    Effect.gen(function* () {
      const run = yield* runOfClassifying({
        options: { claudePath: "/opt/claude/bin/claude", repoDir: "/work/acme" },
      });
      expect(run.command).toBe("/opt/claude/bin/claude");
      expect(run.cwd).toBe("/work/acme");
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("saves the run's transcript next to the work item's artifacts", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const run = yield* runOfClassifying({});
      const runsDir = path.join(run.artifactsDir, "work-item-7", "runs");
      const [transcript] = yield* fs.readDirectory(runsDir);
      expect(transcript).toMatch(/^classify-\d+\.jsonl$/u);
      const saved = yield* fs.readFileString(path.join(runsDir, transcript ?? ""));
      expect(saved).toContain('"structured_output"');
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("saves no transcript when transcripts are turned off", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const run = yield* runOfClassifying({ options: { keepTranscripts: false } });
      expect(yield* fs.readDirectory(run.artifactsDir)).toStrictEqual([]);
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("uses a role file of the same name from the roles folder instead of the default", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const rolesDir = yield* tempDir;
      yield* fs.writeFileString(
        `${rolesDir}/classify.md`,
        "---\ndescription: Our own classifier\ntools:\n  - Read\nmodel: haiku\n---\nTriage {{issueRef}} our way.\n",
      );
      const run = yield* runOfClassifying({ options: { rolesDir } });
      const agents = yield* Schema.decodeUnknownEffect(AgentsSchema)(
        flagValue(run.args, "--agents"),
      );
      expect(agents).toMatchObject({
        "rouage-classify": {
          description: "Our own classifier",
          prompt: "Triage tonytangdev/rouage#7 our way.",
          tools: ["Read", "StructuredOutput"],
          model: "haiku",
        },
      });
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );
});

describe("the precedence of the Claude Code plugin's settings", () => {
  it.effect("takes the turn limit from the role file when nothing else sets it", () =>
    Effect.gen(function* () {
      const run = yield* runOfClassifying({});
      expect(flagValue(run.args, "--max-turns")).toBe("20");
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("puts a global option over the role file", () =>
    Effect.gen(function* () {
      const run = yield* runOfClassifying({ options: { maxTurns: 5 } });
      expect(flagValue(run.args, "--max-turns")).toBe("5");
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("puts a global env var over a global option", () =>
    Effect.gen(function* () {
      const run = yield* runOfClassifying({
        options: { maxTurns: 5 },
        env: { ROUAGE_CLAUDE_CODE_MAX_TURNS: "6" },
      });
      expect(flagValue(run.args, "--max-turns")).toBe("6");
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("puts a per-role option over a global env var", () =>
    Effect.gen(function* () {
      const run = yield* runOfClassifying({
        options: { maxTurns: 5, roles: { classify: { maxTurns: 7 } } },
        env: { ROUAGE_CLAUDE_CODE_MAX_TURNS: "6" },
      });
      expect(flagValue(run.args, "--max-turns")).toBe("7");
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("puts a per-role env var over a per-role option", () =>
    Effect.gen(function* () {
      const run = yield* runOfClassifying({
        options: { roles: { classify: { maxTurns: 7 } } },
        env: { ROUAGE_CLAUDE_CODE_CLASSIFY_MAX_TURNS: "8" },
      });
      expect(flagValue(run.args, "--max-turns")).toBe("8");
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("fails to build when an env var does not parse", () =>
    Effect.gen(function* () {
      const plugin = yield* pluginUnderTest({
        runs: answers,
        env: { ROUAGE_CLAUDE_CODE_MAX_TURNS: "lots" },
      });
      const error = yield* Effect.flip(Layer.build(plugin.layer));
      expect(error._tag).toBe("ConfigError");
      expect(String(error)).toContain("ROUAGE_CLAUDE_CODE_MAX_TURNS");
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );
});
