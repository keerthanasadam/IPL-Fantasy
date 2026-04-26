import { LitElement, html, css, nothing, svg } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { sharedStyles } from '../styles/shared-styles.js';
import { api } from '../services/api.js';
import { isAdmin } from '../services/auth.js';
import '../components/csv-uploader.js';

/* ── Types ── */
interface Standing { rank: number; team_name: string; owner_name: string | null; total_points: number; points_at_half?: number | null; effective_points?: number | null }
interface BoundaryEntry { rank: number; team_name: string; owner_name: string | null; total_fours: number; total_sixes: number; boundary_points: number }
interface CaptainEntry { rank: number; team_name: string; owner_name: string | null; captain: string | null; vice_captain: string | null; total_points: number }
interface AwesomeEntry { rank: number; team_name: string; owner_name: string | null; batter: string | null; bowler: string | null; allrounder: string | null; total_points: number }
interface Prediction { team_name: string; owner_name: string | null; ipl_winner: string | null; orange_cap: string | null; purple_cap: string | null; ipl_mvp: string | null }
interface PredictionActuals { ipl_winner: string | null; orange_cap: string[] | null; purple_cap: string[] | null; ipl_mvp: string | null }
interface ScoreHistoryEntry { match_id: string; match_label: string; team_points: Record<string, number> }
interface TopScorer { player_name: string; ipl_team: string | null; designation: string | null; total_points: number; fantasy_team: string | null; owner_name: string | null; draft_round: number | null }
interface UndraftedScorer { player_name: string; ipl_team: string | null; designation: string | null; total_points: number }
interface RosterPlayer { player_name: string; ipl_team: string | null; designation: string | null; total_points: number; total_boundaries: number; draft_round: number }
interface Roster { team_name: string; owner_name: string | null; total_points: number; players: RosterPlayer[] }
interface PrizePool { first: number; second: number; third: number; side_pot_each: number }

interface DashboardData {
  league_name: string;
  season_label: string;
  last_updated: string | null;
  matches_played: number;
  standings: Standing[];
  boundary_pot: BoundaryEntry[];
  captain_vc_pot: CaptainEntry[];
  awesome_threesome_pot: AwesomeEntry[];
  predictions: Prediction[];
  prediction_actuals: PredictionActuals | null;
  score_history: ScoreHistoryEntry[];
  top_scorers: TopScorer[];
  top_undrafted: UndraftedScorer[];
  rosters: Roster[];
  prize_pool: PrizePool;
  is_midseason: boolean;
}

type SortOption = 'points-desc' | 'round-asc' | 'round-desc';

const TEAM_COLORS = [
  '#818cf8', '#34d399', '#f472b6', '#fb923c', '#a78bfa',
  '#38bdf8', '#4ade80', '#e879f9', '#fbbf24', '#f87171',
];

const MEDAL = ['', '\u{1F947}', '\u{1F948}', '\u{1F949}'];

@customElement('page-public-dashboard')
export class PagePublicDashboard extends LitElement {
  static styles = [
    sharedStyles,
    css`
      :host {
        display: block;
        scroll-behavior: smooth;
      }

      /* ── Hero ── */
      .hero {
        text-align: center;
        padding: 3rem 1rem 2rem;
      }
      .hero-title {
        font-size: 2.8rem;
        font-weight: 800;
        background: linear-gradient(135deg, #818cf8 0%, #a855f7 50%, #ec4899 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        line-height: 1.1;
        margin-bottom: 0.5rem;
      }
      .hero-subtitle {
        font-size: 1.15rem;
        color: var(--text-muted);
        margin-bottom: 1rem;
      }
      .hero-meta {
        display: flex;
        gap: 1rem;
        justify-content: center;
        align-items: center;
        flex-wrap: wrap;
        font-size: 0.85rem;
        color: var(--text-subtle);
      }
      .matches-badge {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        background: var(--bg-secondary);
        padding: 0.3rem 0.8rem;
        border-radius: 999px;
        font-weight: 600;
        color: var(--text-primary);
        font-size: 0.8rem;
      }
      .prize-bar {
        display: flex;
        gap: 1.5rem;
        justify-content: center;
        flex-wrap: wrap;
        margin-top: 1.25rem;
        padding: 0.75rem 1.5rem;
        background: var(--bg-card);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 12px;
        display: inline-flex;
        font-size: 0.9rem;
        font-weight: 600;
      }
      .prize-item { display: flex; align-items: center; gap: 0.3rem; }
      .prize-amount { color: var(--accent); }

      /* ── Section titles ── */
      .section-title {
        font-size: 1.3rem;
        font-weight: 700;
        color: var(--text-primary);
        margin: 2.5rem 0 1rem;
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      .section-icon { font-size: 1.4rem; }

      /* ── Leaderboard (full width, separate) ── */
      .leaderboard-section {
        margin-bottom: 1rem;
      }

      /* ── Side pots grid ── */
      .side-pots-section { position: relative; }
      .side-pots-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
      }

      /* ── Carousel dots (hidden on desktop) ── */
      .carousel-dots {
        display: none;
        justify-content: center;
        align-items: center;
        gap: 6px;
        margin-top: 0.75rem;
      }
      .carousel-dot {
        height: 6px;
        width: 6px;
        border-radius: 3px;
        background: rgba(255,255,255,0.18);
        transition: width 0.25s ease, background 0.25s ease;
        cursor: pointer;
      }
      .carousel-dot.active {
        width: 20px;
        background: var(--accent);
      }

      /* ── Glass card ── */
      .glass-card {
        background: var(--bg-card);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 12px;
        padding: 1.25rem;
        backdrop-filter: blur(10px);
        transition: transform 0.15s, box-shadow 0.15s;
      }
      .glass-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 24px rgba(0,0,0,0.2);
      }
      .card-header {
        font-size: 1rem;
        font-weight: 700;
        margin-bottom: 1rem;
        display: flex;
        align-items: center;
        gap: 0.4rem;
        color: var(--text-primary);
      }

      .card-subtitle {
        font-size: 0.75rem;
        color: var(--text-muted, #94a3b8);
        margin: -0.75rem 0 0.75rem 0;
        font-weight: 400;
      }

      /* ── Podium cards (top 3) ── */
      .podium { display: flex; gap: 0.75rem; margin-bottom: 1rem; }
      .podium-card {
        flex: 1;
        text-align: center;
        padding: 1rem 0.75rem;
        border-radius: 12px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.06);
        transition: transform 0.2s, box-shadow 0.2s;
      }
      .podium-card.gold {
        border-color: rgba(251,191,36,0.5);
        background: rgba(251,191,36,0.07);
        box-shadow: 0 0 30px rgba(251,191,36,0.13);
        transform: translateY(-8px);
      }
      .podium-card.silver { border-color: rgba(6,182,212,0.35); background: rgba(6,182,212,0.06); }
      .podium-card.bronze { border-color: rgba(244,63,94,0.35); background: rgba(244,63,94,0.06); }
      .podium-medal { font-size: 1.6rem; }
      .podium-team { font-size: 0.85rem; font-weight: 700; margin: 0.25rem 0; color: var(--text-primary); }
      .podium-owner { font-size: 0.72rem; color: var(--text-muted); }
      .podium-points { font-size: 1.4rem; font-weight: 800; margin-top: 0.3rem; }
      .podium-points.gold  { color: #fbbf24; }
      .podium-points.silver{ color: #06b6d4; }
      .podium-points.bronze{ color: #f87171; }

      /* ── Tables ── */
      .dash-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
      .dash-table th {
        text-align: left;
        padding: 0.45rem 0.5rem;
        color: var(--text-subtle);
        font-size: 0.72rem;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        border-bottom: 1px solid var(--border-color);
      }
      .dash-table td {
        padding: 0.45rem 0.5rem;
        border-bottom: 1px solid rgba(255,255,255,0.04);
      }
      .dash-table tr:nth-child(even) { background: rgba(255,255,255,0.03); }
      .dash-table .rank { color: var(--text-subtle); font-weight: 600; width: 2rem; }
      .dash-table .pts { font-weight: 700; color: var(--accent); text-align: right; }
      .dash-table .team-name { font-weight: 600; }
      .dash-table .owner { color: var(--text-muted); font-size: 0.78rem; }

      /* ── Boundary bar ── */
      .boundary-bar {
        height: 6px;
        border-radius: 3px;
        background: rgba(255,255,255,0.06);
        margin-top: 0.25rem;
        overflow: hidden;
      }
      .boundary-fill {
        height: 100%;
        border-radius: 3px;
        transition: width 0.6s ease;
      }
      .boundary-detail {
        font-size: 0.7rem;
        color: var(--text-subtle);
        margin-top: 0.15rem;
      }

      /* ── Top scorers hero ── */
      .top-scorer-heroes {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
        margin-bottom: 1.5rem;
      }
      .scorer-hero {
        padding: 1.5rem;
        border-radius: 12px;
        background: var(--bg-card);
        border: 1px solid rgba(255,255,255,0.08);
        position: relative;
        overflow: hidden;
      }
      .scorer-hero::before {
        content: '';
        position: absolute;
        top: 0; right: 0;
        width: 120px; height: 120px;
        border-radius: 50%;
        opacity: 0.08;
        transform: translate(30%, -30%);
      }
      .scorer-hero:first-child::before { background: var(--accent); }
      .scorer-hero:last-child::before { background: #34d399; }
      .scorer-rank-badge {
        display: inline-block;
        font-size: 0.7rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        padding: 0.2rem 0.6rem;
        border-radius: 999px;
        margin-bottom: 0.75rem;
      }
      .scorer-rank-badge.first { background: rgba(129,140,248,0.15); color: var(--accent); }
      .scorer-rank-badge.second { background: rgba(52,211,153,0.15); color: #34d399; }
      .scorer-name { font-size: 1.4rem; font-weight: 800; color: var(--text-primary); }
      .scorer-meta { font-size: 0.82rem; color: var(--text-muted); margin: 0.35rem 0; }
      .scorer-points { font-size: 2rem; font-weight: 800; color: var(--accent); }
      .scorer-points-label { font-size: 0.75rem; color: var(--text-subtle); font-weight: 600; text-transform: uppercase; }

      /* ── Predictions table ── */
      .predictions-grid {
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
      }
      .predictions-grid .dash-table { min-width: 650px; }
      .pick-correct {
        color: #4ade80;
        font-weight: 700;
      }
      .predictions-grid .pts { white-space: nowrap; }

      /* ── Roster accordion ── */
      .roster-controls {
        display: flex;
        gap: 0.75rem;
        margin-bottom: 1rem;
        flex-wrap: wrap;
        align-items: center;
      }
      .roster-search {
        flex: 1;
        min-width: 200px;
        max-width: 400px;
      }
      .roster-sort {
        width: auto;
        min-width: 160px;
      }
      details.roster-team {
        margin-bottom: 0.5rem;
        border-radius: 10px;
        overflow: hidden;
        border: 1px solid rgba(255,255,255,0.06);
        background: var(--bg-card);
      }
      details.roster-team[open] {
        border-color: rgba(129,140,248,0.25);
      }
      summary.roster-summary {
        padding: 0.75rem 1rem;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        font-weight: 600;
        list-style: none;
        transition: background 0.15s;
        user-select: none;
      }
      summary.roster-summary::-webkit-details-marker { display: none; }
      summary.roster-summary::before {
        content: '\u25B6';
        font-size: 0.65rem;
        color: var(--text-subtle);
        transition: transform 0.2s;
      }
      details.roster-team[open] > summary.roster-summary::before {
        transform: rotate(90deg);
      }
      summary.roster-summary:hover { background: rgba(255,255,255,0.04); }
      .roster-summary-rank {
        font-size: 0.75rem;
        color: var(--text-subtle);
        min-width: 1.5rem;
      }
      .roster-summary-name { flex: 1; }
      .roster-summary-owner { color: var(--text-muted); font-size: 0.82rem; font-weight: 400; }
      .roster-summary-pts { font-weight: 700; color: var(--accent); }
      .roster-players {
        padding: 0 1rem 0.75rem;
      }
      .roster-players .dash-table td { font-size: 0.8rem; }
      .roster-players .round-badge {
        display: inline-block;
        width: 1.6rem;
        text-align: center;
        font-size: 0.7rem;
        font-weight: 700;
        padding: 0.1rem 0;
        border-radius: 4px;
        background: var(--bg-secondary);
        color: var(--text-muted);
      }
      .designation-badge {
        display: inline-block;
        font-size: 0.65rem;
        font-weight: 700;
        padding: 0.1rem 0.35rem;
        border-radius: 4px;
        text-transform: uppercase;
      }
      .des-BAT { background: rgba(59,130,246,0.15); color: #60a5fa; }
      .des-BOWL { background: rgba(239,68,68,0.15); color: #f87171; }
      .des-AR { background: rgba(168,85,247,0.15); color: #c084fc; }
      .des-WK { background: rgba(34,197,94,0.15); color: #4ade80; }

      .search-highlight {
        background: rgba(129,140,248,0.3);
        border-radius: 2px;
        padding: 0 2px;
      }

      /* ── Score history chart ── */
      .chart-card {
        background: var(--bg-card);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 12px;
        padding: 1.25rem;
        margin-bottom: 1rem;
      }
      .chart-title {
        font-size: 1rem;
        font-weight: 700;
        color: var(--text-primary);
        margin-bottom: 1rem;
        display: flex;
        align-items: center;
        gap: 0.4rem;
      }
      .chart-svg-wrap {
        width: 100%;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
      }
      .chart-svg-wrap svg {
        display: block;
        min-width: 480px;
        width: 100%;
      }
      .chart-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem 1rem;
        margin-top: 0.75rem;
      }
      .legend-item {
        display: flex;
        align-items: center;
        gap: 0.35rem;
        font-size: 0.75rem;
        color: var(--text-muted);
      }
      .legend-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      /* ── Midseason theme ── */
      .ms-hero-eyebrow {
        font-size: 0.72rem; font-weight: 800; letter-spacing: 0.14em;
        text-transform: uppercase; color: #f97316; margin-bottom: 0.4rem;
      }
      .ms-hero-title {
        background: linear-gradient(135deg, #f97316 0%, #fbbf24 40%, #f43f5e 100%);
        -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
      }
      .ms-podium-card.gold  { border-color: rgba(251,191,36,0.5)!important; background: rgba(251,191,36,0.07)!important; box-shadow: 0 0 30px rgba(251,191,36,0.12)!important; transform: translateY(-6px); }
      .ms-podium-card.silver{ border-color: rgba(6,182,212,0.35)!important; background: rgba(6,182,212,0.06)!important; }
      .ms-podium-card.bronze{ border-color: rgba(244,63,94,0.35)!important; background: rgba(244,63,94,0.06)!important; }
      .ms-gold-pts   { color: #fbbf24!important; }
      .ms-silver-pts { color: #06b6d4!important; }
      .ms-bronze-pts { color: #f43f5e!important; }
      .ms-podium-sub { font-size: 0.72rem; color: var(--text-muted); margin-top: 0.4rem; }
      .ms-effective  { font-weight: 800; color: #f97316; }
      .ms-section-title { color: #f97316; }
      .ms-rank-badge-1 { background: rgba(251,191,36,0.2)!important; color: #fbbf24!important; }
      .ms-rank-badge-2 { background: rgba(6,182,212,0.2)!important;  color: #06b6d4!important; }
      .ms-rank-badge-3 { background: rgba(244,63,94,0.2)!important;  color: #f43f5e!important; }

      /* ── Admin ── */
      .admin-section {
        margin-top: 2rem;
        padding: 1.25rem;
        background: var(--bg-card);
        border: 1px solid rgba(239,68,68,0.2);
        border-radius: 12px;
      }
      .admin-section h3 { color: #f87171; }
      .admin-msg { font-size: 0.85rem; margin-top: 0.75rem; padding: 0.5rem; border-radius: 6px; }
      .admin-msg.success { background: rgba(34,197,94,0.1); color: #4ade80; }
      .admin-msg.error { background: rgba(239,68,68,0.1); color: #f87171; }

      /* ── States ── */
      .loading-wrap, .error-wrap, .empty-wrap {
        text-align: center;
        padding: 4rem 1rem;
      }
      .spinner {
        display: inline-block;
        width: 40px; height: 40px;
        border: 3px solid var(--border-color);
        border-top-color: var(--accent);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      .error-wrap h2 { color: #ef4444; }
      .empty-msg { color: var(--text-muted); font-size: 0.95rem; }

      /* ── Responsive ── */
      @media (max-width: 768px) {
        .hero-title { font-size: 2rem; }
        .side-pots-grid {
          grid-template-columns: none;
          display: flex;
          overflow-x: auto;
          scroll-snap-type: x mandatory;
          -webkit-overflow-scrolling: touch;
          gap: 0.75rem;
          padding-bottom: 0.5rem;
          scrollbar-width: none;
        }
        .side-pots-grid::-webkit-scrollbar { display: none; }
        .side-pots-grid > .glass-card {
          flex: 0 0 88%;
          scroll-snap-align: start;
          min-width: 0;
        }
        .side-pots-grid::after {
          content: '';
          flex: 0 0 1px;
        }
        .carousel-dots { display: flex; }
        .top-scorer-heroes { grid-template-columns: 1fr; }
        .podium { flex-direction: column; }
        .scorer-name { font-size: 1.15rem; }
        .scorer-points { font-size: 1.5rem; }
        .prize-bar { flex-direction: column; gap: 0.5rem; padding: 0.75rem 1rem; }
      }
    `,
  ];

  @state() private seasonId = '';
  @state() private data: DashboardData | null = null;
  @state() private loading = true;
  @state() private error = '';
  @state() private searchQuery = '';
  @state() private sortOption: SortOption = 'points-desc';
  @state() private adminUpdating = false;
  @state() private adminMsg = '';
  @state() private adminMsgType: 'success' | 'error' = 'success';

  /* Vaadin Router lifecycle */
  onAfterEnter(location: any) {
    this.seasonId = location.params.seasonId;
    this._loadDashboard();
  }

  private async _loadDashboard() {
    this.loading = true;
    this.error = '';
    try {
      this.data = await api.getPublicDashboard(this.seasonId);
    } catch (e: any) {
      this.error = e.message || 'Failed to load dashboard';
    } finally {
      this.loading = false;
    }
  }

  private _teamColor(index: number) {
    return TEAM_COLORS[index % TEAM_COLORS.length];
  }

  private _sortPlayers(players: RosterPlayer[]): RosterPlayer[] {
    const arr = [...players];
    switch (this.sortOption) {
      case 'points-desc': return arr.sort((a, b) => b.total_points - a.total_points);
      case 'round-asc': return arr.sort((a, b) => a.draft_round - b.draft_round);
      case 'round-desc': return arr.sort((a, b) => b.draft_round - a.draft_round);
      default: return arr;
    }
  }

  private _filteredRosters(): Roster[] {
    if (!this.data) return [];
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) return this.data.rosters;
    return this.data.rosters.filter(r =>
      r.players.some(p => p.player_name.toLowerCase().includes(q))
    );
  }

  private async _updateScores() {
    this.adminUpdating = true;
    this.adminMsg = '';
    try {
      await api.updateScores(this.seasonId);
      this.adminMsg = 'Scores updated successfully!';
      this.adminMsgType = 'success';
      await this._loadDashboard();
    } catch (e: any) {
      this.adminMsg = e.message || 'Update failed';
      this.adminMsgType = 'error';
    } finally {
      this.adminUpdating = false;
    }
  }

  render() {
    if (this.loading) {
      return html`<div class="loading-wrap"><div class="spinner"></div><p style="margin-top:1rem;color:var(--text-muted)">Loading dashboard...</p></div>`;
    }
    if (this.error) {
      return html`<div class="error-wrap"><h2>Something went wrong</h2><p class="text-muted" style="margin-top:0.5rem">${this.error}</p><button class="btn btn-primary" style="margin-top:1rem" @click=${this._loadDashboard}>Retry</button></div>`;
    }
    if (!this.data) {
      return html`<div class="empty-wrap"><p class="empty-msg">No dashboard data available.</p></div>`;
    }

    const d = this.data;
    return html`
      ${this._renderHero(d)}
      <div class="leaderboard-section">${this._renderLeaderboard(d.standings, d.is_midseason)}</div>
      ${this._renderScoreChart(d.score_history, d.standings)}
      ${d.is_midseason ? nothing : this._renderTopScorers(d)}
      ${this._renderRosters(d)}
      ${isAdmin() ? this._renderAdmin() : nothing}
    `;
  }

  /* ── Hero ── */
  private _renderHero(d: DashboardData) {
    const updated = d.last_updated
      ? new Date(d.last_updated).toLocaleString('en-US', {
          timeZone: 'America/New_York',
          dateStyle: 'medium',
          timeStyle: 'short',
        }) + ' EST'
      : 'Not yet';
    return html`
      <div class="hero">
        ${d.is_midseason ? html`<div class="ms-hero-eyebrow">${d.league_name}</div>` : nothing}
        <div class="hero-title ${d.is_midseason ? 'ms-hero-title' : ''}">${d.is_midseason ? d.season_label : d.league_name}</div>
        <div class="hero-subtitle">${d.is_midseason ? 'Mid-Season Draft · Second Half' : d.season_label}</div>
        <div class="hero-meta">
          <span class="matches-badge">${d.matches_played} matches played</span>
          <span class="matches-badge" title="Scores auto-update daily at 1:15 PM EST">🕐 ${updated}</span>
        </div>
        ${d.prize_pool ? html`
          <div style="margin-top:1.25rem;text-align:center;">
            <div class="prize-bar">
              <span class="prize-item">\u{1F947} <span class="prize-amount">\u20B9${d.prize_pool.first}</span></span>
              <span class="prize-item">\u{1F948} <span class="prize-amount">\u20B9${d.prize_pool.second}</span></span>
              <span class="prize-item">\u{1F949} <span class="prize-amount">\u20B9${d.prize_pool.third}</span></span>
            </div>
          </div>
        ` : nothing}
      </div>
    `;
  }

  /* ── Score history line chart ── */
  private _renderScoreChart(history: ScoreHistoryEntry[], standings: Standing[]) {
    if (history.length < 2) return nothing;

    const PAD = { top: 16, right: 16, bottom: 36, left: 64 };
    const W = 760, H = 280;
    const chartW = W - PAD.left - PAD.right;
    const chartH = H - PAD.top - PAD.bottom;

    // Collect all team names (in standings order)
    const teams = standings.map(s => s.team_name);

    // Compute cumulative points per team per match
    const cumulative: Record<string, number[]> = {};
    for (const t of teams) cumulative[t] = [];
    const running: Record<string, number> = {};

    for (const entry of history) {
      for (const t of teams) {
        running[t] = (running[t] ?? 0) + (entry.team_points[t] ?? 0);
        cumulative[t].push(running[t]);
      }
    }

    const maxPts = Math.max(...Object.values(cumulative).flat(), 1);
    const n = history.length;

    const xPos = (i: number) => PAD.left + (i / (n - 1)) * chartW;
    const yPos = (v: number) => PAD.top + chartH - (v / maxPts) * chartH;

    // Y-axis grid lines
    const yTicks = 5;
    const yStep = Math.ceil(maxPts / yTicks / 500) * 500;
    const yTickVals: number[] = [];
    for (let v = 0; v <= maxPts + yStep; v += yStep) yTickVals.push(v);

    // X-axis ticks (show every Nth to avoid crowding)
    const maxXLabels = 10;
    const xStep = Math.max(1, Math.ceil(n / maxXLabels));

    return html`
      <div class="chart-card">
        <div class="chart-title">📈 Team Points Over Time</div>
        <div class="chart-svg-wrap">
          <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
            <!-- Grid lines -->
            ${yTickVals.map(v => {
              const y = yPos(v);
              if (y < PAD.top || y > PAD.top + chartH) return nothing;
              return svg`
                <line x1="${PAD.left}" y1="${y}" x2="${PAD.left + chartW}" y2="${y}"
                      stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
                <text x="${PAD.left - 6}" y="${y + 4}" text-anchor="end"
                      font-size="10" fill="rgba(255,255,255,0.35)">${Math.round(v)}</text>
              `;
            })}

            <!-- X axis labels -->
            ${history.map((entry, i) => {
              if (i % xStep !== 0 && i !== n - 1) return nothing;
              const x = xPos(i);
              const label = `M${i + 1}`;
              return svg`
                <text x="${x}" y="${PAD.top + chartH + 18}" text-anchor="middle"
                      font-size="10" fill="rgba(255,255,255,0.35)">${label}</text>
              `;
            })}

            <!-- Axes -->
            <line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${PAD.top + chartH}"
                  stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
            <line x1="${PAD.left}" y1="${PAD.top + chartH}" x2="${PAD.left + chartW}" y2="${PAD.top + chartH}"
                  stroke="rgba(255,255,255,0.12)" stroke-width="1"/>

            <!-- Lines per team -->
            ${teams.map((team, ti) => {
              const pts = cumulative[team];
              if (!pts.length) return nothing;
              const points = pts.map((v, i) => `${xPos(i)},${yPos(v)}`).join(' ');
              const color = TEAM_COLORS[ti % TEAM_COLORS.length];
              return svg`
                <polyline points="${points}" fill="none" stroke="${color}"
                          stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
                <circle cx="${xPos(pts.length - 1)}" cy="${yPos(pts[pts.length - 1])}"
                        r="3" fill="${color}"/>
              `;
            })}
          </svg>
        </div>
        <div class="chart-legend">
          ${teams.map((team, ti) => html`
            <div class="legend-item">
              <div class="legend-dot" style="background:${TEAM_COLORS[ti % TEAM_COLORS.length]}"></div>
              ${team}
            </div>
          `)}
        </div>
      </div>
    `;
  }

  /* ── Leaderboard ── */
  private _renderLeaderboard(standings: Standing[], isMidseason = false) {
    if (!standings.length) {
      return html`<div class="glass-card"><div class="card-header">\u{1F3C6} Owner Leaderboard</div><p class="empty-msg">No scores yet</p></div>`;
    }
    const top3 = standings.slice(0, 3);
    const rest = standings.slice(3);
    const podiumClass = ['gold', 'silver', 'bronze'];
    const msRankCls = ['ms-rank-badge-1', 'ms-rank-badge-2', 'ms-rank-badge-3'];
    const msPtsCls  = ['ms-gold-pts', 'ms-silver-pts', 'ms-bronze-pts'];
    const maxEff = isMidseason ? Math.max(...standings.map(s => s.effective_points ?? 0), 1) : 1;
    return html`
      <div class="glass-card">
        <div class="card-header ${isMidseason ? 'ms-section-title' : ''}">\u{1F3C6} Owner Leaderboard</div>
        <div class="podium">
          ${top3.map((s, i) => html`
            <div class="podium-card ${podiumClass[i]}">
              <div class="podium-medal">${MEDAL[i + 1]}</div>
              <div class="podium-team">${s.team_name}</div>
              <div class="podium-owner">${s.owner_name || '-'}</div>
              <div class="podium-points ${podiumClass[i]}">
                ${isMidseason ? (s.effective_points ?? 0).toLocaleString() : s.total_points.toLocaleString()}
              </div>
              ${isMidseason ? html`
                <div class="ms-podium-sub">
                  Half: ${(s.points_at_half ?? 0).toFixed(0)} &nbsp;·&nbsp; Total: ${((s.points_at_half ?? 0) + (s.effective_points ?? 0)).toFixed(1)}
                </div>` : nothing}
            </div>
          `)}
        </div>
        ${rest.length ? html`
          <table class="dash-table">
            <thead>
              <tr>
                <th>#</th><th>Team</th><th>Owner</th>
                ${isMidseason ? html`<th style="text-align:right">At Half</th><th style="text-align:right">Effective ↓</th><th style="text-align:right">Total</th>` : html`<th style="text-align:right">Pts</th>`}
              </tr>
            </thead>
            <tbody>
              ${rest.map(s => html`
                <tr>
                  <td class="rank">
                    ${isMidseason && s.rank <= 3
                      ? html`<span class="rank-badge ${msRankCls[s.rank - 1]}" style="display:inline-flex;align-items:center;justify-content:center;width:1.6rem;height:1.6rem;border-radius:50%;font-size:0.72rem;font-weight:800">${s.rank}</span>`
                      : s.rank}
                  </td>
                  <td class="team-name">${s.team_name}</td>
                  <td class="owner">${s.owner_name || '-'}</td>
                  ${isMidseason ? html`
                    <td style="text-align:right;color:var(--text-muted);font-size:0.82rem">${(s.points_at_half ?? 0).toFixed(1)}</td>
                    <td style="text-align:right">
                      <div class="ms-effective">${(s.effective_points ?? 0).toFixed(1)}</div>
                      <div style="height:3px;border-radius:2px;background:rgba(255,255,255,0.06);margin-top:3px;overflow:hidden">
                        <div style="height:100%;border-radius:2px;background:#f97316;width:${maxEff > 0 ? (((s.effective_points ?? 0) / maxEff) * 100).toFixed(1) : 0}%"></div>
                      </div>
                    </td>
                    <td style="text-align:right;font-size:0.82rem;color:var(--text-subtle)">${((s.points_at_half ?? 0) + (s.effective_points ?? 0)).toFixed(1)}</td>
                  ` : html`<td class="pts">${s.total_points.toLocaleString()}</td>`}
                </tr>
              `)}
            </tbody>
          </table>
        ` : nothing}
      </div>
    `;
  }

  /* ── Top Scorers ── */
  private _renderTopScorers(d: DashboardData) {
    if (!d.top_scorers.length) return nothing;
    const top2 = d.top_scorers.slice(0, 2);
    const rest = d.top_scorers.slice(2, 5);
    return html`
      <div class="section-title"><span class="section-icon">\u2B50</span> Top Scorers</div>
      <div class="top-scorer-heroes">
        ${top2.map((s, i) => html`
          <div class="scorer-hero">
            <div class="scorer-rank-badge ${i === 0 ? 'first' : 'second'}">#${i + 1} Overall</div>
            <div class="scorer-name">${s.player_name}</div>
            <div class="scorer-meta">
              ${s.ipl_team || 'Unknown'}
              ${s.fantasy_team ? html` \u00B7 <strong>${s.fantasy_team}</strong>` : nothing}
              ${s.draft_round ? html` \u00B7 Rd ${s.draft_round}` : nothing}
            </div>
            <div class="scorer-points">${s.total_points.toLocaleString()}</div>
            <div class="scorer-points-label">Fantasy Points</div>
          </div>
        `)}
      </div>
      ${rest.length ? html`
        <div class="glass-card">
          <table class="dash-table">
            <thead><tr><th>#</th><th>Player</th><th>Team</th><th>Round</th><th>Fantasy Team</th><th style="text-align:right">Pts</th></tr></thead>
            <tbody>
              ${rest.map((s, i) => html`
                <tr>
                  <td class="rank">${i + 3}</td>
                  <td class="team-name">${s.player_name}</td>
                  <td style="font-size:0.78rem">${s.ipl_team || '-'}</td>
                  <td style="font-size:0.78rem">Rd ${s.draft_round ?? '-'}</td>
                  <td style="font-size:0.78rem">${s.fantasy_team || '-'}</td>
                  <td class="pts">${s.total_points.toLocaleString()}</td>
                </tr>
              `)}
            </tbody>
          </table>
        </div>
      ` : nothing}
      ${this._renderTopUndrafted(d)}
    `;
  }

  /* ── Top Undrafted Players ── */
  private _renderTopUndrafted(d: DashboardData) {
    if (!d.top_undrafted?.length) return nothing;
    return html`
      <div class="section-title" style="margin-top:1.5rem"><span class="section-icon">\u{1F614}</span> Top Undrafted Players</div>
      <div class="glass-card">
        <table class="dash-table">
          <thead><tr><th>#</th><th>Player</th><th>Team</th><th>Role</th><th style="text-align:right">Pts</th></tr></thead>
          <tbody>
            ${d.top_undrafted.map((s, i) => html`
              <tr>
                <td class="rank">${i + 1}</td>
                <td class="team-name">${s.player_name}</td>
                <td style="font-size:0.78rem">${s.ipl_team || '-'}</td>
                <td style="font-size:0.78rem">${s.designation || '-'}</td>
                <td class="pts">${s.total_points.toLocaleString()}</td>
              </tr>
            `)}
          </tbody>
        </table>
      </div>
    `;
  }

  /* ── Rosters ── */
  private _renderRosters(d: DashboardData) {
    if (!d.rosters.length) return nothing;
    const filtered = this._filteredRosters();
    const q = this.searchQuery.trim().toLowerCase();
    return html`
      <div class="section-title"><span class="section-icon">\u{1F465}</span> Owners and Players</div>
      <div class="roster-controls">
        <input
          class="roster-search"
          type="text"
          placeholder="Search player to find owner..."
          .value=${this.searchQuery}
          @input=${(e: Event) => { this.searchQuery = (e.target as HTMLInputElement).value; }}
        />
        <select class="roster-sort" @change=${(e: Event) => { this.sortOption = (e.target as HTMLSelectElement).value as SortOption; }}>
          <option value="points-desc">Points (High-Low)</option>
          <option value="round-asc">Round (Low-High)</option>
          <option value="round-desc">Round (High-Low)</option>
        </select>
      </div>
      ${filtered.length === 0 ? html`<p class="empty-msg">No players found matching "${this.searchQuery}"</p>` : nothing}
      ${filtered.map((r, ri) => {
        const sorted = this._sortPlayers(r.players);
        const isSearching = q.length > 0;
        const displayPlayers = isSearching ? sorted.filter(p => p.player_name.toLowerCase().includes(q)) : sorted;
        return html`
          <details class="roster-team" ?open=${isSearching}>
            <summary class="roster-summary">
              <span class="roster-summary-rank">${ri + 1}.</span>
              <span class="roster-summary-name">${r.team_name}</span>
              <span class="roster-summary-owner">${r.owner_name || ''}</span>
              <span class="roster-summary-pts">${r.total_points.toLocaleString()} pts</span>
            </summary>
            <div class="roster-players">
              <table class="dash-table">
                <thead><tr><th>Rd</th><th>Player</th><th>IPL Team</th><th style="text-align:right">Pts</th></tr></thead>
                <tbody>
                  ${displayPlayers.map(p => {
                    const nameMatch = isSearching && p.player_name.toLowerCase().includes(q);
                    return html`
                      <tr>
                        <td><span class="round-badge">${p.draft_round}</span></td>
                        <td class="team-name">${nameMatch ? this._highlightName(p.player_name, q) : p.player_name}</td>
                        <td style="font-size:0.78rem">${p.ipl_team || '-'}</td>
                        <td class="pts">${p.total_points.toLocaleString()}</td>
                      </tr>
                    `;
                  })}
                </tbody>
              </table>
            </div>
          </details>
        `;
      })}
    `;
  }

  private _highlightName(name: string, query: string) {
    const idx = name.toLowerCase().indexOf(query);
    if (idx === -1) return html`${name}`;
    const before = name.slice(0, idx);
    const match = name.slice(idx, idx + query.length);
    const after = name.slice(idx + query.length);
    return html`${before}<span class="search-highlight">${match}</span>${after}`;
  }

  /* ── Admin ── */
  private async _handlePredictionsCsv(e: CustomEvent) {
    const file = e.detail.file as File;
    const text = await file.text();
    const lines = text.trim().split('\n');
    if (lines.length < 2) {
      this.adminMsg = 'CSV must have a header row and at least one data row';
      this.adminMsgType = 'error';
      return;
    }
    const header = lines[0].toLowerCase().split(',').map(h => h.trim());
    const teamIdx = header.findIndex(h => h === 'team' || h === 'team_name');
    const winnerIdx = header.findIndex(h => h.includes('winner'));
    const orangeIdx = header.findIndex(h => h.includes('orange'));
    const purpleIdx = header.findIndex(h => h.includes('purple'));
    const mvpIdx = header.findIndex(h => h.includes('mvp'));

    if (teamIdx === -1) {
      this.adminMsg = 'CSV must have a "Team" column';
      this.adminMsgType = 'error';
      return;
    }

    const predictions = lines.slice(1).filter(l => l.trim()).map(line => {
      const cols = line.split(',').map(c => c.trim());
      return {
        team_name: cols[teamIdx] || '',
        ipl_winner: winnerIdx >= 0 ? cols[winnerIdx] || null : null,
        orange_cap: orangeIdx >= 0 ? cols[orangeIdx] || null : null,
        purple_cap: purpleIdx >= 0 ? cols[purpleIdx] || null : null,
        ipl_mvp: mvpIdx >= 0 ? cols[mvpIdx] || null : null,
      };
    });

    this.adminUpdating = true;
    this.adminMsg = '';
    try {
      const result = await api.uploadSidePots(this.seasonId, {
        teams: [],
        captain_vc_picks: [],
        awesome_threesome: [],
        predictions,
      });
      this.adminMsg = `Predictions uploaded: ${result.upserted} saved${result.errors?.length ? `, errors: ${result.errors.join(', ')}` : ''}`;
      this.adminMsgType = result.errors?.length ? 'error' : 'success';
      await this._loadDashboard();
    } catch (e: any) {
      this.adminMsg = e.message || 'Upload failed';
      this.adminMsgType = 'error';
    } finally {
      this.adminUpdating = false;
    }
  }

  private _renderAdmin() {
    return html`
      <div class="admin-section">
        <h3>Admin Controls</h3>
        <div style="margin-top:0.75rem;display:flex;gap:0.75rem;align-items:center;flex-wrap:wrap">
          <button class="btn btn-primary" ?disabled=${this.adminUpdating} @click=${this._updateScores}>
            ${this.adminUpdating ? html`<span class="spinner" style="width:16px;height:16px;border-width:2px;margin-right:0.4rem"></span> Updating...` : 'Update Points'}
          </button>
        </div>
        <div style="margin-top:1rem">
          <h4 style="margin-bottom:0.5rem;font-size:0.9rem;color:var(--text-muted)">Upload Predictions CSV</h4>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.5rem">Columns: Team, IPL Winner, Orange Cap, Purple Cap, MVP</div>
          <csv-uploader @file-selected=${this._handlePredictionsCsv}></csv-uploader>
        </div>
        ${this.adminMsg ? html`<div class="admin-msg ${this.adminMsgType}">${this.adminMsg}</div>` : nothing}
      </div>
    `;
  }
}
