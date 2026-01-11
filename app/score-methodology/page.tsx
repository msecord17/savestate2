"use client";

import Link from "next/link";

export default function ScoreMethodologyPage() {
  return (
    <div style={{ padding: 24, maxWidth: 820, margin: "0 auto" }}>
      <Link href="/profile" style={{ color: "#2563eb", fontSize: 14 }}>
        ← Back to Profile
      </Link>

      <h1 style={{ fontSize: 32, fontWeight: 900, marginTop: 16 }}>
        Gamer Lifetime Score™
      </h1>

      <p style={{ color: "#475569", marginTop: 6 }}>
        Methodology Overview
      </p>

      <section style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800 }}>
          What the Score Represents
        </h2>

        <p style={{ marginTop: 10, lineHeight: 1.6 }}>
          The <strong>Gamer Lifetime Score</strong> is a confidence-weighted
          measure of a player’s lifetime gaming experience.
        </p>

        <p style={{ marginTop: 10, lineHeight: 1.6 }}>
          It is designed to answer a simple question:
        </p>

        <blockquote
          style={{
            marginTop: 12,
            paddingLeft: 16,
            borderLeft: "3px solid #e5e7eb",
            color: "#334155",
            fontStyle: "italic",
          }}
        >
          How much meaningful experience has this person accumulated across
          games, platforms, and eras?
        </blockquote>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800 }}>Core Principles</h2>

        <ul style={{ marginTop: 12, lineHeight: 1.7 }}>
          <li>
            <strong>Experience over intensity</strong> — breadth and consistency
            matter more than extreme playtime in a single title.
          </li>
          <li>
            <strong>Completion over ownership</strong> — finishing games carries
            more weight than collecting them.
          </li>
          <li>
            <strong>Verified data first</strong> — tracked sources are prioritized,
            but historical eras are supported.
          </li>
          <li>
            <strong>Confidence matters</strong> — scores are paired with a
            confidence rating reflecting data completeness.
          </li>
        </ul>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800 }}>Score Components</h2>

        <h3 style={{ marginTop: 18, fontWeight: 700 }}>
          1. Steam Playtime
        </h3>
        <p style={{ marginTop: 6, lineHeight: 1.6 }}>
          Total verified playtime across your Steam library. Playtime is
          logarithmically scaled so early hours matter more than extreme totals.
        </p>

        <h3 style={{ marginTop: 18, fontWeight: 700 }}>
          2. Completion History
        </h3>
        <p style={{ marginTop: 6, lineHeight: 1.6 }}>
          Games contribute based on completion status. Completed games carry the
          highest weight, followed by active and owned titles.
        </p>

        <h3 style={{ marginTop: 18, fontWeight: 700 }}>
          3. RetroAchievements
        </h3>
        <p style={{ marginTop: 6, lineHeight: 1.6 }}>
          Achievement points reflect challenge mastery. Hardcore achievements
          receive additional weight, with completion percentage providing a
          small multiplier.
        </p>

        <h3 style={{ marginTop: 18, fontWeight: 700 }}>
          4. Era History Bonus
        </h3>
        <p style={{ marginTop: 6, lineHeight: 1.6 }}>
          Self-reported participation across gaming generations acknowledges
          experience that predates modern tracking systems.
        </p>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800 }}>Confidence Score</h2>

        <p style={{ marginTop: 10, lineHeight: 1.6 }}>
          Every Gamer Lifetime Score includes a <strong>Confidence rating</strong>
          from 0–100.
        </p>

        <p style={{ marginTop: 10, lineHeight: 1.6 }}>
          Confidence reflects data completeness — not skill. Connecting platforms
          and completing era history increases confidence.
        </p>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800 }}>
          Percentiles & Comparison
        </h2>

        <p style={{ marginTop: 10, lineHeight: 1.6 }}>
          Scores are contextualized using percentiles rather than raw leaderboards.
          This allows fair comparison across eras and platforms.
        </p>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800 }}>
          What This Score Is Not
        </h2>

        <ul style={{ marginTop: 12, lineHeight: 1.7 }}>
          <li>Not a skill ranking</li>
          <li>Not a reflex test</li>
          <li>Not a grind leaderboard</li>
          <li>Not a competitive ladder</li>
        </ul>
      </section>

      <section style={{ marginTop: 36 }}>
        <blockquote
          style={{
            padding: 16,
            background: "#f8fafc",
            borderRadius: 12,
            fontWeight: 600,
            color: "#0f172a",
          }}
        >
          The Gamer Lifetime Score measures experience, not skill — and weights
          certainty as heavily as scale.
        </blockquote>
      </section>
    </div>
  );
}
