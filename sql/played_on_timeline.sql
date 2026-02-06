-- ============================================================
-- Played-on Generation Timeline (platform-generation lens)
-- Uses:
--  portfolio_entries + releases + games
--  psn_title_progress (release_id OR np_communication_id -> release_external_ids)
--  xbox_title_progress (release_id OR title_id -> release_external_ids)
--  steam_title_progress (+ fallback portfolio_entries.playtime_minutes for Steam releases)
--  ra_achievement_cache (payload->achievements)
-- ============================================================

with params as (
  select '4eb4629d-58da-43fa-835b-d9bc9f0adc67'::uuid as user_id
),

-- =========================
-- 1) Owned releases (spine)
-- =========================
owned as (
  select
    pe.user_id,
    pe.release_id,
    pe.playtime_minutes as portfolio_playtime_minutes,
    r.game_id,
    r.platform_key,
    r.display_title,
    r.cover_url as release_cover_url,
    g.canonical_title,
    g.igdb_game_id,
    g.cover_url as game_cover_url,
    g.first_release_year,
    r.release_date
  from portfolio_entries pe
  join releases r on r.id = pe.release_id
  left join games g on g.id = r.game_id
  join params p on p.user_id = pe.user_id
),

-- ==========================================
-- 2) Resolve per-release signals (deduped)
--    PSN/Xbox: allow mapping via release_external_ids
-- ==========================================
psn as (
  select
    p.user_id,
    coalesce(p.release_id, re.release_id) as release_id,
    max(coalesce(p.playtime_minutes, 0))::int as psn_playtime_minutes,
    max(coalesce(p.trophies_earned, 0))::int as psn_earned,
    max(coalesce(p.trophies_total, 0))::int as psn_total,
    max(coalesce(p.trophy_progress, 0))::int as psn_progress_pct,
    max(p.last_updated_at) as psn_last_updated_at,
    -- title_platform is used to infer generation
    max(p.title_platform) as psn_title_platform
  from psn_title_progress p
  join params pr on pr.user_id = p.user_id
  left join release_external_ids re
    on re.source = 'psn'
   and re.external_id = p.np_communication_id::text
  where coalesce(p.release_id, re.release_id) is not null
  group by p.user_id, coalesce(p.release_id, re.release_id)
),

xbox as (
  select
    x.user_id,
    coalesce(x.release_id, re.release_id) as release_id,
    max(coalesce(x.achievements_earned, 0))::int as xbox_earned,
    max(coalesce(x.achievements_total, 0))::int as xbox_total,
    max(coalesce(x.gamerscore_earned, 0))::int as xbox_gs_earned,
    max(coalesce(x.gamerscore_total, 0))::int as xbox_gs_total,
    max(coalesce(x.last_played_at, x.last_updated_at)) as xbox_last_signal_at,
    max(x.title_platform) as xbox_title_platform
  from xbox_title_progress x
  join params pr on pr.user_id = x.user_id
  left join release_external_ids re
    on re.source = 'xbox'
   and re.external_id = x.title_id::text
  where coalesce(x.release_id, re.release_id) is not null
  group by x.user_id, coalesce(x.release_id, re.release_id)
),

steam as (
  select
    s.user_id,
    s.release_id,
    max(coalesce(s.playtime_minutes, 0))::int as steam_playtime_minutes,
    max(s.last_updated_at) as steam_last_updated_at
  from steam_title_progress s
  join params pr on pr.user_id = s.user_id
  where s.release_id is not null
  group by s.user_id, s.release_id
),

-- Steam fallback playtime (only if no steam_title_progress row exists)
steam_fallback as (
  select
    o.user_id,
    o.release_id,
    coalesce(o.portfolio_playtime_minutes, 0)::int as steam_fallback_minutes
  from owned o
  left join steam s
    on s.user_id = o.user_id and s.release_id = o.release_id
  where lower(o.platform_key) = 'steam'
    and s.release_id is null
),

ra as (
  select
    rac.user_id,
    rac.release_id,
    -- earned/total from payload->achievements[]
    coalesce((
      select count(*)
      from jsonb_array_elements(coalesce(rac.payload->'achievements','[]'::jsonb)) a
      where (a->>'earned')::boolean = true
    ), 0)::int as ra_earned,
    coalesce((
      select count(*)
      from jsonb_array_elements(coalesce(rac.payload->'achievements','[]'::jsonb)) a
    ), 0)::int as ra_total,
    rac.fetched_at as ra_fetched_at
  from ra_achievement_cache rac
  join params pr on pr.user_id = rac.user_id
  where rac.release_id is not null
),

-- ==========================================
-- 3) Per-release unified row + played-on bucket
--    (Cannot reference column alias "release_year" in same SELECT; use expression.)
-- ==========================================
release_rows as (
  select
    o.user_id,
    o.release_id,
    o.game_id,
    coalesce(o.canonical_title, o.display_title) as title,
    coalesce(o.game_cover_url, o.release_cover_url) as cover_url,

    -- Signals
    coalesce(psn.psn_playtime_minutes, 0) as psn_playtime_minutes,
    coalesce(psn.psn_progress_pct, 0) as psn_progress_pct,
    coalesce(psn.psn_earned, 0) as psn_earned,
    coalesce(psn.psn_total, 0) as psn_total,
    psn.psn_title_platform,

    coalesce(xb.xbox_earned, 0) as xbox_earned,
    coalesce(xb.xbox_total, 0) as xbox_total,
    coalesce(xb.xbox_gs_earned, 0) as xbox_gs_earned,
    xb.xbox_title_platform,

    coalesce(st.steam_playtime_minutes, sf.steam_fallback_minutes, 0) as steam_minutes,

    coalesce(ra.ra_earned, 0) as ra_earned,
    coalesce(ra.ra_total, 0) as ra_total,

    greatest(
      coalesce(psn.psn_last_updated_at, '1970-01-01'::timestamptz),
      coalesce(xb.xbox_last_signal_at, '1970-01-01'::timestamptz),
      coalesce(st.steam_last_updated_at, '1970-01-01'::timestamptz),
      coalesce(ra.ra_fetched_at, '1970-01-01'::timestamptz)
    ) as last_signal_at,

    -- For retro bucketing fallback (if we only know "retro" but want a sub-era)
    coalesce(
      o.first_release_year,
      case when o.release_date is not null then extract(year from o.release_date)::int end
    ) as release_year,

    -- -------- Played-on platform (dominant / deterministic) --------
    case
      when psn.release_id is not null then 'playstation'
      when xb.release_id  is not null then 'xbox'
      when st.release_id  is not null or sf.release_id is not null then 'pc'
      when ra.release_id  is not null then 'retro'
      else 'unknown'
    end as played_on_platform,

    -- -------- Played-on generation (derived) --------
    -- Use inline expression for retro year; cannot reference release_year alias in same SELECT.
    case
      when psn.release_id is not null then
        case
          when coalesce(psn.psn_title_platform,'') ilike '%ps5%' then 'ps5'
          when coalesce(psn.psn_title_platform,'') ilike '%ps4%' then 'ps4'
          when coalesce(psn.psn_title_platform,'') ilike '%ps3%' then 'ps3'
          when coalesce(psn.psn_title_platform,'') ilike '%vita%' then 'ps_vita'
          when coalesce(psn.psn_title_platform,'') ilike '%psp%' then 'psp'
          else 'playstation_unknown'
        end
      when xb.release_id is not null then
        case
          when coalesce(xb.xbox_title_platform,'') ilike '%series%' then 'xbox_series'
          when coalesce(xb.xbox_title_platform,'') ilike '%one%' then 'xbox_one'
          when coalesce(xb.xbox_title_platform,'') ilike '%360%' then 'xbox_360'
          else 'xbox_unknown'
        end
      when (st.release_id is not null or sf.release_id is not null) then 'pc_steam'
      when ra.release_id is not null then
        case
          when coalesce(o.first_release_year, case when o.release_date is not null then extract(year from o.release_date)::int end) is null then 'retro_unknown'
          when coalesce(o.first_release_year, case when o.release_date is not null then extract(year from o.release_date)::int end) <= 1979 then 'retro_early'
          when coalesce(o.first_release_year, case when o.release_date is not null then extract(year from o.release_date)::int end) between 1980 and 1989 then 'retro_8bit'
          when coalesce(o.first_release_year, case when o.release_date is not null then extract(year from o.release_date)::int end) between 1990 and 1995 then 'retro_16bit'
          when coalesce(o.first_release_year, case when o.release_date is not null then extract(year from o.release_date)::int end) between 1996 and 2000 then 'retro_32_64'
          when coalesce(o.first_release_year, case when o.release_date is not null then extract(year from o.release_date)::int end) between 2001 and 2005 then 'retro_ps2_xbox_gc'
          when coalesce(o.first_release_year, case when o.release_date is not null then extract(year from o.release_date)::int end) between 2006 and 2012 then 'retro_hd'
          else 'retro_modern'
        end
      else 'unknown'
    end as played_on_gen
  from owned o
  left join psn psn on psn.user_id = o.user_id and psn.release_id = o.release_id
  left join xbox xb on xb.user_id  = o.user_id and xb.release_id  = o.release_id
  left join steam st on st.user_id = o.user_id and st.release_id = o.release_id
  left join steam_fallback sf on sf.user_id = o.user_id and sf.release_id = o.release_id
  left join ra ra on ra.user_id   = o.user_id and ra.release_id   = o.release_id
),

-- ==========================================
-- 4) Score releases for "notable" selection
--    (achievements > playtime > recency)
-- ==========================================
scored as (
  select
    rr.*,
    (
      -- achievements component
      (case when rr.psn_progress_pct > 0 then rr.psn_progress_pct / 100.0 else 0 end)
      + (case when rr.xbox_gs_earned > 0 then least(1.0, rr.xbox_gs_earned / 1000.0) else 0 end)
      + (case when rr.ra_total > 0 then rr.ra_earned::float / rr.ra_total else 0 end)
    ) * 100.0
    +
    (
      (rr.steam_minutes + rr.psn_playtime_minutes)::float / 6000.0
    ) * 10.0
    +
    (
      extract(epoch from rr.last_signal_at) / 1e12
    ) as notable_score
  from release_rows rr
  where rr.played_on_gen <> 'unknown'
),

-- ==========================================
-- 5) Aggregate by played_on_gen
-- ==========================================
era_stats as (
  select
    user_id,
    played_on_gen as era,
    count(distinct game_id) as games,
    count(distinct release_id) as releases,
    sum(psn_earned + xbox_earned + ra_earned)::int as achievements_earned,
    sum(psn_total  + xbox_total  + ra_total )::int as achievements_total,
    sum(steam_minutes + psn_playtime_minutes)::int as minutes_played
  from scored
  group by user_id, played_on_gen
),

-- Rank eras by dominance (games first, then releases)
ranked as (
  select
    es.*,
    dense_rank() over (partition by es.user_id order by es.games desc, es.releases desc) as rank
  from era_stats es
),

-- Notable: top 3 per era
notable_ranked as (
  select
    s.user_id,
    s.played_on_gen as era,
    s.release_id,
    s.title,
    s.cover_url,
    row_number() over (partition by s.user_id, s.played_on_gen order by s.notable_score desc) as rn
  from scored s
),

-- Labels for UI
labels as (
  select * from (values
    ('ps5', 'PlayStation 5', '2020+'),
    ('ps4', 'PlayStation 4', '2013–2020'),
    ('ps3', 'PS3 / Trophy Era', '2006–2013'),
    ('ps_vita', 'PS Vita', ''),
    ('psp', 'PSP', ''),
    ('xbox_series', 'Xbox Series', '2020+'),
    ('xbox_one', 'Xbox One', '2013–2020'),
    ('xbox_360', 'Xbox 360 / Achievement Era', '2005–2013'),
    ('pc_steam', 'PC (Steam)', ''),
    ('retro_early', 'Early (Atari / Pre-crash)', '≤1979'),
    ('retro_8bit', '8-bit Home Era', '1980–1989'),
    ('retro_16bit', '16-bit Era', '1990–1995'),
    ('retro_32_64', '32/64-bit Era', '1996–2000'),
    ('retro_ps2_xbox_gc', 'PS2 / OG Xbox / GC', '2001–2005'),
    ('retro_hd', 'Retro HD (PS3/360 gen)', '2006–2012'),
    ('retro_modern', 'Retro (Modern Releases)', '2013+'),
    ('playstation_unknown', 'PlayStation', ''),
    ('xbox_unknown', 'Xbox', ''),
    ('retro_unknown', 'Retro', '')
  ) as t(era, label, years)
)

select jsonb_build_object(
  'ok', true,
  'user_id', (select user_id from params),
  'mode', 'played_on_gen',
  'eras', (
    select jsonb_agg(
      jsonb_build_object(
        'era', r.era,
        'label', coalesce(l.label, r.era),
        'years', coalesce(l.years, ''),
        'rank', r.rank,
        'games', r.games,
        'releases', r.releases,
        'topSignals', jsonb_build_array(
          jsonb_build_object('key','achievements','label', format('Achievements: %s/%s', r.achievements_earned, r.achievements_total)),
          jsonb_build_object('key','playtime','label', format('Playtime: %sh', (r.minutes_played/60)))
        ),
        'notable', (
          select coalesce(
            jsonb_agg(
              jsonb_build_object(
                'release_id', n.release_id,
                'title', n.title,
                'cover_url', n.cover_url
              )
              order by n.rn
            ) filter (where n.rn <= 3),
            '[]'::jsonb
          )
          from notable_ranked n
          where n.user_id = r.user_id
            and n.era = r.era
        )
      )
      order by r.rank
    )
    from ranked r
    left join labels l on l.era = r.era
  )
) as timeline;
