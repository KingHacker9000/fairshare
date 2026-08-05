import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { api } from './api';

const QUEUE_KEY = 'fairshare.mutationQueue';
const CURSOR_KEY = 'fairshare.syncCursor';

export interface QueuedMutation {
  id: string;
  kind: 'createExpense' | 'createPayment';
  groupId: string;
  payload: Record<string, unknown>;
  queuedAt: string;
}

async function readQueue(): Promise<QueuedMutation[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function enqueueMutation(mutation: Omit<QueuedMutation, 'id' | 'queuedAt'> & { id?: string }): Promise<string> {
  const id = mutation.id ?? `offline_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const queue = (await readQueue()).filter((item) => item.id !== id);
  queue.push({ ...mutation, id, queuedAt: new Date().toISOString() });
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  return id;
}

export async function syncNow(): Promise<{ pushed: number; pulled: number }> {
  const state = await NetInfo.fetch();
  if (!state.isConnected) return { pushed: 0, pulled: 0 };
  const queue = await readQueue();
  const cursor = Number(await AsyncStorage.getItem(CURSOR_KEY)) || 0;
  const result = await api<{ accepted: string[]; cursor: number; changes: unknown[] }>('/sync', {
    method: 'POST',
    body: JSON.stringify({ cursor, mutations: queue }),
  });
  const accepted = new Set(result.accepted);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue.filter((item) => !accepted.has(item.id))));
  await AsyncStorage.setItem(CURSOR_KEY, String(result.cursor));
  return { pushed: result.accepted.length, pulled: result.changes.length };
}

export function subscribeToSync(onComplete?: () => void): () => void {
  const unsubscribe = NetInfo.addEventListener((state) => {
    if (state.isConnected) void syncNow().then(() => onComplete?.()).catch(() => undefined);
  });
  return unsubscribe;
}
