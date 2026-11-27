import { describe, expect, it } from "@effect/vitest";
import { Effect, FileSystem, Path } from "effect";

import type { GatekeeperTask } from "../../index.ts";
import { Gatekeeper } from "../../index.ts";
import type { PluginUnderTest } from "./claude-code-harness.ts";
import { nodeFiles, pluginUnderTest, promptOf, specGateTask } from "./claude-code-harness.ts";

const decidedOn = (setup: PluginUnderTest, task: GatekeeperTask = specGateTask) =>
  Effect.gen(function* () {
    const plugin = yield* pluginUnderTest(setup);
    const decision = yield* Effect.flatMap(Gatekeeper, (gatekeeper) =>
      gatekeeper.decide(task),
    ).pipe(Effect.provide(plugin.layer));
    const [run] = plugin.claude.spawned();
    return { decision, args: run?.args ?? [], cwd: run?.cwd };
  });

const handedOff = [{ _tag: "replays", transcript: "gatekeeper-handed-off" }] as const;

const rulesSkillIn = Effect.fnUntraced(function* (rules: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const skillsDir = yield* fs.makeTempDirectoryScoped({ prefix: "rouage-gatekeeper-skills-" });
  yield* fs.makeDirectory(path.join(skillsDir, "gate-rules"));
  yield* fs.writeFileString(
    path.join(skillsDir, "gate-rules", "SKILL.md"),
    `---\nname: gate-rules\ndescription: My rules for deciding at a gate.\n---\n${rules}\n`,
  );
  return skillsDir;
});

describe("the Claude Code gatekeeper", () => {
  it.effect("approves when Claude does", () =>
    Effect.gen(function* () {
      const { decision } = yield* decidedOn({
        runs: [{ _tag: "replays", transcript: "gatekeeper-approved" }],
      });
      expect(decision).toStrictEqual({ _tag: "approved" });
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("hands the decision to a human with the reason Claude gives", () =>
    Effect.gen(function* () {
      const { decision } = yield* decidedOn({ runs: handedOff });
      expect(decision).toStrictEqual({
        _tag: "handedOff",
        reason:
          "The spec changes how payments are captured, and the rules hand off anything involving payments.",
      });
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("asks Claude in the decide role to follow the user's rules, given as its skills", () =>
    Effect.gen(function* () {
      const rules =
        "Approve the spec if it only touches UI copy; hand off anything involving payments.";
      const skillsDir = yield* rulesSkillIn(rules);
      const { args, cwd } = yield* decidedOn({
        runs: handedOff,
        options: { skillsDir, roles: { decide: { skills: ["gate-rules"] } } },
      });
      expect(cwd).toBeUndefined();
      const prompt = yield* promptOf(args, "rouage-decide");
      expect(prompt).toContain("deciding at the spec gate");
      expect(prompt).toContain("/work/acme/.rouage/artifacts/work-item-7/spec.md");
      expect(prompt).toContain(rules);
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("decides at the ship gate in the sandbox's workspace, where the change is", () =>
    Effect.gen(function* () {
      const { args, cwd } = yield* decidedOn(
        { runs: handedOff },
        { ...specGateTask, gate: "shipGate", sandboxRef: "/sandboxes/work-item-7" },
      );
      expect(cwd).toBe("/sandboxes/work-item-7");
      expect(yield* promptOf(args, "rouage-decide")).toContain("deciding at the ship gate");
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );

  it.effect("gives up with claude's exit code and stderr when it crashes", () =>
    Effect.gen(function* () {
      const gaveUp = yield* Effect.flip(
        decidedOn({ runs: [{ _tag: "crashes", stderr: "Error: boom\n", exitCode: 2 }] }),
      );
      expect(gaveUp._tag).toBe("GatekeeperGaveUp");
      expect(gaveUp.message).toBe("claude exited with code 2 without a result: Error: boom");
    }).pipe(Effect.scoped, Effect.provide(nodeFiles)),
  );
});
