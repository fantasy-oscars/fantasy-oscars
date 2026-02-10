export function isMissingColumnError(err: unknown, column: string): boolean {
  const pgErr = err as { code?: string; message?: string };
  if (pgErr?.code !== "42703") return false; // undefined_column
  const msg = String(pgErr?.message ?? "");
  return (
    msg.includes(`"${column}"`) || msg.includes(`'${column}'`) || msg.includes(column)
  );
}

export function isNotNullViolation(err: unknown, column: string): boolean {
  const pgErr = err as { code?: string; message?: string; column?: string };
  if (pgErr?.code !== "23502") return false; // not_null_violation
  if (pgErr?.column === column) return true;
  const msg = String(pgErr?.message ?? "");
  return (
    msg.includes(`"${column}"`) || msg.includes(`'${column}'`) || msg.includes(column)
  );
}

