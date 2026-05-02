import { getBookingLinkBySlug } from "@/feature/booking-link/services/getBookingLinks";
import { getTagTemplatesByIds } from "@/feature/tag-template/services/getTagTemplates";
import { TagInjector } from "@/feature/tag-template/components/TagInjector";
import { BookingCompleteView } from "@/feature/booking-link/components/public/BookingCompleteView";
import type { Lang } from "@/feature/booking-link/i18n/dictionary";

export const dynamic = "force-dynamic";

interface BookingCompletePageProps {
  searchParams: Promise<{
    slug?: string;
    date?: string;
    time?: string;
    lang?: string;
    /** LIFF 連携用 (署名済 customer token)。submitPublicBooking が発行 */
    link_token?: string;
  }>;
}

/**
 * Common thank-you page shown after a successful public booking.
 *
 * Why a dedicated route?
 *  - The wizard used to flip an internal React state to "step 4" while
 *    the URL stayed at /book/<slug>. That meant sharing the URL of a
 *    completed booking just showed the form again, and Google Tag
 *    Manager couldn't fire a conversion pageview on a distinct URL.
 *  - By hard-navigating to /booking-complete?slug=...&date=...&time=...
 *    we get a stable, shareable URL that GTM can target with a single
 *    page-view trigger regardless of which booking link was used.
 *
 * We still look up the originating booking link via the `slug` query
 * param so the page can (a) re-inject the link's tag templates (GTM
 * snippet must load here too for the conversion event to fire) and
 * (b) keep the LINE button CTA.
 */
export default async function BookingCompletePage({
  searchParams,
}: BookingCompletePageProps) {
  const { slug, date, time, lang, link_token } = await searchParams;
  const initialLang: Lang = lang === "en" ? "en" : "ja";

  // LIFF 連携 URL を組み立てる。
  // - 環境変数 NEXT_PUBLIC_LINE_LIFF_ID と link_token の両方がある時だけ
  //   ボタンを出す。どちらか欠けるなら null (= 表示しない)。
  // - LIFF アプリが /line/liff にマウントされており、そこで
  //   ?action=link&token=... を解釈して紐付けする。
  const liffId = process.env.NEXT_PUBLIC_LINE_LIFF_ID;
  const liffLinkUrl =
    liffId && link_token
      ? `https://liff.line.me/${liffId}?action=link&token=${encodeURIComponent(link_token)}`
      : null;

  const link = slug ? await getBookingLinkBySlug(slug) : null;

  // Load tag templates so GTM fires on this URL too.
  const tagTemplateIds = link
    ? [link.head_tag_template_id, link.body_tag_template_id].filter(
        (id): id is number => typeof id === "number" && id > 0
      )
    : [];
  const tagTemplates =
    tagTemplateIds.length > 0
      ? await getTagTemplatesByIds(tagTemplateIds)
      : [];
  const tagById = new Map(tagTemplates.map((t) => [t.id, t.content]));
  const headTagHtml = link?.head_tag_template_id
    ? tagById.get(link.head_tag_template_id) ?? ""
    : "";
  const bodyTagHtml = link?.body_tag_template_id
    ? tagById.get(link.body_tag_template_id) ?? ""
    : "";

  // Format "YYYY-MM-DD" + "HH:MM" → "YYYY.MM.DD HH:MM"
  const confirmedDateTime =
    date && time ? `${date.replace(/-/g, ".")} ${time}` : null;

  return (
    <div className="min-h-screen bg-white">
      {headTagHtml && <TagInjector target="head" html={headTagHtml} />}
      {bodyTagHtml && <TagInjector target="body" html={bodyTagHtml} />}
      <div className="mx-auto flex min-h-screen max-w-md flex-col bg-white sm:my-4 sm:min-h-0 sm:rounded-xl sm:shadow-lg">
        <BookingCompleteView
          confirmedDateTime={confirmedDateTime}
          showLineButton={link?.show_line_button ?? false}
          lineButtonText={link?.line_button_text ?? null}
          lineButtonUrl={link?.line_button_url ?? null}
          liffLinkUrl={liffLinkUrl}
          lang={initialLang}
        />
      </div>
    </div>
  );
}
