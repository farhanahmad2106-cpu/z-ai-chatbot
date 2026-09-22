export type LegalSlug = 'privacy' | 'terms' | 'refund' | 'cookies';

export interface LegalDocumentConfig {
  slug: LegalSlug;
  title: string;
  source: string;
  pageTitle: string;
  description: string;
}

export const LEGAL_DOCUMENTS: Record<LegalSlug, LegalDocumentConfig> = {
  privacy: {
    slug: 'privacy',
    title: 'Privacy Policy',
    source: '/legal/PRIVACY_POLICY.md',
    pageTitle: 'Privacy Policy | Z-SeHealth',
    description: 'Privacy Policy and DPDP Act (2023) alignment for Z-SeHealth.',
  },
  terms: {
    slug: 'terms',
    title: 'Terms of Service',
    source: '/legal/TERMS_OF_SERVICE.md',
    pageTitle: 'Terms of Service | Z-SeHealth',
    description: 'Terms of Service, Medical Disclaimer, and Acceptable Use Policy for Z-SeHealth.',
  },
  refund: {
    slug: 'refund',
    title: 'Refund & Cancellation Policy',
    source: '/legal/REFUND_POLICY.md',
    pageTitle: 'Refund & Cancellation Policy | Z-SeHealth',
    description: 'Refund, Cancellation, and Subscription Billing Policy for Z-SeHealth.',
  },
  cookies: {
    slug: 'cookies',
    title: 'Cookie & HTML5 Storage Policy',
    source: '/legal/COOKIE_POLICY.md',
    pageTitle: 'Cookie & HTML5 Storage Policy | Z-SeHealth',
    description: 'Cookie, LocalStorage, and client caching mechanisms inventory for Z-SeHealth.',
  },
};

export const LEGAL_SLUGS: LegalSlug[] = ['privacy', 'terms', 'refund', 'cookies'];

export function isLegalSlug(slug: string): slug is LegalSlug {
  return LEGAL_SLUGS.includes(slug as LegalSlug);
}

export function getLegalDocument(slug: string): LegalDocumentConfig {
  if (isLegalSlug(slug)) {
    return LEGAL_DOCUMENTS[slug];
  }
  return LEGAL_DOCUMENTS.privacy;
}
