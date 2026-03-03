import Link from "next/link";
import { cookies } from "next/headers";
import { Check, Link as LinkIcon, Mail } from "lucide-react";

export const dynamic = "force-dynamic";

const goldBtn =
  "inline-flex items-center justify-center h-12 w-full px-7 rounded-[var(--radius-xl)] bg-[#F2C14E] text-black font-semibold hover:bg-[#F2C14E]/90 active:scale-[0.99] transition";
const baseBtn =
  "inline-flex items-center justify-center gap-3 h-12 w-full rounded-[var(--radius-xl)] border border-border bg-card/40 text-sm font-semibold text-foreground hover:bg-card/60 transition";
const discordBtn =
  "inline-flex items-center justify-center gap-3 h-12 w-full rounded-[var(--radius-xl)] border border-transparent bg-indigo-500 text-sm font-semibold text-white hover:bg-indigo-500/90 transition";

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

export default async function CreateAccountAfterQuizPage() {
  const cookieStore = await cookies();
  const hasQuiz = !!cookieStore.get("gh_quiz_session");

  return (
    <Shell>
      <div className="text-center">
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">Create your GameHome</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          {hasQuiz
            ? "Your quiz results are saved. Next: create your account."
            : "Create an account now. You can connect platforms and take the quiz after."}
        </p>
      </div>

      <div className="mt-10 space-y-6">
        {hasQuiz ? (
          <Card className="p-6 border-[#F2C14E]/35">
            <div className="flex items-start gap-4">
              <div className="h-11 w-11 rounded-full bg-[#F2C14E] text-black flex items-center justify-center">
                <Check className="h-5 w-5" />
              </div>
              <div>
                <div className="text-lg font-semibold">Gaming preferences saved</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  We&apos;ve imported your era quiz results. Your archetype and gamer score will be unlocked once you
                  create your account.
                </div>
              </div>
            </div>
          </Card>
        ) : null}

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
                <Link href="/login?provider=google" className={baseBtn}>
                  <span className="text-base font-bold">G</span>
                  Continue with Google
                </Link>
                <Link href="/login?provider=apple" className={baseBtn}>
                  <span className="text-base"></span>
                  Continue with Apple
                </Link>
                <Link href="/login?provider=discord" className={discordBtn}>
                  <span className="text-base font-bold">◎</span>
                  Continue with Discord
                </Link>
              </div>
            </div>
          </div>
        </Card>

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
