import { describe, it, expect } from 'vitest';
import { 
  LEGAL_DOCUMENTS, 
  LEGAL_SLUGS, 
  getLegalDocument, 
  isLegalSlug 
} from './legal';

describe('Legal Documents Configuration', () => {
  it('defines the 4 required legal routes and slugs', () => {
    expect(LEGAL_SLUGS).toEqual(['privacy', 'terms', 'refund', 'cookies']);
  });

  it('correctly maps each route to the authoritative markdown source', () => {
    expect(LEGAL_DOCUMENTS.privacy.source).toBe('/legal/PRIVACY_POLICY.md');
    expect(LEGAL_DOCUMENTS.terms.source).toBe('/legal/TERMS_OF_SERVICE.md');
    expect(LEGAL_DOCUMENTS.refund.source).toBe('/legal/REFUND_POLICY.md');
    expect(LEGAL_DOCUMENTS.cookies.source).toBe('/legal/COOKIE_POLICY.md');
  });

  it('correctly maps titles and SEO page titles', () => {
    expect(LEGAL_DOCUMENTS.privacy.pageTitle).toBe('Privacy Policy | Z-SeHealth');
    expect(LEGAL_DOCUMENTS.terms.pageTitle).toBe('Terms of Service | Z-SeHealth');
    expect(LEGAL_DOCUMENTS.refund.pageTitle).toBe('Refund & Cancellation Policy | Z-SeHealth');
    expect(LEGAL_DOCUMENTS.cookies.pageTitle).toBe('Cookie & HTML5 Storage Policy | Z-SeHealth');
  });

  it('validates legal slug correctly', () => {
    expect(isLegalSlug('privacy')).toBe(true);
    expect(isLegalSlug('terms')).toBe(true);
    expect(isLegalSlug('refund')).toBe(true);
    expect(isLegalSlug('cookies')).toBe(true);
    expect(isLegalSlug('invalid')).toBe(false);
  });

  it('retrieves document configuration or defaults safely to privacy', () => {
    const doc = getLegalDocument('refund');
    expect(doc.title).toBe('Refund & Cancellation Policy');

    const fallback = getLegalDocument('unknown');
    expect(fallback.slug).toBe('privacy');
  });
});
