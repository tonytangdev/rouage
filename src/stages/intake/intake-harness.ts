import { Effect } from "effect";
import { createActor } from "xstate";

import { aloneInput, runAlone } from "../stage-harness.ts";
import type { FakeClassifierScript } from "./fake-classifier.ts";
import { fakeClassifier } from "./fake-classifier.ts";
import { intakeStage } from "./intake-stage.ts";

export const isBug = { _tag: "classified", kind: "bug" } as const;
export const isFeature = { _tag: "classified", kind: "feature" } as const;
export const isUnclear = {
  _tag: "unclear",
  reason: "The issue asks for a change without saying what is wrong today",
} as const;

export const scriptedIntake = Effect.fnUntraced(function* (script: FakeClassifierScript) {
  const classifier = yield* fakeClassifier(script);
  return { classifier, intake: yield* intakeStage.pipe(Effect.provide(classifier.layer)) };
});

/** Runs an Intake stage outside any lifecycle until it finishes or fails. */
export const runIntake = Effect.fnUntraced(function* (script: FakeClassifierScript) {
  const { classifier, intake } = yield* scriptedIntake(script);
  const settled = yield* runAlone(createActor(intake, { input: aloneInput }));
  return { settled, calls: classifier.calls() };
});
