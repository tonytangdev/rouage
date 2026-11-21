import { readdir } from "node:fs/promises";

import { describe, expect, it } from "@effect/vitest";
import { Effect, Struct } from "effect";
import { format } from "oxfmt";

import formatConfig from "../../.oxfmtrc.json" with { type: "json" };
import { defaultLifecycleMigrations } from "./lifecycle-migration.ts";
import { defaultLifecycle } from "./lifecycle.ts";
import { savedShape } from "./saved-shape.ts";

const pin = `saved-shape.v${savedShape.version}.json`;

const pinnedVersions = Effect.promise(() => readdir(import.meta.dirname)).pipe(
  Effect.map((files) =>
    files.flatMap(
      (file) => /^saved-shape\.v(?<version>.+)\.json$/u.exec(file)?.groups?.["version"] ?? [],
    ),
  ),
);

// Formatted with the settings `pnpm format` gives JSON, so a written pin passes the format check as is.
const formatted = Effect.fnUntraced(function* (value: unknown) {
  const { code } = yield* Effect.promise(() =>
    format(
      pin,
      JSON.stringify(value),
      Struct.pick(formatConfig, ["printWidth", "tabWidth", "useTabs"]),
    ),
  );
  return code;
});

describe("the default lifecycle's saved shape", () => {
  it.effect("matches the pin of its lifecycle version", () =>
    Effect.gen(function* () {
      const shape = yield* formatted(savedShape);
      yield* Effect.promise(() =>
        expect(
          shape,
          `A work item saved under lifecycle version ${savedShape.version} would no longer restore as it did. Once Rouage is published, bump the version in lifecycle.ts, which writes a new pin, keep ${pin} as it is and add a migration from it; before that, update the pin with \`pnpm test -u\` (ADR 0002, ADR 0015)`,
        ).toMatchFileSnapshot(`./${pin}`),
      );
    }),
  );

  it.effect("has a migration from every version pinned before its own", () =>
    Effect.gen(function* () {
      const older = (yield* pinnedVersions).filter((version) => version !== savedShape.version);
      const migrated = new Set(
        defaultLifecycleMigrations
          .filter((migration) => migration.from.id === defaultLifecycle.id)
          .map((migration) => migration.from.version),
      );
      expect(
        older.filter((version) => !migrated.has(version)),
        "A work item saved under each of these released versions would be refused: add its migration to defaultLifecycleMigrations (ADR 0015)",
      ).toStrictEqual([]);
    }),
  );
});
