import { BADGE_CACHE_SECONDS, renderBadge, renderBadgeMessage } from "@/lib/badge";
import { getCachedProfile } from "@/lib/data/profile";

type RouteContext = { params: Promise<{ handle: string }> };

const FAILURE_CACHE_SECONDS = 30;

function headers(maxAge: number) {
  return {
    "content-type": "image/svg+xml; charset=utf-8",
    "cache-control": `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=86400`,
    "x-content-type-options": "nosniff",
  };
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { handle } = await params;
  try {
    const profile = await getCachedProfile(handle);
    const svg = profile
      ? renderBadge({ tier: profile.tier, tokens: profile.totals.total })
      : renderBadgeMessage("not on the list");
    return new Response(svg, { headers: headers(profile ? BADGE_CACHE_SECONDS : FAILURE_CACHE_SECONDS) });
  } catch (error) {
    console.error(`[badge] could not load @${handle}`, error);
    return new Response(renderBadgeMessage("stats unavailable"), { headers: headers(FAILURE_CACHE_SECONDS) });
  }
}
