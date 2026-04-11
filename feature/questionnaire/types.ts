export type QuestionType =
  | "text"
  | "text_kana"
  | "textarea"
  | "radio"
  | "checkbox"
  | "date"
  | "number"
  | "email"
  | "tel";

/**
 * A single question in a questionnaire template.
 *
 * `field` is optional: if set, when a response is submitted its value
 * will be mapped to the corresponding customers table column. Supported
 * fields: last_name, first_name, last_name_kana, first_name_kana,
 * gender, birth_date, zip_code, address, occupation, description,
 * phone_number_1, email.
 */
export interface Question {
  id: string;
  type: QuestionType;
  label: string;
  required?: boolean;
  options?: string[]; // radio / checkbox only
  placeholder?: string;
  field?: string; // map to customer column
}

export interface Questionnaire {
  id: number;
  brand_id: number;
  shop_id: number | null;
  slug: string;
  title: string;
  description: string | null;
  questions: Question[];
  is_public: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface QuestionnaireResponse {
  id: number;
  questionnaire_id: number;
  customer_id: number | null;
  answers: Record<string, string | string[]>;
  created_at: string;
}
