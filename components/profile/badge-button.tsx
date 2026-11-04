"use client";

import { CheckReadIcon, CodeIcon } from "@solar-icons/react/linear";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/hooks/use-copy";
import { SITE } from "@/lib/constants";

export function BadgeButton({ handle, className }: { handle: string; className?: string }) {
  const { copied, copy } = useCopy();

  const share = async () => {
    const profileUrl = `${SITE.url}/u/${handle}`;
    const snippet = `[![Tokenaires badge](${profileUrl}/badge.svg)](${profileUrl})`;
    if (await copy(snippet)) {
      toast.success("README badge copied", {
        description: "Paste it into your GitHub profile README. It updates automatically.",
      });
    }
  };

  return (
    <Button size="sm" variant="ghost" className={className} onClick={() => void share()}>
      {copied ? (
        <CheckReadIcon className="size-3.5 text-accent" aria-hidden="true" />
      ) : (
        <CodeIcon className="size-3.5" aria-hidden="true" />
      )}
      {copied ? "Badge copied" : "README badge"}
    </Button>
  );
}
