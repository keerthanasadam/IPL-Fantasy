import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { login, register } from '../services/auth.js';
import { sharedStyles } from '../styles/shared-styles.js';

@customElement('page-login')
export class PageLogin extends LitElement {
  static styles = [
    sharedStyles,
    css`
      :host { display: flex; justify-content: center; padding: 4rem 0; }
      .card { width: 100%; max-width: 400px; }
      .tabs { display: flex; gap: 0; margin-bottom: 1.5rem; }
      .tab {
        flex: 1; padding: 0.6rem; text-align: center;
        background: #0f172a; border: 1px solid #334155;
        cursor: pointer; font-weight: 600; color: #94a3b8;
      }
      .tab:first-child { border-radius: 8px 0 0 8px; }
      .tab:last-child { border-radius: 0 8px 8px 0; }
      .tab.active { background: #f5a623; color: #0f172a; border-color: #f5a623; }
      .error { color: #ef4444; font-size: 0.85rem; margin-bottom: 1rem; }
    `,
  ];

  @state() private mode: 'login' | 'register' = 'login';
  @state() private email = '';
  @state() private password = '';
  @state() private displayName = '';
  @state() private error = '';
  @state() private loading = false;

  async handleSubmit(e: Event) {
    e.preventDefault();
    this.error = '';
    this.loading = true;
    try {
      if (this.mode === 'register') {
        await register(this.email, this.password, this.displayName);
      } else {
        await login(this.email, this.password);
      }
      window.location.href = '/';
    } catch (err: any) {
      this.error = err.message;
    } finally {
      this.loading = false;
    }
  }

  render() {
    return html`
      <div class="card">
        <h1>IPL Fantasy League</h1>
        <div class="tabs">
          <div class="tab ${this.mode === 'login' ? 'active' : ''}" @click=${() => (this.mode = 'login')}>Login</div>
          <div class="tab ${this.mode === 'register' ? 'active' : ''}" @click=${() => (this.mode = 'register')}>Register</div>
        </div>

        ${this.error ? html`<div class="error">${this.error}</div>` : ''}

        <form @submit=${this.handleSubmit}>
          ${this.mode === 'register'
            ? html`
                <div class="form-group">
                  <label>Display Name</label>
                  <input type="text" .value=${this.displayName} @input=${(e: any) => (this.displayName = e.target.value)} required />
                </div>
              `
            : ''}
          <div class="form-group">
            <label>Email</label>
            <input type="email" .value=${this.email} @input=${(e: any) => (this.email = e.target.value)} required />
          </div>
          <div class="form-group">
            <label>Password</label>
            <input type="password" .value=${this.password} @input=${(e: any) => (this.password = e.target.value)} required />
          </div>
          <button class="btn btn-primary" style="width:100%" type="submit" ?disabled=${this.loading}>
            ${this.loading ? 'Loading...' : this.mode === 'login' ? 'Login' : 'Register'}
          </button>
        </form>
      </div>
    `;
  }
}
