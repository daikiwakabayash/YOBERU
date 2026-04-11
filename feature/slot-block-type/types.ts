export interface SlotBlockType {
  id: number;
  brand_id: number;
  code: string;
  label: string;
  color: string | null;
  label_text_color: string | null;
  sort_number: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
