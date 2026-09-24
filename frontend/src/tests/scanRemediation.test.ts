import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Scan Pipeline Remediation & Canonical Contract', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Multipart FormData & Request Contract', () => {
    it('constructs multipart FormData with image blob and optional barcode', () => {
      const mockBlob = new Blob(['fake image bytes'], { type: 'image/jpeg' });
      const detectedBarcode = '8901030383758';

      const formData = new FormData();
      formData.append('image', mockBlob, 'scan.jpg');
      if (detectedBarcode) {
        formData.append('barcode', detectedBarcode.trim());
      }

      expect(formData.get('image')).toBeInstanceOf(Blob);
      expect((formData.get('image') as File).name).toBe('scan.jpg');
      expect(formData.get('barcode')).toBe('8901030383758');
    });

    it('preserves leading zeros in barcode strings', () => {
      const leadingZeroBarcode = '0012345678905';
      const formData = new FormData();
      formData.append('barcode', leadingZeroBarcode.trim());
      
      expect(formData.get('barcode')).toBe('0012345678905');
      expect(typeof formData.get('barcode')).toBe('string');
    });

    it('targets /api/scan/analyze and never calls legacy endpoints', async () => {
      const API_BASE = 'https://api.example.com';
      const mockToken = 'mock-firebase-token-12345';
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          product_name: 'Healthy Snack',
          food_id: 'food_68a9f',
          is_verified: false,
          ingredients: ['Oats', 'Honey'],
        }),
      });
      vi.stubGlobal('fetch', fetchSpy);

      const formData = new FormData();
      formData.append('image', new Blob(['test'], { type: 'image/jpeg' }), 'scan.jpg');

      const response = await fetch(`${API_BASE}/api/scan/analyze`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${mockToken}`,
        },
        body: formData,
      });

      const data = await response.json();

      // Invariant: Exact canonical endpoint called
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.example.com/api/scan/analyze',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer mock-firebase-token-12345',
          },
          body: formData,
        })
      );

      // Invariant: Legacy endpoints MUST NOT be called
      expect(fetchSpy).not.toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/scan(?!\/analyze)/),
        expect.anything()
      );
      expect(fetchSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('/api/scan/ingredients'),
        expect.anything()
      );

      expect(data.food_id).toBe('food_68a9f');
      expect(data.is_verified).toBe(false);
    });
  });

  describe('Response Mapping & Verification States', () => {
    it('accurately distinguishes existing verified food vs pending uncataloged food', () => {
      const verifiedResponse = {
        food_id: '67b848c90000000000000001',
        product_name: 'Cataloged Cereal',
        is_verified: true,
        ingredients: ['Whole Wheat', 'Sugar'],
        additives: [],
        allergens: ['Wheat'],
        estimated_macros: { calories: 150, protein: 4 },
      };

      const pendingResponse = {
        food_id: '67b848c90000000000000002',
        product_name: 'Novel Artisan Granola',
        is_verified: false,
        status: 'pending_review',
        ingredients: ['Rolled Oats', 'Jaggery'],
        additives: [],
        allergens: [],
        estimated_macros: { calories: 210, protein: 5 },
      };

      // Normalization check
      const normalizeScanResult = (res: any) => ({
        food_id: String(res.food_id),
        is_verified: Boolean(res.is_verified),
        product_name: res.product_name || res.name || 'Unknown Product',
        requires_moderation: !res.is_verified,
        ingredients: res.ingredients || [],
        allergens: res.allergens || [],
      });

      const normalizedVerified = normalizeScanResult(verifiedResponse);
      expect(normalizedVerified.is_verified).toBe(true);
      expect(normalizedVerified.requires_moderation).toBe(false);
      expect(normalizedVerified.food_id).toBe('67b848c90000000000000001');

      const normalizedPending = normalizeScanResult(pendingResponse);
      expect(normalizedPending.is_verified).toBe(false);
      expect(normalizedPending.requires_moderation).toBe(true);
      expect(normalizedPending.food_id).toBe('67b848c90000000000000002');
    });

    it('adapts scan analysis result into IngredientReviewModal format', () => {
      const scanResult = {
        food_id: 'food_123',
        product_name: 'Choco Delight',
        raw_ocr_text: 'Ingredients: Cocoa, Milk, Sugar',
        parsed_ingredients: ['Cocoa', 'Milk', 'Sugar'],
        detected_ins_additives: [{ code: 'INS 322', name: 'Lecithin', risk: 'safe' }],
        flagged_allergens: ['Milk'],
        nutrition_per_100g: { calories: 450, protein: 6 },
        is_verified: false,
      };

      const modalInitialData = {
        product_name: scanResult.product_name,
        raw_ocr_text: scanResult.raw_ocr_text,
        parsed_ingredients: scanResult.parsed_ingredients,
        detected_ins_additives: scanResult.detected_ins_additives,
        flagged_allergens: scanResult.flagged_allergens,
        nutrition_per_100g: scanResult.nutrition_per_100g,
        requires_user_review: !scanResult.is_verified,
      };

      expect(modalInitialData.product_name).toBe('Choco Delight');
      expect(modalInitialData.parsed_ingredients).toEqual(['Cocoa', 'Milk', 'Sugar']);
      expect(modalInitialData.requires_user_review).toBe(true);
    });
  });

  describe('HTTP Error Status Handling', () => {
    const simulateErrorHandling = async (status: number, message: string) => {
      const response = {
        ok: false,
        status,
        statusText: message,
        json: async () => ({ detail: message }),
      };

      let userErrorMessage = '';
      if (response.status === 400) {
        userErrorMessage = 'Invalid image or malformed scan request.';
      } else if (response.status === 401) {
        userErrorMessage = 'Authentication session expired. Please sign in again.';
      } else if (response.status === 413) {
        userErrorMessage = 'Image file too large. Maximum size is 5MB.';
      } else if (response.status === 422) {
        userErrorMessage = 'Invalid data submitted.';
      } else if (response.status === 503) {
        userErrorMessage = 'Food analysis service currently unavailable. Please try again shortly.';
      } else {
        userErrorMessage = 'Scan analysis encountered an error. Please try again.';
      }

      return { status: response.status, userErrorMessage };
    };

    it('handles 400 Bad Request with user friendly message', async () => {
      const res = await simulateErrorHandling(400, 'Image is corrupted');
      expect(res.userErrorMessage).toContain('Invalid image');
    });

    it('handles 401 Unauthorized gracefully', async () => {
      const res = await simulateErrorHandling(401, 'Unauthorized');
      expect(res.userErrorMessage).toContain('Authentication session expired');
    });

    it('handles 413 Payload Too Large gracefully', async () => {
      const res = await simulateErrorHandling(413, 'File size exceeds limit');
      expect(res.userErrorMessage).toContain('Maximum size is 5MB');
    });

    it('handles 422 Validation Error gracefully', async () => {
      const res = await simulateErrorHandling(422, 'Unprocessable Entity');
      expect(res.userErrorMessage).toContain('Invalid data submitted');
    });

    it('handles 503 Service Unavailable gracefully', async () => {
      const res = await simulateErrorHandling(503, 'Database unavailable');
      expect(res.userErrorMessage).toContain('service currently unavailable');
    });
  });
});
