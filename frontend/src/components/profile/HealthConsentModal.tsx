import { useState, useEffect, useRef } from 'react';
import { ShieldCheck, X, AlertCircle } from 'lucide-react';

interface HealthConsentModalProps {
  isOpen: boolean;
  onDecline: () => void;
  onConsentAndSave: () => Promise<void>;
  isSubmitting?: boolean;
}

export default function HealthConsentModal({
  isOpen,
  onDecline,
  onConsentAndSave,
  isSubmitting = false
}: HealthConsentModalProps) {
  const [consentChecked, setConsentChecked] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const checkboxRef = useRef<HTMLInputElement>(null);

  // Reset checkbox state when modal opens
  useEffect(() => {
    if (isOpen) {
      setConsentChecked(false);
    }
  }, [isOpen]);

  // Focus management: Trap focus inside modal & listen for Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onDecline();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Initial focus on the checkbox
    const timer = setTimeout(() => {
      checkboxRef.current?.focus();
    }, 50);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [isOpen, onDecline]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[100] flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="health-vault-consent-title"
    >
      <div 
        ref={modalRef}
        className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-3xl p-6 sm:p-7 space-y-5 shadow-2xl animate-in fade-in zoom-in-95 my-8"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 
                id="health-vault-consent-title"
                className="text-xl font-bold font-outfit text-white tracking-tight"
              >
                Health Profile Data Consent
              </h2>
              <p className="text-xs text-emerald-400/90 font-mono mt-0.5">
                DPDP Act (2023) Aligned Consent Gate
              </p>
            </div>
          </div>
          <button
            onClick={onDecline}
            disabled={isSubmitting}
            className="p-2 text-gray-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors focus-visible:outline-2 focus-visible:outline-emerald-400"
            aria-label="Decline and close health consent modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Information Body */}
        <div className="max-h-[50vh] overflow-y-auto pr-1 space-y-4 text-xs text-gray-300 leading-relaxed custom-scrollbar">
          <p className="text-slate-200 font-medium">
            Z-SeHealth uses your health information to personalise food safety scores and flag ingredients that may conflict with your medical conditions or severe allergies.
          </p>

          <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-2">
            <p className="font-bold text-slate-100 flex items-center gap-1.5">
              <span>📋</span> Data Categories Collected:
            </p>
            <ul className="list-disc list-inside text-gray-400 space-y-1 pl-1">
              <li>Medical conditions (e.g., Diabetes, Hypertension, CVD, Asthma, PCOS)</li>
              <li>Severe allergies & intolerances (e.g., Peanuts, Dairy, Gluten, Soy, Shellfish)</li>
              <li>Biometrics: Age, gender, height, weight, activity level, health goals</li>
            </ul>
          </div>

          <div className="space-y-2">
            <p className="font-bold text-slate-100">🎯 Purpose of Processing:</p>
            <p className="text-gray-400">
              To calculate personalised Safety Score deductions based on your health profile and to flag potentially contraindicated ingredients during scanning and search.
            </p>
          </div>

          <div className="space-y-2">
            <p className="font-bold text-slate-100">🔒 Storage & Third-Party Protections:</p>
            <ul className="list-disc list-inside text-gray-400 space-y-1 pl-1">
              <li>Stored in MongoDB Atlas tied to your authenticated account.</li>
              <li>Synchronized to your browser local cache as a convenience cache.</li>
              <li><strong>Zero External AI Transmission:</strong> Health profile data is never transmitted to external AI providers (Sarvam AI, NVIDIA, Google Gemini). Used strictly by internal scoring logic.</li>
              <li><strong>No Data Sales:</strong> Your health data is never sold to third-party advertisers or data brokers.</li>
            </ul>
          </div>

          <div className="space-y-2">
            <p className="font-bold text-slate-100">↩️ Consent Withdrawal & Deletion:</p>
            <p className="text-gray-400">
              You may withdraw consent and clear your health data at any time via the "Delete Health Profile" button in your Profile. Previously generated scores are not retroactively recalculated.
            </p>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-start gap-2.5 text-amber-300">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
            <p className="text-[11px] leading-relaxed">
              <strong>Algorithmic Limitation:</strong> Food safety scores are educational indicators and do not replace professional dietician advice or medical consultation.
            </p>
          </div>
        </div>

        {/* Explicit Checkbox (Defaults to UNCHECKED) */}
        <div className="pt-2 border-t border-slate-800">
          <label 
            htmlFor="health-vault-consent-checkbox"
            className="flex items-start gap-3 cursor-pointer select-none group"
          >
            <input
              ref={checkboxRef}
              type="checkbox"
              id="health-vault-consent-checkbox"
              checked={consentChecked}
              onChange={(e) => setConsentChecked(e.target.checked)}
              disabled={isSubmitting}
              className="mt-1 w-5 h-5 rounded border-slate-700 bg-slate-800 text-emerald-500 focus:ring-2 focus:ring-emerald-400 focus:ring-offset-slate-900 cursor-pointer shrink-0 accent-emerald-500"
              aria-label="Consent to health data processing pursuant to DPDP Act 2023"
            />
            <span className="text-xs text-gray-300 group-hover:text-white leading-relaxed transition-colors">
              I consent to the storage and processing of my medical conditions and allergy data for personalized food safety scoring pursuant to the DPDP Act 2023. I understand this does not replace medical advice.
            </span>
          </label>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            type="button"
            onClick={onDecline}
            disabled={isSubmitting}
            className="min-h-[44px] flex-1 py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-gray-300 font-semibold text-sm transition-all active:scale-95 disabled:opacity-50 cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-400 text-center"
          >
            Decline & Cancel
          </button>
          <button
            type="button"
            onClick={onConsentAndSave}
            disabled={!consentChecked || isSubmitting}
            className="min-h-[44px] flex-1 py-3 px-4 rounded-2xl bg-emerald-500 text-slate-950 font-bold text-sm hover:bg-emerald-400 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-lg shadow-emerald-950/40 focus-visible:outline-2 focus-visible:outline-emerald-400 text-center flex items-center justify-center gap-2"
            id="health-vault-save-btn"
          >
            {isSubmitting ? (
              <>
                <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                <span>Recording Consent...</span>
              </>
            ) : (
              <span>Consent & Save Health Vault</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
