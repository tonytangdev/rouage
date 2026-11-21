import { readdir } from "node:fs/promises";

import { expect } from "@effect/vitest";
import { Effect, Struct } from "effect";
import { format } from "oxfmt";

import formatConfig from "../../.oxfmtrc.json" with { type: "json" };

/** A saved shape as a pin holds it: the lifecycle version it was saved under, and what restoring depends on. */
export interface PinnedShape {
  readonly version: string;
}

/** The file name of the saved-shape pin at lifecycle `version`. */
export const pinName = (version: string) => `saved-shape.v${version}.json`;

/** Every lifecycle version a saved shape is pinned at in `directory`. */
export const pinnedVersions = (directory: string) =>
  Effect.promise(() => readdir(directory)).pipe(
    Effect.map((files) =>
      files.flatMap(
        (file) => /^saved-shape\.v(?<version>.+)\.json$/u.exec(file)?.groups?.["version"] ?? [],
      ),
    ),
  );

/**
 * Fails with `message` unless `shape` matches its pin in `directory`, written
 * with the settings `pnpm format` gives JSON so a pin `pnpm test -u` writes
 * passes the format check as is.
 */
export const expectPinned = Effect.fnUntraced(function* (
  shape: PinnedShape,
  directory: string,
  message: string,
) {
  const pin = pinName(shape.version);
  const { code } = yield* Effect.promise(() =>
    format(
      pin,
      JSON.stringify(shape),
      Struct.pick(formatConfig, ["printWidth", "tabWidth", "useTabs"]),
    ),
  );
  yield* Effect.promise(() => expect(code, message).toMatchFileSnapshot(`${directory}/${pin}`));
});
