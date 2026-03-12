import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { Router } from '@vaadin/router';

import './components/nav-bar.js';
import './pages/page-home.js';
import './pages/page-login.js';
import './pages/page-league.js';
import './pages/page-season.js';
import './pages/page-players.js';
import './pages/page-snake-draft.js';
import './pages/page-join.js';
import './pages/page-my-leagues.js';
import './pages/page-admin-create.js';

@customElement('app-shell')
export class AppShell extends LitElement {
  static styles = css`
    :host {
      display: block;
      min-height: 100vh;
    }
    main {
      max-width: 1400px;
      margin: 0 auto;
      padding: 1rem;
    }
  `;

  firstUpdated() {
    const outlet = this.shadowRoot?.getElementById('outlet');
    if (outlet) {
      const router = new Router(outlet);
      router.setRoutes([
        { path: '/', component: 'page-home' },
        { path: '/login', component: 'page-login' },
        { path: '/league/:leagueId', component: 'page-league' },
        { path: '/season/:seasonId', component: 'page-season' },
        { path: '/season/:seasonId/players', component: 'page-players' },
        { path: '/season/:seasonId/draft/snake', component: 'page-snake-draft' },
        { path: '/join', component: 'page-join' },
        { path: '/my-leagues', component: 'page-my-leagues' },
        { path: '/admin/create', component: 'page-admin-create' },
        { path: '(.*)', redirect: '/' },
      ]);
    }
  }

  render() {
    return html`
      <nav-bar></nav-bar>
      <main>
        <div id="outlet"></div>
      </main>
    `;
  }
}
