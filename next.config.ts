import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    // domains: ["r2bucket-touhou.hgjertkljw.org"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "r2bucket-touhou.hgjertkljw.org",
        port: "",
        pathname: "/**",
      },
    ],
  }
};

export default nextConfig;
