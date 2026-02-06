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
          <Link href="/gamehome">GameHome</Link>
          <Link href="/timeline">Timeline</Link>
          <Link href="/portfolio">Search</Link>
          <Link href="/my-portfolio">My Portfolio</Link>
          <Link href="/profile">Profile</Link>
          <Link href="/lists">Lists</Link>
          <Link href="/leaderboard">Leaderboard</Link>
          <Link href="/add-games">Add Games</Link>
          <div style={{ marginLeft: "auto", display: "flex", gap: 12 }}>
            <Link href="/login">Login</Link>
            <Link href="/logout">Logout</Link>
          </div>
        </nav>

        <main className="pb-20 md:pb-0">{children}</main>

        <BottomNav />
      </body>
    </html>
  );
}
