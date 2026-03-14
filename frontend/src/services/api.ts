const BASE = '/api';

function getHeaders(): HeadersInit {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

function authHeaders(): HeadersInit {
  const headers: HeadersInit = {};
  const token = localStorage.getItem('token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function handleResponse(res: Response) {
  if (res.status === 401) {
    if (window.location.pathname !== '/login') {
      window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
    }
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || res.statusText);
  }
  return res.json();
}

// Auth
export const api = {
  register(email: string, password: string, displayName: string) {
    return fetch(`${BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, display_name: displayName }),
    }).then(handleResponse);
  },

  login(email: string, password: string) {
    return fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }).then(handleResponse);
  },

  getMe() {
    return fetch(`${BASE}/auth/me`, { headers: getHeaders() }).then(handleResponse);
  },

  // Leagues
  getLeagues() {
    return fetch(`${BASE}/leagues`, { headers: getHeaders() }).then(handleResponse);
  },

  createLeague(name: string) {
    return fetch(`${BASE}/leagues`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ name }),
    }).then(handleResponse);
  },

  getLeague(id: string) {
    return fetch(`${BASE}/leagues/${id}`, { headers: getHeaders() }).then(handleResponse);
  },

  // Seasons
  createSeason(leagueId: string, data: any) {
    return fetch(`${BASE}/leagues/${leagueId}/seasons`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then(handleResponse);
  },

  getSeason(id: string) {
    return fetch(`${BASE}/seasons/${id}`, { headers: getHeaders() }).then(handleResponse);
  },

  startDraft(seasonId: string) {
    return fetch(`${BASE}/seasons/${seasonId}/start-draft`, {
      method: 'POST',
      headers: getHeaders(),
    }).then(handleResponse);
  },

  // Teams
  getTeams(seasonId: string) {
    return fetch(`${BASE}/seasons/${seasonId}/teams`, { headers: getHeaders() }).then(handleResponse);
  },

  updateTeam(teamId: string, data: any) {
    return fetch(`${BASE}/teams/${teamId}`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then(handleResponse);
  },

  updateDraftOrder(seasonId: string, data: any) {
    return fetch(`${BASE}/seasons/${seasonId}/draft-order`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then(handleResponse);
  },

  // Players
  getPlayers(seasonId: string, params?: { search?: string; team?: string; designation?: string }) {
    const qs = new URLSearchParams(params as any).toString();
    return fetch(`${BASE}/seasons/${seasonId}/players?${qs}`, { headers: getHeaders() }).then(handleResponse);
  },

  importPlayers(seasonId: string, file: File) {
    const form = new FormData();
    form.append('file', file);
    return fetch(`${BASE}/seasons/${seasonId}/players/import`, {
      method: 'POST',
      headers: authHeaders(),
      body: form,
    }).then(handleResponse);
  },

  updateSeason(seasonId: string, data: { label?: string; draft_config?: object }) {
    return fetch(`${BASE}/seasons/${seasonId}`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(data),
    }).then(handleResponse);
  },

  async deleteSeason(seasonId: string) {
    const res = await fetch(`${BASE}/seasons/${seasonId}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (res.status === 401) {
      window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
      throw new Error('Unauthorized');
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(body.detail || res.statusText);
    }
    // 204 No Content
  },

  clearPlayers(seasonId: string) {
    return fetch(`${BASE}/seasons/${seasonId}/players`, {
      method: 'DELETE',
      headers: getHeaders(),
    }).then(handleResponse);
  },

  // Join season
  joinSeason(inviteCode: string, teamName: string) {
    return fetch(`${BASE}/seasons/join`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ invite_code: inviteCode, team_name: teamName }),
    }).then(handleResponse);
  },

  getMyLeagues() {
    return fetch(`${BASE}/leagues/mine`, { headers: getHeaders() }).then(handleResponse);
  },

  // Draft
  getDraft(seasonId: string) {
    return fetch(`${BASE}/seasons/${seasonId}/draft`, { headers: getHeaders() }).then(handleResponse);
  },

  exportDraft(seasonId: string) {
    return fetch(`${BASE}/seasons/${seasonId}/draft/export`, { headers: getHeaders() });
  },
};
