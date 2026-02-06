import { GlassCard } from "@/components/ui/glass-card";

type IdentitySignals = {
  owned_games?: number;
  owned_releases?: number;
  unique_platforms?: number;
  achievements_earned?: number;
  achievements_total?: number;
  minutes_played?: number;
  era_buckets?: Record<string, { games: number; releases: number }>;
};

type SharePayload = {
  username?: string | null;
  lifetime_score?: number | null;
  archetypes?: Array<{ key: string; label: string; strength: "emerging" | "strong" | "core"; score?: number }>;
  top_signals?: Array<{ key: string; label: string; value: string }>;
  identity_signals?: IdentitySignals;
};

function fmtInt(n?: number | null) {
  if (!n && n !== 0) return "—";
  return Intl.NumberFormat().format(n);
}

function pct(a?: number | null, b?: number | null) {
  if (!a || !b) return "—";
  return `${Math.round((a / b) * 100)}%`;
}

export default function IdentityShareCard({ data }: { data: SharePayload }) {
  const s = data.identity_signals || {};
  const topArchetypes = (data.archetypes || []).slice(0, 3);

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-[560px] px-4 py-10">
        <GlassCard className="rounded-3xl bg-white/[0.08] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs text-white/70">SaveState Identity</div>
              <div className="mt-1 text-xl font-semibold text-white">
                {data.username ? `@${data.username}` : "Gamer Profile"}
              </div>
            </div>

            <div className="text-right">
              <div className="text-xs text-white/70">Lifetime Score</div>
              <div className="mt-1 text-3xl font-semibold text-white">{fmtInt(data.lifetime_score ?? 0)}</div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3">
            <Stat label="Owned games" value={fmtInt(s.owned_games)} />
            <Stat label="Platforms" value={fmtInt(s.unique_platforms)} />
            <Stat label="Progress" value={pct(s.achievements_earned, s.achievements_total)} />
          </div>

          {topArchetypes.length > 0 && (
            <div className="mt-6">
              <div className="text-xs text-white/70">Top archetypes</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {topArchetypes.map((a) => (
                  <span
                    key={a.key}
                    className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-sm text-white/90"
                  >
                    {a.label}
                    <span className="ml-2 text-xs text-white/60">{a.strength}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {(data.top_signals?.length || 0) > 0 && (
            <div className="mt-6">
              <div className="text-xs text-white/70">Top signals</div>
              <div className="mt-2 space-y-2">
                {data.top_signals!.slice(0, 4).map((t) => (
                  <div key={t.key} className="flex items-center justify-between rounded-xl bg-black/20 px-3 py-2">
                    <div className="text-sm text-white/80">{t.label}</div>
                    <div className="text-sm font-semibold text-white">{t.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 flex items-center justify-between text-xs text-white/55">
            <div>Generated from synced platforms + library</div>
            <div className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-white/70">savestate</div>
          </div>
        </GlassCard>

        <div className="mt-4 text-center text-xs text-white/55">
          Public share link • no auth required
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="text-[11px] text-white/55">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}
