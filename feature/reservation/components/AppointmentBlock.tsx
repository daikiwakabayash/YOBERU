"use client";

import Link from "next/link";
import { APPOINTMENT_STATUS_COLORS } from "../types";

interface AppointmentBlockProps {
  id: number;
  customerName: string;
  menuName: string;
  startTime: string;
  endTime: string;
  status: number;
  slotCount: number;
}

export function AppointmentBlock({
  id,
  customerName,
  menuName,
  startTime,
  endTime,
  status,
  slotCount,
}: AppointmentBlockProps) {
  const colorClass =
    APPOINTMENT_STATUS_COLORS[status] ?? "bg-blue-100 text-blue-800";

  return (
    <Link
      href={`/reservation/${id}`}
      className={`block rounded px-1 py-0.5 text-xs leading-tight ${colorClass} hover:opacity-80 transition-opacity overflow-hidden`}
      style={{ height: "100%" }}
    >
      <div className="font-medium truncate">{customerName}</div>
      <div className="truncate opacity-75">{menuName}</div>
      {slotCount > 2 && (
        <div className="opacity-60">
          {startTime}-{endTime}
        </div>
      )}
    </Link>
  );
}
