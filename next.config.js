const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3"]
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.kinneret.ac.il"
      }
    ]
  }
};

export default nextConfig;
