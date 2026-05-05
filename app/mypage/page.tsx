import { MyPageClient } from "@/feature/customer-portal/components/MyPageClient";

export const dynamic = "force-dynamic";

/**
 * 顧客マイページ (LIFF 経由でアクセス)。
 * - LIFF SDK で line_user_id を取得
 * - 紐付け済み顧客の今後の予約を表示
 * - 店舗設定で許可されていればキャンセル可能
 */
export default function MyPage() {
  return (
    <main className="min-h-[100dvh] bg-gray-50">
      <header className="sticky top-0 z-10 flex h-12 items-center justify-center border-b bg-white text-sm font-bold">
        マイページ
      </header>
      <MyPageClient />
    </main>
  );
}
