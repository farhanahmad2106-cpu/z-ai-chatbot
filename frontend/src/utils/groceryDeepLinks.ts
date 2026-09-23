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

export interface GrocerySearchItem {
  id: string;
  rawName: string;
  sanitizedName: string;
  quantity?: string;
  department?: string;
  checked: boolean;
}

export interface ProviderConfig {
  id: QuickCommerceProvider;
  label: string;
  accentColor: string;
  accentBorder: string;
  buildSearchUrl: (query: string) => string;
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
    accentColor: 'text-purple-400',
    accentBorder: 'border-purple-500/40 hover:border-purple-400',
    buildSearchUrl: (query: string): string => {
      const q = query.trim();
      return q ? `https://www.zeptonow.com/search?query=${encodeURIComponent(q)}` : '';
    },
  },
  instamart: {
    id: 'instamart',
    label: 'Instamart',
    accentColor: 'text-orange-400',
    accentBorder: 'border-orange-500/40 hover:border-orange-400',
    buildSearchUrl: (query: string): string => {
      const q = query.trim();
      return q ? `https://www.swiggy.com/instamart/search?custom_back=true&query=${encodeURIComponent(q)}` : '';
    },
  },
};

/**
 * Known Indian grocery alias replacements (case-insensitive).
 * Mapped to standard shopping queries.
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
];

/**
 * Culinary preparation terms to remove when they are descriptors.
 * Note: Specific compound spices like "chilli powder", "turmeric powder", etc.,
 * are protected from stripping.
 */
const CULINARY_DESCRIPTORS: RegExp[] = [
  /\bfinely\s+chopped\b/gi,
  /\bcoarsely\s+chopped\b/gi,
  /\bchopped\b/gi,
  /\bdiced\b/gi,
  /\bsliced\b/gi,
  /\bminced\b/gi,
  /\bgrated\b/gi,
  /\bsteamed\b/gi,
  /\broasted\b/gi,
  /\bboiled\b/gi,
  /\bfried\b/gi,
  /\bfresh\b/gi,
  /\bpureed\b/gi,
  /\bpuréed\b/gi,
  /\bpuree\b/gi,
  /\bpurée\b/gi,
  /\bchutney\s+powder\b/gi,
];

/**
 * Protected spice powder names where "powder" represents an actual product.
 */
const PROTECTED_POWDER_REGEX = /\b(chilli|red chilli|kashmiri chilli|turmeric|coriander|cumin|garam masala|amchur|curry|sambar|rasam|baking|dry mango|mango|garlic|onion|ginger|cinnamon|cardamom|black pepper|white pepper|pepper)\s+powder\b/i;

/**
 * Metadata regexes: serving sizes, approx weights, optional tags, serving counts.
 */
const METADATA_PATTERNS: RegExp[] = [
  /\s*\(\s*(?:approx\.?\s*[\d.]+\s*(?:g|kg|ml|l|tbsp|tsp|cup|cups)?|[\d.]+\s*x\s*serving|serves?\s*\d+|for\s*\d+\s*people|optional|as\s+needed|to\s+taste|per\s+serving|scaled|for\s+cooking)\s*\)/gi,
  /\b(?:approx\.?\s*[\d.]+\s*(?:g|kg|ml|l|tbsp|tsp|cup|cups)?|[\d.]+\s*x\s*serving|serves?\s*\d+|for\s*\d+\s*people|optional)\b/gi,
  // Trailing quantity description like "- 2 kg" or "- 500 g"
  /\s*-\s*[\d.]+\s*(?:kg|g|gm|gms|grams|l|litre|litres|ml|tbsp|tsp|cups?|pieces?|bunch|packet|pack|can)?\s*$/gi,
];

/**
 * Formats a string to Title Case while respecting existing acronyms/proper casing.
 */
function normalizeTitleCase(str: string): string {
  return str
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      // If the word has non-Latin characters (e.g. Hindi), leave untouched
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
 * 2. Normalizes Indian grocery aliases (e.g. "Besan (Gram Flour)" -> "Besan")
 * 3. Strips meal-planning metadata (e.g. "(1.4x serving)", "(approx 150g)", "(optional)")
 * 4. Strips culinary preparation descriptors ("steamed", "roasted", "boiled", "finely chopped", etc.)
 * 5. Conserves legitimate grocery products containing "powder" ("chilli powder", "turmeric powder")
 * 6. Normalizes whitespace and removes stray punctuation.
 */
export function sanitizeIngredientForSearch(rawName: string | null | undefined): string {
  if (!rawName || typeof rawName !== 'string') {
    return '';
  }

  let text = rawName.trim();
  if (!text) {
    return '';
  }

  // 1. Collapse multiple whitespaces
  text = text.replace(/\s+/g, ' ');

  // 2. Apply Indian grocery alias rules
  for (const { pattern, replacement } of ALIAS_RULES) {
    if (pattern.test(text)) {
      text = text.replace(pattern, replacement);
    }
  }

  // 3. Remove serving, quantity, and meal-planning metadata
  for (const pattern of METADATA_PATTERNS) {
    text = text.replace(pattern, ' ');
  }

  // 4. Strip culinary preparation descriptors (preserving protected powders)
  const isProtectedPowder = PROTECTED_POWDER_REGEX.test(text);
  for (const descriptor of CULINARY_DESCRIPTORS) {
    text = text.replace(descriptor, ' ');
  }

  // 5. Clean stray punctuation (leading/trailing commas, dashes, slashes, brackets)
  text = text
    .replace(/^[\s,;:\-–—/()]+|[\s,;:\-–—/()]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!text) {
    return '';
  }

  // 6. Title-case formatting
  return isProtectedPowder ? normalizeTitleCase(text) : normalizeTitleCase(text);
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
 * Browser-safe window open with popup-blocker detection.
 * Returns true if window reference was accepted, false if blocked or failed.
 */
export function safeOpenProviderSearch(url: string): boolean {
  if (!url) return false;
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
