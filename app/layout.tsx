import Link from "next/link";
import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav
          style={{
            display: "flex",
            gap: 16,
            padding: "12px 20px",
            borderBottom: "1px solid #e5e7eb",
            alignItems: "center",
          }}
        >
          <Link href="/gamehome">GameHome</Link>
          <Link href="/portfolio">Search</Link>
          <Link href="/my-portfolio">My Portfolio</Link>
          <Link href="/profile">Profile</Link>
          <Link href="/lists">Lists</Link>
          <Link href="/add-games">Add Games</Link>

          <div style={{ marginLeft: "auto", display: "flex", gap: 12 }}>
            <Link href="/login">Login</Link>
            <Link href="/logout">Logout</Link>
          </div>
        </nav>

        <main>{children}</main>
      </body>
    </html>
  );
}
