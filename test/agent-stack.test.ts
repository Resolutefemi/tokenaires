import type { AgentSource } from "@tokenaires/contracts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgentStack } from "@/components/brand/agent-stack";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ROW_TOOLS_MAX } from "@/components/board/row-grid";

const SIX: AgentSource[] = ["gemini-cli", "claude-code", "copilot-cli", "antigravity", "kimi-code", "opencode"];

function render(sources: AgentSource[], max?: number): string {
  return renderToStaticMarkup(createElement(TooltipProvider, null, createElement(AgentStack, { sources, max, size: "sm" })));
}

describe("agent stack", () => {
  it("caps row icons and shows how many more tools there are", () => {
    const html = render(SIX, ROW_TOOLS_MAX);
    expect(html.match(/rounded-full border border-line-strong/g)).toHaveLength(ROW_TOOLS_MAX + 1);
    expect(html).toContain(">+3<");
    expect(html).toContain('aria-label="Tools: Gemini CLI, Claude Code, Copilot CLI, Antigravity, Kimi Code, and OpenCode"');
  });

  it("shows every tool without a counter when they fit", () => {
    const html = render(SIX.slice(0, 2), ROW_TOOLS_MAX);
    expect(html.match(/rounded-full border border-line-strong/g)).toHaveLength(2);
    expect(html).not.toContain(">+");
  });
});
