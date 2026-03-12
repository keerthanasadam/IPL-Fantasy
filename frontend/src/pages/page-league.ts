import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { api } from '../services/api.js';
import { sharedStyles } from '../styles/shared-styles.js';

@customElement('page-league')
export class PageLeague extends LitElement {
  static styles = [
    sharedStyles,
    css`
      .season-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; margin-top: 1rem; }
      .season-card { cursor: pointer; transition: border-color 0.15s; }
      .season-card:hover { border-color: #f5a623; }
      .create-section { margin: 1.5rem 0; }
      .create-section .form-row { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: flex-end; }
      .create-section .form-row > div { flex: 1; min-width: 150px; }
    `,
  ];

  @state() private leagueId = '';
  @state() private league: any = null;
  @state() private label = 'IPL 2026';
  @state() private draftFormat = 'snake';
  @state() private teamCount = 8;
  @state() private rounds = 15;

  onBeforeEnter(location: any) {
    this.leagueId = location.params.leagueId;
  }

  async connectedCallback() {
    super.connectedCallback();
    if (this.leagueId) {
      this.league = await api.getLeague(this.leagueId);
    }
  }

  async createSeason(e: Event) {
    e.preventDefault();
    await api.createSeason(this.leagueId, {
      label: this.label,
      draft_format: this.draftFormat,
      team_count: this.teamCount,
      draft_config: { rounds: this.rounds, timer_seconds: 0 },
    });
    this.league = await api.getLeague(this.leagueId);
  }

  render() {
    if (!this.league) return html`<p>Loading...</p>`;

    return html`
      <h1>${this.league.name}</h1>

      <div class="card create-section">
        <h2>Create New Season</h2>
        <form @submit=${this.createSeason}>
          <div class="form-row">
            <div class="form-group">
              <label>Season Label</label>
              <input .value=${this.label} @input=${(e: any) => (this.label = e.target.value)} />
            </div>
            <div class="form-group">
              <label>Draft Format</label>
              <select .value=${this.draftFormat} @change=${(e: any) => (this.draftFormat = e.target.value)}>
                <option value="snake">Snake Draft</option>
                <option value="auction">Auction Draft</option>
              </select>
            </div>
            <div class="form-group">
              <label>Teams</label>
              <input type="number" min="2" max="20" .value=${String(this.teamCount)}
                     @input=${(e: any) => (this.teamCount = +e.target.value)} />
            </div>
            <div class="form-group">
              <label>Rounds</label>
              <input type="number" min="1" max="30" .value=${String(this.rounds)}
                     @input=${(e: any) => (this.rounds = +e.target.value)} />
            </div>
            <div class="form-group" style="align-self: flex-end;">
              <button class="btn btn-primary" type="submit">Create Season</button>
            </div>
          </div>
        </form>
      </div>

      <h2>Seasons</h2>
      ${(this.league.seasons || []).length === 0
        ? html`<p class="text-muted">No seasons yet.</p>`
        : html`
            <div class="season-grid">
              ${this.league.seasons.map(
                (s: any) => html`
                  <div class="card season-card" @click=${() => (window.location.href = `/season/${s.id}`)}>
                    <div class="flex justify-between items-center">
                      <h3>${s.label}</h3>
                      <span class="badge ${s.status === 'drafting' ? 'badge-gold' : s.status === 'completed' ? 'badge-green' : 'badge-gray'}">
                        ${s.status}
                      </span>
                    </div>
                    <p class="text-muted">${s.team_count} teams / ${s.draft_format} draft</p>
                  </div>
                `
              )}
            </div>
          `}
    `;
  }
}
