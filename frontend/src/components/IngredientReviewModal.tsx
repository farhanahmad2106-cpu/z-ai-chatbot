import { useState } from 'react';
import { X, Check, Edit2, AlertTriangle, Info } from 'lucide-react';

export interface INSAdditive {
  code: string;
  name: string;
  risk: string;
}

export interface OCRAnalysisResponse {
  product_name: string;
  raw_ocr_text: string;
  parsed_ingredients: string[];
  detected_ins_additives: INSAdditive[];
  flagged_allergens: string[];
  nutrition_per_100g: Record<string, number>;
  requires_user_review: boolean;
}

interface IngredientReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: OCRAnalysisResponse) => void;
  initialData: OCRAnalysisResponse;
}

export default function IngredientReviewModal({
  isOpen,
  onClose,
  onConfirm,
  initialData,
}: IngredientReviewModalProps) {
  const [data, setData] = useState<OCRAnalysisResponse>(initialData);

  if (!isOpen) return null;

  const handleIngredientChange = (index: number, value: string) => {
    const updated = [...data.parsed_ingredients];
    updated[index] = value;
    setData({ ...data, parsed_ingredients: updated });
  };

  const handleAllergenChange = (index: number, value: string) => {
    const updated = [...data.flagged_allergens];
    updated[index] = value;
    setData({ ...data, flagged_allergens: updated });
  };

  const handleConfirm = () => {
    onConfirm({ ...data, requires_user_review: false });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center p-4">
      <div className="w-full max-w-2xl bg-zinc-900 border-2 border-zinc-700 rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-zinc-800 bg-zinc-950">
          <div>
            <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-emerald-400" />
              Review Scan Results
            </h2>
            <p className="text-sm text-zinc-400 mt-1">Please verify the extracted information below.</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto space-y-8">
          
          {/* Ingredients Section */}
          <section>
            <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-3">Ingredients</h3>
            <div className="space-y-2">
              {data.parsed_ingredients.map((ing, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    type="text"
                    value={ing}
                    onChange={(e) => handleIngredientChange(idx, e.target.value)}
                    className="flex-1 bg-zinc-800 text-zinc-100 border border-zinc-700 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
              ))}
            </div>
          </section>

          {/* Additives Section */}
          <section>
            <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Info className="w-4 h-4 text-amber-400" />
              Detected INS Additives
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {data.detected_ins_additives.map((add, idx) => (
                <div key={idx} className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3">
                  <div className="text-xs text-zinc-500 font-mono">{add.code}</div>
                  <div className="text-sm text-zinc-200 font-medium">{add.name}</div>
                  <div className={`text-xs mt-1 font-semibold ${
                    add.risk === 'high' ? 'text-red-400' :
                    add.risk === 'moderate' ? 'text-amber-400' : 'text-emerald-400'
                  }`}>
                    {add.risk.toUpperCase()} RISK
                  </div>
                </div>
              ))}
              {data.detected_ins_additives.length === 0 && (
                <div className="text-sm text-zinc-500 col-span-2">No specific additives detected.</div>
              )}
            </div>
          </section>

          {/* Allergens Section */}
          <section>
            <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              Flagged Allergens
            </h3>
            <div className="flex flex-wrap gap-2">
              {data.flagged_allergens.map((allergen, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-full pl-3 pr-2 py-1">
                  <input
                    type="text"
                    value={allergen}
                    onChange={(e) => handleAllergenChange(idx, e.target.value)}
                    className="bg-transparent text-sm text-red-300 focus:outline-none w-20"
                  />
                </div>
              ))}
              {data.flagged_allergens.length === 0 && (
                <div className="text-sm text-zinc-500">No allergens flagged.</div>
              )}
            </div>
          </section>

        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-950 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-5 py-2.5 rounded-xl text-sm font-bold bg-emerald-500 text-zinc-950 hover:bg-emerald-400 flex items-center gap-2 transition-colors"
          >
            <Check className="w-4 h-4" />
            Confirm & Save
          </button>
        </div>
      </div>
    </div>
  );
}
