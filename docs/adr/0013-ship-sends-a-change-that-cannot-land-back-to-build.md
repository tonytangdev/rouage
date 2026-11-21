# Ship sends a change that cannot land back to Build

A change approved at the ship gate may no longer land when Ship runs, because the target moved and the change now conflicts or fails its checks against it (#28). Before this the `Shipper` gave up and the work item was blocked, where no move fit: a retry conflicts again, going back to Spec throws the spec away, and cancelling throws the change away. Ship now has a second outcome, `needsRebuild { feedback }`, which the lifecycle sends back to Build around its own loop, `ship`, limited by `ROUAGE_MAX_SHIP_LOOPS` (default 3), apart from the review loop because a moving target and a rejected change are different causes a human tunes apart.

The `Shipper` brings the change up to date itself when it can do so cleanly, and answers `needsRebuild` only when landing needs the code to change: a conflict, or checks failing after the update. A failure that is not about the code, such as lost credentials or an unreachable remote, stays `ShipperGaveUp` and blocks. `needsRebuild` means nothing was delivered; anything the shipper opened, such as an unmerged pull request, stays its own to reuse on the next `ship`, as on a restart (ADR 0004).

The feedback becomes the change request `{ from: "ship", text }`, replacing the previous one (ADR 0012). The Builder, which owns the sandbox's code, brings the change up to date guided by it; the Shipper never writes into the sandbox. The rebuilt change then takes the full path again, through Demo when one is called for and outdated (ADR 0011), Review and the ship gate, because the change the human approved no longer exists and resolving a conflict is new code. At the limit the work item is blocked keeping the request Build last addressed, as the review loop does, and a retry re-runs Ship on the same change.

## Considered Options

- **A `rebuild` move from Blocked.** Rejected: a human would click through what they almost always want, and the shipper already knows why the change cannot land.
- **The Shipper resolves conflicts itself.** Rejected: resolving a conflict is a code change, which is Build's job and needs Review; a clean update stays the Shipper's.
- **Back to Ship straight after Build.** Rejected: it would ship code no human approved.
- **Count it in the review loop.** Rejected: conflicts would spend Review's budget, and the reverse.
- **Wait for a real Shipper plugin to show how often this happens.** Rejected: any shipper that merges into a shared target meets it once two work items are in flight; only the default limit waits on that evidence.

## Consequences

- A lifecycle that a user extends or replaces with its own route out of Ship must set `changeRequest` there, as for any way back to Build (ADR 0012).
