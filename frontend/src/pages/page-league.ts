import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { api } from '../services/api.js';
import { getMe, isAdmin } from '../services/auth.js';
import { sharedStyles } from '../styles/shared-styles.js';

@customElement('page-league')
export class PageLeague extends LitElement {
  static styles = [
    sharedStyles,
    css`
      .tabs {
        display: flex;
        gap: 0;
        margin-bottom: 1.5rem;
        border-bottom: 2px solid #334155;
      }
      .tab {
        padding: 0.6rem 1.2rem;
        cursor: pointer;
        font-weight: 600;
        color: #94a3b8;
        border-bottom: 2px solid transparent;
        margin-bottom: -2px;
      }
      .tab.active { color: #f5a623; border-bottom-color: #f5a623; }
      table { width: 100%; border-collapse: collapse; }
      th { text-align: left; padding: 0.6rem; color: #64748b; font-size: 0.8rem; text-transform: uppercase; }
      td { padding: 0.6rem; border-top: 1px solid #1e293b; }
      .draft-info { display: flex; flex-direction: column; gap: 1rem; }
    `,
  ];

  @state() private leagueId = '';
  @state() private league: any = null;
  @state() private season: any = null;
  @state() private activeTab: 'home' | 'draft' = 'home';
  @state() private adminUser = false;

  onBeforeEnter(location: any) {
    this.leagueId = location.params.leagueId;
  }

  async connectedCallback() {
    super.connectedCallback();
    await getMe();
    this.adminUser = isAdmin();
    if (this.leagueId) {
      this.league = await api.getLeague(this.leagueId);
      // Pick most recent season
      if (this.league.seasons?.length) {
        const sorted = [...this.league.seasons].sort(
          (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        // Load full season detail for teams
        this.season = await api.getSeason(sorted[0].id);
      }
    }
  }

  render() {
    if (!this.league) return html`<p class="text-muted">Loading...</p>`;

    return html`
      <div style="max-width:800px;margin:2rem auto;padding:0 1rem;">
        <h1>${this.league.name}</h1>

        ${!this.season
          ? html`<p class="text-muted">No seasons yet.</p>`
          : html`
              <div class="tabs">
                <div class="tab ${this.activeTab === 'home' ? 'active' : ''}"
                     @click=${() => this.activeTab = 'home'}>
                  🏠 Home
                </div>
                <div class="tab ${this.activeTab === 'draft' ? 'active' : ''}"
                     @click=${() => this.activeTab = 'draft'}>
                  ⚡ Draft Room
                </div>
              </div>

              ${this.activeTab === 'home' ? this.renderLeaderboard() : this.renderDraftRoom()}
            `
        }
      </div>
    `;
  }

  private renderLeaderboard() {
    const teams = this.season?.teams ?? [];
    const sorted = [...teams].sort((a: any, b: any) => b.points - a.points);

    return html`
      <div class="card">
        <h2>${this.season.label} — Standings</h2>
        ${sorted.length === 0
          ? html`<p class="text-muted">No teams have joined yet.</p>`
          : html`
              <table>
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Team</th>
                    <th>Manager</th>
                    <th>Pts</th>
                  </tr>
                </thead>
                <tbody>
                  ${sorted.map((t: any, i: number) => html`
                    <tr>
                      <td>${i + 1}</td>
                      <td>${t.name}</td>
                      <td class="text-muted">${t.owner_id ? '—' : 'Unowned'}</td>
                      <td class="text-gold">${Number(t.points).toFixed(1)}</td>
                    </tr>
                  `)}
                </tbody>
              </table>
            `
        }
      </div>
    `;
  }

  private renderDraftRoom() {
    const season = this.season;
    const statusMap: Record<string, string> = {
      setup: 'badge-blue',
      drafting: 'badge-gold',
      active: 'badge-green',
      completed: 'badge-gray',
    };

    return html`
      <div class="card draft-info">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <h2 style="margin:0;">${season.label}</h2>
          <span class="badge ${statusMap[season.status] ?? 'badge-gray'}">${season.status.toUpperCase()}</span>
        </div>
        <div class="text-muted">
          ${season.team_count} teams · ${season.draft_format} draft
          · ${season.draft_config?.rounds ?? '—'} rounds
        </div>

        ${season.invite_code ? html`
          <div style="background:#0f172a;border-radius:8px;padding:0.75rem 1rem;">
            <span class="text-muted" style="font-size:0.85rem;">Invite Code: </span>
            <strong class="text-gold" style="font-size:1.1rem;letter-spacing:0.05em;">${season.invite_code}</strong>
          </div>
        ` : ''}

        <div style="display:flex;gap:1rem;flex-wrap:wrap;">
          ${season.status === 'drafting' || season.status === 'active'
            ? html`
                <a
                  href="/season/${season.id}/draft/snake"
                  class="btn btn-primary"
                  style="text-decoration:none;"
                >
                  Enter Draft Room →
                </a>
              `
            : ''
          }
          ${this.adminUser && season.status === 'setup'
            ? html`
                <a
                  href="/season/${season.id}"
                  class="btn btn-secondary"
                  style="text-decoration:none;"
                >
                  Admin Setup →
                </a>
              `
            : ''
          }
        </div>
      </div>
    `;
  }
}
