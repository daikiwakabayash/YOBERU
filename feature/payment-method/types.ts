export interface PaymentMethod {
  id: number;
  brand_id: number;
  shop_id: number;
  code: string;
  name: string;
  sort_number: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
