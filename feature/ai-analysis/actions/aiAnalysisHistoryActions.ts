"use server";

import { createClient } from "@/helper/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  getActiveBrandId,
  getActiveShopId,
} from "@/helper/lib/shop-context";
import type { MarketingAnalysisResult } from "../services/runMarketingAnalysis";
import { getCreativeAnalysis } from "@/feature/marketing/services/getCreativeAnalysis";

/** Phase 1 で追加した成果測定カラム (migration 00055)。未適用環境で
 *  update / select が失敗したらこれらを外してフォールバックする。 */
const OUTCOME_COLUMNS = [
  "booking_link_id",
  "observed_start_month",
  "observed_end_month",
  "outcome_metrics",
  "outcome_evaluated_at",
];

function isMissingOutcomeColumn(message: string | undefined): boolean {
  if (!message) return false;
  return OUTCOME_COLUMNS.some((c) => message.includes(c));
}

/**
 * AI 分析結果を保存し、含まれるアクションを行単位に展開して
 * ai_analysis_actions に INSERT する。
 *
 * 入力コンテキスト (Claude に渡したデータ) は保存しないシンプル版。
 * 必要になったら 1 度集計 (aggregateMarketingContext) を呼び直して
 * 保存できるよう拡張する想定。
 *
 * 戻り値: 作成された run の id (履歴詳細ページで使う)
 */
export async function saveAnalysisRun(params: {
  startMonth: string;
  endMonth: string;
  result: MarketingAnalysisResult;
}): Promise<{ ok: true; runId: number } | { ok: false; error: string }> {
  const supabase = await createClient();
  const shopId = await getActiveShopId();
  const brandId = await getActiveBrandId();

  // 作成者ユーザー (本部スタッフ) の users.id を解決
  let createdByUserId: number | null = null;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.email) {
      const { data: u } = await supabase
        .from("users")
        .select("id")
        .eq("email", user.email)
        .maybeSingle();
      createdByUserId = (u?.id as number | undefined) ?? null;
    }
  } catch {
    /* ignore — created_by_user_id は NULL でも保存自体は通す */
  }

  const { data: run, error: runErr } = await supabase
    .from("ai_analysis_runs")
    .insert({
      brand_id: brandId,
      shop_id: shopId,
      start_month: params.startMonth,
      end_month: params.endMonth,
      summary: params.result.summary,
      meta_ads: params.result.metaAds,
      flyer: params.result.flyer,
      creative_hypotheses: params.result.creativeHypotheses,
      warnings: params.result.warnings,
      created_by_user_id: createdByUserId,
    })
    .select("id")
    .maybeSingle();
  if (runErr || !run) {
    return { ok: false, error: runErr?.message ?? "保存に失敗しました" };
  }

  // 各アクションを行展開
  const actionRows: Array<{
    run_id: number;
    section: string;
    position: number;
    action_text: string;
  }> = [];
  params.result.metaAds.actionItems.forEach((a, i) =>
    actionRows.push({
      run_id: run.id as number,
      section: "meta_ads",
      position: i,
      action_text: a,
    })
  );
  params.result.flyer.actionItems.forEach((a, i) =>
    actionRows.push({
      run_id: run.id as number,
      section: "flyer",
      position: i,
      action_text: a,
    })
  );
  params.result.creativeHypotheses.forEach((a, i) =>
    actionRows.push({
      run_id: run.id as number,
      section: "creative_hypothesis",
      position: i,
      action_text: a,
    })
  );

  if (actionRows.length > 0) {
    const { error: actErr } = await supabase
      .from("ai_analysis_actions")
      .insert(actionRows);
    if (actErr) {
      // run は残っていても OK。actions の保存失敗だけ通知。
      return {
        ok: false,
        error: `分析は保存されましたが、アクション一覧の保存に失敗しました: ${actErr.message}`,
      };
    }
  }

  revalidatePath("/marketing");
  return { ok: true, runId: run.id as number };
}

/**
 * アクションの進捗を更新する。
 *
 * 部分更新: status / what_done / outcome / rating のうち、渡された
 * フィールドだけ書き換える。
 *
 * status を done にすると executed_at と executed_by_user_id を自動で
 * 立てる (既に done だった場合は触らない)。
 */
export async function updateAnalysisAction(params: {
  actionId: number;
  status?: "pending" | "in_progress" | "done" | "skipped";
  whatDone?: string;
  outcome?: string;
  rating?: number | null;
  /** 成果測定対象の強制リンク (migration 00055)。null で紐付け解除 */
  bookingLinkId?: number | null;
  /** 成果観測期間 (YYYY-MM)。空文字で解除 */
  observedStartMonth?: string;
  observedEndMonth?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();

  // 既存行を読んで、状態遷移を判定
  const { data: existing } = await supabase
    .from("ai_analysis_actions")
    .select("id, status, executed_at")
    .eq("id", params.actionId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "アクションが見つかりません" };

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (params.status !== undefined) {
    updateData.status = params.status;
    // 'done' に遷移したタイミングで executed_at を立てる (二重更新しない)
    if (params.status === "done" && !existing.executed_at) {
      updateData.executed_at = new Date().toISOString();
      // 実行者ユーザー
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user?.email) {
          const { data: u } = await supabase
            .from("users")
            .select("id")
            .eq("email", user.email)
            .maybeSingle();
          if (u?.id) updateData.executed_by_user_id = u.id as number;
        }
      } catch {
        /* ignore */
      }
    }
    // 'done' から戻したら executed_at をクリア (運用上「やり直し」のため)
    if (params.status !== "done" && existing.status === "done") {
      updateData.executed_at = null;
      updateData.executed_by_user_id = null;
    }
  }
  if (params.whatDone !== undefined) updateData.what_done = params.whatDone;
  if (params.outcome !== undefined) {
    updateData.outcome = params.outcome;
    updateData.outcome_recorded_at = params.outcome
      ? new Date().toISOString()
      : null;
  }
  if (params.rating !== undefined) updateData.rating = params.rating;
  // 成果測定リンク / 観測期間 (migration 00055)
  if (params.bookingLinkId !== undefined)
    updateData.booking_link_id = params.bookingLinkId;
  if (params.observedStartMonth !== undefined)
    updateData.observed_start_month = params.observedStartMonth || null;
  if (params.observedEndMonth !== undefined)
    updateData.observed_end_month = params.observedEndMonth || null;

  let { error } = await supabase
    .from("ai_analysis_actions")
    .update(updateData)
    .eq("id", params.actionId);
  // 00055 未適用環境 → 新カラムを外して他項目だけ保存し、移行を促す
  if (error && isMissingOutcomeColumn(error.message)) {
    const stripped = { ...updateData };
    for (const c of OUTCOME_COLUMNS) delete stripped[c];
    const retry = await supabase
      .from("ai_analysis_actions")
      .update(stripped)
      .eq("id", params.actionId);
    if (!retry.error) {
      return {
        ok: false,
        error:
          "成果測定リンクの保存には Supabase で migration 00055_ai_action_outcome_link.sql の実行が必要です。",
      };
    }
    error = retry.error;
  }
  if (error) return { ok: false, error: error.message };

  revalidatePath("/marketing");
  return { ok: true };
}

/**
 * 成果メトリクス (クリエイティブ分析からスナップショットする KPI)。
 */
export interface OutcomeMetrics {
  reservationCount: number;
  visitCount: number;
  cancelCount: number;
  joinCount: number;
  joinRate: number;
  cancelRate: number;
  adSpend: number;
  cpa: number;
  sales: number;
  roas: number;
  observedStartMonth: string;
  observedEndMonth: string;
  bookingLinkId: number;
}

/**
 * アクションに紐付けた強制リンクの成果を、観測期間の クリエイティブ分析
 * (getCreativeAnalysis) から取得して outcome_metrics にスナップショット保存する。
 *
 * 観測期間は action.observed_start/end_month を優先し、未設定なら run の
 * 分析対象期間を使う。
 */
export async function evaluateActionOutcome(params: {
  actionId: number;
}): Promise<{ ok: true; metrics: OutcomeMetrics } | { ok: false; error: string }> {
  const supabase = await createClient();

  const actionRes = await supabase
    .from("ai_analysis_actions")
    .select(
      "id, run_id, booking_link_id, observed_start_month, observed_end_month"
    )
    .eq("id", params.actionId)
    .maybeSingle();
  if (actionRes.error && isMissingOutcomeColumn(actionRes.error.message)) {
    return {
      ok: false,
      error:
        "成果測定には Supabase で migration 00055_ai_action_outcome_link.sql の実行が必要です。",
    };
  }
  const action = actionRes.data as {
    id: number;
    run_id: number;
    booking_link_id: number | null;
    observed_start_month: string | null;
    observed_end_month: string | null;
  } | null;
  if (!action) return { ok: false, error: "アクションが見つかりません" };
  if (!action.booking_link_id) {
    return {
      ok: false,
      error: "先に成果測定の対象となる強制リンクを選択してください。",
    };
  }

  const { data: run } = await supabase
    .from("ai_analysis_runs")
    .select("brand_id, shop_id, start_month, end_month")
    .eq("id", action.run_id)
    .maybeSingle();
  if (!run) return { ok: false, error: "分析実行が見つかりません" };

  const startMonth =
    action.observed_start_month || (run.start_month as string);
  const endMonth = action.observed_end_month || (run.end_month as string);

  const data = await getCreativeAnalysis({
    brandId: run.brand_id as number,
    shopId: run.shop_id as number,
    startMonth,
    endMonth,
  });
  const row = data.rows.find(
    (r) => !r.unassigned && r.bookingLinkIds.includes(action.booking_link_id!)
  );

  const metrics: OutcomeMetrics = {
    reservationCount: row?.reservationCount ?? 0,
    visitCount: row?.visitCount ?? 0,
    cancelCount: row?.cancelCount ?? 0,
    joinCount: row?.joinCount ?? 0,
    joinRate: row?.joinRate ?? 0,
    cancelRate: row?.cancelRate ?? 0,
    adSpend: row?.adSpend ?? 0,
    cpa: row?.cpa ?? 0,
    sales: row?.sales ?? 0,
    roas: row?.roas ?? 0,
    observedStartMonth: startMonth,
    observedEndMonth: endMonth,
    bookingLinkId: action.booking_link_id,
  };

  const { error: upErr } = await supabase
    .from("ai_analysis_actions")
    .update({
      outcome_metrics: metrics,
      outcome_evaluated_at: new Date().toISOString(),
    })
    .eq("id", params.actionId);
  if (upErr) return { ok: false, error: upErr.message };

  revalidatePath("/marketing");
  return { ok: true, metrics };
}

/**
 * 分析履歴の一覧 + 各 run の actions 進捗サマリーを返す。
 */
export interface AnalysisRunSummary {
  id: number;
  startMonth: string;
  endMonth: string;
  summary: string | null;
  createdAt: string;
  totalActions: number;
  doneActions: number;
  inProgressActions: number;
  skippedActions: number;
}

export async function listAnalysisRuns(): Promise<AnalysisRunSummary[]> {
  const supabase = await createClient();
  const shopId = await getActiveShopId();

  const { data: runs } = await supabase
    .from("ai_analysis_runs")
    .select("id, start_month, end_month, summary, created_at")
    .eq("shop_id", shopId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (!runs || runs.length === 0) return [];

  const runIds = runs.map((r) => r.id as number);
  const { data: actions } = await supabase
    .from("ai_analysis_actions")
    .select("run_id, status")
    .in("run_id", runIds);

  const statusByRun = new Map<
    number,
    { total: number; done: number; in_progress: number; skipped: number }
  >();
  for (const r of runIds) {
    statusByRun.set(r, { total: 0, done: 0, in_progress: 0, skipped: 0 });
  }
  for (const a of (actions ?? []) as Array<{
    run_id: number;
    status: string;
  }>) {
    const s = statusByRun.get(a.run_id);
    if (!s) continue;
    s.total += 1;
    if (a.status === "done") s.done += 1;
    else if (a.status === "in_progress") s.in_progress += 1;
    else if (a.status === "skipped") s.skipped += 1;
  }

  return runs.map((r) => {
    const stats = statusByRun.get(r.id as number) ?? {
      total: 0,
      done: 0,
      in_progress: 0,
      skipped: 0,
    };
    return {
      id: r.id as number,
      startMonth: r.start_month as string,
      endMonth: r.end_month as string,
      summary: (r.summary as string | null) ?? null,
      createdAt: r.created_at as string,
      totalActions: stats.total,
      doneActions: stats.done,
      inProgressActions: stats.in_progress,
      skippedActions: stats.skipped,
    };
  });
}

/**
 * 単一 run の詳細 + そのアクション一覧を返す。
 */
export interface AnalysisActionRow {
  id: number;
  section: string;
  position: number;
  actionText: string;
  status: "pending" | "in_progress" | "done" | "skipped";
  whatDone: string | null;
  outcome: string | null;
  rating: number | null;
  executedAt: string | null;
  outcomeRecordedAt: string | null;
  // 成果測定 (migration 00055)
  bookingLinkId: number | null;
  observedStartMonth: string | null;
  observedEndMonth: string | null;
  outcomeMetrics: OutcomeMetrics | null;
  outcomeEvaluatedAt: string | null;
}

/** アクションに紐付け可能な強制リンク (クリエイティブ) の選択肢 */
export interface BookingLinkOption {
  id: number;
  title: string;
  symptom: string | null;
  offerPrice: number | null;
}

export interface AnalysisRunDetail {
  id: number;
  startMonth: string;
  endMonth: string;
  summary: string | null;
  metaAds: unknown;
  flyer: unknown;
  creativeHypotheses: unknown;
  warnings: unknown;
  createdAt: string;
  actions: AnalysisActionRow[];
  /** 成果測定リンクの選択肢 (この run の店舗で使える強制リンク) */
  bookingLinks: BookingLinkOption[];
}

export async function getAnalysisRunDetail(
  runId: number
): Promise<AnalysisRunDetail | null> {
  const supabase = await createClient();
  const shopId = await getActiveShopId();

  const { data: run } = await supabase
    .from("ai_analysis_runs")
    .select(
      "id, brand_id, shop_id, start_month, end_month, summary, meta_ads, flyer, creative_hypotheses, warnings, created_at"
    )
    .eq("id", runId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!run) return null;
  if ((run.shop_id as number) !== shopId) return null; // 他店舗のは見せない

  // アクション取得: 成果測定カラム (migration 00055) 込みで取得し、未適用
  // 環境ではカラム無し版でフォールバックする。
  const baseActionCols =
    "id, section, position, action_text, status, what_done, outcome, rating, executed_at, outcome_recorded_at";
  const fullActionCols = `${baseActionCols}, booking_link_id, observed_start_month, observed_end_month, outcome_metrics, outcome_evaluated_at`;
  // 列名を変数で渡すことで、両クエリのレスポンス型を同一にして再代入の
  // 型衝突を避ける (00055 未適用時はフォールバック)。
  function fetchActions(cols: string) {
    return supabase
      .from("ai_analysis_actions")
      .select(cols)
      .eq("run_id", runId)
      .order("section", { ascending: true })
      .order("position", { ascending: true });
  }
  let actionsRes = await fetchActions(fullActionCols);
  if (actionsRes.error && isMissingOutcomeColumn(actionsRes.error.message)) {
    actionsRes = await fetchActions(baseActionCols);
  }
  const actions = actionsRes.data;

  // この run の店舗で使える強制リンク (クリエイティブ) を成果測定の選択肢に。
  // getCreativeAnalysis と同じ shop フィルタ (shop_id / shop_ids) を適用。
  const bookingLinks: BookingLinkOption[] = [];
  const { data: linksRaw } = await supabase
    .from("booking_links")
    .select("id, title, shop_id, shop_ids, symptom, offer_price")
    .eq("brand_id", run.brand_id as number)
    .is("deleted_at", null);
  for (const l of (linksRaw ?? []) as Array<{
    id: number;
    title: string;
    shop_id: number | null;
    shop_ids: number[] | null;
    symptom: string | null;
    offer_price: number | null;
  }>) {
    const ids = Array.isArray(l.shop_ids) ? l.shop_ids : [];
    const matches =
      ids.length > 0 ? ids.includes(shopId) : l.shop_id == null || l.shop_id === shopId;
    if (matches) {
      bookingLinks.push({
        id: l.id,
        title: l.title,
        symptom: l.symptom,
        offerPrice: l.offer_price,
      });
    }
  }

  return {
    id: run.id as number,
    startMonth: run.start_month as string,
    endMonth: run.end_month as string,
    summary: (run.summary as string | null) ?? null,
    metaAds: run.meta_ads,
    flyer: run.flyer,
    creativeHypotheses: run.creative_hypotheses,
    warnings: run.warnings,
    createdAt: run.created_at as string,
    bookingLinks,
    actions: ((actions ?? []) as unknown as Array<{
      id: number;
      section: string;
      position: number;
      action_text: string;
      status: string;
      what_done: string | null;
      outcome: string | null;
      rating: number | null;
      executed_at: string | null;
      outcome_recorded_at: string | null;
      booking_link_id?: number | null;
      observed_start_month?: string | null;
      observed_end_month?: string | null;
      outcome_metrics?: OutcomeMetrics | null;
      outcome_evaluated_at?: string | null;
    }>).map((a) => ({
      id: a.id,
      section: a.section,
      position: a.position,
      actionText: a.action_text,
      status: (a.status as AnalysisActionRow["status"]) ?? "pending",
      whatDone: a.what_done,
      outcome: a.outcome,
      rating: a.rating,
      executedAt: a.executed_at,
      outcomeRecordedAt: a.outcome_recorded_at,
      bookingLinkId: a.booking_link_id ?? null,
      observedStartMonth: a.observed_start_month ?? null,
      observedEndMonth: a.observed_end_month ?? null,
      outcomeMetrics: (a.outcome_metrics as OutcomeMetrics | null) ?? null,
      outcomeEvaluatedAt: a.outcome_evaluated_at ?? null,
    })),
  };
}
