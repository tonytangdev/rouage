import { Effect } from "effect";
import { createActor } from "xstate";

import { aloneInput, runAlone } from "../stage-harness.ts";
import type { BuildOptions } from "./build-stage.ts";
import { buildStage } from "./build-stage.ts";
import type { FakeBuilderScript } from "./fake-builder.ts";
import { fakeBuilder } from "./fake-builder.ts";

export const testsPassed = { _tag: "passed" } as const;
export const testsFailed = { _tag: "failed", failures: "1 test failed: totals add VAT" } as const;

export const scriptedBuild = Effect.fnUntraced(function* (
  script: FakeBuilderScript,
  options: BuildOptions = {},
) {
  const builder = yield* fakeBuilder(script);
  return { builder, build: yield* buildStage(options).pipe(Effect.provide(builder.layer)) };
});

/** Runs a Build stage outside any lifecycle until it finishes or fails. */
export const runBuild = Effect.fnUntraced(function* (
  script: FakeBuilderScript,
  options: BuildOptions = {},
) {
  const { builder, build } = yield* scriptedBuild(script, options);
  const settled = yield* runAlone(
    createActor(build, { input: { ...aloneInput, kind: "feature" } }),
  );
  return { settled, steps: builder.steps(), calls: builder.calls() };
});
