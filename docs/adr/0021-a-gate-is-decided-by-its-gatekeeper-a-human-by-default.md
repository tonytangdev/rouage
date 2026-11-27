# A gate is decided by its gatekeeper, a human by default

Each gate has a gatekeeper: a human, a plugin that may hand the decision to a human, or a plugin alone. The plugin fills a Gatekeeper port, so the user's own rules live where any port's do: in the instructions and skills of an agent's Gatekeeper role, or in a script's code. The factory sets a default gatekeeper per gate, and a work item may change it when it is created; it is then saved with the work item and never changes, so a restored work item is decided as it was before. A plugin's decision is recorded like a human's, with `by` naming the gatekeeper. This lets a user run a work item from issue to Ship with no human, or only where their rules ask for one, while Rouage stays the driver of the lifecycle.

## Considered Options

- **An outside agent drives Rouage**, starting work items and sending decisions through an MCP server or CLI. Rejected: the lifecycle would no longer be the one place the process lives. It can still be built later on top of gatekeepers.
- **Rules as declarative conditions evaluated by Rouage.** Rejected: a port lets an agent judge plain-language rules and a script apply strict ones, without Rouage owning a rule language.

## Consequences

- The sample gate's gatekeeper is always a human, because it waits for the user to run the extraction script, not for a judgement ([ADR 0001](0001-agents-read-real-data-only-with-a-grant.md), [ADR 0008](0008-a-sample-run-waits-at-a-sample-gate.md)).
- Blocked always waits for a human: it is where autonomous work lands when it gets stuck, and a plugin retrying from it would void loop limits.
- A gatekeeper that hands off, or whose port gives up, leaves the decision to a human at the same gate; the work item is not blocked.
- A human may decide at a gate while its plugin gatekeeper is still judging; the human's decision wins and the judgement stops. A plugin's decision is not undone, but a human may still cancel or send the work item back to Spec.
- Saving gatekeepers with the work item changes its saved shape (ADR 0002, ADR 0015).
