/**
 * Ingredient Parser Utility
 * Resolves AI/OCR outputs into structured Ingredient objects.
 * Handles valid JSON, markdown codeblocks, and fragmented key-value string arrays.
 */

export interface ParsedIngredient {
  id: string;
  name: string;
  safety: number | string;
  safetyLabel: 'Safe' | 'Moderate' | 'Avoid' | 'Unknown';
  description: string;
  detectedText?: string;
}

/**
 * Normalizes safety score to numerical value and label badge
 */
function parseSafety(val: any): { score: number | string; label: 'Safe' | 'Moderate' | 'Avoid' | 'Unknown' } {
  if (typeof val === 'number') {
    if (val >= 7) return { score: val, label: 'Safe' };
    if (val >= 4) return { score: val, label: 'Moderate' };
    return { score: val, label: 'Avoid' };
  }
  
  if (typeof val === 'string') {
    const num = parseInt(val.replace(/\D/g, ''), 10);
    if (!isNaN(num)) {
      return parseSafety(num);
    }
    const lower = val.toLowerCase();
    if (lower.includes('safe') || lower.includes('low risk')) return { score: 9, label: 'Safe' };
    if (lower.includes('mod') || lower.includes('medium')) return { score: 5, label: 'Moderate' };
    if (lower.includes('avoid') || lower.includes('high risk') || lower.includes('harm')) return { score: 2, label: 'Avoid' };
  }

  return { score: 8, label: 'Safe' };
}

/**
 * Main parser function to clean and structure AI scan responses.
 */
export function parseScannedIngredients(input: unknown): ParsedIngredient[] {
  if (!input) return [];

  // Case 1: Already an array of structured objects
  if (Array.isArray(input)) {
    // Check if elements are already proper objects with name
    if (input.length > 0 && typeof input[0] === 'object' && input[0] !== null && ('name' in input[0] || 'Name' in input[0])) {
      return input.map((item, index) => {
        const name = String(item.name || item.Name || 'Unknown Ingredient').replace(/^[\[{\s"]+|[\]}\s"]+$/g, '');
        const rawDesc = String(item.description || item.Description || item.details || `Natural ingredient detected in scan: ${name}`);
        const { score, label } = parseSafety(item.safety ?? item.Safety ?? item.score);
        
        return {
          id: `ing-${index}-${Date.now()}`,
          name,
          safety: score,
          safetyLabel: label,
          description: rawDesc.replace(/^[{\s"]+|[}\s"]+$/g, ''),
          detectedText: `Detected ingredient: ${name.toLowerCase()}`
        };
      });
    }

    // Case 2: Array of fragmented string pairs (e.g. ['[{Name: "Milk"', 'Safety: 9', 'Description: "Whole Milk"}'])
    if (input.every(item => typeof item === 'string')) {
      const joinedString = (input as string[]).join(', ');
      return parseScannedIngredients(joinedString);
    }
  }

  // Case 3: Raw String Input (JSON string, markdown JSON, or fragmented string output)
  if (typeof input === 'string') {
    const trimmed = input.trim();

    // 3a. Clean Markdown JSON wrappers
    const cleanedJson = trimmed
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    // Try parsing as standard JSON
    try {
      const parsed = JSON.parse(cleanedJson);
      return parseScannedIngredients(parsed);
    } catch (_) {
      // Not direct valid JSON - proceed to robust string extraction
    }

    // 3b. Handle Fragmented String Output (re-assembling broken JSON strings from .split(','))
    // Matches patterns like {Name: "Milk", Safety: 9, Description: "Whole milk"} or [{Name: ...}]
    const reconstructed: ParsedIngredient[] = [];
    
    // Regex matches blocks starting with Name/name and capturing attributes up to next Name or end of string
    const objectRegex = /(?:\{|\[\{)?\s*["']?(?:Name|name)["']?\s*:\s*["']?([^"',}]+)["']?(?:[,\s]+["']?(?:Safety|safety)["']?\s*:\s*([^,}]+))?(?:[,\s]+["']?(?:Description|description)["']?\s*:\s*["']?([^"\}]+)["']?)?\s*\}?/gi;

    let match: RegExpExecArray | null;
    let idx = 0;
    while ((match = objectRegex.exec(trimmed)) !== null) {
      const rawName = match[1]?.trim() || '';
      const rawSafety = match[2]?.trim() || '8';
      const rawDesc = match[3]?.trim() || `Detected ${rawName} in product scan.`;

      if (rawName && !rawName.toLowerCase().startsWith('description') && !rawName.toLowerCase().startsWith('safety')) {
        const { score, label } = parseSafety(rawSafety);
        reconstructed.push({
          id: `ing-rec-${idx++}-${Date.now()}`,
          name: rawName.replace(/^["'\[{]+|["'\]}]+$/g, ''),
          safety: score,
          safetyLabel: label,
          description: rawDesc.replace(/^["'\[{]+|["'\]}]+$/g, ''),
          detectedText: `Detected ingredient: ${rawName.toLowerCase()}`
        });
      }
    }

    if (reconstructed.length > 0) {
      return reconstructed;
    }

    // 3c. Fallback for plain comma-separated names (e.g. "Milk, Sugar, Water")
    const simpleList = trimmed.split(',').map(s => s.trim()).filter(s => s.length > 0);
    return simpleList.map((item, index) => {
      const cleanName = item.replace(/^[\[{\s"']+|[\]}\s"']+$/g, '');
      return {
        id: `ing-simple-${index}`,
        name: cleanName,
        safety: 8,
        safetyLabel: 'Safe',
        description: `Standard product ingredient: ${cleanName}`,
        detectedText: `Detected ingredient: ${cleanName.toLowerCase()}`
      };
    });
  }

  return [];
}
