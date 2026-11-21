import { Effect } from "effect";

import { goldenRefs } from "../../lifecycle/golden-route.ts";
import { portStageUnderTest } from "../port-stage-under-test.ts";
import type { FakeSpecWriterScript } from "./fake-spec-writer.ts";
import { fakeSpecWriter, specWriterPort } from "./fake-spec-writer.ts";
import { specStage } from "./spec-stage.ts";

export const writtenSpec = { _tag: "written", specRef: "spec-1" } as const;
export const unclearIssue = {
  _tag: "unclear",
  reason: "The issue names the page but not what it should show",
} as const;

/** What the writer is asked on a classified bug's first write. */
export const firstWrite = {
  workItemId: goldenRefs.workItemId,
  issueRef: goldenRefs.issueRef,
  kind: "bug",
  feedback: null,
  previousSpecRef: null,
} as const;

export const specUnderTest = portStageUnderTest({
  name: "spec",
  port: specWriterPort,
  scripted: Effect.fnUntraced(function* (script: FakeSpecWriterScript) {
    const fake = yield* fakeSpecWriter(script);
    return { fake, stage: yield* specStage.pipe(Effect.provide(fake.layer)) };
  }),
  passing: (misbehaving) => ({ results: [writtenSpec], misbehaving }),
  outcome: writtenSpec,
  route: { kind: "bug" },
  firstTask: firstWrite,
});
