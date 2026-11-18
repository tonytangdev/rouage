import type { Comment } from "@oxlint/plugins";

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "this",
  "that",
  "from",
  "into",
  "onto",
  "are",
  "was",
  "will",
  "then",
  "than",
  "its",
  "our",
  "all",
  "any",
  "each",
  "new",
  "now",
  "here",
  "there",
  "not",
]);

const WHY_MARKERS =
  /\b(?:because|since|so that|otherwise|why|unlike|instead|despite|workaround|required|must|never|see)\b|https?:\/\/|#\d+/iu;

const DIRECTIVE = /^\s*(?:oxlint-|eslint-|@ts-|@effect-|global\s)/u;

export const isDirective = (comment: Comment): boolean => DIRECTIVE.test(comment.value);

export const isJsDoc = (comment: Comment): boolean =>
  comment.type === "Block" && comment.value.startsWith("*");

export const explainsWhy = (text: string): boolean => WHY_MARKERS.test(text);

const stem = (word: string): string =>
  word.length > 4 ? word.replace(/ies$/u, "y").replace(/(?:es|s)$/u, "") : word;

export const contentWords = (text: string): string[] =>
  text
    .replaceAll(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .toLowerCase()
    .split(/[^a-z]+/u)
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word))
    .map(stem);

export const commentLines = (comment: Comment): string[] =>
  comment.value
    .split("\n")
    .map((line) => line.replace(/^\s*\*?\s?/u, "").trim())
    .filter((line) => line.length > 0);

/** Source text with every comment blanked out, so identifier scans only see code. */
export const codeOnly = (text: string, comments: readonly Comment[]): string => {
  let code = "";
  let cursor = 0;
  for (const comment of comments) {
    code += `${text.slice(cursor, comment.start)}${" ".repeat(comment.end - comment.start)}`;
    cursor = comment.end;
  }
  return code + text.slice(cursor);
};
