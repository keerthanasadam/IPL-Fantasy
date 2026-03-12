import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { sharedStyles } from '../styles/shared-styles.js';
import { api } from '../services/api.js';
import { guardRoute } from '../services/auth.js';

@customElement('page-my-leagues')
export class PageMyLeagues extends LitElement {
  static styles = [sharedStyles];

  @state() private leagues: any[] = [];
  @state() private loading = true;
  @state() private error = '';

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

  render() {
    return html`
      <div style="max-width: 700px; margin: 2rem auto; padding: 0 1rem;">
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
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;">
              <h2 style="margin:0;">${league.name}</h2>
              <span class="badge ${league.user_role === 'commissioner' ? 'badge-gold' : 'badge-blue'}">
                ${league.user_role === 'commissioner' ? 'Commissioner' : 'Member'}
              </span>
            </div>

            ${league.seasons.length === 0
              ? html`<p class="text-muted">No seasons yet.</p>`
              : league.seasons.map((season: any) => html`
                  <div style="
                    background:#0f172a;
                    border-radius:8px;
                    padding:1rem;
                    margin-bottom:0.75rem;
                    display:flex;
                    align-items:flex-start;
                    justify-content:space-between;
                    gap:1rem;
                  ">
                    <div>
                      <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.5rem;">
                        <span style="font-weight:600;">📅 ${season.label}</span>
                        <span class="badge ${this.statusBadge(season.status)}">${season.status.toUpperCase()}</span>
                      </div>
                      ${season.my_team
                        ? html`
                            <div class="text-muted" style="font-size:0.85rem;">
                              👤 My Team: <strong style="color:#e2e8f0">${season.my_team.name}</strong>
                              &nbsp;·&nbsp; Position: #${season.my_team.draft_position}
                            </div>
                          `
                        : html`<div class="text-muted" style="font-size:0.85rem;">No team joined yet</div>`
                      }
                      <div class="text-muted" style="font-size:0.85rem;margin-top:0.25rem;">
                        👥 ${season.my_team ? '1' : '0'}/${season.team_count} teams
                      </div>
                    </div>
                    <a
                      href="/league/${league.id}"
                      class="btn btn-secondary btn-sm"
                      style="text-decoration:none;white-space:nowrap;"
                    >
                      Go to Season →
                    </a>
                  </div>
                `)
            }
          </div>
        `)}
      </div>
    `;
  }
}
