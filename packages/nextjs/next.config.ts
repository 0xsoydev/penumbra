import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  typescript: {
    ignoreBuildErrors: process.env.NEXT_PUBLIC_IGNORE_BUILD_ERROR === "true",
  },
  eslint: {
    ignoreDuringBuilds: process.env.NEXT_PUBLIC_IGNORE_BUILD_ERROR === "true",
  },
  // Externalize heavy Node.js-only packages so webpack doesn't try to bundle them
  // (BitGo SDK has WASM deps, umbra-js uses Node crypto, ethers v5 is large)
  serverExternalPackages: [
    "@bitgo/sdk-api",
    "@bitgo/sdk-core",
    "@bitgo/sdk-coin-eth",
    "@bitgo/abstract-eth",
    "@bitgo/sdk-lib-mpc",
    "@wasmer/wasi",
    "@umbracash/umbra-js",
    "ethers",
  ],
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
