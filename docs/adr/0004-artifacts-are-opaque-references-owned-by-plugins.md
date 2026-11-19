# Artifacts are opaque references owned by plugins

A stage that produces an artifact, such as a spec, a reproduction or a demo, finishes with an outcome that carries a reference to it: a plain string the plugin chose, such as an issue comment URL, a file path or an evidence ID. The plugin stores the content. The lifecycle keeps the latest reference in the work item's context and passes it to every stage in `StageInput`. Rouage never reads the string or the content behind it. Humans at a gate need to know what they are approving, and later stages need to find earlier work without each plugin inventing its own lookup. Holding only a reference keeps the context plain JSON (ADR 0002) and leaves the content's format to the plugins.

When a stage runs again after a rejection or a return from Blocked, its port gets the previous reference with the feedback, so the plugin revises the artifact rather than starting over. A reference is only replaced by the stage's next outcome. A rejection never clears it.

## Considered Options

- **No reference, with plugins finding artifacts by work item ID.** Rejected: the gate and the later stages would each depend on a lookup that Rouage cannot see, and a plugin that fills one port could not find what another plugin wrote.
- **The content in the work item's context.** Rejected: every persisted snapshot would carry documents, and Rouage would own their format.
- **A typed shape per artifact, such as current and expected behaviour for a bug's spec.** Rejected for now: nothing in Rouage reads those fields, and typing them would fix a format before any real plugin exists. A shape can be added when a stage needs one.
