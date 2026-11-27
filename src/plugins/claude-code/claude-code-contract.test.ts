import { Effect, Layer } from "effect";

import { describeClassifierContract, describeGatekeeperContract } from "../../index.ts";
import { classifyTask, nodeFiles, pluginUnderTest, specGateTask } from "./claude-code-harness.ts";

describeClassifierContract(
  "the Claude Code plugin",
  Layer.unwrap(
    Effect.map(
      pluginUnderTest({ runs: [{ _tag: "replays", transcript: "classified-as-bug" }] }),
      (plugin) => plugin.layer,
    ),
  ).pipe(Layer.provide(nodeFiles)),
  classifyTask,
);

describeGatekeeperContract(
  "the Claude Code plugin",
  Layer.unwrap(
    Effect.map(
      pluginUnderTest({ runs: [{ _tag: "replays", transcript: "gatekeeper-handed-off" }] }),
      (plugin) => plugin.layer,
    ),
  ).pipe(Layer.provide(nodeFiles)),
  specGateTask,
);
