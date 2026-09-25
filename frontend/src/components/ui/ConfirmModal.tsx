import React, { useEffect, useRef, useId } from 'react';
import { AlertTriangle, AlertCircle, Info, X, Loader2 } from 'lucide-react';

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'primary';
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
  closeOnBackdropClick?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  onConfirm,
  onCancel,
  isLoading = false,
  closeOnBackdropClick = true,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const isBusy = isLoading || isSubmitting;

  const baseId = useId();
  const titleId = `confirm-modal-title-${baseId}`;
  const descriptionId = `confirm-modal-description-${baseId}`;

  // Focus capture, restoration, and scroll lock
  useEffect(() => {
    if (!isOpen) return;

    // Capture currently focused element before opening
    previousActiveElementRef.current = document.activeElement as HTMLElement | null;

    // Lock body scroll
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Move focus inside dialog (prefer cancel button as safest initial control)
    const timer = setTimeout(() => {
      if (cancelButtonRef.current) {
        cancelButtonRef.current.focus();
      } else if (dialogRef.current) {
        const focusable = dialogRef.current.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        focusable?.focus();
      }
    }, 20);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = originalOverflow;
      // Restore focus to previous active element if still connected and enabled, or safe fallback
      try {
        const prev = previousActiveElementRef.current;
        if (
          prev &&
          typeof prev.focus === 'function' &&
          document.contains(prev) &&
          !prev.hasAttribute('disabled')
        ) {
          prev.focus();
        } else if (document.body && typeof document.body.focus === 'function') {
          document.body.focus();
        }
      } catch {
        // Safe fallback - avoid throwing if opener element was unmounted
      }
    };
  }, [isOpen]);

  // Keyboard navigation: Escape key and Tab focus trapping
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!isBusy) {
          e.preventDefault();
          onCancel();
        }
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href]:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])'
        );
        const focusableArray = Array.from(focusables);
        if (focusableArray.length === 0) {
          e.preventDefault();
          return;
        }

        const firstElement = focusableArray[0];
        const lastElement = focusableArray[focusableArray.length - 1];

        if (focusableArray.length === 1) {
          e.preventDefault();
          firstElement.focus();
          return;
        }

        if (e.shiftKey) {
          if (document.activeElement === firstElement || !dialogRef.current.contains(document.activeElement)) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement || !dialogRef.current.contains(document.activeElement)) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isBusy, onCancel]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && closeOnBackdropClick && !isBusy) {
      onCancel();
    }
  };

  const handleConfirm = async () => {
    if (isBusy) return;
    try {
      const result = onConfirm();
      if (result && typeof (result as Promise<void>).then === 'function') {
        setIsSubmitting(true);
        await result;
      }
    } finally {
      if (isMountedRef.current) {
        setIsSubmitting(false);
      }
    }
  };

  const getVariantStyles = () => {
    switch (variant) {
      case 'danger':
        return {
          icon: <AlertTriangle className="w-6 h-6 text-rose-400" aria-hidden="true" />,
          iconBg: 'bg-rose-500/10 border-rose-500/20 text-rose-400',
          confirmBtn:
            'bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-950/40 border border-rose-400/30',
        };
      case 'warning':
        return {
          icon: <AlertCircle className="w-6 h-6 text-amber-400" aria-hidden="true" />,
          iconBg: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
          confirmBtn:
            'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-950/40 border border-amber-400/30',
        };
      case 'primary':
      default:
        return {
          icon: <Info className="w-6 h-6 text-emerald-400" aria-hidden="true" />,
          iconBg: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
          confirmBtn:
            'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-950/40 border border-emerald-400/30',
        };
    }
  };

  const { icon, iconBg, confirmBtn } = getVariantStyles();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-in fade-in duration-200 motion-reduce:animate-none"
      onClick={handleBackdropClick}
      data-testid="confirm-modal-backdrop"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl font-manrope animate-in zoom-in-95 duration-200 motion-reduce:animate-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onCancel}
          disabled={isBusy}
          className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          aria-label="Close dialog"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Icon & Heading */}
        <div className="flex items-start gap-4 mb-4">
          <div className={`p-3 rounded-2xl border shrink-0 ${iconBg}`}>{icon}</div>
          <div className="pt-1 pr-6">
            <h2 id={titleId} className="text-xl font-bold font-outfit text-white leading-tight">
              {title}
            </h2>
          </div>
        </div>

        {/* Message */}
        <div className="mb-6">
          <p id={descriptionId} className="text-sm text-slate-300 leading-relaxed">
            {message}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800/80">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            disabled={isBusy}
            className="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition-all text-xs font-bold uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer active:scale-95"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isBusy}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-95 flex items-center gap-2 ${confirmBtn}`}
          >
            {isBusy && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
            <span>{confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
