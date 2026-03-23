import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { getMe, isAdmin, logout, type UserInfo } from '../services/auth.js';
import { getTheme, toggleTheme, type Theme } from '../services/theme.js';

@customElement('nav-bar')
export class NavBar extends LitElement {
  @state() private user: UserInfo | null = null;
  @state() private menuOpen = false;
  @state() private authReady = false;
  @state() private theme: Theme = getTheme();

  static styles = css`
    :host {
      display: block;
    }
    nav {
      background: var(--nav-bg);
      border-bottom: 2px solid var(--accent);
      padding: 0.75rem 1.5rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      transition: background 0.2s;
    }
    .brand {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--accent);
      text-decoration: none;
    }
    .links {
      display: flex;
      gap: 1.5rem;
      align-items: center;
    }
    .links a {
      color: var(--text-muted);
      text-decoration: none;
      font-size: 0.9rem;
    }
    .links a:hover { color: var(--text-primary); }
    .user-menu {
      position: relative;
    }
    .user-btn {
      background: var(--bg-secondary);
      border: none;
      color: var(--text-primary);
      padding: 0.4rem 0.8rem;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.9rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .user-btn:hover { background: var(--bg-secondary-hover); }
    .dropdown {
      position: absolute;
      right: 0;
      top: calc(100% + 0.5rem);
      background: var(--dropdown-bg);
      border: 1px solid var(--border-color);
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
      color: var(--text-primary);
      text-align: left;
      cursor: pointer;
      font-size: 0.9rem;
    }
    .dropdown button:hover { background: var(--bg-secondary); }

    /* ── Theme toggle button ── */
    .theme-toggle {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 20px;
      cursor: pointer;
      padding: 0.3rem 0.65rem;
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.85rem;
      color: var(--text-muted);
      transition: background 0.15s, color 0.15s;
      line-height: 1;
    }
    .theme-toggle:hover {
      background: var(--bg-secondary-hover);
      color: var(--text-primary);
    }
    .theme-toggle .icon { font-size: 1rem; }
  `;

  connectedCallback() {
    super.connectedCallback();
    this._loadUser();
    window.addEventListener('theme-changed', this._onThemeChanged);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('theme-changed', this._onThemeChanged);
  }

  private _onThemeChanged = (e: Event) => {
    this.theme = (e as CustomEvent<Theme>).detail;
  };

  private async _loadUser() {
    this.user = await getMe();
    this.authReady = true;
  }

  private toggleMenu() {
    this.menuOpen = !this.menuOpen;
  }

  private handleLogout() {
    logout();
  }

  private handleThemeToggle() {
    toggleTheme();
  }

  render() {
    const admin = isAdmin();
    const isDark = this.theme === 'dark';

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

          <button
            class="theme-toggle"
            @click=${this.handleThemeToggle}
            title=${isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label=${isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <span class="icon">${isDark ? '☀️' : '🌙'}</span>
            ${isDark ? 'Light' : 'Dark'}
          </button>
        </div>
      </nav>
    `;
  }
}
