import { Effect } from "effect";
import { createActor } from "xstate";

import type { StageInput } from "../../lifecycle/stage.ts";
import { aloneInput, runAlone } from "../stage-harness.ts";
import type { FakeSpecWriterScript } from "./fake-spec-writer.ts";
import { fakeSpecWriter } from "./fake-spec-writer.ts";
import { specStage } from "./spec-stage.ts";

export const writtenSpec = { _tag: "written", specRef: "spec-1" } as const;
export const unclearIssue = {
  _tag: "unclear",
  reason: "The issue names the page but not what it should show",
} as const;

/** What the writer is asked on a classified bug's first write. */
export const firstWrite = {
  workItemId: "wi-1",
  issueRef: "#1",
  kind: "bug",
  feedback: null,
  previousSpecRef: null,
} as const;

/** The input a Spec stage run alone starts with: a classified bug. */
export const classifiedInput: StageInput = { ...aloneInput, kind: "bug" };

export const scriptedSpec = Effect.fnUntraced(function* (script: FakeSpecWriterScript) {
  const specWriter = yield* fakeSpecWriter(script);
  return { specWriter, spec: yield* specStage.pipe(Effect.provide(specWriter.layer)) };
});

/** Runs a Spec stage outside any lifecycle until it finishes or fails. */
export const runSpec = Effect.fnUntraced(function* (
  script: FakeSpecWriterScript,
  input: StageInput = classifiedInput,
) {
  const { specWriter, spec } = yield* scriptedSpec(script);
  const settled = yield* runAlone(createActor(spec, { input }));
  return { settled, calls: specWriter.tasks() };
});
