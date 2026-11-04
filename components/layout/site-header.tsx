import Link from "next/link";
import { RiStarFill } from "react-icons/ri";
import { SiGithub } from "react-icons/si";
import { Wordmark } from "@/components/brand/wordmark";
import { JoinButton } from "@/components/layout/join-button";
import { SiteNav } from "@/components/layout/site-nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { SITE } from "@/lib/constants";
import { getRepoStarCount } from "@/lib/data/github";
import { formatCompact, formatFull } from "@/lib/format";

export async function SiteHeader() {
  const stars = await getRepoStarCount();
  const starLabel = stars === null ? "Star Tokenaires on GitHub" : `Star Tokenaires on GitHub, ${formatFull(stars)} stars`;
  return (
    <header className="sticky top-0 z-40 bg-background/75 backdrop-blur-xl">
      <div className="page grid h-16 grid-cols-[1fr_auto] items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
        <Link href="/" aria-label="Tokenaires home" className="justify-self-start rounded-full">
          <Wordmark />
        </Link>
        <div className="hidden md:block [body:has([data-profile-page])_&]:invisible">
          <SiteNav />
        </div>
        <div className="flex items-center gap-2 justify-self-end">
          <Button asChild variant="outline" size="sm" className="group gap-1.5 pl-3 pr-3.5">
            <a href={SITE.repoUrl} target="_blank" rel="noopener noreferrer" aria-label={starLabel}>
              <SiGithub className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="leading-none [text-box:trim-both_cap_alphabetic]">Star</span>
              <RiStarFill
                className="size-3.5 shrink-0 text-accent-text transition-transform duration-200 ease-out group-hover:rotate-[72deg] group-hover:scale-110 motion-reduce:transition-none motion-reduce:group-hover:transform-none"
                aria-hidden="true"
              />
              {stars !== null && (
                <>
                  <span className="mx-0.5 h-3.5 w-px shrink-0 bg-line-strong" aria-hidden="true" />
                  <span className="tabular-nums leading-none text-foreground [text-box:trim-both_cap_alphabetic]">
                    {formatCompact(stars)}
                  </span>
                </>
              )}
            </a>
          </Button>
          <ThemeToggle />
          <JoinButton className="hidden sm:inline-flex" />
        </div>
      </div>
      <div className="page flex justify-center pb-3 md:hidden [body:has([data-profile-page])_&]:hidden">
        <SiteNav />
      </div>
    </header>
  );
}
