import { MOTIVATIONAL_QUOTES, Quote } from './quotesData';

export interface QuoteRecord {
  displayCount: number; // 'i'
  lastShownTimestamp: number; // ms
  isSaved?: boolean;
}

export type QuoteHistoryMap = Record<string, QuoteRecord>;

const LOCAL_STORAGE_KEY = 'z_sehealth_quote_history';
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

export function getQuoteHistory(): QuoteHistoryMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error('Failed to load quote history', e);
    return {};
  }
}

export function saveQuoteHistory(history: QuoteHistoryMap): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(history));
  } catch (e) {
    console.error('Failed to save quote history', e);
  }
}

/**
 * Cooldown Formula:
 * When quote Q is displayed for the i-th time (i >= 1),
 * Cooldown Duration = 3 * i days (3 * i * 3 days in ms).
 * - 1st display (i=1): 3 * 1 = 3 days cooldown
 * - 2nd display (i=2): 3 * 2 = 6 days cooldown
 * - 3rd display (i=3): 3 * 3 = 9 days cooldown
 */
export function isQuoteEligible(quoteId: string, history: QuoteHistoryMap, now: number = Date.now()): boolean {
  const record = history[quoteId];
  if (!record || record.displayCount === 0) return true;

  const requiredCooldownMs = record.displayCount * THREE_DAYS_MS;
  const elapsedMs = now - record.lastShownTimestamp;
  return elapsedMs >= requiredCooldownMs;
}

export function getNextQuote(currentQuoteId?: string): { quote: Quote; record: QuoteRecord } {
  const history = getQuoteHistory();
  const now = Date.now();

  // 1. Filter candidates eligible based on (3 * i) days cooldown rule
  let eligible = MOTIVATIONAL_QUOTES.filter(
    q => q.id !== currentQuoteId && isQuoteEligible(q.id, history, now)
  );

  // 2. If no eligible quotes left (all on cooldown), select the quote shown longest ago
  if (eligible.length === 0) {
    eligible = MOTIVATIONAL_QUOTES.filter(q => q.id !== currentQuoteId);
    eligible.sort((a, b) => {
      const timeA = history[a.id]?.lastShownTimestamp || 0;
      const timeB = history[b.id]?.lastShownTimestamp || 0;
      return timeA - timeB;
    });
  } else {
    // Shuffle eligible quotes randomly
    eligible.sort(() => 0.5 - Math.random());
  }

  const selectedQuote = eligible[0] || MOTIVATIONAL_QUOTES[0];
  const record = history[selectedQuote.id] || { displayCount: 0, lastShownTimestamp: 0, isSaved: false };

  return { quote: selectedQuote, record };
}

export function markQuoteAsDisplayed(quoteId: string): QuoteHistoryMap {
  const history = getQuoteHistory();
  const existing = history[quoteId] || { displayCount: 0, lastShownTimestamp: 0, isSaved: false };

  const updatedRecord: QuoteRecord = {
    ...existing,
    displayCount: existing.displayCount + 1, // i = i + 1
    lastShownTimestamp: Date.now()
  };

  history[quoteId] = updatedRecord;
  saveQuoteHistory(history);
  return history;
}

export function toggleSaveQuote(quoteId: string): boolean {
  const history = getQuoteHistory();
  const existing = history[quoteId] || { displayCount: 0, lastShownTimestamp: 0, isSaved: false };
  const newSaved = !existing.isSaved;

  history[quoteId] = {
    ...existing,
    isSaved: newSaved
  };

  saveQuoteHistory(history);
  return newSaved;
}

export function getSavedQuotes(): Quote[] {
  const history = getQuoteHistory();
  return MOTIVATIONAL_QUOTES.filter(q => history[q.id]?.isSaved);
}
