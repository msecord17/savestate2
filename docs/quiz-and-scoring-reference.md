# Quiz Logic & Scoring Reference

Single source of truth for era quiz, archetype scoring, era mapping, and result phrasing.

---

## 1. Era Scoring

### 1.1 Era History Quiz (User-Submitted)

The "90-second era quiz" (`/era-onboarding`) lets users pick which eras they were active in and set intensity. Stored in `user_era_history`. Scoring logic in `web/app/api/eras/route.ts`.

**Per-era formula:**
- **Years span:** `years = clamp((toYear - fromYear + 1), 0, 60)`
- **Intensity multiplier:**
  - `obsessed` → 1.0
  - `regular` → 0.65
  - `dabble` → 0.35

**Points per era:**
```
eraPoints = min(220, years × 12 × intensityMult)
```
Total era points capped at **1200**.

**Confidence per era:**
```
confidence += min(10, years/4) × intensityMult
```
Plus:
- `eras.length >= 5` → +8 confidence
- `eras.length >= 8` → +10 confidence

Confidence capped at **35**.

**Quiz era keys** (from `era-onboarding`):
- Consoles: `nes`, `snes`, `n64`, `gc`, `wii`, `genesis`, `saturn`, `dreamcast`, `ps1`, `ps2`, `ps3`, `ps4`, `ps5`, `xbox`, `x360`, `xone`, `xsx`
- PC: `pc_90s`, `pc_00s`, `pc_modern`
- Handheld: `handheld_gb`, `handheld_gba`, `handheld_ds`, `handheld_psp`, `handheld_modern`

### 1.2 Data-Driven Era Buckets (Library)

Eras are derived from **game release year** (first release), not platform. `get_identity_signals` assigns `era_bucket` per release. SQL in `sql/get_identity_signals_rpc.sql`.

| Release Year | era_bucket |
|--------------|------------|
| null | `unknown` |
| ≤1979 | `early_arcade_pre_crash` |
| 1980–1989 | `8bit_home` |
| 1990–1995 | `16bit` |
| 1996–2000 | `32_64bit` |
| 2001–2005 | `ps2_xbox_gc` |
| 2006–2012 | `hd_era` |
| 2013–2016 | `ps4_xbo` |
| 2017–2019 | `switch_wave` |
| ≥2020 | `modern` |

Aggregation: `era_buckets` = `Record<era_bucket, { games, releases }>`.

**Origin timeline** (get_origin_timeline / get_public_origin_timeline) uses slightly different year ranges:
- 1972–1977 → `gen1_1972_1977`
- 1978–1982 → `gen2_1978_1982`
- 1983–1989 → `gen3_1983_1989`
- 1990–1995 → `gen4_1990_1995`
- 1996–1999 → `gen5_1996_1999`
- 2000–2005 → `gen6_2000_2005`
- 2006–2012 → `gen7_2006_2012`
- 2013–2019 → `gen8_2013_2019`
- ≥2020 → `gen9_2020_plus`

---

## 2. Archetype Scoring

### 2.1 Identity Archetypes (`web/lib/identity/archetypes.ts`)

**Strength tiers:** `score ≥ 80` → core, `≥ 60` → strong, `≥ 35` → emerging.

**Helpers:**
- `sat(value, softCap)` — saturating curve 0..100
- `lin(value, minVal, maxVal)` — linear mapping 0..100
- `blend(parts: { w, s }[])` — weighted blend

| Archetype | Gate | Score Formula |
|-----------|------|---------------|
| **Completionist** | `achievements_total ≥ 200` OR `completion_count ≥ 5` | blend of `sat(achievements, 600)` (0.6) + `sat(completions, 25)` (0.4) |
| **Achievement Hunter** | `achievements_total ≥ 500` | blend of `sat(achievements, 2000)` (0.7) + `sat(achievements_last_90d, 150)` (0.3) |
| **Explorer** | `owned_titles ≥ 30` | blend of `sat(unique_platforms, 4)` (0.35), `sat(owned_titles, 250)` (0.35), `sat(era_span_years, 25)` (0.30) |
| **Archivist** | `owned_titles ≥ 200` OR `owned_games ≥ 80` OR `collector_fields ≥ 20` | blend of library size, curation fields, weeks active |
| **Era Keeper** | `owned_titles ≥ 30` AND `primary_era_count ≥ 12` | blend of `lin(primary_era_share, 0.25, 0.65)` (0.70) + `sat(primary_era_count, 120)` (0.30) |
| **Platform Loyalist** | `owned_titles ≥ 20` AND `top_platform_releases / total ≥ 0.45` | blend of `lin(share, 0.45, 0.85)` (0.65) + `sat(top, 80)` (0.35) |
| **Variant Hunter** | `collector_fields ≥ 80` (placeholder) | `sat(collector_fields, 120)` |

**Output:** 1 primary + up to 2 secondaries (score ≥ 55).

### 2.2 Collector Archetypes (`web/lib/identity/collector-archetypes.ts`)

Library-only; no play/trophy required.

| Archetype | Gate | Score Formula |
|-----------|------|---------------|
| **Archivist** | `owned_games ≥ 120` OR `owned_releases ≥ 160` | 75% sizeScore + 25% breadthScore |
| **Era Keeper** | `owned_games ≥ 80` AND top era share ≥ 45% | 65% concentration + 35% volume |
| **Platform Loyalist** | `owned_games ≥ 80` AND top platform share ≥ 55% | 70% concentration + 30% volume |

**Strength tiers:** `score ≥ 80` → core, `≥ 55` → strong, else emerging.

### 2.3 Insights Archetypes (`web/lib/archetypes/score.ts`)

| Archetype | Gate | Score Formula |
|-----------|------|---------------|
| **Completionist** | `earned ≥ 50` OR `completion ≥ 0.25` | 40×completion + bonuses (250 earned, 50 RA, 10k min playtime) |
| **Explorer** | `totalReleases ≥ 50` | platform diversity + era diversity + library size |
| **Retro Dabbler** | retro count ≥ 5 (early/nes/snes/ps1/ps2) | 60×share + RA bonus + volume bonus |
| **Era Identity** | `count ≥ 10` AND `era ≠ unknown` | 70×share + (count≥50 ? 30 : 0) |

**Strength tiers:** `score ≥ 75` → core, `≥ 55` → strong, `≥ 30` → emerging.

---

## 3. Tie Handling

### 3.1 Primary Era (SQL)

```sql
select distinct on (user_id) user_id, era_bucket as primary_era_key, releases as primary_era_count
from eras
order by user_id, releases desc
```

Tiebreaker: **releases desc**. If tied, order is undefined (Postgres `DISTINCT ON`).

### 3.2 Primary Era (JS `topEra`)

```ts
for (const [k, v] of Object.entries(stats.eraCounts || {})) {
  if (n > bestCount) { bestCount = n; best = k; }
}
```

Tiebreaker: **first era with max count** (iteration order).

### 3.3 Archetypes

```ts
const visible = results.filter(...).sort((a, b) => b.score - a.score);
const primary = visible[0];
const secondaries = visible.slice(1).filter((r) => r.score >= 55).slice(0, 2);
```

Tiebreaker: **highest score wins**. If scores tie, order is undefined (stable sort).

### 3.4 Collector Archetypes (from `docs/identity-evaluation-rules.md`)

When multiple collector archetypes qualify:
1. **Era Keeper** if `top_era_share >= 0.55`
2. Else **Archivist** if `owned_games >= 700`
3. Else **strongest score** among qualifying collector archetypes

---

## 4. Console / Platform → Era Mapping

### 4.1 Release-Year Buckets (Identity)

Era is derived from **game release year**, not platform. See table in §1.2.

### 4.2 Platform Catalog (`platform_catalog`)

`platform_catalog.era_key` maps platform to canonical era for display/routing. See `sql/2026-02-18_platform_catalog.sql`.

| platform_key | era_key |
|--------------|---------|
| atari_2600 | gen1_1972_1977 |
| nes | gen3_1983_1989 |
| snes | gen4_1990_1995 |
| gb | gen4_1990_1995 |
| genesis | gen4_1990_1995 |
| gbc | gen5_1996_1999 |
| n64 | gen5_1996_1999 |
| ps1 | gen5_1996_1999 |
| gamecube | gen6_2000_2005 |
| gba | gen6_2000_2005 |
| ps2 | gen6_2000_2005 |
| xbox | gen6_2000_2005 |
| ps3 | gen7_2006_2012 |
| xbox360 | gen7_2006_2012 |
| ps4 | gen8_2013_2019 |
| xbox_one | gen8_2013_2019 |
| ps5 | gen9_2020_plus |
| steam | gen9_2020_plus |
| psn | gen9_2020_plus |
| ra | null |

### 4.3 Legacy → Canonical Era Keys

`web/lib/identity/eras.ts` and `web/lib/identity/era-mapping.ts`:

| Legacy Bucket | Canonical Key |
|---------------|---------------|
| early_arcade_pre_crash | gen1_1972_1977 |
| gen2_1976_1984 | gen2_1978_1982 |
| 8bit_home | gen3_1983_1989 |
| gen3_1983_1992 | gen3_1983_1989 |
| gen4_1987_1996 | gen4_1990_1995 |
| 16bit | gen4_1990_1995 |
| gen5a_1993_1996 | gen5_1996_1999 |
| gen5b_1996_2001 | gen5_1996_1999 |
| 32_64bit | gen5_1996_1999 |
| gen6_1998_2005 | gen6_2000_2005 |
| ps2_xbox_gc | gen6_2000_2005 |
| gen7_2005_2012 | gen7_2006_2012 |
| hd_era | gen7_2006_2012 |
| ps4_xbo | gen8_2013_2019 |
| switch_wave | gen8_2013_2019 |
| modern | gen9_2020_plus |

### 4.4 Timeline Bucket (Played-On)

For Xbox: `timeline_bucket` uses `platform_gen` (xbox_og, xbox_360, xbox_one, xbox_series). For others: `era_bucket` (release-year). See `sql/played_on_timeline.sql`.

---

## 5. Result Computation Flow

1. **Identity signals:** `get_identity_signals(p_user_id)` returns `era_buckets`, `primary_era_key`, `primary_era_share`, `primary_era_count`, etc.
2. **Era history:** `user_era_history` stores quiz eras and precomputed `era_bonus_points`, `confidence_bonus`.
3. **Archetypes:** `computeArchetypes(signals)` or `computeCollectorArchetypes(identity, platformCounts)`.
4. **Build identity:** `buildIdentityFromSignals` merges signals, era history, archetypes into final payload.

---

## 6. Determinism & Weighting

- **Deterministic:** Same inputs → same outputs. No randomness.
- **Weighted:** Fixed weights (e.g. 0.6 achievements + 0.4 completions, 0.7 share + 0.3 depth).
- **Quiz intensity:** `obsessed` / `regular` / `dabble` are fixed multipliers, not random.

---

## 7. Result Phrasing

### 7.1 Strength Tiers (`web/lib/identity/archetypes.ts`)

| Tier | Label | Blurb |
|------|-------|-------|
| core | Core | "This is your signature." |
| strong | Strong | "A defining pattern." |
| emerging | Emerging | "Showing the signs." |

### 7.2 Verb Discipline (`.cursor/rules/identity-copy.mdc`)

- **Play signals:** played, completed, finished, returned to
- **Collector signals:** own, collect, curate, preserve
- **Inference:** looks like, tends to, often

**Never mix:** e.g. "You completed many PS2 games" when signal is ownership → use "You own a large PS2-era library".

### 7.3 Confidence Language

- **core** → declarative: "You are a Completionist."
- **strong** → soft declarative: "Completionist tendencies show up strongly."
- **emerging** → suggestive: "You may be leaning toward a Completionist style."

### 7.4 Example Copy

- "You've concentrated in one era."
- "Primary era: 45% · 120 titles"
- "90% of your library in PS2 Era"
- "You own a large PS2-era library"

### 7.5 Era Identity Labels (`web/lib/archetypes/score.ts`)

| Era Key | Label |
|---------|-------|
| early | Early Home Computing Era Player |
| nes | NES Era Player |
| snes | SNES Era Player |
| ps1 | PS1 Era Player |
| ps2 | PS2 Era Player |
| ps3_360 | PS3 / Xbox 360 Era Player |
| wii | Wii Era Player |
| modern | Modern Era Player |
| unknown | Era Player |

---

## 8. Related Files

| Concern | Location |
|--------|----------|
| Era quiz UI | `web/app/era-onboarding/page.tsx` |
| Era quiz API | `web/app/api/eras/route.ts` |
| Identity archetypes | `web/lib/identity/archetypes.ts` |
| Collector archetypes | `web/lib/identity/collector-archetypes.ts` |
| Insights archetypes | `web/lib/archetypes/score.ts` |
| Era normalization | `web/lib/identity/eras.ts`, `era-mapping.ts`, `normalize-era-key.ts` |
| Platform catalog | `sql/2026-02-18_platform_catalog.sql` |
| Identity signals RPC | `sql/get_identity_signals_rpc.sql` |
| Played-on timeline | `sql/played_on_timeline.sql` |
| Origin timeline | `sql/get_origin_timeline_rpc.sql` |
| Evaluation rules | `docs/identity-evaluation-rules.md` |
| Identity copy | `.cursor/rules/identity-copy.mdc` |
