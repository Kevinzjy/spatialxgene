/**
 * Export plot as editable vector graphics (SVG string or draw into jsPDF).
 * Used for publication-ready figures: user can adjust colors, remove elements, re-layout in Illustrator/Inkscape.
 */

import type { jsPDF } from "jspdf";
import { MULTI_FEATURE_PALETTE_ACCENT, continuousToRgb } from "./colorScale";
import { THEME } from "./theme";

const DEFAULT_EXPORT_WIDTH = 800;
const DEFAULT_EXPORT_HEIGHT = 600;
const TITLE_HEIGHT = 28;
const LEGEND_BOTTOM = 50;
/** PDF export: legend/colorbar in bottom-right, compact with background box. */
const PDF_LEGEND_COL_WIDTH_MM = 8;
const PDF_LEGEND_ROW_HEIGHT_MM = 2.5;
const PDF_LEGEND_COLS = 4;
const PDF_LEGEND_BG_RGB: [number, number, number] = [26, 26, 46];
const PDF_LEGEND_BORDER_RGB: [number, number, number] = [15, 52, 96];
const PDF_LEGEND_PAD_MM = 0.8;
/** Subsample when over this many points so SVG/PDF stays editable. */
const MAX_POINTS_EXPORT = 50000;

function formatExpr(v: number): string {
  // Keep consistent with frontend `SpatialPlot.formatExpr`.
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

/** Radius in data units for one spot (used to compute per-sample scale so spot size in mm is consistent). */
export function getRadiusData(
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number },
  n: number,
  spotSizeScale: number
): number {
  const spacing = gridSpacingFallback(bounds, n);
  return (spacing / 2) * Math.max(0.2, Math.min(3, spotSizeScale));
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return [0, 0, 0];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export type VectorExportLegendEntry = { label: string; color: string; count?: number };

export type VectorExportOptions = {
  x: number[];
  y: number[];
  /** Hex color for each point (same length as x/y). */
  colorByHex: string[];
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number };
  spotSizeScale: number;
  width?: number;
  height?: number;
  title?: string;
  /** Categorical legend (Annotation mode): label, color, optional count. */
  legend?: VectorExportLegendEntry[];
  /** Continuous color bar (Gene mode): lo, mid, hi for vertical bar + labels. */
  colorBarStats?: { lo: number; mid: number; hi: number };
  /** Optional title shown above color bar (e.g. gene or field name). */
  colorBarTitle?: string;
  /** Palette id for color bar gradient (e.g. vlag, viridis). */
  continuousPalette?: string;
  /** Reverse palette direction for color bar. */
  continuousPaletteReverse?: boolean;
  /** Max points to export (subsample if exceeded). Default 50000. */
  maxPoints?: number;
  /** Optional tissue/background image as data URL (raster layer); points/legend stay vector. */
  backgroundImageDataUrl?: string | null;
  /** Bounds of the background image in data space (from scale_factor). If set, image is placed here so it aligns with spots; otherwise image fills plot rect. */
  backgroundImageBounds?: { xMin: number; yMin: number; xMax: number; yMax: number } | null;
  /** Background image opacity 0–1 (default 1). */
  backgroundOpacity?: number;
  /** Spot opacity 0–1 (default 1). */
  spotOpacity?: number;
  /** Typical nearest-neighbor spacing in data units (e.g. median). When set, used for spot radius so 100% = tangent; else fallback from bounds. */
  spotSpacingData?: number;
  /** Full panel rect (cell) for this sample in mm; legends align to its bottom-right. */
  panelRect?: { x: number; y: number; w: number; h: number };
  /** Optional unique key for legend Form XObject; when set, legend/color bar + background are drawn as one group (e.g. for Illustrator). */
  legendFormKey?: string;
  /** Optional unique key for plot Form XObject (background rect + tissue image + points); when set, the sample panel is one group in Illustrator. */
  plotFormKey?: string;
};

/** Per-spot segment for multiFeature pie: proportion (0..1) and fill color (hex). */
export type MultiFeatureSegment = { proportion: number; color: string };

export type MultiFeatureLegendLayer = {
  name: string;
  paletteId: string;
  vmin: number;
  vmax: number;
};

/** Options for multiFeature vector export: one spot = pie or grid with segments. */
export type MultiFeatureVectorExportOptions = {
  /** Spot positions and segments (pie wedges or grid). */
  spots: Array<{ x: number; y: number; segments: MultiFeatureSegment[] }>;
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number };
  spotSizeScale: number;
  /** Layout for multiFeature spots, matching frontend: "pie" wedges (default) or "grid" of squares. */
  layout?: "pie" | "grid";
  title?: string;
  legend?: VectorExportLegendEntry[];
  /** MultiFeature legend rows (gradient + name + vmin–vmax), matching frontend. */
  legendLayers?: MultiFeatureLegendLayer[];
  backgroundImageDataUrl?: string | null;
  /** Bounds of the background image in data space; if set, image is placed here to align with spots. */
  backgroundImageBounds?: { xMin: number; yMin: number; xMax: number; yMax: number } | null;
  backgroundOpacity?: number;
  spotOpacity?: number;
  maxPoints?: number;
  /** Typical nearest-neighbor spacing in data units; when set, used for spot radius so 100% = tangent. */
  spotSpacingData?: number;
  /** Full panel rect (cell) for this sample in mm; legends align to its bottom-right. */
  panelRect?: { x: number; y: number; w: number; h: number };
  /** Optional unique key for legend Form XObject; when set, legend/color bar + background are drawn as one group (e.g. for Illustrator). */
  legendFormKey?: string;
  /** Optional unique key for plot Form XObject (background rect + tissue image + spots); when set, the sample panel is one group in Illustrator. */
  plotFormKey?: string;
};

/**
 * Generate an SVG string for one plot (vector circles + title + legend).
 * Suitable for opening in Illustrator, Inkscape, or embedding.
 */
export function plotToSvg(options: VectorExportOptions): string {
  const {
    x,
    y,
    colorByHex,
    bounds,
    spotSizeScale,
    width = DEFAULT_EXPORT_WIDTH,
    height = DEFAULT_EXPORT_HEIGHT,
    title,
    legend = [],
    maxPoints = MAX_POINTS_EXPORT,
  } = options;

  const n = Math.min(x.length, y.length, colorByHex.length);
  if (n === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><text x="10" y="30" fill="#888" font-size="14">No data</text></svg>`;
  }

  const plotTop = title ? TITLE_HEIGHT : 10;
  const plotBottom = height - (legend.length > 0 ? LEGEND_BOTTOM : 10);
  const plotLeft = 10;
  const plotRight = width - 10;
  const plotW = plotRight - plotLeft;
  const plotH = plotBottom - plotTop;

  const dataW = bounds.xMax - bounds.xMin || 1;
  const dataH = bounds.yMax - bounds.yMin || 1;
  const spacing = gridSpacingFallback(bounds, n);
  const radiusData = (spacing / 2) * Math.max(0.2, Math.min(3, spotSizeScale));
  const scale = Math.min(plotW / dataW, plotH / dataH);
  const radiusPx = Math.max(0.5, radiusData * scale);

  const step = n > maxPoints ? Math.ceil(n / maxPoints) : 1;
  const indices: number[] = [];
  for (let i = 0; i < n; i += step) indices.push(i);

  const circles = indices
    .map((i) => {
      const sx = plotLeft + ((x[i] - bounds.xMin) / dataW) * plotW;
      const sy = plotBottom - ((y[i] - bounds.yMin) / dataH) * plotH;
      const hex = colorByHex[i] ?? "#888888";
      return `<circle cx="${sx.toFixed(2)}" cy="${sy.toFixed(2)}" r="${radiusPx.toFixed(2)}" fill="${hex}" />`;
    })
    .join("\n");

  let titleEl = "";
  if (title) {
    titleEl = `<text x="${width / 2}" y="20" text-anchor="middle" fill="#eee" font-size="14" font-family="system-ui,sans-serif">${escapeXml(title)}</text>`;
  }

  let legendEl = "";
  if (legend.length > 0) {
    const items = legend
      .slice(0, 24)
      .map(
        (e, i) =>
          `<g><rect x="${plotLeft + (i % 6) * 120}" y="${plotBottom + 8 + Math.floor(i / 6) * 16}" width="10" height="10" fill="${e.color}" /><text x="${plotLeft + (i % 6) * 120 + 14}" y="${plotBottom + 17 + Math.floor(i / 6) * 16}" fill="#ccc" font-size="10" font-family="system-ui,sans-serif">${escapeXml(e.label)}</text></g>`
      )
      .join("\n");
    legendEl = `<g>${items}</g>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${THEME.bgMain}"/>
  ${titleEl}
  ${circles}
  ${legendEl}
</svg>`;
}

/**
 * Draw the same plot as vector content onto a jsPDF page (circles + title + legend).
 * pageRect is in mm (e.g. A4 content area). Preserves vectors for editing in Acrobat/Illustrator.
 */
/** Detect image format from data URL for jsPDF addImage. */
function imageFormatFromDataUrl(dataUrl: string): "PNG" | "JPEG" {
  if (dataUrl.startsWith("data:image/png")) return "PNG";
  if (dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg")) return "JPEG";
  return "PNG";
}

/**
 * Draw plot onto a jsPDF page: optional raster background (tissue image), then vector points, title, legend.
 * Like matplotlib savefig: background can be bitmap; points and legend are editable vectors.
 */
/** GState constructor from jspdf (e.g. from import("jspdf").GState). Required for opacity. */
type GStateConstructor = new (params: { opacity: number }) => { opacity?: number };

/** jsPDF uses scaleFactor (e.g. 72/25.4 for mm) so stream coords are in points; Form BBox and Do matrix must match. */
function getScaleFactor(pdf: jsPDF): number {
  const internal = (pdf as unknown as { internal?: { scaleFactor?: number } }).internal;
  const s = internal?.scaleFactor;
  return Number.isFinite(s) && (s as number) > 0 ? (s as number) : 72 / 25.4;
}

/**
 * Form stream is in points (scaleFactor * user units). Place form so form (0,0) = content bottom-left in page.
 * Matrix is written raw to PDF (page stream is in points). tx/ty in points: tx = x*scaleFactor, ty = (pageHeightMm - y - h)*scaleFactor.
 */
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

export function drawPlotToPdfVector(
  pdf: jsPDF,
  options: VectorExportOptions,
  pageRect: { x: number; y: number; w: number; h: number },
  gStateClass?: GStateConstructor,
  pageHeightMm?: number
): void {
  const {
    x,
    y,
    colorByHex,
    bounds,
    spotSizeScale,
    legend = [],
    colorBarStats,
    colorBarTitle,
    continuousPalette = "vlag",
    continuousPaletteReverse = false,
    maxPoints = MAX_POINTS_EXPORT,
    backgroundImageDataUrl,
    backgroundImageBounds: imgBounds,
    backgroundOpacity = 1,
    spotOpacity = 1,
    spotSpacingData,
    panelRect,
    legendFormKey,
    plotFormKey,
  } = options;

  // Panel extent = union of spots bounds and background image bounds (align to outer content, not just spots).
  const eMinX = Math.min(bounds.xMin, imgBounds?.xMin ?? bounds.xMin);
  const eMaxX = Math.max(bounds.xMax, imgBounds?.xMax ?? bounds.xMax);
  const eMinY = Math.min(bounds.yMin, imgBounds?.yMin ?? bounds.yMin);
  const eMaxY = Math.max(bounds.yMax, imgBounds?.yMax ?? bounds.yMax);
  const dataW = eMaxX - eMinX || 1;
  const dataH = eMaxY - eMinY || 1;

  const plotArea = { x: pageRect.x, y: pageRect.y, w: pageRect.w, h: pageRect.h };
  const plotWMm = plotArea.w;
  const plotHMm = plotArea.h;
  const scaleX = plotWMm / dataW;
  const scaleY = plotHMm / dataH;
  const scaleFactor = getScaleFactor(pdf);

  const unitMatrix = { toString: () => "1 0 0 1 0 0" };
  const drawPlotContent = (dx: number, dy: number) => {
    pdf.setFillColor(26, 26, 46);
    pdf.rect(dx, dy, plotArea.w, plotArea.h, "F");
    if (backgroundImageDataUrl && backgroundImageDataUrl.length > 0) {
      try {
        const alpha = Math.max(0, Math.min(1, backgroundOpacity));
        const format = imageFormatFromDataUrl(backgroundImageDataUrl);
        const ib = imgBounds ?? bounds;
        const imgPdfX = dx + (ib.xMin - eMinX) * scaleX;
        const imgPdfY = dy + (ib.yMin - eMinY) * scaleY;
        const imgPdfW = (ib.xMax - ib.xMin) * scaleX;
        const imgPdfH = (ib.yMax - ib.yMin) * scaleY;
        pdf.saveGraphicsState();
        if (alpha < 1 && gStateClass) pdf.setGState(new gStateClass({ opacity: alpha }));
        pdf.addImage(backgroundImageDataUrl, format, imgPdfX, imgPdfY, imgPdfW, imgPdfH);
        pdf.restoreGraphicsState();
      } catch {
        // If addImage fails (e.g. CORS), skip background
      }
    }
  };

  const n = Math.min(x.length, y.length, colorByHex.length);
  if (n === 0) {
    if (plotFormKey) {
      pdf.beginFormObject(0, 0, plotArea.w * scaleFactor, plotArea.h * scaleFactor, unitMatrix);
      drawPlotContent(0, 0);
      pdf.setFontSize(7);
      pdf.setTextColor(128, 128, 128);
      pdf.text("No data", plotArea.w / 2 - 8, plotArea.h / 2);
      pdf.endFormObject(plotFormKey);
      pdf.doFormObject(plotFormKey, {
        toString: () => formPlaceMatrix(plotArea.x, plotArea.y, plotArea.w, plotArea.h, pageHeightMm, scaleFactor),
      });
    } else {
      drawPlotContent(plotArea.x, plotArea.y);
      pdf.setFontSize(7);
      pdf.setTextColor(128, 128, 128);
      pdf.text("No data", plotArea.x + plotArea.w / 2 - 8, plotArea.y + plotArea.h / 2);
    }
    return;
  }

  const spacingForRadius: number =
    typeof spotSpacingData === "number" && Number.isFinite(spotSpacingData) && spotSpacingData > 0
      ? spotSpacingData
      : gridSpacingFallback(bounds, n);
  const radiusData = (spacingForRadius / 2) * Math.max(0.2, Math.min(3, spotSizeScale));
  const scale = Math.min(scaleX, scaleY);
  const radiusMm = Math.max(0.05, radiusData * scale);
  const step = n > maxPoints ? Math.ceil(n / maxPoints) : 1;
  const spotAlpha = Math.max(0, Math.min(1, spotOpacity));

  if (plotFormKey) {
    pdf.beginFormObject(0, 0, plotArea.w * scaleFactor, plotArea.h * scaleFactor, unitMatrix);
    drawPlotContent(0, 0);
    pdf.saveGraphicsState();
    if (spotAlpha < 1 && gStateClass) pdf.setGState(new gStateClass({ opacity: spotAlpha }));
    for (let i = 0; i < n; i += step) {
      const px = (x[i] - eMinX) * scaleX;
      const py = (y[i] - eMinY) * scaleY;
      const hex = colorByHex[i] ?? "#888888";
      const [r, g, b] = hexToRgb(hex);
      pdf.setFillColor(r, g, b);
      pdf.circle(px, py, radiusMm, "F");
    }
    pdf.restoreGraphicsState();
    pdf.endFormObject(plotFormKey);
    pdf.doFormObject(plotFormKey, {
      toString: () => formPlaceMatrix(plotArea.x, plotArea.y, plotArea.w, plotArea.h, pageHeightMm, scaleFactor),
    });
  } else {
    drawPlotContent(plotArea.x, plotArea.y);
    pdf.saveGraphicsState();
    if (spotAlpha < 1 && gStateClass) pdf.setGState(new gStateClass({ opacity: spotAlpha }));
    for (let i = 0; i < n; i += step) {
      const px = plotArea.x + (x[i] - eMinX) * scaleX;
      const py = plotArea.y + (y[i] - eMinY) * scaleY;
      const hex = colorByHex[i] ?? "#888888";
      const [r, g, b] = hexToRgb(hex);
      pdf.setFillColor(r, g, b);
      pdf.circle(px, py, radiusMm, "F");
    }
    pdf.restoreGraphicsState();
  }

  // 5) Annotation legend (categorical) or Gene color bar (continuous) in bottom-right, compact with background.
  // When legendFormKey is set, draw into a Form XObject so the whole block is one group in Illustrator.
  const pad = 2;
  const legendPanel = panelRect ?? plotArea;
  const rightEdge = legendPanel.x + legendPanel.w - pad;
  const bottomEdge = legendPanel.y + legendPanel.h - pad;

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
      const l = (x: number, y: number) => [x + dx, y + dy] as const;
      pdf.setFillColor(...PDF_LEGEND_BG_RGB);
      pdf.rect(...l(0, 0), totalW, totalH, "F");
      pdf.setDrawColor(...PDF_LEGEND_BORDER_RGB);
      pdf.setLineWidth(0.2);
      pdf.rect(...l(0, 0), totalW, totalH, "S");
      const barLeft = boxPad + dx;
      const barTop = boxPad + titleH + dy;
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
        const y0 = barBottom - barH * (i + 1) / nStrips;
        const y1 = barBottom - barH * i / nStrips;
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
  } else if (legend.length > 0) {
    const slice = legend.slice(0, 24);
    const rows = Math.ceil(slice.length / PDF_LEGEND_COLS);
    const contentW = PDF_LEGEND_COLS * PDF_LEGEND_COL_WIDTH_MM;
    const contentH = rows * PDF_LEGEND_ROW_HEIGHT_MM;
    const boxW = contentW + 2 * PDF_LEGEND_PAD_MM;
    const boxH = contentH + 2 * PDF_LEGEND_PAD_MM;
    const boxLeft = rightEdge - boxW;
    const boxTop = bottomEdge - boxH;
    drawLegendInForm(boxLeft, boxTop, boxW, boxH, (dx, dy) => {
      const contentX = PDF_LEGEND_PAD_MM + dx;
      const contentY = PDF_LEGEND_PAD_MM + 1.5 + dy;
      pdf.setFillColor(...PDF_LEGEND_BG_RGB);
      pdf.rect(dx, dy, boxW, boxH, "F");
      pdf.setDrawColor(...PDF_LEGEND_BORDER_RGB);
      pdf.setLineWidth(0.2);
      pdf.rect(dx, dy, boxW, boxH, "S");
      pdf.setFontSize(5);
      slice.forEach((e, i) => {
        const col = i % PDF_LEGEND_COLS;
        const row = Math.floor(i / PDF_LEGEND_COLS);
        const lx = contentX + col * PDF_LEGEND_COL_WIDTH_MM;
        const ly = contentY + row * PDF_LEGEND_ROW_HEIGHT_MM;
        const [r, g, b] = hexToRgb(e.color);
        pdf.setFillColor(r, g, b);
        pdf.setDrawColor(51, 51, 51);
        pdf.rect(lx, ly - 1.2, 1.2, 1.2, "F");
        pdf.rect(lx, ly - 1.2, 1.2, 1.2, "S");
        const label = truncateText(e.label, 10);
        const countStr = e.count != null ? e.count.toLocaleString() : null;
        pdf.setTextColor(220, 220, 220);
        pdf.text(label, lx + 1.8, ly);
        if (countStr) {
          const charW = 0.9;
          const estLabelW = Math.min(8, label.length * charW);
          const extra = charW;
          pdf.setTextColor(160, 160, 160);
          pdf.text(countStr, lx + 1.8 + estLabelW + extra, ly);
        }
      });
    });
  }
}

/** Number of arc samples per wedge for smooth pie segments. */
const WEDGE_ARC_SAMPLES = 12;
/** In grid layout, only draw cells for genes with at least this proportion (avoids tiny low-expression squares). */
const MIN_PROPORTION_GRID = 0.05;

/**
 * Draw multiFeature plot onto a jsPDF page: raster background + per-spot layout ("pie" wedges or "grid" of squares), then legend.
 * Layout matches frontend multiFeature view.
 */
export function drawMultiFeaturePlotToPdfVector(
  pdf: jsPDF,
  options: MultiFeatureVectorExportOptions,
  pageRect: { x: number; y: number; w: number; h: number },
  gStateClass?: GStateConstructor,
  pageHeightMm?: number
): void {
  const {
    spots,
    bounds,
    spotSizeScale,
    layout,
    legend = [],
    legendLayers,
    backgroundImageDataUrl,
    backgroundImageBounds: imgBounds,
    backgroundOpacity = 1,
    spotOpacity = 1,
    maxPoints = MAX_POINTS_EXPORT,
    spotSpacingData,
    panelRect,
    legendFormKey,
    plotFormKey,
  } = options;

  // Panel extent = union of spots bounds and background image bounds
  const eMinX = Math.min(bounds.xMin, imgBounds?.xMin ?? bounds.xMin);
  const eMaxX = Math.max(bounds.xMax, imgBounds?.xMax ?? bounds.xMax);
  const eMinY = Math.min(bounds.yMin, imgBounds?.yMin ?? bounds.yMin);
  const eMaxY = Math.max(bounds.yMax, imgBounds?.yMax ?? bounds.yMax);
  const dataW = eMaxX - eMinX || 1;
  const dataH = eMaxY - eMinY || 1;

  const plotArea = { x: pageRect.x, y: pageRect.y, w: pageRect.w, h: pageRect.h };
  const plotWMm = plotArea.w;
  const plotHMm = plotArea.h;
  const scaleX = plotWMm / dataW;
  const scaleY = plotHMm / dataH;
  const scaleFactor = getScaleFactor(pdf);

  const unitMatrix = { toString: () => "1 0 0 1 0 0" };
  const drawPlotContent = (dx: number, dy: number) => {
    pdf.setFillColor(26, 26, 46);
    pdf.rect(dx, dy, plotArea.w, plotArea.h, "F");
    if (backgroundImageDataUrl && backgroundImageDataUrl.length > 0) {
      try {
        const alpha = Math.max(0, Math.min(1, backgroundOpacity));
        const format = imageFormatFromDataUrl(backgroundImageDataUrl);
        const ib = imgBounds ?? bounds;
        const imgPdfX = dx + (ib.xMin - eMinX) * scaleX;
        const imgPdfY = dy + (ib.yMin - eMinY) * scaleY;
        const imgPdfW = (ib.xMax - ib.xMin) * scaleX;
        const imgPdfH = (ib.yMax - ib.yMin) * scaleY;
        pdf.saveGraphicsState();
        if (alpha < 1 && gStateClass) pdf.setGState(new gStateClass({ opacity: alpha }));
        pdf.addImage(backgroundImageDataUrl, format, imgPdfX, imgPdfY, imgPdfW, imgPdfH);
        pdf.restoreGraphicsState();
      } catch {
        // skip
      }
    }
  };

  const n = spots.length;
  if (n === 0) {
    if (plotFormKey) {
      pdf.beginFormObject(0, 0, plotArea.w * scaleFactor, plotArea.h * scaleFactor, unitMatrix);
      drawPlotContent(0, 0);
      pdf.setFontSize(7);
      pdf.setTextColor(128, 128, 128);
      pdf.text("No data", plotArea.w / 2 - 8, plotArea.h / 2);
      pdf.endFormObject(plotFormKey);
      pdf.doFormObject(plotFormKey, {
        toString: () => formPlaceMatrix(plotArea.x, plotArea.y, plotArea.w, plotArea.h, pageHeightMm, scaleFactor),
      });
    } else {
      drawPlotContent(plotArea.x, plotArea.y);
      pdf.setFontSize(7);
      pdf.setTextColor(128, 128, 128);
      pdf.text("No data", plotArea.x + plotArea.w / 2 - 8, plotArea.y + plotArea.h / 2);
    }
    return;
  }

  const spacingForRadius: number =
    typeof spotSpacingData === "number" && Number.isFinite(spotSpacingData) && spotSpacingData > 0
      ? spotSpacingData
      : gridSpacingFallback(bounds, n);
  const radiusData = (spacingForRadius / 2) * Math.max(0.2, Math.min(3, spotSizeScale));
  const scale = Math.min(scaleX, scaleY);
  const radiusMm = Math.max(0.05, radiusData * scale);
  const step = n > maxPoints ? Math.ceil(n / maxPoints) : 1;
  const spotAlpha = Math.max(0, Math.min(1, spotOpacity));

  const drawSpots = (dx: number, dy: number) => {
    pdf.saveGraphicsState();
    if (spotAlpha < 1 && gStateClass) pdf.setGState(new gStateClass({ opacity: spotAlpha }));
    if (layout === "grid") {
      let maxK = 0;
      for (let k = 0; k < n; k++) {
        const visible = spots[k].segments.filter((s) => s.proportion >= MIN_PROPORTION_GRID);
        if (visible.length > maxK) maxK = visible.length;
      }
      const r = radiusMm;
      const radiusPolygon = r * 0.7;
      let squareSide = 0;
      if (maxK === 1) {
        squareSide = r * 2 * 0.5;
      } else if (maxK > 1) {
        squareSide = 2 * radiusPolygon * Math.sin(Math.PI / maxK) * 1.1;
      }
      if (squareSide > 0) {
        const startAngle = -Math.PI / 2;
        for (let k = 0; k < n; k += step) {
          const spot = spots[k];
          const cx = dx + (spot.x - eMinX) * scaleX;
          const cy = dy + (spot.y - eMinY) * scaleY;
          const visible = spot.segments.filter((s) => s.proportion >= MIN_PROPORTION_GRID);
          const K = visible.length;
          if (K === 0) continue;
          for (let idx = K - 1; idx >= 0; idx--) {
            const seg = visible[idx];
            const angle = K === 1 ? 0 : startAngle + (2 * Math.PI * idx) / K;
            const centerX = K === 1 ? cx : cx + radiusPolygon * Math.cos(angle);
            const centerY = K === 1 ? cy : cy + radiusPolygon * Math.sin(angle);
            const [rCol, gCol, bCol] = hexToRgb(seg.color);
            pdf.setFillColor(rCol, gCol, bCol);
            pdf.rect(centerX - squareSide / 2, centerY - squareSide / 2, squareSide, squareSide, "F");
          }
        }
      }
    } else {
      const startAngle0 = -Math.PI / 2;
      for (let k = 0; k < n; k += step) {
        const spot = spots[k];
        const cx = dx + (spot.x - eMinX) * scaleX;
        const cy = dy + (spot.y - eMinY) * scaleY;
        let angle = startAngle0;
        for (const seg of spot.segments) {
          if (seg.proportion <= 0) continue;
          const span = seg.proportion * Math.PI * 2;
          const endAngle = angle + span;
          const numSamples = Math.max(2, Math.ceil((WEDGE_ARC_SAMPLES * span) / (Math.PI * 2)));
          const points: [number, number][] = [[cx, cy]];
          for (let i = 0; i <= numSamples; i++) {
            const a = angle + (span * i) / numSamples;
            points.push([cx + radiusMm * Math.cos(a), cy - radiusMm * Math.sin(a)]);
          }
          const [rCol, gCol, bCol] = hexToRgb(seg.color);
          pdf.setFillColor(rCol, gCol, bCol);
          for (let i = 1; i < points.length - 1; i++) {
            pdf.triangle(
              points[0][0],
              points[0][1],
              points[i][0],
              points[i][1],
              points[i + 1][0],
              points[i + 1][1],
              "F"
            );
          }
          angle = endAngle;
        }
      }
    }
    pdf.restoreGraphicsState();
  };

  if (plotFormKey) {
    pdf.beginFormObject(0, 0, plotArea.w * scaleFactor, plotArea.h * scaleFactor, unitMatrix);
    drawPlotContent(0, 0);
    drawSpots(0, 0);
    pdf.endFormObject(plotFormKey);
    pdf.doFormObject(plotFormKey, {
      toString: () => formPlaceMatrix(plotArea.x, plotArea.y, plotArea.w, plotArea.h, pageHeightMm, scaleFactor),
    });
  } else {
    drawPlotContent(plotArea.x, plotArea.y);
    drawSpots(plotArea.x, plotArea.y);
  }

  // MultiFeature legend: bottom-right, compact (narrow gradient bar + "name vmin–vmax"), with background box.
  // When legendFormKey is set, draw into a Form XObject so the whole block is one group in Illustrator.
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
    const pad = 2;
    const boxPad = PDF_LEGEND_PAD_MM;
    const gap = 1.0;
    const rowH = 2.4;
    const swW = 6;
    const swH = 1.5;
    const textW = 14;
    const boxW = boxPad + swW + gap + textW + boxPad;
    const boxH = boxPad * 2 + layers.length * rowH;
    const panelLegend = panelRect ?? plotArea;
    const boxX = panelLegend.x + panelLegend.w - pad - boxW;
    const boxY = panelLegend.y + panelLegend.h - pad - boxH;

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
        const lowHex = "#000000";
        const highHex = MULTI_FEATURE_PALETTE_ACCENT[layer.paletteId] ?? "#ffff00";
        const [r0, g0, b0] = hexToRgb(lowHex);
        const [r1, g1, b1] = hexToRgb(highHex);
        const steps = 12;
        for (let s = 0; s < steps; s++) {
          const t = steps <= 1 ? 1 : s / (steps - 1);
          const rr = Math.round(r0 + (r1 - r0) * t);
          const gg = Math.round(g0 + (g1 - g0) * t);
          const bb = Math.round(b0 + (b1 - b0) * t);
          pdf.setFillColor(rr, gg, bb);
          pdf.rect(swX + (swW * s) / steps, swY, swW / steps, swH, "F");
        }
        pdf.setDrawColor(51, 51, 51);
        pdf.rect(swX, swY, swW, swH, "S");
        const label = `${layer.name} ${formatExpr(layer.vmin)}–${formatExpr(layer.vmax)}`;
        pdf.text(truncateText(label, 28), swX + swW + gap, centerY + 0.4);
      }
    });
  } else if (legend.length > 0) {
    const slice = legend.slice(0, 24);
    const contentW = PDF_LEGEND_COLS * PDF_LEGEND_COL_WIDTH_MM;
    const contentH = Math.ceil(slice.length / PDF_LEGEND_COLS) * PDF_LEGEND_ROW_HEIGHT_MM;
    const boxW = contentW + 2 * PDF_LEGEND_PAD_MM;
    const boxH = contentH + 2 * PDF_LEGEND_PAD_MM;
    const pad = 2;
    const panelLegend = panelRect ?? plotArea;
    const boxLeft = panelLegend.x + panelLegend.w - pad - boxW;
    const boxTop = panelLegend.y + panelLegend.h - pad - boxH;
    drawLegendInForm(boxLeft, boxTop, boxW, boxH, (dx, dy) => {
      const contentX = dx + PDF_LEGEND_PAD_MM;
      const contentY = dy + PDF_LEGEND_PAD_MM;
      pdf.setFillColor(...PDF_LEGEND_BG_RGB);
      pdf.rect(dx, dy, boxW, boxH, "F");
      pdf.setDrawColor(...PDF_LEGEND_BORDER_RGB);
      pdf.setLineWidth(0.2);
      pdf.rect(dx, dy, boxW, boxH, "S");
      pdf.setFontSize(5);
      pdf.setTextColor(200, 200, 200);
      slice.forEach((e, i) => {
        const col = i % PDF_LEGEND_COLS;
        const row = Math.floor(i / PDF_LEGEND_COLS);
        const lx = contentX + col * PDF_LEGEND_COL_WIDTH_MM;
        const ly = contentY + row * PDF_LEGEND_ROW_HEIGHT_MM;
        const [r, g, b] = hexToRgb(e.color);
        pdf.setFillColor(r, g, b);
        pdf.rect(lx, ly - 1.2, 1.2, 1.2, "F");
        pdf.text(truncateText(e.label, 12), lx + 1.8, ly);
      });
    });
  }
}
