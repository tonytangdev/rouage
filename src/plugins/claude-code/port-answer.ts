import { Schema } from "effect";

/**
 * The answer a run gives for a port whose answer is `schema`, and the JSON
 * Schema Claude checks it against. The port's answer sits under `answer`,
 * because Claude's structured output must be an object, and a port's answer
 * may be a union.
 */
export const portAnswerOf = <A, I>(schema: Schema.Codec<A, I>) => {
  const answer = Schema.Struct({ answer: schema });
  const document = Schema.toJsonSchemaDocument(answer, { onExcessProperty: "error" });
  const jsonSchema =
    Object.keys(document.definitions).length === 0
      ? document.schema
      : { ...document.schema, $defs: document.definitions };
  return { answer, jsonSchema };
};
