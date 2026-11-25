export { defaultLifecycle } from "./lifecycle/lifecycle.ts";
export type { Lifecycle, LifecycleIdentity } from "./lifecycle/lifecycle-logic.ts";
export type { NewWorkItem, WorkItem } from "./lifecycle/work-item-actor.ts";
export { StateNotReached, createWorkItem, restoreWorkItem } from "./lifecycle/work-item-actor.ts";
export type { TeardownTask } from "./lifecycle/sandbox-teardown.ts";
export { SandboxTeardown, TeardownGaveUp } from "./lifecycle/sandbox-teardown.ts";
export type { DefaultStagesOptions } from "./stages/default-stages.ts";
export { defaultStages, withDefaultStages } from "./stages/default-stages.ts";
export type { Classification, ClassifyTask } from "./stages/intake/classifier.ts";
export { ClassificationSchema, Classifier, ClassifierGaveUp } from "./stages/intake/classifier.ts";
export type { WriteTask, Written } from "./stages/spec/spec-writer.ts";
export { SpecWriter, SpecWriterGaveUp } from "./stages/spec/spec-writer.ts";
export type { ProvisionTask, Provisioned } from "./stages/provision/provisioner.ts";
export { Provisioner, ProvisionerGaveUp } from "./stages/provision/provisioner.ts";
export type { SampleTask, Sampled } from "./stages/provision/sampler.ts";
export { Sampler, SamplerGaveUp } from "./stages/provision/sampler.ts";
export type {
  CaptureTask,
  Captured,
  ConfirmTask,
  Confirmation,
} from "./stages/reproduce/reproducer.ts";
export { Reproducer, ReproducerGaveUp } from "./stages/reproduce/reproducer.ts";
export type { PlanTask, Planned } from "./stages/plan/planner.ts";
export { Planner, PlannerGaveUp } from "./stages/plan/planner.ts";
export type {
  BuildTask,
  FixTask,
  ReproductionCheck,
  ReproductionCheckTask,
  TestReport,
} from "./stages/build/builder.ts";
export { Builder, BuilderGaveUp } from "./stages/build/builder.ts";
export type { DemoTask, Demonstrated } from "./stages/demo/demonstrator.ts";
export { Demonstrator, DemonstratorGaveUp } from "./stages/demo/demonstrator.ts";
export type { ReviewTask, Verdict } from "./stages/review/reviewer.ts";
export { Reviewer, ReviewerGaveUp } from "./stages/review/reviewer.ts";
export type { ShipTask, Shipment } from "./stages/ship/shipper.ts";
export { Shipper, ShipperGaveUp } from "./stages/ship/shipper.ts";
export type { PluginPromise } from "./stages/plugin-contract.ts";
export {
  PluginBrokeContract,
  describePluginContract,
  howBroken,
  promiseKept,
} from "./stages/plugin-contract.ts";
export {
  classifierContract,
  describeClassifierContract,
} from "./stages/intake/classifier-contract.ts";
export type { SandboxPorts } from "./stages/provision/sandbox-contract.ts";
export {
  SandboxProbe,
  describeSandboxContract,
  sandboxContract,
} from "./stages/provision/sandbox-contract.ts";
export { describeShipperContract, shipperContract } from "./stages/ship/shipper-contract.ts";
