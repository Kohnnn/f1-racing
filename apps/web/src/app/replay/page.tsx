import { ReplayLibrary } from "@/components/replay/replay-library";

export const metadata = {
  title: "Replay",
  description: "Discover and replay exported Formula 1 sessions with track map, leaderboard, and telemetry.",
};

export default async function ReplayIndexPage() {
  return <ReplayLibrary />;
}
