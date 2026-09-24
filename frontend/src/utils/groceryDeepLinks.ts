/**
 * Quick-Commerce Grocery Search & Export Engine
 * Pure, typed utilities for sanitizing meal-plan grocery ingredients
 * and generating deep-link search queries for Indian quick-commerce providers
 * (Blinkit, Zepto, Swiggy Instamart).
 */

export type QuickCommerceProvider = 'blinkit' | 'zepto' | 'instamart';

export interface QuickCommerceLinks {
  blinkit: string;
  zepto: string;
  instamart: string;
  sanitizedName: string;
}

export interface QuickCommerceProviderConfig {
  id: QuickCommerceProvider;
  label: string;
  shortLabel: string;
}

export interface ProviderConfig extends QuickCommerceProviderConfig {
  accentColor: string;
  accentBorder: string;
  buildSearchUrl: (query: string) => string;
}

export interface GrocerySearchItem {
  id: string;
  rawName: string;
  sanitizedName: string;
  quantity?: string;
  department?: string;
  checked: boolean;
}

export type RunnerState = 'idle' | 'running' | 'paused' | 'blocked' | 'completed';
export type ItemRunnerStatus = 'pending' | 'opened' | 'blocked' | 'skipped';

export const DEFAULT_OPEN_DELAY_MS = 800;

/**
 * Centralized Provider Configuration
 * Encodes query parameters and isolates provider search endpoints.
 */
export const PROVIDER_CONFIG: Record<QuickCommerceProvider, ProviderConfig> = {
  blinkit: {
    id: 'blinkit',
    label: 'Blinkit',
    shortLabel: 'Blinkit',
    accentColor: 'text-amber-400',
    accentBorder: 'border-amber-500/40 hover:border-amber-400',
    buildSearchUrl: (query: string): string => {
      const q = query.trim();
      return q ? `https://blinkit.com/s/?q=${encodeURIComponent(q)}` : '';
    },
  },
  zepto: {
    id: 'zepto',
    label: 'Zepto',
    shortLabel: 'Zepto',
    accentColor: 'text-purple-400',
    accentBorder: 'border-purple-500/40 hover:border-purple-400',
    buildSearchUrl: (query: string): string => {
      const q = query.trim();
      return q ? `https://www.zeptonow.com/search?query=${encodeURIComponent(q)}` : '';
    },
  },
  instamart: {
    id: 'instamart',
    label: 'Swiggy Instamart',
    shortLabel: 'Instamart',
    accentColor: 'text-orange-400',
    accentBorder: 'border-orange-500/40 hover:border-orange-400',
    buildSearchUrl: (query: string): string => {
      const q = query.trim();
      return q ? `https://www.swiggy.com/instamart/search?custom_back=true&query=${encodeURIComponent(q)}` : '';
    },
  },
};

/**
 * Allowed base search URL prefixes for external link security review.
 */
const ALLOWED_URL_PREFIXES = [
  'https://blinkit.com/s/?q=',
  'https://www.zeptonow.com/search?query=',
  'https://www.swiggy.com/instamart/search?custom_back=true&query=',
];

/**
 * Known Indian grocery alias replacements (case-insensitive).
 * Mapped to concise Indian grocery-market search terms.
 */
interface AliasRule {
  pattern: RegExp;
  replacement: string;
}

const ALIAS_RULES: AliasRule[] = [
  { pattern: /\bbesan\s*\(\s*gram\s+flour\s*\)/i, replacement: 'Besan' },
  { pattern: /\bgram\s+flour\s*\(\s*besan\s*\)/i, replacement: 'Besan' },
  { pattern: /\bbroken\s+wheat\s*\(\s*dalia\s*\)/i, replacement: 'Dalia' },
  { pattern: /\bdalia\s*\(\s*broken\s+wheat\s*\)/i, replacement: 'Dalia' },
  { pattern: /\bkidney\s+beans\s*\(\s*rajma\s*\)/i, replacement: 'Rajma' },
  { pattern: /\brajma\s*\(\s*kidney\s+beans\s*\)/i, replacement: 'Rajma' },
  { pattern: /\bblack\s+chickpeas\s*\(\s*kala\s+chana\s*\)/i, replacement: 'Kala Chana' },
  { pattern: /\bkala\s+chana\s*\(\s*black\s+chickpeas\s*\)/i, replacement: 'Kala Chana' },
  { pattern: /\bcold[\s-]*pressed\s+mustard\s+oil\b/i, replacement: 'Mustard Oil' },
  // Standalone phrases where market term is preferred
  { pattern: /\bgram\s+flour\b/i, replacement: 'Besan' },
  { pattern: /\bbroken\s+wheat\b/i, replacement: 'Dalia' },
  { pattern: /\bkidney\s+beans\b/i, replacement: 'Rajma' },
  { pattern: /\bblack\s+chickpeas\b/i, replacement: 'Kala Chana' },
];

/**
 * Culinary preparation terms to remove when they are descriptors/modifiers.
 */
const CULINARY_DESCRIPTORS: RegExp[] = [
  /\bfinely\s+chopped\b/gi,
  /\bcoarsely\s+chopped\b/gi,
  /\broughly\s+chopped\b/gi,
  /\bfreshly\s+chopped\b/gi,
  /\bchopped\b/gi,
  /\bdiced\b/gi,
  /\bsliced\b/gi,
  /\bminced\b/gi,
  /\bcrushed\b/gi,
  /\bmashed\b/gi,
  /\bgrated\b/gi,
  /\bshredded\b/gi,
  /\bsteamed\b/gi,
  /\broasted\b/gi,
  /\bboiled\b/gi,
  /\bfried\b/gi,
  /\bgrilled\b/gi,
  /\bbaked\b/gi,
  /\bsautéed\b/gi,
  /\bsauteed\b/gi,
  /\bcooked\b/gi,
  /\bpureed\b/gi,
  /\bpuréed\b/gi,
  /\bpuree\b/gi,
  /\bpurée\b/gi,
  /\bsoaked\b/gi,
  /\bsprouted\b/gi,
  /\bpeeled\b/gi,
  /\bdeseeded\b/gi,
  /\bfresh\b/gi,
  /\bchutney\s+powder\b/gi,
];

/**
 * Protected grocery products containing "powder" or "masala" that must NOT be stripped.
 */
const PROTECTED_COMPOUND_REGEX = /\b(chilli|red chilli|kashmiri chilli|coriander|cumin|garam masala|amchur|curry|sambar|rasam|baking|dry mango|mango|garlic|onion|ginger|cinnamon|cardamom|black pepper|white pepper|pepper)\s+(powder|masala)\b/i;

/**
 * Units pattern matching common metric, imperial, culinary, and count measures.
 */
const UNITS_PATTERN =
  '(?:g|gm|gms|gram|grams|kg|kgs|kilo|kilos|kilogram|kilograms|mg|ml|l|litre|litres|liter|liters|tsp|tbsp|teaspoon|teaspoons|tablespoon|tablespoons|cup|cups|piece|pieces|pcs|pc|bunch|bunches|packet|packets|pack|packs|pinch|pinches|clove|cloves|can|cans|slice|slices|medium|large|small)';

/**
 * Fraction and number pattern supporting Unicode fractions and slash notation.
 * Note: Fractions (1/2) must appear before [\\d.]+ so that "1" is not eagerly consumed.
 */
const NUM_PATTERN = '(?:\\d+\\s+)?(?:\\d+\\/\\d+|[½⅓¼¾⅔⅛⅜⅝⅞]|[\\d.]+)';

/**
 * Formats a string to Title Case while preserving non-Latin scripts (e.g. Devanagari).
 */
function normalizeTitleCase(str: string): string {
  return str
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      // If the word contains non-Latin characters (e.g. Hindi), leave untouched
      if (!/^[a-zA-Z]+$/.test(word)) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Sanitizes a meal-planning ingredient description into a practical grocery-search query.
 *
 * Rules:
 * 1. Safe handling for empty/null/undefined -> returns ""
 * 2. Normalizes unicode dashes, fractions, and quotes
 * 3. Applies Indian grocery aliases (e.g. "Besan (Gram Flour)" -> "Besan")
 * 4. Strips meal-planning metadata: "(1.4x serving)", "(approx 150g)", "(optional)"
 * 5. Strips culinary descriptors ("finely chopped", "steamed", "roasted", etc.)
 * 6. Strips leading, dash-separated, and trailing quantities ("1/2 cup rice", "Tomato 150g")
 * 7. Normalizes culinary suffixes: "Turmeric Powder" -> "Turmeric", while keeping "Garam Masala" intact
 * 8. Normalizes whitespace, removes stray punctuation, and produces deterministic title case.
 */
export function sanitizeIngredientForSearch(rawName: string | null | undefined): string {
  if (!rawName || typeof rawName !== 'string') {
    return '';
  }

  // 1. Normalize unicode punctuation and quotes
  let text = rawName
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) {
    return '';
  }

  const normalizedRaw = text;

  // 2. Apply Indian grocery alias rules
  for (const { pattern, replacement } of ALIAS_RULES) {
    if (pattern.test(text)) {
      text = text.replace(pattern, replacement);
    }
  }

  // 3. Remove parenthetical metadata: e.g. "(1.4x serving)", "(approx 150g)", "(2 medium)", "(optional)", "(for garnish)"
  text = text.replace(/\s*\([^)]*\)\s*/g, ' ');

  // 4. Remove optional, taste, or garnish phrases
  text = text.replace(/\b(?:optional|for\s+garnish|garnish|as\s+needed|to\s+taste)\b/gi, ' ');

  // 5. Strip culinary preparation descriptors (e.g. "finely chopped", "roasted", "boiled", "diced")
  for (const descriptor of CULINARY_DESCRIPTORS) {
    text = text.replace(descriptor, ' ');
  }

  // 6. Remove dash-separated quantity clauses (e.g. " — 150g", " - 500 g", " - 2 kg")
  const dashQuantityRegex = new RegExp(
    `\\s*-\\s*(?:approx\\.?|approximately)?\\s*${NUM_PATTERN}\\s*${UNITS_PATTERN}?(?=[,\\s]|$)`,
    'gi'
  );
  text = text.replace(dashQuantityRegex, ' ');

  // 7. Remove leading quantities: e.g. "½ cup rice", "¼ tsp turmeric", "1/2 cup rice", "1.5 kg wheat", "2 medium onions"
  const leadingQuantityRegex = new RegExp(
    `^(?:approx\\.?|approximately)?\\s*${NUM_PATTERN}\\s*${UNITS_PATTERN}?\\s*(?:x\\s*serving)?\\s*(?:of\\s+)?`,
    'i'
  );
  text = text.replace(leadingQuantityRegex, ' ');

  // 8. Remove trailing quantities: e.g. "Tomato 150g", "Rice 1 kg", "Milk 250 ml", "Paneer - 500 g", "Rice — 500g"
  const trailingQuantityRegex = new RegExp(
    `(?:\\s*-\\s*)?(?:approx\\.?|approximately)?\\s*${NUM_PATTERN}\\s*${UNITS_PATTERN}?\\s*$`,
    'i'
  );
  text = text.replace(trailingQuantityRegex, ' ');

  // 9. Suffix normalization:
  // "Turmeric Powder" or "Haldi Powder" -> "Turmeric" / "Haldi"
  // Garam Masala and Baking Powder are protected by PROTECTED_COMPOUND_REGEX
  text = text.replace(/\b(turmeric|haldi)\s+powder\b/gi, '$1');

  // If a generic "powder" suffix remains on an unprotected term, strip it
  if (!PROTECTED_COMPOUND_REGEX.test(text)) {
    text = text.replace(/\bpowder\b/gi, ' ');
  }

  // 10. Clean stray punctuation (leading/trailing commas, dashes, slashes, brackets)
  text = text
    .replace(/^[\s,;:\-–—/()]+|[\s,;:\-–—/()]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // 11. Fallback safety: if text became empty, fallback to trimmed normalized input
  if (!text) {
    const strippedRaw = normalizedRaw.replace(/\s*\([^)]*\)\s*/g, '').trim();
    if (!strippedRaw || !/[a-zA-Z\u0900-\u097F]/.test(strippedRaw)) {
      return '';
    }
    return normalizeTitleCase(strippedRaw);
  }

  // 12. Normalize casing
  return normalizeTitleCase(text);
}

/**
 * Generates quick-commerce deep links for all supported providers.
 */
export function generateQuickCommerceLinks(rawName: string): QuickCommerceLinks {
  const sanitizedName = sanitizeIngredientForSearch(rawName);

  if (!sanitizedName) {
    return {
      sanitizedName: '',
      blinkit: '',
      zepto: '',
      instamart: '',
    };
  }

  return {
    sanitizedName,
    blinkit: PROVIDER_CONFIG.blinkit.buildSearchUrl(sanitizedName),
    zepto: PROVIDER_CONFIG.zepto.buildSearchUrl(sanitizedName),
    instamart: PROVIDER_CONFIG.instamart.buildSearchUrl(sanitizedName),
  };
}

/**
 * Deduplicates grocery items conservatively by sanitized search term.
 * Preserves quantity strings and combines them where sensible.
 */
export function deduplicateGroceryItems(items: GrocerySearchItem[]): GrocerySearchItem[] {
  const map = new Map<string, GrocerySearchItem>();

  for (const item of items) {
    const key = item.sanitizedName.toLowerCase().trim();
    if (!key) continue;

    if (!map.has(key)) {
      map.set(key, { ...item });
    } else {
      const existing = map.get(key)!;
      // If either item is unchecked, keep checked as false (still needed to buy)
      const checked = existing.checked && item.checked;
      let combinedQuantity = existing.quantity;

      if (item.quantity && existing.quantity && item.quantity !== existing.quantity) {
        combinedQuantity = `${existing.quantity} + ${item.quantity}`;
      } else if (item.quantity && !existing.quantity) {
        combinedQuantity = item.quantity;
      }

      map.set(key, {
        ...existing,
        checked,
        quantity: combinedQuantity,
      });
    }
  }

  return Array.from(map.values());
}

/**
 * Formats a unique list of sanitized search queries as newline-delimited text for clipboard.
 */
export function formatSearchListForClipboard(items: Array<{ sanitizedName: string }>): string {
  const seen = new Set<string>();
  const list: string[] = [];

  for (const item of items) {
    const name = item.sanitizedName.trim();
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      list.push(name);
    }
  }

  return list.join('\n');
}

/**
 * Browser-safe window open with popup-blocker detection and approved domain enforcement.
 * Returns true if window reference was accepted, false if blocked or failed.
 */
export function safeOpenProviderSearch(url: string): boolean {
  if (!url) return false;

  // Domain security verification: only approved provider URLs are allowed
  const isAllowedOrigin = ALLOWED_URL_PREFIXES.some((prefix) => url.startsWith(prefix));
  if (!isAllowedOrigin) {
    console.error('Blocked unsafe or unapproved search URL:', url);
    return false;
  }

  try {
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (!win || win.closed || typeof win.closed === 'undefined') {
      return false;
    }
    return true;
  } catch (err) {
    console.error('Safe window open error:', err);
    return false;
  }
}
