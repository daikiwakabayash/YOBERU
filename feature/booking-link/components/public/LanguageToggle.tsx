"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Globe } from "lucide-react";
import type { Lang } from "../../i18n/dictionary";

interface LanguageToggleProps {
  active: Lang;
}

/**
 * Floating language toggle pinned to the top-right of the public
 * booking page. Switches between 日本語 / English by writing `?lang=`
 * to the URL — no auth, no localStorage, fully shareable.
 *
 * Look & feel mirrors a Google-translate-style segmented control.
 */
export function LanguageToggle({ active }: LanguageToggleProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function setLang(lang: Lang) {
    const next = new URLSearchParams(params.toString());
    if (lang === "ja") next.delete("lang");
    else next.set("lang", lang);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="fixed right-3 top-3 z-30 flex items-center gap-1 rounded-full border border-gray-200 bg-white/95 px-1 py-1 text-xs shadow-md backdrop-blur sm:right-4 sm:top-4">
      <Globe className="ml-1.5 h-3.5 w-3.5 text-gray-400" />
      <button
        type="button"
        onClick={() => setLang("ja")}
        className={`rounded-full px-2.5 py-1 font-bold transition-colors ${
          active === "ja"
            ? "bg-emerald-500 text-white"
            : "text-gray-500 hover:text-gray-900"
        }`}
        aria-pressed={active === "ja"}
      >
        日本語
      </button>
      <button
        type="button"
        onClick={() => setLang("en")}
        className={`rounded-full px-2.5 py-1 font-bold transition-colors ${
          active === "en"
            ? "bg-emerald-500 text-white"
            : "text-gray-500 hover:text-gray-900"
        }`}
        aria-pressed={active === "en"}
      >
        EN
      </button>
    </div>
  );
}
