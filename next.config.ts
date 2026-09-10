import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Runtime data (uploaded audio/covers, live-stream recordings) lives under
  // data/ and is read via fully dynamic paths the app builds at request time
  // -- it was never meant to be walked by the build's static file tracer.
  // On the production server that directory holds real binary media files;
  // the tracer tried to render one as a source-code excerpt for a diagnostic
  // and crashed slicing raw bytes at a non-UTF-8 boundary.
  outputFileTracingExcludes: {
    '/**': ['./data/**'],
  },
};

export default nextConfig;
