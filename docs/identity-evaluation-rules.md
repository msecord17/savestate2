# Identity evaluation rules

How to compute **Emerging / Strong / Core** and resolve multiple qualifying archetypes. Single source of truth for scorer and copy.

---

## Order of operations

1. **Check eligibility gates first.**  
   An archetype is only considered if the user passes that archetype’s eligibility rules (see `docs/archetypes.collectors.json` or equivalent: `eligibility.any` / `eligibility.all`).

2. **If eligible, assign the highest tier whose rules pass.**  
   For that archetype, evaluate strength tiers in order (e.g. core → strong → emerging). The user gets the **highest** tier for which **all** rules in that tier’s `all` array pass.

3. **If multiple collector archetypes qualify**, pick one using the tiebreaker below.

---

## Tiebreaker: multiple collector archetypes

When more than one collector archetype is eligible, choose the primary as follows:

1. **Era Keeper** if `top_era_share >= 0.55`.
2. Else **Archivist** if `owned_games >= 700`.
3. Else **strongest score** — e.g. simple sum of normalized metrics for each qualifying archetype; pick the one with the highest score.

(Other archetypes, e.g. play-based Completionist / Explorer, are evaluated separately; this tiebreaker applies only among **collector** archetypes.)

---

## Language rules

- **Collector archetypes** must use **own / collect / curate** (and similar) in copy.  
  Drawer copy, strength blurbs, and signals explanations must stay in collector language.

- **Never** use **played / completed** (or other play verbs) when the underlying signal is **ownership** (e.g. library size, era distribution, platform count).  
  Ownership-derived signals → collector verbs only. Play-derived signals (trophies, playtime, completions) can use play verbs in play archetypes.

---

## Reference

- Archetype definitions (eligibility, strength tiers, drawer copy): `docs/archetypes.collectors.json`
- Identity copy and verb discipline: `docs/identity-archetype-copy.md` (and related identity-*.md)
