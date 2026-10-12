import { numberSet, seedSetNumbers, type SetNumbers, type SetRecord } from '@strumble/crowd';
import { config } from './config';

/**
 * The MC's memory: the last six set records. In memory everywhere; mirrored to localStorage where the platform has one
 * (the web preview), so a reload keeps the ledger. No AsyncStorage dependency (Vega). The set counter beside it only
 * goes up, so the cut sheet's "Set 7" does not stop at the six records kept.
 */
const KEY = 'encore.records';
const NUMBERS_KEY = 'encore.setNumbers';

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

let numbers: SetNumbers | null = null;

/** The set numbers for the records on hand (read once from storage, then kept in memory). */
export function loadSetNumbers(records: SetRecord[]): SetNumbers {
  if (numbers) return numbers;
  let stored: unknown = null;
  const store = local();
  if (store) {
    try {
      const raw = store.getItem(NUMBERS_KEY);
      stored = raw ? JSON.parse(raw) : null;
    } catch {
      stored = null;
    }
  }
  numbers = seedSetNumbers(stored, records);
  return numbers;
}

/** Number a set that just ended (the next number up), keeping only the numbers of the records still held. */
export function saveSetNumber(setId: string, records: SetRecord[]): SetNumbers {
  numbers = numberSet(
    loadSetNumbers(records.filter((r) => r.setId !== setId)),
    setId,
    records.map((r) => r.setId),
  );
  const store = local();
  if (store) {
    try {
      store.setItem(NUMBERS_KEY, JSON.stringify(numbers));
    } catch {
      // As for the records: memory keeps counting for this session.
    }
  }
  return numbers;
}
