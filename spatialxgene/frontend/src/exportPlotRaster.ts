import type { jsPDF } from "jspdf";
import { MULTIGENE_PALETTE_ACCENT, continuousToRgb } from "./colorScale";
import type {
  MultigeneLegendLayer,
  MultigeneVectorExportOptions,
  VectorExportLegendEntry,
  VectorExportOptions,
} from "./exportPlotVector";

const PDF_LEGEND_COL_WIDTH_MM = 8;
const PDF_LEGEND_ROW_HEIGHT_MM = 2.5;
const PDF_LEGEND_COLS = 4;
const PDF_LEGEND_BG_RGB: [number, number, number] = [26, 26, 46];
const PDF_LEGEND_BORDER_RGB: [number, number, number] = [15, 52, 96];
const PDF_LEGEND_PAD_MM = 0.8;
const MIN_PROPORTION_GRID = 0.05;
function pxPerMmFromDpi(dpi: number): number {
  return dpi / 25.4;
}

type GStateConstructor = new (params: { opacity: number }) => { opacity?: number };

function formatExpr(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs > 0 && abs < 0.001) return v.toExponential(2);
  const sign = v < 0 ? "-" : "";
  const n = abs;
  if (n >= 1_000_000_000) return `${sign}${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${sign}${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${sign}${(n / 1_000).toFixed(2)}K`;
  return Number(v.toFixed(4)).toString();
}

function truncateText(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, Math.max(0, maxLen - 1)) + "…";
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return [0, 0, 0];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function imageFormatFromDataUrl(dataUrl: string): "PNG" | "JPEG" {
  if (dataUrl.startsWith("data:image/png")) return "PNG";
  if (dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg")) return "JPEG";
  return "PNG";
}

function getScaleFactor(pdf: jsPDF): number {
  const internal = (pdf as unknown as { internal?: { scaleFactor?: number } }).internal;
  const s = internal?.scaleFactor;
  return Number.isFinite(s) && (s as number) > 0 ? (s as number) : 72 / 25.4;
}

function formPlaceMatrix(
  x: number,
  y: number,
  _w: number,
  h: number,
  pageHeightMm: number | undefined,
  scaleFactor: number
): string {
  const tx = x * scaleFactor;
  const ty =
    pageHeightMm != null && Number.isFinite(pageHeightMm)
      ? (pageHeightMm - y - h) * scaleFactor
      : y * scaleFactor;
  return `1 0 0 1 ${tx} ${ty}`;
}

function gridSpacingFallback(
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number },
  n: number
): number {
  const dataW = bounds.xMax - bounds.xMin || 1;
  const dataH = bounds.yMax - bounds.yMin || 1;
  const area = dataW * dataH;
  if (n <= 0) return Math.sqrt(area);
  return Math.sqrt(area / n);
}

function getEffectiveBounds(
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number },
  imgBounds?: { xMin: number; yMin: number; xMax: number; yMax: number } | null
) {
  const eMinX = Math.min(bounds.xMin, imgBounds?.xMin ?? bounds.xMin);
  const eMaxX = Math.max(bounds.xMax, imgBounds?.xMax ?? bounds.xMax);
  const eMinY = Math.min(bounds.yMin, imgBounds?.yMin ?? bounds.yMin);
  const eMaxY = Math.max(bounds.yMax, imgBounds?.yMax ?? bounds.yMax);
  return {
    eMinX,
    eMaxX,
    eMinY,
    eMaxY,
    dataW: eMaxX - eMinX || 1,
    dataH: eMaxY - eMinY || 1,
  };
}

function drawPlotBackgroundLayer(
  pdf: jsPDF,
  pageRect: { x: number; y: number; w: number; h: number },
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number },
  imgBounds: { xMin: number; yMin: number; xMax: number; yMax: number } | null | undefined,
  backgroundImageDataUrl: string | null | undefined,
  backgroundOpacity: number,
  gStateClass?: GStateConstructor
) {
  const { eMinX, eMinY, dataW, dataH } = getEffectiveBounds(bounds, imgBounds);
  const scaleX = pageRect.w / dataW;
  const scaleY = pageRect.h / dataH;
  pdf.setFillColor(26, 26, 46);
  pdf.rect(pageRect.x, pageRect.y, pageRect.w, pageRect.h, "F");
  if (!backgroundImageDataUrl) return;
  try {
    const ib = imgBounds ?? bounds;
    const imgPdfX = pageRect.x + (ib.xMin - eMinX) * scaleX;
    const imgPdfY = pageRect.y + (ib.yMin - eMinY) * scaleY;
    const imgPdfW = (ib.xMax - ib.xMin) * scaleX;
    const imgPdfH = (ib.yMax - ib.yMin) * scaleY;
    const alpha = Math.max(0, Math.min(1, backgroundOpacity));
    pdf.saveGraphicsState();
    if (alpha < 1 && gStateClass) pdf.setGState(new gStateClass({ opacity: alpha }));
    pdf.addImage(backgroundImageDataUrl, imageFormatFromDataUrl(backgroundImageDataUrl), imgPdfX, imgPdfY, imgPdfW, imgPdfH);
    pdf.restoreGraphicsState();
  } catch {
    // Skip background image if addImage fails.
  }
}

function drawScatterLegendLayer(
  pdf: jsPDF,
  legend: VectorExportLegendEntry[],
  colorBarStats: { lo: number; mid: number; hi: number } | undefined,
  colorBarTitle: string | undefined,
  continuousPalette: string,
  continuousPaletteReverse: boolean,
  plotArea: { x: number; y: number; w: number; h: number },
  panelRect?: { x: number; y: number; w: number; h: number },
  legendFormKey?: string,
  pageHeightMm?: number
) {
  const pad = 2;
  const legendPanel = panelRect ?? plotArea;
  const rightEdge = legendPanel.x + legendPanel.w - pad;
  const bottomEdge = legendPanel.y + legendPanel.h - pad;
  const scaleFactor = getScaleFactor(pdf);
  const unitMatrix = { toString: () => "1 0 0 1 0 0" };
  const drawLegendInForm = (ox: number, oy: number, boxW: number, boxH: number, draw: (dx: number, dy: number) => void) => {
    if (legendFormKey) {
      pdf.beginFormObject(0, 0, boxW * scaleFactor, boxH * scaleFactor, unitMatrix);
      draw(0, 0);
      pdf.endFormObject(legendFormKey);
      pdf.doFormObject(legendFormKey, {
        toString: () => formPlaceMatrix(ox, oy, boxW, boxH, pageHeightMm, scaleFactor),
      });
    } else {
      draw(ox, oy);
    }
  };

  if (colorBarStats != null) {
    const barW = 1.8;
    const barH = 10;
    const labelGap = 0.8;
    const labelW = 6;
    const boxPad = PDF_LEGEND_PAD_MM;
    const titleH = colorBarTitle ? 2 : 0;
    const totalW = boxPad + barW + labelGap + labelW + boxPad;
    const totalH = boxPad + titleH + barH + boxPad;
    const boxLeft = rightEdge - totalW;
    const boxTop = bottomEdge - totalH;
    drawLegendInForm(boxLeft, boxTop, totalW, totalH, (dx, dy) => {
      pdf.setFillColor(...PDF_LEGEND_BG_RGB);
      pdf.rect(dx, dy, totalW, totalH, "F");
      pdf.setDrawColor(...PDF_LEGEND_BORDER_RGB);
      pdf.setLineWidth(0.2);
      pdf.rect(dx, dy, totalW, totalH, "S");
      const barLeft = dx + boxPad;
      const barTop = dy + boxPad + titleH;
      const barBottom = barTop + barH;
      if (colorBarTitle) {
        pdf.setFontSize(5.5);
        pdf.setTextColor(220, 220, 220);
        pdf.text(truncateText(colorBarTitle, 14), barLeft, dy + boxPad + 1.0);
      }
      const { lo, mid, hi } = colorBarStats;
      const nStrips = 16;
      for (let i = 0; i < nStrips; i++) {
        const t = (i + 0.5) / nStrips;
        const vMid = lo + (hi - lo) * t;
        const [r, g, b] = continuousToRgb(vMid, lo, hi, continuousPalette, continuousPaletteReverse);
        pdf.setFillColor(r, g, b);
        const y0 = barBottom - (barH * (i + 1)) / nStrips;
        const y1 = barBottom - (barH * i) / nStrips;
        pdf.rect(barLeft, y0, barW, y1 - y0, "F");
      }
      pdf.setDrawColor(51, 51, 51);
      pdf.rect(barLeft, barTop, barW, barH, "S");
      pdf.setFontSize(5);
      pdf.setTextColor(170, 170, 170);
      const labelX = barLeft + barW + labelGap;
      pdf.text(formatExpr(hi), labelX, barTop + 1.0);
      pdf.text(formatExpr(mid), labelX, barTop + barH / 2 + 0.5);
      pdf.text(formatExpr(lo), labelX, barBottom - 0.5);
    });
    return;
  }

  if (legend.length === 0) return;
  const slice = legend.slice(0, 24);
  const rows = Math.ceil(slice.length / PDF_LEGEND_COLS);
  const contentW = PDF_LEGEND_COLS * PDF_LEGEND_COL_WIDTH_MM;
  const contentH = rows * PDF_LEGEND_ROW_HEIGHT_MM;
  const boxW = contentW + 2 * PDF_LEGEND_PAD_MM;
  const boxH = contentH + 2 * PDF_LEGEND_PAD_MM;
  const boxLeft = rightEdge - boxW;
  const boxTop = bottomEdge - boxH;
  drawLegendInForm(boxLeft, boxTop, boxW, boxH, (dx, dy) => {
    const contentX2 = dx + PDF_LEGEND_PAD_MM;
    const contentY2 = dy + PDF_LEGEND_PAD_MM + 1.5;
    pdf.setFillColor(...PDF_LEGEND_BG_RGB);
    pdf.rect(dx, dy, boxW, boxH, "F");
    pdf.setDrawColor(...PDF_LEGEND_BORDER_RGB);
    pdf.setLineWidth(0.2);
    pdf.rect(dx, dy, boxW, boxH, "S");
    pdf.setFontSize(5);
    slice.forEach((entry, i) => {
      const col = i % PDF_LEGEND_COLS;
      const row = Math.floor(i / PDF_LEGEND_COLS);
      const lx = contentX2 + col * PDF_LEGEND_COL_WIDTH_MM;
      const ly = contentY2 + row * PDF_LEGEND_ROW_HEIGHT_MM;
      const [r, g, b] = hexToRgb(entry.color);
      pdf.setFillColor(r, g, b);
      pdf.setDrawColor(51, 51, 51);
      pdf.rect(lx, ly - 1.2, 1.2, 1.2, "F");
      pdf.rect(lx, ly - 1.2, 1.2, 1.2, "S");
      const label = truncateText(entry.label, 10);
      const countStr = entry.count != null ? entry.count.toLocaleString() : null;
      pdf.setTextColor(220, 220, 220);
      pdf.text(label, lx + 1.8, ly);
      if (countStr) {
        const charW = 0.9;
        const estLabelW = Math.min(8, label.length * charW);
        pdf.setTextColor(160, 160, 160);
        pdf.text(countStr, lx + 1.8 + estLabelW + charW, ly);
      }
    });
  });
}

function drawMultigeneLegendLayer(
  pdf: jsPDF,
  legend: VectorExportLegendEntry[],
  legendLayers: MultigeneLegendLayer[] | undefined,
  plotArea: { x: number; y: number; w: number; h: number },
  panelRect?: { x: number; y: number; w: number; h: number },
  legendFormKey?: string,
  pageHeightMm?: number
) {
  const pad = 2;
  const legendPanel = panelRect ?? plotArea;
  const scaleFactor = getScaleFactor(pdf);
  const unitMatrix = { toString: () => "1 0 0 1 0 0" };
  const drawLegendInForm = (ox: number, oy: number, boxW: number, boxH: number, draw: (dx: number, dy: number) => void) => {
    if (legendFormKey) {
      pdf.beginFormObject(0, 0, boxW * scaleFactor, boxH * scaleFactor, unitMatrix);
      draw(0, 0);
      pdf.endFormObject(legendFormKey);
      pdf.doFormObject(legendFormKey, {
        toString: () => formPlaceMatrix(ox, oy, boxW, boxH, pageHeightMm, scaleFactor),
      });
    } else {
      draw(ox, oy);
    }
  };
  if (legendLayers && legendLayers.length > 0) {
    const layers = legendLayers.slice(0, 12);
    const boxPad = PDF_LEGEND_PAD_MM;
    const gap = 1.0;
    const rowH = 2.4;
    const swW = 6;
    const swH = 1.5;
    const textW = 14;
    const boxW = boxPad + swW + gap + textW + boxPad;
    const boxH = boxPad * 2 + layers.length * rowH;
    const boxX = legendPanel.x + legendPanel.w - pad - boxW;
    const boxY = legendPanel.y + legendPanel.h - pad - boxH;
    drawLegendInForm(boxX, boxY, boxW, boxH, (dx, dy) => {
      pdf.setFillColor(...PDF_LEGEND_BG_RGB);
      pdf.rect(dx, dy, boxW, boxH, "F");
      pdf.setDrawColor(...PDF_LEGEND_BORDER_RGB);
      pdf.setLineWidth(0.2);
      pdf.rect(dx, dy, boxW, boxH, "S");
      pdf.setFontSize(5);
      pdf.setTextColor(170, 170, 170);
      for (let i = 0; i < layers.length; i++) {
        const layer = layers[i];
        const centerY = dy + boxPad + (i + 0.5) * rowH;
        const swX = dx + boxPad;
        const swY = centerY - swH * 0.5;
        const [r0, g0, b0] = hexToRgb("#000000");
        const [r1, g1, b1] = hexToRgb(MULTIGENE_PALETTE_ACCENT[layer.paletteId] ?? "#ffff00");
        const steps = 12;
        for (let s = 0; s < steps; s++) {
          const t = steps <= 1 ? 1 : s / (steps - 1);
          pdf.setFillColor(
            Math.round(r0 + (r1 - r0) * t),
            Math.round(g0 + (g1 - g0) * t),
            Math.round(b0 + (b1 - b0) * t)
          );
          pdf.rect(swX + (swW * s) / steps, swY, swW / steps, swH, "F");
        }
        pdf.setDrawColor(51, 51, 51);
        pdf.rect(swX, swY, swW, swH, "S");
        const label = `${layer.name} ${formatExpr(layer.vmin)}–${formatExpr(layer.vmax)}`;
        pdf.text(truncateText(label, 28), swX + swW + gap, centerY + 0.4);
      }
    });
    return;
  }

  if (legend.length === 0) return;
  const slice = legend.slice(0, 24);
  const contentW = PDF_LEGEND_COLS * PDF_LEGEND_COL_WIDTH_MM;
  const contentH = Math.ceil(slice.length / PDF_LEGEND_COLS) * PDF_LEGEND_ROW_HEIGHT_MM;
  const boxW = contentW + 2 * PDF_LEGEND_PAD_MM;
  const boxH = contentH + 2 * PDF_LEGEND_PAD_MM;
  const boxLeft = legendPanel.x + legendPanel.w - pad - boxW;
  const boxTop = legendPanel.y + legendPanel.h - pad - boxH;
  drawLegendInForm(boxLeft, boxTop, boxW, boxH, (dx, dy) => {
    const contentX2 = dx + PDF_LEGEND_PAD_MM;
    const contentY2 = dy + PDF_LEGEND_PAD_MM;
    pdf.setFillColor(...PDF_LEGEND_BG_RGB);
    pdf.rect(dx, dy, boxW, boxH, "F");
    pdf.setDrawColor(...PDF_LEGEND_BORDER_RGB);
    pdf.setLineWidth(0.2);
    pdf.rect(dx, dy, boxW, boxH, "S");
    pdf.setFontSize(5);
    pdf.setTextColor(200, 200, 200);
    slice.forEach((entry, i) => {
      const col = i % PDF_LEGEND_COLS;
      const row = Math.floor(i / PDF_LEGEND_COLS);
      const lx = contentX2 + col * PDF_LEGEND_COL_WIDTH_MM;
      const ly = contentY2 + row * PDF_LEGEND_ROW_HEIGHT_MM;
      const [r, g, b] = hexToRgb(entry.color);
      pdf.setFillColor(r, g, b);
      pdf.rect(lx, ly - 1.2, 1.2, 1.2, "F");
      pdf.text(truncateText(entry.label, 12), lx + 1.8, ly);
    });
  });
}

function createTransparentCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  return { canvas, ctx };
}

function renderScatterMarksToDataUrl(
  options: VectorExportOptions,
  pageRect: { x: number; y: number; w: number; h: number },
  dpi: number
) {
  const {
    x,
    y,
    colorByHex,
    bounds,
    spotSizeScale,
    spotOpacity = 1,
    backgroundImageBounds,
    spotSpacingData,
  } = options;
  const n = Math.min(x.length, y.length, colorByHex.length);
  if (n === 0) return null;
  const { eMinX, eMinY, dataW, dataH } = getEffectiveBounds(bounds, backgroundImageBounds);
  const pxPerMm = pxPerMmFromDpi(dpi);
  const widthPx = Math.max(1, Math.round(pageRect.w * pxPerMm));
  const heightPx = Math.max(1, Math.round(pageRect.h * pxPerMm));
  const { canvas, ctx } = createTransparentCanvas(widthPx, heightPx);
  if (!ctx) return null;
  const scaleX = widthPx / dataW;
  const scaleY = heightPx / dataH;
  const spacingForRadius =
    typeof spotSpacingData === "number" && Number.isFinite(spotSpacingData) && spotSpacingData > 0
      ? spotSpacingData
      : gridSpacingFallback(bounds, n);
  const radiusData = (spacingForRadius / 2) * Math.max(0.2, Math.min(3, spotSizeScale));
  const radiusPx = Math.max(0.75, radiusData * Math.min(scaleX, scaleY));
  ctx.globalAlpha = Math.max(0, Math.min(1, spotOpacity));
  for (let i = 0; i < n; i++) {
    const px = (x[i] - eMinX) * scaleX;
    const py = (y[i] - eMinY) * scaleY;
    ctx.fillStyle = colorByHex[i] ?? "#888888";
    ctx.beginPath();
    ctx.arc(px, py, radiusPx, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas.toDataURL("image/png");
}

function renderMultigeneMarksToDataUrl(
  options: MultigeneVectorExportOptions,
  pageRect: { x: number; y: number; w: number; h: number },
  dpi: number
) {
  const {
    spots,
    bounds,
    spotSizeScale,
    layout,
    spotOpacity = 1,
    backgroundImageBounds,
    spotSpacingData,
  } = options;
  const n = spots.length;
  if (n === 0) return null;
  const { eMinX, eMinY, dataW, dataH } = getEffectiveBounds(bounds, backgroundImageBounds);
  const pxPerMm = pxPerMmFromDpi(dpi);
  const widthPx = Math.max(1, Math.round(pageRect.w * pxPerMm));
  const heightPx = Math.max(1, Math.round(pageRect.h * pxPerMm));
  const { canvas, ctx } = createTransparentCanvas(widthPx, heightPx);
  if (!ctx) return null;
  const scaleX = widthPx / dataW;
  const scaleY = heightPx / dataH;
  const spacingForRadius =
    typeof spotSpacingData === "number" && Number.isFinite(spotSpacingData) && spotSpacingData > 0
      ? spotSpacingData
      : gridSpacingFallback(bounds, n);
  const radiusData = (spacingForRadius / 2) * Math.max(0.2, Math.min(3, spotSizeScale));
  const radiusPx = Math.max(0.75, radiusData * Math.min(scaleX, scaleY));
  ctx.globalAlpha = Math.max(0, Math.min(1, spotOpacity));

  if (layout === "grid") {
    let maxK = 0;
    for (let i = 0; i < n; i++) {
      const visible = spots[i].segments.filter((segment) => segment.proportion >= MIN_PROPORTION_GRID);
      if (visible.length > maxK) maxK = visible.length;
    }
    const spotSide = radiusPx * 2;
    const radiusPolygon = radiusPx * 0.7;
    const squareSide =
      maxK === 0 ? 0 : maxK === 1 ? spotSide * 0.5 : 2 * radiusPolygon * Math.sin(Math.PI / maxK) * 1.1;
    for (let i = 0; i < n; i++) {
      const spot = spots[i];
      const cx = (spot.x - eMinX) * scaleX;
      const cy = (spot.y - eMinY) * scaleY;
      const visible = spot.segments.filter((segment) => segment.proportion >= MIN_PROPORTION_GRID);
      const visibleCount = visible.length;
      if (visibleCount === 0 || squareSide <= 0) continue;
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx - radiusPx, cy - radiusPx, spotSide, spotSide);
      ctx.clip();
      const startAngle = -Math.PI / 2;
      for (let idx = visibleCount - 1; idx >= 0; idx--) {
        const angle = visibleCount === 1 ? 0 : startAngle + (2 * Math.PI * idx) / visibleCount;
        const centerX = visibleCount === 1 ? cx : cx + radiusPolygon * Math.cos(angle);
        const centerY = visibleCount === 1 ? cy : cy + radiusPolygon * Math.sin(angle);
        ctx.fillStyle = visible[idx].color;
        ctx.fillRect(centerX - squareSide / 2, centerY - squareSide / 2, squareSide, squareSide);
      }
      ctx.restore();
    }
  } else {
    const startAngle0 = -Math.PI / 2;
    for (let i = 0; i < n; i++) {
      const spot = spots[i];
      const cx = (spot.x - eMinX) * scaleX;
      const cy = (spot.y - eMinY) * scaleY;
      let angle = startAngle0;
      for (const segment of spot.segments) {
        if (segment.proportion <= 0) continue;
        const span = segment.proportion * Math.PI * 2;
        ctx.fillStyle = segment.color;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radiusPx, angle, angle + span);
        ctx.closePath();
        ctx.fill();
        angle += span;
      }
    }
  }

  return canvas.toDataURL("image/png");
}

export function drawPlotToPdfRasterized(
  pdf: jsPDF,
  options: VectorExportOptions,
  pageRect: { x: number; y: number; w: number; h: number },
  gStateClass?: GStateConstructor,
  dpi = 300,
  pageHeightMm?: number
) {
  const {
    x,
    y,
    colorByHex,
    bounds,
    legend = [],
    colorBarStats,
    colorBarTitle,
    continuousPalette = "vlag",
    continuousPaletteReverse = false,
    backgroundImageDataUrl,
    backgroundImageBounds,
    backgroundOpacity = 1,
    panelRect,
    legendFormKey,
  } = options;
  drawPlotBackgroundLayer(pdf, pageRect, bounds, backgroundImageBounds, backgroundImageDataUrl, backgroundOpacity, gStateClass);
  if (Math.min(x.length, y.length, colorByHex.length) === 0) {
    pdf.setFontSize(7);
    pdf.setTextColor(128, 128, 128);
    pdf.text("No data", pageRect.x + pageRect.w / 2 - 8, pageRect.y + pageRect.h / 2);
    return;
  }
  const marksDataUrl = renderScatterMarksToDataUrl(options, pageRect, dpi);
  if (marksDataUrl) {
    pdf.addImage(marksDataUrl, "PNG", pageRect.x, pageRect.y, pageRect.w, pageRect.h);
  }
  drawScatterLegendLayer(
    pdf,
    legend,
    colorBarStats,
    colorBarTitle,
    continuousPalette,
    continuousPaletteReverse,
    pageRect,
    panelRect,
    legendFormKey,
    pageHeightMm
  );
}

export function drawMultigenePlotToPdfRasterized(
  pdf: jsPDF,
  options: MultigeneVectorExportOptions,
  pageRect: { x: number; y: number; w: number; h: number },
  gStateClass?: GStateConstructor,
  dpi = 300,
  pageHeightMm?: number
) {
  const {
    spots,
    bounds,
    legend = [],
    legendLayers,
    backgroundImageDataUrl,
    backgroundImageBounds,
    backgroundOpacity = 1,
    panelRect,
    legendFormKey,
  } = options;
  drawPlotBackgroundLayer(pdf, pageRect, bounds, backgroundImageBounds, backgroundImageDataUrl, backgroundOpacity, gStateClass);
  if (spots.length === 0) {
    pdf.setFontSize(7);
    pdf.setTextColor(128, 128, 128);
    pdf.text("No data", pageRect.x + pageRect.w / 2 - 8, pageRect.y + pageRect.h / 2);
    return;
  }
  const marksDataUrl = renderMultigeneMarksToDataUrl(options, pageRect, dpi);
  if (marksDataUrl) {
    pdf.addImage(marksDataUrl, "PNG", pageRect.x, pageRect.y, pageRect.w, pageRect.h);
  }
  drawMultigeneLegendLayer(pdf, legend, legendLayers, pageRect, panelRect, legendFormKey, pageHeightMm);
}
