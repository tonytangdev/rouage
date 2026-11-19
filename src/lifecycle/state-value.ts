import { Predicate } from "effect";
import type { StateValue } from "xstate";

/** The innermost active state's name, such as "spec" for `{ working: "spec" }`. */
export const innermostState = (value: StateValue): string => {
  if (Predicate.isString(value)) {
    return value;
  }
  const [child] = Object.values(value);
  return child === undefined ? "" : innermostState(child);
};
