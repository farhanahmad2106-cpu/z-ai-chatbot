import { useState, useEffect, useCallback } from 'react';
import {
  Check,
  X,
  AlertTriangle,
  RefreshCw,
  Image as ImageIcon,
  CheckCircle2,
  FileEdit,
  ShieldCheck,
  Search,
} from 'lucide-react';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { API_BASE } from '../../../config';

interface FoodItem {
  id: string;
  name: string;
  brand?: string;
  safety_score?: number;
  status?: string;
  is_verified?: boolean;
  ingredients?: Array<{ name: string; safety?: string; description?: string } | string>;
  additives?: string[];
  allergens?: string[];
  warnings?: string[];
  estimated_macros?: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
  };
  image_url?: string;
  raw_ocr_text?: string;
  scanned_by?: string;
  source?: string;
}

export default function FoodModerationTab() {
  const { getAdminAuthHeader, permissions } = useAdminAuth();
  const [foods, setFoods] = useState<FoodItem[]>([]);
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [searchFilter, setSearchFilter] = useState<string>('');
  
  // Edit state
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editName, setEditName] = useState<string>('');
  const [editBrand, setEditBrand] = useState<string>('');
  const [editScore, setEditScore] = useState<number>(80);

  // Reject reason modal
  const [rejectModalOpen, setRejectModalOpen] = useState<boolean>(false);
  const [rejectReason, setRejectReason] = useState<string>('');

  const fetchPendingFoods = useCallback(async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const headers = await getAdminAuthHeader();
      const res = await fetch(`${API_BASE}/api/admin/foods/pending`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list: FoodItem[] = data.foods || [];
      setFoods(list);
      if (list.length > 0 && !selectedFood) {
        setSelectedFood(list[0]);
        setEditName(list[0].name || '');
        setEditBrand(list[0].brand || '');
        setEditScore(list[0].safety_score || 80);
      } else if (list.length === 0) {
        setSelectedFood(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch pending food queue';
      setStatusMessage({ text: msg, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [getAdminAuthHeader, selectedFood]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchPendingFoods();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchPendingFoods]);

  const handleSelectFood = (food: FoodItem) => {
    setSelectedFood(food);
    setIsEditing(false);
    setEditName(food.name || '');
    setEditBrand(food.brand || '');
    setEditScore(food.safety_score || 80);
  };

  const handleApprove = async () => {
    if (!selectedFood) return;
    setActionLoading(true);
    setStatusMessage(null);

    try {
      const headers = await getAdminAuthHeader();
      const updatedData = isEditing
        ? {
            name: editName.trim(),
            brand: editBrand.trim(),
            safety_score: editScore,
          }
        : undefined;

      const res = await fetch(`${API_BASE}/api/admin/foods/${selectedFood.id}/approve`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'approve',
          updated_data: updatedData,
        }),
      });

      if (!res.ok) throw new Error(`Approval failed with status ${res.status}`);

      setStatusMessage({
        text: `Successfully approved "${editName || selectedFood.name}" into the global searchable database!`,
        type: 'success',
      });

      // Remove approved item from list
      const remaining = foods.filter((f) => f.id !== selectedFood.id);
      setFoods(remaining);
      setSelectedFood(remaining.length > 0 ? remaining[0] : null);
      setIsEditing(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Approval failed';
      setStatusMessage({ text: msg, type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selectedFood) return;
    setActionLoading(true);
    setStatusMessage(null);

    try {
      const headers = await getAdminAuthHeader();
      const res = await fetch(`${API_BASE}/api/admin/foods/${selectedFood.id}/reject`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'reject',
          rejection_reason: rejectReason || 'Failed quality or safety verification standards',
        }),
      });

      if (!res.ok) throw new Error(`Rejection failed with status ${res.status}`);

      setStatusMessage({
        text: `Rejected "${selectedFood.name}". Archived from public queue.`,
        type: 'success',
      });

      setRejectModalOpen(false);
      setRejectReason('');

      const remaining = foods.filter((f) => f.id !== selectedFood.id);
      setFoods(remaining);
      setSelectedFood(remaining.length > 0 ? remaining[0] : null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Rejection failed';
      setStatusMessage({ text: msg, type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const filteredFoods = foods.filter((f) =>
    (f.name || '').toLowerCase().includes(searchFilter.toLowerCase()) ||
    (f.brand || '').toLowerCase().includes(searchFilter.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Tab Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-[11px] font-mono uppercase tracking-widest text-amber-400 font-bold">
              OCR Verification Queue // Crowdsourced Ingestion
            </span>
          </div>
          <h2 className="text-2xl font-black font-outfit uppercase tracking-tight text-white mt-1">
            Food Moderation & Safety Review
          </h2>
          <p className="text-xs text-slate-400 font-mono">
            Approve crowdsourced OCR extractions to index them globally in the 0ms SWR search
          </p>
        </div>

        <button
          onClick={fetchPendingFoods}
          disabled={loading}
          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold uppercase tracking-wider text-slate-200 rounded-xl transition-all flex items-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
          Refresh Queue
        </button>
      </div>

      {statusMessage && (
        <div
          className={`p-4 rounded-2xl border text-xs font-mono flex items-center gap-3 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Main Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: List of items in queue */}
        <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-5">
          <div className="mb-4">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
              <input
                type="text"
                placeholder="Search pending queue..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
          </div>

          <div className="text-[11px] font-mono text-slate-500 uppercase tracking-widest px-2 mb-2 flex justify-between">
            <span>Submissions ({filteredFoods.length})</span>
            <span>Safety Score</span>
          </div>

          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {filteredFoods.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-slate-800 rounded-2xl text-slate-600 text-xs font-mono">
                {loading ? 'Fetching submissions...' : 'No pending foods in queue.'}
              </div>
            ) : (
              filteredFoods.map((food) => {
                const isSelected = selectedFood?.id === food.id;
                return (
                  <div
                    key={food.id}
                    onClick={() => handleSelectFood(food)}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex justify-between items-center ${
                      isSelected
                        ? 'bg-slate-950 border-emerald-500/50 shadow-lg shadow-emerald-950/20'
                        : 'bg-slate-950/50 border-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    <div className="min-w-0 flex-1 pr-3">
                      <div className="text-xs font-bold text-white truncate font-outfit">
                        {food.name || 'Untitled Scan'}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate mt-0.5">
                        {food.brand || 'Unspecified Brand'}
                      </div>
                    </div>
                    <span
                      className={`text-xs font-mono font-bold px-2 py-1 rounded-lg border ${
                        (food.safety_score ?? 80) >= 70
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : (food.safety_score ?? 80) >= 40
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                      }`}
                    >
                      {food.safety_score ?? 80}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Detailed Side-by-Side Review Panel */}
        <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7">
          {selectedFood ? (
            <div className="space-y-6">
              {/* Product Header & Actions */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6 border-b border-slate-800">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full bg-slate-950 border border-slate-800 text-slate-400">
                      ID: {selectedFood.id.slice(0, 12)}
                    </span>
                    {selectedFood.source && (
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {selectedFood.source}
                      </span>
                    )}
                  </div>
                  {isEditing ? (
                    <div className="space-y-2 mt-3">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Food Item Name"
                        className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-base font-bold text-white w-full"
                      />
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={editBrand}
                          onChange={(e) => setEditBrand(e.target.value)}
                          placeholder="Brand Name"
                          className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1 text-xs text-slate-300 flex-1"
                        />
                        <input
                          type="number"
                          value={editScore}
                          onChange={(e) => setEditScore(Number(e.target.value))}
                          placeholder="Score"
                          className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1 text-xs text-emerald-400 font-mono w-24"
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      <h3 className="text-2xl font-black font-outfit uppercase tracking-tight text-white mt-2">
                        {selectedFood.name}
                      </h3>
                      <p className="text-xs text-slate-400 font-medium">
                        Brand: <span className="text-slate-200">{selectedFood.brand || 'N/A'}</span>
                      </p>
                    </>
                  )}
                </div>

                {/* Approve / Reject / Edit Action Buttons */}
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => setIsEditing(!isEditing)}
                    className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 transition-all cursor-pointer"
                    title={isEditing ? 'Cancel Editing' : 'Edit Before Approval'}
                  >
                    <FileEdit className="w-4 h-4 text-emerald-400" />
                  </button>
                  <button
                    onClick={() => setRejectModalOpen(true)}
                    disabled={actionLoading || !permissions.canApproveFoods}
                    className="px-4 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    <X className="w-4 h-4 text-rose-400" />
                    Reject
                  </button>
                  <button
                    onClick={handleApprove}
                    disabled={actionLoading || !permissions.canApproveFoods}
                    className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 active:scale-95 shadow-lg shadow-emerald-950 cursor-pointer disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                    Approve to Global DB
                  </button>
                </div>
              </div>

              {/* Side-by-Side Inspection Panels */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left: OCR Image & Text Visualizer */}
                <div className="space-y-4">
                  <div className="text-xs font-black uppercase tracking-widest text-slate-400">
                    Raw Vision Label / OCR Feed
                  </div>
                  {selectedFood.image_url ? (
                    <div className="rounded-2xl border border-slate-800 overflow-hidden bg-slate-950 aspect-video flex items-center justify-center relative">
                      <img
                        src={selectedFood.image_url}
                        alt="Product back of pack"
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-slate-800/80 bg-slate-950 p-6 flex flex-col items-center justify-center text-center">
                      <ImageIcon className="w-8 h-8 text-slate-600 mb-2" />
                      <span className="text-xs font-mono text-slate-500">
                        Binary image payload stored as ephemeral OCR stream
                      </span>
                    </div>
                  )}

                  {selectedFood.raw_ocr_text && (
                    <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1">
                        OCR Raw Text Buffer
                      </div>
                      <div className="font-mono text-xs text-slate-300 max-h-32 overflow-y-auto whitespace-pre-wrap">
                        {selectedFood.raw_ocr_text}
                      </div>
                    </div>
                  )}

                  {/* Safety Score Meter */}
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-white uppercase font-outfit">
                        Safety Metric Score
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        Formula: 100 - Additives - Nutritional Risk
                      </div>
                    </div>
                    <div className="text-2xl font-black font-mono text-emerald-400">
                      {isEditing ? editScore : (selectedFood.safety_score ?? 80)}
                      <span className="text-xs text-slate-500 font-normal">/100</span>
                    </div>
                  </div>
                </div>

                {/* Right: Parsed Ingredients, Additives & Nutrition */}
                <div className="space-y-4">
                  <div className="text-xs font-black uppercase tracking-widest text-slate-400">
                    Parsed Chemical & Ingredient Data
                  </div>

                  {/* Ingredients List */}
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 max-h-52 overflow-y-auto space-y-2">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-2">
                      Parsed Ingredients
                    </div>
                    {selectedFood.ingredients && selectedFood.ingredients.length > 0 ? (
                      selectedFood.ingredients.map((ing, idx) => {
                        const name = typeof ing === 'string' ? ing : ing.name;
                        const safety = typeof ing === 'string' ? 'Safe' : ing.safety;
                        return (
                          <div
                            key={idx}
                            className="flex justify-between items-center text-xs border-b border-slate-900 pb-1.5 last:border-0"
                          >
                            <span className="text-slate-300">{name}</span>
                            <span
                              className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                                safety === 'Danger'
                                  ? 'bg-rose-500/10 text-rose-400'
                                  : safety === 'Moderate'
                                  ? 'bg-amber-500/10 text-amber-400'
                                  : 'bg-emerald-500/10 text-emerald-400'
                              }`}
                            >
                              {safety || 'Safe'}
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-xs text-slate-500 font-mono">No ingredient breakdown found.</div>
                    )}
                  </div>

                  {/* Additives / INS Chips */}
                  {selectedFood.additives && selectedFood.additives.length > 0 && (
                    <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-2">
                        Flagged INS Additives
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedFood.additives.map((add, idx) => (
                          <span
                            key={idx}
                            className="text-[11px] font-mono px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300"
                          >
                            {add}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Allergens Warning */}
                  {selectedFood.allergens && selectedFood.allergens.length > 0 && (
                    <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-rose-400 mb-2 flex items-center gap-1.5">
                        <AlertTriangle className="w-3 h-3" /> Flagged Allergens
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedFood.allergens.map((alg, idx) => (
                          <span
                            key={idx}
                            className="text-[11px] font-mono px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300"
                          >
                            {alg}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Macros Grid */}
                  {selectedFood.estimated_macros && (
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="bg-slate-950 border border-slate-800 rounded-xl p-2">
                        <div className="text-[10px] text-slate-500 font-mono">CALORIES</div>
                        <div className="text-sm font-bold font-mono text-white">
                          {selectedFood.estimated_macros.calories ?? 0}
                        </div>
                      </div>
                      <div className="bg-slate-950 border border-slate-800 rounded-xl p-2">
                        <div className="text-[10px] text-slate-500 font-mono">PROTEIN</div>
                        <div className="text-sm font-bold font-mono text-emerald-400">
                          {selectedFood.estimated_macros.protein ?? 0}g
                        </div>
                      </div>
                      <div className="bg-slate-950 border border-slate-800 rounded-xl p-2">
                        <div className="text-[10px] text-slate-500 font-mono">CARBS</div>
                        <div className="text-sm font-bold font-mono text-blue-400">
                          {selectedFood.estimated_macros.carbs ?? 0}g
                        </div>
                      </div>
                      <div className="bg-slate-950 border border-slate-800 rounded-xl p-2">
                        <div className="text-[10px] text-slate-500 font-mono">FAT</div>
                        <div className="text-sm font-bold font-mono text-amber-400">
                          {selectedFood.estimated_macros.fat ?? 0}g
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="min-h-[400px] flex flex-col items-center justify-center text-center p-8">
              <ShieldCheck className="w-12 h-12 text-slate-700 mb-3" />
              <h4 className="text-base font-bold uppercase tracking-wider text-slate-400 font-outfit">
                No Food Item Selected
              </h4>
              <p className="text-xs text-slate-500 max-w-sm mt-1">
                Select an entry from the left queue to perform side-by-side OCR review and global database approval.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Rejection Reason Modal */}
      {rejectModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl">
            <h4 className="text-lg font-bold font-outfit uppercase tracking-tight text-white mb-2">
              Reject Crowdsourced Submission
            </h4>
            <p className="text-xs text-slate-400 mb-4">
              Provide an administrative rejection note for archival audit logs.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g., Non-food item, illegible ingredient label, or duplicate entry..."
              rows={3}
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3 text-xs text-slate-200 focus:outline-none focus:border-rose-500 font-mono mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setRejectModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-bold uppercase text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={actionLoading}
                className="flex-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-xs font-bold uppercase tracking-wide disabled:opacity-50 cursor-pointer"
              >
                {actionLoading ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
