import type { NextConfig } from "next";

// API_URL is read at build time (rewrites are baked into the build).
// In development the Next server proxies /api to the Go backend so the browser sees one origin
// (needed for the httpOnly session cookie). In production a reverse proxy (see ../deploy/Caddyfile)
// routes /api to the backend before requests ever reach Next.
const apiUrl = process.env.API_URL ?? "http://localhost:8090";

const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/api/:path*` }];
  },
};

export default config;
