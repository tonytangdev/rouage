import { Schema } from "effect";

/** The job of one port method, each done in its own role. */
export const RoleNameSchema = Schema.Literals([
  "classify",
  "write",
  "capture",
  "confirm",
  "plan",
  "implement",
  "test",
  "fix",
  "checkReproduction",
  "demonstrate",
  "review",
]);
export type RoleName = typeof RoleNameSchema.Type;

/** A camelCase role or setting name as it appears in an env var name, such as CHECK_REPRODUCTION. */
export const envSegmentOf = (name: string) =>
  name.replaceAll(/[A-Z]/gu, (letter) => `_${letter}`).toUpperCase();

/** The name the role's agent goes by in the claude invocation, such as `rouage-classify`. */
export const agentNameOf = (role: RoleName) => `rouage-${role}`;
