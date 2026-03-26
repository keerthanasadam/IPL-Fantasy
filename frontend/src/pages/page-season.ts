import { LitElement, html } from 'lit';
import { customElement } from 'lit/decorators.js';
import { api } from '../services/api.js';

/**
 * Redirect shell: /season/:seasonId → /league/:leagueId
 * Keeps legacy URLs working by fetching the season's league_id and redirecting.
 */
@customElement('page-season')
export class PageSeason extends LitElement {
  async onBeforeEnter(location: any) {
    try {
      const season = await api.getSeason(location.params.seasonId);
      window.location.replace(`/league/${season.league_id}`);
    } catch {
      window.location.replace('/');
    }
  }

  render() {
    return html`<p style="padding:2rem;color:var(--text-muted,#94a3b8);">Redirecting…</p>`;
  }
}
