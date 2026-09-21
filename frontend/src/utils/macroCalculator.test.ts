import { describe, it, expect } from 'vitest';
import { 
  calculateMacros, 
  mapProfileToMetrics,
  PhysicalMetrics
} from './macroCalculator';

describe('macroCalculator', () => {
  describe('calculateMacros', () => {
    it('Test 1 — Male / Sedentary / Maintenance', () => {
      const metrics: PhysicalMetrics = {
        age: 25,
        weightKg: 70,
        heightCm: 175,
        gender: 'male',
        activityLevel: 'sedentary',
        healthGoal: 'maintenance'
      };
      
      const result = calculateMacros(metrics);
      
      expect(result.bmr).toBeCloseTo(1673.75, 2);
      expect(result.tdee).toBeCloseTo(2008.5, 2);
      expect(result.calories).toBeCloseTo(2008.5, 2);
      
      // Maintenance: P=25%, C=50%, F=25%
      expect(result.proteinGrams).toBeCloseTo((2008.5 * 0.25) / 4, 2);
      expect(result.carbsGrams).toBeCloseTo((2008.5 * 0.50) / 4, 2);
      expect(result.fatGrams).toBeCloseTo((2008.5 * 0.25) / 9, 2);
    });

    it('Test 2 — Female / Moderate / Weight Loss', () => {
      const metrics: PhysicalMetrics = {
        age: 30,
        weightKg: 60,
        heightCm: 160,
        gender: 'female',
        activityLevel: 'moderate',
        healthGoal: 'weight_loss'
      };
      
      const result = calculateMacros(metrics);
      
      expect(result.bmr).toBeCloseTo(1289, 2);
      expect(result.tdee).toBeCloseTo(1997.95, 2);
      expect(result.calories).toBeCloseTo(1497.95, 2);
      
      // Weight loss: P=35%, C=35%, F=30%
      expect(result.proteinGrams).toBeCloseTo((1497.95 * 0.35) / 4, 2);
      expect(result.carbsGrams).toBeCloseTo((1497.95 * 0.35) / 4, 2);
      expect(result.fatGrams).toBeCloseTo((1497.95 * 0.30) / 9, 2);
    });

    it('Boundary Test — 1200 kcal floor on severe deficit', () => {
      const metrics: PhysicalMetrics = {
        age: 80,
        weightKg: 45,
        heightCm: 140,
        gender: 'female',
        activityLevel: 'sedentary',
        healthGoal: 'weight_loss'
      };
      
      const result = calculateMacros(metrics);
      
      // BMR should be low
      expect(result.tdee).toBeLessThan(1500); 
      // Calorie target should hit the 1200 floor, not lower
      expect(result.calories).toBe(1200);
    });

    it('Muscle Gain macro correctness', () => {
      const metrics: PhysicalMetrics = {
        age: 30,
        weightKg: 75,
        heightCm: 180,
        gender: 'male',
        activityLevel: 'active',
        healthGoal: 'muscle_gain'
      };
      
      const result = calculateMacros(metrics);
      
      expect(result.calories).toBeCloseTo(result.tdee + 350, 2);
      
      // Muscle gain: P=30%, C=50%, F=20%
      const pCals = result.proteinGrams * 4;
      const cCals = result.carbsGrams * 4;
      const fCals = result.fatGrams * 9;
      
      const totalCals = pCals + cCals + fCals;
      expect(totalCals).toBeCloseTo(result.calories, 1);
    });

    it('Invalid input rejection (negative/zero)', () => {
      const invalidMetrics: PhysicalMetrics = {
        age: -5,
        weightKg: 70,
        heightCm: 175,
        gender: 'male',
        activityLevel: 'sedentary',
        healthGoal: 'maintenance'
      };
      expect(() => calculateMacros(invalidMetrics)).toThrow(/Invalid age/);
    });

    it('Invalid input rejection (NaN)', () => {
      const invalidMetrics = {
        age: NaN,
        weightKg: 70,
        heightCm: 175,
        gender: 'male',
        activityLevel: 'sedentary',
        healthGoal: 'maintenance'
      } as unknown as PhysicalMetrics;
      expect(() => calculateMacros(invalidMetrics)).toThrow(/values must be finite/);
    });
  });

  describe('mapProfileToMetrics', () => {
    it('correctly parses user-friendly strings to strict enums', () => {
      const rawProfile = {
        age: "25",
        height: "175",
        weight: "70",
        gender: "Male",
        activityLevel: "Moderately Active",
        healthGoal: "Healthy Lifestyle"
      };

      const metrics = mapProfileToMetrics(rawProfile);
      
      expect(metrics).not.toBeNull();
      expect(metrics?.age).toBe(25);
      expect(metrics?.heightCm).toBe(175);
      expect(metrics?.weightKg).toBe(70);
      expect(metrics?.gender).toBe("male");
      expect(metrics?.activityLevel).toBe("moderate");
      expect(metrics?.healthGoal).toBe("maintenance");
    });

    it('correctly parses edge case strings', () => {
      const rawProfile = {
        age: 30,
        height: 160,
        weight: 60,
        gender: "F",
        activityLevel: "Very active",
        healthGoal: "Weight Loss / Cut"
      };

      const metrics = mapProfileToMetrics(rawProfile);
      
      expect(metrics?.gender).toBe("female");
      expect(metrics?.activityLevel).toBe("very_active");
      expect(metrics?.healthGoal).toBe("weight_loss");
    });

    it('returns null for missing required fields', () => {
      const rawProfile = {
        age: 30,
        weight: 60,
        // height is missing
        gender: "female",
        activityLevel: "sedentary",
        healthGoal: "maintenance"
      };

      expect(mapProfileToMetrics(rawProfile)).toBeNull();
    });
    
    it('returns null for 0 value fields', () => {
      const rawProfile = {
        age: 0,
        weight: 60,
        height: 180,
        gender: "female",
        activityLevel: "sedentary",
        healthGoal: "maintenance"
      };

      expect(mapProfileToMetrics(rawProfile)).toBeNull();
    });
  });
});
