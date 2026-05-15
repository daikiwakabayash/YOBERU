import { PageHeader } from "@/components/layout/PageHeader";
import { AccountList } from "@/feature/account/components/AccountList";
import {
  getAccounts,
  getBrandOptions,
} from "@/feature/account/services/getAccounts";
import { isCurrentUserRoot } from "@/feature/brand/services/getBrands";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const [accounts, brands, isRoot] = await Promise.all([
    getAccounts(),
    getBrandOptions(),
    isCurrentUserRoot(),
  ]);

  if (!isRoot) {
    return (
      <div>
        <PageHeader
          title="アカウント発行"
          description="スタッフ用の ID / パスワード発行と権限管理"
        />
        <div className="p-6">
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            この画面はルート権限のアカウントのみアクセスできます。
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="アカウント発行"
        description="スタッフ用の ID / パスワード発行と権限管理 (ルート / 限定の 2 パターン)"
      />
      <div className="p-6">
        <AccountList accounts={accounts} brands={brands} canManage={isRoot} />
      </div>
    </div>
  );
}
