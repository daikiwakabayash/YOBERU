#!/usr/bin/env npx ts-node
/**
 * LINE リッチメニューを 1 店舗にインストールするスクリプト。
 *
 * 使い方:
 *   npx ts-node scripts/setup-line-rich-menu.ts \
 *     --token=<LINE_CHANNEL_ACCESS_TOKEN> \
 *     --base=https://your-vercel-domain.vercel.app \
 *     --image=./rich-menu.png
 *
 *   # --image を省略すると createRichMenu のみ実行 (画像は後から手動アップロード)
 *
 * 手順:
 *   1. Rich Menu を新規作成 (2500x1686 の 6 分割レイアウト)
 *   2. 各 area にアクションを紐づけ
 *        [予約]        → <base>/line/liff?menu=book
 *        [マイページ]   → <base>/line/liff?menu=mypage
 *        [問診票]       → <base>/line/liff?menu=questionnaire
 *        [来店履歴]     → <base>/line/liff?menu=history
 *        [クーポン]     → <base>/line/liff?menu=coupon
 *        [お問い合わせ] → トーク画面を開く (uri: line://nv/chat)
 *   3. 画像をアップロード
 *   4. デフォルトリッチメニューとして設定
 *
 * 画像サイズ: 2500x1686 (3x2 レイアウト) - PNG/JPEG 1MB 以下
 */

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [k, v] = a.slice(2).split("=");
      return [k, v ?? "true"];
    })
);

const TOKEN = args.token;
const BASE = args.base;
const IMAGE = args.image;

if (!TOKEN || !BASE) {
  console.error("必須: --token=<access_token> --base=<https://your-domain>");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  "Content-Type": "application/json",
};

interface RichMenuArea {
  bounds: { x: number; y: number; width: number; height: number };
  action: { type: string; uri?: string; label?: string };
}

interface RichMenu {
  size: { width: number; height: number };
  selected: boolean;
  name: string;
  chatBarText: string;
  areas: RichMenuArea[];
}

const richMenu: RichMenu = {
  size: { width: 2500, height: 1686 },
  selected: true,
  name: "YOBERU Salon Menu",
  chatBarText: "メニュー",
  areas: [
    // Top row (3 cells)
    {
      bounds: { x: 0, y: 0, width: 833, height: 843 },
      action: { type: "uri", uri: `${BASE}/line/liff?menu=book`, label: "予約" },
    },
    {
      bounds: { x: 833, y: 0, width: 834, height: 843 },
      action: {
        type: "uri",
        uri: `${BASE}/line/liff?menu=mypage`,
        label: "マイページ",
      },
    },
    {
      bounds: { x: 1667, y: 0, width: 833, height: 843 },
      action: {
        type: "uri",
        uri: `${BASE}/line/liff?menu=questionnaire`,
        label: "問診票",
      },
    },
    // Bottom row (3 cells)
    {
      bounds: { x: 0, y: 843, width: 833, height: 843 },
      action: {
        type: "uri",
        uri: `${BASE}/line/liff?menu=history`,
        label: "来店履歴",
      },
    },
    {
      bounds: { x: 833, y: 843, width: 834, height: 843 },
      action: {
        type: "uri",
        uri: `${BASE}/line/liff?menu=coupon`,
        label: "クーポン",
      },
    },
    {
      bounds: { x: 1667, y: 843, width: 833, height: 843 },
      action: {
        type: "uri",
        uri: "https://line.me/R/nv/chat",
        label: "お問い合わせ",
      },
    },
  ],
};

async function main() {
  // 1. Create rich menu
  console.log("Creating rich menu...");
  const createRes = await fetch("https://api.line.me/v2/bot/richmenu", {
    method: "POST",
    headers,
    body: JSON.stringify(richMenu),
  });
  if (!createRes.ok) {
    console.error("リッチメニュー作成失敗:", await createRes.text());
    process.exit(1);
  }
  const { richMenuId } = (await createRes.json()) as { richMenuId: string };
  console.log(`✓ Created: ${richMenuId}`);

  // 2. Upload image (optional)
  if (IMAGE) {
    console.log(`Uploading ${IMAGE}...`);
    const fs = await import("fs");
    const imgBuffer = fs.readFileSync(IMAGE);
    const ext = IMAGE.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
    const uploadRes = await fetch(
      `https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": ext,
        },
        body: imgBuffer,
      }
    );
    if (!uploadRes.ok) {
      console.error("画像アップロード失敗:", await uploadRes.text());
      process.exit(1);
    }
    console.log("✓ Image uploaded");
  }

  // 3. Set as default
  console.log("Setting as default...");
  const defaultRes = await fetch(
    `https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`,
    { method: "POST", headers }
  );
  if (!defaultRes.ok) {
    console.error("デフォルト設定失敗:", await defaultRes.text());
    process.exit(1);
  }
  console.log("✓ Set as default rich menu");
  console.log(`\n完了。richMenuId = ${richMenuId}`);
  console.log(
    IMAGE
      ? "画像も設定済み。LINE アプリから友だち追加すると反映されます。"
      : "次に画像をアップロードしてください:\n" +
          `  curl -X POST https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content \\\n` +
          `    -H "Authorization: Bearer $TOKEN" \\\n` +
          `    -H "Content-Type: image/png" \\\n` +
          "    --data-binary @rich-menu.png"
  );
}

void main();
