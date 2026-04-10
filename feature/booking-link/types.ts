export interface BookingLink {
  id: number;
  brand_id: number;
  shop_id: number | null;
  slug: string;
  title: string;
  memo: string | null;
  language: string;
  menu_manage_ids: string[];
  alias_menu_name: string | null;
  staff_mode: number; // 0=指名可 1=指名or任せ 2=任せのみ
  require_cancel_policy: boolean;
  cancel_policy_text: string | null;
  show_line_button: boolean;
  line_button_text: string | null;
  line_button_url: string | null;
  visit_source_id: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
