/**
 * Medical Knowledge Vault for Scanned Ingredients
 * Provides detailed health safety ratings, risk levels, and explanations
 * for why ingredients are classified as Safe, Moderate, or Dangerous.
 */

export interface VaultEntry {
  canonicalName: string;
  aliases: string[];
  safetyLabel: 'Safe' | 'Moderate' | 'Dangerous';
  safetyScore: number; // 1 (Most dangerous) to 10 (Safest)
  reasoning: string;  // Detailed explanation of WHY it is safe/moderate/dangerous
  category: 'Preservative' | 'Sweetener' | 'Additive' | 'Natural' | 'Dairy' | 'Fat' | 'Coloring' | 'Nutrient';
  medicalWarning?: string;
}

export const MEDICAL_INGREDIENT_VAULT: VaultEntry[] = [
  {
    canonicalName: 'Milk',
    aliases: ['whole milk', 'skim milk', 'milk solids', 'dairy', 'milk powder', 'milk protein'],
    safetyLabel: 'Safe',
    safetyScore: 9,
    category: 'Dairy',
    reasoning: 'Safe & Nutrient-Rich: Excellent natural source of calcium, protein, and vitamin D. Promotes bone health. Safe for general population except those with lactose intolerance or milk protein allergy.'
  },
  {
    canonicalName: 'Water',
    aliases: ['purified water', 'spring water', 'aqua', 'filtered water'],
    safetyLabel: 'Safe',
    safetyScore: 10,
    category: 'Nutrient',
    reasoning: 'Safe: Essential universal solvent necessary for cellular hydration, digestion, and metabolic detoxification. Absolutely safe with zero chemical toxicity.'
  },
  {
    canonicalName: 'Sugar',
    aliases: ['sugars', 'sucrose', 'table sugar', 'cane sugar', 'added sugar', 'glucose', 'fructose'],
    safetyLabel: 'Moderate',
    safetyScore: 5,
    category: 'Sweetener',
    reasoning: 'Moderate Risk: High intake causes rapid glycemic spikes, elevates insulin resistance, contributes to dental caries, and increases long-term risk of type-2 diabetes and metabolic syndrome.',
    medicalWarning: 'Limit daily intake to under 25g according to WHO guidelines.'
  },
  {
    canonicalName: 'High Fructose Corn Syrup',
    aliases: ['hfcs', 'corn syrup', 'isoglucose', 'fructose syrup'],
    safetyLabel: 'Dangerous',
    safetyScore: 3,
    category: 'Sweetener',
    reasoning: 'Dangerous: Highly processed industrial sweetener metabolized almost exclusively by the liver. Strongly associated with non-alcoholic fatty liver disease (NAFLD), severe visceral adiposity, and hyperuricemia.',
    medicalWarning: 'Frequent consumption linked to rapid onset of metabolic dysfunction.'
  },
  {
    canonicalName: 'Sodium Nitrate',
    aliases: ['sodium nitrite', 'e250', 'e251', 'nitrites', 'nitrates'],
    safetyLabel: 'Dangerous',
    safetyScore: 2,
    category: 'Preservative',
    reasoning: 'Dangerous: Chemical preservative used in cured meats. Under acid/heat conditions in the stomach, forms N-nitroso compounds (nitrosamines) classified by IARC as probable human carcinogens.',
    medicalWarning: 'Associated with elevated risk of colorectal cancer and vascular inflammation.'
  },
  {
    canonicalName: 'Trans Fats',
    aliases: ['partially hydrogenated oil', 'hydrogenated fat', 'margarine', 'shortening'],
    safetyLabel: 'Dangerous',
    safetyScore: 1,
    category: 'Fat',
    reasoning: 'Dangerous: Industrial trans fatty acids elevate systemic inflammation, dramatically raise atherogenic LDL cholesterol, and lower protective HDL cholesterol.',
    medicalWarning: 'Strictly avoided worldwide due to strong link with ischemic heart disease.'
  },
  {
    canonicalName: 'Aspartame',
    aliases: ['e951', 'nutrasweet', 'equal', 'artificial sweetener'],
    safetyLabel: 'Moderate',
    safetyScore: 6,
    category: 'Sweetener',
    reasoning: 'Moderate: Non-nutritive artificial sweetener. Approved as safe in low amounts, but metabolizes into phenylalanine, aspartic acid, and methanol. May trigger headaches in sensitive individuals.',
    medicalWarning: 'Contraindicated for individuals with Phenylketonuria (PKU).'
  },
  {
    canonicalName: 'Monosodium Glutamate',
    aliases: ['msg', 'e621', 'glutamate', 'flavour enhancer 621'],
    safetyLabel: 'Moderate',
    safetyScore: 6,
    category: 'Additive',
    reasoning: 'Moderate: Sodium salt of glutamic acid used for umami flavor enhancement. Recognized as safe by FDA, but high doses may provoke transient flushing, numbness, or headaches in sensitive people.'
  },
  {
    canonicalName: 'Titanium Dioxide',
    aliases: ['e171', 'ci 77891', 'white pigment'],
    safetyLabel: 'Dangerous',
    safetyScore: 2,
    category: 'Coloring',
    reasoning: 'Dangerous: Whitening pigment banned in the European Union (EU) due to concerns over nanoparticle accumulation, DNA damage, and lack of genotoxicity safety threshold.',
    medicalWarning: 'Avoid ingestion of products containing E171.'
  },
  {
    canonicalName: 'Sodium Benzoate',
    aliases: ['e211', 'benzoate of soda'],
    safetyLabel: 'Moderate',
    safetyScore: 5,
    category: 'Preservative',
    reasoning: 'Moderate: Antimicrobial preservative. Safe in trace food amounts, but when combined with Vitamin C (Ascorbic Acid) in soft drinks, can react to synthesize trace benzene (a known carcinogen).'
  },
  {
    canonicalName: 'Red 40',
    aliases: ['allura red', 'e129', 'fd&c red no. 40', 'yellow 5', 'e102', 'tartrazine'],
    safetyLabel: 'Moderate',
    safetyScore: 5,
    category: 'Coloring',
    reasoning: 'Moderate: Synthetic azo dye derived from petroleum. Studies link synthetic dyes to increased hyperactive behavioral traits (ADHD symptoms) in children and localized histamine release.'
  },
  {
    canonicalName: 'Strawberry Puree',
    aliases: ['raspberry puree', 'blueberry puree', 'blackberry puree', 'fruit puree', 'fruit pulp'],
    safetyLabel: 'Safe',
    safetyScore: 9,
    category: 'Natural',
    reasoning: 'Safe & Wholesome: Whole fruit preparation containing natural polyphenols, anthocyanins, and bioflavonoids. Provides potent antioxidant cellular protection against oxidative stress.'
  },
  {
    canonicalName: 'Citric Acid',
    aliases: ['e330', 'sour salt'],
    safetyLabel: 'Safe',
    safetyScore: 9,
    category: 'Additive',
    reasoning: 'Safe: Natural organic acid occurring in citrus fruits. Used as a natural acidity regulator and antioxidant preservative. Safe and non-toxic for human metabolism.'
  },
  {
    canonicalName: 'Xanthan Gum',
    aliases: ['e415', 'guar gum', 'e412', 'plant gum'],
    safetyLabel: 'Safe',
    safetyScore: 8,
    category: 'Additive',
    reasoning: 'Safe: Soluble polysaccharide fiber produced by fermentation. Functions as a harmless thickening agent; helps slow gastric emptying and supports beneficial gut microbiota.'
  },
  {
    canonicalName: 'Palm Oil',
    aliases: ['palmitic acid', 'palm fat', 'palm kernel oil'],
    safetyLabel: 'Moderate',
    safetyScore: 5,
    category: 'Fat',
    reasoning: 'Moderate: Highly saturated vegetable fat. Contains beneficial vitamin E tocotrienols, but excessive consumption elevates serum total and LDL cholesterol levels.'
  }
];

/**
 * Searches the Medical Knowledge Vault for an ingredient match.
 */
export function lookupMedicalVault(ingredientName: string): VaultEntry | null {
  if (!ingredientName) return null;
  const clean = ingredientName.trim().toLowerCase();

  for (const entry of MEDICAL_INGREDIENT_VAULT) {
    if (entry.canonicalName.toLowerCase() === clean) {
      return entry;
    }
    for (const alias of entry.aliases) {
      if (clean.includes(alias.toLowerCase()) || alias.toLowerCase().includes(clean)) {
        return entry;
      }
    }
  }

  return null;
}

/**
 * Generates an intelligent health analysis for ingredients not directly listed in the vault.
 */
export function generateHeuristicSafety(ingredientName: string): {
  safetyLabel: 'Safe' | 'Moderate' | 'Dangerous';
  safetyScore: number;
  reasoning: string;
} {
  const lower = ingredientName.toLowerCase();

  // Dangerous keywords
  if (/nitr|trans fat|hydrogenated|titanium|benzoate|bleach|acrylamide|paraben|sulfite/i.test(lower)) {
    return {
      safetyLabel: 'Dangerous',
      safetyScore: 3,
      reasoning: `Dangerous / High Risk: "${ingredientName}" contains chemical structures associated with potential toxicity, systemic inflammation, or cell mutation. Recommended to minimize exposure.`
    };
  }

  // Moderate keywords
  if (/syrup|dye|color|artificial|preservative|sweetener|emulsifier|flavor|msg|flavoring|palm/i.test(lower)) {
    return {
      safetyLabel: 'Moderate',
      safetyScore: 5,
      reasoning: `Moderate Caution: "${ingredientName}" is a refined food additive or sweetener. Safe in low quantities, but excessive intake may stress digestive or metabolic pathways.`
    };
  }

  // Safe default
  return {
    safetyLabel: 'Safe',
    safetyScore: 8,
    reasoning: `Safe & Generally Recognized as Safe (GRAS): "${ingredientName}" is a standard dietary compound. Safe for consumption under normal dietary conditions.`
  };
}
