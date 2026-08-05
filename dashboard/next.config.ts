import type { NextConfig } from "next";
const backend = process.env.VESTRA_BACKEND_URL ?? "http://127.0.0.1:3001";
const nextConfig: NextConfig = { webpack: (config) => { config.externals.push("pino-pretty", "lokijs", "encoding"); config.resolve.alias.accounts = false; return config; }, async rewrites() { return [{ source: "/backend/:path*", destination: `${backend}/:path*` }]; } };
export default nextConfig;
