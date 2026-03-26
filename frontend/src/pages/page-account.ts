import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { api } from '../services/api.js';
import { getMe, getCachedUser, refreshUser, guardRoute } from '../services/auth.js';
import { sharedStyles } from '../styles/shared-styles.js';

@customElement('page-account')
export class PageAccount extends LitElement {
  static styles = [
    sharedStyles,
    css`
      :host { display: block; max-width: 480px; margin: 2rem auto; padding: 0 1rem; }
      .section { margin-bottom: 2rem; }
      .section h2 { margin-bottom: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem; }
      .temp-banner {
        background: #1c1917; border: 1px solid #f5a623; border-radius: 8px;
        padding: 0.75rem 1rem; margin-bottom: 1rem; font-size: 0.85rem; color: #fbbf24;
      }
      .success { color: #22c55e; font-size: 0.85rem; margin-top: 0.5rem; }
      .error { color: #ef4444; font-size: 0.85rem; margin-top: 0.5rem; }
    `,
  ];

  @state() private displayName = '';
  @state() private nameLoading = false;
  @state() private nameSuccess = false;
  @state() private nameError = '';

  @state() private currentPassword = '';
  @state() private newPassword = '';
  @state() private confirmPassword = '';
  @state() private pwLoading = false;
  @state() private pwSuccess = false;
  @state() private pwError = '';

  @state() private isForced = false;

  onBeforeEnter(location: any) {
    const params = new URLSearchParams(location.search);
    this.isForced = params.get('force') === 'true';
  }

  async connectedCallback() {
    super.connectedCallback();
    guardRoute('/account');
    const user = await getMe();
    if (user) this.displayName = user.display_name;
  }

  private async saveName(e: Event) {
    e.preventDefault();
    this.nameError = '';
    this.nameSuccess = false;
    if (!this.displayName.trim()) { this.nameError = 'Name cannot be empty.'; return; }
    this.nameLoading = true;
    try {
      await api.updateProfile(this.displayName.trim());
      await refreshUser();
      this.nameSuccess = true;
      window.dispatchEvent(new CustomEvent('user-updated', { bubbles: true, composed: true }));
      setTimeout(() => { this.nameSuccess = false; }, 2500);
    } catch (err: any) {
      this.nameError = err.message;
    } finally {
      this.nameLoading = false;
    }
  }

  private async savePassword(e: Event) {
    e.preventDefault();
    this.pwError = '';
    this.pwSuccess = false;
    if (this.newPassword !== this.confirmPassword) {
      this.pwError = 'Passwords do not match.';
      return;
    }
    if (this.newPassword.length < 6) {
      this.pwError = 'Password must be at least 6 characters.';
      return;
    }
    this.pwLoading = true;
    try {
      const current = this.isForced ? null : this.currentPassword;
      await api.changePassword(current, this.newPassword);
      await refreshUser();
      this.pwSuccess = true;
      this.currentPassword = '';
      this.newPassword = '';
      this.confirmPassword = '';
      if (this.isForced) {
        setTimeout(() => { window.location.href = '/my-leagues'; }, 1500);
      } else {
        setTimeout(() => { this.pwSuccess = false; }, 2500);
      }
    } catch (err: any) {
      this.pwError = err.message;
    } finally {
      this.pwLoading = false;
    }
  }

  render() {
    const user = getCachedUser();
    return html`
      <h1>Account Settings</h1>
      ${user?.email ? html`<p class="text-muted" style="margin-bottom:1.5rem;">${user.email}</p>` : ''}

      <!-- Display Name -->
      <div class="card section">
        <h2>Display Name</h2>
        <form @submit=${this.saveName}>
          <div class="form-group">
            <label>Name shown across the platform</label>
            <input
              type="text"
              .value=${this.displayName}
              @input=${(e: any) => { this.displayName = e.target.value; }}
              maxlength="100"
              required
            />
          </div>
          <button class="btn btn-primary btn-sm" type="submit" ?disabled=${this.nameLoading}>
            ${this.nameLoading ? 'Saving...' : 'Save Name'}
          </button>
          ${this.nameSuccess ? html`<span class="success"> Saved!</span>` : ''}
          ${this.nameError ? html`<p class="error">${this.nameError}</p>` : ''}
        </form>
      </div>

      <!-- Change Password -->
      <div class="card section">
        <h2>Change Password</h2>
        ${this.isForced ? html`
          <div class="temp-banner">
            You are using a temporary password. Please set a new password to continue.
          </div>
        ` : ''}
        <form @submit=${this.savePassword}>
          ${!this.isForced ? html`
            <div class="form-group">
              <label>Current Password</label>
              <input
                type="password"
                .value=${this.currentPassword}
                @input=${(e: any) => { this.currentPassword = e.target.value; }}
                required
              />
            </div>
          ` : ''}
          <div class="form-group">
            <label>New Password</label>
            <input
              type="password"
              .value=${this.newPassword}
              @input=${(e: any) => { this.newPassword = e.target.value; }}
              minlength="6"
              required
            />
          </div>
          <div class="form-group">
            <label>Confirm New Password</label>
            <input
              type="password"
              .value=${this.confirmPassword}
              @input=${(e: any) => { this.confirmPassword = e.target.value; }}
              required
            />
          </div>
          <button class="btn btn-primary btn-sm" type="submit" ?disabled=${this.pwLoading}>
            ${this.pwLoading ? 'Saving...' : 'Change Password'}
          </button>
          ${this.pwSuccess ? html`<span class="success"> ${this.isForced ? 'Password set! Redirecting...' : 'Password changed!'}</span>` : ''}
          ${this.pwError ? html`<p class="error">${this.pwError}</p>` : ''}
        </form>
      </div>
    `;
  }
}
