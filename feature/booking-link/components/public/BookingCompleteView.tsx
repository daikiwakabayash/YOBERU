"use client";

import { Check } from "lucide-react";
import { useT } from "../../i18n/useT";
import type { Lang } from "../../i18n/dictionary";

interface BookingCompleteViewProps {
  /** "YYYY.MM.DD HH:MM" (already formatted) or null */
  confirmedDateTime: string | null;
  showLineButton: boolean;
  lineButtonText: string | null;
  lineButtonUrl: string | null;
  lang?: Lang;
}

export function BookingCompleteView({
  confirmedDateTime,
  showLineButton,
  lineButtonText,
  lineButtonUrl,
  lang = "ja",
}: BookingCompleteViewProps) {
  const { t } = useT(lang);
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-gray-100 bg-white px-4 py-3">
        <h2 className="text-center text-base font-medium">{t("formTitle")}</h2>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col items-center px-6 pt-16">
        {/* Checkmark */}
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full border-4 border-emerald-400">
          <Check className="h-10 w-10 text-emerald-500" strokeWidth={3} />
        </div>

        <h3 className="mb-3 text-xl font-bold text-gray-900">
          {t("step4Heading")}
        </h3>
        <p className="mb-8 whitespace-pre-line text-center text-xs leading-relaxed text-gray-600">
          {t("step4Body")}
          {confirmedDateTime && (
            <>
              {"\n\n"}
              <span className="font-medium text-gray-800">
                {confirmedDateTime}
              </span>
            </>
          )}
        </p>

        {/* LINE button */}
        {showLineButton && lineButtonUrl && (
          <a
            href={lineButtonUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full max-w-xs items-center justify-center gap-2 rounded-full bg-emerald-500 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-600"
          >
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[10px]">
              L
            </span>
            {lineButtonText || t("contactLine")}
          </a>
        )}
      </div>
    </div>
  );
}
