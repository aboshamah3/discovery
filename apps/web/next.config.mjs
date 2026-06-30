/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Consume the workspace package directly from TypeScript source.
  transpilePackages: ["@ds/shared"],
};

export default nextConfig;
