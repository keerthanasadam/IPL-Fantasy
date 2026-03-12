import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

@customElement('page-home')
export class PageHome extends LitElement {
  static styles = css`
    :host {
      display: block;
      padding: 2rem 0;
    }
    h1 {
      font-size: 2rem;
      margin-bottom: 0.5rem;
      color: #f5a623;
    }
    p {
      color: #94a3b8;
      margin-bottom: 2rem;
    }
    .status-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 2rem;
      max-width: 500px;
    }
    .status-card h2 {
      font-size: 1.25rem;
      margin-bottom: 1rem;
    }
    .health {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #22c55e;
    }
    .dot.error { background: #ef4444; }
    .dot.loading { background: #f59e0b; }
  `;

  @state() private healthStatus: string = 'loading';

  connectedCallback() {
    super.connectedCallback();
    this.checkHealth();
  }

  async checkHealth() {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        this.healthStatus = 'ok';
      } else {
        this.healthStatus = 'error';
      }
    } catch {
      this.healthStatus = 'error';
    }
  }

  render() {
    return html`
      <h1>IPL Fantasy League</h1>
      <p>Yahoo-style fantasy cricket for IPL 2026</p>

      <div class="status-card">
        <h2>System Status</h2>
        <div class="health">
          <span class="dot ${this.healthStatus}"></span>
          <span>API: ${this.healthStatus === 'ok' ? 'Connected' : this.healthStatus === 'loading' ? 'Checking...' : 'Disconnected'}</span>
        </div>
      </div>
    `;
  }
}
