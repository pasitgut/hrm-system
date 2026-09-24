export function postgresErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const record = error as { code?: unknown; cause?: unknown };
  if (typeof record.code === "string") return record.code;
  if (typeof record.cause === "object" && record.cause !== null) {
    const cause = record.cause as { code?: unknown };
    if (typeof cause.code === "string") return cause.code;
  }
  return undefined;
}
