"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2 } from "lucide-react";
import {
  importCustomers,
  type ImportCustomersResult,
  type ImportRowInput,
} from "../actions/importCustomers";

interface Props {
  shopId: number;
  shopName: string | null;
}

/**
 * 期待カラム (順番 / ヘッダ名どちらでもマッチする):
 *   1. 番号 (= スキップ。code は自動採番)
 *   2. 氏名
 *   3. 郵便番号
 *   4. 住所1 / 住所
 *   5. 電話番号
 *   6. 性別
 *   7. 生年月日
 *   (以降の年齢など追加列は無視)
 */

const HEADER_ALIASES: Record<keyof ImportRowInput, string[]> = {
  name: ["氏名", "名前", "name"],
  zipCode: ["郵便番号", "zip", "zipcode", "zip_code"],
  address: ["住所1", "住所", "address"],
  phoneNumber: ["電話番号", "phone", "tel", "phone_number"],
  gender: ["性別", "gender", "sex"],
  birthDate: ["生年月日", "誕生日", "birth_date", "birthday", "dob"],
};

function findColumnIndex(headers: string[], aliases: string[]): number {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  for (const a of aliases) {
    const i = normalized.indexOf(a.trim().toLowerCase());
    if (i >= 0) return i;
  }
  return -1;
}

function rowsFromCsv(rawRows: string[][]): ImportRowInput[] {
  if (rawRows.length === 0) return [];
  const headers = rawRows[0];
  const colMap: Record<keyof ImportRowInput, number> = {
    name: findColumnIndex(headers, HEADER_ALIASES.name),
    zipCode: findColumnIndex(headers, HEADER_ALIASES.zipCode),
    address: findColumnIndex(headers, HEADER_ALIASES.address),
    phoneNumber: findColumnIndex(headers, HEADER_ALIASES.phoneNumber),
    gender: findColumnIndex(headers, HEADER_ALIASES.gender),
    birthDate: findColumnIndex(headers, HEADER_ALIASES.birthDate),
  };

  // ヘッダで見つからなければ「番号, 氏名, 郵便番号, 住所1, 電話番号, 性別, 生年月日」の固定順を仮定
  if (colMap.name < 0) colMap.name = 1;
  if (colMap.zipCode < 0) colMap.zipCode = 2;
  if (colMap.address < 0) colMap.address = 3;
  if (colMap.phoneNumber < 0) colMap.phoneNumber = 4;
  if (colMap.gender < 0) colMap.gender = 5;
  if (colMap.birthDate < 0) colMap.birthDate = 6;

  // ヘッダ行を含めるか? "氏名" のような行は除外、"テスト" 等のデータ行のみ拾う。
  // 簡易判定: 先頭行に「氏名」や「name」を含む場合はヘッダとして除外
  const firstRowJoined = headers.join("|").toLowerCase();
  const isFirstHeader =
    firstRowJoined.includes("氏名") ||
    firstRowJoined.includes("name") ||
    firstRowJoined.includes("郵便");

  const dataRows = isFirstHeader ? rawRows.slice(1) : rawRows;

  return dataRows
    .map((cells) => ({
      name: (cells[colMap.name] ?? "").trim(),
      zipCode: cells[colMap.zipCode] ?? undefined,
      address: cells[colMap.address] ?? undefined,
      phoneNumber: cells[colMap.phoneNumber] ?? undefined,
      gender: cells[colMap.gender] ?? undefined,
      birthDate: cells[colMap.birthDate] ?? undefined,
    }))
    .filter((r) => r.name);
}

export function CustomerImportForm({ shopId, shopName }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportRowInput[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ImportCustomersResult | null>(null);

  function handleFile(file: File) {
    setFileName(file.name);
    setPreview([]);
    setResult(null);
    setParseError(null);
    Papa.parse<string[]>(file, {
      skipEmptyLines: true,
      complete: (parsed) => {
        if (parsed.errors.length > 0) {
          const first = parsed.errors[0];
          setParseError(`CSV のパースに失敗しました: ${first.message}`);
          return;
        }
        const rows = rowsFromCsv(parsed.data);
        if (rows.length === 0) {
          setParseError("有効なデータ行が見つかりませんでした");
          return;
        }
        setPreview(rows);
      },
      error: (err) => {
        setParseError(`CSV のパースに失敗しました: ${err.message}`);
      },
    });
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    handleFile(file);
  }

  async function handleSubmit() {
    if (preview.length === 0) return;
    setSubmitting(true);
    setResult(null);
    try {
      const res = await importCustomers(shopId, preview);
      setResult(res);
      if (res.created > 0) {
        router.refresh();
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setPreview([]);
    setFileName(null);
    setResult(null);
    setParseError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const previewSample = useMemo(() => preview.slice(0, 10), [preview]);

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="mb-4 flex items-start gap-3">
          <FileSpreadsheet className="mt-0.5 h-5 w-5 text-indigo-500" />
          <div>
            <h2 className="text-base font-bold text-gray-900">CSV ファイルから一括インポート</h2>
            <p className="mt-1 text-xs text-gray-500">
              管理中の店舗:{" "}
              <span className="font-medium text-gray-700">
                {shopName ?? `shop_id=${shopId}`}
              </span>
              。インポートされる顧客はこの店舗に紐付きます。
            </p>
          </div>
        </div>

        <ul className="mb-4 list-disc space-y-1 pl-5 text-xs text-gray-600">
          <li>カラム順: <span className="font-mono">番号 / 氏名 / 郵便番号 / 住所1 / 電話番号 / 性別 / 生年月日</span></li>
          <li>氏名は空白で姓 / 名に自動分割</li>
          <li>電話番号が同じ既存顧客はスキップ (重複防止)</li>
          <li>性別: 「男性」→ 1、「女性」→ 2、それ以外 → 未設定</li>
          <li>生年月日: <span className="font-mono">YYYY/M/D</span> / <span className="font-mono">YYYY-MM-DD</span> / <span className="font-mono">YYYY年M月D日</span> をサポート</li>
        </ul>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleInputChange}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={submitting}
          >
            <Upload className="mr-1.5 h-4 w-4" />
            CSV を選択
          </Button>
          {fileName && (
            <span className="truncate text-xs text-gray-600">
              {fileName} ({preview.length} 件)
            </span>
          )}
          {preview.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleReset}
              disabled={submitting}
            >
              クリア
            </Button>
          )}
        </div>

        {parseError && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{parseError}</span>
          </div>
        )}
      </Card>

      {preview.length > 0 && (
        <Card className="p-6">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900">
              プレビュー (先頭 {previewSample.length} / 全 {preview.length} 件)
            </h3>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "インポート中..." : `${preview.length} 件をインポート実行`}
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-xs">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2 pr-3">#</th>
                  <th className="py-2 pr-3">氏名</th>
                  <th className="py-2 pr-3">電話番号</th>
                  <th className="py-2 pr-3">郵便番号</th>
                  <th className="py-2 pr-3">住所</th>
                  <th className="py-2 pr-3">性別</th>
                  <th className="py-2 pr-3">生年月日</th>
                </tr>
              </thead>
              <tbody>
                {previewSample.map((r, i) => (
                  <tr key={i} className="border-b last:border-b-0">
                    <td className="py-1.5 pr-3 text-gray-400">{i + 1}</td>
                    <td className="py-1.5 pr-3 font-medium text-gray-900">{r.name}</td>
                    <td className="py-1.5 pr-3 font-mono">{r.phoneNumber || "-"}</td>
                    <td className="py-1.5 pr-3 font-mono">{r.zipCode || "-"}</td>
                    <td className="py-1.5 pr-3 truncate">{r.address || "-"}</td>
                    <td className="py-1.5 pr-3">{r.gender || "-"}</td>
                    <td className="py-1.5 pr-3 font-mono">{r.birthDate || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {result && (
        <Card className="p-6">
          <div className="mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <h3 className="text-base font-bold text-gray-900">インポート結果</h3>
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
              全 {result.total} 件
            </Badge>
            <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
              成功 {result.created} 件
            </Badge>
            <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
              スキップ {result.skipped} 件
            </Badge>
          </div>
          {result.error && (
            <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {result.error}
            </div>
          )}
          {result.rows.length > 0 && (
            <div className="max-h-80 overflow-y-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50">
                  <tr className="border-b text-left text-gray-500">
                    <th className="py-2 pl-3 pr-3">#</th>
                    <th className="py-2 pr-3">氏名</th>
                    <th className="py-2 pr-3">状態</th>
                    <th className="py-2 pr-3">備考</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr key={r.rowIndex} className="border-b last:border-b-0">
                      <td className="py-1.5 pl-3 pr-3 text-gray-400">{r.rowIndex}</td>
                      <td className="py-1.5 pr-3">{r.name}</td>
                      <td className="py-1.5 pr-3">
                        {r.status === "created" ? (
                          <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                            登録
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                            スキップ
                          </Badge>
                        )}
                      </td>
                      <td className="py-1.5 pr-3 text-gray-600">
                        {r.status === "created"
                          ? `カルテ #${r.customerCode}`
                          : r.reason ?? "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
