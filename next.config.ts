import type { NextConfig } from "next";

const nextConfig = {
  devIndicators: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.igdb.com" },
      { protocol: "https", hostname: "www.mobygames.com" },
      { protocol: "https", hostname: "mobygames.com" },
      { protocol: "https", hostname: "**.mobygames.com" },
    ],
  },
};

export default nextConfig;
