import { describe, expect, it } from "@effect/vitest";
import { Effect, Struct } from "effect";
import { format } from "oxfmt";

import formatConfig from "../../.oxfmtrc.json" with { type: "json" };
import { savedShape } from "./saved-shape.ts";

const pin = `saved-shape.v${savedShape.version}.json`;

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
          `A work item saved under lifecycle version ${savedShape.version} would no longer restore as it did. Once Rouage is published, bump the version in lifecycle.ts, which writes a new pin, and keep ${pin} as it is; before that, update the pin with \`pnpm test -u\` (ADR 0002)`,
        ).toMatchFileSnapshot(`./${pin}`),
      );
    }),
  );
});
