import { Suspense } from "react";
import RetroAchievementsConnectClient from "./RetroAchievementsConnectClient";

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 24, color: "#6b7280" }}>Loading…</div>}>
      <RetroAchievementsConnectClient />
    </Suspense>
  );
}
