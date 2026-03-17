import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { api } from '../services/api.js';
import { getMe, isAdmin } from '../services/auth.js';
import { sharedStyles } from '../styles/shared-styles.js';
import '../components/csv-uploader.js';

const ROLE_KEYS = ['WK', 'BAT', 'BOWL', 'AR'] as const;
type RoleKey = typeof ROLE_KEYS[number];

@customElement('page-season')
export class PageSeason extends LitElement {
  static styles = [
    sharedStyles,
    css`
      .tabs { display: flex; gap: 0; margin-bottom: 1.5rem; border-bottom: 2px solid #334155; }
      .tab { padding: 0.6rem 1.2rem; cursor: pointer; font-weight: 600; color: #94a3b8;
             border-bottom: 2px solid transparent; margin-bottom: -2px; }
      .tab.active { color: #f5a623; border-bottom-color: #f5a623; }

      .team-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.75rem; }
      .team-card { padding: 1rem; }
      .team-card .pos { font-size: 1.5rem; font-weight: 700; color: #f5a623; }
      .actions { display: flex; gap: 0.75rem; margin: 1.5rem 0; flex-wrap: wrap; }
      .section { margin-top: 2rem; }
      .player-count { font-size: 2rem; font-weight: 700; color: #f5a623; }

      .settings-section { margin-bottom: 2rem; }
      .settings-section h3 { margin-bottom: 1rem; color: #e2e8f0; border-bottom: 1px solid #334155; padding-bottom: 0.5rem; }
      .locked-notice { font-size: 0.85rem; color: #64748b; margin-bottom: 0.75rem; }

      .role-limits-table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; }
      .role-limits-table th { text-align: left; font-size: 0.8rem; color: #94a3b8; padding: 0.25rem 0.5rem; }
      .role-limits-table td { padding: 0.25rem 0.5rem; }
      .role-limits-table td:first-child { color: #f5a623; font-weight: 600; width: 3rem; }
      .role-limits-table input[type="number"] { width: 60px; }

      .confirm-overlay {
        position: fixed; inset: 0; background: rgba(0,0,0,0.7);
        display: flex; align-items: center; justify-content: center; z-index: 100;
      }
      .confirm-dialog {
        background: #1e293b; border: 1px solid #334155; border-radius: 12px;
        padding: 2rem; max-width: 400px; width: 90%;
      }
      .confirm-dialog h3 { margin: 0 0 0.75rem; color: #ef4444; }
      .confirm-dialog p { color: #94a3b8; margin-bottom: 1.5rem; }
      .confirm-actions { display: flex; gap: 0.75rem; justify-content: flex-end; }
      .success-flash { color: #22c55e; font-size: 0.85rem; margin-left: 0.75rem; }
    `,
  ];

  @state() private seasonId = '';
  @state() private season: any = null;
  @state() private playerCount = 0;
  @state() private activeTab: 'home' | 'draft' | 'settings' = 'home';

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

  // Settings — Players
  @state() private showClearConfirm = false;
  @state() private clearPlayersLoading = false;

  @state() private error = '';

  onBeforeEnter(location: any) {
    this.seasonId = location.params.seasonId;
  }

  async connectedCallback() {
    super.connectedCallback();
    await getMe();
    await this.load();
  }

  async load() {
    if (!this.seasonId) return;
    this.season = await api.getSeason(this.seasonId);
    const players = await api.getPlayers(this.seasonId);
    this.playerCount = players.total;
    this._syncDraftConfigFields();
    this.renameLabel = this.season.label;
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

  private updateCfgRoleLimit(role: RoleKey, field: 'min' | 'max', value: number) {
    this.cfgRoleLimits = { ...this.cfgRoleLimits, [role]: { ...this.cfgRoleLimits[role], [field]: value } };
  }

  async handleImport(e: CustomEvent) {
    const file = e.detail.file;
    try {
      await api.importPlayers(this.seasonId, file);
      await this.load();
    } catch (err: any) {
      this.error = err.message;
    }
  }

  private async startDraft() {
    this.error = '';
    try {
      await api.startDraft(this.seasonId);
      window.location.href = `/season/${this.seasonId}/draft/snake`;
    } catch (err: any) {
      this.error = err.message;
    }
  }

  private async saveRename() {
    if (!this.renameLabel.trim()) return;
    this.renameLoading = true;
    this.error = '';
    try {
      await api.updateSeason(this.seasonId, { label: this.renameLabel.trim() });
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
      await api.deleteSeason(this.seasonId);
      window.location.href = `/league/${this.season.league_id}`;
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
      await api.updateSeason(this.seasonId, {
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

  private async confirmClearPlayers() {
    this.clearPlayersLoading = true;
    this.error = '';
    try {
      await api.clearPlayers(this.seasonId);
      this.showClearConfirm = false;
      await this.load();
    } catch (err: any) {
      this.error = err.message;
    } finally {
      this.clearPlayersLoading = false;
    }
  }

  render() {
    if (!this.season) return html`<p>Loading...</p>`;
    const s = this.season;
    const adminUser = isAdmin();

    return html`
      ${this.showDeleteConfirm ? this.renderDeleteConfirm() : ''}
      ${this.showClearConfirm ? this.renderClearConfirm() : ''}

      <div class="flex justify-between items-center">
        <h1>${s.label}</h1>
        <span class="badge ${s.status === 'drafting' ? 'badge-gold' : s.status === 'completed' ? 'badge-green' : 'badge-gray'}"
              style="font-size: 1rem; padding: 0.4rem 1rem;">
          ${s.status.toUpperCase()}
        </span>
      </div>

      <div class="tabs">
        <div class="tab ${this.activeTab === 'home' ? 'active' : ''}"
             @click=${() => this.activeTab = 'home'}>🏠 Home</div>
        <div class="tab ${this.activeTab === 'draft' ? 'active' : ''}"
             @click=${() => this.activeTab = 'draft'}>⚡ Draft Room</div>
        ${adminUser ? html`
          <div class="tab ${this.activeTab === 'settings' ? 'active' : ''}"
               @click=${() => this.activeTab = 'settings'}>⚙ Settings</div>
        ` : ''}
      </div>

      ${this.error ? html`<p class="text-red" style="margin-bottom:1rem;">${this.error}</p>` : ''}

      ${this.activeTab === 'home' ? this.renderHome() : ''}
      ${this.activeTab === 'draft' ? this.renderDraftRoom() : ''}
      ${this.activeTab === 'settings' && adminUser ? this.renderSettings() : ''}
    `;
  }

  private renderHome() {
    const s = this.season;
    return html`
      <p class="text-muted">${s.team_count} teams / ${s.draft_format} draft / ${s.draft_config?.rounds || 15} rounds</p>
      <div class="section">
        <h2>Teams (Draft Order)</h2>
        <div class="team-grid">
          ${(s.teams || []).map(
            (t: any) => html`
              <div class="card team-card">
                <div class="pos">#${t.draft_position}</div>
                <div>${t.name}</div>
              </div>
            `
          )}
        </div>
      </div>
    `;
  }

  private renderDraftRoom() {
    const s = this.season;
    return html`
      <div class="actions">
        ${s.status === 'setup' ? html`
          ${isAdmin() ? html`
            <button class="btn btn-primary" @click=${this.startDraft} ?disabled=${this.playerCount === 0}>
              Start Draft
            </button>
            ${this.playerCount === 0 ? html`<p class="text-muted" style="margin:0;align-self:center;">Import players first (Settings → Players)</p>` : ''}
          ` : ''}
          <button class="btn btn-secondary"
                  @click=${() => window.location.href = `/season/${this.seasonId}/draft/snake`}>
            Preview Draft Room
          </button>
        ` : ''}
        ${s.status === 'drafting' ? html`
          <button class="btn btn-primary" @click=${() => window.location.href = `/season/${this.seasonId}/draft/snake`}>
            Enter Draft Room
          </button>
        ` : ''}
        ${s.status === 'completed' ? html`
          <button class="btn btn-secondary" @click=${() => window.location.href = `/season/${this.seasonId}/draft/snake?view=tv`}>
            View Draft Board
          </button>
        ` : ''}
      </div>

      <div class="section">
        <div class="flex justify-between items-center">
          <h2>Player Pool</h2>
          <div class="player-count">${this.playerCount} players</div>
        </div>
        <button class="btn btn-secondary btn-sm" style="margin-top: 0.75rem;"
                @click=${() => window.location.href = `/season/${this.seasonId}/players`}>
          View Player Pool
        </button>
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
          <input type="text" .value=${this.renameLabel}
                 @input=${(e: any) => this.renameLabel = e.target.value} />
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

      <!-- Players -->
      <div class="settings-section">
        <h3>Players</h3>
        <p class="text-muted">Current player pool: <strong class="text-gold">${this.playerCount}</strong> players</p>
        <p style="font-size:0.85rem;color:#64748b;margin-bottom:1rem;">
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
}
