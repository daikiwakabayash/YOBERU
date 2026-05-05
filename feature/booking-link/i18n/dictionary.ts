/**
 * Public booking page (booking link) translation dictionary.
 *
 * Strings are keyed by a stable English-ish identifier. Each entry has
 * a `ja` (Japanese) and `en` (English) variant. The customer-facing
 * /book/[slug] route lets the visitor toggle between the two via the
 * LanguageToggle button.
 *
 * Add new keys here when introducing new copy in the public wizard;
 * keep the keys grouped by step / section to make diffs easy.
 */

export type Lang = "ja" | "en";

export const translations = {
  ja: {
    // Header
    formTitle: "ご予約フォーム",
    languageJa: "日本語",
    languageEn: "English",

    // Step 1
    step1Title: "店舗と日時を選ぶ",
    fieldArea: "ご希望のエリア",
    fieldShop: "店舗",
    fieldStaff: "ご希望のスタッフ",
    fieldMenu: "ご希望のメニュー",
    fieldDateTime: "ご希望の日時",
    selected: "選択中",
    anyStaff: "おまかせ",
    noShopsInArea: "このエリアに店舗はありません。",
    noStaffsInShop: "この店舗のスタッフは登録されていません。",
    helpExpandNext: "前の項目を選択すると次が表示されます",
    proceedToConfirm: "ご注文確認へ",
    minutes: "分",
    yenSuffix: "円",
    map: "MAP",
    mapShowLocation: "MAPで場所を確認",

    // Step 2
    step2Title: "お客様情報",
    fieldLastName: "姓",
    fieldFirstName: "名",
    fieldLastNameKana: "セイ",
    fieldFirstNameKana: "メイ",
    fieldNameRequired: "必須",
    fieldPhone: "電話番号",
    fieldEmail: "メールアドレス",
    fieldEmailOptional: "任意",
    cancelPolicyHeading: "キャンセルポリシー",
    cancelPolicyAccept: "上記のキャンセルポリシーに同意する",
    proceedNext: "次へ",
    back: "戻る",

    // Step 3
    step3Title: "ご予約内容の確認",
    confirmDateTime: "日時",
    confirmShop: "店舗",
    confirmStaff: "担当",
    confirmMenu: "メニュー",
    confirmCustomer: "お客様",
    edit: "編集",
    submitBooking: "この内容で予約する",
    submitting: "送信中...",

    // Step 4
    step4Title: "予約完了",
    step4Heading: "ご予約ありがとうございます",
    step4Body:
      "予約内容の確認メールをお送りしました。当日お会いできるのを楽しみにしております。",
    contactLine: "LINEで相談する",
    linkLineForReminder: "LINEで予約リマインドを受け取る",
    linkLineDescription:
      "公式LINEを友だち追加すると、予約日前にリマインドが届きます。",

    // Errors / general
    selectionIncomplete: "選択内容が不完全です",
    menuNotSelected: "メニューが選択されていません",
  },
  en: {
    // Header
    formTitle: "Booking form",
    languageJa: "日本語",
    languageEn: "English",

    // Step 1
    step1Title: "Choose shop & date",
    fieldArea: "Preferred area",
    fieldShop: "Shop",
    fieldStaff: "Preferred staff",
    fieldMenu: "Menu",
    fieldDateTime: "Date & time",
    selected: "Selected",
    anyStaff: "Any staff",
    noShopsInArea: "There are no shops in this area.",
    noStaffsInShop: "No staff is registered for this shop.",
    helpExpandNext: "Pick the previous field to reveal the next one",
    proceedToConfirm: "Continue",
    minutes: "min",
    yenSuffix: "JPY",
    map: "MAP",
    mapShowLocation: "Show on map",

    // Step 2
    step2Title: "Your details",
    fieldLastName: "Last name",
    fieldFirstName: "First name",
    fieldLastNameKana: "Last name (kana)",
    fieldFirstNameKana: "First name (kana)",
    fieldNameRequired: "required",
    fieldPhone: "Phone number",
    fieldEmail: "Email",
    fieldEmailOptional: "optional",
    cancelPolicyHeading: "Cancellation policy",
    cancelPolicyAccept: "I agree to the cancellation policy above",
    proceedNext: "Next",
    back: "Back",

    // Step 3
    step3Title: "Confirm your booking",
    confirmDateTime: "Date & time",
    confirmShop: "Shop",
    confirmStaff: "Staff",
    confirmMenu: "Menu",
    confirmCustomer: "Customer",
    edit: "Edit",
    submitBooking: "Confirm booking",
    submitting: "Submitting…",

    // Step 4
    step4Title: "Booking complete",
    step4Heading: "Thank you for your booking",
    step4Body:
      "We have sent a confirmation email. We look forward to seeing you on the day.",
    contactLine: "Chat on LINE",
    linkLineForReminder: "Receive booking reminders on LINE",
    linkLineDescription:
      "Add our official LINE account as a friend to get reminders before your appointment.",

    // Errors / general
    selectionIncomplete: "Some required selections are missing",
    menuNotSelected: "Please choose a menu",
  },
} as const;

export type TranslationKey = keyof typeof translations.ja;
