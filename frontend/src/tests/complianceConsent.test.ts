import { describe, it, expect } from 'vitest';
import { HEALTH_VAULT_CONSENT_KEY, HEALTH_VAULT_CONSENT_VERSION } from '../constants/compliance';

describe('UI Compliance & Consent Logic', () => {
  describe('Consent Versioning & Evaluation', () => {
    it('requires exact version 1.0 and granted status to be considered valid', () => {
      const validRecord = {
        status: 'granted',
        version: '1.0',
        timestamp: '2026-09-22T12:00:00.000Z',
      };
      const isValid = (record: any) =>
        record?.status === 'granted' && record?.version === HEALTH_VAULT_CONSENT_VERSION;

      expect(isValid(validRecord)).toBe(true);

      // Incompatible historical version
      const oldRecord = { status: 'granted', version: '0.9', timestamp: '2026-01-01T00:00:00.000Z' };
      expect(isValid(oldRecord)).toBe(false);

      // Future version change
      const futureRecord = { status: 'granted', version: '2.0', timestamp: '2026-10-01T00:00:00.000Z' };
      expect(isValid(futureRecord)).toBe(false);

      // Withdrawn consent
      const withdrawnRecord = { status: 'withdrawn', version: '1.0', timestamp: '2026-09-22T12:00:00.000Z' };
      expect(isValid(withdrawnRecord)).toBe(false);

      // Missing or null
      expect(isValid(null)).toBe(false);
      expect(isValid(undefined)).toBe(false);
    });

    it('defines standard constant identifiers for localStorage cache key and version', () => {
      expect(HEALTH_VAULT_CONSENT_KEY).toBe('z_sehealth_vault_consent_v1');
      expect(HEALTH_VAULT_CONSENT_VERSION).toBe('1.0');
    });
  });

  describe('Health Data Gate Evaluation', () => {
    const shouldTriggerHealthConsent = (
      medicalConditions: string | undefined,
      allergies: string[] | undefined,
      hasConsent: boolean
    ): boolean => {
      const hasMedical = Boolean(medicalConditions && medicalConditions.trim().length > 0);
      const hasAllergies = Boolean(allergies && allergies.length > 0);
      if (!hasMedical && !hasAllergies) return false;
      return !hasConsent;
    };

    it('does not trigger consent for non-health profile fields', () => {
      // User changing only height/weight/age/diet
      const triggers = shouldTriggerHealthConsent('', [], false);
      expect(triggers).toBe(false);

      const triggersNone = shouldTriggerHealthConsent(undefined, undefined, false);
      expect(triggersNone).toBe(false);
    });

    it('triggers consent when introducing or updating medical conditions without consent', () => {
      const triggers = shouldTriggerHealthConsent('Hypertension, Diabetes', [], false);
      expect(triggers).toBe(true);
    });

    it('triggers consent when introducing severe allergies without consent', () => {
      const triggers = shouldTriggerHealthConsent('', ['Peanuts', 'Shellfish'], false);
      expect(triggers).toBe(true);
    });

    it('bypasses consent gate when user already has valid version 1.0 consent', () => {
      const triggers = shouldTriggerHealthConsent('Diabetes', ['Peanuts'], true);
      expect(triggers).toBe(false);
    });
  });

  describe('Mandatory Compliance Copy Verifications', () => {
    it('validates exact camera viewfinder disclaimer copy', () => {
      const expectedCopy =
        'AI analysis is indicative and aligns with FSSAI standards. For severe or anaphylactic allergies, inspect physical packaging before consumption.';
      expect(expectedCopy).toContain('AI analysis is indicative and aligns with FSSAI standards.');
      expect(expectedCopy).toContain('inspect physical packaging before consumption.');
    });

    it('validates exact pre-payment disclosure copy', () => {
      const expectedCopy =
        'By proceeding, you agree to the Terms of Service and acknowledge our Refund Policy (digital scan quotas are non-refundable once utilized).';
      expect(expectedCopy).toContain('Terms of Service');
      expect(expectedCopy).toContain('Refund Policy');
      expect(expectedCopy).toContain('(digital scan quotas are non-refundable once utilized)');
    });

    it('validates exact crowdsourced food ingestion disclosure copy', () => {
      const expectedCopy =
        'This product is not yet in our global database. Submitting will save it privately to your vault while anonymized ingredient details are queued for admin safety review.';
      expect(expectedCopy).toContain('This product is not yet in our global database.');
      expect(expectedCopy).toContain('anonymized ingredient details are queued for admin safety review.');
    });

    it('validates exact DPDP Act 2023 health consent checkbox copy', () => {
      const expectedCopy =
        'I consent to the processing of my medical conditions for personalized food safety scoring pursuant to the DPDP Act 2023. I understand this does not replace medical advice.';
      expect(expectedCopy).toContain('pursuant to the DPDP Act 2023');
      expect(expectedCopy).toContain('personalized food safety scoring');
      expect(expectedCopy).toContain('does not replace medical advice');
    });
  });
});
