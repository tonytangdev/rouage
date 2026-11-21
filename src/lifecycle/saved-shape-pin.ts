import { readdir } from "node:fs/promises";
import { relative } from "node:path";

import { expect } from "@effect/vitest";
import { Effect, Struct } from "effect";
import { format } from "oxfmt";

import formatConfig from "../../.oxfmtrc.json" with { type: "json" };

/** A saved shape as a pin holds it, naming the lifecycle version it is pinned at. */
export interface PinnedShape {
  readonly version: string;
}

const repositoryRoot = `${import.meta.dirname}/../..`;

const pinName = (version: string) => `saved-shape.v${version}.json`;

/** Every lifecycle version a saved shape is pinned at in `directory`. */
export const pinnedVersions = (directory: string) =>
  Effect.promise(() => readdir(directory)).pipe(
    Effect.map((files) =>
      files.flatMap(
        (file) => /^saved-shape\.v(?<version>.+)\.json$/u.exec(file)?.groups?.["version"] ?? [],
      ),
    ),
  );

const changedShape = (saved: string, pin: string) =>
  `${saved} would no longer restore as it did. Once Rouage is published, bump the version in lifecycle.ts, which writes a new pin, keep ${pin} as it is and add a migration from it; before that, update the pin with \`pnpm test -u\` (ADR 0002, ADR 0015, ADR 0016)`;

/**
 * Fails, saying that a work item `saved` as described would no longer
 * restore, unless `shape` matches its pin in `directory`. The pin is written
 * with the settings `pnpm format` gives JSON, so a pin `pnpm test -u` writes
 * passes the format check as is.
 */
export const expectPinned = Effect.fnUntraced(function* (
  shape: PinnedShape,
  directory: string,
  saved: string,
) {
  const pin = `${directory}/${pinName(shape.version)}`;
  const { code } = yield* Effect.promise(() =>
    format(
      pin,
      JSON.stringify(shape),
      Struct.pick(formatConfig, ["printWidth", "tabWidth", "useTabs"]),
    ),
  );
  yield* Effect.promise(() =>
    expect(code, changedShape(saved, relative(repositoryRoot, pin))).toMatchFileSnapshot(pin),
  );
});
