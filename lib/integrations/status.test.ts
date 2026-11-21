import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getIntegrationStatus } from "@/lib/integrations/status";

const ENV_KEYS = [
  "GOOGLE_DRIVE_OAUTH_CLIENT_ID",
  "GOOGLE_DRIVE_OAUTH_CLIENT_SECRET",
  "GOOGLE_DRIVE_REFRESH_TOKEN",
  "CLOUDINARY_URL",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "CHECKER_API_EMAIL",
  "CHECKER_API_PASSWORD",
] as const;

describe("getIntegrationStatus", () => {
  const snapshot = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (snapshot[key] === undefined) delete process.env[key];
      else process.env[key] = snapshot[key];
    }
  });

  it("reports all external services as unconfigured when env vars are missing", () => {
    for (const key of ENV_KEYS) delete process.env[key];

    const status = getIntegrationStatus();
    expect(status.googleDrive).toBe(false);
    expect(status.cloudinary).toBe(false);
    expect(status.checker).toBe(false);
    expect(status.unconfigured.map((item) => item.key)).toEqual(["googleDrive", "cloudinary", "checker"]);
  });

  it("reports configured services accurately without leaking secrets", () => {
    for (const key of ENV_KEYS) delete process.env[key];
    process.env.CLOUDINARY_CLOUD_NAME = "demo-cloud";
    process.env.CLOUDINARY_API_KEY = "demo-key";
    process.env.CLOUDINARY_API_SECRET = "super-secret";

    const status = getIntegrationStatus();
    expect(status.cloudinary).toBe(true);
    expect(status.googleDrive).toBe(false);
    expect(status.checker).toBe(false);
    expect(status.unconfigured.map((item) => item.key)).toEqual(["googleDrive", "checker"]);
    expect(JSON.stringify(status)).not.toContain("super-secret");
  });
});
