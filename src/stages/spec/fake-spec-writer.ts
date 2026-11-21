import type { FakePort, Misbehaving } from "../fake-script.ts";
import { fakePort } from "../fake-script.ts";
import type { Written } from "./spec-writer.ts";
import { SpecWriter, SpecWriterGaveUp } from "./spec-writer.ts";

export type WriteStep = "write";

/** The spec writer as its fake and the stage contract suite know it. */
export const specWriterPort: FakePort<WriteStep, SpecWriterGaveUp> = {
  port: "spec writer",
  steps: ["write"],
  gaveUp: (message) => new SpecWriterGaveUp({ message }),
};

export interface FakeSpecWriterScript {
  /** What each write returns, in order. */
  readonly results: readonly Written[];
  readonly misbehaving?: Misbehaving<WriteStep> | undefined;
}

/** A spec writer that follows a script instead of writing a spec. */
export const fakeSpecWriter = (script: FakeSpecWriterScript) =>
  fakePort(SpecWriter, specWriterPort, script.misbehaving, ({ answer }) =>
    SpecWriter.of({ write: (task) => answer("write", task, script.results) }),
  );
