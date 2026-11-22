import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { Config, Effect, FileSystem, Layer } from "effect";

import { Classifier } from "../../index.ts";
import { claudeCode } from "./claude-code.ts";

// Runs real Claude Code on the maintainer's own login, so `pnpm check` stays
// offline and free; it is the early warning for a CLI change, such as bare
// mode becoming the default for print mode (ADR 0019).
const live = Effect.runSync(
  Config.Boolean("ROUAGE_CLAUDE_CODE_LIVE_TEST").pipe(Config.withDefault(false)),
);

describe("the Claude Code plugin against the real claude CLI", () => {
  it.effect.skipIf(!live)(
    "classifies an issue describing a crash as a bug",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dir = yield* fs.makeTempDirectoryScoped({ prefix: "rouage-claude-live-" });
        const plugin = claudeCode({ repoDir: dir, model: "haiku", maxTurns: 4 });
        const classification = yield* Effect.flatMap(Classifier, (classifier) =>
          classifier.classify({
            workItemId: "live-1",
            issueRef:
              "This text is the issue: clicking Save crashes the app with a null pointer error.",
            feedback: null,
          }),
        ).pipe(Effect.provide(plugin.pipe(Layer.provide(NodeServices.layer))));
        expect(classification).toStrictEqual({ _tag: "classified", kind: "bug" });
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    120_000,
  );
});
