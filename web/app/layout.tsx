import Link from "next/link";
import "./globals.css";
import { BottomNav } from "@/src/ui/BottomNav";

const TOP_NAV_MIN_HEIGHT = 44;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav
          className="hidden border-b border-[var(--color-border)] bg-[var(--color-surface)] md:block"
          style={{
            display: "flex",
            gap: 16,
            padding: "12px 20px",
            alignItems: "center",
            minHeight: TOP_NAV_MIN_HEIGHT,
          }}
        >
          <Link href="/gamehome" prefetch={false}>GameHome</Link>
          <Link href="/timeline" prefetch={false}>Timeline</Link>
          <Link href="/portfolio" prefetch={false}>Search</Link>
          <Link href="/my-portfolio" prefetch={false}>My Portfolio</Link>
          <Link href="/profile" prefetch={false}>Profile</Link>
          <Link href="/lists" prefetch={false}>Lists</Link>
          <Link href="/leaderboard" prefetch={false}>Leaderboard</Link>
          <Link href="/add-games" prefetch={false}>Add Games</Link>
          <Link href="/admin/matches?status=needs_review" prefetch={false}>Admin</Link>
          <div style={{ marginLeft: "auto", display: "flex", gap: 12 }}>
            <Link href="/login" prefetch={false}>Login</Link>
            <Link href="/logout" prefetch={false}>Logout</Link>
          </div>
        </nav>

        <main className="pb-20 md:pb-0">{children}</main>

        <BottomNav />
      </body>
    </html>
  );
}
