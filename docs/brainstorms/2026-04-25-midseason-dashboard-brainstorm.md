# Brainstorm: Mid-Season Dashboard — Wolfpack Halfway Hustle

**Date:** 2026-04-25  
**Season:** Wolfpack - Halfway Hustle (8 teams, snake draft)

---

## What We're Building

A clean, modern public dashboard for the mid-season draft league. No side pots. The only thing that matters is the race for 1st/2nd/3rd based on **effective points** — what each team's drafted players score in the **second half** of IPL 2026 (April 25 onwards).

---

## The Three Metrics

| Metric | Definition | Purpose |
|---|---|---|
| **Points at Half** | Player points at draft time (from mid-season CSV import) | Baseline — what they brought in |
| **Effective Points** | Points earned April 25+ (live, second half only) | **The real competition metric** |
| **Total Points** | Points at Half + Effective | Full picture |

Standings are ranked by **Effective Points**.

---

## Why This Approach

- `Player.points` at import time = mid-season snapshot → stored as `points_at_draft`
- Cricbattle `update-scores` keeps `Player.points` as running total
- `effective = Player.points − Player.points_at_draft`
- Score history filtered to April 25+ matches only for the chart

This requires one DB migration (add `points_at_draft` to `players`) and updating the import router to capture the snapshot.

---

## Layout

```
┌─────────────────────────────────────────────────────────┐
│  WOLFPACK – HALFWAY HUSTLE          Last updated: today  │
│  8 teams · IPL 2026 Second Half                         │
└─────────────────────────────────────────────────────────┘

┌──────┐  ┌──────────────────────┐  ┌──────┐
│  2nd │  │        1st           │  │   3rd │
│      │  │     (podium)         │  │      │
└──────┘  └──────────────────────┘  └──────┘

┌─────────────────────────────────────────────────────────┐
│  STANDINGS TABLE                                        │
│  Rank | Team | At Half | Effective ▼ | Total           │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  EFFECTIVE POINTS RACE                                  │
│  Line chart: 8 team lines, match-by-match, 2nd half     │
└─────────────────────────────────────────────────────────┘
```

---

## Key Decisions

- **Rank by effective points** — not total, not half. Pure second-half performance.
- **Podium widget** for top 3 — visually prominent, 2nd | 1st | 3rd layout.
- **Line chart** shows effective points accumulation over second-half matches.
- **Dark card aesthetic** — modern IPL/sports feel, contrast with gold/silver/bronze accents.
- **No side pots** — simpler is better for this league.

---

## Resolved Questions

- Effective points = second half only (April 25+) ✓
- Season = "Wolfpack - Halfway Hustle" (8 teams) ✓
- Graph = effective points over time ✓
