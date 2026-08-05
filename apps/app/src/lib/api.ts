import { Platform } from 'react-native';
import { getSecret, setSecret } from './storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL || (Platform.OS === 'web' ? '/api' : 'http://10.0.2.2:8080/api');
let accessToken: string | null = null;
let refreshToken: string | null = null;

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function loadTokens(): Promise<void> {
  accessToken = await getSecret('fairshare.access');
  refreshToken = await getSecret('fairshare.refresh');
}

export async function saveTokens(tokens: { accessToken: string; refreshToken: string } | null): Promise<void> {
  accessToken = tokens?.accessToken ?? null;
  refreshToken = tokens?.refreshToken ?? null;
  await Promise.all([
    setSecret('fairshare.access', accessToken),
    setSecret('fairshare.refresh', refreshToken),
  ]);
}

async function refresh(): Promise<boolean> {
  if (!refreshToken) return false;
  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!response.ok) {
    await saveTokens(null);
    return false;
  }
  const tokens = (await response.json()) as { accessToken: string; refreshToken: string };
  await saveTokens(tokens);
  return true;
}

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (response.status === 401 && retry && (await refresh())) return api<T>(path, init, false);
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {}
    throw new ApiError(response.status, message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function uploadReceipt(uri: string, fileName = 'receipt.jpg', mimeType = 'image/jpeg'): Promise<any> {
  const form = new FormData();
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    form.append('file', blob, fileName);
  } else {
    form.append('file', { uri, name: fileName, type: mimeType } as any);
  }
  return api('/receipts/scan', { method: 'POST', body: form });
}
