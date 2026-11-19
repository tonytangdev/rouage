import { Effect, Layer } from "effect";

import type { FakePort, Misbehaving } from "../fake-script.ts";
import { scriptedAnswers, scriptedPort } from "../fake-script.ts";
import type { ProvisionTask, Provisioned, TeardownTask } from "./provisioner.ts";
import { Provisioner, ProvisionerGaveUp } from "./provisioner.ts";

export type ProvisionerStep = "provision" | "teardown";

type ProvisionerCall =
  | { readonly step: "provision"; readonly task: ProvisionTask }
  | { readonly step: "teardown"; readonly task: TeardownTask };

/** The provisioner as its fake and the stage contract suite know it. */
export const provisionerPort: FakePort<ProvisionerStep, ProvisionerGaveUp> = {
  port: "provisioner",
  steps: ["provision", "teardown"],
  gaveUp: (message) => new ProvisionerGaveUp({ message }),
};

export interface FakeProvisionerScript {
  /** What each provision returns, in order. */
  readonly results: readonly Provisioned[];
  readonly misbehaving?: Misbehaving<ProvisionerStep> | undefined;
}

/** A provisioner that follows a script instead of preparing a sandbox. */
export const fakeProvisioner = Effect.fnUntraced(function* (script: FakeProvisionerScript) {
  const port = yield* scriptedPort<ProvisionerStep, ProvisionerCall, ProvisionerGaveUp>({
    ...provisionerPort,
    misbehaving: script.misbehaving,
  });
  const results = scriptedAnswers(script.results, provisionerPort.port);
  const provisioner = Provisioner.of({
    provision: (task) => port.run({ step: "provision", task }, results),
    teardown: (task) => port.run({ step: "teardown", task }, Effect.void),
  });
  return {
    layer: Layer.succeed(Provisioner, provisioner),
    calls: port.calls,
    started: port.started,
  };
});
