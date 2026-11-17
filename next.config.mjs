// @ts-check

import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

const tunnelHost = "removal-pig-guest-promises.trycloudflare.com";
const devOrigins = [tunnelHost, "hrmdemo.pasitgut.com"];

/** @type {(phase: string) => import('next').NextConfig} */
const nextConfig = (phase) =>
  phase === PHASE_DEVELOPMENT_SERVER
    ? {
        allowedDevOrigins: devOrigins,
        experimental: {
          serverActions: {
            allowedOrigins: devOrigins,
          },
        },
      }
    : {};

export default nextConfig;
