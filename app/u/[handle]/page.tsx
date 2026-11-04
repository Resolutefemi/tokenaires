import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ActivityHeatmap } from "@/components/profile/activity-heatmap";
import { NetWorth } from "@/components/profile/net-worth";
import { ProfileHeader } from "@/components/profile/profile-header";
import { ProfileSkeleton } from "@/components/profile/profile-skeleton";
import { UsageSplit } from "@/components/profile/usage-split";
import { getCachedProfile } from "@/lib/data/profile";
import { formatCompact } from "@/lib/format";

type ProfilePageProps = PageProps<"/u/[handle]">;

export async function generateMetadata({ params }: ProfilePageProps): Promise<Metadata> {
  const { handle } = await params;
  const profile = await getCachedProfile(handle);
  if (!profile) return { title: "Not on the list" };
  const name = profile.user.name ?? profile.user.handle;
  return {
    title: `${name} (@${profile.user.handle})`,
    description: `${name} has burned ${formatCompact(profile.totals.total)} AI tokens.`,
  };
}

async function Profile({ params }: Pick<ProfilePageProps, "params">) {
  const { handle } = await params;
  await connection();
  const profile = await getCachedProfile(handle);
  if (!profile) notFound();
  return (
    <>
      <ProfileHeader profile={profile} />
      <NetWorth profile={profile} />
      <ActivityHeatmap daily={profile.daily} streakDays={profile.streakDays} activeDays={profile.activeDays} />
      <UsageSplit profile={profile} />
    </>
  );
}

export default function ProfilePage({ params }: ProfilePageProps) {
  return (
    <div data-profile-page="" className="page max-w-3xl pt-12 sm:pt-16">
      <Suspense fallback={<ProfileSkeleton />}>
        <Profile params={params} />
      </Suspense>
    </div>
  );
}
