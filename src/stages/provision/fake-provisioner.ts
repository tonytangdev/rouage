import type { FakePort, Misbehaving } from "../fake-script.ts";
import { everyStep, fakePort } from "../fake-script.ts";
import type { Provisioned } from "./provisioner.ts";
import { Provisioner, ProvisionerGaveUp } from "./provisioner.ts";

export type ProvisionerStep = keyof Provisioner["Service"];

/** The provisioner as its fake and the stage contract suite know it. */
export const provisionerPort: FakePort<ProvisionerStep, ProvisionerGaveUp> = {
  port: "provisioner",
  steps: everyStep<ProvisionerStep>()(["provision"]),
  gaveUp: (message) => new ProvisionerGaveUp({ message }),
};

export interface FakeProvisionerScript {
  /** What each provision returns, in order. */
  readonly results: readonly Provisioned[];
  readonly misbehaving?: Misbehaving<ProvisionerStep> | undefined;
}

/** A provisioner that follows a script instead of preparing a sandbox. */
export const fakeProvisioner = (script: FakeProvisionerScript) =>
  fakePort(Provisioner, provisionerPort, script.misbehaving, ({ answer }) =>
    Provisioner.of({
      provision: (task) => answer("provision", task, script.results),
    }),
  );
