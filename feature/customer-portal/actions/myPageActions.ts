"use server";

import {
  getCustomerByLine,
  getCustomerUpcomingAppointments,
  type CustomerAppointmentRow,
} from "../services/getCustomerByLine";

export interface MyPageData {
  customerId: number;
  customerName: string;
  shopName: string;
  customerCanCancel: boolean;
  customerCanModify: boolean;
  customerCancelDeadlineHours: number;
  appointments: CustomerAppointmentRow[];
}

/**
 * /mypage クライアントから呼ぶ集約取得アクション。
 * line_user_id を受け取り、顧客情報 + 予約一覧を返す。
 */
export async function fetchMyPageData(
  lineUserId: string
): Promise<MyPageData | null> {
  const ctx = await getCustomerByLine(lineUserId);
  if (!ctx) return null;
  const appointments = await getCustomerUpcomingAppointments({
    customerId: ctx.customerId,
    shopSettings: {
      customerCanCancel: ctx.customerCanCancel,
      customerCancelDeadlineHours: ctx.customerCancelDeadlineHours,
    },
  });
  return {
    customerId: ctx.customerId,
    customerName: ctx.customerName,
    shopName: ctx.shopName,
    customerCanCancel: ctx.customerCanCancel,
    customerCanModify: ctx.customerCanModify,
    customerCancelDeadlineHours: ctx.customerCancelDeadlineHours,
    appointments,
  };
}
