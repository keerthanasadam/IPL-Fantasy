import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { sharedStyles } from '../styles/shared-styles.js';
import { api } from '../services/api.js';
import { guardRoute } from '../services/auth.js';

@customElement('page-join')
export class PageJoin extends LitElement {
  static styles = [sharedStyles];

  @state() private inviteCode = '';
  @state() private teamName = '';
  @state() private error = '';
  @state() private loading = false;

  connectedCallback() {
    super.connectedCallback();
    guardRoute('/join');
  }

  private async handleSubmit(e: Event) {
    e.preventDefault();
    if (!this.inviteCode.trim() || !this.teamName.trim()) return;
    this.loading = true;
    this.error = '';
    try {
      const res = await api.joinSeason(this.inviteCode.trim().toUpperCase(), this.teamName.trim());
      window.location.href = `/league/${res.league.id}`;
    } catch (err: any) {
      if (err.message.includes('Invalid invite code') || err.message.includes('404')) {
        this.error = 'Invalid invite code. Please check and try again.';
      } else {
        this.error = err.message;
      }
    } finally {
      this.loading = false;
    }
  }

  render() {
    return html`
      <div style="max-width: 420px; margin: 3rem auto; padding: 0 1rem;">
        <h1>Join a Season</h1>
        <div class="card">
          <form @submit=${this.handleSubmit}>
            <div class="form-group">
              <label>Invite Code *</label>
              <input
                type="text"
                .value=${this.inviteCode}
                @input=${(e: any) => this.inviteCode = e.target.value}
                placeholder="e.g. IPL26-XKFM"
                autocomplete="off"
                required
              />
            </div>
            <div class="form-group">
              <label>Team Name *</label>
              <input
                type="text"
                .value=${this.teamName}
                @input=${(e: any) => this.teamName = e.target.value}
                placeholder="e.g. Royal Challengers"
                maxlength="50"
                required
              />
            </div>
            ${this.error ? html`<p class="text-red" style="margin-bottom:0.75rem;">${this.error}</p>` : ''}
            <button class="btn btn-primary" type="submit" ?disabled=${this.loading} style="width:100%;">
              ${this.loading ? 'Joining...' : 'Join Season'}
            </button>
          </form>
        </div>
      </div>
    `;
  }
}
