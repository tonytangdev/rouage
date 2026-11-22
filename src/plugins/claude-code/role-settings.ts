import { Config, Duration, Effect, Option, Schema } from "effect";

import type { RoleName } from "./role-name.ts";
import { envSegmentOf } from "./role-name.ts";

/** The permission modes a role can run in, as Claude Code's `--permission-mode` takes them. */
export const PermissionModeSchema = Schema.Literals([
  "acceptEdits",
  "bypassPermissions",
  "default",
  "dontAsk",
  "plan",
]);
export type PermissionMode = typeof PermissionModeSchema.Type;

/** MCP servers by name, each in Claude Code's `.mcp.json` server shape, secrets as `${ENV_VAR}` references. */
export const McpServersSchema = Schema.Record(Schema.String, Schema.Unknown);
export type McpServers = typeof McpServersSchema.Type;

/** How one role runs: every plain option that can be set for the whole plugin or for one role. */
export interface RoleSettings {
  /** The model alias or name, or null for Claude Code's own default. */
  readonly model: string | null;
  readonly maxTurns: number | null;
  readonly maxBudgetUsd: number | null;
  /** How long a run may take once it is running; time queued for a free run slot does not count. */
  readonly timeout: Duration.Duration;
  readonly permissionMode: PermissionMode;
  /** The tools the role may use, in Claude Code's permission-rule syntax, such as `Bash(git log:*)`. */
  readonly allowedTools: readonly string[];
  readonly disallowedTools: readonly string[];
  /**
   * The skills the plugin preloads into the role's instructions, from its
   * skills folder or the repository's `.claude/skills`; any other skill is
   * denied unless `allowUndeclaredSkills`.
   */
  readonly skills: readonly string[];
  readonly allowUndeclaredSkills: boolean;
  readonly mcpServers: McpServers;
  /** Whether the repository's own `.mcp.json` servers join the role's. */
  readonly useProjectMcp: boolean;
  /** Whether each run's transcript is saved next to the work item's artifacts. */
  readonly keepTranscripts: boolean;
  /** Whether a run that hits the usage limit waits for the reset time and runs again, instead of giving up. */
  readonly waitOnUsageLimit: boolean;
}

/** Some of a role's settings, as one source of them gives them. */
export type RoleSettingsLayer = {
  readonly [Key in keyof RoleSettings]?: RoleSettings[Key] | undefined;
};

/** The settings a role gets where neither its file, an option nor an env var sets one. */
export const builtInRoleSettings: RoleSettings = {
  model: null,
  maxTurns: null,
  maxBudgetUsd: null,
  timeout: Duration.minutes(10),
  permissionMode: "dontAsk",
  allowedTools: [],
  disallowedTools: [],
  skills: [],
  allowUndeclaredSkills: false,
  mcpServers: {},
  useProjectMcp: false,
  keepTranscripts: true,
  waitOnUsageLimit: false,
};

/** The prefix of every env var the plugin reads. */
export const envPrefix = "ROUAGE_CLAUDE_CODE_";

const envNameOf = (scope: string, setting: string) =>
  `${envPrefix}${scope}${setting.replaceAll(/[A-Z]/gu, (letter) => `_${letter}`).toUpperCase()}`;

const fromEnv = <A>(read: (name: string) => Config.Config<A>, scope: string, setting: string) =>
  Config.map(Config.option(read(envNameOf(scope, setting))), Option.getOrUndefined);

const list = (name: string) => Config.Array(Schema.String, name);
const json = (name: string) => Config.schema(Schema.fromJsonString(McpServersSchema), name);

const roleSettingsFromEnv = (scope: string): Config.Config<RoleSettingsLayer> =>
  Config.all({
    model: fromEnv(Config.String, scope, "model"),
    maxTurns: fromEnv(Config.Int, scope, "maxTurns"),
    maxBudgetUsd: fromEnv(Config.Finite, scope, "maxBudgetUsd"),
    timeout: fromEnv(Config.Duration, scope, "timeout"),
    permissionMode: fromEnv(
      (name) => Config.schema(PermissionModeSchema, name),
      scope,
      "permissionMode",
    ),
    allowedTools: fromEnv(list, scope, "allowedTools"),
    disallowedTools: fromEnv(list, scope, "disallowedTools"),
    skills: fromEnv(list, scope, "skills"),
    allowUndeclaredSkills: fromEnv(Config.Boolean, scope, "allowUndeclaredSkills"),
    mcpServers: fromEnv(json, scope, "mcpServers"),
    useProjectMcp: fromEnv(Config.Boolean, scope, "useProjectMcp"),
    keepTranscripts: fromEnv(Config.Boolean, scope, "keepTranscripts"),
    waitOnUsageLimit: fromEnv(Config.Boolean, scope, "waitOnUsageLimit"),
  });

/** The settings env vars give for the whole plugin, under `ROUAGE_CLAUDE_CODE_`. */
export const globalSettingsFromEnv = roleSettingsFromEnv("");

/** The settings env vars give for `role`, under `ROUAGE_CLAUDE_CODE_<ROLE>_`. */
export const roleSettingsFromEnvFor = (role: RoleName) =>
  roleSettingsFromEnv(`${envSegmentOf(role)}_`);

const firstSet = <Key extends keyof RoleSettings>(
  key: Key,
  layers: readonly RoleSettingsLayer[],
): RoleSettings[Key] => {
  for (const layer of layers) {
    const value = layer[key];
    if (value !== undefined) {
      return value;
    }
  }
  return builtInRoleSettings[key];
};

/** The settings `layers` give, the first that sets a value winning, and the built-in default where none does. */
export const settingsFrom = (layers: readonly RoleSettingsLayer[]): RoleSettings => ({
  model: firstSet("model", layers),
  maxTurns: firstSet("maxTurns", layers),
  maxBudgetUsd: firstSet("maxBudgetUsd", layers),
  timeout: firstSet("timeout", layers),
  permissionMode: firstSet("permissionMode", layers),
  allowedTools: firstSet("allowedTools", layers),
  disallowedTools: firstSet("disallowedTools", layers),
  skills: firstSet("skills", layers),
  allowUndeclaredSkills: firstSet("allowUndeclaredSkills", layers),
  mcpServers: firstSet("mcpServers", layers),
  useProjectMcp: firstSet("useProjectMcp", layers),
  keepTranscripts: firstSet("keepTranscripts", layers),
  waitOnUsageLimit: firstSet("waitOnUsageLimit", layers),
});

/** The sources of one role's settings, each named for where it comes from. */
export interface RoleSettingsSources {
  readonly roleFile: RoleSettingsLayer;
  readonly globalOption: RoleSettingsLayer;
  readonly roleOption: RoleSettingsLayer;
}

/**
 * `role`'s settings, by the documented precedence, lowest first: built-in
 * default, role file, global option, global env, per-role option, per-role
 * env. Fails at once when an env var does not parse.
 */
export const resolveRoleSettings = Effect.fnUntraced(function* (
  role: RoleName,
  sources: RoleSettingsSources,
) {
  const globalEnv = yield* globalSettingsFromEnv;
  const roleEnv = yield* roleSettingsFromEnvFor(role);
  return settingsFrom([
    roleEnv,
    sources.roleOption,
    globalEnv,
    sources.globalOption,
    sources.roleFile,
  ]);
});
