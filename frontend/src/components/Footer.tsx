import type { LegalSlug } from '../config/legal';

interface FooterProps {
  onNavigate: (tab: LegalSlug) => void;
}

export function Footer({ onNavigate }: FooterProps) {
  const handleLegalClick = (e: React.MouseEvent<HTMLAnchorElement>, slug: LegalSlug) => {
    e.preventDefault();
    onNavigate(slug);
  };

  return (
    <footer className="w-full bg-slate-950 border-t border-slate-800/80 mt-12 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 flex flex-col md:flex-row justify-between items-center md:items-start gap-6">
        
        {/* Brand & Copy */}
        <div className="flex flex-col items-center md:items-start gap-2">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Z-SeHealth Logo" className="w-6 h-6 object-contain opacity-80" />
            <span className="font-outfit font-bold text-lg text-slate-300">Z-SeHealth</span>
          </div>
          <p className="text-sm text-slate-500 text-center md:text-left">
            &copy; 2026 Z-SeHealth. Academic Innovation under PRAGATI-2026.
          </p>
          <p className="text-xs text-emerald-500/80 font-mono tracking-wide mt-1">
            DPDP Act (2023) Aligned | Razorpay Integration
          </p>
        </div>

        {/* Links */}
        <div className="flex flex-col items-center md:items-end gap-4">
          <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm font-medium text-slate-400" aria-label="Legal & Support Navigation">
            <a 
              href="/privacy" 
              onClick={(e) => handleLegalClick(e, 'privacy')} 
              className="hover:text-emerald-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded"
            >
              Privacy Policy
            </a>
            <a 
              href="/terms" 
              onClick={(e) => handleLegalClick(e, 'terms')} 
              className="hover:text-emerald-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded"
            >
              Terms & Conditions
            </a>
            <a 
              href="/refund" 
              onClick={(e) => handleLegalClick(e, 'refund')} 
              className="hover:text-emerald-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded"
            >
              Refunds
            </a>
            <a 
              href="/cookies" 
              onClick={(e) => handleLegalClick(e, 'cookies')} 
              className="hover:text-emerald-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded"
            >
              Cookie Policy
            </a>
          </nav>
          
          <a 
            href="mailto:support.zsehealth@gmail.com" 
            className="text-sm text-slate-500 hover:text-emerald-400 transition-colors flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded"
          >
            support.zsehealth@gmail.com
          </a>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
