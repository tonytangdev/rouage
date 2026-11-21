# Review sees the latest change request as a standing fact

When the change is sent back to Build, by Review's `changesRequested` or a human rejecting at the ship gate, the lifecycle keeps what was asked as its own fact, `changeRequest`, tagged with where it came from: `{ from: "review", text }` or `{ from: "shipGate", text: string | null }` (#26). **Feedback** is cleared when any stage finishes, so before this a second Review pass could not check that its earlier request was addressed, never saw why a human rejected the change, and a retry with a comment left Build without the request it was working on.

Only the latest change request is kept, and only the next one replaces it. Build finishing, Review approving, a block and a retry keep it. A Review loop reaching its limit keeps the request Build last addressed, not the one Review just made, because the change is not sent back to Build and a retry re-runs Review on the same change. Returning to Spec, by `backToSpec` or a spec gate rejection, resets it to `null`, because a new spec makes earlier requests obsolete, as with the demo override (ADR 0011). A ship gate rejection without a comment is still recorded, so Review can tell a human rejected the change without saying why from there being no request at all.

`BuildTask` and Review's task carry it; `FixTask`, Demo and Ship do not. Right after a Review loop Build receives the same text as `feedback` and as `changeRequest`: `feedback` is what this run must address, `changeRequest` what the change must address.

## Considered Options

- **Wait for a real Reviewer plugin to show the need.** Rejected: no plugin can learn the ship gate comment unless the lifecycle hands it over.
- **Let each Reviewer plugin remember its own requests.** Rejected: every plugin would rebuild the same memory, and it still would not see the human's comment.
- **Keep `feedback` longer.** Rejected: every stage would then see a comment meant for another, and a retry's comment would still displace it.
- **Pass `decisions` to Review.** Rejected: it holds the human's comment but not Review's own verdict.
- **Keep every change request since the spec was approved.** Rejected: every other fact keeps only its latest value, and `decisions` already holds the human trail.

## Consequences

- A lifecycle that a user extends or replaces with a new way back to Build must set `changeRequest` there, or Review will judge the change against an older request.
