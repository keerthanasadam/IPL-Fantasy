import { css } from 'lit';

export const sharedStyles = css`
  :host {
    display: block;
    color: #e2e8f0;
  }

  .card {
    background: #1e293b;
    border: 1px solid #334155;
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
    background: #f5a623;
    color: #0f172a;
  }
  .btn-primary:hover { background: #e09000; }

  .btn-secondary {
    background: #334155;
    color: #e2e8f0;
  }
  .btn-secondary:hover { background: #475569; }

  .btn-danger {
    background: #ef4444;
    color: white;
  }
  .btn-danger:hover { background: #dc2626; }

  .btn-sm { padding: 0.4rem 0.8rem; font-size: 0.8rem; }

  input, select {
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 0.6rem 0.8rem;
    color: #e2e8f0;
    font-size: 0.9rem;
    width: 100%;
  }
  input:focus, select:focus {
    outline: none;
    border-color: #f5a623;
  }

  label {
    display: block;
    margin-bottom: 0.4rem;
    font-size: 0.85rem;
    color: #94a3b8;
  }

  .form-group {
    margin-bottom: 1rem;
  }

  h1 { font-size: 1.75rem; color: #f5a623; margin-bottom: 1rem; }
  h2 { font-size: 1.35rem; color: #e2e8f0; margin-bottom: 0.75rem; }
  h3 { font-size: 1.1rem; color: #cbd5e1; margin-bottom: 0.5rem; }

  .text-muted { color: #64748b; }
  .text-gold { color: #f5a623; }
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

  .badge {
    display: inline-block;
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
  }
  .badge-gold { background: #f5a623; color: #0f172a; }
  .badge-blue { background: #3b82f6; color: white; }
  .badge-green { background: #22c55e; color: #0f172a; }
  .badge-gray { background: #475569; color: #e2e8f0; }
`;
