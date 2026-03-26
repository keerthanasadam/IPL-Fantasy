import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { api } from '../services/api.js';
import { getMe, getCachedUser, isAdmin } from '../services/auth.js';
import { sharedStyles } from '../styles/shared-styles.js';
import '../components/csv-uploader.js';

const ROLE_KEYS = ['WK', 'BAT', 'BOWL', 'AR'] as const;
type RoleKey = typeof ROLE_KEYS[number];

@customElement('page-league')
export class PageLeague extends LitElement {
  static styles = [
    sharedStyles,
    css`
      .tabs {
        display: flex;
        gap: 0;
        margin-bottom: 1.5rem;
        border-bottom: 2px solid var(--border-color);
      }
      .tab {
        padding: 0.6rem 1.2rem;
        cursor: pointer;
        font-weight: 600;
        color: var(--text-muted);
        border-bottom: 2px solid transparent;
        margin-bottom: -2px;
      }
      .tab.active { color: var(--accent); border-bottom-color: var(--accent); }

      /* Leaderboard */
      table { width: 100%; border-collapse: collapse; }
      th { text-align: left; padding: 0.6rem; color: var(--text-subtle, #64748b); font-size: 0.8rem; text-transform: uppercase; }
      td { padding: 0.6rem; border-top: 1px solid var(--border-color); }
      tr.clickable { cursor: pointer; }
      tr.clickable:hover td { background: var(--bg-secondary); }
      .roster-row td { padding: 0; border-top: none; }
      .roster-table { width: 100%; border-collapse: collapse; background: var(--bg-secondary); }
      .roster-table th { padding: 0.4rem 0.6rem; font-size: 0.75rem; }
      .roster-table td { padding: 0.4rem 0.6rem; border-top: 1px solid var(--border-color); font-size: 0.85rem; }

      /* Team grid (pre-draft) */
      .team-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.75rem; }
      .team-card { padding: 1rem; }
      .team-card .pos { font-size: 1.5rem; font-weight: 700; color: var(--accent); }
      .my-team-badge {
        display: inline-block; font-size: 0.7rem; font-weight: 700;
        background: var(--accent); color: var(--accent-dark);
        border-radius: 4px; padding: 0.1rem 0.4rem; margin-bottom: 0.35rem;
      }
      .edit-team-btn {
        background: none; border: none; cursor: pointer; color: var(--text-muted);
        font-size: 0.8rem; padding: 0 0.2rem; opacity: 0.7; transition: opacity 0.15s; vertical-align: middle;
      }
      .edit-team-btn:hover { opacity: 1; color: var(--accent); }
      .rename-row { display: flex; flex-direction: column; gap: 0.35rem; margin-top: 0.4rem; }
      .rename-row input {
        width: 100%; padding: 0.3rem 0.5rem; font-size: 0.85rem;
        border: 1px solid var(--accent); border-radius: 6px;
        background: var(--bg-input); color: var(--text-primary); outline: none;
      }
      .rename-actions { display: flex; gap: 0.35rem; }
      .rename-save {
        background: var(--accent); color: var(--accent-dark);
        border: none; border-radius: 6px; padding: 0.25rem 0.6rem;
        font-size: 0.78rem; font-weight: 600; cursor: pointer;
      }
      .rename-save:disabled { opacity: 0.6; cursor: default; }
      .rename-cancel {
        background: var(--bg-secondary); color: var(--text-primary);
        border: none; border-radius: 6px; padding: 0.25rem 0.6rem;
        font-size: 0.78rem; cursor: pointer;
      }
      .rename-err { font-size: 0.75rem; color: #ef4444; }
      .rename-ok  { font-size: 0.75rem; color: #22c55e; }

      /* Draft room */
      .draft-info { display: flex; flex-direction: column; gap: 1rem; }
      .player-count { font-size: 2rem; font-weight: 700; color: var(--accent); }
      .actions { display: flex; gap: 0.75rem; margin: 1.5rem 0; flex-wrap: wrap; }
      .section { margin-top: 2rem; }

      /* Settings */
      .settings-section { margin-bottom: 2rem; }
      .settings-section h3 { margin-bottom: 1rem; color: var(--text-primary); border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem; }
      .locked-notice { font-size: 0.85rem; color: var(--text-subtle, #64748b); margin-bottom: 0.75rem; }
      .role-limits-table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; }
      .role-limits-table th { text-align: left; font-size: 0.8rem; color: var(--text-muted); padding: 0.25rem 0.5rem; }
      .role-limits-table td { padding: 0.25rem 0.5rem; }
      .role-limits-table td:first-child { color: var(--accent); font-weight: 600; width: 3rem; }
      .role-limits-table input[type="number"] { width: 60px; }
      .confirm-overlay {
        position: fixed; inset: 0; background: rgba(0,0,0,0.7);
        display: flex; align-items: center; justify-content: center; z-index: 100;
      }
      .confirm-dialog {
        background: var(--bg-card); border: 1px solid var(--border-color);
        border-radius: 12px; padding: 2rem; max-width: 400px; width: 90%;
      }
      .confirm-dialog h3 { margin: 0 0 0.75rem; color: #ef4444; }
      .confirm-dialog p { color: var(--text-muted); margin-bottom: 1.5rem; }
      .confirm-actions { display: flex; gap: 0.75rem; justify-content: flex-end; }
      .success-flash { color: #22c55e; font-size: 0.85rem; margin-left: 0.75rem; }

      /* Admin users table */
      .users-table { width: 100%; border-collapse: collapse; }
      .users-table th { text-align: left; padding: 0.5rem; font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; }
      .users-table td { padding: 0.5rem; border-top: 1px solid var(--border-color); font-size: 0.9rem; }
      .temp-pw-box {
        background: #052e16; border: 1px solid #16a34a; border-radius: 8px;
        padding: 0.75rem; margin-top: 0.75rem;
      }
      .temp-pw-box p { color: #4ade80; font-size: 0.82rem; margin: 0 0 0.35rem; }
      .temp-pw-value { font-family: monospace; font-size: 1.2rem; font-weight: 700; color: #86efac; letter-spacing: 0.1em; }
    `,
  ];

  @state() private leagueId = '';
  @state() private league: any = null;
  @state() private season: any = null;
  @state() private activeTab: 'home' | 'draft' | 'settings' = 'home';
  @state() private adminUser = false;
  private currentUserId: string | null = null;

  // Leaderboard
  @state() private expandedTeams = new Set<string>();
  @state() private rosters: Record<string, any[]> = {};
  @state() private rostersLoaded = false;

  // Team rename
  @state() private renameTeamId: string | null = null;
  @state() private renameTeamValue = '';
  @state() private renameTeamSaving = false;
  @state() private renameTeamError = '';
  @state() private renameTeamSaved: string | null = null;

  // Settings — General
  @state() private renameLabel = '';
  @state() private renameLoading = false;
  @state() private renameSuccess = false;
  @state() private showDeleteConfirm = false;
  @state() private deleteLoading = false;

  // Settings — Draft Rules
  @state() private cfgRounds = 15;
  @state() private cfgPickTimer = 0;
  @state() private cfgScheduledTime = '';
  @state() private cfgOnTimeout: 'auto_pick' | 'skip_turn' = 'auto_pick';
  @state() private cfgRoleLimits: Record<RoleKey, { min: number; max: number }> = {
    WK: { min: 1, max: 2 }, BAT: { min: 3, max: 6 }, BOWL: { min: 3, max: 6 }, AR: { min: 1, max: 4 },
  };
  @state() private rulesLoading = false;
  @state() private rulesSuccess = false;

  // Settings — Draft Order
  @state() private draftOrderTeams: any[] = [];
  @state() private draftOrderSaving = false;
  @state() private draftOrderSuccess = false;

  // Settings — Players
  @state() private playerCount = 0;
  @state() private showClearConfirm = false;
  @state() private clearPlayersLoading = false;

  // Settings — Users (admin password reset)
  @state() private leagueUsers: any[] = [];
  @state() private resetUserId: string | null = null;
  @state() private resetTempPw: string | null = null;
  @state() private resetLoading = false;

  @state() private error = '';

  onBeforeEnter(location: any) {
    this.leagueId = location.params.leagueId;
  }

  async connectedCallback() {
    super.connectedCallback();
    await getMe();
    this.adminUser = isAdmin();
    this.currentUserId = getCachedUser()?.id ?? null;
    if (this.leagueId) await this.load();
  }

  async load() {
    this.league = await api.getLeague(this.leagueId);
    if (this.league.seasons?.length) {
      const sorted = [...this.league.seasons].sort(
        (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      this.season = await api.getSeason(sorted[0].id);
      const players = await api.getPlayers(this.season.id);
      this.playerCount = players.total;
      this._syncDraftConfigFields();
      this.renameLabel = this.season.label;
      this.draftOrderTeams = [...(this.season.teams || [])].sort(
        (a: any, b: any) => a.draft_position - b.draft_position
      );
      // Build users list from teams for admin
      if (this.adminUser) {
        const seen = new Set<string>();
        this.leagueUsers = (this.season.teams || [])
          .filter((t: any) => t.owner_id && !seen.has(t.owner_id) && seen.add(t.owner_id))
          .map((t: any) => ({ id: t.owner_id, display_name: t.owner_name ?? t.name }));
      }
    }
  }

  private _syncDraftConfigFields() {
    const cfg = this.season?.draft_config || {};
    this.cfgRounds = cfg.rounds ?? 15;
    this.cfgPickTimer = cfg.pick_timer_seconds ?? 0;
    this.cfgScheduledTime = cfg.scheduled_draft_time ?? '';
    this.cfgOnTimeout = cfg.on_timeout ?? 'auto_pick';
    const rl = cfg.role_limits || {};
    this.cfgRoleLimits = {
      WK:   rl.WK   ? { min: rl.WK.min,   max: rl.WK.max   } : { min: 1, max: 2 },
      BAT:  rl.BAT  ? { min: rl.BAT.min,  max: rl.BAT.max  } : { min: 3, max: 6 },
      BOWL: rl.BOWL ? { min: rl.BOWL.min, max: rl.BOWL.max } : { min: 3, max: 6 },
      AR:   rl.AR   ? { min: rl.AR.min,   max: rl.AR.max   } : { min: 1, max: 4 },
    };
  }

  private get isPreDraft() {
    return this.season?.status === 'setup' || this.season?.status === 'drafting';
  }

  private get hasScores() {
    return Object.values(this.rosters).some((players: any[]) =>
      players.some((p: any) => p.points > 0)
    );
  }

  // ── Leaderboard ──────────────────────────────────────────────────────────

  private async toggleTeam(teamId: string) {
    if (!this.rostersLoaded) {
      const data: any[] = await api.getSeasonRosters(this.season.id);
      const map: Record<string, any[]> = {};
      for (const t of data) { map[t.team_id] = t.players; }
      this.rosters = map;
      this.rostersLoaded = true;
    }
    const next = new Set(this.expandedTeams);
    if (next.has(teamId)) next.delete(teamId);
    else next.add(teamId);
    this.expandedTeams = next;
  }

  private renderRoster(teamId: string) {
    const players = this.rosters[teamId] ?? [];
    return html`
      <table class="roster-table">
        <thead>
          <tr>
            <th>Player</th><th>IPL Team</th><th>Role</th>
            ${this.hasScores ? html`<th>Pts</th>` : ''}
          </tr>
        </thead>
        <tbody>
          ${players.map((p: any) => html`
            <tr>
              <td>${p.name}</td>
              <td class="text-muted">${p.ipl_team}</td>
              <td class="text-muted">${p.designation}</td>
              ${this.hasScores ? html`<td class="text-gold">${p.points.toFixed(1)}</td>` : ''}
            </tr>
          `)}
        </tbody>
      </table>
    `;
  }

  // ── Team rename ───────────────────────────────────────────────────────────

  private startTeamRename(teamId: string, currentName: string) {
    this.renameTeamId = teamId;
    this.renameTeamValue = currentName;
    this.renameTeamSaving = false;
    this.renameTeamError = '';
    this.updateComplete.then(() => {
      const input = this.shadowRoot?.querySelector<HTMLInputElement>('.rename-row input');
      input?.focus();
      input?.select();
    });
  }

  private cancelTeamRename() {
    this.renameTeamId = null;
    this.renameTeamError = '';
  }

  private async saveTeamRename() {
    if (!this.renameTeamId) return;
    const name = this.renameTeamValue.trim();
    if (!name) { this.renameTeamError = 'Name cannot be empty.'; return; }
    this.renameTeamSaving = true;
    this.renameTeamError = '';
    try {
      await api.updateTeam(this.renameTeamId, { name });
      if (this.season?.teams) {
        this.season = {
          ...this.season,
          teams: this.season.teams.map((t: any) =>
            t.id === this.renameTeamId ? { ...t, name } : t
          ),
        };
      }
      const savedId = this.renameTeamId;
      this.renameTeamId = null;
      this.renameTeamSaved = savedId;
      setTimeout(() => { this.renameTeamSaved = null; }, 2500);
    } catch (err: any) {
      this.renameTeamError = err.message || 'Failed to save.';
    } finally {
      this.renameTeamSaving = false;
    }
  }

  private handleTeamRenameKey(e: KeyboardEvent) {
    if (e.key === 'Enter') this.saveTeamRename();
    if (e.key === 'Escape') this.cancelTeamRename();
  }

  // ── Settings actions ──────────────────────────────────────────────────────

  private async saveRename() {
    if (!this.renameLabel.trim()) return;
    this.renameLoading = true;
    this.error = '';
    try {
      await api.updateSeason(this.season.id, { label: this.renameLabel.trim() });
      this.renameSuccess = true;
      this.season = { ...this.season, label: this.renameLabel.trim() };
      setTimeout(() => { this.renameSuccess = false; }, 2000);
    } catch (err: any) {
      this.error = err.message;
    } finally {
      this.renameLoading = false;
    }
  }

  private async confirmDelete() {
    this.deleteLoading = true;
    this.error = '';
    try {
      await api.deleteSeason(this.season.id);
      window.location.href = `/league/${this.leagueId}`;
    } catch (err: any) {
      this.error = err.message;
      this.showDeleteConfirm = false;
    } finally {
      this.deleteLoading = false;
    }
  }

  private async saveRules() {
    this.rulesLoading = true;
    this.error = '';
    try {
      await api.updateSeason(this.season.id, {
        draft_config: {
          rounds: this.cfgRounds,
          pick_timer_seconds: this.cfgPickTimer,
          scheduled_draft_time: this.cfgScheduledTime || undefined,
          on_timeout: this.cfgOnTimeout,
          role_limits: this.cfgRoleLimits,
        },
      });
      this.rulesSuccess = true;
      setTimeout(() => { this.rulesSuccess = false; }, 2000);
      await this.load();
    } catch (err: any) {
      this.error = err.message;
    } finally {
      this.rulesLoading = false;
    }
  }

  private updateCfgRoleLimit(role: RoleKey, field: 'min' | 'max', value: number) {
    this.cfgRoleLimits = { ...this.cfgRoleLimits, [role]: { ...this.cfgRoleLimits[role], [field]: value } };
  }

  private moveDraftTeam(index: number, direction: -1 | 1) {
    const arr = [...this.draftOrderTeams];
    const swapIdx = index + direction;
    if (swapIdx < 0 || swapIdx >= arr.length) return;
    [arr[index], arr[swapIdx]] = [arr[swapIdx], arr[index]];
    this.draftOrderTeams = arr;
  }

  private async saveDraftOrder() {
    this.draftOrderSaving = true;
    try {
      const payload = this.draftOrderTeams.map((t: any, i: number) => ({
        team_id: t.id,
        draft_position: i + 1,
      }));
      await api.updateDraftOrder(this.season.id, payload);
      this.draftOrderSuccess = true;
      setTimeout(() => { this.draftOrderSuccess = false; }, 2000);
    } catch (e: any) {
      this.error = e.message;
    } finally {
      this.draftOrderSaving = false;
    }
  }

  async handleImport(e: CustomEvent) {
    try {
      await api.importPlayers(this.season.id, e.detail.file);
      await this.load();
    } catch (err: any) {
      this.error = err.message;
    }
  }

  private async confirmClearPlayers() {
    this.clearPlayersLoading = true;
    this.error = '';
    try {
      await api.clearPlayers(this.season.id);
      this.showClearConfirm = false;
      await this.load();
    } catch (err: any) {
      this.error = err.message;
    } finally {
      this.clearPlayersLoading = false;
    }
  }

  private async startDraft() {
    this.error = '';
    try {
      await api.startDraft(this.season.id);
      window.location.href = `/season/${this.season.id}/draft/snake`;
    } catch (err: any) {
      this.error = err.message;
    }
  }

  private async adminResetPassword(userId: string) {
    this.resetLoading = true;
    this.resetTempPw = null;
    this.resetUserId = userId;
    try {
      const res = await api.adminResetPassword(userId);
      this.resetTempPw = res.temp_password;
    } catch (err: any) {
      this.error = err.message;
      this.resetUserId = null;
    } finally {
      this.resetLoading = false;
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  render() {
    if (!this.league) return html`<p class="text-muted">Loading...</p>`;

    return html`
      ${this.showDeleteConfirm ? this.renderDeleteConfirm() : ''}
      ${this.showClearConfirm ? this.renderClearConfirm() : ''}
      ${this.resetTempPw ? this.renderResetModal() : ''}

      <div style="max-width:900px;margin:2rem auto;padding:0 1rem;">
        <div class="flex justify-between items-center">
          <h1>${this.league.name}</h1>
          ${this.season ? html`
            <span class="badge ${this.season.status === 'drafting' ? 'badge-gold' : this.season.status === 'active' || this.season.status === 'completed' ? 'badge-green' : 'badge-gray'}"
                  style="font-size:1rem;padding:0.4rem 1rem;">
              ${this.season.status.toUpperCase()}
            </span>
          ` : ''}
        </div>

        ${!this.season ? html`<p class="text-muted">No seasons yet.</p>` : html`
          <div class="tabs">
            <div class="tab ${this.activeTab === 'home' ? 'active' : ''}"
                 @click=${() => this.activeTab = 'home'}>🏠 Home</div>
            <div class="tab ${this.activeTab === 'draft' ? 'active' : ''}"
                 @click=${() => this.activeTab = 'draft'}>⚡ Draft Room</div>
            ${this.adminUser ? html`
              <div class="tab ${this.activeTab === 'settings' ? 'active' : ''}"
                   @click=${() => this.activeTab = 'settings'}>⚙ Settings</div>
            ` : ''}
          </div>

          ${this.error ? html`<p class="text-red" style="margin-bottom:1rem;">${this.error}</p>` : ''}

          ${this.activeTab === 'home' ? (this.isPreDraft ? this.renderTeamGrid() : this.renderLeaderboard()) : ''}
          ${this.activeTab === 'draft' ? this.renderDraftRoom() : ''}
          ${this.activeTab === 'settings' && this.adminUser ? this.renderSettings() : ''}
        `}
      </div>
    `;
  }

  private renderTeamGrid() {
    const s = this.season;
    return html`
      <p class="text-muted">${s.team_count} teams · ${s.draft_format} draft · ${s.draft_config?.rounds || 15} rounds</p>
      <div class="section">
        <h2>Teams (Draft Order)</h2>
        <div class="team-grid">
          ${(s.teams || []).map((t: any) => {
            const isMyTeam = this.currentUserId && t.owner_id === this.currentUserId;
            const isRenaming = this.renameTeamId === t.id;
            return html`
              <div class="card team-card">
                <div class="pos">#${t.draft_position}</div>
                ${isMyTeam ? html`<div class="my-team-badge">MY TEAM</div>` : ''}
                ${isRenaming ? html`
                  <div class="rename-row">
                    <input type="text" .value=${this.renameTeamValue}
                           @input=${(e: any) => { this.renameTeamValue = e.target.value; }}
                           @keydown=${this.handleTeamRenameKey}
                           ?disabled=${this.renameTeamSaving} />
                    <div class="rename-actions">
                      <button class="rename-save" ?disabled=${this.renameTeamSaving} @click=${this.saveTeamRename}>
                        ${this.renameTeamSaving ? '…' : 'Save'}
                      </button>
                      <button class="rename-cancel" ?disabled=${this.renameTeamSaving} @click=${this.cancelTeamRename}>Cancel</button>
                    </div>
                    ${this.renameTeamError ? html`<span class="rename-err">${this.renameTeamError}</span>` : ''}
                  </div>
                ` : html`
                  <div>
                    ${t.name}
                    ${isMyTeam ? html`
                      <button class="edit-team-btn" title="Rename your team"
                              @click=${() => this.startTeamRename(t.id, t.name)}>✏️</button>
                      ${this.renameTeamSaved === t.id ? html`<span class="rename-ok">Saved!</span>` : ''}
                    ` : ''}
                  </div>
                `}
              </div>
            `;
          })}
        </div>
      </div>
    `;
  }

  private renderLeaderboard() {
    const teams = this.season?.teams ?? [];
    const sorted = [...teams].sort((a: any, b: any) => b.points - a.points);
    return html`
      <div class="card">
        <h2>${this.season.label} — Standings</h2>
        ${sorted.length === 0 ? html`<p class="text-muted">No teams yet.</p>` : html`
          <table>
            <thead>
              <tr><th>Rank</th><th>Team</th><th>Manager</th><th>Pts</th></tr>
            </thead>
            <tbody>
              ${sorted.map((t: any, i: number) => {
                const expanded = this.expandedTeams.has(t.id);
                return html`
                  <tr class="clickable" @click=${() => this.toggleTeam(t.id)}>
                    <td>${i + 1}</td>
                    <td>${t.name} ${expanded ? '▾' : '▸'}</td>
                    <td class="text-muted">${t.owner_name ?? '—'}</td>
                    <td class="text-gold">${Number(t.points).toFixed(1)}</td>
                  </tr>
                  ${expanded ? html`
                    <tr class="roster-row"><td colspan="4">${this.renderRoster(t.id)}</td></tr>
                  ` : ''}
                `;
              })}
            </tbody>
          </table>
        `}
      </div>
    `;
  }

  private renderDraftRoom() {
    const s = this.season;
    const statusMap: Record<string, string> = {
      setup: 'badge-blue', drafting: 'badge-gold', active: 'badge-green', completed: 'badge-gray',
    };
    return html`
      <div class="card draft-info">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <h2 style="margin:0;">${s.label}</h2>
          <span class="badge ${statusMap[s.status] ?? 'badge-gray'}">${s.status.toUpperCase()}</span>
        </div>
        <div class="text-muted">
          ${s.team_count} teams · ${s.draft_format} draft · ${s.draft_config?.rounds ?? '—'} rounds
        </div>

        ${s.status === 'setup' && s.invite_code ? html`
          <div style="background:var(--bg-secondary);border-radius:8px;padding:0.75rem 1rem;">
            <span class="text-muted" style="font-size:0.85rem;">Invite Code: </span>
            <strong class="text-gold" style="font-size:1.1rem;letter-spacing:0.05em;">${s.invite_code}</strong>
          </div>
        ` : ''}

        <div class="actions" style="margin:0;">
          ${s.status === 'setup' && this.adminUser ? html`
            <button class="btn btn-primary" @click=${this.startDraft} ?disabled=${this.playerCount === 0}>
              Start Draft
            </button>
            ${this.playerCount === 0 ? html`<p class="text-muted" style="margin:0;align-self:center;">Import players first (Settings → Players)</p>` : ''}
          ` : ''}
          ${s.status === 'setup' ? html`
            <button class="btn btn-secondary"
                    @click=${() => window.location.href = `/season/${s.id}/draft/snake`}>
              Preview Draft Room
            </button>
          ` : ''}
          ${s.status === 'drafting' ? html`
            <button class="btn btn-primary"
                    @click=${() => window.location.href = `/season/${s.id}/draft/snake`}>
              Enter Draft Room
            </button>
          ` : ''}
          ${s.status === 'completed' ? html`
            <button class="btn btn-secondary"
                    @click=${() => window.location.href = `/season/${s.id}/draft/snake?view=tv`}>
              View Draft Board
            </button>
          ` : ''}
        </div>

        <div class="section">
          <div class="flex justify-between items-center">
            <h2>Player Pool</h2>
            <div class="player-count">${this.playerCount} players</div>
          </div>
          <button class="btn btn-secondary btn-sm" style="margin-top:0.75rem;"
                  @click=${() => window.location.href = `/season/${s.id}/players`}>
            View Player Pool
          </button>
        </div>
      </div>
    `;
  }

  private renderSettings() {
    const s = this.season;
    const isSetup = s.status === 'setup';

    return html`
      <!-- General -->
      <div class="settings-section">
        <h3>General</h3>
        <div class="form-group" style="max-width:360px;">
          <label>Season Label</label>
          <input type="text" .value=${this.renameLabel} @input=${(e: any) => this.renameLabel = e.target.value} />
          <div style="display:flex;align-items:center;gap:0.75rem;margin-top:0.5rem;">
            <button class="btn btn-primary btn-sm" ?disabled=${this.renameLoading} @click=${this.saveRename}>
              ${this.renameLoading ? 'Saving...' : 'Save Label'}
            </button>
            ${this.renameSuccess ? html`<span class="success-flash">Saved!</span>` : ''}
          </div>
        </div>
        <div style="margin-top:1.5rem;">
          <button class="btn btn-danger" ?disabled=${!isSetup || this.deleteLoading}
                  @click=${() => this.showDeleteConfirm = true}>
            Delete Season
          </button>
          ${!isSetup ? html`<p class="locked-notice" style="margin-top:0.5rem;">Can only delete seasons in SETUP status.</p>` : ''}
        </div>
      </div>

      <!-- Draft Rules -->
      <div class="settings-section">
        <h3>Draft Rules</h3>
        ${!isSetup ? html`<p class="locked-notice">Structural draft rules are locked after setup. Pick timer and timeout behavior can still be changed.</p>` : ''}
        <fieldset style="border:none;padding:0;" ?disabled=${!isSetup}>
          <div class="form-group" style="max-width:200px;">
            <label>Draft Rounds</label>
            <input type="number" min="1" .value=${String(this.cfgRounds)}
                   @input=${(e: any) => this.cfgRounds = Number(e.target.value)} />
          </div>
        </fieldset>
        <div class="form-group" style="max-width:200px;">
          <label>Pick Timer (seconds, 0 = no timer)</label>
          <input type="number" min="0" .value=${String(this.cfgPickTimer)}
                 @input=${(e: any) => this.cfgPickTimer = Number(e.target.value)} />
        </div>
        <fieldset style="border:none;padding:0;" ?disabled=${!isSetup}>
          <div class="form-group" style="max-width:280px;">
            <label>Scheduled Draft Time <span class="text-muted" style="font-weight:400;">(informational)</span></label>
            <input type="datetime-local" .value=${this.cfgScheduledTime}
                   @input=${(e: any) => this.cfgScheduledTime = e.target.value} />
          </div>
          <div class="form-group">
            <label>Role Limits</label>
            <table class="role-limits-table">
              <thead><tr><th>Role</th><th>Min picks</th><th>Max picks</th></tr></thead>
              <tbody>
                ${ROLE_KEYS.map(role => html`
                  <tr>
                    <td>${role}</td>
                    <td><input type="number" min="0" .value=${String(this.cfgRoleLimits[role].min)}
                               @input=${(e: any) => this.updateCfgRoleLimit(role, 'min', Number(e.target.value))} /></td>
                    <td><input type="number" min="0" .value=${String(this.cfgRoleLimits[role].max)}
                               @input=${(e: any) => this.updateCfgRoleLimit(role, 'max', Number(e.target.value))} /></td>
                  </tr>
                `)}
              </tbody>
            </table>
          </div>
        </fieldset>
        <div class="form-group" style="max-width:280px;">
          <label>On Pick Timeout</label>
          <select .value=${this.cfgOnTimeout} @change=${(e: any) => this.cfgOnTimeout = e.target.value}>
            <option value="auto_pick">Auto-pick (best available)</option>
            <option value="skip_turn">Skip turn</option>
          </select>
        </div>
        <div style="display:flex;align-items:center;gap:0.75rem;">
          <button class="btn btn-primary btn-sm" ?disabled=${this.rulesLoading} @click=${this.saveRules}>
            ${this.rulesLoading ? 'Saving...' : 'Save Draft Rules'}
          </button>
          ${this.rulesSuccess ? html`<span class="success-flash">Saved!</span>` : ''}
        </div>
      </div>

      <!-- Draft Order -->
      ${isSetup ? html`
        <div class="settings-section">
          <h3>Draft Order</h3>
          <p class="text-muted" style="font-size:0.85rem;margin-bottom:0.75rem;">
            Position 1 picks first in round 1.
          </p>
          ${this.draftOrderTeams.map((t: any, i: number) => html`
            <div style="display:flex;align-items:center;gap:0.5rem;padding:0.35rem 0;border-bottom:1px solid var(--border-color);">
              <span style="width:1.5rem;color:var(--text-muted);font-size:0.8rem;flex-shrink:0;">${i + 1}</span>
              <span style="flex:1;font-size:0.9rem;">${t.name}</span>
              <button class="btn btn-secondary btn-sm" style="padding:0.15rem 0.4rem;" ?disabled=${i === 0}
                      @click=${() => this.moveDraftTeam(i, -1)}>↑</button>
              <button class="btn btn-secondary btn-sm" style="padding:0.15rem 0.4rem;"
                      ?disabled=${i === this.draftOrderTeams.length - 1}
                      @click=${() => this.moveDraftTeam(i, 1)}>↓</button>
            </div>
          `)}
          <div style="display:flex;align-items:center;gap:0.75rem;margin-top:0.75rem;">
            <button class="btn btn-primary btn-sm" ?disabled=${this.draftOrderSaving} @click=${this.saveDraftOrder}>
              ${this.draftOrderSaving ? 'Saving...' : 'Save Order'}
            </button>
            ${this.draftOrderSuccess ? html`<span class="success-flash">Saved!</span>` : ''}
          </div>
        </div>
      ` : ''}

      <!-- Players -->
      <div class="settings-section">
        <h3>Players</h3>
        <p class="text-muted">Current player pool: <strong class="text-gold">${this.playerCount}</strong> players</p>
        <p style="font-size:0.85rem;color:var(--text-subtle,#64748b);margin-bottom:1rem;">
          To fix bad data: clear first, then re-upload to avoid duplicates.
        </p>
        <button class="btn btn-danger btn-sm" ?disabled=${this.clearPlayersLoading}
                @click=${() => this.showClearConfirm = true}>
          ${this.clearPlayersLoading ? 'Clearing...' : 'Clear All Players'}
        </button>
        <div style="margin-top:1rem;">
          <csv-uploader @file-selected=${this.handleImport}></csv-uploader>
        </div>
      </div>

      <!-- Users -->
      <div class="settings-section">
        <h3>Users</h3>
        <p class="text-muted" style="font-size:0.85rem;margin-bottom:0.75rem;">
          Reset a user's password to a temporary one they must change on next login.
        </p>
        ${this.leagueUsers.length === 0
          ? html`<p class="text-muted">No users have joined yet.</p>`
          : html`
            <table class="users-table">
              <thead><tr><th>Name</th><th></th></tr></thead>
              <tbody>
                ${this.leagueUsers.map((u: any) => html`
                  <tr>
                    <td>${u.display_name}</td>
                    <td>
                      <button class="btn btn-secondary btn-sm"
                              ?disabled=${this.resetLoading && this.resetUserId === u.id}
                              @click=${() => this.adminResetPassword(u.id)}>
                        ${this.resetLoading && this.resetUserId === u.id ? 'Resetting...' : 'Reset Password'}
                      </button>
                    </td>
                  </tr>
                `)}
              </tbody>
            </table>
          `
        }
      </div>
    `;
  }

  private renderDeleteConfirm() {
    return html`
      <div class="confirm-overlay">
        <div class="confirm-dialog">
          <h3>Delete "${this.season?.label}"?</h3>
          <p>This will delete all teams and players. Cannot be undone.</p>
          <div class="confirm-actions">
            <button class="btn btn-secondary" @click=${() => this.showDeleteConfirm = false}>Cancel</button>
            <button class="btn btn-danger" ?disabled=${this.deleteLoading} @click=${this.confirmDelete}>
              ${this.deleteLoading ? 'Deleting...' : 'Delete Season'}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private renderClearConfirm() {
    return html`
      <div class="confirm-overlay">
        <div class="confirm-dialog">
          <h3>Clear All Players?</h3>
          <p>This will remove all ${this.playerCount} players from this season. Cannot be undone.</p>
          <div class="confirm-actions">
            <button class="btn btn-secondary" @click=${() => this.showClearConfirm = false}>Cancel</button>
            <button class="btn btn-danger" ?disabled=${this.clearPlayersLoading} @click=${this.confirmClearPlayers}>
              ${this.clearPlayersLoading ? 'Clearing...' : 'Clear Players'}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private renderResetModal() {
    return html`
      <div class="confirm-overlay" @click=${(e: Event) => { if (e.target === e.currentTarget) { this.resetTempPw = null; this.resetUserId = null; } }}>
        <div class="confirm-dialog">
          <h3 style="color:var(--accent);">Temporary Password Generated</h3>
          <p>Share this temporary password with the user. They must change it on next login.</p>
          <div class="temp-pw-box">
            <p>Temporary password:</p>
            <span class="temp-pw-value">${this.resetTempPw}</span>
          </div>
          <div class="confirm-actions" style="margin-top:1rem;">
            <button class="btn btn-secondary btn-sm"
                    @click=${() => navigator.clipboard.writeText(this.resetTempPw ?? '')}>
              Copy
            </button>
            <button class="btn btn-primary btn-sm"
                    @click=${() => { this.resetTempPw = null; this.resetUserId = null; }}>
              Done
            </button>
          </div>
        </div>
      </div>
    `;
  }
}
