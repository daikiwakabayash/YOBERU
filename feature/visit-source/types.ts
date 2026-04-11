export interface VisitSource {
  id: number;
  brand_id: number;
  shop_id: number;
  name: string;
  color: string | null;
  label_text_color: string | null;
  sort_number: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
