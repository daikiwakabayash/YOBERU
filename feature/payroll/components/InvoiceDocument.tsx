import { Fragment } from "react";
import type { InvoiceData, InvoiceLine } from "../services/getStaffInvoiceData";

/**
 * 請求書 1 枚の HTML レンダリング (server component / pure)。
 *
 * 印刷ページ (/payroll/[staffId]/invoice) と、メール送信時の HTML 本文
 * (renderInvoiceHtml) の双方から使う。スタイルは print 適合のため inline
 * 中心 (Tailwind の screen 用クラスは print で抑止されることがあるため、
 * 重要な見た目は style 属性で持たせる)。
 */

const yen = (n: number) => `¥${Math.round(n).toLocaleString()}`;

const GROUP_LABEL: Record<InvoiceLine["group"], string> = {
  compensation: "基本報酬",
  allowance_auto: "諸手当 (自動付与)",
  allowance_carryover: "諸手当 (繰越当月使用)",
  allowance_claim: "諸手当 (都度請求)",
};

interface Props {
  data: InvoiceData;
}

export function InvoiceDocument({ data }: Props) {
  // 行をグループ別にまとめる
  const groups: Record<InvoiceLine["group"], InvoiceLine[]> = {
    compensation: [],
    allowance_auto: [],
    allowance_carryover: [],
    allowance_claim: [],
  };
  for (const ln of data.lines) groups[ln.group].push(ln);

  return (
    <div
      style={{
        margin: "0 auto",
        maxWidth: 720,
        padding: 32,
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', Meiryo, sans-serif",
        color: "#222",
        background: "#fff",
        lineHeight: 1.55,
      }}
    >
      {/* ヘッダ */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          borderBottom: "2px solid #222",
          paddingBottom: 12,
          marginBottom: 24,
        }}
      >
        <div>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: 2 }}>
            請求書
          </div>
          <div style={{ fontSize: 13, color: "#555", marginTop: 4 }}>
            対象月: {data.yearMonth}
          </div>
        </div>
        <div style={{ fontSize: 12, color: "#666", textAlign: "right" }}>
          発行日: {data.issueDate}
          <br />
          請求書 No.: INV-{data.staffId}-{data.yearMonth.replace("-", "")}
        </div>
      </div>

      {/* 宛先 / 発行元 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 24,
          marginBottom: 24,
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: "#888" }}>宛先 (受領者)</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>
            {data.staffName} 様
          </div>
          {data.staffEmail && (
            <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
              {data.staffEmail}
            </div>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "#888" }}>発行元</div>
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4 }}>
            {data.shopName}
          </div>
          <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
            {data.shopZipCode && `〒${data.shopZipCode}`}
            <br />
            {data.shopAddress}
            <br />
            TEL: {data.shopPhone}
          </div>
        </div>
      </div>

      {/* 合計 */}
      <div
        style={{
          background: "#fff7ed",
          border: "1px solid #fdba74",
          borderRadius: 8,
          padding: 16,
          marginBottom: 20,
        }}
      >
        <div style={{ fontSize: 11, color: "#9a3412" }}>請求金額 (税込)</div>
        <div
          style={{
            fontSize: 32,
            fontWeight: 900,
            color: "#9a3412",
            marginTop: 4,
          }}
        >
          {yen(data.totalInclTax)}
        </div>
      </div>

      {/* 明細テーブル */}
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 13,
        }}
      >
        <thead>
          <tr
            style={{
              background: "#f3f4f6",
              borderBottom: "2px solid #ddd",
            }}
          >
            <th
              style={{
                textAlign: "left",
                padding: "8px 12px",
                fontSize: 11,
                color: "#555",
              }}
            >
              項目
            </th>
            <th
              style={{
                textAlign: "left",
                padding: "8px 12px",
                fontSize: 11,
                color: "#555",
              }}
            >
              内容
            </th>
            <th
              style={{
                textAlign: "right",
                padding: "8px 12px",
                fontSize: 11,
                color: "#555",
                width: 120,
              }}
            >
              金額
            </th>
          </tr>
        </thead>
        <tbody>
          {(Object.keys(groups) as InvoiceLine["group"][]).map((g) => {
            const items = groups[g];
            if (items.length === 0) return null;
            return (
              <Fragment key={g}>
                <tr>
                  <td
                    colSpan={3}
                    style={{
                      padding: "12px 12px 4px",
                      fontSize: 11,
                      color: "#888",
                      borderTop: "1px solid #f3f4f6",
                    }}
                  >
                    {GROUP_LABEL[g]}
                  </td>
                </tr>
                {items.map((ln, idx) => (
                  <tr
                    key={`${g}-${idx}`}
                    style={{ borderBottom: "1px solid #eee" }}
                  >
                    <td
                      style={{
                        padding: "8px 12px",
                        fontWeight: 600,
                      }}
                    >
                      {ln.label}
                    </td>
                    <td
                      style={{
                        padding: "8px 12px",
                        color: "#666",
                        fontSize: 11,
                      }}
                    >
                      {ln.note ?? "—"}
                    </td>
                    <td
                      style={{
                        padding: "8px 12px",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {yen(ln.amount)}
                    </td>
                  </tr>
                ))}
              </Fragment>
            );
          })}
          <tr style={{ background: "#f9fafb", borderTop: "2px solid #222" }}>
            <td
              style={{
                padding: "12px",
                fontWeight: 800,
                fontSize: 14,
              }}
            >
              合計 (税込)
            </td>
            <td />
            <td
              style={{
                padding: "12px",
                textAlign: "right",
                fontWeight: 800,
                fontSize: 16,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {yen(data.totalInclTax)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* フッター */}
      <div
        style={{
          marginTop: 32,
          paddingTop: 16,
          borderTop: "1px solid #eee",
          fontSize: 10,
          color: "#888",
          lineHeight: 1.7,
        }}
      >
        ※ 本請求書は YOBERU 給与計算システムから自動生成されています。
        <br />
        内容に相違があれば本部までご連絡ください。
      </div>
    </div>
  );
}

/**
 * メール HTML 本文用に renderToStaticMarkup する。サーバー側で React 文字列
 * 化を行うため、呼び出し元 (server action) から使う。
 */
export function renderInvoiceHtml(data: InvoiceData): string {
  // 軽量な静的 HTML を直接組み立てる (renderToStaticMarkup を import すると
  // RSC との相互運用が面倒なので、ここでは要約版を文字列で組み立てる)。
  const yen2 = (n: number) => `¥${Math.round(n).toLocaleString()}`;
  const escape = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const groupRows: Record<InvoiceLine["group"], InvoiceLine[]> = {
    compensation: [],
    allowance_auto: [],
    allowance_carryover: [],
    allowance_claim: [],
  };
  for (const ln of data.lines) groupRows[ln.group].push(ln);

  const renderGroup = (g: InvoiceLine["group"]) => {
    const items = groupRows[g];
    if (items.length === 0) return "";
    const header = `<tr><td colspan="3" style="padding:12px 12px 4px;font-size:11px;color:#888;border-top:1px solid #f3f4f6;">${GROUP_LABEL[g]}</td></tr>`;
    const rows = items
      .map(
        (ln) => `
<tr style="border-bottom:1px solid #eee;">
  <td style="padding:8px 12px;font-weight:600;">${escape(ln.label)}</td>
  <td style="padding:8px 12px;color:#666;font-size:11px;">${
    ln.note ? escape(ln.note) : "—"
  }</td>
  <td style="padding:8px 12px;text-align:right;font-variant-numeric:tabular-nums;">${yen2(ln.amount)}</td>
</tr>`
      )
      .join("");
    return header + rows;
  };

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>請求書 ${escape(data.yearMonth)}</title>
</head>
<body style="margin:0;padding:24px;background:#f7f7f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,'Hiragino Kaku Gothic ProN','Noto Sans JP',Meiryo,sans-serif;color:#222;line-height:1.55;">
<div style="max-width:720px;margin:0 auto;background:#fff;border-radius:8px;padding:32px;">

  <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #222;padding-bottom:12px;margin-bottom:24px;">
    <div>
      <div style="font-size:28px;font-weight:800;letter-spacing:2px;">請求書</div>
      <div style="font-size:13px;color:#555;margin-top:4px;">対象月: ${escape(data.yearMonth)}</div>
    </div>
    <div style="font-size:12px;color:#666;text-align:right;">
      発行日: ${escape(data.issueDate)}<br>
      請求書 No.: INV-${data.staffId}-${data.yearMonth.replace("-", "")}
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px;">
    <div>
      <div style="font-size:11px;color:#888;">宛先 (受領者)</div>
      <div style="font-size:18px;font-weight:700;margin-top:4px;">${escape(data.staffName)} 様</div>
      ${data.staffEmail ? `<div style="font-size:11px;color:#666;margin-top:2px;">${escape(data.staffEmail)}</div>` : ""}
    </div>
    <div style="text-align:right;">
      <div style="font-size:11px;color:#888;">発行元</div>
      <div style="font-size:14px;font-weight:700;margin-top:4px;">${escape(data.shopName)}</div>
      <div style="font-size:11px;color:#555;margin-top:2px;">
        ${data.shopZipCode ? `〒${escape(data.shopZipCode)}<br>` : ""}
        ${escape(data.shopAddress)}<br>
        TEL: ${escape(data.shopPhone)}
      </div>
    </div>
  </div>

  <div style="background:#fff7ed;border:1px solid #fdba74;border-radius:8px;padding:16px;margin-bottom:20px;">
    <div style="font-size:11px;color:#9a3412;">請求金額 (税込)</div>
    <div style="font-size:32px;font-weight:900;color:#9a3412;margin-top:4px;">${yen2(data.totalInclTax)}</div>
  </div>

  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    <thead>
      <tr style="background:#f3f4f6;border-bottom:2px solid #ddd;">
        <th style="text-align:left;padding:8px 12px;font-size:11px;color:#555;">項目</th>
        <th style="text-align:left;padding:8px 12px;font-size:11px;color:#555;">内容</th>
        <th style="text-align:right;padding:8px 12px;font-size:11px;color:#555;width:120px;">金額</th>
      </tr>
    </thead>
    <tbody>
      ${renderGroup("compensation")}
      ${renderGroup("allowance_auto")}
      ${renderGroup("allowance_carryover")}
      ${renderGroup("allowance_claim")}
      <tr style="background:#f9fafb;border-top:2px solid #222;">
        <td style="padding:12px;font-weight:800;font-size:14px;">合計 (税込)</td>
        <td></td>
        <td style="padding:12px;text-align:right;font-weight:800;font-size:16px;font-variant-numeric:tabular-nums;">${yen2(data.totalInclTax)}</td>
      </tr>
    </tbody>
  </table>

  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #eee;font-size:10px;color:#888;line-height:1.7;">
    ※ 本請求書は YOBERU 給与計算システムから自動生成されています。<br>
    内容に相違があれば本部までご連絡ください。
  </div>
</div>
</body>
</html>`;
}
