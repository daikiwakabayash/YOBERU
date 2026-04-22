import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Server Actions のデフォルトボディ上限は 1MB で、スマホで撮った写真
    // (3〜5MB が普通) のアップロードが silent に失敗する原因になる。
    // customer_attachments の上限 10MB に少し余裕を持たせて 15MB に設定。
    serverActions: {
      bodySizeLimit: "15mb",
    },
  },
};

export default nextConfig;
