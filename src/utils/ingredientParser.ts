/**
 * Ingredient Parser Utility
 * Resolves AI/OCR outputs into structured Ingredient objects.
 * Guarantees a clear definition and health description for every single ingredient.
 */

import { lookupMedicalVault, generateIngredientDefinition, ParsedIngredient as BaseParsedIngredient } from './ingredientVault';

export interface ParsedIngredient {
  id: string;
  name: string;
  safety: number | string;
  safetyLabel: 'Safe' | 'Moderate' | 'Dangerous';
  description: string;
  medicalWarning?: string;
  vaultVerified?: boolean;
  category?: string;
  detectedText?: string;
}

/**
 * Cleans markdown formatting, bullet asterisks, and trailing open parentheses
 */
function sanitizeIngredientName(raw: string): string {
  let name = raw
    .replace(/^[*•\-\s\d\.\:]+/g, '') // Strip leading bullet points *, -, •, numbers
    .replace(/[*_]+/g, '')            // Strip markdown bold/italic asterisks
    .trim();

  // Fix unmatched open parenthesis if split broke it
  const openCount = (name.match(/\(/g) || []).length;
  const closeCount = (name.match(/\)/g) || []).length;
  if (openCount > closeCount) {
    name += ')';
  }

  return name;
}

/**
 * Checks if a parsed line is metadata rather than a real ingredient
 */
function isMetadataRow(text: string): boolean {
  const lower = text.toLowerCase().trim();
  if (!lower || lower === '**' || lower === '*' || lower === 'none' || lower === '* none') return true;
  if (lower.startsWith('safety score') || lower.startsWith('**safety score')) return true;
  if (lower.startsWith('warnings') || lower.startsWith('**warnings')) return true;
  if (lower.startsWith('description') || lower.startsWith('**description')) return true;
  if (lower.startsWith('key ingredients') || lower.startsWith('scanned product')) return true;
  return false;
}

/**
 * Enriches ingredient object with Medical Knowledge Vault or Fallback Definitions
 */
function enrichIngredient(name: string, rawDesc?: string, rawSafety?: any): ParsedIngredient | null {
  const cleanName = sanitizeIngredientName(name);
  if (!cleanName || isMetadataRow(cleanName)) return null;

  // 1. Try Medical Vault match (canonical name, alias, or INS/E-Number)
  const vaultMatch = lookupMedicalVault(cleanName);

  if (vaultMatch) {
    return {
      id: `ing-v-${cleanName.toLowerCase()}-${Math.random().toString(36).substring(2, 7)}`,
      name: cleanName,
      safety: vaultMatch.safetyScore,
      safetyLabel: vaultMatch.safetyLabel,
      description: vaultMatch.reasoning,
      medicalWarning: vaultMatch.medicalWarning,
      vaultVerified: true,
      category: vaultMatch.category,
      detectedText: `Detected ingredient: ${cleanName.toLowerCase()}`
    };
  }

  // 2. If raw description is rich and informative, use it
  const hasGoodDesc = rawDesc && rawDesc.length > 15 && !rawDesc.toLowerCase().startsWith('detected ingredient');
  
  if (hasGoodDesc) {
    return {
      id: `ing-raw-${cleanName.toLowerCase()}-${Math.random().toString(36).substring(2, 7)}`,
      name: cleanName,
      safety: 8,
      safetyLabel: 'Safe',
      description: rawDesc.replace(/^[*{\s"']+|[*}\s"']+$/g, '').trim(),
      vaultVerified: false,
      detectedText: `Detected ingredient: ${cleanName.toLowerCase()}`
    };
  }

  // 3. Fallback Definition Generator: Guarantees a clear definition for ANY ingredient
  const definition = generateIngredientDefinition(cleanName);
  return {
    id: `ing-def-${cleanName.toLowerCase()}-${Math.random().toString(36).substring(2, 7)}`,
    name: cleanName,
    safety: definition.safetyScore,
    safetyLabel: definition.safetyLabel,
    description: definition.reasoning,
    category: definition.category,
    vaultVerified: false,
    detectedText: `Detected ingredient: ${cleanName.toLowerCase()}`
  };
}

/**
 * Main parser function to clean and structure AI scan responses.
 */
export function parseScannedIngredients(input: unknown): ParsedIngredient[] {
  if (!input) return [];

  // Case 1: Array input
  if (Array.isArray(input)) {
    // Array of objects
    if (input.length > 0 && typeof input[0] === 'object' && input[0] !== null && ('name' in input[0] || 'Name' in input[0])) {
      const results: ParsedIngredient[] = [];
      for (const item of input) {
        const name = String(item.name || item.Name || '');
        const rawDesc = String(item.description || item.Description || item.details || '');
        const ing = enrichIngredient(name, rawDesc, item.safety ?? item.Safety ?? item.score);
        if (ing) results.push(ing);
      }
      return results;
    }

    // Array of string lines (e.g. from bulleted markdown or .split('\n') / .split(','))
    if (input.every(item => typeof item === 'string')) {
      const results: ParsedIngredient[] = [];
      for (const str of input as string[]) {
        const ing = enrichIngredient(str);
        if (ing) results.push(ing);
      }
      return results;
    }
  }

  // Case 2: String input (Markdown text, JSON string, or bulleted list)
  if (typeof input === 'string') {
    const trimmed = input.trim();

    // Try parsing standard JSON
    const cleanedJson = trimmed.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
    try {
      const parsed = JSON.parse(cleanedJson);
      return parseScannedIngredients(parsed);
    } catch (_) {}

    // Parse bulleted list / line-separated text (e.g. "* Whey Protein Blend\n* Cocoa\n* Salt")
    const lines = trimmed.split(/\n|,/).map(l => l.trim()).filter(l => l.length > 0);
    const results: ParsedIngredient[] = [];

    for (const line of lines) {
      const ing = enrichIngredient(line);
      if (ing) results.push(ing);
    }

    return results;
  }

  return [];
}
