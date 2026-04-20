# 広告 API 連携 (Meta / TikTok) — 設計と運用手順

YOBERU の広告費 (`ad_spend`) を Meta Marketing API / TikTok Marketing API
から自動取得し、マーケティングダッシュボードに反映する仕組み。

取得指標: **消化金額 / Impression / クリック数 / CTR / CVR / CPM**

---

## 1. 全体像

```
┌──────────────────┐    30 分ごと   ┌─────────────────────┐
│ Vercel Cron      │ ────────────▶ │ /api/cron/sync-ads  │
│ */30 * * * *     │                └──────────┬──────────┘
└──────────────────┘                           │
                                               ▼
                                ┌──────────────────────────┐
                                │ shops を全件走査         │
                                │ token がある店舗のみ実行 │
                                └──────┬─────────┬─────────┘
                                       │         │
                                       ▼         ▼
                            ┌────────────┐  ┌────────────┐
                            │ syncMetaAds │  │syncTikTokAds│
                            └──────┬──────┘  └──────┬──────┘
                                   │                 │
                                   ▼                 ▼
                       ┌─────────────────────────────────────┐
                       │ ad_spend テーブルを upsert          │
                       │ (shop_id, visit_source_id, year_month) │
                       │ + impressions / clicks / ctr / cvr /   │
                       │   cpm / conversions / source / synced_at │
                       └──────────────────┬──────────────────┘
                                          │
                                          ▼
                              ┌────────────────────────┐
                              │ /marketing ダッシュボード│
                              │ (getMarketingData が読む) │
                              └────────────────────────┘
```

- 同期失敗は `ad_sync_logs` に記録 (1 店舗が止まっても他店舗は続行)
- 同期方向は **読み取りのみ** — 広告アカウントには一切書き込まない

---

## 2. データモデル

### 2.1 ad_spend (拡張)

`supabase/migrations/00021_ad_api_integration.sql` で追加:

| カラム            | 型             | 説明                                |
|-------------------|----------------|-------------------------------------|
| amount            | INT            | 消化金額 (円, 既存)                 |
| impressions       | BIGINT         | 表示回数                            |
| clicks            | BIGINT         | クリック数                          |
| conversions       | BIGINT         | コンバージョン数                    |
| ctr               | NUMERIC(8,4)   | クリック率 (% 値, 例 1.23)          |
| cvr               | NUMERIC(8,4)   | CVR (% 値)                          |
| cpm               | NUMERIC(12,2)  | 1000 表示単価 (円)                  |
| source            | VARCHAR(16)    | 'manual' / 'meta' / 'tiktok'        |
| synced_at         | TIMESTAMPTZ    | 最終同期時刻                        |

UNIQUE: `(shop_id, visit_source_id, year_month) WHERE deleted_at IS NULL`

### 2.2 shops (拡張)

| カラム                 | 型           | 説明                                |
|------------------------|--------------|-------------------------------------|
| meta_ad_account_id     | VARCHAR(64)  | 例: `act_1234567890`                |
| meta_access_token      | TEXT         | システムユーザートークン (長期)     |
| tiktok_advertiser_id   | VARCHAR(64)  | 数値 advertiser_id                  |
| tiktok_access_token    | TEXT         | 長期 access_token                   |

**保管方式**: 平文 (LINE 連携と同じパターン)。
本番運用では Supabase Vault や Vercel 環境変数経由での管理を推奨。

### 2.3 visit_sources (拡張)

| カラム               | 型           | 説明                                       |
|----------------------|--------------|--------------------------------------------|
| platform_type        | VARCHAR(16)  | 'meta' / 'tiktok' / NULL                   |
| platform_account_id  | VARCHAR(128) | Meta の campaign_id 等。NULL なら全体集計  |

既存 seed (`Meta広告` / `TikTok広告`) はマイグレーション内で
`platform_type` を後付け済み。

### 2.4 ad_sync_logs (新規)

| カラム          | 型           | 説明                            |
|-----------------|--------------|---------------------------------|
| shop_id         | BIGINT       | 対象店舗                        |
| platform        | VARCHAR(16)  | 'meta' / 'tiktok'               |
| status          | VARCHAR(16)  | 'success' / 'failed'            |
| fetched_rows    | INT          | API から取得した日付分の行数    |
| error_message   | TEXT         | 失敗時のエラー                  |
| triggered_by    | VARCHAR(16)  | 'cron' / 'manual'               |
| started_at      | TIMESTAMPTZ  | 開始時刻                        |
| finished_at     | TIMESTAMPTZ  | 終了時刻                        |

---

## 3. Meta Marketing API の準備手順 (店舗オーナー側)

1. **Meta for Developers** (`https://developers.facebook.com/apps/`) でアプリを作成
   - 種別: 「ビジネス」
   - **Marketing API** プロダクトを追加
2. **Business Manager** → 設定 → ユーザー → **システムユーザー** を作成
   - ロール: Admin
   - アサイン: 対象の広告アカウント (`Ads Account`)
3. システムユーザーから **長期アクセストークン** を発行
   - スコープ: `ads_read`
4. 広告アカウント ID を取得 (Business Manager の URL に表示)
   - 形式: `act_{数字}` (例 `act_1234567890`)
5. YOBERU 管理画面 → 店舗設定 → 「広告 API 連携」セクションに入力
   - Meta 広告アカウント ID
   - Meta アクセストークン
6. (任意) `/visit-source` で「Meta広告」の `platform_account_id` に
   特定キャンペーン ID を設定すると、そのキャンペーンに絞って取得可能。
   未設定なら広告アカウント全体の集計を取得。

### 3.1 Meta API の制限事項

- 取得期間: 最大 37 ヶ月遡及可能
- レート制限: 1 トークン × 1 アプリで 200 calls / 1 時間 / ユーザー
- 30 分間隔の cron なら余裕あり (1 店舗 1 platform = 1 call)
- 期限切れ: システムユーザートークンは無期限。ただしスコープ変更時に
  再発行必要

---

## 4. TikTok Marketing API の準備手順

1. **TikTok For Business Developer Portal** (`https://business-api.tiktok.com/portal/`)
   でアプリを作成
2. アプリの **Permissions** で `Reporting` (広告レポート読み取り) を有効化
3. 広告主アカウントとアプリを紐付ける
   - 広告主アカウント側で **Authorize** が必要
4. **長期 access_token** を取得
   - OAuth フローまたは Long-Term Token API 経由
5. 広告主 ID (`advertiser_id`) を取得
   - TikTok Ads Manager の URL から取得可能
6. YOBERU 管理画面 → 店舗設定 → 「広告 API 連携」セクションに入力
   - TikTok 広告主 ID
   - TikTok アクセストークン

### 4.1 TikTok API の制限事項

- レート制限: 600 QPM / アプリ
- レポート遅延: 数時間程度の遅延あり (TikTok 仕様)
- 期限切れ: 通常 **1 年** で失効。期限が近づいたら再発行が必要。
  期限管理用の運用検討: token を更新したら synced_at が "古い" 状態に
  なるので ad_sync_logs を週次でチェック

---

## 5. 環境変数

`.env.local` (または Vercel 環境変数) に設定:

```bash
# Cron 認証 (推奨)
CRON_SECRET=任意の長いランダム文字列

# Meta のコンバージョン action_type (任意 — 未設定時はデフォルト使用)
META_CONVERSION_ACTION_TYPES=offsite_conversion.fb_pixel_lead,offsite_conversion.fb_pixel_purchase
```

### 5.1 CRON_SECRET 設定後の動作

- 設定済み: cron リクエストに `Authorization: Bearer <CRON_SECRET>` が
  必要。Vercel Cron は自動付与される
- 未設定: 開発用に素通し (本番では必ず設定)

---

## 6. デプロイ手順

### 6.1 Supabase マイグレーション

```bash
# Supabase CLI 経由
supabase db push

# もしくは Supabase Studio で SQL Editor から
# supabase/migrations/00021_ad_api_integration.sql を実行
```

### 6.2 Vercel デプロイ

`vercel.json` に Cron 定義を追加済み。
Vercel プロジェクト設定で:

1. Project Settings → Environment Variables → `CRON_SECRET` を追加
2. デプロイ後、Vercel Dashboard → Cron Jobs で `/api/cron/sync-ads` が
   30 分間隔で並んでいることを確認
3. 初回手動実行: `/ad-spend` ページの「API から同期」ボタンで疎通確認

### 6.3 動作確認

```bash
# 手動 cron 叩き
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://your-app.vercel.app/api/cron/sync-ads

# レスポンス例
{
  "ok": true,
  "summary": { "totalShops": 3, "success": 2, "failed": 0 },
  "results": [
    { "shopId": 1, "platform": "meta", "ok": true, "fetchedRows": 20 },
    { "shopId": 1, "platform": "tiktok", "ok": true, "fetchedRows": 20 }
  ]
}
```

---

## 7. UI 上のフロー

### 7.1 店舗オーナー

1. `/store/{id}` の編集フォーム → 「広告 API 連携」セクションに
   トークンを入力 → 保存
2. `/visit-source` で `Meta広告` / `TikTok広告` の `platform_type` /
   `platform_account_id` を確認 (マイグレーションで自動セット済み)
3. `/ad-spend` ページの右上「API から同期」ボタンで初回同期
4. `/marketing` で Impressions / CTR / CVR / CPM のカードを確認

### 7.2 自動同期

- Vercel Cron が 30 分ごとに `/api/cron/sync-ads` を叩く
- 当月分のみ同期 (毎回月初〜今日までを再取得し ad_spend を上書き)
- 失敗は `ad_sync_logs` に記録。Supabase Studio で確認可能

---

## 8. データの一貫性 / 上書きルール

- 同じ `(shop_id, visit_source_id, year_month)` に対して 1 行のみ
- API 同期が成功すると `source = 'meta' | 'tiktok'` で上書き
- ユーザーが手動入力しても、次の cron で API 値に上書きされる
- 手動入力を残したい場合は API トークンを削除するか、`/visit-source`
  で `platform_type` を NULL に設定して同期対象から除外

---

## 9. トラブルシューティング

| 症状                                          | 対処                                           |
|-----------------------------------------------|------------------------------------------------|
| `Meta API トークンが店舗設定に未登録です`     | 店舗設定で再入力 / 再発行                      |
| `platform_type='meta' の visit_source がない` | `/visit-source` で 媒体を作成 + platform_type  |
| `Meta API error: ...`                          | トークンの権限・期限切れを確認                 |
| `TikTok API error (40105): ...`               | advertiser_id とトークンの組み合わせ確認       |
| Cron が動かない                                | `CRON_SECRET` の env 確認 / Vercel Cron 有効化 |

---

## 10. 今後の拡張候補

- 日次粒度の保存 (現状は月集計のみ)。`ad_insights_daily` テーブル新設
- Google Ads API 連携 (HotPepper Beauty も同様に検討)
- Web hook 連携 (TikTok / Meta が支出超過などをリアルタイム通知)
- トークン暗号化 (Supabase Vault or AES-GCM with KMS)
- Meta Pixel イベントから来店経路を自動マッピング
