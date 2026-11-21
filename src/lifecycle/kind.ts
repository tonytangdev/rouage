import { Schema } from "effect";

export const KindSchema = Schema.Literals(["bug", "feature"]);
export type Kind = typeof KindSchema.Type;
