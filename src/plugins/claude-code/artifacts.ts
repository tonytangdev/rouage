import { Data, Effect, FileSystem, Path } from "effect";

/** The artifacts the plugin stores, each at one fixed path per work item, so a rerun replaces it. */
export type ArtifactName = "spec" | "plan" | "reproduction" | "review" | "demo";

/** Where the plugin keeps one work item's files, outside any sandbox. */
export const workItemFilesOf = (path: Path.Path, artifactsDir: string, workItemId: string) => {
  const dir = path.join(artifactsDir, workItemId);
  return {
    /** The absolute path of `artifact`, which is also its reference (ADR 0004). */
    artifactPath: (artifact: ArtifactName) => path.join(dir, `${artifact}.md`),
    /** The folder each of the work item's run transcripts is saved in. */
    runsDir: path.join(dir, "runs"),
  };
};

/** An artifact Claude gave could not be written to its file. */
export class ArtifactNotStored extends Data.TaggedError("ArtifactNotStored")<{
  readonly message: string;
}> {}

/**
 * Stores `content` as `workItemId`'s `artifact`, replacing what an earlier
 * run stored there, which is how each port's "replace on restart" promise is
 * kept, and answers with its reference.
 */
export type ArtifactStore = (
  workItemId: string,
  artifact: ArtifactName,
  content: string,
) => Effect.Effect<string, ArtifactNotStored>;

/** The store keeping artifacts under `artifactsDir`, outside any sandbox, so they outlive it. */
export const makeArtifactStore = Effect.fnUntraced(function* (artifactsDir: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const store: ArtifactStore = (workItemId, artifact, content) => {
    const file = workItemFilesOf(path, artifactsDir, workItemId).artifactPath(artifact);
    return fs.makeDirectory(path.dirname(file), { recursive: true }).pipe(
      Effect.andThen(fs.writeFileString(file, content)),
      Effect.as(file),
      Effect.mapError(
        (error) =>
          new ArtifactNotStored({
            message: `The ${artifact} could not be stored: ${error.message}`,
          }),
      ),
    );
  };
  return store;
});
