import { describe, it, expect, vi } from 'vitest';
import {
  sanitizeIngredientForSearch,
  generateQuickCommerceLinks,
  deduplicateGroceryItems,
  formatSearchListForClipboard,
  safeOpenProviderSearch,
  PROVIDER_CONFIG,
  GrocerySearchItem,
} from './groceryDeepLinks';

describe('groceryDeepLinks - sanitizeIngredientForSearch', () => {
  describe('Basic ingredients', () => {
    it('normalizes basic ingredient names', () => {
      expect(sanitizeIngredientForSearch('Tomato')).toBe('Tomato');
      expect(sanitizeIngredientForSearch('Onion')).toBe('Onion');
      expect(sanitizeIngredientForSearch('Rice')).toBe('Rice');
    });
  });

  describe('Alias normalization', () => {
    it('normalizes parenthesized and compound Indian grocery aliases', () => {
      expect(sanitizeIngredientForSearch('Besan (Gram Flour)')).toBe('Besan');
      expect(sanitizeIngredientForSearch('Broken Wheat (Dalia)')).toBe('Dalia');
      expect(sanitizeIngredientForSearch('Kidney Beans (Rajma)')).toBe('Rajma');
      expect(sanitizeIngredientForSearch('Black Chickpeas (Kala Chana)')).toBe('Kala Chana');
      expect(sanitizeIngredientForSearch('Cold-pressed mustard oil')).toBe('Mustard Oil');
    });

    it('normalizes standalone grocery aliases to concise market terms', () => {
      expect(sanitizeIngredientForSearch('Gram Flour')).toBe('Besan');
      expect(sanitizeIngredientForSearch('Broken Wheat')).toBe('Dalia');
      expect(sanitizeIngredientForSearch('Kidney Beans')).toBe('Rajma');
      expect(sanitizeIngredientForSearch('Black Chickpeas')).toBe('Kala Chana');
    });

    it('handles case-insensitive alias matching', () => {
      expect(sanitizeIngredientForSearch('bEsAn (gRaM fLoUr)')).toBe('Besan');
      expect(sanitizeIngredientForSearch('kidney BEANS (rajma)')).toBe('Rajma');
      expect(sanitizeIngredientForSearch('cold-pressed MUSTARD OIL')).toBe('Mustard Oil');
      expect(sanitizeIngredientForSearch('broken wheat (DALIA)')).toBe('Dalia');
    });
  });

  describe('Preparation noise', () => {
    it('removes culinary descriptors from ingredients', () => {
      expect(sanitizeIngredientForSearch('finely chopped onions')).toBe('Onions');
      expect(sanitizeIngredientForSearch('roasted peanuts')).toBe('Peanuts');
      expect(sanitizeIngredientForSearch('boiled chickpeas')).toBe('Chickpeas');
      expect(sanitizeIngredientForSearch('diced tomatoes')).toBe('Tomatoes');
      expect(sanitizeIngredientForSearch('grated carrot')).toBe('Carrot');
      expect(sanitizeIngredientForSearch('steamed basmati rice')).toBe('Basmati Rice');
      expect(sanitizeIngredientForSearch('minced garlic')).toBe('Garlic');
      expect(sanitizeIngredientForSearch('fresh coriander leaves')).toBe('Coriander Leaves');
    });
  });

  describe('Quantity and serving metadata', () => {
    it('removes inline, parenthetical, and trailing quantities', () => {
      expect(sanitizeIngredientForSearch('Tomato 150g')).toBe('Tomato');
      expect(sanitizeIngredientForSearch('Rice 1 kg')).toBe('Rice');
      expect(sanitizeIngredientForSearch('Milk 250 ml')).toBe('Milk');
      expect(sanitizeIngredientForSearch('Onion (2 medium)')).toBe('Onion');
      expect(sanitizeIngredientForSearch('Besan (1.4x serving)')).toBe('Besan');
      expect(sanitizeIngredientForSearch('Rice — 500g')).toBe('Rice');
      expect(sanitizeIngredientForSearch('Tomato (approx 150g)')).toBe('Tomato');
      expect(sanitizeIngredientForSearch('Milk - 250 ml')).toBe('Milk');
      expect(sanitizeIngredientForSearch('Paneer - 500 g')).toBe('Paneer');
    });
  });

  describe('Optional and garnish metadata', () => {
    it('removes optional tags and garnish phrases', () => {
      expect(sanitizeIngredientForSearch('Coriander (optional)')).toBe('Coriander');
      expect(sanitizeIngredientForSearch('Mint leaves (for garnish)')).toBe('Mint Leaves');
      expect(sanitizeIngredientForSearch('Salt to taste')).toBe('Salt');
      expect(sanitizeIngredientForSearch('Green Chillies (to taste)')).toBe('Green Chillies');
    });
  });

  describe('Unicode fractions & leading quantities', () => {
    it('handles unicode and slash fractions with units', () => {
      expect(sanitizeIngredientForSearch('½ cup rice')).toBe('Rice');
      expect(sanitizeIngredientForSearch('¼ tsp turmeric')).toBe('Turmeric');
      expect(sanitizeIngredientForSearch('1/2 cup rice')).toBe('Rice');
      expect(sanitizeIngredientForSearch('1/4 tsp turmeric')).toBe('Turmeric');
    });
  });

  describe('Culinary suffix normalization', () => {
    it('normalizes Turmeric Powder to Turmeric while preserving Garam Masala and Baking Powder', () => {
      expect(sanitizeIngredientForSearch('Turmeric Powder')).toBe('Turmeric');
      expect(sanitizeIngredientForSearch('Garam Masala')).toBe('Garam Masala');
      expect(sanitizeIngredientForSearch('Baking Powder')).toBe('Baking Powder');
      expect(sanitizeIngredientForSearch('Chilli Powder')).toBe('Chilli Powder');
      expect(sanitizeIngredientForSearch('Coriander Powder')).toBe('Coriander Powder');
    });
  });

  describe('Whitespace and formatting', () => {
    it('cleans excessive whitespace and punctuation', () => {
      expect(sanitizeIngredientForSearch('   Tomato    150g   ')).toBe('Tomato');
      expect(sanitizeIngredientForSearch(' - Brown Rice, ')).toBe('Brown Rice');
    });
  });

  describe('Empty input and safety', () => {
    it('safely handles empty, null, undefined, or metadata-only strings without throwing', () => {
      expect(sanitizeIngredientForSearch('')).toBe('');
      expect(sanitizeIngredientForSearch('   ')).toBe('');
      expect(sanitizeIngredientForSearch(null)).toBe('');
      expect(sanitizeIngredientForSearch(undefined)).toBe('');
      expect(sanitizeIngredientForSearch('(optional)')).toBe('');
      expect(sanitizeIngredientForSearch('(approx 150g)')).toBe('');
      expect(sanitizeIngredientForSearch('(2x serving)')).toBe('');
    });

    it('preserves non-Latin Unicode scripts (e.g. Devanagari)', () => {
      expect(sanitizeIngredientForSearch('मेथी')).toBe('मेथी');
    });
  });
});

describe('groceryDeepLinks - generateQuickCommerceLinks', () => {
  it('generates exact provider search URLs for Tomato', () => {
    const links = generateQuickCommerceLinks('Tomato');
    expect(links.sanitizedName).toBe('Tomato');
    expect(links.blinkit).toBe('https://blinkit.com/s/?q=Tomato');
    expect(links.zepto).toBe('https://www.zeptonow.com/search?query=Tomato');
    expect(links.instamart).toBe('https://www.swiggy.com/instamart/search?custom_back=true&query=Tomato');
  });

  it('properly URL-encodes special characters (&, spaces, quotes, ampersand)', () => {
    const links = generateQuickCommerceLinks('Kala Chana');
    expect(links.sanitizedName).toBe('Kala Chana');
    expect(links.blinkit).toBe('https://blinkit.com/s/?q=Kala%20Chana');
    expect(links.zepto).toBe('https://www.zeptonow.com/search?query=Kala%20Chana');
    expect(links.instamart).toBe('https://www.swiggy.com/instamart/search?custom_back=true&query=Kala%20Chana');

    const complex = generateQuickCommerceLinks('Ginger & Garlic');
    expect(complex.sanitizedName).toBe('Ginger & Garlic');
    expect(complex.blinkit).toContain('Ginger%20%26%20Garlic');
    expect(complex.zepto).toContain('Ginger%20%26%20Garlic');
    expect(complex.instamart).toContain('Ginger%20%26%20Garlic');
  });

  it('returns empty links for empty/invalid inputs without producing bare queries', () => {
    const links = generateQuickCommerceLinks('');
    expect(links.sanitizedName).toBe('');
    expect(links.blinkit).toBe('');
    expect(links.zepto).toBe('');
    expect(links.instamart).toBe('');
  });
});

describe('groceryDeepLinks - Invariants & Security', () => {
  it('is deterministic: produces identical outputs for multiple calls', () => {
    const query = 'Besan (Gram Flour) — 150g, finely chopped';
    const first = sanitizeIngredientForSearch(query);
    const second = sanitizeIngredientForSearch(query);
    const third = sanitizeIngredientForSearch(query);
    expect(first).toBe(second);
    expect(second).toBe(third);
    expect(first).toBe('Besan');
  });

  it('never throws for arbitrary malformed or adversarial strings', () => {
    const adversarial = [
      'javascript:alert(1)',
      '<script>alert("xss")</script>',
      '../../etc/passwd',
      '\x00\x01\x02\x03',
      '\\\\\\\\\\\\\\',
      'undefined',
      'null',
      'NaN',
      ' '.repeat(1000),
      '!@#$%^&*()_+{}:"<>?',
    ];

    for (const input of adversarial) {
      expect(() => sanitizeIngredientForSearch(input)).not.toThrow();
      expect(() => generateQuickCommerceLinks(input)).not.toThrow();
    }
  });

  it('safeOpenProviderSearch rejects non-whitelisted domains', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(safeOpenProviderSearch('https://evil.com/search?q=rice')).toBe(false);
    expect(safeOpenProviderSearch('javascript:alert(1)')).toBe(false);
    expect(safeOpenProviderSearch('http://blinkit.com.attacker.com')).toBe(false);
    consoleSpy.mockRestore();
  });
});

describe('groceryDeepLinks - deduplicateGroceryItems', () => {
  it('deduplicates identical sanitized search queries and combines quantities', () => {
    const items: GrocerySearchItem[] = [
      { id: '1', rawName: 'Tomato', sanitizedName: 'Tomato', quantity: '500 g', department: 'Produce', checked: false },
      { id: '2', rawName: 'Chopped Tomato', sanitizedName: 'Tomato', quantity: '250 g', department: 'Produce', checked: true },
      { id: '3', rawName: 'Basmati Rice', sanitizedName: 'Basmati Rice', quantity: '1 kg', department: 'Grains & Flours', checked: false },
    ];

    const deduplicated = deduplicateGroceryItems(items);
    expect(deduplicated.length).toBe(2);

    const tomato = deduplicated.find((i) => i.sanitizedName === 'Tomato');
    expect(tomato).toBeDefined();
    expect(tomato?.quantity).toBe('500 g + 250 g');
    // If one is unchecked (false), item remains unchecked overall
    expect(tomato?.checked).toBe(false);

    const rice = deduplicated.find((i) => i.sanitizedName === 'Basmati Rice');
    expect(rice).toBeDefined();
    expect(rice?.quantity).toBe('1 kg');
  });

  it('preserves distinct products conservatively', () => {
    const items: GrocerySearchItem[] = [
      { id: '1', rawName: 'Tomato', sanitizedName: 'Tomato', quantity: '500 g', checked: false },
      { id: '2', rawName: 'Cherry Tomato', sanitizedName: 'Cherry Tomato', quantity: '200 g', checked: false },
    ];

    const deduplicated = deduplicateGroceryItems(items);
    expect(deduplicated.length).toBe(2);
  });
});

describe('groceryDeepLinks - formatSearchListForClipboard', () => {
  it('formats unique non-empty items into newline-delimited string', () => {
    const list = [
      { sanitizedName: 'Tomato' },
      { sanitizedName: 'Rice' },
      { sanitizedName: 'Besan' },
      { sanitizedName: 'Rajma' },
      { sanitizedName: 'Tomato' }, // duplicate
    ];

    const formatted = formatSearchListForClipboard(list);
    expect(formatted).toBe('Tomato\nRice\nBesan\nRajma');
  });

  it('ignores empty entries', () => {
    const list = [{ sanitizedName: 'Paneer' }, { sanitizedName: '' }, { sanitizedName: 'Mustard Oil' }];
    expect(formatSearchListForClipboard(list)).toBe('Paneer\nMustard Oil');
  });
});

describe('groceryDeepLinks - PROVIDER_CONFIG', () => {
  it('contains valid search builders that encode queries', () => {
    expect(PROVIDER_CONFIG.blinkit.buildSearchUrl('Rice')).toBe('https://blinkit.com/s/?q=Rice');
    expect(PROVIDER_CONFIG.zepto.buildSearchUrl('Rice')).toBe('https://www.zeptonow.com/search?query=Rice');
    expect(PROVIDER_CONFIG.instamart.buildSearchUrl('Rice')).toBe(
      'https://www.swiggy.com/instamart/search?custom_back=true&query=Rice'
    );
  });

  it('returns empty string for blank queries in all providers', () => {
    expect(PROVIDER_CONFIG.blinkit.buildSearchUrl('   ')).toBe('');
    expect(PROVIDER_CONFIG.zepto.buildSearchUrl('   ')).toBe('');
    expect(PROVIDER_CONFIG.instamart.buildSearchUrl('   ')).toBe('');
  });

  it('has consistent labels and shortLabels', () => {
    expect(PROVIDER_CONFIG.blinkit.label).toBe('Blinkit');
    expect(PROVIDER_CONFIG.zepto.label).toBe('Zepto');
    expect(PROVIDER_CONFIG.instamart.shortLabel).toBe('Instamart');
  });
});
