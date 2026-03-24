import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

@customElement('csv-uploader')
export class CsvUploader extends LitElement {
  static styles = css`
    :host { display: block; }
    .upload-zone {
      border: 2px dashed #334155;
      border-radius: 8px;
      padding: 1.5rem;
      text-align: center;
      cursor: pointer;
      transition: border-color 0.15s;
      color: #94a3b8;
    }
    .upload-zone:hover { border-color: #f5a623; }
    .upload-zone.drag-over { border-color: #f5a623; background: rgba(245, 166, 35, 0.05); }
    input[type="file"] { display: none; }
    .file-name { color: #f5a623; font-weight: 600; margin-top: 0.5rem; }
  `;

  @state() private fileName = '';
  @state() private dragOver = false;

  private handleClick() {
    this.shadowRoot?.querySelector('input')?.click();
  }

  private handleFile(file: File) {
    if (!file.name.endsWith('.csv')) return;
    this.fileName = file.name;
    this.dispatchEvent(new CustomEvent('file-selected', { detail: { file } }));
  }

  private handleChange(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files?.[0]) this.handleFile(input.files[0]);
  }

  private handleDrop(e: DragEvent) {
    e.preventDefault();
    this.dragOver = false;
    if (e.dataTransfer?.files[0]) this.handleFile(e.dataTransfer.files[0]);
  }

  render() {
    return html`
      <div class="upload-zone ${this.dragOver ? 'drag-over' : ''}"
           @click=${this.handleClick}
           @dragover=${(e: DragEvent) => { e.preventDefault(); this.dragOver = true; }}
           @dragleave=${() => (this.dragOver = false)}
           @drop=${this.handleDrop}>
        <div>Click or drag CSV file here</div>
        <div style="font-size:0.8rem; margin-top:0.25rem;">Required: Player Name, Team, Designation · Optional: Ranking</div>
        ${this.fileName ? html`<div class="file-name">${this.fileName}</div>` : ''}
      </div>
      <input type="file" accept=".csv" @change=${this.handleChange} />
    `;
  }
}
