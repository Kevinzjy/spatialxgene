/**
 * Theme color values (mirror of CSS variables in index.html).
 * Use for JS contexts (e.g. PDF export) where var() is not available.
 * In React inline styles, prefer var(--sidebar-bg) etc. for theming.
 */
export const THEME = {
  sidebarBg: "#16213e",
  sidebarBorder: "#0f3460",
  bgMain: "#1a1a2e",
  accent: "#e94560",
  textPrimary: "#eee",
  textSecondary: "#a0a0a0",
  textMuted: "#888",
  error: "#ff8888",
  errorBg: "#4a0a0a",
} as const;
