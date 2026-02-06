"use client";

import type { GamerProfile, PlayStyle } from "@/lib/identity/deriveGamerProfile";

export type IdentityCardProps = GamerProfile;

function playStyleSentence(playStyle: PlayStyle): string {
  switch (playStyle) {
    case "completion":
      return "Leans toward completion";
    case "exploration":
      return "Leans toward exploration";
    default:
      return "Balanced";
  }
}

/**
 * Pure presentational. Takes derived profile only — no DB calls.
 * Renders Gamer Identity Card: archetype, era fingerprint, play style.
 */
export function IdentityCard({ archetype, eraFingerprint, playStyle }: IdentityCardProps) {
  const eraLabels = eraFingerprint.labels?.length ? eraFingerprint.labels : [eraFingerprint.dominantEra];
  const distribution = eraFingerprint.distribution ?? [];

  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">
        Gamer identity
      </div>
      <p className="mt-1 text-lg font-semibold text-white">{archetype}</p>

      {eraLabels.length > 0 && (
        <div className="mt-3">
          <div className="text-xs text-zinc-500">Era fingerprint</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {eraLabels.map((label) => (
              <span
                key={label}
                className="inline-flex rounded-full bg-white/10 px-2.5 py-0.5 text-sm text-zinc-200"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      )}

      {distribution.length > 0 && (
        <div className="mt-3">
          <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-white/5">
            {distribution.map(({ era, weight }) => (
              <div
                key={era}
                className="bg-white/20 transition-all"
                style={{ width: `${Math.max(4, weight * 100)}%` }}
                title={`${era}: ${Math.round(weight * 100)}%`}
              />
            ))}
          </div>
        </div>
      )}

      <p className="mt-3 text-sm text-zinc-400">
        {playStyleSentence(playStyle)}
      </p>
    </div>
  );
}
