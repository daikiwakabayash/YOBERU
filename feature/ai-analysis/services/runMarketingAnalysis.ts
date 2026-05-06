import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import type { MarketingContextForAi } from "./aggregateMarketingContext";

/**
 * マーケティングコンテキストを Claude に渡して、戦略提案を得る。
 *
 * モデル: claude-sonnet-4-6 (= 価格 / 品質バランス)。
 *  - opus は分析品質高いが料金 5x 程度。月数十回の運用なら sonnet で十分。
 *  - 数値推論と JP 出力品質を確認済み (2026-05 時点)。
 *
 * Prompt caching:
 *  - 「マーケコンサルとしての役割定義 + 出力スキーマ」は毎回同じなので
 *    cache_control で永続キャッシュ化 (5 分の無料 TTL)。
 *  - 入力データ部分は店舗 / 期間で毎回変わるので非キャッシュ。
 *
 * 環境変数:
 *  - ANTHROPIC_API_KEY: 必須
 *  - ANTHROPIC_MODEL: 任意 (default: claude-sonnet-4-6)
 */

const SYSTEM_PROMPT = `あなたは整骨院 / 整体サロンのマーケティング戦略コンサルタントです。
広告 / 来店データを基に、CPA を最小化しつつ来店数 / 入会率を最大化する施策を
店舗オーナーに分かりやすく提案する役割を担います。

# 重要な原則
- 数字の裏付けがある提案だけ書く。データに無いことは「データ不足」と明記。
- メタ広告 (Facebook/Instagram) と 紙チラシ では適した距離 / 年齢層 / 訴求が
  違う。半径 1km / 3km / 5km / 10km の顧客密度を見て、媒体ごとに最適な
  範囲を提案する。
- 入会率 / リピート率 / CPA / ROAS の優劣を同時に見比べ、片方だけ良くても
  もう片方が悪ければ警告する。
- 過剰な専門用語は避け、店舗オーナーがすぐ動けるレベルの具体案を返す。
- 出力は必ず指定された JSON スキーマに沿うこと。文字列以外の Markdown
  装飾 (** など) を JSON 内に含めない。

# 出力 JSON スキーマ
{
  "summary": "全体の所感を 2-3 文で",
  "metaAds": {
    "verdict": "current performance verdict (現状評価)",
    "recommendedRadiusKm": 数値 (1/3/5/10 のいずれか),
    "recommendedAgeGroups": ["20-29", "30-39", ...],
    "rationale": "なぜそう判断したかをデータ起点で説明 (3-5 文)",
    "actionItems": ["具体的なアクション 1", "アクション 2", ...]
  },
  "flyer": {
    "verdict": "現状評価",
    "recommendedRadiusKm": 数値,
    "recommendedAgeGroups": ["..."],
    "rationale": "...",
    "actionItems": ["..."]
  },
  "creativeHypotheses": [
    "肩こり訴求 / 自律神経訴求 等、CTR を上げる仮説 (媒体別 CTR があれば
     データ起点で、無ければ年齢層から推察)"
  ],
  "warnings": ["数字の解釈に注意すべき点があれば。無ければ空配列"]
}`;

interface MarketingAnalysisResult {
  summary: string;
  metaAds: {
    verdict: string;
    recommendedRadiusKm: number;
    recommendedAgeGroups: string[];
    rationale: string;
    actionItems: string[];
  };
  flyer: {
    verdict: string;
    recommendedRadiusKm: number;
    recommendedAgeGroups: string[];
    rationale: string;
    actionItems: string[];
  };
  creativeHypotheses: string[];
  warnings: string[];
}

export async function runMarketingAnalysis(
  context: MarketingContextForAi
): Promise<{ ok: true; result: MarketingAnalysisResult } | { ok: false; error: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error:
        "Anthropic API キーが未設定です (env: ANTHROPIC_API_KEY)。先に設定してください。",
    };
  }
  const client = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

  try {
    const message = await client.messages.create({
      model,
      max_tokens: 2000,
      // システムを 2 ブロックに分けて、固定指示 (役割 + スキーマ) だけ
      // キャッシュ。実データは user メッセージ側に置く。
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "以下のデータを分析し、指定スキーマの JSON だけを返してください。" +
                "JSON 以外の文章 (前置きや解説) は出力しないでください。\n\n" +
                "```json\n" +
                JSON.stringify(context, null, 2) +
                "\n```",
            },
          ],
        },
      ],
    });

    // content は text block だけ想定
    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n")
      .trim();

    // ```json ... ``` で囲まれていることもあるので剥がす
    const jsonStr = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let parsed: MarketingAnalysisResult;
    try {
      parsed = JSON.parse(jsonStr) as MarketingAnalysisResult;
    } catch (e) {
      return {
        ok: false,
        error:
          "Claude の応答を JSON として解釈できませんでした。" +
          (e instanceof Error ? ` (${e.message})` : ""),
      };
    }
    return { ok: true, result: parsed };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Claude API 呼び出し失敗: ${msg}` };
  }
}

export type { MarketingAnalysisResult };
