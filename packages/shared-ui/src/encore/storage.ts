import type { SetRecord } from '@strumble/crowd';
import { config } from './config';

/**
 * The MC's memory: the last six set records. In memory everywhere; mirrored to localStorage where the platform has one
 * (the web preview), so a reload keeps the ledger. No AsyncStorage dependency (Vega).
 */
const KEY = 'encore.records';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function local(): StorageLike | undefined {
  const g = globalThis as unknown as { localStorage?: StorageLike };
  try {
    return g.localStorage && typeof g.localStorage.getItem === 'function' ? g.localStorage : undefined;
  } catch {
    return undefined;
  }
}

let memory: SetRecord[] = [];

export function loadRecords(): SetRecord[] {
  const store = local();
  if (store) {
    try {
      const raw = store.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) memory = parsed.slice(-config.memorySets);
      }
    } catch {
      // Unreadable or absent: start with what is in memory.
    }
  }
  return memory;
}

export function saveRecords(records: SetRecord[]): SetRecord[] {
  memory = records.slice(-config.memorySets);
  const store = local();
  if (store) {
    try {
      store.setItem(KEY, JSON.stringify(memory));
    } catch {
      // Quota or privacy mode: memory still holds the ledger for this session.
    }
  }
  return memory;
}
