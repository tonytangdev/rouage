import { Effect } from "effect";

/** How a scripted fake port goes wrong: `failing` gives up, `crashing` dies with a defect, `hanging` never finishes so a test can save or stop the work item mid-step. */
export type Misbehaviour = "failing" | "crashing" | "hanging";

interface Wrongdoing<E> {
  readonly gaveUp: E;
  readonly defect: string;
}

/** `result`, unless `mode` says the step goes wrong. */
export const behaving = <A, E>(
  mode: Misbehaviour | undefined,
  wrongdoing: Wrongdoing<E>,
  result: Effect.Effect<A>,
): Effect.Effect<A, E> => {
  if (mode === "failing") {
    return Effect.fail(wrongdoing.gaveUp);
  }
  if (mode === "crashing") {
    return Effect.die(new Error(wrongdoing.defect));
  }
  return mode === "hanging" ? Effect.never : result;
};

/** Hands out `answers` in order, one per run; a run beyond them dies, so a test that under-scripts its fake fails loudly. */
export const scriptedAnswers = <A>(answers: readonly A[], fake: string) => {
  const queue = [...answers];
  return Effect.suspend(() => {
    const answer = queue.shift();
    return answer === undefined
      ? Effect.die(new Error(`The fake ${fake} ran out of scripted answers`))
      : Effect.succeed(answer);
  });
};
