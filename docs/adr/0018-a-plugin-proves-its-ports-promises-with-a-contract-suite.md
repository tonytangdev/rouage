# A plugin proves its ports' promises with a contract suite Rouage ships

Some ports promise things the lifecycle relies on but cannot check when it runs: sandbox teardown succeeds when there is no sandbox and when it is repeated (ADR 0007), the provisioner keeps at most one live sandbox per work item (ADR 0005), and the shipper answers a second ship of the same task with the delivery it already made. Rouage's stage tests run on scripted fakes, so they show the stages rely on these promises without showing that any plugin keeps them (#54).

Rouage ships a contract suite for these promises. Each promise is a `PluginPromise`: a name and an Effect check that runs against the ports in its context, failing with `PluginBrokeContract` when the plugin breaks it, or with the port's own error when the port gives up where it must not. A suite is a record of promises built from a task the plugin can carry out, and `describePluginContract` registers one `@effect/vitest` test per promise for a plugin's Layer. A plugin runs the suite in its own tests, as Rouage does for its fakes.

What the ports cannot show is asked of the plugin as one more service in the same Layer, such as `SandboxProbe`, which counts the live sandboxes the plugin holds for a work item. It sits in the Layer, not beside it, because a real probe shares the plugin's client, such as a Docker connection, which the Layer builds.

A suite covers the ports one plugin kind fills together. The sandbox contract checks the provisioner and sandbox teardown as a pair, because only both together keep a work item's sandbox count right. It sits in the Provision folder with the port it provisions through, even though the lifecycle owns the teardown port (ADR 0007). The shipper contract covers the one port a Script plugin fills to deliver.

## Considered Options

- **A probe passed beside the Layer.** Rejected: a probe that shares the plugin's client would have to build that client a second time, outside the Layer.
- **One `describe` function per suite, with no record of promises.** Rejected: Rouage could then not show each promise failing on a fake that breaks it, so a check that passes whatever the plugin does would go unnoticed.

## Consequences

- Each promise in a suite is shown failing on a fake with a flaw that breaks it (`SandboxFlaw`, `ShipperFlaw`), next to the suite passing on the fake without one.
- A check provisions under a work item id of its own, derived from the task's, and tears down what it provisioned even when it fails, so a real Sandbox plugin's suite leaves no sandbox behind.
- The promise that a restart replaces what the planner, demonstrator or reviewer stored needs a probe of what each plugin stores, so it waits until a real plugin shows that probe's shape.
- A sandbox teardown that arrives while an interrupted provision is still unwinding (ADR 0007) is not yet checked.
