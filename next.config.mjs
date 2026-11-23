// @ts-check

import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

const tunnelHost = "removal-pig-guest-promises.trycloudflare.com";
const allowedOrigins = [tunnelHost, "hrmdemo.pasitgut.com", "*.pasitgut.com", "*.trycloudflare.com"];

/** @type {(phase: string) => import('next').NextConfig} */
const nextConfig = (phase) => ({
  ...(phase === PHASE_DEVELOPMENT_SERVER ? { allowedDevOrigins: allowedOrigins } : {}),
  experimental: {
    serverActions: {
      allowedOrigins,
    },
  },
});

export default nextConfig;
