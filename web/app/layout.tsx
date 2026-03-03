import Link from "next/link";
import "./globals.css";
import { BottomNav } from "@/src/ui/BottomNav";
import { QuizClaimOnLoad } from "@/components/QuizClaimOnLoad";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { adminClient } from "@/lib/supabase/admin-client";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let isAdmin = false;
  let profileHref = "/login";
  try {
    const supabase = await supabaseRouteClient();
    const { data: auth } = await supabase.auth.getUser();
    if (auth?.user) {
      profileHref = "/profile";
      const admin = adminClient();
      const { data: adminData } = await admin
        .from("profiles")
        .select("is_admin")
        .eq("user_id", auth.user.id)
        .single();
      isAdmin = !!adminData?.is_admin;
    }
  } catch {
    // ignore auth errors; nav still renders
  }

  return (
    <html lang="en" className="dark">
      <body className="bg-background text-foreground">
        <nav className="hidden md:flex items-center gap-4 px-5 py-3 min-h-[56px] border-b border-border bg-background">
          <Link href="/gamehome" prefetch={false} className="text-sm text-foreground/80 hover:text-foreground">
            GameHome
          </Link>
          <Link href="/timeline" prefetch={false} className="text-sm text-foreground/80 hover:text-foreground">
            Timeline
          </Link>
          <Link href="/portfolio" prefetch={false} className="text-sm text-foreground/80 hover:text-foreground">
            Portfolio
          </Link>
          <Link href="/my-portfolio" prefetch={false} className="text-sm text-foreground/80 hover:text-foreground">
            My Portfolio
          </Link>
          <Link href={profileHref} prefetch={false} className="text-sm text-foreground/80 hover:text-foreground">
            Profile
          </Link>
          <Link href="/settings" prefetch={false} className="text-sm text-foreground/80 hover:text-foreground">
            Settings
          </Link>
          <Link href="/lists" prefetch={false} className="text-sm text-foreground/80 hover:text-foreground">
            Lists
          </Link>
          <Link href="/leaderboard" prefetch={false} className="text-sm text-foreground/80 hover:text-foreground">
            Leaderboard
          </Link>
          <Link href="/add-games" prefetch={false} className="text-sm text-foreground/80 hover:text-foreground">
            Add Games
          </Link>

          {isAdmin && (
            <Link href="/admin/matches?status=needs_review" prefetch={false} className="text-sm text-foreground/80 hover:text-foreground">
              Admin
            </Link>
          )}

          <div className="ml-auto flex items-center gap-3">
            <Link href="/login" prefetch={false} className="text-sm text-foreground/70 hover:text-foreground">
              Login
            </Link>
            <Link href="/logout" prefetch={false} className="text-sm text-foreground/70 hover:text-foreground">
              Logout
            </Link>
          </div>
        </nav>

        <main className="pb-20 md:pb-0">{children}</main>
        <QuizClaimOnLoad />

        <BottomNav profileHref={profileHref} />
      </body>
    </html>
  );
}
