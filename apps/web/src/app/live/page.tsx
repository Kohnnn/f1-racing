import { Suspense } from "react";
import { LiveRouteClient } from "@/components/live/live-route-client";

export default function LivePage() {
  return (
    <Suspense fallback={null}>
      <LiveRouteClient />
    </Suspense>
  );
}
