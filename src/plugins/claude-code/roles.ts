import { Effect, FileSystem, Path } from "effect";

import type { ClaudeCodeOptions, PluginSettings } from "./claude-code-options.ts";
import { parseRoleFile } from "./role-file.ts";
import type { RoleName } from "./role-name.ts";
import type { RoleSettings } from "./role-settings.ts";
import { resolveRoleSettings } from "./role-settings.ts";

/** A role ready to run: its settings resolved by precedence, and its prompt template. */
export interface Role {
  readonly name: RoleName;
  readonly description: string;
  readonly settings: RoleSettings;
  readonly template: string;
}

const roleFilePath = Effect.fnUntraced(function* (role: RoleName, rolesDir: string | undefined) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const file = `${role}.md`;
  if (rolesDir !== undefined && (yield* fs.exists(path.join(rolesDir, file)))) {
    return path.join(rolesDir, file);
  }
  return yield* path.fromFileUrl(new URL(`roles/${file}`, import.meta.url));
});

/**
 * `role` as the plugin runs it: its file from `rolesDir` when there is one of
 * the same name, the default one otherwise, with its settings resolved from
 * that file, `options` and env.
 */
export const loadRole = Effect.fnUntraced(function* (
  role: RoleName,
  plugin: PluginSettings,
  options: ClaudeCodeOptions,
) {
  const fs = yield* FileSystem.FileSystem;
  const filePath = yield* roleFilePath(role, plugin.rolesDir);
  const file = yield* parseRoleFile(filePath, yield* fs.readFileString(filePath));
  const settings = yield* resolveRoleSettings(role, {
    roleFile: file.settings,
    globalOption: options,
    roleOption: options.roles?.[role] ?? {},
  });
  return {
    name: role,
    description: file.description,
    settings,
    template: file.template,
  } satisfies Role;
});

const placeholder = /\{\{\s*(?<field>\w+)\s*\}\}/gu;

/** `template` with each `{{field}}` replaced by that field of `task`, `none` for null. */
export const fillTemplate = (template: string, task: Readonly<Record<string, unknown>>) =>
  template.replaceAll(placeholder, (_match, field: string) => {
    const value = task[field];
    if (value === null || value === undefined) {
      return "none";
    }
    return typeof value === "string" ? value : JSON.stringify(value);
  });
