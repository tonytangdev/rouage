import { Data, Effect, Schema } from "effect";

import type { RoleSettingsLayer } from "./role-settings.ts";
import { McpServersSchema, PermissionModeSchema } from "./role-settings.ts";

/** A role file that is not Claude Code agent markdown the plugin can read. */
export class RoleFileInvalid extends Data.TaggedError("RoleFileInvalid")<{
  readonly message: string;
}> {}

/** A role as its file gives it: the settings its frontmatter sets and the prompt template of its body. */
export interface RoleFile {
  readonly description: string;
  readonly settings: RoleSettingsLayer;
  /** The role's instructions, with `{{field}}` placeholders for the task's fields. */
  readonly template: string;
}

const ListSchema = Schema.Union([Schema.Array(Schema.String), Schema.String]);

// The keys of Claude Code's own agent format, so a role file reads like any subagent file.
const FrontmatterSchema = Schema.Struct({
  name: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  tools: Schema.optional(ListSchema),
  disallowedTools: Schema.optional(ListSchema),
  skills: Schema.optional(ListSchema),
  model: Schema.optional(Schema.String),
  permissionMode: Schema.optional(PermissionModeSchema),
  maxTurns: Schema.optional(Schema.NumberFromString.check(Schema.isInt())),
  mcpServers: Schema.optional(Schema.fromJsonString(McpServersSchema)),
});
type Frontmatter = typeof FrontmatterSchema.Type;

const frontmatterPattern = /^---\r?\n(?<head>[\s\S]*?)\r?\n---\r?\n?(?<body>[\s\S]*)$/u;
const keyPattern = /^(?<key>[A-Za-z]\w*):\s*(?<value>.*)$/u;
const itemPattern = /^\s+-\s+(?<item>.*)$/u;

const unquoted = (value: string) =>
  value.trim().replace(/^(?<quote>["'])(?<inner>.*)\k<quote>$/u, "$2");

interface Entry {
  readonly key: string;
  readonly value: string;
  readonly items: string[];
}

// A YAML subset: one `key: value` per line, or a key alone followed by `- item` lines.
const entriesOf = (head: string) => {
  const entries: Entry[] = [];
  for (const line of head.split(/\r?\n/u)) {
    const field = keyPattern.exec(line)?.groups;
    const item = itemPattern.exec(line)?.groups?.["item"];
    if (field !== undefined) {
      entries.push({ key: field["key"] ?? "", value: (field["value"] ?? "").trim(), items: [] });
    } else if (item !== undefined) {
      entries.at(-1)?.items.push(unquoted(item));
    }
  }
  return entries;
};

const rawFrontmatter = (head: string): Record<string, string | readonly string[]> =>
  Object.fromEntries(
    entriesOf(head).map((entry) => [
      entry.key,
      entry.value === "" ? entry.items : unquoted(entry.value),
    ]),
  );

const listOf = (value: string | readonly string[] | undefined) =>
  typeof value === "string"
    ? value
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry !== "")
    : value;

const settingsOf = (frontmatter: Frontmatter): RoleSettingsLayer => ({
  model: frontmatter.model === "inherit" ? null : frontmatter.model,
  maxTurns: frontmatter.maxTurns,
  permissionMode: frontmatter.permissionMode,
  allowedTools: listOf(frontmatter.tools),
  disallowedTools: listOf(frontmatter.disallowedTools),
  skills: listOf(frontmatter.skills),
  mcpServers: frontmatter.mcpServers,
});

const invalid = (path: string, reason: string) =>
  new RoleFileInvalid({ message: `The role file ${path} is invalid: ${reason}` });

/** The role `text`, the content of the role file at `path`, describes. */
export const parseRoleFile = Effect.fnUntraced(function* (path: string, text: string) {
  const parts = frontmatterPattern.exec(text)?.groups;
  if (parts?.["head"] === undefined) {
    return yield* invalid(path, "it has no frontmatter between --- lines");
  }
  const frontmatter = yield* Schema.decodeEffect(FrontmatterSchema)(
    rawFrontmatter(parts["head"]),
  ).pipe(Effect.mapError((error) => invalid(path, error.message)));
  return {
    description: frontmatter.description ?? frontmatter.name ?? path,
    settings: settingsOf(frontmatter),
    template: (parts["body"] ?? "").trim(),
  } satisfies RoleFile;
});
