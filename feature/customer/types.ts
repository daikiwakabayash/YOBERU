export interface Customer {
  id: number;
  brand_id: number;
  shop_id: number;
  code: string;
  type: number; // 0:一般, 1:会員, 2:退会
  last_name: string | null;
  first_name: string | null;
  last_name_kana: string | null;
  first_name_kana: string | null;
  phone_number_1: string | null;
  phone_number_2: string | null;
  email: string | null;
  zip_code: string | null;
  address: string | null;
  gender: number;
  birth_date: string | null;
  staff_id: number | null;
  referrer_customer_id: number | null;
  referrer_relationship: string | null;
  customer_tag_id: number | null;
  occupation: string | null;
  is_send_dm: boolean | null;
  is_send_mail: boolean | null;
  is_send_line: boolean | null;
  line_id: string | null;
  description: string | null;
  leaved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerSummary {
  id: number;
  code: string;
  last_name: string | null;
  first_name: string | null;
  phone_number_1: string | null;
}
