import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { sharedStyles } from '../styles/shared-styles.js';
import { getMe, isAdmin, type UserInfo } from '../services/auth.js';

@customElement('page-home')
export class PageHome extends LitElement {
  static styles = [
    sharedStyles,
    css`
      .hero {
        text-align: center;
        padding: 4rem 1rem 3rem;
      }
      .hero h1 { font-size: 2.5rem; margin-bottom: 0.75rem; }
      .hero p { font-size: 1.1rem; margin-bottom: 2rem; }
      .cta-row {
        display: flex;
        gap: 1rem;
        justify-content: center;
        flex-wrap: wrap;
      }
      .action-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 1rem;
        margin-top: 1.5rem;
      }
      .action-card {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
      .action-card p { color: #94a3b8; margin: 0; }
    `,
  ];

  @state() private user: UserInfo | null = null;
  @state() private authLoaded = false;

  async connectedCallback() {
    super.connectedCallback();
    this.user = await getMe();
    this.authLoaded = true;
  }

  render() {
    if (!this.authLoaded) return html``;

    if (!this.user) {
      return this.renderLoggedOut();
    }
    return this.renderLoggedIn();
  }

  private renderLoggedOut() {
    return html`
      <div class="hero">
        <h1>IPL Fantasy League</h1>
        <p class="text-muted">Yahoo-style fantasy cricket for IPL 2026. Draft your squad, track your points.</p>
        <div class="cta-row">
          <a href="/login" class="btn btn-primary" style="text-decoration:none;">Login</a>
          <a href="/login" class="btn btn-secondary" style="text-decoration:none;">Register</a>
        </div>
      </div>
    `;
  }

  private renderLoggedIn() {
    const admin = isAdmin();
    return html`
      <div style="max-width:700px;margin:2rem auto;padding:0 1rem;">
        <h1>Welcome back, ${this.user!.display_name}!</h1>
        <div class="action-grid">
          <div class="card action-card">
            <h2>My Leagues</h2>
            <p>View your active seasons, team standings, and draft history.</p>
            <a href="/my-leagues" class="btn btn-primary" style="text-decoration:none;">View My Leagues →</a>
          </div>

          ${!admin ? html`
            <div class="card action-card">
              <h2>Join a Season</h2>
              <p>Have an invite code? Enter it to join a league and claim your team name.</p>
              <a href="/join" class="btn btn-secondary" style="text-decoration:none;">Join with Code →</a>
            </div>
          ` : ''}

          ${admin ? html`
            <div class="card action-card">
              <h2>Create League &amp; Season</h2>
              <p>Set up a new league, configure the draft, and share the invite code.</p>
              <a href="/admin/create" class="btn btn-primary" style="text-decoration:none;">Create League →</a>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }
}
