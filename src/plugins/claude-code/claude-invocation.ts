import { ChildProcess } from "effect/process";

import type { PluginSettings } from "./claude-code-options.ts";
import { agentNameOf } from "./role-name.ts";
import type { RoleSettings } from "./role-settings.ts";
import type { Role } from "./roles.ts";
import type { PreloadedSkill } from "./skills.ts";

/** One run of `claude` for one port call, before it is turned into a command line. */
export interface RunRequest {
  readonly role: Role;
  readonly workItemId: string;
  /** The role's template filled from the task. */
  readonly instructions: string;
  /** The JSON Schema the run's structured output must match. */
  readonly jsonSchema: unknown;
  /** The directory Claude works in, or undefined for the current one. */
  readonly cwd: string | undefined;
}

// Set by a Claude Code session that launched Rouage; a child that inherits
// them takes itself for part of that session.
const launchingSessionVars = [
  "CLAUDECODE",
  "CLAUDE_CODE_ENTRYPOINT",
  "CLAUDE_CODE_SESSION_ID",
  "CLAUDE_CODE_CHILD_SESSION",
  "CLAUDE_CODE_SESSION_ATTENDED",
  "CLAUDE_CODE_MESSAGING_SOCKET",
  "CLAUDE_CODE_MESSAGING_TOKEN",
  "CLAUDE_CODE_EXECPATH",
  "CLAUDE_CODE_CHILD_NOTES_DIR",
  "CLAUDE_AGENT_SDK_VERSION",
  "CLAUDE_PID",
  "CLAUDE_EFFORT",
] as const;

/**
 * The env a run gets over the inherited one: the launching session's
 * variables removed, bare mode turned off, nothing else touched.
 */
export const runEnv = (configDir: string | undefined) => ({
  ...Object.fromEntries(launchingSessionVars.map((name) => [name, undefined])),
  CLAUDE_CODE_ENTRYPOINT: "rouage",
  // Set to a false value rather than removed because bare mode never reads a
  // subscription login, and Claude Code plans to make it print mode's
  // default (ADR 0019).
  CLAUDE_CODE_SIMPLE: "0",
  ...(configDir === undefined ? {} : { CLAUDE_CONFIG_DIR: configDir }),
});

const prompt =
  "Do the job your instructions describe, then give your answer through the structured output.";

// Claude Code ignores an agent's `skills` when the agent runs the main
// thread, and an allow rule for one skill does not fence off the others, so
// the plugin preloads declared skills itself and takes the Skill tool away
// (ADR 0020).
const skillSectionOf = (skill: PreloadedSkill) =>
  `## The ${skill.name} skill\n\nThis skill is preloaded for you; the files it mentions are in ${skill.dir}.\n\n${skill.instructions}`;

const agentPromptOf = (request: RunRequest) =>
  [request.instructions, ...request.role.skills.map(skillSectionOf)].join("\n\n");

const mcpToolsOf = (settings: RoleSettings) =>
  Object.keys(settings.mcpServers).map((server) => `mcp__${server}`);

// An agent with a tools list loses the StructuredOutput tool `--json-schema`
// answers through unless the list names it, as the spike for #57 found.
const agentToolsOf = (settings: RoleSettings) => [
  ...settings.allowedTools,
  ...mcpToolsOf(settings),
  ...(settings.allowUndeclaredSkills ? ["Skill"] : []),
  "StructuredOutput",
];

const agentsOf = (request: RunRequest) => {
  const { settings } = request.role;
  return {
    [agentNameOf(request.role.name)]: {
      description: request.role.description,
      prompt: agentPromptOf(request),
      tools: agentToolsOf(settings),
      ...(settings.disallowedTools.length > 0 ? { disallowedTools: settings.disallowedTools } : {}),
      ...(settings.model === null ? {} : { model: settings.model }),
    },
  };
};

const optional = (flag: string, value: number | null) =>
  value === null ? [] : [flag, String(value)];

const listFlag = (flag: string, values: readonly string[]) =>
  values.length === 0 ? [] : [flag, values.join(",")];

const permissionArgs = (settings: RoleSettings) => [
  "--permission-mode",
  settings.permissionMode,
  ...listFlag("--allowedTools", [...settings.allowedTools, ...mcpToolsOf(settings)]),
  ...listFlag("--disallowedTools", [
    ...settings.disallowedTools,
    ...(settings.allowUndeclaredSkills ? [] : ["Skill"]),
  ]),
];

// Claude Code confines a command-running tool only through its sandbox,
// which lets Bash write in the working directory alone. Its network goes
// through the sandbox's proxy, so a tool that ignores the proxy env vars
// gets none; a role that needs one runs in an isolated sandbox under
// bypassPermissions instead, where Bash is left unsandboxed. Narrow rules
// such as `Bash(git log:*)` already keep a read-only role from writing
// (ADR 0020).
const sandboxesBash = (settings: RoleSettings) =>
  settings.allowedTools.includes("Bash") && settings.permissionMode !== "bypassPermissions";

const bashSandbox = {
  enabled: true,
  failIfUnavailable: true,
  allowUnsandboxedCommands: false,
  network: { allowedDomains: ["*"] },
};

const runSettingsOf = (settings: RoleSettings) => ({
  disableAllHooks: true,
  ...(sandboxesBash(settings) ? { sandbox: bashSandbox } : {}),
});

// The prompt comes right after -p, since a variadic flag such as
// --mcp-config would take a word after it for one of its own.
const argsOf = (request: RunRequest) => {
  const { settings } = request.role;
  return [
    "-p",
    prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    "--json-schema",
    JSON.stringify(request.jsonSchema),
    "--agents",
    JSON.stringify(agentsOf(request)),
    "--agent",
    agentNameOf(request.role.name),
    "--mcp-config",
    JSON.stringify({ mcpServers: settings.mcpServers }),
    ...(settings.useProjectMcp ? [] : ["--strict-mcp-config"]),
    ...permissionArgs(settings),
    ...optional("--max-turns", settings.maxTurns),
    ...optional("--max-budget-usd", settings.maxBudgetUsd),
    "--no-session-persistence",
    "--settings",
    JSON.stringify(runSettingsOf(settings)),
    // Left out when undeclared skills are allowed, because this flag takes
    // the Skill tool away along with every slash command.
    ...(settings.allowUndeclaredSkills ? [] : ["--disable-slash-commands"]),
  ];
};

/** The `claude` command that carries out `request`, in its own process group so a kill reaches all it started. */
export const invocationOf = (plugin: PluginSettings, request: RunRequest) =>
  ChildProcess.make(plugin.claudePath, argsOf(request), {
    cwd: request.cwd,
    env: runEnv(plugin.configDir),
    extendEnv: true,
    stdin: "ignore",
    detached: true,
    forceKillAfter: "5 seconds",
  });
