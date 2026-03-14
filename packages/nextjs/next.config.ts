import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  typescript: {
    ignoreBuildErrors: process.env.NEXT_PUBLIC_IGNORE_BUILD_ERROR === "true",
  },
  eslint: {
    ignoreDuringBuilds: process.env.NEXT_PUBLIC_IGNORE_BUILD_ERROR === "true",
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.dicebear.com",
      },
    ],
  },
  // Externalize heavy Node.js-only packages so webpack doesn't try to bundle them
  // (BitGo SDK has WASM deps, umbra-js uses Node crypto, ethers v5 is large)
  // @aztec/bb.js, @noir-lang/* have WASM binaries loaded via readFile at runtime —
  // they MUST stay as-is in node_modules, not be bundled by webpack
  serverExternalPackages: [
    "@bitgo/sdk-api",
    "@bitgo/sdk-core",
    "@bitgo/sdk-coin-eth",
    "@bitgo/abstract-eth",
    "@bitgo/sdk-lib-mpc",
    "@wasmer/wasi",
    "@umbracash/umbra-js",
    "ethers",
    "@aztec/bb.js",
    "@noir-lang/noir_js",
    "@noir-lang/acvm_js",
    "@noir-lang/noirc_abi",
    "pako",
  ],
  // --- Vercel serverless function file tracing ---
  // outputFileTracingRoot: monorepo root so Vercel preserves the full directory structure
  // (needed for cross-package file access and correct node_modules resolution)
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // outputFileTracingIncludes: force-include binary files that Vercel's NFT (Node File Tracer)
  // misses because they're loaded at runtime via readFile() with computed paths
  outputFileTracingIncludes: {
    // The claim route generates ZK proofs — needs bb.js WASM, noir WASM, and circuit JSON
    "/api/auction/\\[id\\]/claim": [
      "./node_modules/@aztec/bb.js/dest/node/barretenberg_wasm/**/*",
      "./node_modules/@aztec/bb.js/dest/node-cjs/barretenberg_wasm/**/*",
      "./node_modules/@noir-lang/acvm_js/nodejs/**/*",
      "./node_modules/@noir-lang/noirc_abi/nodejs/**/*",
      "./data/circuits/**/*",
    ],
    // The deposit route computes pedersen hashes — needs bb.js WASM
    "/api/auction/\\[id\\]/deposit": [
      "./node_modules/@aztec/bb.js/dest/node/barretenberg_wasm/**/*",
      "./node_modules/@aztec/bb.js/dest/node-cjs/barretenberg_wasm/**/*",
      "./node_modules/@noir-lang/acvm_js/nodejs/**/*",
      "./node_modules/@noir-lang/noirc_abi/nodejs/**/*",
      "./data/circuits/**/*",
    ],
  },
  webpack: config => {
    config.resolve.fallback = { fs: false, net: false, tls: false };
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};

const isIpfs = process.env.NEXT_PUBLIC_IPFS_BUILD === "true";

if (isIpfs) {
  nextConfig.output = "export";
  nextConfig.trailingSlash = true;
  nextConfig.images = {
    unoptimized: true,
  };
}

module.exports = nextConfig;
