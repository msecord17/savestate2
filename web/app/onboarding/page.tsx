import Link from "next/link";
import { Sparkles, Link as LinkIcon, Mail, Gamepad2 } from "lucide-react";

export const dynamic = "force-static";

const goldBtn =
  "inline-flex items-center justify-center h-12 w-full px-7 rounded-[var(--radius-xl)] bg-[#F2C14E] text-black font-semibold hover:bg-[#F2C14E]/90 active:scale-[0.99] transition";
const softBtn =
  "inline-flex items-center justify-center h-11 w-full px-6 rounded-[var(--radius-xl)] border border-border bg-card/40 text-foreground/90 font-semibold hover:bg-card/60 active:scale-[0.99] transition";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-48 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[#F2C14E]/10 blur-3xl" />
        <div className="absolute -top-24 left-1/4 h-[420px] w-[620px] rounded-full bg-indigo-500/10 blur-3xl" />
      </div>
      <div className="relative mx-auto max-w-[760px] px-6 py-12">{children}</div>
    </div>
  );
}

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

function ProviderButton({
  label,
  icon,
  variant = "neutral",
  href,
}: {
  label: string;
  icon: React.ReactNode;
  variant?: "neutral" | "discord";
  href: string;
}) {
  const base =
    "inline-flex items-center justify-center gap-3 h-12 w-full rounded-[var(--radius-xl)] border text-sm font-semibold transition";
  const cls =
    variant === "discord"
      ? `${base} border-transparent bg-indigo-500 text-white hover:bg-indigo-500/90`
      : `${base} border-border bg-card/40 text-foreground hover:bg-card/60`;
  return (
    <Link href={href} className={cls}>
      <span className="w-5 h-5 flex items-center justify-center">{icon}</span>
      {label}
    </Link>
  );
}

export default function OnboardingPage() {
  return (
    <Shell>
      <div className="text-center">
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">Create your GameHome</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Create an account now. You can connect platforms and take the quiz after.
        </p>
      </div>

      <div className="mt-10 space-y-6">
        {/* Create Account */}
        <Card className="p-8 border-[#F2C14E]/35">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-[var(--radius-xl)] bg-[#F2C14E]/10 border border-[#F2C14E]/20 flex items-center justify-center">
              <Mail className="h-5 w-5 text-[#F2C14E]" />
            </div>
            <div className="min-w-0">
              <div className="text-xl font-semibold">Create Account</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Sign up with email, Google, Apple, or Discord
              </div>

              <div className="mt-6 space-y-3 max-w-sm">
                <ProviderButton
                  label="Continue with Google"
                  icon={<span className="text-base font-bold">G</span>}
                  href="/login?provider=google"
                />
                <ProviderButton
                  label="Continue with Apple"
                  icon={<span className="text-base"></span>}
                  href="/login?provider=apple"
                />
                <ProviderButton
                  label="Continue with Discord"
                  icon={<span className="text-base font-bold">◎</span>}
                  variant="discord"
                  href="/login?provider=discord"
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Connect Platforms (disabled-ish) */}
        <Card className="p-7">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-[var(--radius-xl)] bg-card/40 border border-border flex items-center justify-center">
              <LinkIcon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <div className="text-xl font-semibold">Connect Platforms</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Steam, PlayStation, Xbox, RetroAchievements
              </div>
              <div className="mt-4 text-xs text-muted-foreground">Available after account creation</div>
            </div>
          </div>
        </Card>

        {/* Take quiz optional */}
        <Card className="p-7">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-[var(--radius-xl)] bg-card/40 border border-border flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <div className="text-xl font-semibold">Take the Era Quiz</div>
                <span className="text-xs rounded-md border border-border bg-card/40 px-2 py-1 text-muted-foreground">
                  Optional
                </span>
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                Discover your gaming archetype and get personalized insights
              </div>

              <Link
                href="/quiz"
                className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#F2C14E] hover:underline underline-offset-4"
              >
                Take the quiz (2 min) <Gamepad2 className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </Card>

        {/* Bottom CTA */}
        <div className="pt-2">
          <Link href="/connect" className={goldBtn}>
            Continue to Platform Connect
          </Link>
          <div className="mt-4 text-center">
            <Link href="/" className="text-sm text-muted-foreground hover:underline">
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </Shell>
  );
}
