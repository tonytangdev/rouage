import { Record, Schema } from "effect";
import type { StateValue } from "xstate";

import type { OuterPlace, WorkingPlace } from "./lifecycle-setup.ts";
import type { StageName } from "./stage.ts";

/** Every place a work item can be in: a stage, a gate, Blocked, or a final state, as the lifecycle declares them. */
export type Place = WorkingPlace | OuterPlace;

// Records rather than lists, so the compiler rejects both a missing place
// and one the lifecycle no longer has.
const workingPlaces: Readonly<Record<WorkingPlace, true>> = {
  intake: true,
  spec: true,
  specGate: true,
  provision: true,
  sampleGate: true,
  reproduce: true,
  plan: true,
  build: true,
  demo: true,
  review: true,
  shipGate: true,
  ship: true,
};
const outerPlaces: Readonly<Record<OuterPlace, true>> = {
  blocked: true,
  shipped: true,
  cancelled: true,
};

const WorkingPlaceSchema = Schema.Literals(Record.keys(workingPlaces));
const OuterPlaceSchema = Schema.Literals(Record.keys(outerPlaces));

/** Every place as a Schema, so a saved decision can only name a place the lifecycle has. */
export const PlaceSchema = Schema.Union([WorkingPlaceSchema, OuterPlaceSchema]);

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

const placeValueIn = Schema.decodeUnknownSync(
  Schema.Union([OuterPlaceSchema, Schema.Struct({ working: WorkingPlaceSchema })]),
);

/**
 * `placeOf` for a state value XState gives untyped, such as the lifecycle's
 * own snapshot read inside its transitions; throws when the value names no
 * place of the default lifecycle.
 */
export const placeOfState = (value: StateValue): Place => placeOf(placeValueIn(value));
