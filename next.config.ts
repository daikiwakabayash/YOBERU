import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Server Actions のデフォルトボディ上限は 1MB で、スマホで撮った写真
    // (3〜5MB) や 動画 (1080p 30秒 で 30〜80MB) のアップロードが silent
    // に失敗する原因になるので、customer_attachments の上限に合わせて
    // 100MB に設定する。
    //
    // ⚠ Vercel Hobby プランは serverless function の payload 上限が
    //   4.5MB に固定されているため、それ以上の動画は実質アップロード
    //   できない。動画を本格運用するなら Pro 以上のプランか、Supabase
    //   Storage への signed-URL 直接アップロードへの切替が必要。
    serverActions: {
      bodySizeLimit: "100mb",
    },
  },
};

export default nextConfig;
