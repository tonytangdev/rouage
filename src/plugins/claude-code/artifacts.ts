import type { Path } from "effect";

/** The artifacts the plugin stores, each at one fixed path per work item, so a rerun replaces it. */
export type ArtifactName = "spec" | "plan" | "reproduction" | "review" | "demo";

/** The folder holding everything the plugin keeps for `workItemId`, outside any sandbox. */
export const workItemDirOf = (path: Path.Path, artifactsDir: string, workItemId: string) =>
  path.join(artifactsDir, workItemId);

/** The absolute path of `artifact` for `workItemId`, which is also its reference (ADR 0004). */
export const artifactPathOf = (
  path: Path.Path,
  artifactsDir: string,
  workItemId: string,
  artifact: ArtifactName,
) => path.join(workItemDirOf(path, artifactsDir, workItemId), `${artifact}.md`);

/** The folder each of `workItemId`'s run transcripts is saved in. */
export const runsDirOf = (path: Path.Path, artifactsDir: string, workItemId: string) =>
  path.join(workItemDirOf(path, artifactsDir, workItemId), "runs");
