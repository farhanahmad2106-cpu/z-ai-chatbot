/**
 * Ingredient Parser Utility
 * Resolves AI/OCR outputs into structured Ingredient objects.
 * Enriches each ingredient with detailed explanations from the Medical Knowledge Vault.
 */

import { lookupMedicalVault, generateHeuristicSafety, VaultEntry } from './ingredientVault';

export interface ParsedIngredient {
  id: string;
  name: string;
  safety: number | string;
  safetyLabel: 'Safe' | 'Moderate' | 'Dangerous';
  description: string;
  reasoning?: string;
  medicalWarning?: string;
  vaultVerified?: boolean;
  category?: string;
  detectedText?: string;
}

/**
 * Normalizes safety score to numerical value and label badge
 */
function parseSafety(val: any): { score: number | string; label: 'Safe' | 'Moderate' | 'Dangerous' } {
  if (typeof val === 'number') {
    if (val >= 7) return { score: val, label: 'Safe' };
    if (val >= 4) return { score: val, label: 'Moderate' };
    return { score: val, label: 'Dangerous' };
  }
  
  if (typeof val === 'string') {
    const num = parseInt(val.replace(/\D/g, ''), 10);
    if (!isNaN(num)) {
      return parseSafety(num);
    }
    const lower = val.toLowerCase();
    if (lower.includes('safe') || lower.includes('low risk')) return { score: 9, label: 'Safe' };
    if (lower.includes('mod') || lower.includes('medium')) return { score: 5, label: 'Moderate' };
    if (lower.includes('avoid') || lower.includes('high risk') || lower.includes('danger') || lower.includes('harm')) {
      return { score: 2, label: 'Dangerous' };
    }
  }

  return { score: 8, label: 'Safe' };
}

/**
 * Enriches ingredient object with Medical Knowledge Vault details if description is minimal
 */
function enrichIngredient(name: string, rawDesc?: string, rawSafety?: any): ParsedIngredient {
  const cleanName = name.replace(/^[\[{\s"']+|[\]}\s"']+$/g, '').trim();
  const vaultMatch = lookupMedicalVault(cleanName);

  // If vault match found, use vault medical reasoning & classification
  if (vaultMatch) {
    return {
      id: `ing-v-${cleanName.toLowerCase()}-${Date.now()}`,
      name: cleanName,
      safety: vaultMatch.safetyScore,
      safetyLabel: vaultMatch.safetyLabel,
      description: vaultMatch.reasoning,
      medicalWarning: vaultMatch.medicalWarning,
      vaultVerified: true,
      category: vaultMatch.category,
      detectedText: `Medical Vault Verified: ${cleanName.toLowerCase()}`
    };
  }

  // Check if raw description has meaningful explanation
  const hasGoodDesc = rawDesc && rawDesc.length > 20 && !rawDesc.toLowerCase().startsWith('detected ingredient');
  
  if (hasGoodDesc) {
    const { score, label } = parseSafety(rawSafety);
    return {
      id: `ing-raw-${cleanName.toLowerCase()}-${Date.now()}`,
      name: cleanName,
      safety: score,
      safetyLabel: label,
      description: rawDesc.replace(/^[{\s"']+|[}\s"']+$/g, '').trim(),
      vaultVerified: false,
      detectedText: `Detected ingredient: ${cleanName.toLowerCase()}`
    };
  }

  // Fallback to intelligent heuristic safety classification
  const heuristic = generateHeuristicSafety(cleanName);
  return {
    id: `ing-heu-${cleanName.toLowerCase()}-${Date.now()}`,
    name: cleanName,
    safety: heuristic.safetyScore,
    safetyLabel: heuristic.safetyLabel,
    description: heuristic.reasoning,
    vaultVerified: false,
    detectedText: `Detected ingredient: ${cleanName.toLowerCase()}`
  };
}

/**
 * Main parser function to clean and structure AI scan responses.
 */
export function parseScannedIngredients(input: unknown): ParsedIngredient[] {
  if (!input) return [];

  // Case 1: Already an array of structured objects
  if (Array.isArray(input)) {
    if (input.length > 0 && typeof input[0] === 'object' && input[0] !== null && ('name' in input[0] || 'Name' in input[0])) {
      return input.map((item) => {
        const name = String(item.name || item.Name || 'Unknown Ingredient');
        const rawDesc = String(item.description || item.Description || item.details || '');
        return enrichIngredient(name, rawDesc, item.safety ?? item.Safety ?? item.score);
      });
    }

    // Case 2: Array of fragmented string pairs
    if (input.every(item => typeof item === 'string')) {
      const joinedString = (input as string[]).join(', ');
      return parseScannedIngredients(joinedString);
    }
  }

  // Case 3: Raw String Input (JSON string, markdown JSON, or fragmented string output)
  if (typeof input === 'string') {
    const trimmed = input.trim();
    const cleanedJson = trimmed
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    try {
      const parsed = JSON.parse(cleanedJson);
      return parseScannedIngredients(parsed);
    } catch (_) {}

    // Reconstruct string fragments
    const reconstructed: ParsedIngredient[] = [];
    const objectRegex = /(?:\{|\[\{)?\s*["']?(?:Name|name)["']?\s*:\s*["']?([^"',}]+)["']?(?:[,\s]+["']?(?:Safety|safety)["']?\s*:\s*([^,}]+))?(?:[,\s]+["']?(?:Description|description)["']?\s*:\s*["']?([^"\}]+)["']?)?\s*\}?/gi;

    let match: RegExpExecArray | null;
    while ((match = objectRegex.exec(trimmed)) !== null) {
      const rawName = match[1]?.trim() || '';
      const rawSafety = match[2]?.trim();
      const rawDesc = match[3]?.trim();

      if (rawName && !rawName.toLowerCase().startsWith('description') && !rawName.toLowerCase().startsWith('safety')) {
        reconstructed.push(enrichIngredient(rawName, rawDesc, rawSafety));
      }
    }

    if (reconstructed.length > 0) {
      return reconstructed;
    }

    // Fallback for plain comma-separated names (e.g. "Milk, Sodium Nitrate, Water")
    const simpleList = trimmed.split(',').map(s => s.trim()).filter(s => s.length > 0);
    return simpleList.map((item) => enrichIngredient(item));
  }

  return [];
}
