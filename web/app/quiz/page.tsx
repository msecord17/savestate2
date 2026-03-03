"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Search, X } from "lucide-react";
import { PageShell } from "@/src/ui/PageShell";
import { ORIGIN_BUCKET_ORDER, ORIGIN_BUCKET_META } from "@/lib/identity/era";
import { originBucketFromYear } from "@/lib/identity/era";
import { resolveCoverUrl } from "@/lib/images/resolveCoverUrl";

type QuizGame = {
  game_id: string;
  release_id?: string;
  title: string;
  cover_url: string | null;
  year?: number | null;
  first_release_year?: number | null;
  platform_key?: string | null;
  era_key?: string;
  intensity?: "dabble" | "regular" | "obsessed";
};

const ERA_OPTIONS = ORIGIN_BUCKET_ORDER.filter((k) => k !== "unknown").map(
  (key) => ({
    key,
    label: ORIGIN_BUCKET_META[key]?.title ?? key,
  })
);

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const gold = "#F2C14E";

const goldBtn =
  "inline-flex items-center justify-center h-12 px-7 rounded-[var(--radius-xl)] bg-[#F2C14E] text-black font-semibold hover:bg-[#F2C14E]/90 active:scale-[0.99] transition";
const whiteBtn =
  "inline-flex items-center justify-center h-12 px-7 rounded-[var(--radius-xl)] bg-white text-black font-semibold hover:bg-white/90 active:scale-[0.99] transition";
const chip =
  "inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-4 py-2 text-sm text-foreground/90 hover:bg-card/70 transition";
const chipActive =
  "inline-flex items-center gap-2 rounded-full border border-[#F2C14E]/40 bg-[#F2C14E]/10 px-4 py-2 text-sm text-[#F2C14E] hover:bg-[#F2C14E]/15 transition";

function QuizShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      {/* ambient glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-48 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[#F2C14E]/10 blur-3xl" />
        <div className="absolute -top-24 left-1/4 h-[420px] w-[620px] rounded-full bg-indigo-500/10 blur-3xl" />
      </div>
      <div className="relative mx-auto max-w-[1240px] px-6 py-12">{children}</div>
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={[
        "relative overflow-hidden rounded-[var(--radius-xl)] border border-border bg-card/60 backdrop-blur",
        "shadow-[0_20px_80px_rgba(0,0,0,0.45)]",
        "before:absolute before:inset-0 before:pointer-events-none before:content-['']",
        "before:bg-[linear-gradient(to_bottom,rgba(255,255,255,0.06),transparent_40%)]",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

function StepHeader({
  step,
  title,
  subtitle,
}: {
  step: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="text-center">
      <div className="text-xs tracking-[0.25em] text-muted-foreground uppercase">{step}</div>
      <h1 className="mt-3 text-4xl md:text-5xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-4 text-lg text-muted-foreground max-w-3xl mx-auto">{subtitle}</p>
    </div>
  );
}

function GameTile({
  title,
  year,
  coverUrl,
  selected,
  onClick,
}: {
  title: string;
  year?: number | null;
  coverUrl: string | null;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "group relative aspect-[4/5] w-full overflow-hidden rounded-[var(--radius-xl)] border",
        selected ? "border-[#F2C14E] shadow-[0_0_0_2px_rgba(242,193,78,0.35)]" : "border-border",
        "bg-card/40 hover:bg-card/60 transition",
      ].join(" ")}
    >
      {coverUrl ? (
        <img src={coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-black/20" />
      )}

      {/* bottom fade */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

      {/* check */}
      <div className="absolute right-3 top-3">
        <div
          className={[
            "h-8 w-8 rounded-full flex items-center justify-center border",
            selected ? "bg-[#F2C14E] border-[#F2C14E]" : "bg-black/40 border-white/20",
          ].join(" ")}
        >
          {selected ? <Check className="h-4 w-4 text-black" /> : null}
        </div>
      </div>

      <div className="absolute left-4 right-4 bottom-4 text-left">
        <div className="text-base font-semibold leading-tight line-clamp-2">{title}</div>
        {year ? <div className="mt-1 text-sm text-white/70">{year}</div> : null}
      </div>
    </button>
  );
}

function ProgressRow({
  label,
  pct,
  right,
}: {
  label: string;
  pct: number;
  right: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="text-foreground/90">{label}</div>
        <div className="text-muted-foreground">{right}</div>
      </div>
      <div className="h-2 rounded-full bg-black/20 border border-border overflow-hidden">
        <div className="h-full bg-[#F2C14E]" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      </div>
    </div>
  );
}

function IntensityButtons({
  value,
  onChange,
}: {
  value: "dabbled" | "regular" | "obsessed";
  onChange: (v: "dabbled" | "regular" | "obsessed") => void;
}) {
  const btn = (k: "dabbled" | "regular" | "obsessed", label: string) => (
    <button
      type="button"
      onClick={() => onChange(k)}
      className={[
        "h-11 px-5 rounded-[var(--radius-lg)] border text-sm font-semibold transition",
        value === k
          ? "border-[#F2C14E]/50 bg-[#F2C14E]/10 text-[#F2C14E]"
          : "border-border bg-card/40 text-foreground/80 hover:bg-card/60",
      ].join(" ")}
    >
      {label}
    </button>
  );

  return (
    <div className="mt-4 flex gap-3 justify-center">
      {btn("obsessed", "Obsessed")}
      {btn("regular", "Regular")}
      {btn("dabbled", "Dabbled")}
    </div>
  );
}

export default function QuizPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [search, setSearch] = useState("");
  const [eraFilter, setEraFilter] = useState("all");
  const [games, setGames] = useState<QuizGame[]>([]);
  const [selected, setSelected] = useState<QuizGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{
    era_distribution: Array<{ era_key: string; label: string; years: string; count: number }>;
    preview_score?: number;
    games_count?: number;
  } | null>(null);
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [quizSessionId, setQuizSessionId] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [coreMemoryIds, setCoreMemoryIds] = useState<string[]>([]);

  const gid = (g: any) => String(g.release_id ?? g.game_id ?? g.id ?? g.title);
  const debouncedSearch = useDebouncedValue(search, 300);

  useEffect(() => {
    if (step !== 2) return;
    if (coreMemoryIds.length) return;
    const ids = selected.slice(0, 2).map(gid);
    setCoreMemoryIds(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    fetch("/api/users/me")
      .then((r) => r.json())
      .then((d) => setIsLoggedIn(!!(d?.ok && d?.user)))
      .catch(() => setIsLoggedIn(false));
  }, []);

  const fetchGames = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("q", debouncedSearch);
      if (eraFilter !== "all") params.set("era", eraFilter);
      const res = await fetch(`/api/quiz/games?${params}`);
      const data = await res.json();
      const raw = data?.items ?? [];
      setGames(
        raw.map((r: any) => ({
          ...r,
          first_release_year: r.year ?? r.first_release_year,
          era_key: r.era_key ?? originBucketFromYear(r.year ?? r.first_release_year),
        }))
      );
    } catch {
      setGames([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, eraFilter]);

  useEffect(() => {
    fetchGames();
  }, [fetchGames]);

  function toggleGame(g: QuizGame) {
    setSelected((prev) => {
      const exists = prev.some((x) => gid(x) === gid(g));
      if (exists) return prev.filter((x) => gid(x) !== gid(g));
      if (prev.length >= 8) return prev;
      return [...prev, { ...g, intensity: "regular" as const }];
    });
  }

  function setIntensity(gameId: string, intensity: "dabble" | "regular" | "obsessed") {
    setSelected((prev) =>
      prev.map((g) =>
        g.game_id === gameId ? { ...g, intensity } : g
      )
    );
  }

  async function runPreview() {
    if (selected.length === 0) return;
    try {
      const res = await fetch("/api/quiz/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: selected.map((g) => ({
            game_id: g.game_id,
            release_id: g.release_id,
            year: g.year ?? g.first_release_year,
            intensity: g.intensity ?? "regular",
          })),
        }),
      });
      const data = await res.json();
      if (data?.ok) {
        setPreview({
          era_distribution: (data.era_distribution ?? []).map((b: any) => ({
            era_key: b.key,
            label: ORIGIN_BUCKET_META[b.key]?.title ?? b.key,
            years: ORIGIN_BUCKET_META[b.key]?.sub ?? "",
            count: b.count,
          })),
          games_count: data.total,
        });
      }
    } catch {
      setPreview(null);
    }
  }

  async function submitQuiz(intent: "create_account" | "connect_platforms"): Promise<boolean> {
    setSubmitting(true);
    try {
      const res = await fetch("/api/quiz/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent,
          games: selected.map((g) => ({
            game_id: g.game_id,
            release_id: g.release_id,
            title: g.title,
            first_release_year: g.year ?? g.first_release_year,
            year: g.year ?? g.first_release_year,
            intensity: g.intensity ?? "regular",
          })),
        }),
      });
      const data = await res.json();
      if (data?.ok && data?.quiz_session_id) setQuizSessionId(data.quiz_session_id);
      if (data?.ok && data?.redirect) router.push(data.redirect);
      return !!data?.ok;
    } finally {
      setSubmitting(false);
    }
  }

  const filteredGames = games;

  return (
    <>
      {step === 1 && (
        <QuizShell>
          <StepHeader
            step="STEP 1 OF 3"
            title="What games defined you?"
            subtitle="Pick up to 8 games that left a mark. The ones you remember, the ones that mattered."
          />

          {/* selected chips */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {selected.map((g) => (
              <button
                key={gid(g)}
                type="button"
                onClick={() => toggleGame(g)}
                className={chip}
                title="Remove"
              >
                <span className="truncate max-w-[180px]">{g.title}</span>
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
            <div className="text-sm text-muted-foreground ml-3">
              {selected.length} / 8 selected
            </div>
          </div>

          {/* search */}
          <div className="mt-8 flex justify-center">
            <div className="w-full max-w-2xl">
              <div className="flex items-center gap-3 rounded-[var(--radius-xl)] border border-border bg-card/50 px-4 py-3">
                <Search className="h-5 w-5 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search games..."
                  className="w-full bg-transparent outline-none text-base"
                />
              </div>
            </div>
          </div>

          {/* era filters */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {[{ key: "all", label: "All Eras" }, ...ERA_OPTIONS].map((b) => (
              <button
                key={b.key}
                type="button"
                onClick={() => setEraFilter(b.key)}
                className={eraFilter === b.key ? chipActive : chip}
              >
                {b.label}
              </button>
            ))}
          </div>

          {/* grid */}
          <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-5">
            {loading ? (
              <div className="col-span-full py-12 text-center text-muted-foreground">Loading…</div>
            ) : (
              filteredGames.map((g) => {
                const isSel = selected.some((s) => gid(s) === gid(g));
                return (
                  <GameTile
                    key={gid(g)}
                    title={g.title}
                    year={g.year ?? g.first_release_year ?? null}
                    coverUrl={resolveCoverUrl({ cover_url: g.cover_url, game_cover_url: g.cover_url }) || null}
                    selected={isSel}
                    onClick={() => toggleGame(g)}
                  />
                );
              })
            )}
          </div>

          {/* next */}
          <div className="mt-10 flex justify-center">
            <button
              type="button"
              disabled={selected.length === 0}
              onClick={() => {
                runPreview();
                setStep(2);
              }}
              className={[goldBtn, "disabled:opacity-50 disabled:pointer-events-none"].join(" ")}
            >
              Next →
            </button>
          </div>

          <div className="mt-8 text-center">
            <Link href="/onboarding" className="text-sm text-muted-foreground hover:underline">
              ← Back to onboarding
            </Link>
          </div>
        </QuizShell>
      )}

      {step === 2 && (
        <PageShell padding={24} maxWidth={720} className="min-h-screen" style={{ fontFamily: "var(--font-geist-sans, system-ui, sans-serif)" }}>
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-2xl font-extrabold text-foreground">Set your intensity</h1>
            <span className="text-sm text-muted-foreground">Step 2/3</span>
          </div>

        <>
          <p className="mb-4 text-sm text-muted-foreground">
            How much did each game mean to you?
          </p>

          <div className="space-y-4">
            {selected.map((g) => (
              <div
                key={g.game_id}
                className="flex items-center gap-4 rounded-xl border border-border bg-card p-4"
              >
                <div className="h-14 w-10 shrink-0 overflow-hidden rounded">
                  <img
                    src={resolveCoverUrl({ cover_url: g.cover_url }) || "/placeholders/platform/unknown.png"}
                    alt={g.title}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-foreground">{g.title}</div>
                  <div className="flex gap-2 mt-2">
                    {(["dabble", "regular", "obsessed"] as const).map((int) => (
                      <button
                        key={int}
                        type="button"
                        onClick={() => setIntensity(g.game_id, int)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors border-2 ${g.intensity === int ? "border-accent bg-accent/20 text-foreground" : "border-border bg-transparent text-foreground"}`}
                      >
                        {int === "dabble" && "Dabbled"}
                        {int === "regular" && "Regular"}
                        {int === "obsessed" && "Obsessed"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex justify-between">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-xl border border-border bg-card px-5 py-2.5 font-bold text-foreground"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={async () => {
                await runPreview();
                setStep(3);
              }}
              disabled={submitting}
              className="rounded-xl bg-accent px-5 py-2.5 font-bold text-accent-foreground disabled:opacity-50"
            >
              {submitting ? "Saving…" : "See my story →"}
            </button>
          </div>
        </>

      <div className="mt-8">
        <Link href="/onboarding" className="text-sm text-muted-foreground hover:underline">
          ← Back to onboarding
        </Link>
      </div>
    </PageShell>
      )}

      {step === 3 && (
        <QuizShell>
          <div className="text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#F2C14E]/30 bg-[#F2C14E]/10 px-4 py-2 text-sm text-[#F2C14E]">
              ✨ Your Gaming Story
            </div>
            <h1 className="mt-5 text-5xl font-semibold tracking-tight">Nostalgia Keeper</h1>
            <p className="mt-5 text-xl text-muted-foreground max-w-3xl mx-auto italic">
              &quot;You played {selected[0]?.title ?? "Super Mario Bros."} and played {selected[1]?.title ?? "The Legend of Zelda"}.
              These worlds shaped how you see games—not as products, but as places you&apos;ve been.&quot;
            </p>
          </div>

          {/* core memories */}
          <div className="mt-10 text-center text-xs tracking-[0.25em] uppercase text-muted-foreground">
            YOUR CORE MEMORIES
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            {coreMemoryIds.slice(0, 2).map((id, idx) => {
              const g = selected.find((x) => gid(x) === id);
              if (!g) return null;
              return (
                <Card key={id} className="p-0 overflow-hidden">
                  <div className="relative aspect-[16/9]">
                    <img
                      src={resolveCoverUrl({ cover_url: g.cover_url, game_cover_url: g.cover_url })}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                    <div className="absolute right-6 bottom-6 text-[#F2C14E] text-3xl font-semibold opacity-80">
                      #{idx + 1}
                    </div>
                    <div className="absolute left-6 bottom-6">
                      <div className="text-2xl font-semibold">{g.title}</div>
                      <div className="mt-1 text-sm text-white/70">
                        {(g.year ?? g.first_release_year) ? `${g.year ?? g.first_release_year}` : "—"} • Played
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* era distribution */}
          <Card className="mt-10 p-8">
            <div className="text-center text-xs tracking-[0.25em] uppercase text-muted-foreground">
              ERA DISTRIBUTION
            </div>

            <div className="mt-8 space-y-6">
              {(preview?.era_distribution ?? []).map((e) => {
                const total = (preview?.games_count ?? selected.length) || 1;
                const pct = Math.round((e.count / total) * 100);
                return (
                  <ProgressRow
                    key={e.era_key}
                    label={e.label}
                    pct={pct}
                    right={`${e.count} games • ${pct}%`}
                  />
                );
              })}
            </div>
          </Card>

          {/* CTA */}
          <div className="mt-10 flex flex-col items-center gap-4">
            <Link href="/onboarding/create-account" className={goldBtn}>
              Create Your GameHome →
            </Link>
            <Link href="/u/Claudius17" className="text-sm text-muted-foreground hover:underline">
              See example profile →
            </Link>
            <div className="mt-4 text-sm text-muted-foreground text-center max-w-2xl">
              Your selections help us understand your gaming journey. Create an account to unlock your full archetype,
              track your collection, and connect platforms.
            </div>
          </div>

          <div className="mt-8 text-center">
            <Link href="/onboarding" className="text-sm text-muted-foreground hover:underline">
              ← Back to onboarding
            </Link>
          </div>
        </QuizShell>
      )}
    </>
  );
}
