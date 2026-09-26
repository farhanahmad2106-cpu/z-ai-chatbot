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
  name: string;
  label: string;
  shortLabel: string;
}

export interface ProviderConfig extends QuickCommerceProviderConfig {
  accentColor: string;
  accentBorder: string;
  buildSearchUrl: (query: string) => string;
}

export interface GrocerySearchItem {
  name: string;
  quantity: string;
  searchName: string;
  checked: boolean;
  id?: string;
  rawName?: string;
  sanitizedName?: string;
  department?: string;
}

export type RunnerStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'blocked'
  | 'completed'
  | 'stopped';

export type RunnerState = RunnerStatus;
export type ItemRunnerStatus = 'pending' | 'opened' | 'blocked' | 'skipped';

export const DEFAULT_OPEN_DELAY_MS = 800;

/**
 * Strict allowlist of approved provider origins.
 */
export const ALLOWED_PROVIDER_ORIGINS = [
  'https://blinkit.com',
  'https://www.zeptonow.com',
  'https://www.swiggy.com',
] as const;

/**
 * Centralized Provider Configuration
 * Encodes query parameters and isolates provider search endpoints.
 */
export const PROVIDER_CONFIG: Record<QuickCommerceProvider, ProviderConfig> = {
  blinkit: {
    id: 'blinkit',
    name: 'Blinkit',
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
    name: 'Zepto',
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
    name: 'Swiggy Instamart',
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
 * Validates that a generated or provided search URL strictly conforms to approved provider origins and paths.
 */
export function isValidProviderUrl(url: string, expectedProvider?: QuickCommerceProvider): boolean {
  if (!url || typeof url !== 'string') return false;

  // Strict protocol/scheme check: Disallow javascript:, data:, blob:, or plain http:
  if (
    url.startsWith('javascript:') ||
    url.startsWith('data:') ||
    url.startsWith('blob:') ||
    url.startsWith('http://')
  ) {
    return false;
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;

    if (expectedProvider === 'blinkit') {
      return (
        parsed.origin === 'https://blinkit.com' &&
        parsed.pathname === '/s/' &&
        parsed.searchParams.has('q') &&
        Boolean(parsed.searchParams.get('q'))
      );
    }
    if (expectedProvider === 'zepto') {
      return (
        parsed.origin === 'https://www.zeptonow.com' &&
        parsed.pathname === '/search' &&
        parsed.searchParams.has('query') &&
        Boolean(parsed.searchParams.get('query'))
      );
    }
    if (expectedProvider === 'instamart') {
      return (
        parsed.origin === 'https://www.swiggy.com' &&
        parsed.pathname === '/instamart/search' &&
        parsed.searchParams.has('query') &&
        Boolean(parsed.searchParams.get('query'))
      );
    }

    // If expectedProvider is unspecified, test against any allowed origin and search path
    if (
      parsed.origin === 'https://blinkit.com' &&
      parsed.pathname === '/s/' &&
      parsed.searchParams.has('q') &&
      Boolean(parsed.searchParams.get('q'))
    ) {
      return true;
    }
    if (
      parsed.origin === 'https://www.zeptonow.com' &&
      parsed.pathname === '/search' &&
      parsed.searchParams.has('query') &&
      Boolean(parsed.searchParams.get('query'))
    ) {
      return true;
    }
    if (
      parsed.origin === 'https://www.swiggy.com' &&
      parsed.pathname === '/instamart/search' &&
      parsed.searchParams.has('query') &&
      Boolean(parsed.searchParams.get('query'))
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

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
  /(?:^|\s+)(?:ताज़ा|ताजा)(?=\s+|$)/gi,
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
  '(?:g|gm|gms|gram|grams|kg|kgs|kilo|kilos|kilogram|kilograms|mg|ml|l|litre|litres|liter|liters|tsp|tbsp|teaspoon|teaspoons|tablespoon|tablespoons|cup|cups|piece|pieces|pcs|pc|bunch|bunches|packet|packets|pack|packs|pinch|pinches|clove|cloves|can|cans|slice|slices|serving|servings|medium|large|small)';

/**
 * Fraction pattern supporting Unicode fractions and slash notation.
 */
const FRACTION_PATTERN = '(?:\\d+\\s+)?(?:\\d+\\/\\d+|[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])';

/**
 * Full number pattern including decimals and fractions.
 */
const NUM_PATTERN = '(?:\\d+\\s+)?(?:\\d+\\/\\d+|[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]|[\\d.]+)';

/**
 * Identifies if a parenthetical expression represents culinary noise, quantities, or servings
 * versus essential product variants (e.g. "(Unsweetened Almond)").
 */
function isNoiseParenthetical(content: string): boolean {
  const trimmed = content.trim().toLowerCase();
  if (!trimmed) return true;

  // 1. Serving multipliers: "1.4x serving", "2x serving", "1 serving", "serving"
  if (/^\d*(?:\.\d+)?x?\s*serving/i.test(trimmed)) return true;

  // 2. Quantities, weights, fractions, approx, or count modifiers: "2 medium", "approx 150g", "150g", "250 ml", "1/2 cup"
  if (
    /(?:approx\.?|approximately|\d|[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/i.test(trimmed) &&
    /(?:\d|[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]|approx|medium|large|small|g|kg|ml|l|cup|tbsp|tsp|piece|pieces|pc|pcs|clove|slice|bunch|packet)/i.test(trimmed)
  ) {
    return true;
  }

  // 3. Preparation instructions: "finely chopped", "steamed", "roasted", "boiled", "diced", "sliced", "minced"
  if (
    /^(?:finely\s+chopped|roughly\s+chopped|coarsely\s+chopped|chopped|diced|sliced|minced|crushed|mashed|pureed|puréed|grated|steamed|roasted|boiled|fried|grilled|baked|sautéed|sauteed|cooked|soaked|sprouted|peeled|deseeded)$/i.test(trimmed)
  ) {
    return true;
  }

  // 4. Usage / garnish / optional notes: "optional", "for garnish", "garnish", "to taste", "as needed"
  if (/^(?:optional|for\s+garnish|garnish|to\s+taste|as\s+needed)$/i.test(trimmed)) {
    return true;
  }

  // 5. Common count combinations: "2 medium", "1 small", "3 cloves"
  if (/^\d+\s*(?:medium|large|small|pieces?|pcs?|cups?|tbsp|tsp|cloves?|slices?)$/i.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Formats a string to Title Case while preserving non-Latin scripts (e.g. Devanagari)
 * and retaining punctuation/parentheses on product variants.
 */
function normalizeTitleCase(str: string): string {
  return str
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      // If the word contains non-Latin characters (e.g. Hindi), leave untouched
      if (!/^[a-zA-Z()\-',.%#+]+$/.test(word)) {
        return word;
      }
      return word.replace(/[a-zA-Z]+/g, (match) => {
        return match.charAt(0).toUpperCase() + match.slice(1).toLowerCase();
      });
    })
    .join(' ');
}

/**
 * Sanitizes a meal-planning ingredient description into a practical grocery-search query.
 *
 * Requirements:
 * 1. Deterministic & side-effect-free
 * 2. Safe handling for empty/null/undefined -> returns ""
 * 3. Normalizes unicode dashes, fractions, and quotes
 * 4. Applies Indian grocery aliases (e.g. "Besan (Gram Flour)" -> "Besan")
 * 5. Strips noise parentheticals while preserving essential product variants (e.g. "Milk (Unsweetened Almond)")
 * 6. Strips culinary descriptors ("finely chopped", "steamed", "roasted", etc.)
 * 7. Strips leading, dash-separated, and trailing quantities ("1/2 cup rice", "Tomato 150g")
 * 8. Normalizes culinary suffixes: "Turmeric Powder" -> "Turmeric", while keeping "Garam Masala" intact
 * 9. Normalizes whitespace, removes stray punctuation, and produces deterministic title case.
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

  // 3. Remove noise parentheticals while preserving essential product variants (e.g. "(Unsweetened Almond)")
  text = text.replace(/\s*\(([^)]+)\)\s*/g, (_, inner) => {
    if (isNoiseParenthetical(inner)) {
      return ' ';
    }
    return ` (${inner.trim()}) `;
  });

  // 4. Remove optional, taste, or garnish phrases
  text = text.replace(/\b(?:optional|for\s+garnish|garnish|as\s+needed|to\s+taste)\b/gi, ' ');

  // 5. Strip culinary preparation descriptors (e.g. "finely chopped", "roasted", "boiled", "diced", "ताज़ा")
  for (const descriptor of CULINARY_DESCRIPTORS) {
    text = text.replace(descriptor, ' ');
  }

  // 6. Remove dash-separated quantity clauses (e.g. " — 150g", " - 500 g", " - 2 kg")
  const dashQuantityRegex = new RegExp(
    `\\s*-\\s*(?:approx\\.?|approximately)?\\s*${NUM_PATTERN}\\s*${UNITS_PATTERN}?(?=[,\\s]|$)`,
    'gi'
  );
  text = text.replace(dashQuantityRegex, ' ');

  // 7. Remove leading quantities:
  // Must either be a fraction (e.g. "1/2 cup", "½ cup") OR a number followed by a unit (e.g. "1.5 kg wheat")
  // Ensures brand names like "100% Atta" or "7 Up" are never corrupted
  const leadingQuantityRegex = new RegExp(
    `^(?:approx\\.?|approximately)?\\s*(?:${FRACTION_PATTERN}\\s*${UNITS_PATTERN}?|\\d+(?:\\.\\d+)?\\s*${UNITS_PATTERN})\\s*(?:x\\s*serving)?\\s*(?:of\\s+)?`,
    'i'
  );
  text = text.replace(leadingQuantityRegex, ' ');

  // 8. Remove trailing quantities:
  // Must be either a dash-separated quantity ("Milk - 250 ml") OR preceded by whitespace with a unit/fraction ("Tomato 150g", "Rice 1 kg", "Rice 1/2 cup")
  // Guards against stripping trailing product numbers like "Grain #1"
  const trailingQuantityRegex = new RegExp(
    `(?:\\s*-\\s*(?:approx\\.?|approximately)?\\s*${NUM_PATTERN}\\s*${UNITS_PATTERN}?|\\s+(?:approx\\.?|approximately)?\\s*(?:${FRACTION_PATTERN}\\s*${UNITS_PATTERN}?|\\d+(?:\\.\\d+)?\\s*${UNITS_PATTERN}))\\s*$`,
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
  // Preserve closing bracket if opening bracket exists to keep "(Unsweetened Almond)" intact
  text = text.replace(/^[\s,;:\-–—/]+/, '');
  if (text.includes('(') && text.trim().endsWith(')')) {
    text = text.replace(/[\s,;:\-–—/]+$/, '');
  } else {
    text = text.replace(/[\s,;:\-–—/()]+$/, '');
  }
  text = text.replace(/\s{2,}/g, ' ').trim();

  // 11. Fallback safety: if text became empty, fallback to trimmed normalized input if letters exist
  if (!text) {
    const strippedRaw = normalizedRaw.replace(/\s*\([^)]*\)\s*/g, '').trim();
    if (!strippedRaw || !(/[a-zA-Z]/.test(strippedRaw) || /[\u0900-\u097F]/.test(strippedRaw))) {
      return '';
    }
    return normalizeTitleCase(strippedRaw);
  }

  // 12. Normalize casing
  return normalizeTitleCase(text);
}

/**
 * Generates quick-commerce deep links for all supported providers.
 * Strictly enforces that invalid or empty queries produce empty links.
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

  const blinkitUrl = PROVIDER_CONFIG.blinkit.buildSearchUrl(sanitizedName);
  const zeptoUrl = PROVIDER_CONFIG.zepto.buildSearchUrl(sanitizedName);
  const instamartUrl = PROVIDER_CONFIG.instamart.buildSearchUrl(sanitizedName);

  return {
    sanitizedName,
    blinkit: isValidProviderUrl(blinkitUrl, 'blinkit') ? blinkitUrl : '',
    zepto: isValidProviderUrl(zeptoUrl, 'zepto') ? zeptoUrl : '',
    instamart: isValidProviderUrl(instamartUrl, 'instamart') ? instamartUrl : '',
  };
}

/**
 * Deduplicates grocery items conservatively by sanitized search term.
 *
 * Rules:
 * - Search identity: normalized searchName
 * - Quantity: combines quantities if distinct, avoids lossy arithmetic
 * - Checked state: marked checked only when ALL source entries are checked
 */
export function deduplicateGroceryItems(
  items: Array<{
    name: string;
    quantity: string;
    checked?: boolean;
    id?: string;
    department?: string;
    searchName?: string;
    sanitizedName?: string;
    rawName?: string;
  }>
): GrocerySearchItem[] {
  const map = new Map<string, GrocerySearchItem>();

  for (const item of items) {
    const searchName = item.searchName || item.sanitizedName || sanitizeIngredientForSearch(item.name);
    const key = searchName.toLowerCase().trim();
    if (!key) continue;

    if (!map.has(key)) {
      map.set(key, {
        name: searchName || item.name,
        searchName,
        sanitizedName: searchName,
        rawName: item.rawName || item.name,
        quantity: item.quantity || '',
        checked: Boolean(item.checked),
        id: item.id || `item-${key.replace(/\s+/g, '-')}`,
        department: item.department,
      });
    } else {
      const existing = map.get(key)!;
      // Item is checked only when all source entries representing this search identity are checked
      const checked = existing.checked && Boolean(item.checked);
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
 * Contains sanitized search terms only, one per line, no quantities, no URLs, no duplicates.
 */
export function formatSearchListForClipboard(
  items: Array<{ searchName?: string; sanitizedName?: string; name?: string }>
): string {
  const seen = new Set<string>();
  const list: string[] = [];

  for (const item of items) {
    const term = (item.searchName || item.sanitizedName || item.name || '').trim();
    if (term && !seen.has(term.toLowerCase())) {
      seen.add(term.toLowerCase());
      list.push(term);
    }
  }

  return list.join('\n');
}

/**
 * Browser-safe window open with popup-blocker detection and approved domain enforcement.
 * Returns true if window reference was accepted, false if blocked or failed.
 */
export function safeOpenProviderSearch(url: string, provider?: QuickCommerceProvider): boolean {
  if (!url || !isValidProviderUrl(url, provider)) {
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
