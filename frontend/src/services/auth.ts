import { api } from './api.js';

export function getToken(): string | null {
  return localStorage.getItem('token');
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

export async function login(email: string, password: string): Promise<void> {
  const res = await api.login(email, password);
  localStorage.setItem('token', res.access_token);
}

export async function register(email: string, password: string, displayName: string): Promise<void> {
  await api.register(email, password, displayName);
  await login(email, password);
}

export function logout(): void {
  localStorage.removeItem('token');
  window.location.href = '/login';
}
