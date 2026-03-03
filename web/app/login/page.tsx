"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function LoginPage() {
  const supabase = supabaseBrowser();
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");

  async function sendLink() {
    setMsg("");
    try {
      const base = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${base}/auth/callback?next=/my-portfolio`,
        },
      });

      if (error) setMsg(error.message);
      else setMsg("Check your email for the login link.");
    } catch (e: any) {
      setMsg(e?.message ?? "Failed to send login link");
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 420 }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Login</h1>
      <div style={{ color: "#6b7280", marginBottom: 16 }}>
        We’ll email you a magic link.
      </div>

      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@email.com"
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: 8,
          border: "1px solid #e5e7eb",
        }}
      />

      <button
        onClick={sendLink}
        style={{
          marginTop: 12,
          padding: "10px 12px",
          borderRadius: 8,
          border: "1px solid #e5e7eb",
          cursor: "pointer",
        }}
      >
        Send login link
      </button>

      {msg && <div style={{ marginTop: 12 }}>{msg}</div>}
    </div>
  );
}
