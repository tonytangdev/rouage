import type { FakePort, Misbehaving } from "../fake-script.ts";
import { everyStep, fakePort } from "../fake-script.ts";
import type { Classification } from "./classifier.ts";
import { Classifier, ClassifierGaveUp } from "./classifier.ts";

export type ClassifyStep = keyof Classifier["Service"];

/** The classifier as its fake and the stage contract suite know it. */
export const classifierPort: FakePort<ClassifyStep, ClassifierGaveUp> = {
  port: "classifier",
  steps: everyStep<ClassifyStep>()(["classify"]),
  gaveUp: (message) => new ClassifierGaveUp({ message }),
};

export interface FakeClassifierScript {
  /** What each classification returns, in order. */
  readonly results: readonly Classification[];
  readonly misbehaving?: Misbehaving<ClassifyStep> | undefined;
}

/** A classifier that follows a script instead of reading an issue. */
export const fakeClassifier = (script: FakeClassifierScript) =>
  fakePort(Classifier, classifierPort, script.misbehaving, ({ answer }) =>
    Classifier.of({ classify: (task) => answer("classify", task, script.results) }),
  );
