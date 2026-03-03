import Link from "next/link";

export const dynamic = "force-static";

const goldBtn =
  "inline-flex items-center justify-center h-12 px-7 rounded-[var(--radius-xl)] bg-[#F2C14E] text-black font-semibold hover:bg-[#F2C14E]/90 active:scale-[0.99] transition";
const ghostBtn =
  "inline-flex items-center justify-center h-12 px-7 rounded-[var(--radius-xl)] border border-border bg-card/30 text-foreground font-semibold hover:bg-card/50 active:scale-[0.99] transition";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={[
        "relative overflow-hidden rounded-[var(--radius-xl)] border border-border bg-card/60 backdrop-blur",
        "shadow-[0_20px_80px_rgba(0,0,0,0.45)]",
        "before:absolute before:inset-0 before:pointer-events-none",
        "before:bg-[linear-gradient(to_bottom,rgba(255,255,255,0.06),transparent_40%)]",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs tracking-[0.25em] text-muted-foreground uppercase">
      {children}
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      {/* ambient glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-48 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[#F2C14E]/10 blur-3xl" />
        <div className="absolute -top-24 left-1/4 h-[420px] w-[620px] rounded-full bg-indigo-500/10 blur-3xl" />
      </div>

      {/* top nav */}
      <div className="relative mx-auto max-w-[1240px] px-6 pt-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-[#F2C14E] text-black font-bold flex items-center justify-center">
              G
            </div>
            <div className="text-base font-semibold">GameHome</div>
          </div>

          <div className="flex items-center gap-6">
            <Link href="/login" className="text-sm text-foreground/80 hover:text-foreground transition">
              Login
            </Link>
            <Link href="/onboarding" className="text-sm font-semibold px-4 py-2 rounded-xl bg-white text-black hover:bg-white/90 transition">
              Get Started
            </Link>
          </div>
        </div>
      </div>

      {/* hero */}
      <div className="relative mx-auto max-w-[1240px] px-6 pt-14 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
          <div className="pt-4">
            <div className="text-xs text-muted-foreground uppercase tracking-[0.25em]">
              IT&apos;S DANGEROUS TO GO ALONE. <span className="text-[#F2C14E]">🗡</span>
            </div>

            <h1 className="mt-5 text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05]">
              Bring your entire
              <br />
              gaming life with you.
            </h1>

            <p className="mt-6 text-lg text-muted-foreground max-w-xl">
              GameHome tracks your journey across platforms, across eras, across your lifetime.
            </p>

            <div className="mt-10 flex items-center gap-4">
              <Link href="/onboarding" className={goldBtn}>
                Get Started
              </Link>
              <a href="#how" className="text-sm font-semibold text-foreground/90 hover:underline underline-offset-4">
                See How It Works →
              </a>
            </div>
          </div>

          {/* identity preview card */}
          <Card className="p-8">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-[var(--radius-xl)] bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center">
                <span className="text-emerald-300 text-lg">⟡</span>
              </div>
              <div className="min-w-0">
                <div className="text-xl font-semibold">The Explorer</div>
                <div className="mt-1 text-sm text-muted-foreground">Your Identity</div>
              </div>
            </div>

            <div className="mt-6 text-xl font-semibold">
              127 games across 5 platforms
            </div>

            <div className="mt-4 space-y-2 text-sm text-muted-foreground">
              <div>Era pull: PS2 Renaissance</div>
              <div>Core memory: Persona 4 Golden</div>
            </div>

            <div className="mt-7 flex items-center justify-center gap-2">
              <span className="h-1.5 w-6 rounded-full bg-[#F2C14E]" />
              <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
              <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
              <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
            </div>
          </Card>
        </div>
      </div>

      {/* everything in one place */}
      <div id="how" className="relative mx-auto max-w-[1240px] px-6 pb-14">
        <div className="text-center">
          <h2 className="text-3xl font-semibold">Everything in one place.</h2>
          <p className="mt-2 text-muted-foreground">
            Works across digital and physical collections.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="p-8 text-center">
            <div className="mx-auto h-12 w-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
              🎮
            </div>
            <div className="mt-5 text-lg font-semibold">Track Games + Consoles</div>
            <p className="mt-3 text-sm text-muted-foreground">
              Organize your digital and physical library across decades. From cartridges to cloud saves,
              everything you&apos;ve played lives here.
            </p>
          </Card>

          <Card className="p-8 text-center">
            <div className="mx-auto h-12 w-12 rounded-xl bg-[#F2C14E]/10 border border-[#F2C14E]/20 flex items-center justify-center">
              🔗
            </div>
            <div className="mt-5 text-lg font-semibold">Connect Platforms</div>
            <p className="mt-3 text-sm text-muted-foreground">
              Sync Steam, PlayStation, Xbox, and RetroAchievements. Your achievements and progress, unified.
            </p>
          </Card>

          <Card className="p-8 text-center">
            <div className="mx-auto h-12 w-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              👥
            </div>
            <div className="mt-5 text-lg font-semibold">Follow Creators</div>
            <p className="mt-3 text-sm text-muted-foreground">
              Track your favorite developers, studios, and gaming media. See their journey as it unfolds.
            </p>
          </Card>
        </div>

        <div className="mt-14 text-center">
          <h3 className="text-2xl font-semibold">Start in minutes.</h3>
          <div className="mt-4 text-muted-foreground space-y-1">
            <div>Import from other trackers</div>
            <div>Sync major platforms</div>
            <div>Manually add physical or digital games</div>
          </div>
        </div>
      </div>

      {/* identity evolution section */}
      <div className="relative mx-auto max-w-[1240px] px-6 pb-20">
        <div className="text-center">
          <h2 className="text-3xl font-semibold">Who are you on this gaming journey?</h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            Most gamers begin somewhere. GameHome analyzes your history across time to understand where you started,
            how you&apos;ve grown, and who you&apos;re becoming.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          <div className="space-y-4">
            {[
              { name: "The Explorer", desc: "Seeks new worlds and uncharted experiences", sub: "Often where the journey begins", c: "bg-emerald-400/10 border-emerald-400/20 text-emerald-300", icon: "⟡" },
              { name: "The Competitor", desc: "Driven by challenge and mastery", sub: "Emerges through dedication", c: "bg-red-400/10 border-red-400/20 text-red-300", icon: "🏆" },
              { name: "The Archivist", desc: "Preserves and completes every collection", sub: "Refined over years of play", c: "bg-purple-400/10 border-purple-400/20 text-purple-300", icon: "▦" },
            ].map((a) => (
              <Card key={a.name} className="p-6">
                <div className="flex items-start gap-4">
                  <div className={`h-12 w-12 rounded-xl border flex items-center justify-center ${a.c}`}>
                    <span className="text-lg">{a.icon}</span>
                  </div>
                  <div>
                    <div className="text-lg font-semibold">{a.name}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{a.desc}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{a.sub}</div>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <div className="flex flex-col items-center justify-center text-center">
            <div className="text-muted-foreground text-sm">Your identity changes over time.</div>
            <div className="mt-6">
              <Link href="/onboarding" className={ghostBtn}>
                Discover Your Starting Identity
              </Link>
            </div>

            <div className="mt-16">
              <h3 className="text-3xl font-semibold">You are not the same gamer you were.</h3>
              <p className="mt-3 text-muted-foreground">
                From your first console to your latest obsession, your identity evolves. GameHome tracks the arc.
              </p>

              <div className="mt-10 grid grid-cols-3 gap-8 text-left">
                {[
                  { year: "1998", label: "Explorer" },
                  { year: "2006", label: "Competitor" },
                  { year: "2024", label: "Archivist" },
                ].map((t) => (
                  <div key={t.year}>
                    <div className="h-2 w-2 rounded-full bg-purple-400 mb-3" />
                    <div className="text-2xl text-foreground/70">{t.year}</div>
                    <div className="mt-1 text-sm text-foreground/90">{t.label}</div>
                  </div>
                ))}
              </div>

              <div className="mt-8">
                <Link href="/timeline" className="text-sm font-semibold hover:underline underline-offset-4">
                  See how identity evolves →
                </Link>
              </div>

              <div className="mt-10 text-xs tracking-[0.25em] text-muted-foreground uppercase">
                Trusted by gamers across platforms
              </div>
              <div className="mt-4 flex flex-wrap justify-center gap-8 text-muted-foreground">
                <span>Steam</span>
                <span>PlayStation</span>
                <span>Xbox</span>
                <span>RetroAchievements</span>
                <span>Nintendo</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* footer CTA */}
      <div className="relative mx-auto max-w-[1240px] px-6 pb-24">
        <Card className="p-10 text-center">
          <Kicker>Start now</Kicker>
          <div className="mt-3 text-2xl font-semibold">Create your GameHome in minutes.</div>
          <p className="mt-3 text-sm text-muted-foreground">
            Take the quiz, connect platforms, and let the story write itself.
          </p>
          <div className="mt-7 flex items-center justify-center gap-4">
            <Link href="/onboarding" className={goldBtn}>
              Get Started
            </Link>
            <Link href="/login" className="text-sm text-muted-foreground hover:underline">
              I already have an account
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
