import type { FakePort, Misbehaving } from "../fake-script.ts";
import { fakePort } from "../fake-script.ts";
import type { Captured, Confirmation } from "./reproducer.ts";
import { Reproducer, ReproducerGaveUp } from "./reproducer.ts";

export type ReproducerStep = "capture" | "confirm";

/** The reproducer as its fake and the stage contract suite know it. */
export const reproducerPort: FakePort<ReproducerStep, ReproducerGaveUp> = {
  port: "reproducer",
  steps: ["capture", "confirm"],
  gaveUp: (message) => new ReproducerGaveUp({ message }),
};

export interface FakeReproducerScript {
  /** What each capture returns, in order. */
  readonly captures: readonly Captured[];
  /** What each confirm returns, in order. */
  readonly confirmations?: readonly Confirmation[];
  readonly misbehaving?: Misbehaving<ReproducerStep> | undefined;
}

/** A reproducer that follows a script instead of calling an AI. */
export const fakeReproducer = (script: FakeReproducerScript) =>
  fakePort(Reproducer, reproducerPort, script.misbehaving, ({ answer }) =>
    Reproducer.of({
      capture: (task) => answer("capture", task, script.captures),
      confirm: (task) => answer("confirm", task, script.confirmations ?? []),
    }),
  );
