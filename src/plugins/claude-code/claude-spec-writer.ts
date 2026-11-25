import { Effect, Schema } from "effect";

import type { Written } from "../../index.ts";
import { SpecWriter, SpecWriterGaveUp } from "../../index.ts";
import type { ArtifactNotStored, ArtifactStore } from "./artifacts.ts";
import { portAnswerOf } from "./port-answer.ts";
import type { PluginParts } from "./port-run.ts";
import { runRole } from "./port-run.ts";
import type { Role } from "./roles.ts";

// Claude gives the spec's content rather than writing it, because the write
// role is read-only; the plugin stores it and answers with its reference.
const writing = portAnswerOf(
  Schema.Union([
    Schema.TaggedStruct("written", { spec: Schema.NonEmptyString }),
    Schema.TaggedStruct("unclear", { reason: Schema.NonEmptyString }),
  ]),
);

const writtenOf = (
  store: ArtifactStore,
  workItemId: string,
  answer: typeof writing.answer.Type.answer,
): Effect.Effect<Written, ArtifactNotStored> =>
  answer._tag === "unclear"
    ? Effect.succeed(answer)
    : Effect.map(store(workItemId, "spec", answer.spec), (specRef) => ({
        _tag: "written",
        specRef,
      }));

/** The SpecWriter port done in the `write` role, in the repository checkout, since Spec runs before Provision. */
export const claudeSpecWriter = (parts: PluginParts, roles: { readonly write: Role }) =>
  SpecWriter.of({
    write: (task) =>
      runRole(parts, roles.write, writing, task).pipe(
        Effect.flatMap((answer) => writtenOf(parts.store, task.workItemId, answer)),
        Effect.mapError((failure) => new SpecWriterGaveUp({ message: failure.message })),
      ),
  });
