import type { ProfileResponse } from "@tokenaires/contracts";
import { ShieldWarningIcon } from "@solar-icons/react/linear";
import { TierBadge } from "@/components/brand/tier-badge";
import { Avatar } from "@/components/ui/avatar";
import { formatDate, formatRelative, githubUrl } from "@/lib/format";
import { BadgeButton } from "./badge-button";
import { ShareButton } from "./share-button";

export function ProfileHeader({ profile }: { profile: ProfileResponse }) {
  const name = profile.user.name ?? profile.user.handle;
  return (
    <header className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-4">
        <Avatar src={profile.user.avatarUrl} name={name} size={64} priority className="ring-2 ring-accent/50" />
        <div className="min-w-0">
          <h1 className="truncate text-[28px] font-medium leading-tight tracking-[-0.035em] sm:text-[32px]">{name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-t3">
            <a href={githubUrl(profile.user.handle)} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
              @{profile.user.handle}
            </a>
            <TierBadge tier={profile.tier} />
            <span className="text-xs text-t4">
              Joined {formatDate(profile.joinedAt)}
              {profile.lastSyncedAt && <> · Synced {formatRelative(profile.lastSyncedAt)}</>}
            </span>
          </div>
        </div>
      </div>
      <div className="flex flex-col items-start gap-2 sm:items-end">
        <div className="flex flex-wrap items-center gap-2">
          <ShareButton handle={profile.user.handle} />
          <BadgeButton handle={profile.user.handle} />
        </div>
        {profile.status === "review" && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--warn)/0.12)] px-3 py-1 text-xs font-medium text-warn">
            <ShieldWarningIcon className="size-3.5" aria-hidden="true" />
            Under review for unusual activity
          </span>
        )}
      </div>
    </header>
  );
}
