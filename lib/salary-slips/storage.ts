import { mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { ImportFile } from "./model";

// Runtime user data must never be included in Next's server build tracing.
const root = () => path.resolve(/* turbopackIgnore: true */ process.env.SALARY_SLIPS_STORAGE_DIR || (
  process.env.VERCEL
    ? path.join(tmpdir(), "hrm-system", "salary-slips")
    : path.join(process.cwd(), ".local-data", "salary-slips")
));
function resolveFile(relative: string) {
  const absolute = path.resolve(root(), relative);
  if (!absolute.startsWith(root() + path.sep)) throw new Error("Invalid storage path");
  return absolute;
}
export async function saveSource(name: string, buffer: Buffer): Promise<ImportFile> {
  const relative = `${randomUUID()}.xlsx`;
  await mkdir(root(), { recursive: true });
  await writeFile(resolveFile(relative), buffer, { flag: "wx" });
  return { name: path.basename(name), path: relative, sha256: createHash("sha256").update(buffer).digest("hex"), size: buffer.length };
}
export const removeSource = (relative: string) => rm(resolveFile(relative), { force: true });
