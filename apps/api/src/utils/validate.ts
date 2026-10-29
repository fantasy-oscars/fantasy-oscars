import type { z } from "@fantasy-oscars/shared/schemas";
import { validationError } from "../errors.js";

export type ParseOptions = {
  /** Response message; defaults to the first schema issue's message. */
  message?: string;
  /**
   * Fields reported for every issue that does not name its own via
   * `params.fields`; defaults to the first path segment of each issue.
   */
  fields?: string[];
};

function parseWith<S extends z.ZodType>(
  schema: S,
  data: unknown,
  opts: ParseOptions
): z.output<S> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  const issues = result.error.issues;
  const fields: string[] = [];
  for (const issue of issues) {
    const own = issue.code === "custom" ? issue.params?.fields : undefined;
    const names: string[] = Array.isArray(own)
      ? own.map(String)
      : (opts.fields ?? (issue.path.length ? [String(issue.path[0])] : []));
    for (const name of names) if (!fields.includes(name)) fields.push(name);
  }
  throw validationError(
    opts.message ?? issues[0]?.message ?? "Invalid request",
    fields.length ? fields : undefined
  );
}

/** Parse a request body; a missing body is treated as an empty object. */
export function parseBody<S extends z.ZodType>(
  schema: S,
  body: unknown,
  opts: ParseOptions = {}
): z.output<S> {
  return parseWith(schema, body ?? {}, opts);
}

export function parseParams<S extends z.ZodType>(
  schema: S,
  params: unknown,
  opts: ParseOptions = {}
): z.output<S> {
  return parseWith(schema, params, opts);
}

export function parseQuery<S extends z.ZodType>(
  schema: S,
  query: unknown,
  opts: ParseOptions = {}
): z.output<S> {
  return parseWith(schema, query ?? {}, opts);
}
