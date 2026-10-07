// @ts-check

import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

const tunnelHost = "removal-pig-guest-promises.trycloudflare.com";

/** @type {(phase: string) => import('next').NextConfig} */
const nextConfig = (phase) =>
  phase === PHASE_DEVELOPMENT_SERVER
    ? {
        allowedDevOrigins: [tunnelHost],
        experimental: {
          serverActions: {
            allowedOrigins: [tunnelHost],
          },
        },
      }
    : {};

export default nextConfig;
