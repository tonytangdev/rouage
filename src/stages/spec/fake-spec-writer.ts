import { Effect, Layer } from "effect";

import type { Misbehaving } from "../fake-script.ts";
import { scriptedAnswers, scriptedPort } from "../fake-script.ts";
import type { WriteTask, Written } from "./spec-writer.ts";
import { SpecWriter, SpecWriterGaveUp } from "./spec-writer.ts";

export type WriteStep = "write";

interface WriteCall {
  readonly step: WriteStep;
  readonly task: WriteTask;
}

export interface FakeSpecWriterScript {
  /** What each write returns, in order. */
  readonly results: readonly Written[];
  readonly misbehaving?: Misbehaving<WriteStep> | undefined;
}

/** A spec writer that follows a script instead of writing a spec. */
export const fakeSpecWriter = Effect.fnUntraced(function* (script: FakeSpecWriterScript) {
  const port = yield* scriptedPort<WriteStep, WriteCall, SpecWriterGaveUp>({
    port: "spec writer",
    steps: ["write"],
    misbehaving: script.misbehaving,
    gaveUp: (message) => new SpecWriterGaveUp({ message }),
  });
  const results = scriptedAnswers(script.results, "spec writer");
  const specWriter = SpecWriter.of({
    write: (task) => port.run({ step: "write", task }, results),
  });
  return {
    layer: Layer.succeed(SpecWriter, specWriter),
    calls: (): readonly WriteTask[] => port.calls().map((call) => call.task),
    started: port.started,
  };
});
