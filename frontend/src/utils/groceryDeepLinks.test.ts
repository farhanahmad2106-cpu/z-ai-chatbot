import { describe, it, expect, vi } from 'vitest';
import {
  sanitizeIngredientForSearch,
  generateQuickCommerceLinks,
  deduplicateGroceryItems,
  formatSearchListForClipboard,
  safeOpenProviderSearch,
  isValidProviderUrl,
  PROVIDER_CONFIG,
  GrocerySearchItem,
} from './groceryDeepLinks';

describe('groceryDeepLinks - Section 47: Required Sanitizer Tests', () => {
  it('normalizes basic whitespace: "  Tomato  " -> "Tomato"', () => {
    expect(sanitizeIngredientForSearch('  Tomato  ')).toBe('Tomato');
    expect(sanitizeIngredientForSearch('  Tomato    fresh   ')).toBe('Tomato');
  });

  it('removes preparation descriptor: "finely chopped Tomato" -> "Tomato"', () => {
    expect(sanitizeIngredientForSearch('finely chopped Tomato')).toBe('Tomato');
    expect(sanitizeIngredientForSearch('Tomato, diced')).toBe('Tomato');
    expect(sanitizeIngredientForSearch('Fresh Tomato')).toBe('Tomato');
    expect(sanitizeIngredientForSearch('steamed basmati rice')).toBe('Basmati Rice');
    expect(sanitizeIngredientForSearch('roasted peanuts')).toBe('Peanuts');
    expect(sanitizeIngredientForSearch('boiled chickpeas')).toBe('Chickpeas');
  });

  it('normalizes unicode dash: "Milk – 250 ml" -> "Milk"', () => {
    expect(sanitizeIngredientForSearch('Milk – 250 ml')).toBe('Milk');
    expect(sanitizeIngredientForSearch('Rice — 500g')).toBe('Rice');
  });

  it('normalizes unicode fraction: "½ cup rice" -> "Rice"', () => {
    expect(sanitizeIngredientForSearch('½ cup rice')).toBe('Rice');
    expect(sanitizeIngredientForSearch('¼ tsp turmeric')).toBe('Turmeric');
    expect(sanitizeIngredientForSearch('Rice ½ cup')).toBe('Rice');
  });

  it('normalizes ASCII fraction: "1/2 cup rice" -> "Rice"', () => {
    expect(sanitizeIngredientForSearch('1/2 cup rice')).toBe('Rice');
    expect(sanitizeIngredientForSearch('1/4 tsp turmeric')).toBe('Turmeric');
    expect(sanitizeIngredientForSearch('Rice 1/2 cup')).toBe('Rice');
  });

  it('removes parenthetical quantity: "Banana (2 medium)" -> "Banana"', () => {
    expect(sanitizeIngredientForSearch('Banana (2 medium)')).toBe('Banana');
  });

  it('removes serving multiplier: "Oats (1.4x serving)" -> "Oats"', () => {
    expect(sanitizeIngredientForSearch('Oats (1.4x serving)')).toBe('Oats');
  });

  it('removes approximate weight: "Spinach (approx 150g)" -> "Spinach"', () => {
    expect(sanitizeIngredientForSearch('Spinach (approx 150g)')).toBe('Spinach');
  });

  it('removes trailing quantity: "Tomato 150g" -> "Tomato"', () => {
    expect(sanitizeIngredientForSearch('Tomato 150g')).toBe('Tomato');
    expect(sanitizeIngredientForSearch('Rice 1 kg')).toBe('Rice');
  });

  it('removes dash-separated quantity: "Milk - 250 ml" -> "Milk"', () => {
    expect(sanitizeIngredientForSearch('Milk - 250 ml')).toBe('Milk');
    expect(sanitizeIngredientForSearch('Paneer - 500 g')).toBe('Paneer');
  });
});

describe('groceryDeepLinks - Section 13: Parenthetical Variant Preservation', () => {
  it('preserves essential product variant: "Milk (Unsweetened Almond)" -> "Milk (Unsweetened Almond)"', () => {
    expect(sanitizeIngredientForSearch('Milk (Unsweetened Almond)')).toBe('Milk (Unsweetened Almond)');
  });

  it('removes noise parentheticals while preserving product identities', () => {
    expect(sanitizeIngredientForSearch('Coriander (optional)')).toBe('Coriander');
    expect(sanitizeIngredientForSearch('Mint leaves (for garnish)')).toBe('Mint Leaves');
    expect(sanitizeIngredientForSearch('Salt to taste')).toBe('Salt');
  });
});

describe('groceryDeepLinks - Section 48: Required Indian Culinary Aliases', () => {
  it('normalizes Besan (Gram Flour) -> Besan', () => {
    expect(sanitizeIngredientForSearch('Besan (Gram Flour)')).toBe('Besan');
    expect(sanitizeIngredientForSearch('Gram Flour (Besan)')).toBe('Besan');
    expect(sanitizeIngredientForSearch('Gram Flour')).toBe('Besan');
  });

  it('normalizes Broken Wheat (Dalia) -> Dalia', () => {
    expect(sanitizeIngredientForSearch('Broken Wheat (Dalia)')).toBe('Dalia');
    expect(sanitizeIngredientForSearch('Dalia (Broken Wheat)')).toBe('Dalia');
    expect(sanitizeIngredientForSearch('Broken Wheat')).toBe('Dalia');
  });

  it('normalizes Kidney Beans (Rajma) -> Rajma', () => {
    expect(sanitizeIngredientForSearch('Kidney Beans (Rajma)')).toBe('Rajma');
    expect(sanitizeIngredientForSearch('Rajma (Kidney Beans)')).toBe('Rajma');
    expect(sanitizeIngredientForSearch('Kidney Beans')).toBe('Rajma');
  });

  it('normalizes Black Chickpeas (Kala Chana) -> Kala Chana', () => {
    expect(sanitizeIngredientForSearch('Black Chickpeas (Kala Chana)')).toBe('Kala Chana');
    expect(sanitizeIngredientForSearch('Kala Chana (Black Chickpeas)')).toBe('Kala Chana');
    expect(sanitizeIngredientForSearch('Black Chickpeas')).toBe('Kala Chana');
  });

  it('normalizes Cold-pressed mustard oil -> Mustard Oil', () => {
    expect(sanitizeIngredientForSearch('Cold-pressed mustard oil')).toBe('Mustard Oil');
    expect(sanitizeIngredientForSearch('cold-pressed MUSTARD OIL')).toBe('Mustard Oil');
  });
});

describe('groceryDeepLinks - Section 49: Unicode Tests', () => {
  it('preserves non-Latin Unicode scripts: मेथी remains valid and uncorrupted', () => {
    expect(sanitizeIngredientForSearch('मेथी')).toBe('मेथी');
    expect(sanitizeIngredientForSearch('  मेथी  ')).toBe('मेथी');
    expect(sanitizeIngredientForSearch('ताज़ा मेथी (approx 100g)')).toContain('मेथी');
  });
});

describe('groceryDeepLinks - Section 50: URL Encoding Tests', () => {
  it('generates exact provider URLs with expected hosts', () => {
    const links = generateQuickCommerceLinks('Tomato');
    expect(links.blinkit).toBe('https://blinkit.com/s/?q=Tomato');
    expect(links.zepto).toBe('https://www.zeptonow.com/search?query=Tomato');
    expect(links.instamart).toBe('https://www.swiggy.com/instamart/search?custom_back=true&query=Tomato');
  });

  it('encodes special characters (&, +, /, %, #) exactly once and guards against double encoding', () => {
    const specialLinks = generateQuickCommerceLinks('Ginger & Garlic');
    expect(specialLinks.blinkit).toContain('Ginger%20%26%20Garlic');
    expect(specialLinks.blinkit).not.toContain('%2520'); // no double encoding
    expect(specialLinks.blinkit).not.toContain('%2526');

    const plusLinks = generateQuickCommerceLinks('Salt + Pepper');
    expect(plusLinks.zepto).toContain('Salt%20%2B%20Pepper');
    expect(plusLinks.zepto).not.toContain('%252B');

    const percentLinks = generateQuickCommerceLinks('100% Atta');
    expect(percentLinks.instamart).toContain('100%25%20Atta');
    expect(percentLinks.instamart).not.toContain('%2525');

    const hashLinks = generateQuickCommerceLinks('Grain #1');
    expect(hashLinks.blinkit).toContain('Grain%20%231');
    expect(hashLinks.blinkit).not.toContain('%2523');
  });

  it('properly encodes non-Latin Unicode in URLs', () => {
    const links = generateQuickCommerceLinks('मेथी');
    expect(links.sanitizedName).toBe('मेथी');
    expect(links.blinkit).toContain(encodeURIComponent('मेथी'));
    expect(links.zepto).toContain(encodeURIComponent('मेथी'));
    expect(links.instamart).toContain(encodeURIComponent('मेथी'));
  });
});

describe('groceryDeepLinks - Section 51: Provider Security Tests', () => {
  it('accepts only the three supported provider hosts', () => {
    expect(isValidProviderUrl('https://blinkit.com/s/?q=Tomato', 'blinkit')).toBe(true);
    expect(isValidProviderUrl('https://www.zeptonow.com/search?query=Tomato', 'zepto')).toBe(true);
    expect(isValidProviderUrl('https://www.swiggy.com/instamart/search?custom_back=true&query=Tomato', 'instamart')).toBe(true);
  });

  it('rejects arbitrary domains and spoofed subdomains', () => {
    expect(isValidProviderUrl('https://evil.com/s/?q=Tomato')).toBe(false);
    expect(isValidProviderUrl('https://blinkit.com.attacker.com/s/?q=Tomato')).toBe(false);
    expect(isValidProviderUrl('https://www.zeptonow.com.attacker.com/search?query=Tomato')).toBe(false);
    expect(isValidProviderUrl('https://www.swiggy.com.attacker.com/instamart/search?query=Tomato')).toBe(false);
  });

  it('rejects plain HTTP URLs', () => {
    expect(isValidProviderUrl('http://blinkit.com/s/?q=Tomato')).toBe(false);
    expect(isValidProviderUrl('http://www.zeptonow.com/search?query=Tomato')).toBe(false);
  });

  it('rejects dangerous protocols (javascript:, data:, blob:)', () => {
    expect(isValidProviderUrl('javascript:alert(1)')).toBe(false);
    expect(isValidProviderUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isValidProviderUrl('blob:https://blinkit.com/123')).toBe(false);
  });

  it('rejects empty queries and does not generate usable URLs', () => {
    const emptyLinks = generateQuickCommerceLinks('');
    expect(emptyLinks.sanitizedName).toBe('');
    expect(emptyLinks.blinkit).toBe('');
    expect(emptyLinks.zepto).toBe('');
    expect(emptyLinks.instamart).toBe('');

    const spaceLinks = generateQuickCommerceLinks('   ');
    expect(spaceLinks.sanitizedName).toBe('');
    expect(spaceLinks.blinkit).toBe('');
    expect(spaceLinks.zepto).toBe('');
    expect(spaceLinks.instamart).toBe('');
  });

  it('safeOpenProviderSearch rejects unapproved domains and dangerous schemes', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(safeOpenProviderSearch('https://evil.com/search?q=rice')).toBe(false);
    expect(safeOpenProviderSearch('javascript:alert(1)')).toBe(false);
    expect(safeOpenProviderSearch('http://blinkit.com/s/?q=rice')).toBe(false);
    consoleSpy.mockRestore();
  });
});

describe('groceryDeepLinks - Section 52: Deduplication Tests', () => {
  it('collapses "Fresh Tomato", "Tomato 150g", and "Tomato, diced" into one search identity', () => {
    const rawItems = [
      { name: 'Fresh Tomato', quantity: '500 g', checked: false },
      { name: 'Tomato 150g', quantity: '150 g', checked: true },
      { name: 'Tomato, diced', quantity: '200 g', checked: false },
    ];

    const deduplicated = deduplicateGroceryItems(rawItems);
    expect(deduplicated.length).toBe(1);
    expect(deduplicated[0].searchName).toBe('Tomato');
    expect(deduplicated[0].quantity).toBe('500 g + 150 g + 200 g');
    // Checked only when ALL source entries are checked
    expect(deduplicated[0].checked).toBe(false);
  });

  it('treats deduplicated item as checked only when all source entries are checked', () => {
    const allChecked = [
      { name: 'Tomato', quantity: '500 g', checked: true },
      { name: 'Fresh Tomato', quantity: '250 g', checked: true },
    ];
    const res1 = deduplicateGroceryItems(allChecked);
    expect(res1.length).toBe(1);
    expect(res1[0].checked).toBe(true);

    const mixed = [
      { name: 'Tomato', quantity: '500 g', checked: true },
      { name: 'Fresh Tomato', quantity: '250 g', checked: false },
    ];
    const res2 = deduplicateGroceryItems(mixed);
    expect(res2.length).toBe(1);
    expect(res2[0].checked).toBe(false);

    const allUnchecked = [
      { name: 'Tomato', quantity: '500 g', checked: false },
      { name: 'Fresh Tomato', quantity: '250 g', checked: false },
    ];
    const res3 = deduplicateGroceryItems(allUnchecked);
    expect(res3.length).toBe(1);
    expect(res3[0].checked).toBe(false);
  });

  it('handles empty input and Unicode names safely', () => {
    expect(deduplicateGroceryItems([])).toEqual([]);

    const unicodeItems = [
      { name: 'मेथी 100g', quantity: '100 g', checked: false },
      { name: 'ताज़ा मेथी', quantity: '200 g', checked: false },
    ];
    const deduplicated = deduplicateGroceryItems(unicodeItems);
    expect(deduplicated.length).toBe(1);
    expect(deduplicated[0].searchName).toBe('मेथी');
  });

  it('preserves distinct products conservatively', () => {
    const items = [
      { name: 'Tomato', quantity: '500 g', checked: false },
      { name: 'Cherry Tomato', quantity: '200 g', checked: false },
    ];
    const deduplicated = deduplicateGroceryItems(items);
    expect(deduplicated.length).toBe(2);
  });
});

describe('groceryDeepLinks - Section 53: Independent Link Generation Tests', () => {
  it('generates Blinkit, Zepto, and Instamart links independently for Tomato', () => {
    const links = generateQuickCommerceLinks('Tomato');
    expect(links.sanitizedName).toBe('Tomato');
    expect(links.blinkit).toBe('https://blinkit.com/s/?q=Tomato');
    expect(links.zepto).toBe('https://www.zeptonow.com/search?query=Tomato');
    expect(links.instamart).toBe('https://www.swiggy.com/instamart/search?custom_back=true&query=Tomato');
  });
});

describe('groceryDeepLinks - Section 27: Clipboard Export Formatting', () => {
  it('formats unique non-empty sanitized terms into newline-delimited text without quantities or markdown', () => {
    const items = [
      { searchName: 'Tomato' },
      { searchName: 'Rice' },
      { searchName: 'Besan' },
      { searchName: 'Rajma' },
      { searchName: 'Tomato' }, // duplicate
    ];

    const formatted = formatSearchListForClipboard(items);
    expect(formatted).toBe('Tomato\nRice\nBesan\nRajma');
  });

  it('filters empty or blank terms', () => {
    const items = [{ searchName: 'Paneer' }, { searchName: '' }, { searchName: 'Mustard Oil' }];
    expect(formatSearchListForClipboard(items)).toBe('Paneer\nMustard Oil');
  });
});

describe('groceryDeepLinks - Invariants & Safety', () => {
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

  it('normalizes culinary suffixes: Turmeric Powder to Turmeric while preserving Garam Masala', () => {
    expect(sanitizeIngredientForSearch('Turmeric Powder')).toBe('Turmeric');
    expect(sanitizeIngredientForSearch('Garam Masala')).toBe('Garam Masala');
    expect(sanitizeIngredientForSearch('Baking Powder')).toBe('Baking Powder');
    expect(sanitizeIngredientForSearch('Chilli Powder')).toBe('Chilli Powder');
    expect(sanitizeIngredientForSearch('Coriander Powder')).toBe('Coriander Powder');
  });
});

describe('groceryDeepLinks - Section 6: Provider Type Contract & Config', () => {
  it('implements centralized strongly-typed provider configuration', () => {
    expect(PROVIDER_CONFIG.blinkit.id).toBe('blinkit');
    expect(PROVIDER_CONFIG.blinkit.name).toBe('Blinkit');
    expect(PROVIDER_CONFIG.zepto.id).toBe('zepto');
    expect(PROVIDER_CONFIG.zepto.name).toBe('Zepto');
    expect(PROVIDER_CONFIG.instamart.id).toBe('instamart');
    expect(PROVIDER_CONFIG.instamart.name).toBe('Swiggy Instamart');
  });

  it('correctly maps GrocerySearchItem interface', () => {
    const item: GrocerySearchItem = {
      name: 'Tomato',
      quantity: '500 g',
      searchName: 'Tomato',
      checked: false,
    };
    expect(item.name).toBe('Tomato');
    expect(item.searchName).toBe('Tomato');
    expect(item.quantity).toBe('500 g');
    expect(item.checked).toBe(false);
  });
});

