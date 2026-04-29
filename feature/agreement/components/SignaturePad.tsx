"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Eraser } from "lucide-react";

interface Props {
  /** 親に署名 base64 (data:image/png;base64,...) を返す。空なら "" */
  onChange: (dataUrl: string) => void;
  /** 描画済みかどうかを判定するため、外から見える既存値があれば渡す */
  initialDataUrl?: string | null;
  /** 高さ (px)。幅は親に合わせて 100% */
  height?: number;
  disabled?: boolean;
}

/**
 * Canvas ベースの電子署名パッド。
 *
 * - touchstart / pointerdown 両対応 (PC + iPhone Safari + Android Chrome)
 * - DPR (Retina) 対応 — devicePixelRatio で描画解像度を合わせる
 * - リサイズ時は内容を保持して再描画
 * - 「クリア」ボタンで白紙に戻せる
 */
export function SignaturePad({
  onChange,
  initialDataUrl,
  height = 180,
  disabled = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const drawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(!!initialDataUrl);

  // canvas を DPR に合わせて初期化
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    function setupSize() {
      if (!canvas || !wrap) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = wrap.getBoundingClientRect();
      // CSS サイズを設定
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${height}px`;
      // 描画バッファ
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(height * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, rect.width, height);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#1a1a1a";
      ctx.lineWidth = 2.2;

      // 既存値があればロード (新規時は実行しない)
      if (initialDataUrl) {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, rect.width, height);
        };
        img.src = initialDataUrl;
      }
    }

    setupSize();
    const ro = new ResizeObserver(() => setupSize());
    ro.observe(wrap);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height]);

  function getPos(e: PointerEvent | React.PointerEvent): {
    x: number;
    y: number;
  } | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent) {
    if (disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    drawing.current = true;
    lastPos.current = getPos(e);
    e.preventDefault();
  }

  function move(e: React.PointerEvent) {
    if (!drawing.current || disabled) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const pos = getPos(e);
    if (!pos || !lastPos.current) return;
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
    e.preventDefault();
  }

  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    lastPos.current = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    setHasInk(true);
    onChange(canvas.toDataURL("image/png"));
  }

  function clear() {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = wrap.getBoundingClientRect();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, height);
    setHasInk(false);
    onChange("");
  }

  return (
    <div className="space-y-2">
      <div
        ref={wrapRef}
        className="relative overflow-hidden rounded-lg border border-gray-300 bg-white"
        style={{ height }}
      >
        <canvas
          ref={canvasRef}
          className="block touch-none"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerLeave={end}
        />
        {!hasInk && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-gray-400">
            ここに指やマウスで署名してください
          </div>
        )}
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={clear}
          disabled={disabled || !hasInk}
        >
          <Eraser className="mr-1 h-3.5 w-3.5" />
          書き直す
        </Button>
      </div>
    </div>
  );
}
