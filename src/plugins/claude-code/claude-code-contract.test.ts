import { Effect, Layer } from "effect";

import { describeClassifierContract } from "../../index.ts";
import { classifyTask, nodeFiles, pluginUnderTest } from "./claude-code-harness.ts";

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
