import { css } from 'lit';

export const sharedStyles = css`
  :host {
    display: block;
    color: var(--text-primary);
  }

  .card {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 1.5rem;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.6rem 1.2rem;
    border: none;
    border-radius: 8px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-primary {
    background: var(--accent);
    color: var(--accent-dark);
  }
  .btn-primary:hover { background: var(--accent-hover); }

  .btn-secondary {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }
  .btn-secondary:hover { background: var(--bg-secondary-hover); }

  .btn-danger {
    background: #ef4444;
    color: white;
  }
  .btn-danger:hover { background: #dc2626; }

  .btn-sm { padding: 0.4rem 0.8rem; font-size: 0.8rem; }

  input, select {
    background: var(--bg-input);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 0.6rem 0.8rem;
    color: var(--text-primary);
    font-size: 0.9rem;
    width: 100%;
  }
  input:focus, select:focus {
    outline: none;
    border-color: var(--accent);
  }

  label {
    display: block;
    margin-bottom: 0.4rem;
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .form-group {
    margin-bottom: 1rem;
  }

  h1 { font-size: 1.75rem; color: var(--accent); margin-bottom: 1rem; }
  h2 { font-size: 1.35rem; color: var(--text-heading-2); margin-bottom: 0.75rem; }
  h3 { font-size: 1.1rem; color: var(--text-heading-3); margin-bottom: 0.5rem; }

  .text-muted { color: var(--text-subtle); }
  .text-gold { color: var(--accent); }
  .text-green { color: #22c55e; }
  .text-red { color: #ef4444; }

  .flex { display: flex; }
  .gap-1 { gap: 0.5rem; }
  .gap-2 { gap: 1rem; }
  .items-center { align-items: center; }
  .justify-between { justify-content: space-between; }
  .flex-wrap { flex-wrap: wrap; }

  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; }

  @media (max-width: 640px) {
    .grid-2 { grid-template-columns: 1fr; }
    .grid-3 { grid-template-columns: 1fr; }
    h1 { font-size: 1.4rem; }
    h2 { font-size: 1.15rem; }
    .card { padding: 1rem; }
  }

  .badge {
    display: inline-block;
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
  }
  .badge-gold { background: var(--accent); color: var(--accent-dark); }
  .badge-blue { background: #3b82f6; color: white; }
  .badge-green { background: #22c55e; color: #0f172a; }
  .badge-gray { background: var(--bg-secondary); color: var(--text-primary); }
`;
