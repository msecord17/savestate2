"use client";

import React from "react";
import Link from "next/link";
import { Star, Sparkles, Globe, Gamepad2, Box } from "lucide-react";
import { FixMatchAffordance } from "./FixMatchAffordance";

type AnyObj = Record<string, any>;

function normalizeGenres(genres: any): string[] {
  if (!genres) return [];
  if (Array.isArray(genres)) {
    return genres
      .map((g) => (typeof g === "string" ? g : g?.name ?? g?.label ?? ""))
      .map((s) => String(s).trim())
      .filter(Boolean);
  }
  if (typeof genres === "string") {
    // supports "JRPG, Turn-Based, Mystery" etc
    return genres
      .split(/[,\|]/g)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function eraFromYear(year?: number | null) {
  if (!year) return null;
  if (year <= 1982) return "Arcade Dawn";
  if (year <= 1989) return "8-bit Era";
  if (year <= 1995) return "16-bit Era";
  if (year <= 1999) return "32/64-bit Era";
  if (year <= 2008) return "PS2 Renaissance";
  if (year <= 2013) return "HD Rise";
  if (year <= 2019) return "Modern HD";
  return "Current Era";
}

function SectionCard({
  title,
  right,
  children,
  id,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <div
      id={id}
      className="bg-[#1A1F29] rounded-2xl border border-[#222833] p-6 sm:p-8"
    >
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-lg sm:text-xl font-bold text-[#F1F5F9]">{title}</h2>
        {right ? <div className="text-sm text-[#A8B0BF]">{right}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-3 sm:gap-6 sm:items-center">
      <div className="text-sm text-[#A8B0BF] uppercase tracking-wide sm:w-32">
        {label}
      </div>
      <div className="text-base text-[#F1F5F9]">{value}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-sm text-[#A8B0BF] opacity-80">
      {text}
    </div>
  );
}

export default function BelowTheFold({
  release,
  portfolio,
  signals,
  editorial,
  community,
}: {
  release: AnyObj;
  portfolio?: AnyObj | null;
  signals?: AnyObj | null;
  editorial?: AnyObj | null;
  community?: AnyObj | null;
}) {
  const game = release?.games ?? null;

  const year =
    Number(game?.first_release_year ?? release?.first_release_year ?? NaN);
  const yearSafe = Number.isFinite(year) ? year : null;

  // ---- Editorial wiring (supports both demo + DB shapes) ----
  const ed = editorial ?? null;

  const timeline = ed?.timeline ?? null;
  const reputation = ed?.reputation ?? null;
  const footnote = ed?.footnote ?? null;

  // Versions/Related can come from editorial (demo) or DB later
  const versions = Array.isArray(ed?.release_versions) ? ed.release_versions : [];
  const related = Array.isArray(ed?.related_games) ? ed.related_games : [];

  // Timeline labels (support both demo field names + DB field names)
  const eraLabel =
    timeline?.era_label ??
    timeline?.eraLabel ??
    (yearSafe ? eraFromYear(yearSafe) : null) ??
    "—";

  const releasedLabel =
    timeline?.released_label ??
    timeline?.releasedLabel ??
    timeline?.released_text ??
    (yearSafe ? String(yearSafe) : null) ??
    "—";

  const releasedNote =
    timeline?.released_note ??
    timeline?.releasedNote ??
    timeline?.released_blurb ??
    timeline?.releasedBlurb ??
    "—";

  const sameYearLabel =
    timeline?.same_year_label ??
    timeline?.sameYearLabel ??
    timeline?.same_year_text ??
    timeline?.sameYearText ??
    "—";

  // Reputation chips: demo uses community_chips, DB uses community_tags
  const repChipsRaw =
    (Array.isArray(reputation?.community_chips) ? reputation.community_chips : null) ??
    (Array.isArray(reputation?.community_tags) ? reputation.community_tags : null) ??
    [];

  const repChips = (repChipsRaw as any[])
    .map((x) => String(x ?? "").trim())
    .filter(Boolean);

  // Footnote presence
  const hasFootnote = Boolean(String(footnote?.body ?? "").trim());

  const tags = Array.isArray(ed?.tags) && ed.tags.length > 0
    ? ed.tags
    : normalizeGenres(game?.genres);

  return (
    <div className="space-y-6">
      {/* Timeline Context: editorial.timeline.* → fallback "—" */}
      <SectionCard
        title="Timeline Context"
        right={
          releasedLabel && releasedLabel !== "—" ? (
            <span className="text-xs uppercase tracking-wide text-[#A8B0BF]">{releasedLabel}</span>
          ) : null
        }
      >
        <div className="space-y-4">
          <Row
            label="Era"
            value={
              <span className="text-[#F1F5F9]">
                {eraLabel}
                {yearSafe && !timeline?.era_label ? (
                  <span className="text-[#A8B0BF]"> ({yearSafe})</span>
                ) : null}
              </span>
            }
          />
          <Row label="Released" value={<span className="text-[#A8B0BF]">{releasedLabel}</span>} />
          <Row label="Same year" value={<span className="text-[#A8B0BF]">{sameYearLabel}</span>} />
          {releasedNote && releasedNote !== "—" ? (
            <Row label="Note" value={<span className="text-[#A8B0BF]">{releasedNote}</span>} />
          ) : null}
          {timeline?.era_blurb ? (
            <Row label="Era blurb" value={<span className="text-[#A8B0BF]">{timeline.era_blurb}</span>} />
          ) : null}
        </div>
      </SectionCard>

      {/* Cultural Reputation: editorial.reputation.* → fallback "—" */}
      <SectionCard title="Cultural Reputation">
        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
              <Star className="text-[#F2B84B]" size={18} />
            </div>
            <div>
              <div className="text-4xl font-bold text-[#F2B84B] leading-none">
                {reputation?.score != null ? String(reputation.score) : "Legacy"}
              </div>
              <div className="mt-1 text-xs uppercase tracking-wide text-[#A8B0BF]">
                {reputation?.score != null ? "Metacritic" : "Legacy"}
              </div>
              {reputation?.score_source_label ? (
                <div className="text-xs text-[#A8B0BF] mt-1">{reputation.score_source_label}</div>
              ) : null}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-[#A8B0BF]">
                Legacy
              </div>
              <div className="mt-2 text-sm text-[#F1F5F9] leading-relaxed">
                {reputation?.blurb ?? reputation?.critic_blurb ?? "—"}
              </div>
            </div>

            <div>
              <div className="text-xs uppercase tracking-wide text-[#A8B0BF]">
                Community standing
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {repChips.length ? (
                  repChips.slice(0, 4).map((t: string) => (
                    <span
                      key={t}
                      className="px-3 py-1.5 rounded-lg text-xs border border-white/10 bg-white/5 text-[#F1F5F9]"
                    >
                      {t}
                    </span>
                  ))
                ) : (
                  <EmptyState text="—" />
                )}
              </div>
              {(reputation?.community_note ?? reputation?.community_blurb) ? (
                <div className="mt-2 text-sm text-[#A8B0BF] leading-relaxed">
                  {reputation?.community_note ?? reputation?.community_blurb ?? ""}
                </div>
              ) : null}
            </div>

            <div>
              <div className="text-xs uppercase tracking-wide text-[#A8B0BF]">
                Legacy impact
              </div>
              <div className="mt-2 text-sm text-[#A8B0BF] leading-relaxed">
                {reputation?.legacy_impact ?? "—"}
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Cultural Footnote: hide when empty, or show "Footnote coming soon." */}
      {hasFootnote ? (
        <SectionCard title="Cultural Footnote">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
              <Sparkles className="text-[#F2B84B]" size={18} />
            </div>
            <div className="text-sm text-[#A8B0BF] leading-relaxed">
              <div className="font-medium text-[#F1F5F9] mb-1">
                {footnote?.title ?? "Cultural Footnote"}
              </div>
              <div>{footnote?.body}</div>
            </div>
          </div>
        </SectionCard>
      ) : (
        <SectionCard title="Cultural Footnote">
          <div className="text-sm text-[#A8B0BF] opacity-80">Footnote coming soon.</div>
        </SectionCard>
      )}

      {/* Community */}
      {(community?.in_libraries != null || community?.playing_now != null || community?.completion_rate != null || community?.most_common_identity) && (
        <SectionCard title="Community">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
            {community?.in_libraries != null && (
              <div>
                <div className="text-xs uppercase tracking-wide text-[#A8B0BF]">In libraries</div>
                <div className="mt-1 text-xl font-semibold text-[#F1F5F9]">{community.in_libraries}</div>
              </div>
            )}
            {community?.playing_now != null && (
              <div>
                <div className="text-xs uppercase tracking-wide text-[#A8B0BF]">Playing now</div>
                <div className="mt-1 text-xl font-semibold text-[#F1F5F9]">{community.playing_now}</div>
              </div>
            )}
            {community?.completion_rate != null && (
              <div>
                <div className="text-xs uppercase tracking-wide text-[#A8B0BF]">Completion rate</div>
                <div className="mt-1 text-xl font-semibold text-[#F1F5F9]">{community.completion_rate}%</div>
              </div>
            )}
            {community?.avg_member_rating != null && (
              <div>
                <div className="text-xs uppercase tracking-wide text-[#A8B0BF]">Avg rating</div>
                <div className="mt-1 text-xl font-semibold text-[#F1F5F9]">{community.avg_member_rating}</div>
              </div>
            )}
            {community?.most_common_identity && (
              <div>
                <div className="text-xs uppercase tracking-wide text-[#A8B0BF]">Most common identity</div>
                <div className="mt-1 text-xl font-semibold text-[#F1F5F9]">{community.most_common_identity}</div>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {/* Release Versions */}
      <SectionCard title="Release Versions">
        {versions.length === 0 ? (
          <EmptyState text="No other versions linked yet." />
        ) : (
          <>
          <div className="space-y-4">
            {versions.map((v: any, idx: number) => {
              const href = v?.id ? `/release/${v.id}` : null;
              const title = v?.display_title ?? v?.title ?? "—";
              const subtitle = v?.subtitle ?? (v?.years_text ? `${v?.platform_name ?? ""} • ${v.years_text}`.trim() : v?.platform_name ?? "");
              const body = v?.blurb ?? v?.body ?? "";
              const badge = v?.badge ? String(v.badge) : null;
              const isDefinitive = badge?.toLowerCase() === "definitive";
              return (
                <div
                  key={String(v?.id ?? v?.title ?? idx)}
                  className="rounded-xl border border-[#222833] bg-[#1E232E] p-5 flex items-start gap-4"
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border border-white/10"
                    style={{
                      backgroundColor: isDefinitive ? "rgba(191, 168, 126, 0.2)" : "rgba(255,255,255,0.05)",
                    }}
                  >
                    <Box
                      size={18}
                      strokeWidth={1.5}
                      className={isDefinitive ? "text-[#BFA87E]" : "text-[#A8B0BF]"}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-semibold text-[#F1F5F9]">
                        {title}
                      </span>
                      {badge ? (
                        <span
                          className="px-2.5 py-1 rounded-lg text-xs font-medium"
                          style={{
                            backgroundColor: isDefinitive ? "#BFA87E" : "#5c5c66",
                            color: "#F1F5F9",
                          }}
                        >
                          {badge}
                        </span>
                      ) : null}
                    </div>
                    {subtitle ? (
                      <div className="mt-1.5 text-sm text-[#A8B0BF]">
                        {subtitle}
                      </div>
                    ) : null}
                    {body ? (
                      <div className="mt-2 text-sm text-[#A8B0BF] leading-relaxed">
                        {String(body)}
                      </div>
                    ) : null}
                  </div>
                  {href ? (
                    <Link
                      href={href}
                      className="text-sm text-[#A8B0BF] hover:text-[#F1F5F9] underline underline-offset-4 shrink-0"
                    >
                      View
                    </Link>
                  ) : null}
                </div>
              );
            })}
          </div>
          {versions.length === 1 ? (
            <div className="mt-4 text-sm text-[#A8B0BF] opacity-80">
              More versions will appear as we link releases.
            </div>
          ) : null}
          </>
        )}
      </SectionCard>

      {/* Related Games: if empty, show 4 placeholder tiles */}
      <SectionCard title="Related Games">
        {related.length === 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="rounded-2xl border border-[#222833] bg-white/5 overflow-hidden border-dashed"
              >
                <div className="h-40 bg-gradient-to-br from-white/5 to-white/0" />
                <div className="p-3">
                  <div className="text-sm font-semibold text-[#A8B0BF] opacity-60">Coming soon</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {related.slice(0, 8).map((g) => {
              const href = g?.id ? `/release/${g.id}` : null;
              const coverUrl = g?.cover_url ?? g?.games?.cover_url ?? null;
              const cover =
                coverUrl &&
                !String(coverUrl).includes("unknown") &&
                !String(coverUrl).includes("placeholder")
                  ? coverUrl
                  : null;
              const cardContent = (
                <>
                  <div
                    className="h-40 bg-cover bg-center bg-no-repeat"
                    style={{
                      backgroundImage: cover
                        ? `url(${cover})`
                        : "linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 100%)",
                    }}
                  />
                  <div className="p-3">
                    <div className="text-sm font-semibold text-[#F1F5F9] truncate">
                      {g?.title ?? "—"}
                    </div>
                    <div className="text-xs text-[#A8B0BF] mt-1">
                      {g?.reason ?? "—"}
                    </div>
                    {href ? (
                      <span className="inline-block mt-2 text-xs text-[#A8B0BF] group-hover:text-[#F1F5F9] underline underline-offset-4">
                        Open
                      </span>
                    ) : null}
                  </div>
                </>
              );
              return (
                <div
                  key={String(g?.id ?? g?.title ?? Math.random())}
                  className={`rounded-2xl border border-[#222833] bg-white/5 overflow-hidden transition-colors ${href ? "hover:bg-white/8 cursor-pointer group" : ""}`}
                >
                  {href ? (
                    <Link href={href} className="block group">
                      {cardContent}
                    </Link>
                  ) : (
                    cardContent
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* Game Info: Tags row: editorial.tags → fallback games.genres */}
      <SectionCard
        title="Game Info"
        right={
          <span className="text-xs text-[#A8B0BF]">
            {tags.length ? tags.slice(0, 4).join(" • ") : "—"}
          </span>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <Row label="Developers" value={<span className="text-[#F1F5F9]">{release?.dev_final ?? game?.developer ?? "—"}</span>} />
            <Row label="Publishers" value={<span className="text-[#F1F5F9]">{release?.pub_final ?? game?.publisher ?? "—"}</span>} />
            <Row label="Game modes" value={<span className="text-[#F1F5F9]">{release?.game_modes ?? "—"}</span>} />
            <Row label="Series" value={<span className="text-[#F1F5F9]">{release?.series ?? "—"}</span>} />
          </div>

          <div className="space-y-4">
            <Row label="Perspectives" value={<span className="text-[#F1F5F9]">{release?.player_perspectives ?? "—"}</span>} />
            <Row label="Franchises" value={<span className="text-[#F1F5F9]">{release?.franchises ?? "—"}</span>} />
            <Row label="IGDB ID" value={<span className="text-[#F1F5F9]">{game?.igdb_game_id ?? "—"}</span>} />
            <Row label="Alt titles" value={<span className="text-[#F1F5F9]">{release?.alternate_titles ?? "—"}</span>} />
          </div>
        </div>
        <FixMatchAffordance
          releaseId={release?.id ?? ""}
          igdbGameId={game?.igdb_game_id != null ? Number(game.igdb_game_id) : null}
        />
      </SectionCard>
    </div>
  );
}
