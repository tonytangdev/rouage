import type { OuterPlace, WorkingPlace } from "./lifecycle-setup.ts";
import type { StageName } from "./stage.ts";

/** Every place a work item can be in: a stage, a gate, Blocked, or a final state, as the lifecycle declares them. */
export type Place = WorkingPlace | OuterPlace;

/** Every place where the work item waits for a human decision. */
export type Gate = Exclude<WorkingPlace, StageName>;

/** A lifecycle state value, which names a place inside the working state through `working`. */
export type PlaceValue = OuterPlace | { readonly working: WorkingPlace };

// A record rather than a list, so the compiler rejects both a missing gate and
// one the lifecycle no longer has.
const gates: Readonly<Record<Gate, true>> = { specGate: true, sampleGate: true, shipGate: true };

export const isGate = (place: Place): place is Gate => Object.hasOwn(gates, place);

/** The place a lifecycle state value stands for, such as `"spec"` for `{ working: "spec" }`. */
export const placeOf = (value: PlaceValue): Place =>
  typeof value === "string" ? value : value.working;
