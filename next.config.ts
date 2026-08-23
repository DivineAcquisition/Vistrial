import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.vistrial.io" }],
        destination: "https://vistrial.io/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
