import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // data/ (uploaded audio/covers, live-stream recordings) is read via fully
  // dynamic runtime paths and was never meant to be walked by the build's
  // static file tracer -- excluded regardless of whether it's the cause of
  // the ARM64 build crash below.
  outputFileTracingExcludes: {
    '/**': ['./data/**'],
  },
};

export default nextConfig;
