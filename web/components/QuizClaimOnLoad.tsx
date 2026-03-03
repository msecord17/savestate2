"use client";

import { useEffect } from "react";

/**
 * Fires POST /api/quiz/claim once on mount to attach an anonymous quiz session
 * to the logged-in user. No-op if not logged in or no cookie.
 */
export function QuizClaimOnLoad() {
  useEffect(() => {
    fetch("/api/quiz/claim", { method: "POST" }).catch(() => {});
  }, []);
  return null;
}
