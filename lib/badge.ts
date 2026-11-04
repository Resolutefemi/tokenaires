import { TIERS, type TierId } from "@tokenaires/contracts";
import { formatCompact } from "@/lib/format";

export const BADGE_HEIGHT = 28;
export const BADGE_CACHE_SECONDS = 300;

const FONT_STACK =
  "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const FONT_SIZE = 11;

const COLORS = {
  background: "#09090b",
  foreground: "#f5f5f4",
  muted: "#a1a1aa",
  line: "rgba(255,255,255,0.14)",
  accent: "#bef264",
} as const;

const LABEL = "tokenaires";
const NARROW = new Set(["i", "l", "j", "t", "f", "r", "I", ".", ",", ":", ";", "|", "!", "·", "'", " "]);
const WIDE = new Set(["m", "w", "M", "W", "@", "%"]);

const PADDING = 10;
const MARK_SIZE = 16;
const MARK_GAP = 7;
const DIVIDER_GAP = 11;

export type BadgeData = {
  tier: TierId;
  tokens: number;
};

export function tierLabel(tier: TierId): string {
  return TIERS.find((entry) => entry.id === tier)?.label ?? tier;
}

export function badgeValue(data: BadgeData): string {
  return `${tierLabel(data.tier)} · ${formatCompact(data.tokens)} tokens`;
}

/**
 * Approximate the rendered width of a string without shipping a font.
 * Caps and digits are wider than lowercase, and the estimate only needs to
 * be generous enough to keep the text inside the badge.
 */
export function estimateTextWidth(text: string, fontSize = FONT_SIZE): number {
  let width = 0;
  for (const char of text) {
    if (NARROW.has(char)) width += fontSize * 0.34;
    else if (WIDE.has(char)) width += fontSize * 0.92;
    else if (char >= "0" && char <= "9") width += fontSize * 0.6;
    else if (char !== char.toLowerCase()) width += fontSize * 0.72;
    else width += fontSize * 0.56;
  }
  return Math.ceil(width);
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function renderBadge(data: BadgeData | null): string {
  if (data === null) return renderBadgeMessage("not on the list");
  const tier = tierLabel(data.tier);
  const rest = ` · ${formatCompact(data.tokens)} tokens`;
  const title = `Tokenaires: ${tier}, ${formatCompact(data.tokens)} tokens`;
  return renderSvg({
    title,
    valueTier: tier,
    valueRest: rest,
  });
}

export function renderBadgeMessage(message: string): string {
  return renderSvg({ title: `Tokenaires: ${message}`, valueRest: message });
}

function renderSvg({
  title,
  valueTier,
  valueRest,
}: {
  title: string;
  valueTier?: string;
  valueRest: string;
}): string {
  const labelWidth = estimateTextWidth(LABEL);
  const tierWidth = valueTier ? estimateTextWidth(valueTier) : 0;
  const restWidth = estimateTextWidth(valueRest);

  const labelX = PADDING + MARK_SIZE + MARK_GAP;
  const labelEnd = labelX + labelWidth;
  const dividerX = labelEnd + DIVIDER_GAP;
  const valueX = dividerX + DIVIDER_GAP;
  const width = Math.ceil(valueX + tierWidth + restWidth + PADDING + 1);

  const tierSpan = valueTier
    ? `<tspan fill="${COLORS.accent}" font-weight="600">${escapeXml(valueTier)}</tspan>`
    : "";

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${BADGE_HEIGHT}" viewBox="0 0 ${width} ${BADGE_HEIGHT}" role="img" aria-label="${escapeXml(title)}">`,
    `<title>${escapeXml(title)}</title>`,
    `<rect x="0.5" y="0.5" width="${width - 1}" height="${BADGE_HEIGHT - 1}" rx="6.5" fill="${COLORS.background}" stroke="${COLORS.line}"/>`,
    `<g transform="translate(${PADDING - 1} 5) scale(${MARK_SIZE / 384})"><path fill="${COLORS.accent}" d="M47 107.5H205V66.5H337V182.5H241V317.5H145V182.5H47Z"/></g>`,
    `<text x="${labelX}" y="18.2" fill="${COLORS.foreground}" font-family="${FONT_STACK}" font-size="${FONT_SIZE}" font-weight="600">${LABEL}</text>`,
    `<line x1="${dividerX}" y1="8" x2="${dividerX}" y2="20" stroke="${COLORS.line}"/>`,
    `<text x="${valueX}" y="18.2" fill="${COLORS.muted}" font-family="${FONT_STACK}" font-size="${FONT_SIZE}" font-weight="500">${tierSpan}${escapeXml(valueRest)}</text>`,
    `</svg>`,
  ].join("");
}
