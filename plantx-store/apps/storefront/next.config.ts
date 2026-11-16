import type { NextConfig } from "next"

const backend = new URL(process.env.MEDUSA_BACKEND_URL || "http://localhost:9000")

const config: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: backend.protocol.replace(":", "") as "http" | "https",
        hostname: backend.hostname,
        port: backend.port,
        pathname: "/static/**",
      },
      ...(process.env.S3_IMAGE_HOST
        ? [{ protocol: "https" as const, hostname: process.env.S3_IMAGE_HOST }]
        : []),
    ],
  },
}

export default config
