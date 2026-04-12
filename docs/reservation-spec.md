# YOBERU 予約システム仕様書

> エンジニア向け — 2026-04-13 時点のスナップショット

---

## 1. システム構造

### 1.1 技術スタック

| レイヤー | 技術 |
|---|---|
| フロントエンド | Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 |
| UI コンポーネント | shadcn/ui (Base UI `@base-ui/react` ベース) |
| バックエンド | Next.js Server Actions (`"use server"`) |
| DB / 認証 | Supabase (PostgreSQL + PostgREST + Auth) |
| デプロイ | Vercel |

### 1.2 ディレクトリ構成

```
app/(dashboard)/          ← 認証済みの全画面 (cookie で shopId 管理)
  reservation/            ← 予約表 (日表示 / 週表示)
  customer/               ← 顧客一覧 / 詳細 / 履歴
  sales/                  ← 売上日報
  kpi/                    ← 経営指標ダッシュボード
  marketing/              ← マーケティング分析
  slot-block-type/        ← 予約ブロック種別マスター (NEW)
  store/                  ← 店舗マスター
  staff/                  ← スタッフマスター
  menu/ / menu-category/  ← メニューマスター
  visit-source/           ← 来店経路マスター
  ...

feature/                  ← ドメインロジック (1 機能 = 1 ディレクトリ)
  reservation/
    components/           ← ReservationCalendar, WeeklyReservationCalendar,
                             AppointmentDetailSheet, ReservationCalendarToolbar
    actions/              ← createAppointment, updateAppointment, cancelAppointment, ...
    services/             ← getCalendarData, getWeeklyCalendarData
    schema/               ← reservation.schema.ts (zod)
    types.ts              ← CalendarAppointment, CalendarData, SlotBlockTypeInfo
  customer/
    actions/              ← createCustomer, getCustomerReviewStatus, setCustomerReviewStatus
    services/             ← getCustomers, searchCustomers, getCustomerFullDetail
  sales/
    services/             ← getDailyReport, getStaffUtilization, getSales
  slot-block-type/
    actions/              ← CRUD for slot_block_types
    components/           ← SlotBlockTypeList (マスター管理 UI)
  ...
```

### 1.3 マイグレーション一覧

| # | ファイル | 内容 |
|---|---|---|
| 00001 | initial_schema.sql | 22 基本テーブル (users, shops, staffs, appointments, customers, menus, ...) |
| 00002 | visit_sources_and_billing.sql | 来店経路 + 会計拡張 (payment_method, visit_count, sales, ...) |
| 00003 | booking_links_and_payment_methods.sql | 公開予約リンク + 支払方法マスター |
| 00004 | reminder_settings.sql | リマインド設定 + ログ |
| 00005 | visit_source_colors.sql | 来店経路カラー + 問診票 |
| 00006 | visit_count_and_slug_backfill.sql | 来店回数バックフィル + slug 正規化 |
| 00007 | marketing_and_member_plans.sql | ad_spend テーブル + is_member_join + 会員プラン seed |
| 00008 | booking_link_multi_shop.sql | 強制リンクの複数店舗対応 |
| 00009 | customer_reviews.sql | G口コミ / H口コミ (google_review_received_at, hotpepper_review_received_at) |
| 00010 | meeting_and_other_bookings.sql | appointments.other_label + shops.enable_meeting_booking |
| 00011 | nullable_customer_for_slot_blocks.sql | appointments.customer_id の NOT NULL 制約を外す |
| 00012 | slot_block_types_master.sql | slot_block_types テーブル + appointments.slot_block_type_code + seed 3 件 |

---

## 2. データモデル (主要テーブル)

### 2.1 appointments (予約)

| カラム | 型 | 説明 |
|---|---|---|
| id | BIGSERIAL PK | |
| brand_id / shop_id | BIGINT FK | ブランド / 店舗 |
| customer_id | BIGINT FK (nullable) | 顧客。枠ブロックではシステム顧客 or NULL |
| staff_id | BIGINT FK | 担当スタッフ |
| menu_manage_id | VARCHAR(64) | メニュー識別子。枠ブロックでは `SYS-MEETING` / `SYS-OTHER` / `SYS-BREAK` |
| **type** | SMALLINT | **0 = 通常予約 / 1+ = 枠ブロック** (後述) |
| **slot_block_type_code** | VARCHAR(32) | 枠ブロックの種別コード (`meeting` / `other` / `break` / ユーザー定義) |
| **other_label** | VARCHAR(128) | 「その他」の自由入力タイトル |
| status | SMALLINT | 0=待機 / 1=施術中 / 2=完了 / 3=キャンセル / 4=当日キャンセル / 99=no-show |
| start_at / end_at | TIMESTAMPTZ | 開始 / 終了日時 |
| sales | INT | 売上金額 |
| visit_count | INT | 来店回数スナップショット (1 = 初回) |
| visit_source_id | INT FK | 来店経路 |
| payment_method | VARCHAR(32) | 支払い方法コード |
| additional_charge | INT | 追加料金 |
| is_member_join | BOOLEAN | この来店で入会した (マーケ入会率の分子) |
| memo | TEXT | メモ (枠ブロックではユーザーメモ) |
| customer_record | TEXT | カルテ本文 |
| cancelled_at | TIMESTAMPTZ | キャンセル日時 |
| deleted_at | TIMESTAMPTZ | ソフトデリート |

### 2.2 customers (顧客)

| カラム | 型 | 説明 |
|---|---|---|
| id | BIGSERIAL PK | |
| code | VARCHAR(16) UNIQUE | **カルテ番号** (新規は `1`, `2`, `3`... の連番) |
| brand_id / shop_id | BIGINT FK | |
| last_name / first_name | VARCHAR | 氏名 |
| phone_number_1 | VARCHAR(11) | 電話番号 |
| visit_count | INT | 累計来店回数 |
| total_sales | INT | 累計売上 |
| last_visit_date | DATE | 最終来院日 |
| google_review_received_at | TIMESTAMPTZ | G口コミ受領日時 (NULL = 未受領) |
| hotpepper_review_received_at | TIMESTAMPTZ | H口コミ受領日時 (NULL = 未受領) |
| type | SMALLINT | 0=一般 / 1=会員 / 2=退会 |
| ... (基本情報) | | gender, birth_date, address, email, line_id, description 等 |

### 2.3 slot_block_types (枠ブロック種別マスター)

| カラム | 型 | 説明 |
|---|---|---|
| id | BIGSERIAL PK | |
| brand_id | BIGINT | ブランド単位で管理 |
| code | VARCHAR(32) | 内部コード (`meeting`, `other`, `break`, ユーザー定義) |
| label | VARCHAR(64) | 表示名 (`ミーティング`, `休憩`, `その他`) |
| color | VARCHAR(9) | 背景色 (#hex) |
| label_text_color | VARCHAR(9) | ラベル文字色 |
| sort_number | INT | 並び順 |
| is_active | BOOLEAN | 有効フラグ |

**デフォルト seed (brand_id=1):**

| code | label | color |
|---|---|---|
| meeting | ミーティング | #9333ea (紫) |
| other | その他 | #0ea5e9 (水色) |
| break | 休憩 | #f59e0b (黄) |

---

## 3. 条件設定 / ビジネスルール

### 3.1 予約の種類 (type カラム)

```
type = 0  → 通常予約 (お客様の施術)
type != 0 → 枠ブロック (非施術。slot_block_type_code で種別を特定)
```

**集計ルール: `type = 0` のみ**がすべての集計 (売上・稼働率・マーケ・KPI) の対象。枠ブロックは自動除外。

### 3.2 ステータス遷移

```
0 (待機) → 1 (施術中)  : checkinAppointment
1 (施術中) → 2 (完了)  : completeAppointment + 売上確定
0 or 1 → 3 (キャンセル): cancelAppointment
0 or 1 → 4 (当日キャンセル): sameDayCancelAppointment (customer_record にキャンセル理由保存)
```

### 3.3 新規 / 既存の判定

**予約カード上の「新規」バッジ:**
```
IF customer.created_at >= その予約日の 00:00:00+09:00
  → 新規 (本日登録された顧客)
ELSE
  → 既存 (患者DBに以前から存在)
FALLBACK: customer.created_at が NULL → visit_count === 1 なら新規
```

**マーケティング分析の「新規」:**
```
appointments.visit_count = 1 のみカウント
→ 実来院, キャンセル, 売上, 入会 すべて初回来店者のみ
```

### 3.4 稼働率の計算

```
稼働率 = busyMin / openMin

openMin = スタッフのシフト時間の合計 (分)
busyMin = 予約の実時間合計 (分)

除外:
  - status 3, 4, 99 (キャンセル系)
  - type != 0 (枠ブロック: ミーティング / 休憩 / その他)

稼働率バッジの色:
  >= 85% → 赤 (bg-red-100)
  >= 60% → 琥珀 (bg-amber-100)
  < 60%  → 緑 (bg-emerald-100)
  シフト無し → グレー "—"
```

### 3.5 日報 (getDailyReport)

```
- endDate を Asia/Tokyo の「今日」にクランプ (未来の予約は日報に出さない)
- 新規 vs 継続の判定:
    新規 = visit_count === 1 OR (is_member_join=true かつ初回入会)
    継続 = それ以外
- 支払い方法ごとの売上内訳
- 来店経路ごとの新規数
```

### 3.6 カルテ番号 (customers.code)

```
- 新規顧客作成時: shop_id 内の最大 code を parseInt で取得し +1 (ゼロ埋めなし)
- 表示: 先頭ゼロを除去 ("00000012" → "12")
- 検索: 数字のみの入力 → code の exact match + prefix match (既存ゼロ埋めにも対応)
         文字列の入力  → 名前 / フリガナ / 電話 / code の部分一致
```

### 3.7 口コミ (G口コミ / H口コミ)

```
- customers テーブルの TIMESTAMPTZ カラム (NULL = 未受領)
- 予約パネルのチェックボックスで即時更新 (楽観的更新 + server action)
- KPI ダッシュボードでは shop 全体の累計件数を表示
- 顧客未選択時はチェックボックス自体を非表示
```

### 3.8 メニューの非公開フィルタ

```
menus.status = TRUE のみ予約パネルに表示
→ マスター側で「非公開」にしたメニューは予約入力に出ない
```

---

## 4. 特定ケースにおける挙動

### 4.1 枠ブロック (ミーティング / 休憩 / その他) の作成

**フロー:**
1. 予約表の空きスロットをタップ → 左からシート (480px) が開く
2. モード切替ボタン: `新規予約を作成` / `ミーティング` / `休憩` / `その他`
3. ミーティング / 休憩: 時間 (15/30/45/60/90/120分) + メモ
4. その他: タイトル入力 + 時間 + メモ
5. `予定を登録` → createAppointment:
   - customer_id: **getOrCreateSystemBlockCustomer** でシステム顧客を自動取得/作成
   - type: 1 (meeting) / 2 (other) / 3 (break)
   - slot_block_type_code: `"meeting"` / `"other"` / `"break"`
   - menu_manage_id: `SYS-MEETING` / `SYS-OTHER` / `SYS-BREAK`

**システム顧客プレースホルダー:**
```
code = "SYS-BLOCK-{shopId}"
last_name = "（ブロック）"
→ appointments.customer_id NOT NULL 制約を満たすための仕組み
→ migration 00011 が適用済みの場合は本来不要だが、後方互換のため維持
```

### 4.2 枠ブロックのタップ (既存編集)

```
1. カレンダー上の枠ブロックをタップ
2. AppointmentDetailSheet が appointment.slotBlock を検出
3. bookingMode を既存コードに自動セット (meeting / other / break)
4. 時間・メモ・ラベルを事前充填
5. 「予定を更新」→ updateAppointment
6. 「この予定を削除」→ deleteAppointment (ソフトデリート)
7. 顧客検索 / メニュー / 会計のセクションは非表示
8. 右の患者DBパネルも非表示 (シート幅 480px 固定)
```

### 4.3 予約詳細シートのレイアウト遷移

```
初期状態 (顧客未選択):
  side="left", maxWidth=480px
  → 左側に予約入力フォームのみ (カレンダーが右に見える)

顧客選択後:
  maxWidth=100vw に展開 (transition-[max-width] 300ms ease-out)
  → 左 480px: 入力フォーム (border-r で区切り)
  → 右 flex-1: CustomerDossierPanel (患者DBダッシュボード)

CustomerDossierPanel の内容:
  - 4 KPI カード: 来院回数 / 累計売上 / ステータス / 最終来院
  - 基本情報カード: 電話, Email, 住所, 性別, 生年月日, 職業, LINE, メモ
  - 来院履歴・カルテ (直近50件): 日付 / 時間 / メニュー / 担当 / 売上 / カルテ本文
  - データは getCustomerFullDetail(customerId) で遅延ロード
```

### 4.4 予約カード上の表示分岐

```
通常予約 (type = 0):
  名前 (カルテNo) + 新規/N回目バッジ + メニュー名 (N分)
  新規 → オレンジ枠 + 来店経路色バッジ
  完了 → グレー枠 + 「完了」バッジ
  施術中 → 緑枠 + 「施術中」バッジ
  キャンセル → 右端の狭いストリップ表示

枠ブロック (type != 0):
  マスター色の左ボーダー (border-l-4) + 薄い背景
  上段: ラベルピル (ミーティング / 休憩 / その他)
  下段: メモ (meeting/break) or タイトル (other)
  タップ → 枠ブロック編集画面
```

### 4.5 週表示の稼働率

```
ヘッダーバナー: スタッフ名 + 週間稼働率 (getRangeStaffUtilization)
各日の列ヘッダー: 曜日 + 日付 + 日別稼働率バッジ (getDailyStaffUtilization × 7 並列)
```

### 4.6 スタッフ Select が ID を表示してしまう問題の対策

```
Base UI (@base-ui/react/select) の仕様:
  Select.Value は Root に items マップを渡さないと value の生文字列を表示
  
対策: StaffSelect / ShopSelector で useMemo(() => Object.fromEntries(...)) して
  items={{ "1": "田中", "2": "みこ" }} を Select Root に渡す
```

### 4.7 SAFE_SELECT フォールバック

```
getCalendarData / getWeeklyCalendarData では
  FULL_SELECT (is_member_join, other_label, slot_block_type_code を含む)
  が失敗したとき (migration 未適用でカラムが存在しない場合)
  → SAFE_SELECT (基本カラムのみ) でリトライ

これにより、新しい migration が未適用でもカレンダーが真っ白にならない
```

### 4.8 スクロールの 1 回目が効かない問題の対策

```
原因: handleDragStart 内の e.preventDefault() がタッチスクロールの決定を奪っていた
対策:
  - preventDefault() を削除
  - カードに select-none クラスで文字選択を抑止
  - main 要素に WebkitOverflowScrolling: touch + touchAction: pan-y
  - overscrollBehavior: contain は削除 (iOS で最初のスクロールを飲み込むため)
```

---

## 5. カレンダーの寸法パラメータ

### 日表示 (ReservationCalendar)

| パラメータ | 値 | 説明 |
|---|---|---|
| SLOT_HEIGHT | 34px | 30 分スロットの基準高さ |
| TIME_COL_WIDTH | 52px | 時間軸列の幅 |
| STAFF_COL_WIDTH | 210px | スタッフ列の幅 |

### 週表示 (WeeklyReservationCalendar)

| パラメータ | 値 | 説明 |
|---|---|---|
| SLOT_HEIGHT | 34px | |
| TIME_COL_WIDTH | 52px | |
| DAY_COL_MIN_WIDTH | 150px | 各曜日列の最小幅 |

### 時間グリッドの太線ルール (Google Calendar 方式)

```
各スロットの bottom border:
  次のスロットが整時 (bottomMin % 60 === 0) → border-b-2 border-gray-300
  それ以外 → border-b border-gray-100
グリッド上辺: border-t-2 border-gray-400 (最初の時刻ラインを描画)
時間ラベル位置: top = idx * slotHeightPx + 4 (ラインの直下)
```

---

## 6. 今後の拡張ポイント

- slot_block_types にユーザーが自由に種別を追加 → `slot_block_type_code` で自動対応
- Meta Conversions API / HotPepper CSV 連携 (マーケティング)
- スタッフ別チャーン率 (KPI)
- appointment_type=meeting 時の稼働率計算オプション
- 問診票の回答を顧客カルテに自動反映
