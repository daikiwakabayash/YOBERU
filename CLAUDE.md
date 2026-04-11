# YOBERU - サロン予約管理システム

## プロジェクト概要
整骨院・整体・エステなどのサロン向け予約管理システム。
Next.js (App Router) + TypeScript + Supabase で構築。

## 技術スタック
- **言語**: TypeScript
- **フレームワーク**: Next.js (App Router)
- **UI**: Tailwind CSS + shadcn/ui (Radix UI ベース)
- **フォーム**: react-hook-form + @hookform/resolvers + zod
- **DB/認証**: Supabase (PostgreSQL + Auth + Storage)
- **カレンダー**: react-calendar-timeline + moment
- **日付選択**: react-datepicker

## ディレクトリ構成
```
app/                        # ルーティング & ページ
  (auth)/                   # 認証画面 (ログイン)
  (dashboard)/              # 認証済み画面
    layout.tsx              # Sidebar + DashboardHeader 付きレイアウト
    [機能名]/[画面名]/      # 各画面
  book/[slug]/              # 公開予約ページ (認証不要)
  q/[slug]/                 # 公開問診票ページ (認証不要)
  shop/[slug]/              # 公開店舗ページ (認証不要)
  api/                      # API ルート
    cron/send-reminders/    # リマインド送信 cron
    questionnaire/[id]/export/ # 問診票 CSV エクスポート
feature/                    # ドメイン・機能ごとに分割
  [機能名]/
    components/             # ドメインに付随するコンポーネント
    actions/                # Write 系のロジック (Server Actions)
    services/               # Read 系のロジック (Supabase クエリ)
    hooks/                  # 機能で使用する Hooks
    schema/                 # zod バリデーションルール
components/                 # ドメイン知識を持たない共通UIコンポーネント
  ui/                       # shadcn/ui コンポーネント
  layout/                   # Sidebar, PageHeader, DashboardHeader, ShopSelector
  form/                     # FormField, SearchableSelect 等
helper/                     # 支援機能グループ
  lib/supabase/             # Supabase クライアント (client/server/middleware)
  lib/shop-context.ts       # ShopContext (getActiveShopId / setActiveShopId)
  utils/                    # 副作用を伴わないビジネスロジック
hooks/                      # 共通フック
supabase/migrations/        # SQL マイグレーション (連番)
```

## コマンド
```bash
npm run dev          # 開発サーバー起動
npm run build        # プロダクションビルド
npm run lint         # ESLint 実行
npx tsc --noEmit     # 型チェックのみ
```

## 開発ルール
- Server Actions は `feature/[name]/actions/` に `"use server"` で配置
- データ取得は `feature/[name]/services/` に Supabase クエリで配置
- バリデーションは zod スキーマを `feature/[name]/schema/` に定義し、クライアント・サーバー共用
- 全テーブルは `deleted_at` によるソフトデリート
- 環境変数はハードコードせず `.env.local` から読み込み
- コミットメッセージは日本語可、変更内容を簡潔に記述
- **`const SHOP_ID = 1` などのハードコード禁止**。必ず `getActiveShopId()` を使う（後述）
- 日付文字列は常に `helper/utils/time.ts` の `toLocalDateString(d)` を使用（Intl.DateTimeFormat + Asia/Tokyo）。`new Date().toISOString().split("T")[0]` は UTC ずれを起こすので禁止
- Supabase の implicit join (`.select("*, shops(name)")`) は FK 未定義で失敗しやすいので、**別クエリ + Map lookup** パターンを推奨（例: `feature/menu/services/getMenus.ts`）

## データベース
- Supabase (PostgreSQL) を使用
- マイグレーションは `supabase/migrations/` に連番 SQL で管理
- 現行マイグレーション:
  - `00001_initial_schema.sql` - 22 基本テーブル
  - `00002_visit_sources_and_billing.sql` - 来店経路 + 会計拡張
  - `00003_booking_links_and_payment_methods.sql` - 強制リンク + 支払方法
  - `00004_reminder_settings.sql` - リマインド設定 + ログ
  - `00005_visit_source_colors.sql` - 来店経路カラー + 問診票
- `menu_manage_id` は VARCHAR prefix 方式: BRD-○○ (ブランド共通) / STR-○○ (店舗限定)

### 多店舗のデータモデル
- **ブランド共通テーブル** (`shop_id` なし): `brands`, `users`, `areas`, `work_patterns`, `booking_links` (shop_id NULL 許可)
- **店舗限定テーブル** (`shop_id NOT NULL`): `staffs`, `appointments`, `customers`, `facilities`, `visit_sources`, `payment_methods`, `questionnaires`, `reminder_logs`, `staff_shifts`, `business_hours`
- **ハイブリッド** (`shop_id` 任意、NULL はブランド共通): `menu_categories`, `menus`

## 認証
- Supabase Auth (Email + Password)
- ロール体系: root / brand / shop / staff (users テーブルの brand_id, shop_id で判定)
- middleware.ts で未認証ユーザーを /login にリダイレクト
- 公開ルート (認証スキップ): `/login`, `/auth`, `/book`, `/shop/`, `/q/`, `/api/cron`

---

## 多店舗アーキテクチャ (ShopContext)

### 概要
1 ブランドが複数店舗を持つ運用に対応するため、すべてのダッシュボード画面は
「現在選択中の店舗」を軸にデータを絞り込む。選択中の店舗は cookie
`yoberu_active_shop_id` で保持される。

### Active Shop の決定フロー
1. `helper/lib/shop-context.ts` の `getActiveShopId()` がまず cookie を読む
2. cookie が無ければブランド配下で `sort_number` が最小の shop を自動選択
3. それも無ければ `1` をフォールバック

### サーバー側で Active Shop を使う
ダッシュボード配下のあらゆる server component / server action は次のパターンで
shopId を取得する:

```ts
import { getActiveShopId, getActiveBrandId } from "@/helper/lib/shop-context";

export default async function MyPage() {
  const shopId = await getActiveShopId();
  const brandId = await getActiveBrandId();

  // その shopId / brandId で Supabase クエリを絞る
  const { data } = await supabase
    .from("staffs")
    .select("*")
    .eq("shop_id", shopId);
  // ...
}
```

**必ず `force-dynamic` を付ける**:
```ts
export const dynamic = "force-dynamic";
```
cookie ベースなので静的生成は不可。

### クライアント側の切替 (ShopSelector)
- `components/layout/ShopSelector.tsx` が `setActiveShopId` server action を呼ぶ
- cookie 書き換え → `revalidatePath("/", "layout")` → `router.refresh()`
- 右上ヘッダー (`DashboardHeader`) に常時表示
- 店舗が 1 件のときはラベル表示のみ、2 件以上のときに Select を表示

### 店舗 - スタッフの紐付け
`staffs.shop_id` が外部キー相当で保持される。スタッフ登録ページは
`getActiveShopId()` を使うので、**「今選択している店舗」にスタッフが
紐付く**挙動になる。店舗 A を選択中に追加したスタッフは、店舗 B に
切替えると表示されない。

### 予約表の店舗切替
`app/(dashboard)/reservation/page.tsx` で `getActiveShopId()` を使い、
該当店舗の予約だけ表示する。店舗切替時は `router.refresh()` で
サーバーコンポーネントが再実行されるため、URL パラメータに shop_id を
含める必要はない。

### 公開店舗ページ `/shop/<uuid>`
`shops.uuid` を slug として使用し、未ログインでも閲覧可能な店舗情報
ページを提供する (`app/shop/[slug]/page.tsx`)。店舗名 / 住所 / 電話 /
LINE / 公開メニューを表示し、フッターから `/book/<default_slug>` への
CTA を置く。

### 新機能を追加する際のチェックリスト
1. 新テーブルを作る際、店舗固有データなら `shop_id INT NOT NULL REFERENCES shops(id)` を含める
2. 一覧画面・詳細画面は必ず `getActiveShopId()` で絞る
3. 登録画面の hidden field / 初期値も `getActiveShopId()` を使う
4. `const SHOP_ID = 1` などのハードコード定数を書かない
5. 公開 (認証不要) ルートを追加する場合は `middleware.ts` の allowlist にも追加する

---

## その他の重要な実装パターン

### 日付・タイムゾーン
- サーバーは UTC で動くので `new Date()` をそのまま使うと日本の日付と食い違う
- 日付文字列は `helper/utils/time.ts::toLocalDateString()` を使う
- この関数は `Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" })` で「日本の YYYY-MM-DD」を返す

### リロード時の「今日」表示
- 予約表は `DateResetOnReload` クライアントコンポーネントでブラウザのリロードを検知
- 検知したら URL の `?date=` を削除 → サーバーが今日の日付で再描画

### 予約の二重予約防止
- `feature/reservation/actions/reservationActions.ts::checkStaffAvailability` で重複判定
- `createAppointment` / `updateAppointment` / `submitPublicBooking` すべてから呼ぶ
- `autoAssignStaff` は指名なし予約を `allocate_order` 昇順で空き枠に自動割当

### 来店経路カラー
- `visit_sources.color` / `label_text_color` を予約カードのバッジに使用
- `/visit-source` マスターでカラーピッカーから編集可能

### 問診票 (`/q/<slug>`)
- `questionnaires` テーブルに JSONB で質問を保存
- `question.field` に customers テーブルのカラム名を指定すると、回答送信時に自動で顧客データへ反映
- 回答は `/api/questionnaire/<id>/export` で UTF-8 BOM 付き CSV として書き出し可能 (Excel 文字化け防止)

### リマインド送信
- `booking_links.reminder_settings` に JSONB で設定を保存
- Cron (`/api/cron/send-reminders`) が対象予約を検出して送信
- 送信結果は `reminder_logs` に記録 (UNIQUE 制約で重複防止)
- 実運用では `sendEmail` を Resend / SendGrid / Nodemailer に差し替え
