import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { api } from '../services/api.js';
import { sharedStyles } from '../styles/shared-styles.js';

@customElement('page-players')
export class PagePlayers extends LitElement {
  static styles = [
    sharedStyles,
    css`
      .filters { display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap; }
      .filters input, .filters select { max-width: 250px; }
      table { width: 100%; border-collapse: collapse; }
      th { text-align: left; padding: 0.6rem; color: #94a3b8; border-bottom: 2px solid #334155; font-size: 0.85rem; }
      td { padding: 0.6rem; border-bottom: 1px solid #1e293b; font-size: 0.9rem; }
      tr:hover td { background: #1e293b; }
    `,
  ];

  @state() private seasonId = '';
  @state() private players: any[] = [];
  @state() private total = 0;
  @state() private search = '';
  @state() private team = '';
  @state() private designation = '';

  onBeforeEnter(location: any) {
    this.seasonId = location.params.seasonId;
  }

  async connectedCallback() {
    super.connectedCallback();
    await this.load();
  }

  async load() {
    const params: any = {};
    if (this.search) params.search = this.search;
    if (this.team) params.team = this.team;
    if (this.designation) params.designation = this.designation;
    const result = await api.getPlayers(this.seasonId, params);
    this.players = result.players;
    this.total = result.total;
  }

  private get uniqueTeams(): string[] {
    return [...new Set(this.players.map((p) => p.ipl_team))].sort();
  }

  render() {
    return html`
      <h1>Player Pool (${this.total})</h1>

      <div class="filters">
        <input placeholder="Search by name..." .value=${this.search}
               @input=${(e: any) => { this.search = e.target.value; this.load(); }} />
        <select @change=${(e: any) => { this.team = e.target.value; this.load(); }}>
          <option value="">All Teams</option>
          ${this.uniqueTeams.map((t) => html`<option value=${t}>${t}</option>`)}
        </select>
        <select @change=${(e: any) => { this.designation = e.target.value; this.load(); }}>
          <option value="">All Roles</option>
          <option>Batsman</option>
          <option>Bowler</option>
          <option>All-Rounder</option>
          <option>WK-Batsman</option>
        </select>
      </div>

      <table>
        <thead>
          <tr><th>Name</th><th>IPL Team</th><th>Designation</th></tr>
        </thead>
        <tbody>
          ${this.players.map(
            (p) => html`<tr><td>${p.name}</td><td>${p.ipl_team}</td><td>${p.designation}</td></tr>`
          )}
        </tbody>
      </table>
    `;
  }
}
