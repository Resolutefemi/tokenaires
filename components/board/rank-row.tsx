"use client";

import type { BoardEntry } from "@tokenaires/contracts";
import { motion } from "motion/react";
import { ShieldWarningIcon } from "@solar-icons/react/linear";
import Link from "next/link";
import { AgentStack, AgentStackCompact, agentList } from "@/components/brand/agent-stack";
import { TierBadge } from "@/components/brand/tier-badge";
import { Avatar } from "@/components/ui/avatar";
import { Tooltip } from "@/components/ui/tooltip";
import { formatCompact, formatFull } from "@/lib/format";
import { Movement } from "./movement";
import { ROW_GRID, ROW_STAGGER_CAP_S, ROW_STAGGER_S, ROW_TOOLS_MAX } from "./row-grid";
import { ShareBar } from "./share-bar";


export function RankHeader() {
  return (
    <div className={`${ROW_GRID} label px-3 pb-2`} aria-hidden="true">
      <span>Rank</span>
      <span>Developer</span>
      <span className="hidden md:block">Tools</span>
      <span className="hidden md:block">Tier</span>
      <span className="hidden md:block">Vs No. 1</span>
      <span className="text-right">Net worth</span>
    </div>
  );
}

interface RankRowProps {
  entry: BoardEntry;
  leader: number;
  showMovement: boolean;
  index: number;
}

export function RankRow({ entry, leader, showMovement, index }: RankRowProps) {
  const name = entry.user.name ?? entry.user.handle;
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{
        layout: { type: "spring", stiffness: 420, damping: 40 },
        opacity: { duration: 0.25, delay: Math.min(index * ROW_STAGGER_S, ROW_STAGGER_CAP_S) },
        y: { duration: 0.3, delay: Math.min(index * ROW_STAGGER_S, ROW_STAGGER_CAP_S) },
      }}
      className={`${ROW_GRID} rounded-[14px] px-3 transition-colors duration-150 hover:bg-foreground/[0.035]`}
    >
      <span className="flex items-baseline gap-1.5">
        <span className="text-sm font-medium text-t2 tabular">{entry.rank}</span>
        {showMovement && <Movement change={entry.change} className="text-[10px]" />}
      </span>
      <Link href={`/u/${entry.user.handle}`} className="group flex min-h-14 min-w-0 items-center gap-3 py-2">
        <Avatar src={entry.user.avatarUrl} name={name} size={32} />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium transition-colors group-hover:text-accent-text">{name}</span>
            {entry.status === "review" && (
              <Tooltip label="Under review for unusual activity">
                <span tabIndex={0} className="inline-flex shrink-0 rounded-full text-warn" aria-label="Under review">
                  <ShieldWarningIcon className="size-3.5" aria-hidden="true" />
                </span>
              </Tooltip>
            )}
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-t3">
            <span className="truncate">@{entry.user.handle}</span>
            <AgentStackCompact sources={entry.sources} className="md:hidden" />
            {entry.sources.length > 0 && <span className="sr-only md:hidden">, uses {agentList(entry.sources)}</span>}
          </span>
        </span>
      </Link>
      <span className="hidden min-w-0 items-center md:flex">
        <AgentStack sources={entry.sources} max={ROW_TOOLS_MAX} size="sm" />
      </span>
      <span className="hidden md:block">
        <TierBadge tier={entry.tier} />
      </span>
      <ShareBar tokens={entry.tokens} leader={leader} className="hidden md:block" />
      <span className="text-right text-sm font-medium tabular" title={`${formatFull(entry.tokens)} tokens`}>
        <span className="md:hidden">{formatCompact(entry.tokens)}</span>
        <span className="hidden md:inline">{formatFull(entry.tokens)}</span>
      </span>
    </motion.li>
  );
}
