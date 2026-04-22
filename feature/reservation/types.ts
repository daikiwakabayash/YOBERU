export interface Appointment {
  id: number;
  brand_id: number;
  shop_id: number;
  customer_id: number;
  staff_id: number;
  recurring_rule_id: number | null;
  menu_manage_id: string;
  code: string;
  type: number;
  start_at: string;
  end_at: string;
  memo: string | null;
  customer_record: string | null;
  is_couple: boolean;
  hotpepper_reserve_id: string | null;
  cancelled_at: string | null;
  sales: number;
  status: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface AppointmentDetail extends Appointment {
  customer: {
    id: number;
    code: string;
    last_name: string | null;
    first_name: string | null;
    phone_number_1: string | null;
  };
  staff: {
    id: number;
    name: string;
  };
  menu: {
    name: string;
    duration: number;
    price: number;
  } | null;
}

/**
 * Slot block type metadata joined in from the slot_block_types master.
 * Present only when the appointment is a slot block (type != 0).
 */
export interface SlotBlockTypeInfo {
  code: string;
  label: string;
  color: string | null;
  labelTextColor: string | null;
}

export interface CalendarAppointment {
  id: number;
  staffId: number;
  customerName: string;
  /** カルテ番号 (customers.code) — 名前横に括弧で表示 */
  customerCode: string | null;
  customerPhone: string | null;
  /**
   * Slot block marker. `null` for normal customer appointments. When
   * non-null the calendar card is rendered as a block (label + memo /
   * other_label) and clicking it opens the slot-block editor instead
   * of the customer detail sheet.
   */
  slotBlock: SlotBlockTypeInfo | null;
  /** その他 用の自由入力タイトル (slot block type = 'other' のとき) */
  otherLabel: string | null;
  menuName: string;
  startAt: string;
  endAt: string;
  status: number;
  type: number;
  duration: number;
  memo: string | null;
  isNewCustomer: boolean;
  visitCount: number;
  source: string | null;
  sourceColor: string | null;
  sourceTextColor: string | null;
  visitSourceId: number | null;
  sales: number;
  additionalCharge: number;
  paymentMethod: string | null;
  customerRecord: string | null;
  customerId: number;
  menuManageId: string;
  isMemberJoin: boolean;
  /**
   * 継続決済フラグ。サブスクの月次課金だけ記録する "幽霊予約"
   * (来院/チケット消化に含めない売上計上だけの行)。予約表では
   * 営業時間外に拡張された「継続決済エリア」に表示される。
   */
  isContinuedBilling: boolean;
  /** チケット消化で紐付いた customer_plans.id (null なら未消化) */
  consumedPlanId: number | null;
  /**
   * 当予約で消化されたプラン金額 (円)。前金扱いのチケット/サブスクを
   * 実際に使ったタイミングの「消化売上」として sales (当日入金) とは
   * 別軸で集計される。
   */
  consumedAmount: number;
}

export interface CalendarData {
  staffs: Array<{
    id: number;
    name: string;
    isWorking: boolean;
    shiftStart: string | null;
    shiftEnd: string | null;
    shiftColor: string | null;
    /** Today's utilization (0..1). null = no shift today (denominator is 0). */
    utilizationRate: number | null;
    /** Minutes the staff is on shift today (denominator). */
    openMin: number;
    /** Minutes booked today by status 1 / 2 appointments (numerator). */
    busyMin: number;
  }>;
  appointments: CalendarAppointment[];
  timeSlots: string[];
  frameMin: number;
}

// Status constants
export const APPOINTMENT_STATUS = {
  RESERVED: 0,
  CHECKED_IN: 1,
  COMPLETED: 2,
  CANCELLED: 3,
  NO_SHOW: 99,
} as const;

export const APPOINTMENT_STATUS_LABELS: Record<number, string> = {
  [APPOINTMENT_STATUS.RESERVED]: "予約済",
  [APPOINTMENT_STATUS.CHECKED_IN]: "来店",
  [APPOINTMENT_STATUS.COMPLETED]: "完了",
  [APPOINTMENT_STATUS.CANCELLED]: "キャンセル",
  [APPOINTMENT_STATUS.NO_SHOW]: "無断キャンセル",
};

export const APPOINTMENT_STATUS_COLORS: Record<number, string> = {
  [APPOINTMENT_STATUS.RESERVED]: "bg-blue-100 text-blue-800",
  [APPOINTMENT_STATUS.CHECKED_IN]: "bg-green-100 text-green-800",
  [APPOINTMENT_STATUS.COMPLETED]: "bg-gray-100 text-gray-800",
  [APPOINTMENT_STATUS.CANCELLED]: "bg-red-100 text-red-800",
  [APPOINTMENT_STATUS.NO_SHOW]: "bg-orange-100 text-orange-800",
};
