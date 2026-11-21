import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { defaultLifecycleMigrations } from "./lifecycle-migration.ts";
import { defaultLifecycle } from "./lifecycle.ts";
import { expectPinned, pinnedVersions } from "./saved-shape-pin.ts";
import { savedShape } from "./saved-shape.ts";

describe("the default lifecycle's saved shape", () => {
  it.effect("matches the pin of its lifecycle version", () =>
    expectPinned(
      savedShape,
      import.meta.dirname,
      `A work item saved under lifecycle version ${savedShape.version}`,
    ),
  );

  it.effect("has a migration from every version pinned before its own", () =>
    Effect.gen(function* () {
      const older = (yield* pinnedVersions(import.meta.dirname)).filter(
        (version) => version !== savedShape.version,
      );
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
