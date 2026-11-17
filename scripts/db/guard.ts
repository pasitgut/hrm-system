// Safety rail for scripts that wipe or bulk-write data (seed, volume seed).
// They are meant for local / throwaway databases, so refuse to run when the
// environment says production or the URL points at a managed (Neon) database,
// unless the operator opts in explicitly with ALLOW_DESTRUCTIVE_DB_SCRIPTS=1.
export function assertSafeToRewriteData(scriptName: string): void {
  const url = process.env.DATABASE_URL ?? "";
  const looksRemote = url.includes("neon.tech");
  const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";

  if ((looksRemote || isProduction) && process.env.ALLOW_DESTRUCTIVE_DB_SCRIPTS !== "1") {
    throw new Error(
      `${scriptName} rewrites data and refuses to run against a production or managed database. ` +
        "Point DATABASE_URL at a local database, or set ALLOW_DESTRUCTIVE_DB_SCRIPTS=1 if you really mean it.",
    );
  }
}
