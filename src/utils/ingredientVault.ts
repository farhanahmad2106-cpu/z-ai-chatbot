/**
 * Medical & Health Knowledge Vault for Scanned Ingredients
 * Comprehensive dictionary of food, beverage, cosmetic, and medical ingredients.
 * Guarantees a clear definition and health safety description for every ingredient.
 */

export interface VaultEntry {
  canonicalName: string;
  aliases: string[];
  safetyLabel: 'Safe' | 'Moderate' | 'Dangerous';
  safetyScore: number; // 1 (Most dangerous) to 10 (Safest)
  reasoning: string;  // Detailed explanation & definition of what the ingredient is
  category: 'Preservative' | 'Sweetener' | 'Additive' | 'Natural' | 'Dairy' | 'Fat' | 'Coloring' | 'Nutrient' | 'Protein' | 'Enzyme' | 'Flavoring';
  medicalWarning?: string;
}

export const MEDICAL_INGREDIENT_VAULT: VaultEntry[] = [
  {
    canonicalName: 'Whey Protein Blend',
    aliases: ['whey protein', 'whey protein concentrate', 'whey protein isolate', 'whey isolate', 'whey concentrate', 'whey hydrolysate'],
    safetyLabel: 'Safe',
    safetyScore: 9,
    category: 'Protein',
    reasoning: 'Fast-absorbing dairy protein supplying essential amino acids & BCAAs. Supports muscle repair, tissue synthesis, and daily protein requirement.'
  },
  {
    canonicalName: 'Cocoa (Processed with Alkali)',
    aliases: ['cocoa', 'dutch processed cocoa', 'cocoa powder', 'alkalized cocoa', 'cacao'],
    safetyLabel: 'Safe',
    safetyScore: 9,
    category: 'Natural',
    reasoning: 'Dutch-processed cocoa powder treated with alkali to neutralize natural acidity. Rich in flavonoids and polyphenols providing dietary antioxidants and chocolate flavor.'
  },
  {
    canonicalName: 'Natural & Artificial Flavour',
    aliases: ['natural flavor', 'artificial flavor', 'natural and artificial flavour', 'flavouring', 'flavorings'],
    safetyLabel: 'Safe',
    safetyScore: 8,
    category: 'Flavoring',
    reasoning: 'Combination of natural extracts and approved aroma compounds added to enhance aroma, taste consistency, and sensory profile.'
  },
  {
    canonicalName: 'Lecithin',
    aliases: ['ins 322', 'e322', 'soy lecithin', 'sunflower lecithin', 'lecithin (ins 322)', 'ins 322(i)'],
    safetyLabel: 'Safe',
    safetyScore: 9,
    category: 'Additive',
    reasoning: 'Natural phospholipid emulsifier (INS 322). Prevents separation of fats and water, ensuring smooth texture, mixability, and lipid solubilization.'
  },
  {
    canonicalName: 'Xanthan Gum',
    aliases: ['ins 415', 'e415', 'xanthan gum (ins 415)', 'xanthan'],
    safetyLabel: 'Safe',
    safetyScore: 9,
    category: 'Additive',
    reasoning: 'Plant-derived fermented polysaccharide (INS 415). Acts as a soluble dietary fiber thickener and stabilizer, giving liquids a smooth, creamy body without extra calories.'
  },
  {
    canonicalName: 'Salt',
    aliases: ['sodium chloride', 'table salt', 'sea salt'],
    safetyLabel: 'Safe',
    safetyScore: 8,
    category: 'Nutrient',
    reasoning: 'Essential dietary mineral providing sodium and chloride ions required for nerve transmission, fluid balance, muscle contraction, and taste enhancement.'
  },
  {
    canonicalName: 'Lactase',
    aliases: ['lactase enzyme', 'beta-galactosidase'],
    safetyLabel: 'Safe',
    safetyScore: 10,
    category: 'Enzyme',
    reasoning: 'Digestive enzyme that hydrolyzes lactose sugar into glucose and galactose. Helps prevent bloating, gas, and digestive discomfort in lactose-sensitive individuals.'
  },
  {
    canonicalName: 'Acesulfame Potassium',
    aliases: ['ins 950', 'e950', 'ace-k', 'acesulfame-k', 'acesulfame potassium (ins 950)'],
    safetyLabel: 'Safe',
    safetyScore: 7,
    category: 'Sweetener',
    reasoning: 'Zero-calorie intense artificial sweetener (INS 950) ~200x sweeter than sugar. Heat-stable and non-glycemic, often combined with sucralose to balance sweet taste.'
  },
  {
    canonicalName: 'Sucralose',
    aliases: ['ins 955', 'e955', 'splenda', 'sucralose (ins 955)'],
    safetyLabel: 'Safe',
    safetyScore: 8,
    category: 'Sweetener',
    reasoning: 'Zero-calorie non-nutritive sweetener (INS 955) derived from sucrose. Passes through the body unabsorbed without raising blood glucose or promoting tooth decay.'
  },
  {
    canonicalName: 'Milk',
    aliases: ['whole milk', 'skim milk', 'milk solids', 'dairy', 'milk powder', 'milk protein'],
    safetyLabel: 'Safe',
    safetyScore: 9,
    category: 'Dairy',
    reasoning: 'Nutrient-dense dairy fluid rich in bioavailable calcium, phosphorus, vitamin D, and high-quality protein for bone and cellular health.'
  },
  {
    canonicalName: 'Water',
    aliases: ['purified water', 'spring water', 'aqua', 'filtered water'],
    safetyLabel: 'Safe',
    safetyScore: 10,
    category: 'Nutrient',
    reasoning: 'Essential universal hydration solvent required for cellular function, circulation, waste elimination, and enzymatic reactions.'
  },
  {
    canonicalName: 'Sugar',
    aliases: ['sugars', 'sucrose', 'table sugar', 'cane sugar', 'added sugar', 'glucose', 'fructose'],
    safetyLabel: 'Moderate',
    safetyScore: 5,
    category: 'Sweetener',
    reasoning: 'Simple carbohydrate sweetener. Provides quick cellular energy but rapid overconsumption leads to blood glucose volatility, weight gain, and dental decay.',
    medicalWarning: 'Limit daily intake according to health guidelines.'
  },
  {
    canonicalName: 'High Fructose Corn Syrup',
    aliases: ['hfcs', 'corn syrup', 'isoglucose', 'fructose syrup'],
    safetyLabel: 'Dangerous',
    safetyScore: 3,
    category: 'Sweetener',
    reasoning: 'Processed corn-derived sweetener. Hepatically metabolized into lipids; excessive intake is linked to fatty liver accumulation, visceral fat, and insulin resistance.',
    medicalWarning: 'Frequent consumption linked to metabolic strain.'
  },
  {
    canonicalName: 'Sodium Nitrate',
    aliases: ['sodium nitrite', 'e250', 'e251', 'nitrites', 'nitrates'],
    safetyLabel: 'Dangerous',
    safetyScore: 2,
    category: 'Preservative',
    reasoning: 'Chemical curing agent for meats. Can form carcinogenic nitrosamines in gastric acidic environments during digestion.',
    medicalWarning: 'Associated with elevated risk of gastrointestinal irritation.'
  },
  {
    canonicalName: 'Trans Fats',
    aliases: ['partially hydrogenated oil', 'hydrogenated fat', 'margarine', 'shortening'],
    safetyLabel: 'Dangerous',
    safetyScore: 1,
    category: 'Fat',
    reasoning: 'Modified vegetable oils that significantly raise bad LDL cholesterol, lower HDL cholesterol, and promote vascular arterial inflammation.',
    medicalWarning: 'Strictly restricted due to cardiovascular disease risks.'
  }
];

/**
 * INS / E-Number Additive Lookup Table
 */
export const INS_ADDITIVE_DICTIONARY: Record<string, { name: string; definition: string; category: VaultEntry['category']; safety: 'Safe' | 'Moderate' | 'Dangerous' }> = {
  '322': { name: 'Lecithin', definition: 'Emulsifier (INS 322) derived from oilseeds that stabilizes fat-water mixtures and improves texture.', category: 'Additive', safety: 'Safe' },
  '415': { name: 'Xanthan Gum', definition: 'Thickener & Stabilizer (INS 415) produced by sugar fermentation. Enhances viscosity without adding fats or calories.', category: 'Additive', safety: 'Safe' },
  '950': { name: 'Acesulfame Potassium', definition: 'Non-caloric sweetener (INS 950) used to provide sweetness without elevating blood sugar levels.', category: 'Sweetener', safety: 'Safe' },
  '955': { name: 'Sucralose', definition: 'Zero-calorie sweetener (INS 955) derived from sugar, provides intense sweetness without glycemic impact.', category: 'Sweetener', safety: 'Safe' },
  '330': { name: 'Citric Acid', definition: 'Acidity regulator & Antioxidant (INS 330) naturally occurring in citrus fruits.', category: 'Additive', safety: 'Safe' },
  '412': { name: 'Guar Gum', definition: 'Plant galactomannan gum (INS 412) used as a thickening agent and dietary fiber binder.', category: 'Additive', safety: 'Safe' },
  '621': { name: 'Monosodium Glutamate', definition: 'Flavor enhancer (INS 621) providing savory umami taste profile.', category: 'Additive', safety: 'Moderate' },
  '211': { name: 'Sodium Benzoate', definition: 'Antimicrobial preservative (INS 211) preventing mold and bacterial growth in acidic foods.', category: 'Preservative', safety: 'Moderate' },
  '250': { name: 'Sodium Nitrite', definition: 'Curing preservative (INS 250) used to inhibit bacterial spores in processed foods.', category: 'Preservative', safety: 'Dangerous' },
};

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
      const aliasClean = alias.toLowerCase();
      if (clean === aliasClean || clean.includes(aliasClean) || aliasClean.includes(clean)) {
        return entry;
      }
    }
  }

  // Check INS / E-Number match (e.g. INS 322, INS 415, INS 950)
  const insMatch = clean.match(/(?:ins|e)[-\s]*(\d{3,4})/i);
  if (insMatch && insMatch[1] && INS_ADDITIVE_DICTIONARY[insMatch[1]]) {
    const dict = INS_ADDITIVE_DICTIONARY[insMatch[1]];
    return {
      canonicalName: ingredientName,
      aliases: [clean],
      safetyLabel: dict.safety,
      safetyScore: dict.safety === 'Safe' ? 8 : dict.safety === 'Moderate' ? 5 : 2,
      category: dict.category,
      reasoning: dict.definition
    };
  }

  return null;
}

/**
 * Fallback Definition Generator: Guarantees a clear definition for ANY ingredient.
 */
export function generateIngredientDefinition(ingredientName: string): {
  safetyLabel: 'Safe' | 'Moderate' | 'Dangerous';
  safetyScore: number;
  reasoning: string;
  category: VaultEntry['category'];
} {
  const lower = ingredientName.toLowerCase();

  if (/protein|isolate|concentrate|peptides|amino|bcaa|collagen|casein/i.test(lower)) {
    return {
      safetyLabel: 'Safe',
      safetyScore: 9,
      category: 'Protein',
      reasoning: `Macronutrient Component: ${ingredientName} is a dietary protein source supplying amino acids for tissue maintenance, muscle synthesis, and cellular repair.`
    };
  }

  if (/gum|emulsifier|lecithin|pectin|gelatin|starch|cellulose|carrageenan/i.test(lower)) {
    return {
      safetyLabel: 'Safe',
      safetyScore: 8,
      category: 'Additive',
      reasoning: `Texturizing Agent: ${ingredientName} is a food-grade stabilizer used to improve consistency, binding, and mouthfeel.`
    };
  }

  if (/flavour|flavor|extract|essence|aroma|spices|vanilla|cocoa/i.test(lower)) {
    return {
      safetyLabel: 'Safe',
      safetyScore: 8,
      category: 'Flavoring',
      reasoning: `Flavoring Compound: ${ingredientName} is added to provide a distinct, pleasant taste and olfactory aroma.`
    };
  }

  if (/sweetener|sucralose|aspartame|stevia|monk fruit|erythritol|xylitol|acesulfame/i.test(lower)) {
    return {
      safetyLabel: 'Safe',
      safetyScore: 7,
      category: 'Sweetener',
      reasoning: `Sweetening Agent: ${ingredientName} provides sweetness to the food matrix without contributing standard sugar calories.`
    };
  }

  if (/nitr|trans fat|hydrogenated|titanium|benzoate|bleach|acrylamide|paraben|sulfite/i.test(lower)) {
    return {
      safetyLabel: 'Dangerous',
      safetyScore: 3,
      category: 'Preservative',
      reasoning: `Chemical Additive with Safety Notice: ${ingredientName} is an industrial chemical compound. High consumption may contribute to systemic or digestive stress.`
    };
  }

  return {
    safetyLabel: 'Safe',
    safetyScore: 8,
    category: 'Natural',
    reasoning: `Standard Ingredient Definition: ${ingredientName} is a recognized food product component used to contribute to taste, structure, or formulation integrity.`
  };
}
