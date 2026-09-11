import { createContext, useContext, useState, ReactNode } from 'react';

interface ToastContextType {
  showToast: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Global Toast UI */}
      {toastMessage && (
        <div className="fixed bottom-6 inset-x-0 flex justify-center z-[100] animate-slide-up pointer-events-none">
          <div className="px-6 py-3 bg-emerald-600/90 backdrop-blur-xl border border-emerald-400/50 text-white rounded-full font-bold shadow-[0_10px_40px_-10px_rgba(16,185,129,0.5)] flex items-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 shrink-0">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            <span className="text-sm drop-shadow-md">{toastMessage}</span>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}
