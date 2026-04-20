export interface TagTemplate {
  id: number;
  brand_id: number;
  title: string;
  content: string;
  memo: string | null;
  sort_number: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
