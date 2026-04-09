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

export interface CalendarAppointment {
  id: number;
  staffId: number;
  customerName: string;
  menuName: string;
  startAt: string;
  endAt: string;
  status: number;
  type: number;
  duration: number;
}

export interface CalendarData {
  staffs: Array<{
    id: number;
    name: string;
    isWorking: boolean;
    shiftStart: string | null;
    shiftEnd: string | null;
    shiftColor: string | null;
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
