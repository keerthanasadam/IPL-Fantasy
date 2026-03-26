import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { api } from '../services/api.js';
import { getMe, getToken, isAdmin, getCachedUser, guardRoute } from '../services/auth.js';
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
  teams: Array<{ id: string; name: string; draft_position: number; owner_id: string | null }>;
  timer_seconds: number;
  next_team_id: string | null;
  next_team_name: string | null;
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
      .player-rank {
        font-size: 0.7rem;
        color: #64748b;
        min-width: 24px;
        text-align: right;
        flex-shrink: 0;
        margin-right: 0.4rem;
      }
      .pool-sort-header {
        display: flex;
        gap: 0.25rem;
        padding: 0.2rem 0.75rem;
        border-bottom: 1px solid #334155;
        margin-bottom: 0.25rem;
      }
      .sort-btn {
        background: none;
        border: none;
        color: #64748b;
        cursor: pointer;
        font-size: 0.7rem;
        padding: 0.1rem 0.3rem;
        border-radius: 3px;
      }
      .sort-btn:hover { color: #e2e8f0; }
      .sort-btn.active { color: #f5a623; font-weight: 600; }

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

      .preview-banner {
        background: #1e293b;
        border: 1px solid #475569;
        color: #e2e8f0;
        padding: 0.75rem 1rem;
        border-radius: 8px;
        margin-bottom: 1rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
      }
      .preview-banner span { font-weight: 600; }

      .board-header.my-team-header {
        background: #92400e;
        outline: 2px solid #f5a623;
        outline-offset: -2px;
      }

      .board-cell.my-team-cell {
        background: rgba(245, 166, 35, 0.07);
      }

      .viewer-info {
        background: #1e293b;
        border: 1px solid #475569;
        border-radius: 12px;
        padding: 1rem;
        text-align: center;
        color: #94a3b8;
        font-size: 0.85rem;
      }
      .viewer-label {
        font-weight: 700;
        color: #e2e8f0;
        margin: 0 0 0.5rem;
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
  @state() private leagueId = '';
  @state() private draftState: DraftState | null = null;
  @state() private _redirectScheduled = false;
  @state() private players: any[] = [];
  @state() private searchQuery = '';
  @state() private filterTeam = '';
  @state() private filterDesignation = '';
  @state() private sortCol: 'ranking' | 'name' | 'ipl_team' | 'designation' = 'ranking';
  @state() private sortDir: 'asc' | 'desc' = 'asc';
  @state() private wsConnected = false;
  @state() private paused = false;
  @state() private isDryRun = false;
  @state() private timerRemaining = 0;
  @state() private viewingTeamId = '';

  private ws: DraftWebSocket | null = null;
  private me: any = null;
  private timerInterval: number | null = null;
  private lastPickNumber = 0;

  onBeforeEnter(location: any) {
    this.seasonId = location.params.seasonId;
    guardRoute(`/season/${this.seasonId}/draft/snake`);
  }

  async connectedCallback() {
    super.connectedCallback();
    await getMe();
    this.me = getCachedUser();

    // Load season to get league_id for post-draft redirect
    const season = await api.getSeason(this.seasonId);
    this.leagueId = season.league_id ?? '';

    // Load players for the pool
    const result = await api.getPlayers(this.seasonId);
    this.players = result.players;

    // Connect WebSocket
    const token = getToken() || '';
    this.ws = new DraftWebSocket(this.seasonId, token);

    this.ws.on('connected', () => { this.wsConnected = true; });
    this.ws.on('disconnected', () => { this.wsConnected = false; });

    this.ws.on('draft_state', (data: DraftState) => {
      const prevPickNumber = this.lastPickNumber;
      this.draftState = data;
      this.paused = (data as any).paused || false;
      this.isDryRun = data.status === 'setup';
      this.initViewingTeam();

      // Auto-redirect to league home when draft completes
      if (data.is_complete && !this._redirectScheduled) {
        this._redirectScheduled = true;
        setTimeout(() => {
          window.location.href = this.leagueId
            ? `/league/${this.leagueId}`
            : `/season/${this.seasonId}`;
        }, 3000);
      }

      // Start timer when pick advances (new pick made) or on first load while drafting
      if (data.status === 'drafting' && data.timer_seconds > 0 && !this.paused) {
        if (data.current_pick_number !== prevPickNumber) {
          this.lastPickNumber = data.current_pick_number;
          this.startTimer(data.timer_seconds);
        }
      } else {
        this.lastPickNumber = data.current_pick_number;
        this.stopTimer();
        if (data.timer_seconds > 0) this.timerRemaining = data.timer_seconds;
      }
    });

    this.ws.on('pick_made', () => {}); // State update follows
    this.ws.on('pick_undone', () => {});
    this.ws.on('draft_paused', () => {
      this.paused = true;
      this.stopTimer();
    });
    this.ws.on('draft_resumed', () => {
      this.paused = false;
      const secs = this.draftState?.timer_seconds ?? 0;
      if (secs > 0) this.startTimer(secs);
    });
    this.ws.on('admin_timer_reset', (data: any) => {
      const timerVal = data?.pick_timer_seconds ?? this.draftState?.timer_seconds ?? 0;
      this.draftState = this.draftState
        ? { ...this.draftState, timer_seconds: timerVal }
        : this.draftState;
      if (timerVal > 0) this.startTimer(timerVal);
    });
    this.ws.on('error', (data: any) => {
      console.error('Draft error:', data.message || data);
    });

    this.ws.connect();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.ws?.disconnect();
    this.stopTimer();
  }

  private startTimer(seconds: number) {
    this.stopTimer();
    this.timerRemaining = seconds;
    this.timerInterval = window.setInterval(() => {
      if (this.timerRemaining > 0) {
        this.timerRemaining--;
      } else {
        this.stopTimer();
      }
    }, 1000);
  }

  private stopTimer() {
    if (this.timerInterval !== null) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
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

    // Sort: available first, then drafted; within each group use sortCol/sortDir
    return [...list].sort((a, b) => {
      const aD = drafted.has(a.id) ? 1 : 0;
      const bD = drafted.has(b.id) ? 1 : 0;
      if (aD !== bD) return aD - bD;
      return this._cmp(a, b);
    });
  }

  private _cmp(a: any, b: any): number {
    const dir = this.sortDir === 'asc' ? 1 : -1;
    if (this.sortCol === 'ranking') {
      if (a.ranking == null && b.ranking == null) return a.name.localeCompare(b.name);
      if (a.ranking == null) return 1;
      if (b.ranking == null) return -1;
      return (a.ranking - b.ranking) * dir;
    }
    return (a[this.sortCol] || '').localeCompare(b[this.sortCol] || '') * dir;
  }

  private toggleSort(col: 'ranking' | 'name' | 'ipl_team' | 'designation') {
    if (this.sortCol === col) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortCol = col;
      this.sortDir = 'asc';
    }
  }

  private get uniqueTeams(): string[] {
    return [...new Set(this.players.map((p) => p.ipl_team))].sort();
  }

  private get uniqueDesignations(): string[] {
    return [...new Set(this.players.map((p) => p.designation))].sort();
  }

  private get myTeamId(): string | null {
    if (!this.me || !this.draftState) return null;
    const mine = this.draftState.teams.find((t) => t.owner_id === this.me.user_id);
    return mine?.id ?? null;
  }

  private initViewingTeam() {
    if (!this.viewingTeamId && this.draftState?.teams.length) {
      this.viewingTeamId = this.myTeamId ?? this.draftState.teams[0].id;
    }
  }

  private get viewingTeamPicks(): any[] {
    return (this.draftState?.picks ?? [])
      .filter((p: any) => p.team_id === this.viewingTeamId)
      .sort((a: any, b: any) => a.pick_number - b.pick_number);
  }

  private get isViewer(): boolean {
    return !!this.me && !this.myTeamId && !isAdmin();
  }

  private pickPlayer(playerId: string) {
    if (this.isDryRun) return;
    this.ws?.pick(playerId);
  }

  private undoLastPick() {
    if (this.isDryRun) return;
    this.ws?.undoLastPick();
  }

  private togglePause() {
    if (this.isDryRun) return;
    if (this.paused) {
      this.ws?.adminResumeDraft();
    } else {
      this.ws?.adminPauseDraft();
    }
  }

  private async startDraft() {
    await api.startDraft(this.seasonId);
    // isDryRun flips false automatically when WS broadcasts new draft_state with status 'drafting'
  }

  private adminResetTimer() {
    this.ws?.adminResetTimer();
  }

  private endDraft() {
    this.ws?.adminEndDraft();
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

    // Build a pick map: key = `${round}-${teamId}`
    const pickMap = new Map<string, any>();
    for (const p of state.picks) {
      pickMap.set(`${p.round}-${p.team_id}`, p);
    }

    const rows = [];
    for (let r = 1; r <= state.total_rounds; r++) {
      rows.push(html`<div class="board-round">R${r}</div>`);
      // Always iterate teams in header order; pickMap lookup handles who picked what
      for (const team of teams) {
        const pick = pickMap.get(`${r}-${team.id}`);
        const isCurrent = !state.is_complete && state.current_round === r && state.current_team_id === team.id;

        rows.push(html`
          <div class="board-cell ${pick ? 'picked' : ''} ${isCurrent ? 'current' : ''} ${team.id === this.myTeamId ? 'my-team-cell' : ''}">
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
        ${teams.map((t: any) => html`<div class="board-header ${t.id === this.myTeamId ? 'my-team-header' : ''}">${t.name}</div>`)}
        ${rows}
      </div>
    `;
  }

  render() {
    const state = this.draftState;

    return html`
      ${state?.is_complete
        ? html`
          <div class="complete-banner">
            <div>Draft Complete!</div>
            <a class="btn btn-primary"
               href="${this.leagueId ? `/league/${this.leagueId}` : `/season/${this.seasonId}`}"
               style="display:inline-block;margin-top:0.75rem;text-decoration:none;">
              Go to League →
            </a>
          </div>`
        : ''}
      ${this.paused ? html`<div class="paused-banner">Draft Paused</div>` : ''}
      ${this.isDryRun ? html`
        <div class="preview-banner">
          <span>Preview Mode — Draft has not started yet</span>
          ${isAdmin() ? html`
            <button class="btn btn-primary btn-sm" @click=${this.startDraft}>Start Draft</button>
          ` : ''}
        </div>
      ` : ''}

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
          <!-- Status bar (always visible) -->
          ${state && !state.is_complete
            ? html`
                <div class="status-bar">
                  <div class="on-clock">${state.current_team_name || '...'}</div>
                  <div class="pick-info">
                    Pick #${state.current_pick_number} / Round ${state.current_round} of ${state.total_rounds}
                  </div>
                  ${state.timer_seconds > 0 && !this.isDryRun ? html`
                    <div style="margin-top: 0.5rem; font-size: 1.5rem; font-weight: 700;
                                color: ${this.timerRemaining <= 10 ? '#ef4444' : '#e2e8f0'};">
                      ${this.timerRemaining}s
                    </div>
                  ` : ''}
                  ${state.next_team_name ? html`
                    <div style="margin-top: 0.4rem; font-size: 0.8rem; color: #64748b;">
                      Up next: <span style="color: #e2e8f0; font-weight: 600;">${state.next_team_name}</span>
                    </div>
                  ` : ''}
                </div>
              `
            : ''}

          ${this.isViewer ? html`
            <!-- Viewer layout: status info only, no picks or player pool -->
            <div class="viewer-info">
              <p class="viewer-label">👁 Viewing Draft</p>
              ${state ? html`
                <p style="margin:0;">Round ${state.current_round} · Pick ${state.current_pick_number}</p>
                ${state.current_team_name ? html`<p style="margin:0.25rem 0 0;">${state.current_team_name} is on the clock</p>` : ''}
              ` : ''}
            </div>
          ` : html`
            <!-- Participant layout: team viewer + controls + player pool -->

            <!-- Team Viewer panel -->
            ${this.draftState?.teams.length ? html`
              <div class="card" style="padding: 0.75rem;">
                <div style="margin-bottom:0.5rem;">
                  <select style="width:100%;font-size:0.85rem;padding:0.3rem;"
                          @change=${(e: any) => { this.viewingTeamId = e.target.value; }}>
                    ${this.draftState.teams.map((t) => html`
                      <option value=${t.id} ?selected=${t.id === this.viewingTeamId}>
                        ${t.name}${t.id === this.myTeamId ? ' (You)' : ''}
                      </option>
                    `)}
                  </select>
                </div>
                ${this.draftState?.current_team_id === this.myTeamId && this.viewingTeamId === this.myTeamId ? html`
                  <p style="color:#f5a623;font-weight:600;font-size:0.85rem;margin:0 0 0.5rem;">
                    You're on the clock!
                  </p>
                ` : ''}
                <div style="max-height:300px;overflow-y:auto;">
                  ${this.viewingTeamPicks.length === 0
                    ? html`<p style="color:#64748b;font-size:0.85rem;margin:0;">No picks yet</p>`
                    : this.viewingTeamPicks.map((p: any) => html`
                        <div style="display:flex;justify-content:space-between;align-items:center;
                                    padding:0.3rem 0;border-bottom:1px solid #1e293b;">
                          <div>
                            <div style="font-size:0.85rem;">${p.player_name}</div>
                            <div style="font-size:0.7rem;color:#64748b;">
                              ${p.player_designation} · ${p.player_team}
                            </div>
                          </div>
                          <div style="font-size:0.75rem;color:#64748b;flex-shrink:0;">R${p.round}</div>
                        </div>
                      `)
                  }
                </div>
              </div>
            ` : ''}

            <!-- Commissioner Controls (admin only) -->
            ${isAdmin() ? html`
              <div class="controls">
                <button class="btn btn-secondary btn-sm" ?disabled=${this.isDryRun} @click=${this.togglePause}>
                  ${this.paused ? 'Resume' : 'Pause'}
                </button>
                <button class="btn btn-secondary btn-sm" ?disabled=${this.isDryRun} @click=${this.adminResetTimer}>Reset Timer</button>
                <button class="btn btn-danger btn-sm" ?disabled=${this.isDryRun} @click=${this.undoLastPick}>Undo Pick</button>
                <button class="btn btn-secondary btn-sm" @click=${this.exportDraft}>Export CSV</button>
                <button class="btn btn-danger btn-sm" ?disabled=${this.isDryRun} @click=${this.endDraft}>End Draft</button>
              </div>
            ` : ''}

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
              <div class="pool-sort-header">
                ${(['ranking', 'name', 'ipl_team', 'designation'] as const).map((col) => {
                  const label = col === 'ranking' ? '#' : col === 'ipl_team' ? 'Team' : col === 'designation' ? 'Role' : 'Name';
                  const arrow = this.sortCol === col ? (this.sortDir === 'asc' ? ' ↑' : ' ↓') : '';
                  return html`<button class="sort-btn ${this.sortCol === col ? 'active' : ''}" @click=${() => this.toggleSort(col)}>${label}${arrow}</button>`;
                })}
              </div>
              <div class="pool-section">
                ${this.filteredPlayers.map((p) => {
                  const isDrafted = this.draftedPlayerIds.has(p.id);
                  return html`
                    <div class="player-row ${isDrafted ? 'drafted' : ''}">
                      <span class="player-rank">${p.ranking != null ? p.ranking : '—'}</span>
                      <div class="player-info">
                        <div class="name">${p.name}</div>
                        <div class="meta">${p.ipl_team} - ${p.designation}</div>
                      </div>
                      ${!isDrafted && !state?.is_complete && !this.isDryRun
                        ? html`<button class="pick-btn"
                                       ?disabled=${state && !state.is_complete &&
                                                    state.current_team_id !== this.myTeamId &&
                                                    !isAdmin()}
                                       @click=${() => this.pickPlayer(p.id)}>Pick</button>`
                        : ''}
                    </div>
                  `;
                })}
              </div>
            </div>
          `}
        </div>
      </div>
    `;
  }
}
