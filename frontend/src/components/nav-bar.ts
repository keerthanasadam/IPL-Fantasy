import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { getMe, isAdmin, logout, type UserInfo } from '../services/auth.js';
import { getTheme, toggleTheme, type Theme } from '../services/theme.js';

@customElement('nav-bar')
export class NavBar extends LitElement {
  @state() private user: UserInfo | null = null;
  @state() private menuOpen = false;
  @state() private mobileNavOpen = false;
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
      position: relative;
    }
    .brand {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--accent);
      text-decoration: none;
    }

    /* Desktop links */
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

    /* Hamburger button — hidden on desktop */
    .hamburger {
      display: none;
      flex-direction: column;
      gap: 5px;
      background: none;
      border: none;
      cursor: pointer;
      padding: 4px;
    }
    .hamburger span {
      display: block;
      width: 24px;
      height: 2px;
      background: var(--text-primary);
      border-radius: 2px;
      transition: all 0.2s;
    }

    /* Mobile drawer */
    .mobile-nav {
      display: none;
    }

    /* User menu */
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

    /* Theme toggle */
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
      white-space: nowrap;
    }
    .theme-toggle:hover {
      background: var(--bg-secondary-hover);
      color: var(--text-primary);
    }
    .theme-toggle .icon { font-size: 1rem; }

    /* ── Mobile styles ── */
    @media (max-width: 640px) {
      nav {
        padding: 0.75rem 1rem;
        flex-wrap: wrap;
        gap: 0;
      }

      /* Show hamburger, hide desktop link row */
      .hamburger { display: flex; }
      .links { display: none; }

      /* Mobile drawer below the nav bar */
      .mobile-nav {
        display: block;
        width: 100%;
        overflow: hidden;
        max-height: 0;
        transition: max-height 0.25s ease;
      }
      .mobile-nav.open {
        max-height: 400px;
      }
      .mobile-nav-inner {
        display: flex;
        flex-direction: column;
        gap: 0;
        padding: 0.5rem 0;
        border-top: 1px solid var(--border-color);
        margin-top: 0.5rem;
      }
      .mobile-nav-inner a,
      .mobile-nav-inner .mobile-nav-btn {
        display: block;
        padding: 0.65rem 0.25rem;
        color: var(--text-muted);
        text-decoration: none;
        font-size: 0.95rem;
        border-bottom: 1px solid var(--border-color);
        background: none;
        border-left: none;
        border-right: none;
        border-top: none;
        width: 100%;
        text-align: left;
        cursor: pointer;
        font-family: inherit;
      }
      .mobile-nav-inner a:last-child,
      .mobile-nav-inner .mobile-nav-btn:last-child {
        border-bottom: none;
      }
      .mobile-nav-inner a:hover,
      .mobile-nav-inner .mobile-nav-btn:hover {
        color: var(--text-primary);
        background: var(--bg-secondary);
      }
      .mobile-theme-row {
        padding: 0.65rem 0.25rem;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        color: var(--text-muted);
        font-size: 0.95rem;
      }
      .mobile-theme-row .theme-toggle {
        margin-left: auto;
      }
    }
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

  private toggleMobileNav() {
    this.mobileNavOpen = !this.mobileNavOpen;
    this.menuOpen = false;
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

    const themeToggleBtn = html`
      <button
        class="theme-toggle"
        @click=${this.handleThemeToggle}
        title=${isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        aria-label=${isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        <span class="icon">${isDark ? '☀️' : '🌙'}</span>
        ${isDark ? 'Light' : 'Dark'}
      </button>
    `;

    return html`
      <nav>
        <a href="/" class="brand">IPL Fantasy League</a>

        <!-- Desktop links -->
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
          ${themeToggleBtn}
        </div>

        <!-- Hamburger (mobile only) -->
        <button
          class="hamburger"
          @click=${this.toggleMobileNav}
          aria-label="Toggle navigation"
          aria-expanded=${this.mobileNavOpen}
        >
          <span></span>
          <span></span>
          <span></span>
        </button>

        <!-- Mobile drawer -->
        <div class="mobile-nav ${this.mobileNavOpen ? 'open' : ''}">
          <div class="mobile-nav-inner">
            <a href="/" @click=${() => { this.mobileNavOpen = false; }}>Home</a>
            ${!this.authReady
              ? ''
              : this.user
              ? html`
                  <a href="/my-leagues" @click=${() => { this.mobileNavOpen = false; }}>My Leagues</a>
                  ${admin
                    ? html`<a href="/admin/create" @click=${() => { this.mobileNavOpen = false; }}>Create League</a>`
                    : html`<a href="/join" @click=${() => { this.mobileNavOpen = false; }}>Join Season</a>`
                  }
                  <button class="mobile-nav-btn" @click=${this.handleLogout}>Logout</button>
                `
              : html`
                  <a href="/join" @click=${() => { this.mobileNavOpen = false; }}>Join Season</a>
                  <a href="/login" @click=${() => { this.mobileNavOpen = false; }}>Login</a>
                `
            }
            <div class="mobile-theme-row">
              <span>${isDark ? 'Light mode' : 'Dark mode'}</span>
              ${themeToggleBtn}
            </div>
          </div>
        </div>
      </nav>
    `;
  }
}
