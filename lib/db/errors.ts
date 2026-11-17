// drizzle-orm wraps the original postgres error in a DrizzleQueryError and exposes
// the driver error through `.cause`, so look at both levels.
function postgresError(error: unknown): { code?: unknown; constraint_name?: unknown; constraint?: unknown } | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const record = error as { code?: unknown; cause?: unknown };
  if (typeof record.code === "string") return record;
  if (typeof record.cause === "object" && record.cause !== null) return record.cause as { code?: unknown };
  return undefined;
}

export function postgresErrorCode(error: unknown): string | undefined {
  const code = postgresError(error)?.code;
  return typeof code === "string" ? code : undefined;
}

export function isUniqueViolation(error: unknown): boolean {
  return postgresErrorCode(error) === "23505";
}

export function isForeignKeyViolation(error: unknown): boolean {
  return postgresErrorCode(error) === "23503";
}

export function postgresConstraintName(error: unknown): string | undefined {
  const inner = postgresError(error);
  const name = inner?.constraint_name ?? inner?.constraint;
  return typeof name === "string" ? name : undefined;
}
