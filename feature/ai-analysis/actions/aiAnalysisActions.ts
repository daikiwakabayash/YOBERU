"use server";

import { aggregateMarketingContext } from "../services/aggregateMarketingContext";
import {
  runMarketingAnalysis,
  type MarketingAnalysisResult,
} from "../services/runMarketingAnalysis";
import { getActiveShopId } from "@/helper/lib/shop-context";

/**
 * AI 分析タブからボタン 1 つで呼ばれるサーバーアクション。
 * データ集計 → Claude 呼び出し → 結果返却 を直列で行う。
 *
 * フロントは "use client" で形を保ち、ここを呼ぶだけ。
 */
export async function generateMarketingAnalysis(params: {
  startMonth: string;
  endMonth: string;
}): Promise<
  | { ok: true; result: MarketingAnalysisResult; generatedAt: string }
  | { ok: false; error: string }
> {
  try {
    const shopId = await getActiveShopId();
    const context = await aggregateMarketingContext({
      shopId,
      startMonth: params.startMonth,
      endMonth: params.endMonth,
    });
    const r = await runMarketingAnalysis(context);
    if (!r.ok) return r;
    return {
      ok: true,
      result: r.result,
      generatedAt: new Date().toISOString(),
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
