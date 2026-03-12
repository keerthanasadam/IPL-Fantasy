type MessageHandler = (msg: any) => void;

export class DraftWebSocket {
  private ws: WebSocket | null = null;
  private handlers: Map<string, MessageHandler[]> = new Map();
  private reconnectTimer: number | null = null;
  private seasonId: string;
  private token: string;

  constructor(seasonId: string, token: string) {
    this.seasonId = seasonId;
    this.token = token;
  }

  connect() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${location.host}/ws/draft/${this.seasonId}?token=${this.token}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.emit('connected', {});
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.emit(msg.type, msg.data || msg);
      } catch {
        console.error('Invalid WS message:', event.data);
      }
    };

    this.ws.onclose = () => {
      this.emit('disconnected', {});
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }

  on(type: string, handler: MessageHandler) {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type)!.push(handler);
  }

  private emit(type: string, data: any) {
    (this.handlers.get(type) || []).forEach((h) => h(data));
  }

  send(message: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  pick(playerId: string) {
    this.send({ type: 'pick', player_id: playerId });
  }

  forcePick(teamId: string, playerId: string) {
    this.send({ type: 'force_pick', team_id: teamId, player_id: playerId });
  }

  undoLastPick() {
    this.send({ type: 'undo_last_pick' });
  }

  pauseDraft() {
    this.send({ type: 'pause_draft' });
  }

  resumeDraft() {
    this.send({ type: 'resume_draft' });
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.ws?.close();
    this.ws = null;
  }
}
