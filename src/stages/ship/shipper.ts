import type { Effect } from "effect";
import { Context, Data } from "effect";

import type { BuiltChange } from "../built-change.ts";

export interface ShipTask extends BuiltChange {
  /** The demo of the change, or `null` when the latest plan calls for none. */
  readonly demoRef: string | null;
}

export interface Shipped {
  /** Where the change was delivered, such as a pull request URL or a merge commit, opaque to Rouage (ADR 0004). */
  readonly deliveryRef: string;
}

/** The shipper could not deliver the change. */
export class ShipperGaveUp extends Data.TaggedError("ShipperGaveUp")<{
  readonly message: string;
}> {}

/**
 * The port the Ship stage delivers an approved change through, in the form
 * the plugin chooses: a pull request opened or merged, or a deploy. A restart
 * runs `ship` again for the same task, and Rouage cannot record a delivery
 * before `ship` answers, so the shipper must find a change it already
 * delivered for the work item and answer with that delivery's reference
 * rather than deliver it twice. Usually filled by a Script plugin.
 */
export class Shipper extends Context.Service<
  Shipper,
  { readonly ship: (task: ShipTask) => Effect.Effect<Shipped, ShipperGaveUp> }
>()("rouage/stages/ship/Shipper") {}
