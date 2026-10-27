import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

function publicAsset(name: string) {
  return path.join(process.cwd(), "public", name);
}

export async function loadReportFonts() {
  const regularPath = publicAsset("THSarabunNew.ttf");
  const boldPath = publicAsset("THSarabunNew-Bold.ttf");
  if (!existsSync(regularPath) || !existsSync(boldPath)) {
    throw new Error("TH Sarabun New PDF font files are missing");
  }

  const [regularFont, boldFont] = await Promise.all([readFile(regularPath), readFile(boldPath)]);
  return { regular: regularFont.toString("base64"), bold: boldFont.toString("base64") };
}
