import type { Effect } from "effect";
import { Context, Data } from "effect";

import type { DemonstratedChange } from "../built-change.ts";

export type ShipTask = DemonstratedChange;

/**
 * The shipper's answer: the change was delivered, with where, such as a pull
 * request URL or a merge commit, opaque to Rouage (ADR 0004); or it needs
 * rebuilding, with what kept it from landing for Build to address (ADR 0013).
 */
export type Shipment =
  | { readonly _tag: "shipped"; readonly deliveryRef: string }
  | { readonly _tag: "needsRebuild"; readonly feedback: string };

/** The shipper could not deliver the change, for a reason that is not the change's code. */
export class ShipperGaveUp extends Data.TaggedError("ShipperGaveUp")<{
  readonly message: string;
}> {}

/**
 * The port the Ship stage delivers an approved change through, in the form
 * the plugin chooses: a pull request opened or merged, or a deploy. A restart
 * runs `ship` again for the same task, and Rouage cannot record a delivery
 * before `ship` answers, so the shipper must find a change it already
 * delivered for the work item and answer with that delivery's reference
 * rather than deliver it twice.
 *
 * When the target moved since the change was built, the shipper brings the
 * change up to date itself if it can do so cleanly. It answers `needsRebuild`
 * only when landing needs the code to change, such as a conflict or checks
 * failing after the update, and gives up for any other reason, such as lost
 * credentials. `needsRebuild` means nothing was delivered; whatever the
 * shipper opened, such as an unmerged pull request, is its own to reuse on
 * the next `ship`. It never writes into the sandbox, whose code is Build's
 * (ADR 0013). Usually filled by a Script plugin.
 */
export class Shipper extends Context.Service<
  Shipper,
  { readonly ship: (task: ShipTask) => Effect.Effect<Shipment, ShipperGaveUp> }
>()("rouage/stages/ship/Shipper") {}
