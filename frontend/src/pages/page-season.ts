import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { api } from '../services/api.js';
import { sharedStyles } from '../styles/shared-styles.js';
import '../components/csv-uploader.js';

@customElement('page-season')
export class PageSeason extends LitElement {
  static styles = [
    sharedStyles,
    css`
      .team-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.75rem; }
      .team-card { padding: 1rem; }
      .team-card .pos { font-size: 1.5rem; font-weight: 700; color: #f5a623; }
      .actions { display: flex; gap: 0.75rem; margin: 1.5rem 0; flex-wrap: wrap; }
      .section { margin-top: 2rem; }
      .player-count { font-size: 2rem; font-weight: 700; color: #f5a623; }
    `,
  ];

  @state() private seasonId = '';
  @state() private season: any = null;
  @state() private playerCount = 0;

  onBeforeEnter(location: any) {
    this.seasonId = location.params.seasonId;
  }

  async connectedCallback() {
    super.connectedCallback();
    await this.load();
  }

  async load() {
    if (!this.seasonId) return;
    this.season = await api.getSeason(this.seasonId);
    const players = await api.getPlayers(this.seasonId);
    this.playerCount = players.total;
  }

  async handleImport(e: CustomEvent) {
    const file = e.detail.file;
    await api.importPlayers(this.seasonId, file);
    await this.load();
  }

  async randomizeOrder() {
    await api.updateDraftOrder(this.seasonId, { randomize: true });
    await this.load();
  }

  async startDraft() {
    await api.startDraft(this.seasonId);
    window.location.href = `/season/${this.seasonId}/draft/snake`;
  }

  render() {
    if (!this.season) return html`<p>Loading...</p>`;
    const s = this.season;

    return html`
      <div class="flex justify-between items-center">
        <h1>${s.label}</h1>
        <span class="badge ${s.status === 'drafting' ? 'badge-gold' : s.status === 'completed' ? 'badge-green' : 'badge-gray'}"
              style="font-size: 1rem; padding: 0.4rem 1rem;">
          ${s.status.toUpperCase()}
        </span>
      </div>

      <p class="text-muted">${s.team_count} teams / ${s.draft_format} draft / ${s.draft_config?.rounds || 15} rounds</p>

      <div class="actions">
        ${s.status === 'setup' ? html`
          <button class="btn btn-secondary" @click=${this.randomizeOrder}>Randomize Draft Order</button>
          <button class="btn btn-primary" @click=${this.startDraft} ?disabled=${this.playerCount === 0}>
            Start Draft
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

      <!-- Player Pool -->
      <div class="section">
        <div class="flex justify-between items-center">
          <h2>Player Pool</h2>
          <div class="player-count">${this.playerCount} players</div>
        </div>
        ${s.status === 'setup' ? html`
          <csv-uploader @file-selected=${this.handleImport}></csv-uploader>
        ` : ''}
        <button class="btn btn-secondary btn-sm" style="margin-top: 0.75rem;"
                @click=${() => window.location.href = `/season/${this.seasonId}/players`}>
          View Player Pool
        </button>
      </div>

      <!-- Teams -->
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
}
