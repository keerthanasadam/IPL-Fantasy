import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { api } from '../services/api.js';
import { getToken } from '../services/auth.js';
import { DraftWebSocket } from '../services/ws.js';
import { sharedStyles } from '../styles/shared-styles.js';

interface DraftState {
  status: string;
  total_rounds: number;
  team_count: number;
  current_pick_number: number;
  current_round: number;
  current_team_id: string | null;
  current_team_name: string | null;
  is_complete: boolean;
  picks: any[];
  teams: any[];
  timer_seconds: number;
}

@customElement('page-snake-draft')
export class PageSnakeDraft extends LitElement {
  static styles = [
    sharedStyles,
    css`
      :host { display: block; }

      .draft-layout {
        display: grid;
        grid-template-columns: 1fr 350px;
        gap: 1rem;
        min-height: calc(100vh - 120px);
      }

      .board-section { overflow-x: auto; }

      /* Draft Board */
      .draft-board {
        display: grid;
        gap: 2px;
        font-size: 0.75rem;
        min-width: 600px;
      }
      .board-header {
        background: #f5a623;
        color: #0f172a;
        padding: 0.5rem 0.3rem;
        font-weight: 700;
        text-align: center;
        border-radius: 4px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .board-round {
        background: #334155;
        padding: 0.5rem 0.3rem;
        text-align: center;
        font-weight: 600;
        border-radius: 4px;
      }
      .board-cell {
        background: #1e293b;
        padding: 0.4rem 0.3rem;
        text-align: center;
        border-radius: 4px;
        min-height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .board-cell.picked {
        background: #1a3a2a;
        border: 1px solid #22c55e;
      }
      .board-cell.current {
        background: #3a2a00;
        border: 2px solid #f5a623;
        animation: pulse 1.5s infinite;
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
      }
      .pick-name { font-weight: 600; color: #e2e8f0; }
      .pick-team { font-size: 0.65rem; color: #94a3b8; }

      /* Sidebar */
      .sidebar { display: flex; flex-direction: column; gap: 1rem; }

      .status-bar {
        background: #1e293b;
        border: 2px solid #f5a623;
        border-radius: 12px;
        padding: 1rem;
        text-align: center;
      }
      .status-bar .on-clock {
        font-size: 1.25rem;
        font-weight: 700;
        color: #f5a623;
      }
      .status-bar .pick-info {
        font-size: 0.85rem;
        color: #94a3b8;
        margin-top: 0.25rem;
      }

      /* Player Pool */
      .pool-section {
        flex: 1;
        overflow-y: auto;
        max-height: 50vh;
      }
      .pool-search {
        margin-bottom: 0.5rem;
      }
      .player-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.5rem 0.75rem;
        border-bottom: 1px solid #1e293b;
        cursor: pointer;
        transition: background 0.1s;
      }
      .player-row:hover { background: #1e293b; }
      .player-row.drafted { opacity: 0.35; pointer-events: none; }
      .player-info { flex: 1; }
      .player-info .name { font-weight: 600; font-size: 0.85rem; }
      .player-info .meta { font-size: 0.75rem; color: #64748b; }

      .pick-btn {
        background: #f5a623;
        color: #0f172a;
        border: none;
        padding: 0.3rem 0.6rem;
        border-radius: 6px;
        font-weight: 600;
        font-size: 0.75rem;
        cursor: pointer;
      }
      .pick-btn:hover { background: #e09000; }

      /* Controls */
      .controls { display: flex; gap: 0.5rem; flex-wrap: wrap; }

      .paused-banner {
        background: #ef4444;
        color: white;
        text-align: center;
        padding: 0.5rem;
        border-radius: 8px;
        font-weight: 600;
      }

      .complete-banner {
        background: #22c55e;
        color: #0f172a;
        text-align: center;
        padding: 1rem;
        border-radius: 8px;
        font-weight: 700;
        font-size: 1.25rem;
      }

      .ws-status {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.8rem;
        color: #64748b;
      }
      .ws-dot {
        width: 8px; height: 8px; border-radius: 50%;
      }
      .ws-dot.connected { background: #22c55e; }
      .ws-dot.disconnected { background: #ef4444; }

      @media (max-width: 900px) {
        .draft-layout { grid-template-columns: 1fr; }
        .pool-section { max-height: 40vh; }
      }
    `,
  ];

  @state() private seasonId = '';
  @state() private draftState: DraftState | null = null;
  @state() private players: any[] = [];
  @state() private searchQuery = '';
  @state() private filterTeam = '';
  @state() private filterDesignation = '';
  @state() private wsConnected = false;
  @state() private paused = false;

  private ws: DraftWebSocket | null = null;

  onBeforeEnter(location: any) {
    this.seasonId = location.params.seasonId;
  }

  async connectedCallback() {
    super.connectedCallback();
    // Load players for the pool
    const result = await api.getPlayers(this.seasonId);
    this.players = result.players;

    // Connect WebSocket
    const token = getToken() || '';
    this.ws = new DraftWebSocket(this.seasonId, token);

    this.ws.on('connected', () => { this.wsConnected = true; });
    this.ws.on('disconnected', () => { this.wsConnected = false; });

    this.ws.on('draft_state', (data: DraftState) => {
      this.draftState = data;
      this.paused = (data as any).paused || false;
    });

    this.ws.on('pick_made', () => {}); // State update follows
    this.ws.on('pick_undone', () => {});
    this.ws.on('draft_paused', () => { this.paused = true; });
    this.ws.on('draft_resumed', () => { this.paused = false; });
    this.ws.on('error', (data: any) => {
      console.error('Draft error:', data.message || data);
    });

    this.ws.connect();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.ws?.disconnect();
  }

  private get draftedPlayerIds(): Set<string> {
    return new Set((this.draftState?.picks || []).map((p: any) => p.player_id));
  }

  private get filteredPlayers(): any[] {
    let list = this.players;
    const drafted = this.draftedPlayerIds;

    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    if (this.filterTeam) {
      list = list.filter((p) => p.ipl_team === this.filterTeam);
    }
    if (this.filterDesignation) {
      list = list.filter((p) => p.designation === this.filterDesignation);
    }

    // Sort: available first, then drafted
    return [...list].sort((a, b) => {
      const aD = drafted.has(a.id) ? 1 : 0;
      const bD = drafted.has(b.id) ? 1 : 0;
      return aD - bD || a.name.localeCompare(b.name);
    });
  }

  private get uniqueTeams(): string[] {
    return [...new Set(this.players.map((p) => p.ipl_team))].sort();
  }

  private get uniqueDesignations(): string[] {
    return [...new Set(this.players.map((p) => p.designation))].sort();
  }

  private pickPlayer(playerId: string) {
    this.ws?.pick(playerId);
  }

  private undoLastPick() {
    this.ws?.undoLastPick();
  }

  private togglePause() {
    if (this.paused) {
      this.ws?.resumeDraft();
    } else {
      this.ws?.pauseDraft();
    }
  }

  private async exportDraft() {
    const res = await api.exportDraft(this.seasonId);
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `draft_results.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  private renderBoard() {
    const state = this.draftState;
    if (!state) return html`<p>Loading board...</p>`;

    const teams = state.teams;
    const cols = teams.length + 1; // +1 for round label column

    // Build a pick map: key = `${round}-${teamId}`
    const pickMap = new Map<string, any>();
    for (const p of state.picks) {
      pickMap.set(`${p.round}-${p.team_id}`, p);
    }

    const rows = [];
    for (let r = 1; r <= state.total_rounds; r++) {
      const isEvenRound = r % 2 === 0;
      const orderedTeams = isEvenRound ? [...teams].reverse() : teams;

      rows.push(html`<div class="board-round">R${r}</div>`);
      for (const team of orderedTeams) {
        const pick = pickMap.get(`${r}-${team.id}`);
        const isCurrent = !state.is_complete && state.current_round === r && state.current_team_id === team.id;

        rows.push(html`
          <div class="board-cell ${pick ? 'picked' : ''} ${isCurrent ? 'current' : ''}">
            ${pick
              ? html`
                  <div>
                    <div class="pick-name">${pick.player_name}</div>
                    <div class="pick-team">${pick.player_team}</div>
                  </div>
                `
              : isCurrent
              ? html`<div style="color: #f5a623; font-weight: 600;">ON CLOCK</div>`
              : ''}
          </div>
        `);
      }
    }

    return html`
      <div class="draft-board" style="grid-template-columns: 50px repeat(${teams.length}, 1fr);">
        <div class="board-header" style="background: #334155; color: #e2e8f0;">Rd</div>
        ${teams.map((t: any) => html`<div class="board-header">${t.name}</div>`)}
        ${rows}
      </div>
    `;
  }

  render() {
    const state = this.draftState;

    return html`
      ${state?.is_complete
        ? html`<div class="complete-banner">Draft Complete!</div>`
        : ''}
      ${this.paused ? html`<div class="paused-banner">Draft Paused</div>` : ''}

      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <h1 style="margin: 0;">Snake Draft</h1>
        <div class="ws-status">
          <div class="ws-dot ${this.wsConnected ? 'connected' : 'disconnected'}"></div>
          ${this.wsConnected ? 'Connected' : 'Reconnecting...'}
        </div>
      </div>

      <div class="draft-layout">
        <div class="board-section">
          ${this.renderBoard()}
        </div>

        <div class="sidebar">
          <!-- Status -->
          ${state && !state.is_complete
            ? html`
                <div class="status-bar">
                  <div class="on-clock">${state.current_team_name || '...'}</div>
                  <div class="pick-info">
                    Pick #${state.current_pick_number} / Round ${state.current_round} of ${state.total_rounds}
                  </div>
                </div>
              `
            : ''}

          <!-- Commissioner Controls -->
          <div class="controls">
            <button class="btn btn-secondary btn-sm" @click=${this.togglePause}>
              ${this.paused ? 'Resume' : 'Pause'}
            </button>
            <button class="btn btn-danger btn-sm" @click=${this.undoLastPick}>Undo Pick</button>
            <button class="btn btn-secondary btn-sm" @click=${this.exportDraft}>Export CSV</button>
          </div>

          <!-- Player Pool -->
          <div class="card" style="padding: 0.75rem;">
            <h3 style="margin: 0 0 0.5rem 0;">Available Players</h3>
            <input class="pool-search" placeholder="Search players..."
                   .value=${this.searchQuery}
                   @input=${(e: any) => (this.searchQuery = e.target.value)} />
            <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem;">
              <select style="flex: 1; font-size: 0.8rem;" @change=${(e: any) => (this.filterTeam = e.target.value)}>
                <option value="">All Teams</option>
                ${this.uniqueTeams.map((t) => html`<option value=${t}>${t}</option>`)}
              </select>
              <select style="flex: 1; font-size: 0.8rem;" @change=${(e: any) => (this.filterDesignation = e.target.value)}>
                <option value="">All Roles</option>
                ${this.uniqueDesignations.map((d) => html`<option value=${d}>${d}</option>`)}
              </select>
            </div>
            <div class="pool-section">
              ${this.filteredPlayers.map((p) => {
                const isDrafted = this.draftedPlayerIds.has(p.id);
                return html`
                  <div class="player-row ${isDrafted ? 'drafted' : ''}">
                    <div class="player-info">
                      <div class="name">${p.name}</div>
                      <div class="meta">${p.ipl_team} - ${p.designation}</div>
                    </div>
                    ${!isDrafted && !state?.is_complete
                      ? html`<button class="pick-btn" @click=${() => this.pickPlayer(p.id)}>Pick</button>`
                      : ''}
                  </div>
                `;
              })}
            </div>
          </div>
        </div>
      </div>
    `;
  }
}
