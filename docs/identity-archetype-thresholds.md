# Archetype Thresholds (Locked v1)

All numbers assume **lifetime data**, not rolling windows.

## Shorthand metrics

(You already have or can derive them.)

| Symbol | Meaning |
|--------|--------|
| **G_started** | Games with any play evidence (time > 0, trophy earned, save detected) |
| **G_completed** | Games marked completed / platinum / 100% |
| **G_owned** | Owned titles (collector imports + digital libraries) |
| **G_curated** | Titles with tags, shelves, notes, variants, or custom fields |
| **H_total** | Total playtime hours |
| **H_top1 / H_top3** | Hours in top 1 / top 3 games |
| **E_distinct** | Distinct eras represented |
| **F_distinct** | Distinct franchises played/owned |

---

## 1. Completionist

**Eligibility gate (ANY one):**
- G_completed ≥ 15
- Platinums / 100% ≥ 5
- Completion ratio ≥ 40% and G_started ≥ 20

**Strength tiers:**
- Emerging: 15–24 completed
- Strong: 25–49 completed
- Core: 50+ completed

**Hard rule:** ❌ If G_completed < 10, Completionist is **locked out** no matter what.

---

## 2. Explorer

**Eligibility gate:**
- G_started ≥ 50
- Completion ratio ≤ 35%

**Strength tiers:**
- Emerging: 50–99 started
- Strong: 100–249 started
- Core: 250+ started

**Boosters:** F_distinct ≥ 10, Genre diversity ≥ 6. Collector ownership can help here but **never opens the gate alone**.

---

## 3. Core Memory Player

**Eligibility gate (ALL):**
- H_top1 ≥ 120 hours **OR** H_top3 ≥ 250 hours
- **AND** at least one replay or multi-year engagement signal

**Strength tiers:**
- Emerging: 120–199 top-game hours
- Strong: 200–399
- Core: 400+

This archetype is **intentionally exclusive**.

---

## 4. Backlog Wrestler

**Eligibility gate (ALL):**
- G_owned ≥ 100
- G_started / G_owned ≤ 60%

**Strength tiers:**
- Emerging: 100–199 owned
- Strong: 200–499 owned
- Core: 500+

**Variants:** “Digital-heavy” if >70% digital; “Physical-heavy” if >60% physical.

---

## 5. Live-Service Regular

**Eligibility gate:**
- ≥ 2 live-service titles
- H_live_service ≥ 300 hours

**Strength tiers:**
- Emerging: 300–599 hours
- Strong: 600–1,499 hours
- Core: 1,500+

**Reinforcement:** Seasonal achievement patterns, year-over-year engagement.

---

## 6. Speed / Mastery Specialist (optional v1.1)

**Eligibility gate:**
- Hardcore / difficulty achievements ≥ 10
- **OR** ≥ 3 games completed on max difficulty

**Strength tiers:**
- Emerging: 10–19 mastery signals
- Strong: 20–39
- Core: 40+

---

## Collector-First Archetypes (No play implied)

These are **equally primary** when play data is absent.

### 7. Archivist

**Eligibility gate (ANY):**
- G_owned ≥ 200
- G_curated ≥ 40
- ≥ 3 organization dimensions (tags + shelves + notes, etc.)

**Strength tiers:**
- Emerging: 200–399 owned
- Strong: 400–799
- Core: 800+

### 8. Era Keeper

**Eligibility gate:**
- ≥ 40% of G_owned in a **single era**
- **AND** ≥ 30 titles in that era

**Strength tiers:**
- Emerging: 30–59
- Strong: 60–149
- Core: 150+

### 9. Variant Hunter

**Eligibility gate:**
- ≥ 10 duplicate titles (same game, different variant/region/edition)

**Strength tiers:**
- Emerging: 10–24
- Strong: 25–74
- Core: 75+

### 10. Hardware Historian (future-ready)

**Eligibility gate:**
- ≥ 6 distinct systems
- ≥ 2 “non-mainstream” systems (e.g. Neo Geo, PC Engine, Atari)

**Strength tiers:**
- Emerging: 6–9 systems
- Strong: 10–19
- Core: 20+

### 11. Physical-First Nostalgist

**Eligibility gate:**
- ≥ 60% physical ownership
- ≥ 100 owned titles

**Strength tiers:**
- Emerging: 100–199
- Strong: 200–499
- Core: 500+

---

## Primary Archetype Selection Rule

If **multiple gates pass**:
1. **Highest strength score** wins
2. Tie-breaker: archetype with **stronger eligibility margin**

Secondary archetypes still surface as *“Also shows traits of…”*.

---

## Why these numbers work

- High enough to feel earned
- Collectors unlock meaning immediately
- Completionists can’t fake it
- Explorers aren’t shamed
- Scales cleanly to 2,000+ game libraries
- No future migration pain
