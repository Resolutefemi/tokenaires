import type { AgentSource } from "@tokenaires/contracts";
import { AGENT_SOURCE_LABELS } from "@tokenaires/contracts";
import type { CSSProperties } from "react";
import { SourceIcon } from "@/components/brand/source-icon";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function agentList(sources: AgentSource[]) {
  return new Intl.ListFormat("en", { type: "conjunction" }).format(
    sources.map((source) => AGENT_SOURCE_LABELS[source]),
  );
}

const STACK_SIZES = {
  md: { chip: "size-7 -ml-2 ring-2", extra: "h-7 min-w-7 -ml-2 ring-2 text-[10px]", icon: undefined },
  sm: { chip: "size-6 -ml-2 ring-2", extra: "h-6 min-w-6 -ml-2 ring-2 text-[10px]", icon: "size-3" },
} as const;

const FAN_PX = 4;

export function AgentStack({
  sources,
  max,
  size = "md",
  className,
}: {
  sources: AgentSource[];
  max?: number;
  size?: keyof typeof STACK_SIZES;
  className?: string;
}) {
  if (sources.length === 0) return null;
  const label = agentList(sources);
  const shown = max === undefined ? sources : sources.slice(0, max);
  const extra = sources.length - shown.length;
  const count = shown.length + (extra > 0 ? 1 : 0);
  const styles = STACK_SIZES[size];
  const fan = (index: number) =>
    ({ "--fan": `${(count - 1 - index) * -FAN_PX}px`, zIndex: count - index }) as CSSProperties;
  const motionClass =
    "transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:[transform:translateX(var(--fan))] group-hover/stack:[transform:translateX(var(--fan))] motion-reduce:transition-none";
  return (
    <Tooltip label={label}>
      <span role="img" aria-label={`Tools: ${label}`} className={cn("group/stack flex shrink-0 items-center", className)}>
        {shown.map((source, index) => (
          <span
            key={source}
            aria-hidden="true"
            style={fan(index)}
            className={cn("relative flex items-center justify-center rounded-full border border-line-strong bg-panel ring-panel-raised first:ml-0", styles.chip, motionClass)}
          >
            <SourceIcon source={source} className={styles.icon} />
          </span>
        ))}
        {extra > 0 && (
          <span
            aria-hidden="true"
            style={fan(shown.length)}
            className={cn("relative flex items-center justify-center rounded-full border border-line-strong bg-panel px-1 font-medium text-t3 ring-panel-raised tabular", styles.extra, motionClass)}
          >
            +{extra}
          </span>
        )}
      </span>
    </Tooltip>
  );
}

export function AgentStackCompact({ sources, max = 3, className }: { sources: AgentSource[]; max?: number; className?: string }) {
  if (sources.length === 0) return null;
  const shown = sources.slice(0, max);
  const extra = sources.length - shown.length;
  return (
    <span aria-hidden="true" className={cn("flex shrink-0 items-center", className)}>
      {shown.map((source, index) => (
        <span
          key={source}
          style={{ zIndex: shown.length - index }}
          className="relative -ml-1.5 flex size-5 items-center justify-center rounded-full border border-line-strong bg-panel ring-[1.5px] ring-panel-raised first:ml-0"
        >
          <SourceIcon source={source} className="size-3" />
        </span>
      ))}
      {extra > 0 && (
        <span className="relative -ml-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border border-line-strong bg-panel px-1 text-[9px] font-medium text-t3 ring-[1.5px] ring-panel-raised tabular">
          +{extra}
        </span>
      )}
    </span>
  );
}
