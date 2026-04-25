/**
 * テンプレート文字列内の {{placeholder}} を実際の値で置換する。
 * 未対応のプレースホルダはそのまま残す (誤入力検知のヒント)。
 *
 * "use server" 配下に置けない純粋関数のため、独立した util に切り出している。
 */
export function applyTemplate(
  tmpl: string,
  vars: Record<string, string | number>
): string {
  return tmpl.replace(/\{\{(\w+)\}\}/g, (_, name) => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) {
      return String(vars[name]);
    }
    return `{{${name}}}`;
  });
}
