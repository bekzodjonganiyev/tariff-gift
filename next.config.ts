import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page in this app reads the per-user session (cookies), so there is
  // nothing to partially prerender — keep standard dynamic SSR instead of the
  // Cache Components model, which would otherwise require Suspense boundaries
  // around every auth read for no rendering benefit.
  cacheComponents: false,
  allowedDevOrigins: ["actress-payroll-unshaved.ngrok-free.dev"],
};

export default nextConfig;
