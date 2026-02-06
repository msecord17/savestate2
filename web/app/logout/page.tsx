"use client";

import { useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function LogoutPage() {
  useEffect(() => {
    supabaseBrowser().auth.signOut().then(() => {
      window.location.href = "/login";
    });
  }, []);

  return <div style={{ padding: 24 }}>Signing out…</div>;
}
