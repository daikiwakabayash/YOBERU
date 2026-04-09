-- ============================================================
-- YOBERU - Initial Schema Migration
-- All 22 tables based on (新)SATTOU テーブル定義書
-- ============================================================

-- 1. users (ユーザー)
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255),
  email VARCHAR(255) NOT NULL UNIQUE,
  email_verified_at TIMESTAMPTZ,
  password VARCHAR(255) NOT NULL,
  remember_token VARCHAR(100),
  brand_id BIGINT,
  shop_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX users_name_unique ON users (name) WHERE name IS NOT NULL;

-- 2. brands (ブランドマスタ)
CREATE TABLE brands (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  name VARCHAR(255) NOT NULL,
  logo_url TEXT,
  frame_min INT DEFAULT 0,
  ghost_time VARCHAR(255),
  copyright VARCHAR(255),
  manage_url VARCHAR(255),
  appointment_url VARCHAR(255),
  is_public BOOLEAN DEFAULT TRUE,
  allow_english_page_redirect BOOLEAN DEFAULT FALSE,
  allow_english_view BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 3. areas (地域マスタ)
CREATE TABLE areas (
  id BIGSERIAL PRIMARY KEY,
  brand_id BIGINT NOT NULL REFERENCES brands(id),
  name VARCHAR(255) NOT NULL,
  sort_number INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_areas_brand_sort ON areas (brand_id, sort_number);
CREATE UNIQUE INDEX uk_brand_area_name ON areas (brand_id, name) WHERE deleted_at IS NULL;

-- 4. shops (店舗マスタ)
CREATE TABLE shops (
  id BIGSERIAL PRIMARY KEY,
  uuid VARCHAR(64) NOT NULL,
  brand_id BIGINT NOT NULL REFERENCES brands(id),
  area_id BIGINT NOT NULL REFERENCES areas(id),
  user_id BIGINT NOT NULL REFERENCES users(id),
  name VARCHAR(255) NOT NULL,
  frame_min INT NOT NULL DEFAULT 5,
  scale INT NOT NULL DEFAULT 1,
  email1 VARCHAR(255) NOT NULL,
  email2 VARCHAR(255),
  line_url VARCHAR(255),
  zip_code VARCHAR(7) NOT NULL,
  address VARCHAR(255) NOT NULL,
  nearest_station_access VARCHAR(255),
  phone_number VARCHAR(11) NOT NULL,
  shop_url TEXT,
  is_public BOOLEAN DEFAULT TRUE,
  sort_number INT DEFAULT 0,
  allow_english_page_redirect BOOLEAN DEFAULT FALSE,
  allow_english_view BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Add FK from users to brands/shops (circular reference resolved after tables exist)
ALTER TABLE users ADD CONSTRAINT fk_users_brand FOREIGN KEY (brand_id) REFERENCES brands(id);
ALTER TABLE users ADD CONSTRAINT fk_users_shop FOREIGN KEY (shop_id) REFERENCES shops(id);

-- 5. work_patterns (出勤パターン)
CREATE TABLE work_patterns (
  id SERIAL PRIMARY KEY,
  brand_id INT NOT NULL,
  shop_id INT NOT NULL,
  name VARCHAR(64) NOT NULL,
  abbreviation_name VARCHAR(64),
  abbreviation_color CHAR(7),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_work_patterns_store ON work_patterns (shop_id);
CREATE UNIQUE INDEX uk_store_pattern_name ON work_patterns (shop_id, name) WHERE deleted_at IS NULL;

-- 6. staffs (スタッフマスタ)
CREATE TABLE staffs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  brand_id BIGINT NOT NULL REFERENCES brands(id),
  shop_id BIGINT NOT NULL REFERENCES shops(id),
  name VARCHAR(255) NOT NULL,
  capacity INT NOT NULL DEFAULT 1,
  phone_number VARCHAR(11),
  allocate_order INT,
  shift_monday INT REFERENCES work_patterns(id),
  shift_tuesday INT REFERENCES work_patterns(id),
  shift_wednesday INT REFERENCES work_patterns(id),
  shift_thursday INT REFERENCES work_patterns(id),
  shift_friday INT REFERENCES work_patterns(id),
  shift_saturday INT REFERENCES work_patterns(id),
  shift_sunday INT REFERENCES work_patterns(id),
  shift_holiday INT REFERENCES work_patterns(id),
  is_public BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 7. business_hours (店舗営業時間マスタ)
CREATE TABLE business_hours (
  id SERIAL PRIMARY KEY,
  brand_id INT NOT NULL,
  shop_id INT NOT NULL,
  name VARCHAR(64) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_business_hours_store ON business_hours (shop_id);
CREATE UNIQUE INDEX uk_store_bh_name ON business_hours (shop_id, name) WHERE deleted_at IS NULL;

-- 8. shop_hours (店舗営業時間)
CREATE TABLE shop_hours (
  id BIGSERIAL PRIMARY KEY,
  brand_id BIGINT NOT NULL,
  shop_id BIGINT NOT NULL,
  business_hour_id INT NOT NULL REFERENCES business_hours(id),
  open_date DATE NOT NULL,
  open_time TIME NOT NULL DEFAULT '00:00',
  close_time TIME NOT NULL DEFAULT '00:00',
  memo VARCHAR(255),
  is_public BOOLEAN DEFAULT TRUE,
  sort_number INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 9. menu_categories (メニューカテゴリマスタ)
CREATE TABLE menu_categories (
  id BIGSERIAL PRIMARY KEY,
  brand_id BIGINT NOT NULL REFERENCES brands(id),
  shop_id BIGINT,
  name VARCHAR(256) NOT NULL,
  sort_number INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX uk_menu_category_name ON menu_categories (brand_id, shop_id, name) WHERE deleted_at IS NULL;

-- 10. menus (メニューマスタ)
CREATE TABLE menus (
  id BIGSERIAL PRIMARY KEY,
  brand_id BIGINT NOT NULL REFERENCES brands(id),
  shop_id BIGINT,
  category_id BIGINT NOT NULL REFERENCES menu_categories(id),
  menu_type SMALLINT NOT NULL DEFAULT 0,
  menu_manage_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  price INT DEFAULT 0,
  price_disp_type BOOLEAN DEFAULT FALSE,
  duration INT NOT NULL,
  image_url TEXT,
  available_count INT,
  status BOOLEAN NOT NULL DEFAULT TRUE,
  sort_number INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_menus_store ON menus (shop_id);
CREATE INDEX idx_menus_category ON menus (category_id);
CREATE INDEX idx_menus_store_status ON menus (shop_id, status);
CREATE INDEX idx_menus_category_status ON menus (category_id, status);
CREATE UNIQUE INDEX unq_menus_name ON menus (shop_id, name) WHERE deleted_at IS NULL;

-- 11. facilities (設備マスタ)
CREATE TABLE facilities (
  id SERIAL PRIMARY KEY,
  brand_id INT NOT NULL,
  shop_id INT NOT NULL,
  name VARCHAR(64) NOT NULL,
  max_book_count INT NOT NULL DEFAULT 1,
  allocate_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_facilities_store_order ON facilities (shop_id, allocate_order);

-- 12. menu_facilities (メニュー設備 中間テーブル)
CREATE TABLE menu_facilities (
  id BIGSERIAL PRIMARY KEY,
  menu_manage_id VARCHAR(64) NOT NULL,
  facility_id INT NOT NULL REFERENCES facilities(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX uk_menu_facility ON menu_facilities (menu_manage_id, facility_id);
CREATE INDEX idx_menu_facilities_facility ON menu_facilities (facility_id);

-- 13. staff_menus (スタッフ-メニュー)
CREATE TABLE staff_menus (
  id BIGSERIAL PRIMARY KEY,
  staff_id BIGINT NOT NULL REFERENCES staffs(id),
  menu_manage_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. staff_shifts (スタッフシフト)
CREATE TABLE staff_shifts (
  id BIGSERIAL PRIMARY KEY,
  staff_id BIGINT NOT NULL REFERENCES staffs(id),
  brand_id BIGINT NOT NULL,
  shop_id BIGINT NOT NULL,
  work_pattern_id INT NOT NULL REFERENCES work_patterns(id),
  start_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  memo VARCHAR(255),
  is_public BOOLEAN DEFAULT TRUE,
  sort_number INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 15. customer_tags (顧客タグマスタ)
CREATE TABLE customer_tags (
  id BIGSERIAL PRIMARY KEY,
  brand_id BIGINT NOT NULL REFERENCES brands(id),
  shop_id BIGINT NOT NULL,
  name VARCHAR(64) NOT NULL,
  color CHAR(7),
  background_color CHAR(7),
  appointment_color CHAR(7),
  appointment_background_color CHAR(7),
  sort_number INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_customer_tags_store ON customer_tags (shop_id);
CREATE UNIQUE INDEX uk_store_tag ON customer_tags (shop_id, name) WHERE deleted_at IS NULL;
CREATE INDEX idx_customer_tags_sort ON customer_tags (sort_number);

-- 16. customers (顧客)
CREATE TABLE customers (
  id BIGSERIAL PRIMARY KEY,
  brand_id BIGINT NOT NULL REFERENCES brands(id),
  shop_id BIGINT NOT NULL REFERENCES shops(id),
  code VARCHAR(16) NOT NULL UNIQUE,
  type SMALLINT DEFAULT 0,
  last_name VARCHAR(32),
  first_name VARCHAR(32),
  last_name_kana VARCHAR(64),
  first_name_kana VARCHAR(64),
  phone_number_1 VARCHAR(11) DEFAULT '00000000000',
  phone_number_2 VARCHAR(11),
  email VARCHAR(255),
  zip_code VARCHAR(7) DEFAULT '0000000',
  address VARCHAR(255),
  gender SMALLINT DEFAULT 0,
  birth_date DATE,
  staff_id BIGINT REFERENCES staffs(id),
  referrer_customer_id BIGINT,
  referrer_relationship VARCHAR(64),
  customer_tag_id BIGINT REFERENCES customer_tags(id),
  occupation VARCHAR(64),
  is_send_dm BOOLEAN,
  is_send_mail BOOLEAN,
  is_send_line BOOLEAN,
  line_id VARCHAR(32),
  description TEXT,
  leaved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 17. staff_actions (スタッフ行動マスタ)
CREATE TABLE staff_actions (
  id SERIAL PRIMARY KEY,
  brand_id INT NOT NULL,
  shop_id INT NOT NULL,
  name VARCHAR(64) NOT NULL,
  tag_color CHAR(7),
  tag_background_color CHAR(7),
  appointment_color CHAR(7),
  appointment_background_color CHAR(7),
  sort_number INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_staff_actions_store ON staff_actions (shop_id);
CREATE UNIQUE INDEX uk_store_action ON staff_actions (shop_id, name) WHERE deleted_at IS NULL;
CREATE INDEX idx_staff_actions_sort ON staff_actions (sort_number);

-- 18. hot_paper_login (ホットペッパーログイン)
CREATE TABLE hot_paper_login (
  id BIGSERIAL PRIMARY KEY,
  brand_id BIGINT NOT NULL REFERENCES brands(id),
  shop_id BIGINT NOT NULL REFERENCES shops(id),
  login_id VARCHAR(16) NOT NULL,
  password VARCHAR(255) NOT NULL,
  is_public BOOLEAN DEFAULT TRUE,
  sort_number INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 19. recurring_rules (定期予約設定)
CREATE TABLE recurring_rules (
  id BIGSERIAL PRIMARY KEY,
  brand_id INT NOT NULL,
  shop_id INT NOT NULL,
  staff_id INT NOT NULL,
  menu_id INT NOT NULL,
  customer_id INT NOT NULL,
  interval_type SMALLINT NOT NULL,
  day_of_week SMALLINT,
  day_of_month SMALLINT,
  start_date DATE,
  end_date DATE,
  start_time TIME,
  status SMALLINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_recurring_store_status ON recurring_rules (shop_id, status);
CREATE INDEX idx_recurring_customer ON recurring_rules (customer_id);

-- 20. appointments (予約)
CREATE TABLE appointments (
  id BIGSERIAL PRIMARY KEY,
  brand_id BIGINT NOT NULL REFERENCES brands(id),
  shop_id BIGINT NOT NULL REFERENCES shops(id),
  customer_id BIGINT NOT NULL REFERENCES customers(id),
  staff_id BIGINT NOT NULL REFERENCES staffs(id),
  recurring_rule_id BIGINT REFERENCES recurring_rules(id),
  menu_manage_id VARCHAR(64) NOT NULL,
  code VARCHAR(64) NOT NULL UNIQUE,
  type SMALLINT DEFAULT 0,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  memo TEXT,
  customer_record TEXT,
  is_couple BOOLEAN DEFAULT FALSE,
  hotpepper_reserve_id VARCHAR(30),
  cancelled_at TIMESTAMPTZ,
  sales INT DEFAULT 0,
  status SMALLINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_appointments_store_start ON appointments (shop_id, start_at);
CREATE INDEX idx_appointments_store_status ON appointments (shop_id, status);

-- 21. appointment_logs (予約変更ログ)
CREATE TABLE appointment_logs (
  id BIGSERIAL PRIMARY KEY,
  appointment_id BIGINT NOT NULL REFERENCES appointments(id),
  operation_type SMALLINT NOT NULL,
  actor_type SMALLINT NOT NULL,
  actor_id INT,
  diff JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_appt_logs_appt_created ON appointment_logs (appointment_id, created_at);
CREATE INDEX idx_appt_logs_actor ON appointment_logs (actor_type, actor_id, created_at);

-- 22. remind_schedules (リマインド通知) - Phase 2 準備
CREATE TABLE remind_schedules (
  id BIGSERIAL PRIMARY KEY,
  forced_link_id BIGINT NOT NULL,
  notification_status SMALLINT NOT NULL DEFAULT 0,
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  retry_count INT DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Updated_at trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers to relevant tables
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'users', 'brands', 'areas', 'shops', 'work_patterns', 'staffs',
      'business_hours', 'shop_hours', 'menu_categories', 'menus',
      'facilities', 'menu_facilities', 'staff_menus', 'staff_shifts',
      'customer_tags', 'customers', 'staff_actions', 'hot_paper_login',
      'recurring_rules', 'appointments', 'remind_schedules'
    ])
  LOOP
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at()',
      tbl
    );
  END LOOP;
END;
$$;
