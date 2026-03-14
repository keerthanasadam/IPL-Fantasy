import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { sharedStyles } from '../styles/shared-styles.js';
import { api } from '../services/api.js';
import { getMe, isAdmin } from '../services/auth.js';

const ROLE_KEYS = ['WK', 'BAT', 'BOWL', 'AR'] as const;
type RoleKey = typeof ROLE_KEYS[number];

@customElement('page-admin-create')
export class PageAdminCreate extends LitElement {
  static styles = [
    sharedStyles,
    css`
      .role-limits-table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; }
      .role-limits-table th { text-align: left; font-size: 0.8rem; color: #94a3b8; padding: 0.25rem 0.5rem; }
      .role-limits-table td { padding: 0.25rem 0.5rem; }
      .role-limits-table td:first-child { color: #f5a623; font-weight: 600; width: 3rem; }
      .role-limits-table input[type="number"] { width: 60px; }
    `,
  ];

  @state() private step: 1 | 2 | 3 = 1;
  @state() private createdLeagueId = '';
  @state() private createdLeagueName = '';
  @state() private createdLeagueSeasonId = '';
  @state() private inviteCode = '';
  @state() private error = '';
  @state() private loading = false;

  // Step 1 form fields
  @state() private leagueName = '';

  // Step 2 form fields
  @state() private seasonLabel = 'IPL 2026';
  @state() private draftFormat = 'snake';
  @state() private maxTeams = 8;
  @state() private draftRounds = 15;
  @state() private pickTimer = 60;
  @state() private scheduledTime = '';
  @state() private onTimeout: 'auto_pick' | 'skip_turn' = 'auto_pick';
  @state() private roleLimits: Record<RoleKey, { min: number; max: number }> = {
    WK:   { min: 1, max: 2 },
    BAT:  { min: 3, max: 6 },
    BOWL: { min: 3, max: 6 },
    AR:   { min: 1, max: 4 },
  };

  async connectedCallback() {
    super.connectedCallback();
    await getMe();
    if (!isAdmin()) {
      window.location.href = '/';
    }
  }

  private async submitCreateLeague(e: Event) {
    e.preventDefault();
    if (!this.leagueName.trim()) return;
    this.loading = true;
    this.error = '';
    try {
      const league = await api.createLeague(this.leagueName.trim());
      this.createdLeagueId = league.id;
      this.createdLeagueName = league.name;
      this.step = 2;
    } catch (err: any) {
      this.error = err.message;
    } finally {
      this.loading = false;
    }
  }

  private async submitCreateSeason(e: Event) {
    e.preventDefault();
    this.loading = true;
    this.error = '';
    try {
      const season = await api.createSeason(this.createdLeagueId, {
        label: this.seasonLabel,
        draft_format: this.draftFormat,
        team_count: this.maxTeams,
        draft_config: {
          rounds: this.draftRounds,
          pick_timer_seconds: this.pickTimer,
          scheduled_draft_time: this.scheduledTime || undefined,
          on_timeout: this.onTimeout,
          role_limits: this.roleLimits,
        },
      });
      this.inviteCode = season.invite_code;
      this.createdLeagueSeasonId = season.id;
      this.step = 3;
    } catch (err: any) {
      this.error = err.message;
    } finally {
      this.loading = false;
    }
  }

  private async copyCode() {
    try {
      await navigator.clipboard.writeText(this.inviteCode);
    } catch {
      prompt('Copy this invite code:', this.inviteCode);
    }
  }

  private updateRoleLimit(role: RoleKey, field: 'min' | 'max', value: number) {
    this.roleLimits = { ...this.roleLimits, [role]: { ...this.roleLimits[role], [field]: value } };
  }

  render() {
    return html`
      <div style="max-width: 520px; margin: 2rem auto; padding: 0 1rem;">
        <h1>Create League &amp; Season</h1>

        ${this.step === 1 ? this.renderStep1() : ''}
        ${this.step === 2 ? this.renderStep2() : ''}
        ${this.step === 3 ? this.renderStep3() : ''}

        ${this.error ? html`<p class="text-red" style="margin-top:1rem;">${this.error}</p>` : ''}
      </div>
    `;
  }

  private renderStep1() {
    return html`
      <div class="card">
        <h2>Step 1 — Create League</h2>
        <form @submit=${this.submitCreateLeague}>
          <div class="form-group">
            <label>League Name *</label>
            <input
              type="text"
              .value=${this.leagueName}
              @input=${(e: any) => this.leagueName = e.target.value}
              placeholder="e.g. Office IPL Fantasy"
              required
            />
          </div>
          <button class="btn btn-primary" type="submit" ?disabled=${this.loading}>
            ${this.loading ? 'Creating...' : 'Create League →'}
          </button>
        </form>
      </div>
    `;
  }

  private renderStep2() {
    return html`
      <div class="card">
        <p class="text-muted" style="margin-bottom:1rem;">
          League: <strong class="text-gold">${this.createdLeagueName}</strong>
        </p>
        <h2>Step 2 — Create Season</h2>
        <form @submit=${this.submitCreateSeason}>
          <div class="form-group">
            <label>Season Label *</label>
            <input
              type="text"
              .value=${this.seasonLabel}
              @input=${(e: any) => this.seasonLabel = e.target.value}
              required
            />
          </div>
          <div class="form-group">
            <label>Draft Format</label>
            <select .value=${this.draftFormat} @change=${(e: any) => this.draftFormat = e.target.value}>
              <option value="snake">Snake Draft</option>
              <option value="auction">Auction Draft</option>
            </select>
          </div>
          <div class="form-group">
            <label>Max Teams</label>
            <input
              type="number"
              min="2"
              max="20"
              .value=${String(this.maxTeams)}
              @input=${(e: any) => this.maxTeams = Number(e.target.value)}
            />
          </div>
          <div class="form-group">
            <label>Draft Rounds</label>
            <input
              type="number"
              min="1"
              .value=${String(this.draftRounds)}
              @input=${(e: any) => this.draftRounds = Number(e.target.value)}
            />
          </div>
          <div class="form-group">
            <label>Pick Timer (seconds, 0 = no timer)</label>
            <input
              type="number"
              min="0"
              .value=${String(this.pickTimer)}
              @input=${(e: any) => this.pickTimer = Number(e.target.value)}
            />
          </div>
          <div class="form-group">
            <label>Scheduled Draft Time <span class="text-muted" style="font-weight:400;">(informational)</span></label>
            <input
              type="datetime-local"
              .value=${this.scheduledTime}
              @input=${(e: any) => this.scheduledTime = e.target.value}
            />
          </div>
          <div class="form-group">
            <label>On Pick Timeout</label>
            <select .value=${this.onTimeout} @change=${(e: any) => this.onTimeout = e.target.value}>
              <option value="auto_pick">Auto-pick (best available)</option>
              <option value="skip_turn">Skip turn</option>
            </select>
          </div>
          <div class="form-group">
            <label>Role Limits</label>
            <table class="role-limits-table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Min picks</th>
                  <th>Max picks</th>
                </tr>
              </thead>
              <tbody>
                ${ROLE_KEYS.map(role => html`
                  <tr>
                    <td>${role}</td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        .value=${String(this.roleLimits[role].min)}
                        @input=${(e: any) => this.updateRoleLimit(role, 'min', Number(e.target.value))}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        .value=${String(this.roleLimits[role].max)}
                        @input=${(e: any) => this.updateRoleLimit(role, 'max', Number(e.target.value))}
                      />
                    </td>
                  </tr>
                `)}
              </tbody>
            </table>
          </div>
          <button class="btn btn-primary" type="submit" ?disabled=${this.loading} style="margin-top:1rem;">
            ${this.loading ? 'Creating...' : 'Create Season →'}
          </button>
        </form>
      </div>
    `;
  }

  private renderStep3() {
    return html`
      <div class="card" style="text-align:center;">
        <div style="font-size:2.5rem;margin-bottom:0.5rem;">✅</div>
        <h2>Season Created!</h2>
        <p class="text-muted">Share this invite code with participants</p>
        <div style="
          background: #0f172a;
          border: 2px solid #f5a623;
          border-radius: 10px;
          padding: 1rem 2rem;
          margin: 1.5rem 0;
          font-size: 1.6rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          color: #f5a623;
        ">
          ${this.inviteCode}
        </div>
        <div style="display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;">
          <button class="btn btn-secondary" @click=${this.copyCode}>Copy Code</button>
          <a
            href="/league/${this.createdLeagueId}"
            class="btn btn-primary"
            style="text-decoration:none;"
          >
            Go to Season →
          </a>
        </div>
        <p class="text-muted" style="font-size:0.8rem;margin-top:1rem;">
          Don't refresh this page — the code is also visible in the season admin panel.
        </p>
      </div>
    `;
  }
}
