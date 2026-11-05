import type { AgentSource } from "@tokenaires/contracts";
import { AGENT_SOURCE_LABELS } from "@tokenaires/contracts";
import type { IconBaseProps, IconType } from "react-icons";
import { RiOpenaiFill } from "react-icons/ri";
import { SiClaude, SiCline, SiGithubcopilot, SiGoogle, SiGooglegemini, SiMoonshotai, SiOpencode, SiQwen } from "react-icons/si";
import { cn } from "@/lib/utils";

function lettermark(letter: string): IconType {
  function Lettermark({ className, ...props }: IconBaseProps) {
    return (
      <svg viewBox="0 0 16 16" fill="currentColor" className={className} {...props}>
        <rect x="0.5" y="0.5" width="15" height="15" rx="4" fill="none" stroke="currentColor" strokeWidth="1.25" />
        <text x="8" y="11.6" textAnchor="middle" fontSize="10" fontWeight="700" fontFamily="ui-sans-serif, system-ui, sans-serif">
          {letter}
        </text>
      </svg>
    );
  }
  return Lettermark;
}

const ICONS: Record<AgentSource, IconType> = {
  "claude-code": SiClaude,
  codex: RiOpenaiFill,
  "gemini-cli": SiGooglegemini,
  antigravity: SiGoogle,
  opencode: SiOpencode,
  "kimi-code": SiMoonshotai,
  "qwen-code": SiQwen,
  "copilot-cli": SiGithubcopilot,
  cline: SiCline,
  "roo-code": lettermark("R"),
  "kilo-code": lettermark("K"),
  zcode: lettermark("Z"),
};

const TINTS: Record<AgentSource, string> = {
  "claude-code": "text-claude",
  codex: "text-t2",
  "gemini-cli": "text-gemini",
  antigravity: "text-gemini",
  opencode: "text-t2",
  "kimi-code": "text-t2",
  "qwen-code": "text-qwen",
  "copilot-cli": "text-t2",
  cline: "text-t2",
  "roo-code": "text-t2",
  "kilo-code": "text-t2",
  zcode: "text-t2",
};

export function SourceIcon({ source, className }: { source: AgentSource; className?: string }) {
  const Icon = ICONS[source];
  return <Icon className={cn("size-3.5 shrink-0", TINTS[source], className)} aria-label={AGENT_SOURCE_LABELS[source]} role="img" />;
}
