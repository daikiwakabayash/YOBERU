"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Copy, Check } from "lucide-react";
import { toast } from "sonner";

const SETUP_SQL = `-- ============================================================
-- YOBERU - 強制リンク作成 + 支払方法マスター セットアップ
-- Supabase ダッシュボード > SQL Editor で実行してください
-- ============================================================

-- 1. 支払方法マスター
CREATE TABLE IF NOT EXISTS payment_methods (
  id SERIAL PRIMARY KEY,
  brand_id INT NOT NULL,
  shop_id INT NOT NULL,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(32) NOT NULL,
  sort_number INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_payment_methods_shop ON payment_methods (shop_id);

-- 初期データ
INSERT INTO payment_methods (brand_id, shop_id, code, name, sort_number) VALUES
(1, 1, 'cash', '現金', 1),
(1, 1, 'credit', 'クレジット', 2),
(1, 1, 'paypay', 'PayPay', 3),
(1, 1, 'hpb_point', 'HPBポイント', 4)
ON CONFLICT DO NOTHING;

-- 2. 予約リンク（強制リンク）マスター
CREATE TABLE IF NOT EXISTS booking_links (
  id SERIAL PRIMARY KEY,
  brand_id INT NOT NULL,
  shop_id INT,
  slug VARCHAR(64) NOT NULL UNIQUE,
  title VARCHAR(128) NOT NULL,
  memo TEXT,
  language VARCHAR(8) DEFAULT 'ja',
  menu_manage_ids JSONB DEFAULT '[]'::jsonb,
  alias_menu_name VARCHAR(128),
  staff_mode SMALLINT DEFAULT 0,
  require_cancel_policy BOOLEAN DEFAULT TRUE,
  cancel_policy_text TEXT,
  show_line_button BOOLEAN DEFAULT FALSE,
  line_button_text TEXT,
  line_button_url VARCHAR(512),
  visit_source_id INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_booking_links_brand ON booking_links (brand_id);
CREATE INDEX IF NOT EXISTS idx_booking_links_slug ON booking_links (slug);

-- updated_at トリガー（update_updated_at 関数が既に存在する場合）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
    DROP TRIGGER IF EXISTS set_updated_at ON payment_methods;
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON payment_methods
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    DROP TRIGGER IF EXISTS set_updated_at ON booking_links;
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON booking_links
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

-- ============================================================
-- Migration 004: リマインドメール設定
-- ============================================================

-- booking_links に reminder_settings カラムを追加
ALTER TABLE booking_links
  ADD COLUMN IF NOT EXISTS reminder_settings JSONB DEFAULT '[]'::jsonb;

-- リマインド送信ログ (重複送信防止)
CREATE TABLE IF NOT EXISTS reminder_logs (
  id BIGSERIAL PRIMARY KEY,
  appointment_id BIGINT NOT NULL,
  booking_link_id INT,
  type VARCHAR(16) NOT NULL,
  offset_days INT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  status VARCHAR(16) DEFAULT 'sent',
  error_message TEXT,
  UNIQUE (appointment_id, type, offset_days)
);
CREATE INDEX IF NOT EXISTS idx_reminder_logs_appointment
  ON reminder_logs (appointment_id);
CREATE INDEX IF NOT EXISTS idx_reminder_logs_sent_at
  ON reminder_logs (sent_at);
`;

export function SetupRequiredNotice() {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(SETUP_SQL);
    setCopied(true);
    toast.success("SQLをコピーしました");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card className="border-orange-300 bg-orange-50/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-orange-700">
          <AlertTriangle className="h-5 w-5" />
          データベースセットアップが必要です
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p>
          強制リンク作成機能には <code className="rounded bg-white px-1">booking_links</code> と{" "}
          <code className="rounded bg-white px-1">payment_methods</code> の2つのテーブルが必要ですが、まだ作成されていません。
        </p>
        <div className="space-y-2">
          <p className="font-bold">設定手順：</p>
          <ol className="ml-5 list-decimal space-y-1">
            <li>下の「SQLをコピー」ボタンを押してSQLをコピー</li>
            <li>Supabase ダッシュボード → SQL Editor を開く</li>
            <li>ペーストして実行（Run）</li>
            <li>このページをリロード</li>
          </ol>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleCopy} variant="outline">
            {copied ? (
              <>
                <Check className="mr-1 h-4 w-4" />
                コピー済み
              </>
            ) : (
              <>
                <Copy className="mr-1 h-4 w-4" />
                SQLをコピー
              </>
            )}
          </Button>
          <Button onClick={() => location.reload()}>リロード</Button>
        </div>
        <details className="mt-4 rounded border bg-white p-3">
          <summary className="cursor-pointer text-xs text-gray-500">
            SQLの内容を確認する
          </summary>
          <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap text-[10px] text-gray-700">
            {SETUP_SQL}
          </pre>
        </details>
      </CardContent>
    </Card>
  );
}
