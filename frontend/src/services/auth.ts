import { api } from './api.js';

export interface UserInfo {
  user_id: string;
  id: string;
  email: string;
  display_name: string;
  is_admin: boolean;
}

const SESSION_KEY = 'ipl_user';

let cachedUser: UserInfo | null = (() => {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    return stored ? (JSON.parse(stored) as UserInfo) : null;
  } catch {
    return null;
  }
})();

function persistUser(user: UserInfo | null) {
  cachedUser = user;
  try {
    if (user) sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch { /* storage unavailable */ }
}

export function getToken(): string | null {
  return localStorage.getItem('token');
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

export async function getMe(): Promise<UserInfo | null> {
  if (cachedUser) return cachedUser;
  if (!isLoggedIn()) return null;
  try {
    const user = await api.getMe();
    persistUser({ ...user, user_id: user.id });
    return cachedUser;
  } catch {
    persistUser(null);
    localStorage.removeItem('token');
    return null;
  }
}

export function getCachedUser(): UserInfo | null {
  return cachedUser;
}

export function isAdmin(): boolean {
  return cachedUser?.is_admin ?? false;
}

export function guardRoute(redirectTo: string = '/'): boolean {
  if (!isLoggedIn()) {
    window.location.href = `/login?redirect=${encodeURIComponent(redirectTo)}`;
    return false;
  }
  return true;
}

export async function login(email: string, password: string): Promise<void> {
  const res = await api.login(email, password);
  localStorage.setItem('token', res.access_token);
  persistUser(null);
}

export async function register(email: string, password: string, displayName: string): Promise<void> {
  await api.register(email, password, displayName);
  await login(email, password);
}

export function logout(): void {
  persistUser(null);
  localStorage.removeItem('token');
  window.location.href = '/login';
}
