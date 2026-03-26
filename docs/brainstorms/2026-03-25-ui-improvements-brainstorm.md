# Brainstorm: UI Improvements — Password Reset, Name Updates, Unified League Home

**Date:** 2026-03-25
**Status:** Ready for planning

---

## What We're Building

Three related quality-of-life improvements to the IPL fantasy platform:

1. **Password reset** — A "Forgot password?" link on the login page lets users generate a one-time temporary password shown on screen. Admin can also reset any user's password from the admin panel.
2. **Name updates** — Users can update both their account display name (global) and their team name within a season (per-season).
3. **Unified league home** — Merge the duplicated `page-league` and `page-season` pages into a single `/league/:leagueId` page with Standings, Draft Room, and Settings (admin-only) tabs. Post-draft redirect goes to league home.

---

## Why This Approach

### Password Reset: Temp password shown on screen
- No email infrastructure needed for this invite-only platform
- Simple and immediately useful
- Force-change-on-next-login ensures temp passwords aren't left in use
- Admin reset covers edge cases where the user can't remember their email

### Name Updates: Profile modal + in-line team rename
- Display name change belongs at account level (accessible from nav bar)
- Team rename is already partially present in `page-season` — make it prominent and keep it in the unified league home
- Decoupled: display name doesn't affect team name or vice versa

### Unified League Home at `/league/:leagueId`
- Users join leagues via invite codes — they think in terms of "my league"
- `page-season` currently serves admin settings that aren't discoverable from the league view
- Merging removes duplicated tab chrome (CSS copy-paste) and confusing dual-URL navigation
- `/season/:seasonId` route becomes a redirect to the league home
- Post-draft redirect to `/league/:leagueId` gives users a natural landing spot (standings)

---

## Key Decisions

### 1. Password Reset Flow
- **Entry point:** "Forgot password?" link on the login page (below the login form)
- **Flow:** User enters their email → backend generates a random temp password, stores it hashed → shows the temp password once on screen in a copy-able box → user logs in with it → on next login (or via profile settings) they set a permanent password
- **Force change:** `must_change_password: bool` flag on the User model; after login with temp password, user is redirected to a "Set new password" prompt before accessing the app
- **Admin reset:** In the unified Settings tab, admin can see the user list and trigger a password reset for any user, displaying the generated temp password in a modal

### 2. Display Name Update
- **Where:** Profile settings modal, accessible by clicking the user's name/avatar in the nav bar
- **What can be changed:** Display name + password (new password + confirm, requires current password OR temp-password flow)
- **Team name:** Remains in the league home's Standings or Draft Room tab — each user can rename their own team inline (already exists in `page-season`, will be carried over)

### 3. Unified League Home Tab Structure

| Tab | Who sees it | Content |
|-----|------------|---------|
| **Home** | All | Pre-draft: team grid ordered by draft position, team rename for own team. Post-draft / active: standings leaderboard with expandable rosters and points |
| **Draft Room** | All | Season status badge, invite code (pre-draft), player pool link, enter/preview draft room button. Admin: Start Draft, End Draft controls |
| **Settings** | Admin only | Season rename, delete season, draft rules (rounds, timer, timeout behavior, role limits), draft order reorder, player import/clear |

### 4. Routing Changes
- `/league/:leagueId` — unified page (replaces `page-league`, absorbs `page-season` content)
- `/season/:seasonId` — redirect to `/league/:leagueId` (league is loaded from season's league_id)
- Post-draft WebSocket completion: redirect to `/league/:leagueId` instead of `/season/:seasonId`
- "Go to League →" banner link on draft completion: points to `/league/:leagueId`

---

## Resolved Questions

- **Password reset method:** Temp password shown on screen (no email). Admin can also reset.
- **Which name?** Both display name (account-level) and team name (season-level).
- **Which URL becomes canonical?** `/league/:leagueId`.

---

## Open Questions

_None — all major decisions resolved._

---

## Out of Scope

- Email-based password reset (can be added later when email infrastructure is set up)
- Multi-season support per league (future)
- Admin user promotion via UI (still DB-only)
