import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import type { StageFacts } from "./facts.ts";
import { restoredWorkItem, startWorkItem, throughJson } from "./lifecycle-harness.ts";
import type { LifecycleMigration, SavedWorkItem } from "./lifecycle-migration.ts";
import { SavedWorkItemSchema } from "./lifecycle-migration.ts";

const savedWorkItemIn = Schema.decodeUnknownSync(SavedWorkItemSchema);

const factsIn = (saved: SavedWorkItem) =>
  savedWorkItemIn(savedWorkItemIn(saved["context"])["facts"]);

const withFacts = (saved: SavedWorkItem, facts: SavedWorkItem): SavedWorkItem => ({
  ...saved,
  context: { ...savedWorkItemIn(saved["context"]), facts },
});

const savedUnder = Effect.fnUntraced(function* (version: string, missing: readonly string[]) {
  const original = yield* startWorkItem();
  original.advanceTo("specGate");
  const saved = savedWorkItemIn(throughJson(original.save()));
  const kept = Object.entries(factsIn(saved)).filter(([name]) => !missing.includes(name));
  const older = withFacts(saved, Object.fromEntries(kept));
  return { ...older, machine: { id: "lifecycle", version } };
});

const adding =
  (fact: keyof StageFacts) =>
  (saved: SavedWorkItem): SavedWorkItem =>
    withFacts(saved, { ...factsIn(saved), [fact]: null });

const unchanged = (saved: SavedWorkItem) => saved;

const migration = (
  from: string,
  to: string,
  migrate: LifecycleMigration["migrate"],
): LifecycleMigration => ({ from: { id: "lifecycle", version: from }, to, migrate });

describe("migrating a saved work item between lifecycle versions", () => {
  it.effect(
    "resumes a work item saved under an older version once migrated to the current one",
    () =>
      Effect.gen(function* () {
        const persisted = yield* savedUnder("0", ["deliveryRef"]);
        const migrations = [migration("0", "1", adding("deliveryRef"))];
        const workItem = yield* restoredWorkItem(persisted, { migrations });
        expect(workItem.state()).toStrictEqual("specGate");
        expect(workItem.context().facts.deliveryRef).toBeNull();
      }),
  );

  it.effect("moves a work item one version at a time, whatever order the migrations come in", () =>
    Effect.gen(function* () {
      const persisted = yield* savedUnder("0.1", ["planRef", "deliveryRef"]);
      const migrations = [
        migration("0.2", "1", adding("deliveryRef")),
        migration("0.1", "0.2", adding("planRef")),
      ];
      const workItem = yield* restoredWorkItem(persisted, { migrations });
      expect(savedWorkItemIn(workItem.save())["machine"]).toStrictEqual({
        id: "lifecycle",
        version: "1",
      });
    }),
  );

  it.effect(
    "refuses a work item no migration leads on from, naming the version it was saved under",
    () =>
      Effect.gen(function* () {
        const persisted = yield* savedUnder("0.1", ["planRef", "deliveryRef"]);
        const migrations = [migration("0.1", "0.2", adding("planRef"))];
        const error = yield* Effect.flip(restoredWorkItem(persisted, { migrations }));
        expect(error).toMatchObject({
          _tag: "LifecycleVersionMismatch",
          expected: { id: "lifecycle", version: "1" },
          found: { id: "lifecycle", version: "0.1" },
        });
      }),
  );

  it.effect("uses each migration once, so migrations that lead back refuse the work item", () =>
    Effect.gen(function* () {
      const persisted = yield* savedUnder("0.1", []);
      const migrations = [migration("0.1", "0.2", unchanged), migration("0.2", "0.1", unchanged)];
      const error = yield* Effect.flip(restoredWorkItem(persisted, { migrations }));
      expect(error._tag).toStrictEqual("LifecycleVersionMismatch");
    }),
  );

  it.effect("applies no migration written for another lifecycle", () =>
    Effect.gen(function* () {
      const saved = yield* savedUnder("0", []);
      const persisted = { ...saved, machine: { id: "hotfix", version: "0" } };
      const migrations = [migration("0", "1", unchanged)];
      const error = yield* Effect.flip(restoredWorkItem(persisted, { migrations }));
      expect(error._tag).toStrictEqual("LifecycleVersionMismatch");
    }),
  );

  it.effect("refuses a migrated work item that still does not fit the current version", () =>
    Effect.gen(function* () {
      const persisted = yield* savedUnder("0", ["deliveryRef"]);
      const migrations = [migration("0", "1", unchanged)];
      const error = yield* Effect.flip(restoredWorkItem(persisted, { migrations }));
      expect(error._tag).toStrictEqual("UnreadableSnapshot");
    }),
  );

  it.effect("refuses a work item whose migration throws", () =>
    Effect.gen(function* () {
      const persisted = yield* savedUnder("0", []);
      const migrations = [
        migration("0", "1", () => {
          throw new Error("no plan to derive");
        }),
      ];
      const error = yield* Effect.flip(restoredWorkItem(persisted, { migrations }));
      expect(error).toMatchObject({ _tag: "UnreadableSnapshot" });
      expect(error.message).toContain("no plan to derive");
    }),
  );
});
