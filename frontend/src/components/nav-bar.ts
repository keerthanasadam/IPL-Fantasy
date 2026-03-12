import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('nav-bar')
export class NavBar extends LitElement {
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
  `;

  render() {
    return html`
      <nav>
        <a href="/" class="brand">IPL Fantasy League</a>
        <div class="links">
          <a href="/">Home</a>
          <a href="/login">Login</a>
        </div>
      </nav>
    `;
  }
}
