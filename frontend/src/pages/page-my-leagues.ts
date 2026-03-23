import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { sharedStyles } from '../styles/shared-styles.js';
import { api } from '../services/api.js';
import { guardRoute } from '../services/auth.js';

interface EditState {
  teamId: string;
  value: string;
  saving: boolean;
  error: string;
}

@customElement('page-my-leagues')
export class PageMyLeagues extends LitElement {
  static styles = [
    sharedStyles,
    css`
      .page-wrap {
        max-width: 700px;
        margin: 2rem auto;
        padding: 0 1rem;
      }

      /* Season inner card */
      .season-row {
        background: var(--bg-primary);
        border-radius: 8px;
        padding: 1rem;
        margin-bottom: 0.75rem;
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 1rem;
      }
      .season-meta {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 0.5rem;
        flex-wrap: wrap;
      }
      .season-label { font-weight: 600; }
      .season-detail { font-size: 0.85rem; margin-top: 0.25rem; }
      .scheduled-date {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        font-size: 0.8rem;
        color: var(--text-muted);
        background: var(--bg-secondary);
        border-radius: 6px;
        padding: 0.2rem 0.5rem;
        margin-top: 0.4rem;
      }
      .season-btn { flex-shrink: 0; }
      .season-row.completed { opacity: 0.8; }

      /* Inline team rename */
      .team-name-row {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        flex-wrap: wrap;
      }
      .edit-btn {
        background: none;
        border: none;
        cursor: pointer;
        color: var(--text-muted);
        font-size: 0.85rem;
        padding: 0 0.2rem;
        line-height: 1;
        opacity: 0.7;
        transition: opacity 0.15s;
      }
      .edit-btn:hover { opacity: 1; color: var(--accent); }

      .rename-form {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        flex-wrap: wrap;
        margin-top: 0.1rem;
      }
      .rename-input {
        padding: 0.3rem 0.5rem;
        font-size: 0.85rem;
        border-radius: 6px;
        border: 1px solid var(--accent);
        background: var(--bg-input);
        color: var(--text-primary);
        width: 160px;
        outline: none;
      }
      .rename-save {
        background: var(--accent);
        color: var(--accent-dark);
        border: none;
        border-radius: 6px;
        padding: 0.3rem 0.65rem;
        font-size: 0.8rem;
        font-weight: 600;
        cursor: pointer;
      }
      .rename-save:disabled { opacity: 0.6; cursor: default; }
      .rename-cancel {
        background: var(--bg-secondary);
        color: var(--text-primary);
        border: none;
        border-radius: 6px;
        padding: 0.3rem 0.65rem;
        font-size: 0.8rem;
        cursor: pointer;
      }
      .rename-error { font-size: 0.78rem; color: #ef4444; margin-top: 0.25rem; }
      .rename-success { font-size: 0.78rem; color: #22c55e; }

      @media (max-width: 480px) {
        .season-row { flex-direction: column; }
        .season-btn a { display: block; text-align: center; }
      }
    `,
  ];

  @state() private leagues: any[] = [];
  @state() private loading = true;
  @state() private error = '';
  @state() private editing: EditState | null = null;
  @state() private savedTeamId: string | null = null;

  connectedCallback() {
    super.connectedCallback();
    if (!guardRoute('/my-leagues')) return;
    this.loadLeagues();
  }

  private async loadLeagues() {
    try {
      this.leagues = await api.getMyLeagues();
    } catch (err: any) {
      this.error = err.message;
    } finally {
      this.loading = false;
    }
  }

  private statusBadge(status: string) {
    const classes: Record<string, string> = {
      setup: 'badge-blue',
      drafting: 'badge-gold',
      active: 'badge-green',
      completed: 'badge-gray',
      archived: 'badge-gray',
    };
    return classes[status] ?? 'badge-gray';
  }

  private formatDraftDate(isoString: string): string {
    try {
      const d = new Date(isoString);
      return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return isoString;
    }
  }

  private startEdit(teamId: string, currentName: string) {
    this.editing = { teamId, value: currentName, saving: false, error: '' };
    // Focus the input after render
    this.updateComplete.then(() => {
      const input = this.shadowRoot?.querySelector<HTMLInputElement>('.rename-input');
      input?.focus();
      input?.select();
    });
  }

  private cancelEdit() {
    this.editing = null;
  }

  private async saveEdit() {
    if (!this.editing) return;
    const name = this.editing.value.trim();
    if (!name) {
      this.editing = { ...this.editing, error: 'Name cannot be empty.' };
      return;
    }
    this.editing = { ...this.editing, saving: true, error: '' };
    try {
      await api.updateTeam(this.editing.teamId, { name });
      const savedId = this.editing.teamId;
      // Patch the name in the local data tree
      this.leagues = this.leagues.map(league => ({
        ...league,
        seasons: league.seasons.map((s: any) => ({
          ...s,
          my_team: s.my_team?.id === savedId
            ? { ...s.my_team, name }
            : s.my_team,
        })),
      }));
      this.editing = null;
      this.savedTeamId = savedId;
      setTimeout(() => { this.savedTeamId = null; }, 2500);
    } catch (err: any) {
      if (this.editing) {
        this.editing = { teamId: this.editing.teamId, value: this.editing.value, saving: false, error: err.message || 'Failed to save.' };
      }
    }
  }

  private handleRenameKey(e: KeyboardEvent) {
    if (e.key === 'Enter') this.saveEdit();
    if (e.key === 'Escape') this.cancelEdit();
  }

  render() {
    return html`
      <div class="page-wrap">
        <h1>My Leagues</h1>

        ${this.loading ? html`<p class="text-muted">Loading...</p>` : ''}
        ${this.error ? html`<p class="text-red">${this.error}</p>` : ''}

        ${!this.loading && this.leagues.length === 0
          ? html`
              <div class="card" style="text-align:center;padding:3rem;">
                <p class="text-muted" style="margin-bottom:1.5rem;">
                  You haven't joined any seasons yet.
                </p>
                <a href="/join" class="btn btn-primary" style="text-decoration:none;">
                  Join a Season →
                </a>
              </div>
            `
          : ''
        }

        ${this.leagues.map(league => html`
          <div class="card" style="margin-bottom:1rem;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;flex-wrap:wrap;gap:0.5rem;">
              <h2 style="margin:0;">${league.name}</h2>
              <span class="badge ${league.user_role === 'commissioner' ? 'badge-gold' : 'badge-blue'}">
                ${league.user_role === 'commissioner' ? 'Commissioner' : 'Member'}
              </span>
            </div>

            ${league.seasons.length === 0
              ? html`<p class="text-muted">No seasons yet.</p>`
              : league.seasons.map((season: any) => {
                  const isCompleted = season.status === 'completed' || season.status === 'archived';
                  const scheduledTime: string | undefined = season.draft_config?.scheduled_draft_time;
                  const myTeam = season.my_team;
                  const isEditingThis = this.editing?.teamId === myTeam?.id;

                  return html`
                    <div class="season-row ${isCompleted ? 'completed' : ''}">
                      <div style="flex:1;min-width:0;">
                        <div class="season-meta">
                          <span class="season-label">📅 ${season.label}</span>
                          <span class="badge ${this.statusBadge(season.status)}">
                            ${isCompleted ? '✓ COMPLETED' : season.status.toUpperCase()}
                          </span>
                        </div>

                        ${myTeam
                          ? html`
                              <div class="text-muted season-detail">
                                👤 My Team:
                                ${isEditingThis
                                  ? html`
                                      <span>
                                        <span class="rename-form">
                                          <input
                                            class="rename-input"
                                            type="text"
                                            .value=${this.editing!.value}
                                            @input=${(e: any) => { this.editing = { ...this.editing!, value: e.target.value }; }}
                                            @keydown=${this.handleRenameKey}
                                            ?disabled=${this.editing!.saving}
                                          />
                                          <button class="rename-save" ?disabled=${this.editing!.saving}
                                                  @click=${this.saveEdit}>
                                            ${this.editing!.saving ? '…' : 'Save'}
                                          </button>
                                          <button class="rename-cancel" ?disabled=${this.editing!.saving}
                                                  @click=${this.cancelEdit}>
                                            Cancel
                                          </button>
                                        </span>
                                        ${this.editing!.error
                                          ? html`<span class="rename-error">${this.editing!.error}</span>`
                                          : ''}
                                      </span>
                                    `
                                  : html`
                                      <span class="team-name-row">
                                        <strong style="color:var(--text-primary)">${myTeam.name}</strong>
                                        <button
                                          class="edit-btn"
                                          title="Rename team"
                                          @click=${() => this.startEdit(myTeam.id, myTeam.name)}
                                        >✏️</button>
                                        ${this.savedTeamId === myTeam.id
                                          ? html`<span class="rename-success">Saved!</span>`
                                          : ''}
                                      </span>
                                      &nbsp;·&nbsp; Position: #${myTeam.draft_position}
                                    `
                                }
                              </div>
                            `
                          : html`<div class="text-muted season-detail">No team joined yet</div>`
                        }

                        <div class="text-muted season-detail">
                          👥 ${myTeam ? '1' : '0'}/${season.team_count} teams
                        </div>

                        ${scheduledTime ? html`
                          <div class="scheduled-date">
                            🕐 Draft: ${this.formatDraftDate(scheduledTime)}
                          </div>
                        ` : ''}
                      </div>

                      <div class="season-btn">
                        <a
                          href="/league/${league.id}"
                          class="btn btn-secondary btn-sm"
                          style="text-decoration:none;white-space:nowrap;"
                        >
                          Go to Season →
                        </a>
                      </div>
                    </div>
                  `;
                })
            }
          </div>
        `)}
      </div>
    `;
  }
}
