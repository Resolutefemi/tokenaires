import { describe, expect, it } from "vitest";
import { badgeValue, estimateTextWidth, renderBadge, renderBadgeMessage } from "@/lib/badge";

describe("badge", () => {
  it("labels the tier and compact token count", () => {
    expect(badgeValue({ tier: "billionaire", tokens: 58_895_833_059 })).toBe("Billionaire · 58.9B tokens");
    expect(badgeValue({ tier: "hopeful", tokens: 0 })).toBe("Hopeful · 0 tokens");
  });

  it("renders a live badge with the value and cache-safe markup", () => {
    const svg = renderBadge({ tier: "millionaire", tokens: 2_500_000 });
    expect(svg).toContain("<svg");
    expect(svg).toContain("Millionaire");
    expect(svg).toContain("2.5M tokens");
    expect(svg).toContain('role="img"');
    expect(svg).not.toContain("<image");
    expect(svg).not.toContain("href=");
  });

  it("renders a fallback instead of a broken image", () => {
    expect(renderBadge(null)).toContain("not on the list");
    expect(renderBadgeMessage("stats unavailable")).toContain("stats unavailable");
  });

  it("widens the estimate as the text grows", () => {
    expect(estimateTextWidth("Billionaire")).toBeGreaterThan(estimateTextWidth("Hopeful"));
    expect(estimateTextWidth("")).toBe(0);
  });
});
