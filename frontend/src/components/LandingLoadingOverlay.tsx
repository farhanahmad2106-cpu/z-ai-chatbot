import React, { useState, useEffect, useRef } from 'react';
import { Quote } from '../quotesData';
import {
  getNextQuote,
  markQuoteAsDisplayed,
  toggleSaveQuote,
  getSavedQuotes,
  QuoteRecord
} from '../quoteEngine';
import { Heart, Sparkles, Bookmark, ArrowRight, X, Flame } from 'lucide-react';


// Helper to calculate dynamic quote display duration:
// 8 seconds for short/single line quotes, 15 seconds for long or comma-separated/multi-sentence quotes.
const getQuoteDurationSeconds = (quoteText?: string): number => {
  if (!quoteText) return 8;
  const trimmed = quoteText.trim();
  const isLongOrMultiClause =
    trimmed.includes(',') ||
    trimmed.includes(';') ||
    (trimmed.match(/[.!?]/g) || []).length > 1 ||
    trimmed.length > 60;
  return isLongOrMultiClause ? 15 : 8;
};

interface InteractiveQuoteCardProps {
  userStreakDays?: number;
}

export const InteractiveQuoteCard: React.FC<InteractiveQuoteCardProps> = ({
  userStreakDays = 1
}) => {
  const [currentQuote, setCurrentQuote] = useState<Quote | null>(null);
  const [quoteRecord, setQuoteRecord] = useState<QuoteRecord | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [showSavedModal, setShowSavedModal] = useState(false);
  const [savedQuotesList, setSavedQuotesList] = useState<Quote[]>([]);
  const [key, setKey] = useState(0);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadNextQuote = () => {
    const { quote } = getNextQuote(currentQuote?.id);
    setCurrentQuote(quote);

    const updatedHistory = markQuoteAsDisplayed(quote.id);
    const updatedRecord = updatedHistory[quote.id];
    setQuoteRecord(updatedRecord);
    setIsSaved(!!updatedRecord?.isSaved);
    setKey(prev => prev + 1);
  };

  const currentDurationSec = getQuoteDurationSeconds(currentQuote?.text);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadNextQuote();
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!currentQuote) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      loadNextQuote();
    }, currentDurationSec * 1000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuote]);

  const handleNextClick = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    loadNextQuote();
  };

  const handleToggleSave = () => {
    if (!currentQuote) return;
    const newSaved = toggleSaveQuote(currentQuote.id);
    setIsSaved(newSaved);
  };

  const handleOpenSavedModal = () => {
    setSavedQuotesList(getSavedQuotes());
    setShowSavedModal(true);
  };

  const displayCount = quoteRecord?.displayCount || 1;
  const cooldownDays = displayCount * 3;

  return (
    <div className="w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-5 relative overflow-hidden backdrop-blur-xl mb-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-extrabold tracking-wider text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-md uppercase border border-emerald-500/20">
            ✨ {currentQuote?.category || 'WELLNESS'}
          </span>
          <div className="flex items-center gap-1 bg-amber-500/10 border border-amber-500/30 rounded-full px-2.5 py-0.5 text-xs font-bold text-amber-400">
            <Flame className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
            <span>{userStreakDays} Days Streak</span>
          </div>
        </div>

        <span className="text-[11px] font-semibold text-slate-400 bg-slate-800/80 px-3 py-1 rounded-md border border-slate-700/50">
          ⏳ Cooldown Rule: {cooldownDays} Days (View #{displayCount})
        </span>
      </div>

      {/* Quote Content */}
      <p className="text-lg sm:text-xl font-bold text-slate-100 leading-relaxed italic text-left">
        &ldquo;{currentQuote?.text || 'Loading motivational quote...'}&rdquo;
      </p>

      <p className="text-xs sm:text-sm font-semibold text-slate-400 text-right">
        — {currentQuote?.author || 'Z-SeHealth'}
      </p>

      {/* 7-Second Animated Progress Bar */}
      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          key={key}
          className="h-full bg-emerald-500 transition-all"
          style={{
            animation: `progressFill ${currentDurationSec}s linear 1 forwards`
          }}
        />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          onClick={handleToggleSave}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
            isSaved
              ? 'border-rose-500/50 bg-rose-500/10 text-rose-400'
              : 'border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Heart className={`w-4 h-4 ${isSaved ? 'fill-rose-400 text-rose-400' : ''}`} />
          <span>{isSaved ? 'Saved to Deck' : 'Save Quote'}</span>
        </button>

        <button
          onClick={handleNextClick}
          className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs transition-all shadow-lg shadow-emerald-500/20"
        >
          <span>Next Quote</span>
          <ArrowRight className="w-4 h-4" />
        </button>

        <button
          onClick={handleOpenSavedModal}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-700 bg-slate-800/40 text-slate-300 hover:bg-slate-800 text-xs font-semibold sm:ml-auto"
        >
          <Bookmark className="w-4 h-4 text-emerald-400" />
          <span>Saved Deck ({getSavedQuotes().length})</span>
        </button>
      </div>

      {/* Saved Quotes Modal */}
      {showSavedModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowSavedModal(false)}
        >
          <div
            className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 max-h-[80vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Bookmark className="w-5 h-5 text-rose-400 fill-rose-400" />
                <span>Your Saved Quotes Deck</span>
              </h3>
              <button
                onClick={() => setShowSavedModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto space-y-3 flex-1 pr-1 text-left">
              {savedQuotesList.length === 0 ? (
                <p className="text-center text-sm text-slate-500 py-8 italic">
                  No saved quotes yet. Click &quot;Save Quote&quot; on any quote!
                </p>
              ) : (
                savedQuotesList.map((q) => (
                  <div key={q.id} className="p-4 bg-slate-800/60 rounded-2xl border border-slate-700/50 space-y-1">
                    <p className="text-sm font-semibold text-slate-200">&ldquo;{q.text}&rdquo;</p>
                    <span className="text-xs font-medium text-slate-400 block text-right">— {q.author}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface LandingLoadingOverlayProps {
  isLoading: boolean;
  userStreakDays?: number;
  userName?: string;
}

export const LandingLoadingOverlay: React.FC<LandingLoadingOverlayProps> = ({
  isLoading,
  userStreakDays = 0,
  userName = 'Farhan Ahmad'
}) => {
  if (!isLoading) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col justify-between text-white font-sans overflow-y-auto">
      {/* Top Header */}
      <header className="h-16 bg-slate-900/90 border-b border-slate-800/80 px-6 flex items-center justify-between backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <span className="font-extrabold text-lg text-white">Z</span>
          </div>
          <span className="font-extrabold text-xl tracking-tight text-white">Z-SeHealth</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 rounded-full px-3 py-1 text-xs font-bold text-amber-400">
            <Flame className="w-4 h-4 fill-amber-400 text-amber-400" />
            <span>{userStreakDays} Days</span>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center font-bold text-sm text-white">
              {userName.charAt(0)}
            </div>
            <span className="text-xs font-semibold text-slate-300 hidden sm:inline">{userName}</span>
          </div>
        </div>
      </header>

      {/* Main Quote Deck Container */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 max-w-3xl w-full mx-auto space-y-8 my-auto">
        <InteractiveQuoteCard userStreakDays={userStreakDays} />

        <div className="flex items-center gap-3 pt-4">
          <Sparkles className="w-5 h-5 text-emerald-400 animate-spin" />
          <span className="text-xs font-extrabold tracking-widest text-emerald-400 uppercase animate-pulse">
            LOADING DASHBOARD...
          </span>
        </div>
      </main>
    </div>
  );
};
