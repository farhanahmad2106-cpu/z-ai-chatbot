import { describe, it, expect } from 'vitest';
import {
  sanitizeIngredientForSearch,
  generateQuickCommerceLinks,
  deduplicateGroceryItems,
  formatSearchListForClipboard,
  PROVIDER_CONFIG,
  GrocerySearchItem,
} from './groceryDeepLinks';

describe('groceryDeepLinks - sanitizeIngredientForSearch', () => {
  it('normalizes Indian grocery aliases and removes serving metadata', () => {
    expect(sanitizeIngredientForSearch('Besan (Gram Flour) (1.4x serving)')).toBe('Besan');
    expect(sanitizeIngredientForSearch('Broken Wheat (Dalia) (approx 150g)')).toBe('Dalia');
    expect(sanitizeIngredientForSearch('Kidney Beans (Rajma) (2x serving)')).toBe('Rajma');
    expect(sanitizeIngredientForSearch('Black Chickpeas (Kala Chana)')).toBe('Kala Chana');
    expect(sanitizeIngredientForSearch('Cold-pressed mustard oil')).toBe('Mustard Oil');
  });

  it('handles case-insensitive alias matching', () => {
    expect(sanitizeIngredientForSearch('bEsAn (gRaM fLoUr)')).toBe('Besan');
    expect(sanitizeIngredientForSearch('kidney BEANS (rajma)')).toBe('Rajma');
    expect(sanitizeIngredientForSearch('cold-pressed MUSTARD OIL')).toBe('Mustard Oil');
    expect(sanitizeIngredientForSearch('broken wheat (DALIA)')).toBe('Dalia');
  });

  it('removes culinary preparation descriptors', () => {
    expect(sanitizeIngredientForSearch('finely chopped onions')).toBe('Onions');
    expect(sanitizeIngredientForSearch('coarsely chopped tomatoes')).toBe('Tomatoes');
    expect(sanitizeIngredientForSearch('steamed basmati rice')).toBe('Basmati Rice');
    expect(sanitizeIngredientForSearch('boiled chickpeas')).toBe('Chickpeas');
    expect(sanitizeIngredientForSearch('grated paneer')).toBe('Paneer');
    expect(sanitizeIngredientForSearch('roasted cumin seeds')).toBe('Cumin Seeds');
    expect(sanitizeIngredientForSearch('fresh coriander leaves')).toBe('Coriander Leaves');
    expect(sanitizeIngredientForSearch('minced garlic')).toBe('Garlic');
    expect(sanitizeIngredientForSearch('diced bell peppers')).toBe('Bell Peppers');
  });

  it('protects legitimate spice and grocery powder products', () => {
    expect(sanitizeIngredientForSearch('chilli powder')).toBe('Chilli Powder');
    expect(sanitizeIngredientForSearch('red chilli powder')).toBe('Red Chilli Powder');
    expect(sanitizeIngredientForSearch('turmeric powder')).toBe('Turmeric Powder');
    expect(sanitizeIngredientForSearch('coriander powder')).toBe('Coriander Powder');
    expect(sanitizeIngredientForSearch('garam masala powder')).toBe('Garam Masala Powder');
    expect(sanitizeIngredientForSearch('amchur powder')).toBe('Amchur Powder');
    expect(sanitizeIngredientForSearch('baking powder')).toBe('Baking Powder');
  });

  it('removes trailing quantity definitions while keeping ingredient name', () => {
    expect(sanitizeIngredientForSearch('Rice - 2 kg')).toBe('Rice');
    expect(sanitizeIngredientForSearch('Paneer - 500 g')).toBe('Paneer');
    expect(sanitizeIngredientForSearch('Milk - 1 litre')).toBe('Milk');
  });

  it('cleans whitespace, punctuation, and optional tags', () => {
    expect(sanitizeIngredientForSearch('   Paneer   ')).toBe('Paneer');
    expect(sanitizeIngredientForSearch('Tomato (optional)')).toBe('Tomato');
    expect(sanitizeIngredientForSearch('Green Chillies (to taste)')).toBe('Green Chillies');
    expect(sanitizeIngredientForSearch(' - Brown Rice, ')).toBe('Brown Rice');
  });

  it('safely handles empty, null, undefined, or metadata-only strings', () => {
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

describe('groceryDeepLinks - generateQuickCommerceLinks', () => {
  it('generates properly encoded search links for Blinkit, Zepto, and Instamart', () => {
    const links = generateQuickCommerceLinks('Besan (Gram Flour)');
    expect(links.sanitizedName).toBe('Besan');
    expect(links.blinkit).toBe('https://blinkit.com/s/?q=Besan');
    expect(links.zepto).toBe('https://www.zeptonow.com/search?query=Besan');
    expect(links.instamart).toBe('https://www.swiggy.com/instamart/search?custom_back=true&query=Besan');
  });

  it('properly URL-encodes special characters (&, +, spaces)', () => {
    const links = generateQuickCommerceLinks('Kala Chana & Rajma');
    expect(links.sanitizedName).toBe('Kala Chana & Rajma');
    expect(links.blinkit).toContain('Kala%20Chana%20%26%20Rajma');
    expect(links.zepto).toContain('Kala%20Chana%20%26%20Rajma');
    expect(links.instamart).toContain('Kala%20Chana%20%26%20Rajma');
  });

  it('returns empty links for empty/invalid inputs without producing bare queries', () => {
    const links = generateQuickCommerceLinks('');
    expect(links.sanitizedName).toBe('');
    expect(links.blinkit).toBe('');
    expect(links.zepto).toBe('');
    expect(links.instamart).toBe('');
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
