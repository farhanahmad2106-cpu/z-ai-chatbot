'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Quote } from './quotesData';
import {
  getNextQuote,
  markQuoteAsDisplayed,
  toggleSaveQuote,
  getSavedQuotes,
  QuoteRecord
} from './quoteEngine';

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
  const [currentQuote, setCurrentQuote] = useState<Quote | null>(null);
  const [quoteRecord, setQuoteRecord] = useState<QuoteRecord | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [showSavedModal, setShowSavedModal] = useState(false);
  const [savedQuotesList, setSavedQuotesList] = useState<Quote[]>([]);
  const [key, setKey] = useState(0); // For resetting 7s progress bar animation

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadNextQuote = () => {
    const { quote } = getNextQuote(currentQuote?.id);
    setCurrentQuote(quote);
    
    // Mark as displayed to trigger i = i + 1 count and 3*i days cooldown
    const updatedHistory = markQuoteAsDisplayed(quote.id);
    const updatedRecord = updatedHistory[quote.id];
    setQuoteRecord(updatedRecord);
    setIsSaved(!!updatedRecord.isSaved);
    setKey(prev => prev + 1);
  };

  // 7-second quote rotation timer while loading
  useEffect(() => {
    loadNextQuote();

    if (isLoading) {
      timerRef.current = setInterval(() => {
        loadNextQuote();
      }, 7000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  const handleNextClick = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    loadNextQuote();
    if (isLoading) {
      timerRef.current = setInterval(() => {
        loadNextQuote();
      }, 7000);
    }
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

  if (!isLoading) return null;

  // Calculate upcoming cooldown for display (3 * i days)
  const displayCount = quoteRecord?.displayCount || 1;
  const cooldownDays = displayCount * 3;

  return (
    <div style={styles.overlayContainer}>
      {/* Top Header / Navigation Bar matching Z-SeHealth */}
      <header style={styles.header}>
        <div style={styles.brandRow}>
          <div style={styles.logoBadge}>
            <span style={styles.logoIcon}>Z</span>
          </div>
          <span style={styles.brandTitle}>Z-SeHealth</span>
        </div>

        <nav style={styles.navLinks}>
          <span style={{ ...styles.navLink, ...styles.navActive }}>Dashboard</span>
          <span style={styles.navLink}>Search</span>
          <span style={styles.navLink}>Scan</span>
        </nav>

        <div style={styles.userProfileRow}>
          <div style={styles.streakPill}>
            <span style={styles.fireIcon}>🔥</span>
            <span>{userStreakDays} Days</span>
          </div>

          <div style={styles.avatarRow}>
            <div style={styles.avatarCircle}>{userName.charAt(0)}</div>
            <span style={styles.userName}>{userName}</span>
          </div>
        </div>
      </header>

      {/* Main Interactive Loading & Quote Deck Content */}
      <main style={styles.mainContent}>
        
        {/* Interactive Motivational Quote Card */}
        <div style={styles.quoteCard}>
          <div style={styles.quoteHeader}>
            <span style={styles.quoteCategory}>
              {currentQuote?.category.toUpperCase() || 'WELLNESS'}
            </span>
            <span style={styles.cooldownBadge} title={`After this view, quote won't appear for 3 * ${displayCount} = ${cooldownDays} days`}>
              ⏳ Cooldown: {cooldownDays} Days (View #{displayCount})
            </span>
          </div>

          <p style={styles.quoteText}>
            &ldquo;{currentQuote?.text || 'Loading inspirational quote...'}&rdquo;
          </p>

          <p style={styles.quoteAuthor}>— {currentQuote?.author || 'Z-SeHealth'}</p>

          {/* 7-Second Visual Progress Bar */}
          <div style={styles.progressTrack}>
            <div key={key} style={styles.progressBarFill} />
          </div>

          {/* Interactive Action Bar */}
          <div style={styles.quoteActions}>
            <button
              onClick={handleToggleSave}
              style={{
                ...styles.actionBtn,
                borderColor: isSaved ? '#ec4899' : '#374151',
                color: isSaved ? '#f472b6' : '#9ca3af'
              }}
            >
              {isSaved ? '💖 Saved' : '❤️ Save Quote'}
            </button>

            <button onClick={handleNextClick} style={styles.nextBtn}>
              Next Quote ➔
            </button>

            <button onClick={handleOpenSavedModal} style={styles.savedDeckBtn}>
              🔖 Saved Deck ({getSavedQuotes().length})
            </button>
          </div>
        </div>

        {/* Shimmer Skeleton Placeholder Grid */}
        <div style={styles.skeletonGrid}>
          <div style={styles.skeletonCard} />
          <div style={styles.skeletonCard} />
          <div style={styles.skeletonCard} />
          <div style={styles.skeletonCard} />
        </div>

        <div style={styles.loadingSpinnerRow}>
          <div style={styles.spinnerCircle} />
          <span style={styles.loadingLabel}>LOADING DASHBOARD...</span>
        </div>
      </main>

      {/* Saved Quotes Deck Modal */}
      {showSavedModal && (
        <div style={styles.modalOverlay} onClick={() => setShowSavedModal(false)}>
          <div style={styles.modalCard} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>💖 Your Saved Quotes Deck</h3>
              <button style={styles.closeBtn} onClick={() => setShowSavedModal(false)}>✕</button>
            </div>

            <div style={styles.modalList}>
              {savedQuotesList.length === 0 ? (
                <p style={styles.emptySavedText}>No saved quotes yet. Click &quot;Save Quote&quot; while loading!</p>
              ) : (
                savedQuotesList.map((q) => (
                  <div key={q.id} style={styles.savedQuoteItem}>
                    <p style={styles.savedQuoteText}>&ldquo;{q.text}&rdquo;</p>
                    <span style={styles.savedQuoteAuthor}>— {q.author}</span>
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

const styles = {
  overlayContainer: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: '#090d16',
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column' as const,
    color: '#ffffff',
    fontFamily: 'Inter, system-ui, sans-serif'
  },
  header: {
    height: '64px',
    backgroundColor: '#0d1322',
    borderBottom: '1px solid #1e293b',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 32px'
  },
  brandRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  logoBadge: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 12px rgba(16, 185, 129, 0.4)'
  },
  logoIcon: {
    fontWeight: '900',
    fontSize: '18px',
    color: '#ffffff'
  },
  brandTitle: {
    fontSize: '20px',
    fontWeight: '800',
    letterSpacing: '-0.5px',
    color: '#ffffff'
  },
  navLinks: {
    display: 'flex',
    gap: '32px'
  },
  navLink: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#94a3b8',
    cursor: 'pointer'
  },
  navActive: {
    color: '#10b981',
    fontWeight: '700',
    borderBottom: '2px solid #10b981',
    paddingBottom: '4px'
  },
  userProfileRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px'
  },
  streakPill: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    border: '1px solid rgba(245, 158, 11, 0.3)',
    borderRadius: '20px',
    padding: '4px 12px',
    fontSize: '13px',
    fontWeight: '700',
    color: '#f59e0b'
  },
  fireIcon: {
    fontSize: '14px'
  },
  avatarRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  avatarCircle: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    backgroundColor: '#3b82f6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
    fontSize: '14px',
    color: '#ffffff'
  },
  userName: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#e2e8f0'
  },
  mainContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px',
    gap: '36px',
    maxWidth: '900px',
    width: '100%',
    margin: '0 auto'
  },
  quoteCard: {
    width: '100%',
    backgroundColor: '#0f172a',
    border: '1.5px solid #1e293b',
    borderRadius: '16px',
    padding: '32px',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px'
  },
  quoteHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  quoteCategory: {
    fontSize: '11px',
    fontWeight: '800',
    letterSpacing: '1px',
    color: '#10b981',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    padding: '4px 10px',
    borderRadius: '6px'
  },
  cooldownBadge: {
    fontSize: '11px',
    color: '#94a3b8',
    backgroundColor: '#1e293b',
    padding: '4px 10px',
    borderRadius: '6px'
  },
  quoteText: {
    fontSize: '20px',
    fontWeight: '600',
    lineHeight: '30px',
    color: '#f8fafc',
    margin: 0
  },
  quoteAuthor: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#64748b',
    textAlign: 'right' as const,
    margin: 0
  },
  progressTrack: {
    width: '100%',
    height: '4px',
    backgroundColor: '#1e293b',
    borderRadius: '2px',
    overflow: 'hidden',
    marginTop: '8px'
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#10b981',
    animation: 'progressFill 7s linear infinite'
  },
  quoteActions: {
    display: 'flex',
    gap: '12px',
    marginTop: '8px',
    flexWrap: 'wrap' as const
  },
  actionBtn: {
    padding: '8px 16px',
    borderRadius: '8px',
    border: '1px solid',
    backgroundColor: '#0f172a',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  },
  nextBtn: {
    padding: '8px 20px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#10b981',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
  },
  savedDeckBtn: {
    padding: '8px 16px',
    borderRadius: '8px',
    border: '1px solid #334155',
    backgroundColor: '#1e293b',
    color: '#cbd5e1',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    marginLeft: 'auto'
  },
  skeletonGrid: {
    width: '100%',
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '16px',
    opacity: 0.4
  },
  skeletonCard: {
    height: '90px',
    backgroundColor: '#1e293b',
    borderRadius: '12px',
    animation: 'pulse 1.5s ease-in-out infinite'
  },
  loadingSpinnerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  spinnerCircle: {
    width: '24px',
    height: '24px',
    border: '3px solid rgba(16, 185, 129, 0.2)',
    borderTopColor: '#10b981',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  loadingLabel: {
    fontSize: '13px',
    fontWeight: '800',
    letterSpacing: '1.5px',
    color: '#10b981'
  },
  modalOverlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000
  },
  modalCard: {
    width: '90%',
    maxWidth: '520px',
    maxHeight: '80vh',
    backgroundColor: '#0f172a',
    border: '1.5px solid #334155',
    borderRadius: '16px',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px'
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid #1e293b',
    paddingBottom: '12px'
  },
  modalTitle: {
    fontSize: '16px',
    fontWeight: '700',
    margin: 0,
    color: '#ffffff'
  },
  closeBtn: {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#94a3b8',
    fontSize: '18px',
    cursor: 'pointer'
  },
  modalList: {
    overflowY: 'auto' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
    maxHeight: '360px'
  },
  emptySavedText: {
    color: '#94a3b8',
    fontSize: '13px',
    fontStyle: 'italic',
    textAlign: 'center' as const,
    padding: '24px 0'
  },
  savedQuoteItem: {
    padding: '12px 16px',
    backgroundColor: '#1e293b',
    borderRadius: '10px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px'
  },
  savedQuoteText: {
    fontSize: '14px',
    color: '#f1f5f9',
    margin: 0
  },
  savedQuoteAuthor: {
    fontSize: '12px',
    color: '#94a3b8',
    textAlign: 'right' as const
  }
};
