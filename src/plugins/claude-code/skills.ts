import { Data, Effect, FileSystem, Path } from "effect";

import { splitFrontmatter } from "./role-file.ts";

/** A skill a role declared, read from its folder so the plugin can preload it into the role's instructions. */
export interface PreloadedSkill {
  readonly name: string;
  /** The skill's folder, which holds any file its instructions point to. */
  readonly dir: string;
  /** The body of the skill's `SKILL.md`, without its frontmatter. */
  readonly instructions: string;
}

/** A skill a role declared is in none of the folders the plugin looks in. */
export class SkillNotFound extends Data.TaggedError("SkillNotFound")<{
  readonly message: string;
}> {}

const skillFileIn = Effect.fnUntraced(function* (folders: readonly string[], name: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  for (const folder of folders) {
    const file = path.join(folder, name, "SKILL.md");
    if (yield* fs.exists(file)) {
      return file;
    }
  }
  return yield* new SkillNotFound({
    message: `The skill ${name} a role declares is in none of ${folders.join(", ")}`,
  });
});

/**
 * The skill `name` from the first of `folders` holding a `<name>/SKILL.md`.
 * The plugin reads skills from its own folders only, never from someone's
 * personal Claude config, so a role behaves the same on every machine.
 */
export const loadSkill = Effect.fnUntraced(function* (folders: readonly string[], name: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const file = yield* skillFileIn(folders, name);
  return {
    name,
    dir: path.dirname(file),
    instructions: splitFrontmatter(yield* fs.readFileString(file)).body,
  } satisfies PreloadedSkill;
});
