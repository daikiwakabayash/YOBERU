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
    layout.tsx              # サイドバー付きレイアウト
    [機能名]/[画面名]/      # 各画面
feature/                    # ドメイン・機能ごとに分割
  [機能名]/
    components/             # ドメインに付随するコンポーネント
    actions/                # Write 系のロジック (Server Actions)
    services/               # Read 系のロジック (Supabase クエリ)
    hooks/                  # 機能で使用する Hooks
    schema/                 # zod バリデーションルール
components/                 # ドメイン知識を持たない共通UIコンポーネント
  ui/                       # shadcn/ui コンポーネント
  layout/                   # Sidebar, PageHeader, DataTable
  form/                     # FormField, SearchableSelect 等
helper/                     # 支援機能グループ
  lib/supabase/             # Supabase クライアント (client/server/middleware)
  utils/                    # 副作用を伴わないビジネスロジック
hooks/                      # 共通フック
supabase/migrations/        # SQL マイグレーション
```

## コマンド
```bash
npm run dev          # 開発サーバー起動
npm run build        # プロダクションビルド
npm run lint         # ESLint 実行
```

## 開発ルール
- Server Actions は `feature/[name]/actions/` に `"use server"` で配置
- データ取得は `feature/[name]/services/` に Supabase クエリで配置
- バリデーションは zod スキーマを `feature/[name]/schema/` に定義し、クライアント・サーバー共用
- 全テーブルは `deleted_at` によるソフトデリート
- 環境変数はハードコードせず `.env.local` から読み込み
- コミットメッセージは日本語可、変更内容を簡潔に記述

## データベース
- Supabase (PostgreSQL) を使用
- マイグレーションは `supabase/migrations/` に SQL で管理
- テーブル定義は `(新)SATTOU_テーブル定義書` に準拠
- menu_manage_id は VARCHAR prefix 方式: BRD-○○ (ブランド共通) / STR-○○ (店舗限定)

## 認証
- Supabase Auth (Email + Password)
- ロール体系: root / brand / shop / staff (users テーブルの brand_id, shop_id で判定)
- middleware.ts で未認証ユーザーを /login にリダイレクト
