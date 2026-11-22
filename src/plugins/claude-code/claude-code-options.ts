import { Config, Effect, Option, Path, Schema } from "effect";

import type { RoleName } from "./role-name.ts";
import type { RoleSettingsLayer } from "./role-settings.ts";
import { envPrefix } from "./role-settings.ts";

/**
 * Options of the Claude Code plugin. Every plain option can also be set by
 * an env var prefixed ROUAGE_CLAUDE_CODE_, which wins over the option; the
 * role settings can be set for one role under `roles` and by an env var
 * prefixed ROUAGE_CLAUDE_CODE_<ROLE>_, which win over the global ones.
 */
export interface ClaudeCodeOptions extends RoleSettingsLayer {
  /** The `claude` binary to run; `claude` on the PATH by default. */
  readonly claudePath?: string | undefined;
  /** The repository checkout the stages before Provision run in; the current directory by default. */
  readonly repoDir?: string | undefined;
  /** Where each work item's artifacts and run transcripts are kept; `.rouage/artifacts` by default. */
  readonly artifactsDir?: string | undefined;
  /** A folder of role files, each replacing the default role of the same name. */
  readonly rolesDir?: string | undefined;
  /** The Claude config folder the runs use, set as CLAUDE_CONFIG_DIR; Claude Code's own by default. */
  readonly configDir?: string | undefined;
  /** How many Claude runs may run at once, the rest queued; 1 by default. */
  readonly maxConcurrentRuns?: number | undefined;
  /**
   * The shell command that runs the tests in the sandbox's workspace. When
   * set, the test-judged steps run it and are judged by its exit code
   * instead of by Claude (ADR 0010).
   */
  readonly testCommand?: string | undefined;
  /** The directory Claude works in for a sandbox reference; the reference as a path by default. */
  readonly workspace?: ((sandboxRef: string) => string) | undefined;
  /** Settings for one role, over the global ones. */
  readonly roles?: Partial<Record<RoleName, RoleSettingsLayer>> | undefined;
}

/** The settings of the plugin as a whole, resolved from defaults, options and env. */
export interface PluginSettings {
  readonly claudePath: string;
  readonly repoDir: string | undefined;
  /** Absolute, since an artifact's reference is its absolute path (ADR 0004). */
  readonly artifactsDir: string;
  readonly rolesDir: string | undefined;
  readonly configDir: string | undefined;
  readonly maxConcurrentRuns: number;
  readonly testCommand: string | undefined;
  readonly workspace: (sandboxRef: string) => string;
}

const sandboxRefAsPath = (sandboxRef: string) => sandboxRef;

const env = <A>(config: Config.Config<A>) =>
  Config.map(Config.option(config), Option.getOrUndefined);

const pluginEnv = Config.all({
  claudePath: env(Config.String(`${envPrefix}CLAUDE_PATH`)),
  repoDir: env(Config.String(`${envPrefix}REPO_DIR`)),
  artifactsDir: env(Config.String(`${envPrefix}ARTIFACTS_DIR`)),
  rolesDir: env(Config.String(`${envPrefix}ROLES_DIR`)),
  configDir: env(Config.String(`${envPrefix}CONFIG_DIR`)),
  testCommand: env(Config.String(`${envPrefix}TEST_COMMAND`)),
  maxConcurrentRuns: env(
    Config.schema(Schema.Int.check(Schema.isGreaterThan(0)), `${envPrefix}MAX_CONCURRENT_RUNS`),
  ),
});

const firstSet = <A>(...values: ReadonlyArray<A | undefined>) =>
  values.find((value) => value !== undefined);

/** The plugin-wide settings `options` and env give, env winning; fails at once when an env var does not parse. */
export const resolvePluginSettings = Effect.fnUntraced(function* (options: ClaudeCodeOptions) {
  const fromEnv = yield* pluginEnv;
  const path = yield* Path.Path;
  const repoDir = firstSet(fromEnv.repoDir, options.repoDir);
  const artifactsDir = firstSet(fromEnv.artifactsDir, options.artifactsDir) ?? ".rouage/artifacts";
  return {
    claudePath: firstSet(fromEnv.claudePath, options.claudePath) ?? "claude",
    repoDir,
    artifactsDir: path.resolve(repoDir ?? ".", artifactsDir),
    rolesDir: firstSet(fromEnv.rolesDir, options.rolesDir),
    configDir: firstSet(fromEnv.configDir, options.configDir),
    maxConcurrentRuns: firstSet(fromEnv.maxConcurrentRuns, options.maxConcurrentRuns) ?? 1,
    testCommand: firstSet(fromEnv.testCommand, options.testCommand),
    workspace: options.workspace ?? sandboxRefAsPath,
  } satisfies PluginSettings;
});

/** Where Claude works for a task: the repository checkout before Provision, the sandbox's workspace after. */
export const workingDirOf = (plugin: PluginSettings, sandboxRef: string | null) =>
  sandboxRef === null ? plugin.repoDir : plugin.workspace(sandboxRef);
