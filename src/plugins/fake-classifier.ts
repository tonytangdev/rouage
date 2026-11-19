import { Deferred, Effect, Layer } from "effect";

import type { Classification, ClassifyTask } from "./classifier.ts";
import { Classifier, ClassifyFailed } from "./classifier.ts";

export interface FakeClassifierScript {
  /** What each classification returns, in order. */
  readonly results: readonly Classification[];
  /**
   * How every classification goes wrong: `failing` fails with `ClassifyFailed`,
   * `crashing` dies with a defect, and `hanging` never finishes, so a test can
   * save or stop the work item while it runs.
   */
  readonly misbehaving?: "failing" | "crashing" | "hanging";
}

const verdictOf = (script: FakeClassifierScript, result: Effect.Effect<Classification>) => {
  if (script.misbehaving === "failing") {
    return Effect.fail(new ClassifyFailed({ message: "The classifier gave up on the issue" }));
  }
  if (script.misbehaving === "crashing") {
    return Effect.die(new Error("The classifier exited while classifying"));
  }
  return script.misbehaving === "hanging" ? Effect.never : result;
};

/**
 * A classifier that follows a script instead of reading an issue. A
 * classification beyond the script dies, so a test that under-scripts its
 * classifier fails loudly.
 */
export const fakeClassifier = Effect.fnUntraced(function* (script: FakeClassifierScript) {
  const calls: ClassifyTask[] = [];
  const results = [...script.results];
  const begun = yield* Deferred.make<boolean>();
  const nextResult = Effect.suspend(() => {
    const result = results.shift();
    return result === undefined
      ? Effect.die(new Error("The fake classifier ran out of scripted results"))
      : Effect.succeed(result);
  });
  const classifier = Classifier.of({
    classify: (task) =>
      Effect.suspend(() => {
        calls.push(task);
        return Deferred.succeed(begun, true).pipe(Effect.andThen(verdictOf(script, nextResult)));
      }),
  });
  return {
    layer: Layer.succeed(Classifier, classifier),
    calls: (): readonly ClassifyTask[] => calls,
    started: Deferred.await(begun).pipe(Effect.asVoid),
  };
});
