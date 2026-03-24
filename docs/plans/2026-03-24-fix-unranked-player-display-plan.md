---
title: "fix: Unranked player display in draft room"
type: fix
status: active
date: 2026-03-24
origin: docs/plans/2026-03-23-feat-draft-room-enhancements-plan.md
---

# fix: Unranked Player Display in Draft Room

## Overview

Some players imported without a `Ranking` column will have `ranking = NULL`. Currently they show `—` in the rank badge and sort to the bottom alphabetically. The question: should `0` be used instead of `NULL`?

**Decision: No. Keep `NULL`. Do not use `0`.**

Using `0` as a sentinel for "unranked" breaks the sort: `0 < 1`, so unranked players would sort **before** rank 1 — placing the unknown-quality players at the very top of the Available Players list. That is the opposite of the desired behaviour.

The current `NULLS LAST` sort is correct. The only improvement worth making is the display label.

---

## Problem Statement

When an admin imports players without a `Ranking` column:
- Their `ranking` is `NULL` in the database ✓ (correct)
- They sort to the bottom, alphabetically within the unranked group ✓ (correct)
- They display `—` in the rank badge column — mildly unclear to users

A clearer label would help users understand immediately that a player simply hasn't been ranked yet, rather than wondering whether `—` means something is broken.

---

## Proposed Solution

**Frontend only — no DB or backend change.**

Replace the `—` fallback with `NR` (Not Ranked) in the rank badge:

**File:** `frontend/src/pages/page-snake-draft.ts`

```typescript
// Current
<span class="player-rank">${p.ranking != null ? p.ranking : '—'}</span>

// New
<span class="player-rank">${p.ranking != null ? p.ranking : 'NR'}</span>
```

Optionally mute the `NR` label more strongly than ranked numbers to reduce visual noise:

```css
/* Add to .player-rank rule */
.player-rank.unranked { opacity: 0.4; }
```

Or inline:
```typescript
<span class="player-rank" style="${p.ranking == null ? 'opacity:0.4;' : ''}">
  ${p.ranking != null ? p.ranking : 'NR'}
</span>
```

---

## Why NOT `0`

| Approach | Sort position | Visual | Verdict |
|----------|--------------|--------|---------|
| `NULL` + NULLS LAST | Bottom of list ✓ | `—` or `NR` | ✓ Correct |
| `0` | **Top of list** (0 < 1) | `0` | ✗ Wrong |
| Negative number | Top of list | `-1` | ✗ Wrong |
| Very large number (e.g. 9999) | Bottom ✓ | `9999` | Cluttered, misleading |

`NULL` with `NULLS LAST` is the cleanest sentinel for "no rank assigned".

---

## Acceptance Criteria

- [ ] Players with `ranking = NULL` continue to sort below all ranked players
- [ ] Within the unranked group, players still sort alphabetically
- [ ] The rank badge shows `NR` instead of `—` for unranked players
- [ ] `NR` is visually muted (lower opacity) to reduce noise compared to numeric ranks
- [ ] No DB migration required

## Sources

- Current sort logic: `backend/app/routers/players.py:39` — `order_by(Player.ranking.asc().nulls_last(), Player.name.asc())`
- Rank badge: `frontend/src/pages/page-snake-draft.ts` — `filteredPlayers` getter and player row template
- Origin plan: [docs/plans/2026-03-23-feat-draft-room-enhancements-plan.md](2026-03-23-feat-draft-room-enhancements-plan.md)
