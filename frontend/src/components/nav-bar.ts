import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { getMe, isAdmin, logout, type UserInfo } from '../services/auth.js';

@customElement('nav-bar')
export class NavBar extends LitElement {
  @state() private user: UserInfo | null = null;
  @state() private menuOpen = false;
  @state() private authReady = false;

  static styles = css`
    :host {
      display: block;
    }
    nav {
      background: #1e293b;
      border-bottom: 2px solid #f5a623;
      padding: 0.75rem 1.5rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .brand {
      font-size: 1.25rem;
      font-weight: 700;
      color: #f5a623;
      text-decoration: none;
    }
    .links {
      display: flex;
      gap: 1.5rem;
      align-items: center;
    }
    .links a {
      color: #94a3b8;
      text-decoration: none;
      font-size: 0.9rem;
    }
    .links a:hover { color: #e2e8f0; }
    .user-menu {
      position: relative;
    }
    .user-btn {
      background: #334155;
      border: none;
      color: #e2e8f0;
      padding: 0.4rem 0.8rem;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.9rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .user-btn:hover { background: #475569; }
    .dropdown {
      position: absolute;
      right: 0;
      top: calc(100% + 0.5rem);
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      min-width: 140px;
      z-index: 100;
      overflow: hidden;
    }
    .dropdown button {
      display: block;
      width: 100%;
      padding: 0.6rem 1rem;
      background: none;
      border: none;
      color: #e2e8f0;
      text-align: left;
      cursor: pointer;
      font-size: 0.9rem;
    }
    .dropdown button:hover { background: #334155; }
  `;

  async connectedCallback() {
    super.connectedCallback();
    this.user = await getMe();
    this.authReady = true;
  }

  private toggleMenu() {
    this.menuOpen = !this.menuOpen;
  }

  private handleLogout() {
    logout();
  }

  render() {
    const admin = isAdmin();

    return html`
      <nav>
        <a href="/" class="brand">IPL Fantasy League</a>
        <div class="links">
          <a href="/">Home</a>
          ${!this.authReady
            ? ''
            : this.user
            ? html`
                <a href="/my-leagues">My Leagues</a>
                ${admin
                  ? html`<a href="/admin/create">Create League</a>`
                  : html`<a href="/join">Join Season</a>`
                }
                <div class="user-menu">
                  <button class="user-btn" @click=${this.toggleMenu}>
                    ${this.user.display_name.toUpperCase()} ▾
                  </button>
                  ${this.menuOpen
                    ? html`
                        <div class="dropdown">
                          <button @click=${this.handleLogout}>Logout</button>
                        </div>
                      `
                    : ''
                  }
                </div>
              `
            : html`
                <a href="/join">Join Season</a>
                <a href="/login">Login</a>
              `
          }
        </div>
      </nav>
    `;
  }
}
