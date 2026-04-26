import { LitElement, html, css, svg } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { Router } from '@vaadin/router';
import { sharedStyles } from '../styles/shared-styles.js';
import { api } from '../services/api.js';

/* ── Types ────────────────────────────────────────────────────────────── */
interface Standing {
  rank: number;
  team_name: string;
  owner_name: string | null;
  points_at_half: number;
  effective_points: number;
  total_points: number;
}
interface ScoreEntry { match_id: string; match_label: string; team_points: Record<string, number> }
interface DashData {
  league_name: string;
  season_label: string;
  last_updated: string | null;
  matches_played: number;
  standings: Standing[];
  score_history: ScoreEntry[];
}

/* ── Constants ────────────────────────────────────────────────────────── */
const TEAM_COLORS = [
  '#818cf8', '#34d399', '#f472b6', '#fb923c',
  '#a78bfa', '#38bdf8', '#4ade80', '#fbbf24',
];
const PODIUM_META = [
  { label: '2nd', cls: 'silver', medal: '🥈', order: 1 },
  { label: '1st', cls: 'gold',   medal: '🥇', order: 0 },
  { label: '3rd', cls: 'bronze', medal: '🥉', order: 2 },
];

/* ── Component ────────────────────────────────────────────────────────── */
@customElement('page-midseason-dashboard')
export class PageMidseasonDashboard extends LitElement {

  static styles = [sharedStyles, css`
    :host { display: block; }

    /* Hero */
    .hero {
      text-align: center;
      padding: 3rem 1rem 2.5rem;
      position: relative;
    }
    .hero::before {
      content: '';
      position: absolute;
      inset: 0;
      background: radial-gradient(ellipse 70% 50% at 50% 0%, rgba(129,140,248,0.12) 0%, transparent 70%);
      pointer-events: none;
    }
    .hero-eyebrow {
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--accent);
      margin-bottom: 0.5rem;
    }
    .hero-title {
      font-size: clamp(2rem, 5vw, 3.2rem);
      font-weight: 900;
      background: linear-gradient(135deg, #818cf8 0%, #a855f7 45%, #ec4899 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      line-height: 1.1;
      margin-bottom: 0.4rem;
    }
    .hero-sub {
      font-size: 1rem;
      color: var(--text-muted);
      margin-bottom: 1.25rem;
    }
    .hero-pills {
      display: flex; gap: 0.6rem; justify-content: center; flex-wrap: wrap;
    }
    .pill {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 999px;
      padding: 0.3rem 0.9rem;
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--text-primary);
      display: flex; align-items: center; gap: 0.35rem;
    }
    .pill-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }

    /* Layout */
    .container { max-width: 900px; margin: 0 auto; padding: 0 1rem 3rem; }

    /* Section title */
    .section-title {
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--text-subtle);
      margin: 2.5rem 0 1rem;
      display: flex; align-items: center; gap: 0.6rem;
    }
    .section-title::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--border-color);
    }

    /* Podium */
    .podium-wrap {
      display: flex;
      gap: 0.75rem;
      align-items: flex-end;
      justify-content: center;
    }
    .podium-card {
      flex: 1;
      max-width: 240px;
      border-radius: 16px;
      padding: 1.5rem 1rem 1.25rem;
      text-align: center;
      border: 1px solid rgba(255,255,255,0.06);
      background: rgba(255,255,255,0.03);
      transition: transform 0.2s;
      position: relative;
      overflow: hidden;
    }
    .podium-card::before {
      content: '';
      position: absolute;
      inset: 0;
      opacity: 0.06;
      border-radius: 16px;
    }
    .podium-card.gold {
      border-color: rgba(129,140,248,0.45);
      background: rgba(129,140,248,0.08);
      transform: translateY(-12px);
    }
    .podium-card.gold::before { background: #818cf8; opacity: 0.12; }
    .podium-card.silver { border-color: rgba(148,163,184,0.3); }
    .podium-card.silver::before { background: #94a3b8; }
    .podium-card.bronze { border-color: rgba(251,146,60,0.3); }
    .podium-card.bronze::before { background: #fb923c; }

    .podium-medal { font-size: 2rem; margin-bottom: 0.5rem; display: block; }
    .podium-pos {
      font-size: 0.65rem;
      font-weight: 800;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--text-subtle);
      margin-bottom: 0.5rem;
    }
    .podium-team {
      font-size: 1rem;
      font-weight: 800;
      color: var(--text-primary);
      margin-bottom: 0.2rem;
      word-break: break-word;
    }
    .podium-owner {
      font-size: 0.72rem;
      color: var(--text-muted);
      margin-bottom: 1rem;
    }
    .podium-effective {
      font-size: 1.8rem;
      font-weight: 900;
      color: var(--accent);
      line-height: 1;
    }
    .podium-effective-label {
      font-size: 0.65rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-subtle);
      margin-top: 0.2rem;
    }
    .podium-half {
      font-size: 0.78rem;
      color: var(--text-muted);
      margin-top: 0.6rem;
      display: flex;
      justify-content: center;
      gap: 0.4rem;
      flex-wrap: wrap;
    }
    .podium-half span { opacity: 0.6; }

    /* Standings table */
    .standings-card {
      background: var(--bg-card);
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 16px;
      overflow: hidden;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.84rem;
    }
    thead tr {
      border-bottom: 1px solid var(--border-color);
    }
    th {
      padding: 0.7rem 1rem;
      text-align: left;
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-subtle);
    }
    th.right { text-align: right; }
    td {
      padding: 0.8rem 1rem;
      border-bottom: 1px solid rgba(255,255,255,0.04);
    }
    td.right { text-align: right; }
    tr:last-child td { border-bottom: none; }
    tr:nth-child(even) td { background: rgba(255,255,255,0.02); }

    .rank-cell {
      font-size: 0.8rem;
      font-weight: 700;
      color: var(--text-subtle);
      width: 2.5rem;
    }
    .rank-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.6rem;
      height: 1.6rem;
      border-radius: 50%;
      font-size: 0.72rem;
      font-weight: 800;
    }
    .rank-1 { background: rgba(129,140,248,0.2); color: #818cf8; }
    .rank-2 { background: rgba(148,163,184,0.15); color: #94a3b8; }
    .rank-3 { background: rgba(251,146,60,0.15); color: #fb923c; }

    .team-cell .team-name { font-weight: 700; color: var(--text-primary); }
    .team-cell .owner { font-size: 0.72rem; color: var(--text-muted); margin-top: 0.1rem; }

    .pts-half { color: var(--text-muted); font-size: 0.82rem; }
    .pts-effective { font-weight: 800; color: var(--accent); font-size: 0.95rem; }
    .pts-total { font-size: 0.82rem; color: var(--text-subtle); }

    .bar-wrap { margin-top: 0.3rem; }
    .bar-track {
      height: 3px;
      border-radius: 2px;
      background: rgba(255,255,255,0.06);
      overflow: hidden;
    }
    .bar-fill {
      height: 100%;
      border-radius: 2px;
      background: var(--accent);
      transition: width 0.8s cubic-bezier(.4,0,.2,1);
    }

    /* Chart */
    .chart-card {
      background: var(--bg-card);
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 16px;
      padding: 1.5rem;
    }
    .chart-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.25rem;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .chart-title {
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--text-primary);
    }
    .chart-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem 1rem;
      font-size: 0.72rem;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 0.3rem;
      color: var(--text-muted);
    }
    .legend-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .chart-svg-wrap {
      width: 100%;
      overflow-x: auto;
    }
    svg.chart { display: block; min-width: 320px; }

    .chart-empty {
      text-align: center;
      padding: 3rem 1rem;
      color: var(--text-muted);
      font-size: 0.9rem;
    }
    .chart-empty-icon { font-size: 2.5rem; margin-bottom: 0.5rem; }

    /* Loading / Error */
    .loader {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 60vh;
      gap: 1rem;
      color: var(--text-muted);
    }
    .spinner {
      width: 36px; height: 36px;
      border: 3px solid var(--border-color);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Responsive */
    @media (max-width: 600px) {
      .podium-card { padding: 1rem 0.6rem; }
      .podium-effective { font-size: 1.4rem; }
      th, td { padding: 0.6rem 0.5rem; }
      .chart-card { padding: 1rem; }
    }
  `];

  @state() private _data: DashData | null = null;
  @state() private _loading = true;
  @state() private _error = '';
  private _seasonId = '';

  onBeforeEnter(loc: Router.Location) {
    this._seasonId = (loc.params as Record<string, string>).seasonId ?? '';
  }

  connectedCallback() {
    super.connectedCallback();
    this._load();
  }

  private async _load() {
    this._loading = true;
    this._error = '';
    try {
      this._data = await api.getMidseasonDashboard(this._seasonId) as DashData;
    } catch (e: unknown) {
      this._error = e instanceof Error ? e.message : 'Failed to load dashboard';
    } finally {
      this._loading = false;
    }
  }

  /* ── Chart ─────────────────────────────────────────────────────────── */
  private _renderChart(history: ScoreEntry[], standings: Standing[]) {
    if (!history.length) {
      return html`
        <div class="chart-empty">
          <div class="chart-empty-icon">📊</div>
          <div>Chart updates after the first scores are imported</div>
        </div>`;
    }

    const teamNames = standings.map(s => s.team_name);
    const colorMap: Record<string, string> = {};
    teamNames.forEach((n, i) => { colorMap[n] = TEAM_COLORS[i % TEAM_COLORS.length]; });

    // Build cumulative effective per team across matches
    const cumulative: Record<string, number[]> = {};
    teamNames.forEach(n => { cumulative[n] = []; });
    const running: Record<string, number> = {};
    teamNames.forEach(n => { running[n] = 0; });

    history.forEach(entry => {
      teamNames.forEach(n => {
        running[n] += (entry.team_points[n] ?? 0);
        cumulative[n].push(running[n]);
      });
    });

    const W = 760, H = 280;
    const PAD = { top: 20, right: 20, bottom: 40, left: 52 };
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const n = history.length;

    const allVals = Object.values(cumulative).flat();
    const maxVal = Math.max(...allVals, 1);
    const minVal = 0;

    const xScale = (i: number) => PAD.left + (i / Math.max(n - 1, 1)) * innerW;
    const yScale = (v: number) => PAD.top + innerH - ((v - minVal) / (maxVal - minVal)) * innerH;

    // Y-axis grid lines
    const yTicks = 4;
    const yLines = Array.from({ length: yTicks + 1 }, (_, i) =>
      minVal + (i / yTicks) * (maxVal - minVal)
    );

    // X-axis labels (show every N-th to avoid crowding)
    const labelEvery = Math.ceil(n / 8);

    const lines = teamNames.map(name => {
      const pts = cumulative[name];
      const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${xScale(i).toFixed(1)},${yScale(v).toFixed(1)}`).join(' ');
      const col = colorMap[name];
      return svg`
        <path d=${d} fill="none" stroke=${col} stroke-width="2.5"
              stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>
        <circle cx=${xScale(pts.length - 1)} cy=${yScale(pts[pts.length - 1])} r="4"
                fill=${col} stroke="var(--bg-card)" stroke-width="2"/>
      `;
    });

    return html`
      <div class="chart-svg-wrap">
        ${svg`
          <svg class="chart" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
            <!-- Grid -->
            ${yLines.map(v => svg`
              <line x1=${PAD.left} y1=${yScale(v)} x2=${W - PAD.right} y2=${yScale(v)}
                    stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
              <text x=${PAD.left - 6} y=${yScale(v)} text-anchor="end"
                    dominant-baseline="middle" font-size="10" fill="rgba(255,255,255,0.3)">
                ${Math.round(v)}
              </text>
            `)}
            <!-- X labels -->
            ${history.map((e, i) => i % labelEvery === 0 ? svg`
              <text x=${xScale(i)} y=${H - 8} text-anchor="middle"
                    font-size="9" fill="rgba(255,255,255,0.3)"
                    transform="rotate(-30,${xScale(i)},${H - 8})">
                ${e.match_label.split('IST-')[1] ?? e.match_label}
              </text>
            ` : null)}
            <!-- Lines -->
            ${lines}
          </svg>
        `}
      </div>`;
  }

  /* ── Render ─────────────────────────────────────────────────────────── */
  render() {
    if (this._loading) return html`<div class="loader"><div class="spinner"></div><span>Loading…</span></div>`;
    if (this._error)  return html`<div class="loader"><span>${this._error}</span></div>`;
    if (!this._data)  return html``;

    const d = this._data;
    const top3 = d.standings.slice(0, 3);
    const maxEffective = Math.max(...d.standings.map(s => s.effective_points), 1);

    const colorMap: Record<string, string> = {};
    d.standings.forEach((s, i) => { colorMap[s.team_name] = TEAM_COLORS[i % TEAM_COLORS.length]; });

    const lastUpdated = d.last_updated
      ? new Date(d.last_updated).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
      : 'Not yet';

    return html`
      <!-- Hero -->
      <div class="hero">
        <div class="hero-eyebrow">${d.league_name}</div>
        <div class="hero-title">${d.season_label}</div>
        <div class="hero-sub">Mid-Season Draft · IPL 2026 Second Half</div>
        <div class="hero-pills">
          <div class="pill"><span class="pill-dot"></span>${d.standings.length} Team${d.standings.length !== 1 ? 's' : ''}</div>
          <div class="pill">⚡ ${d.matches_played} Match${d.matches_played !== 1 ? 'es' : ''} Played</div>
          <div class="pill">🕐 Updated ${lastUpdated}</div>
        </div>
      </div>

      <div class="container">
        <!-- Podium -->
        <div class="section-title">Podium</div>
        <div class="podium-wrap">
          ${PODIUM_META.map(({ label, cls, medal, order }) => {
            const s = top3[order];
            if (!s) return html``;
            return html`
              <div class="podium-card ${cls}">
                <span class="podium-medal">${medal}</span>
                <div class="podium-pos">${label} Place</div>
                <div class="podium-team">${s.team_name}</div>
                <div class="podium-owner">${s.owner_name ?? ''}</div>
                <div class="podium-effective">${s.effective_points.toFixed(1)}</div>
                <div class="podium-effective-label">Effective Pts</div>
                <div class="podium-half">
                  <span>Half:</span> ${s.points_at_half.toFixed(0)}
                  &nbsp;·&nbsp;
                  <span>Total:</span> ${s.total_points.toFixed(1)}
                </div>
              </div>`;
          })}
        </div>

        <!-- Standings -->
        <div class="section-title">Full Standings</div>
        <div class="standings-card">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Team</th>
                <th class="right">At Half</th>
                <th class="right">Effective ↓</th>
                <th class="right">Total</th>
              </tr>
            </thead>
            <tbody>
              ${d.standings.map(s => {
                const pct = maxEffective > 0 ? (s.effective_points / maxEffective) * 100 : 0;
                const rankCls = s.rank <= 3 ? `rank-${s.rank}` : '';
                return html`
                  <tr>
                    <td class="rank-cell">
                      ${s.rank <= 3
                        ? html`<span class="rank-badge ${rankCls}">${s.rank}</span>`
                        : html`${s.rank}`}
                    </td>
                    <td class="team-cell">
                      <div class="team-name" style="color:${colorMap[s.team_name]}">${s.team_name}</div>
                      ${s.owner_name ? html`<div class="owner">${s.owner_name}</div>` : ''}
                    </td>
                    <td class="right pts-half">${s.points_at_half.toFixed(1)}</td>
                    <td class="right">
                      <div class="pts-effective">${s.effective_points.toFixed(1)}</div>
                      <div class="bar-wrap">
                        <div class="bar-track">
                          <div class="bar-fill" style="width:${pct.toFixed(1)}%;background:${colorMap[s.team_name]}"></div>
                        </div>
                      </div>
                    </td>
                    <td class="right pts-total">${s.total_points.toFixed(1)}</td>
                  </tr>`;
              })}
            </tbody>
          </table>
        </div>

        <!-- Chart -->
        <div class="section-title">Effective Points Race</div>
        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-title">Cumulative Effective Points per Match</div>
            <div class="chart-legend">
              ${d.standings.map(s => html`
                <div class="legend-item">
                  <div class="legend-dot" style="background:${colorMap[s.team_name]}"></div>
                  <span>${s.team_name}</span>
                </div>`)}
            </div>
          </div>
          ${this._renderChart(d.score_history, d.standings)}
        </div>
      </div>
    `;
  }
}
