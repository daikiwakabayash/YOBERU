export interface PublicLink {
  slug: string;
  title: string;
  staff_mode: number;
  require_cancel_policy: boolean;
  cancel_policy_text: string | null;
  show_line_button: boolean;
  line_button_text: string | null;
  line_button_url: string | null;
  alias_menu_name: string | null;
  /** Step 1 の店舗カード直下に表示する自由記述の案内文 (改行保持)。 */
  public_notice: string | null;
}

export interface PublicArea {
  id: number;
  name: string;
}

export interface PublicShop {
  id: number;
  name: string;
  area_id: number | null;
  zip_code: string | null;
  address: string | null;
  nearest_station_access: string | null;
  logo_url: string | null;
}

export interface PublicStaff {
  id: number;
  name: string;
  shop_id: number;
}

export interface PublicMenu {
  menu_manage_id: string;
  name: string;
  price: number;
  duration: number;
  /** menus.price_disp_type。false なら公開予約画面で料金を表示しない。
   *  DB 上 BOOLEAN DEFAULT FALSE なので「明示的に true にしたメニュー」
   *  だけ価格を見せる運用。 */
  priceDispType: boolean;
}

/**
 * staffId = null → お任せ (any staff)
 * staffId = number → 指名
 */
export interface BookingState {
  areaId: number | null;
  shopId: number | null;
  staffId: number | null; // null = おまかせ
  menuManageId: string | null;
  date: string | null; // YYYY-MM-DD
  time: string | null; // HH:MM
  lastName: string;
  firstName: string;
  lastNameKana: string;
  firstNameKana: string;
  phone: string;
  email: string;
  cancelPolicyAccepted: boolean;
}
