import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { login, register } from '../services/auth.js';
import { api } from '../services/api.js';
import { sharedStyles } from '../styles/shared-styles.js';

@customElement('page-login')
export class PageLogin extends LitElement {
  static styles = [
    sharedStyles,
    css`
      :host { display: flex; justify-content: center; padding: 4rem 1rem; }
      .card { width: 100%; max-width: 400px; }
      .tabs { display: flex; gap: 0; margin-bottom: 1.5rem; }
      .tab {
        flex: 1; padding: 0.6rem; text-align: center;
        background: var(--bg-input); border: 1px solid var(--border-color);
        cursor: pointer; font-weight: 600; color: var(--text-muted);
      }
      .tab:first-child { border-radius: 8px 0 0 8px; }
      .tab:last-child { border-radius: 0 8px 8px 0; }
      .tab.active { background: var(--accent); color: var(--accent-dark); border-color: var(--accent); }
      .error { color: #ef4444; font-size: 0.85rem; margin-bottom: 1rem; }
      .forgot-link {
        display: block; text-align: right; margin-top: 0.5rem;
        font-size: 0.82rem; color: var(--text-muted); cursor: pointer;
        background: none; border: none; padding: 0; text-decoration: underline;
      }
      .forgot-link:hover { color: var(--accent); }
      .temp-password-box {
        background: #052e16; border: 1px solid #16a34a; border-radius: 8px;
        padding: 1rem; margin-bottom: 1rem;
      }
      .temp-password-box p { color: #4ade80; font-size: 0.85rem; margin: 0 0 0.5rem; }
      .temp-password-value {
        font-family: monospace; font-size: 1.4rem; font-weight: 700;
        color: #86efac; letter-spacing: 0.1em; display: block; margin-bottom: 0.5rem;
      }

      @media (max-width: 640px) {
        :host { padding: 2rem 1rem; }
      }
    `,
  ];

  @state() private mode: 'login' | 'register' | 'forgot' = 'login';
  @state() private email = '';
  @state() private password = '';
  @state() private displayName = '';
  @state() private error = '';
  @state() private loading = false;
  @state() private tempPassword: string | null = null;
  private redirectTo = '/';

  onBeforeEnter(location: any) {
    const params = new URLSearchParams(location.search);
    this.redirectTo = params.get('redirect') || '/';
  }

  async handleSubmit(e: Event) {
    e.preventDefault();
    this.error = '';
    this.loading = true;
    try {
      if (this.mode === 'register') {
        await register(this.email, this.password, this.displayName);
        window.location.href = this.redirectTo;
      } else if (this.mode === 'login') {
        await login(this.email, this.password);
        window.location.href = this.redirectTo;
      } else {
        // forgot password
        const res = await api.forgotPassword(this.email);
        this.tempPassword = res.temp_password ?? null;
      }
    } catch (err: any) {
      this.error = err.message;
    } finally {
      this.loading = false;
    }
  }

  private switchToLogin() {
    this.mode = 'login';
    this.tempPassword = null;
    this.error = '';
  }

  private copyTempPassword() {
    if (this.tempPassword) navigator.clipboard.writeText(this.tempPassword);
  }

  render() {
    return html`
      <div class="card">
        <h1>IPL Fantasy League</h1>

        ${this.mode !== 'forgot' ? html`
          <div class="tabs">
            <div class="tab ${this.mode === 'login' ? 'active' : ''}" @click=${() => { this.mode = 'login'; this.error = ''; }}>Login</div>
            <div class="tab ${this.mode === 'register' ? 'active' : ''}" @click=${() => { this.mode = 'register'; this.error = ''; }}>Register</div>
          </div>
        ` : html`
          <div style="margin-bottom:1.5rem;">
            <h2 style="margin:0 0 0.25rem;">Reset Password</h2>
            <p class="text-muted" style="font-size:0.85rem;margin:0;">Enter your email to get a temporary password.</p>
          </div>
        `}

        ${this.error ? html`<div class="error">${this.error}</div>` : ''}

        ${this.tempPassword ? html`
          <div class="temp-password-box">
            <p>Your temporary password — copy it now, it won't be shown again:</p>
            <span class="temp-password-value">${this.tempPassword}</span>
            <button class="btn btn-secondary btn-sm" @click=${this.copyTempPassword}>Copy</button>
          </div>
          <button class="btn btn-primary" style="width:100%" @click=${this.switchToLogin}>
            Back to Login
          </button>
        ` : html`
          <form @submit=${this.handleSubmit}>
            ${this.mode === 'register' ? html`
              <div class="form-group">
                <label>Display Name</label>
                <input type="text" .value=${this.displayName} @input=${(e: any) => (this.displayName = e.target.value)} required />
              </div>
            ` : ''}

            <div class="form-group">
              <label>${this.mode === 'forgot' ? 'Email' : 'Username'}</label>
              <input type="text" .value=${this.email} @input=${(e: any) => (this.email = e.target.value)} required />
            </div>

            ${this.mode !== 'forgot' ? html`
              <div class="form-group">
                <label>Password</label>
                <input type="password" .value=${this.password} @input=${(e: any) => (this.password = e.target.value)} required />
              </div>
            ` : ''}

            <button class="btn btn-primary" style="width:100%" type="submit" ?disabled=${this.loading}>
              ${this.loading
                ? 'Loading...'
                : this.mode === 'login'
                ? 'Login'
                : this.mode === 'register'
                ? 'Register'
                : 'Get Temporary Password'}
            </button>

            ${this.mode === 'login' ? html`
              <button type="button" class="forgot-link" @click=${() => { this.mode = 'forgot'; this.error = ''; }}>
                Forgot password?
              </button>
            ` : ''}

            ${this.mode === 'forgot' ? html`
              <button type="button" class="forgot-link" @click=${this.switchToLogin}>
                Back to Login
              </button>
            ` : ''}
          </form>
        `}
      </div>
    `;
  }
}
