import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * 信頼されたサーバ専用処理 (cron / webhook) のための service-role
 * Supabase クライアント。
 *
 * server.ts の createClient() は anon キー + cookie のユーザ文脈
 * クライアント。ログインユーザのいない cron では anon ロールになり、
 * RLS の効いたテーブル (例: reminder_logs) への書き込みが PostgREST で
 * 401 になる (読み取りは通るが POST/INSERT が拒否され、リマインドの
 * ロック行が作れず送信されない)。cron は信頼されたサーバ処理なので
 * service-role キーで RLS をバイパスする。
 *
 * 注意: service-role キーは全権限。ブラウザ/クライアントに渡さないこと。
 * サーバ専用 (API route / server action) でのみ import する。
 */
export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "SUPABASE service-role 未設定: NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を確認してください"
    );
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
