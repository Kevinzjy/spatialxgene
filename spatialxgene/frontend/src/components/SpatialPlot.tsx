import React, { useCallback, useEffect, useRef, useState } from "react";
import { getCategoricalColors, continuousToRgb } from "../colorScale";

export type ColorMode = "categorical" | "continuous";

/**
 * Grid-based spacing: n points in [xMin..xMax] x [yMin..yMax].
 * If points form a regular grid, cell area = (dataW*dataH)/n, so step ≈ sqrt(area/n).
 * Use this so point radius matches spatial layout (no sampling bias).
 */
function gridSpacing(
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number },
  n: number
): number {
  const dataW = bounds.xMax - bounds.xMin || 1;
  const dataH = bounds.yMax - bounds.yMin || 1;
  const area = dataW * dataH;
  if (n <= 0) return Math.sqrt(area);
  return Math.sqrt(area / n);
}

export type SpatialPlotProps = {
  x: number[];
  y: number[];
  colorBy: (string | number)[]; // string for categorical, number for expression
  colorMode: ColorMode;
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number };
  title?: string;
};

export function SpatialPlot({ x, y, colorBy, colorMode, bounds, title }: SpatialPlotProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);

  const n = x.length;
  if (y.length !== n || colorBy.length !== n) return null;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = rect.width;
    const H = rect.height;
    const pad = 20;
    if (W < 2 * pad || H < 2 * pad) return;
    const { scale, tx, ty } = view;
    const dataW = bounds.xMax - bounds.xMin || 1;
    const dataH = bounds.yMax - bounds.yMin || 1;
    const sx = (W - 2 * pad) / dataW;
    const sy = (H - 2 * pad) / dataH;
    const s = Math.max(1e-6, Math.min(sx, sy) * scale);
    const ox = pad + (W - 2 * pad) / 2 + tx - (bounds.xMin + bounds.xMax) / 2 * s;
    const oy = pad + (H - 2 * pad) / 2 + ty - (bounds.yMin + bounds.yMax) / 2 * s;

    // Draw in DATA space: transform scales both position and circle size -> points scale with zoom
    ctx.save();
    ctx.setTransform(s * dpr, 0, 0, s * dpr, ox * dpr, oy * dpr);

    const spacing = gridSpacing(bounds, n);
    // radius slightly smaller than spacing/2 so adjacent points have a small gap (≈0.85 of tangent)
    const radiusData = Math.max(spacing * 0.42, 0.5);

    let catMap: Map<string, string> | null = null;
    let vmin = 0, vmax = 1;
    if (colorMode === "categorical") {
      catMap = getCategoricalColors(colorBy as string[]);
    } else {
      const nums = (colorBy as number[]).filter((v) => Number.isFinite(v));
      vmin = Math.min(...nums);
      vmax = Math.max(...nums);
      if (vmax <= vmin) vmax = vmin + 1;
    }

    const margin = radiusData + 2;
    const dataLeft = -ox / s;
    const dataRight = (W - ox) / s;
    const dataTop = -oy / s;
    const dataBottom = (H - oy) / s;
    const clipXMin = Math.min(dataLeft, dataRight) - margin;
    const clipXMax = Math.max(dataLeft, dataRight) + margin;
    const clipYMin = Math.min(dataTop, dataBottom) - margin;
    const clipYMax = Math.max(dataTop, dataBottom) + margin;

    for (let i = 0; i < n; i++) {
      const px = x[i];
      const py = y[i];
      if (px < clipXMin || px > clipXMax || py < clipYMin || py > clipYMax) continue;
      let r: number, g: number, b: number;
      if (colorMode === "categorical" && catMap) {
        const hex = catMap.get(String(colorBy[i])) ?? "#888";
        const m = hex.match(/#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
        r = m ? parseInt(m[1], 16) : 128;
        g = m ? parseInt(m[2], 16) : 128;
        b = m ? parseInt(m[3], 16) : 128;
      } else {
        [r, g, b] = continuousToRgb(colorBy[i] as number, vmin, vmax);
      }
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.beginPath();
      ctx.arc(px, py, radiusData, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }, [x, y, colorBy, colorMode, bounds, n, view]);

  useEffect(() => draw(), [draw]);

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      setView((v) => ({ ...v, scale: Math.max(0.1, Math.min(50, v.scale * factor)) }));
    },
    []
  );

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) setDrag({ x: e.clientX, y: e.clientY });
  }, []);

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (drag) {
        setView((v) => ({
          ...v,
          tx: v.tx + (e.clientX - drag.x),
          ty: v.ty + (e.clientY - drag.y),
        }));
        setDrag({ x: e.clientX, y: e.clientY });
      }
    },
    [drag]
  );

  const onMouseUp = useCallback(() => setDrag(null), []);
  const onMouseLeave = useCallback(() => setDrag(null), []);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {title && (
        <div style={{ padding: "6px 12px", fontSize: 14, fontWeight: 600 }}>
          {title}
        </div>
      )}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          minHeight: 200,
          overflow: "hidden",
          background: "#1a1a2e",
        }}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
      >
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: "100%", display: "block", cursor: drag ? "grabbing" : "grab" }}
        />
      </div>
    </div>
  );
}
