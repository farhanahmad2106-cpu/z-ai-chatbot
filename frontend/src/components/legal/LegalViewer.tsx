import { useEffect, useState, useTransition } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  ArrowLeft, 
  Shield, 
  FileText, 
  RefreshCcw, 
  Cookie, 
  AlertCircle, 
  RotateCcw,
  Loader2
} from 'lucide-react';
import { 
  type LegalSlug, 
  LEGAL_DOCUMENTS, 
  LEGAL_SLUGS, 
  getLegalDocument 
} from '../../config/legal';

interface LegalViewerProps {
  activeDoc: LegalSlug;
  onNavigate: (doc: LegalSlug) => void;
  onBackToApp: () => void;
}

const ICON_MAP = {
  privacy: Shield,
  terms: FileText,
  refund: RefreshCcw,
  cookies: Cookie,
};

export function LegalViewer({ activeDoc, onNavigate, onBackToApp }: LegalViewerProps) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const docConfig = getLegalDocument(activeDoc);

  // Scroll to top on document change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeDoc]);

  // Load markdown file content dynamically from public static assets
  useEffect(() => {
    let isMounted = true;
    document.title = docConfig.pageTitle;

    setTimeout(() => {
      setLoading(true);
      setError(null);
    }, 0);

    fetch(docConfig.source)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: Failed to load ${docConfig.source}`);
        }
        return response.text();
      })
      .then((markdown) => {
        if (isMounted) {
          setContent(markdown);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error(`[LegalViewer] Failed to fetch legal document from ${docConfig.source}:`, err);
          setError(`Unable to load the ${docConfig.title}. Please verify your network connection.`);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [activeDoc, docConfig.source, docConfig.pageTitle, docConfig.title]);

  const handleRetry = () => {
    setLoading(true);
    setError(null);
    fetch(docConfig.source)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: Failed to load ${docConfig.source}`);
        }
        return response.text();
      })
      .then((markdown) => {
        setContent(markdown);
        setLoading(false);
      })
      .catch((err) => {
        console.error(`[LegalViewer] Retry failed for ${docConfig.source}:`, err);
        setError(`Unable to load the ${docConfig.title}. Please verify your network connection.`);
        setLoading(false);
      });
  };

  const handleLinkClick = (href: string | undefined, event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!href) return;
    
    // Check if it's an internal legal link
    const cleanHref = href.toLowerCase();
    for (const slug of LEGAL_SLUGS) {
      if (cleanHref === `/${slug}` || cleanHref === `/legal/${slug}` || cleanHref === `/legal/${slug}s`) {
        event.preventDefault();
        startTransition(() => {
          onNavigate(slug);
        });
        return;
      }
    }
  };

  return (
    <div className="max-w-6xl mx-auto flex flex-col md:flex-row gap-8 py-4 animate-in fade-in duration-300">
      
      {/* Navigation Sidebar */}
      <aside className="w-full md:w-64 flex-shrink-0">
        <div className="sticky top-24 bg-slate-900/90 backdrop-blur-md p-4 rounded-3xl border border-slate-800 shadow-xl">
          
          <button
            onClick={onBackToApp}
            className="flex items-center gap-2 text-sm font-semibold text-emerald-400 hover:text-emerald-300 transition-colors mb-6 pb-4 border-b border-slate-800 w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-xl px-2"
            aria-label="Back to Application"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to App
          </button>
          
          <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-2 px-3">
            Legal Documents
          </div>

          <nav className="flex flex-col gap-1.5" aria-label="Legal Documents Navigation">
            {LEGAL_SLUGS.map((slug) => {
              const doc = LEGAL_DOCUMENTS[slug];
              const Icon = ICON_MAP[slug];
              const isActive = activeDoc === slug;
              return (
                <button
                  key={slug}
                  onClick={() => onNavigate(slug)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center gap-3 px-3.5 py-3 rounded-2xl transition-all text-left font-medium text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500
                    ${isActive 
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold shadow-sm shadow-emerald-950' 
                      : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 border border-transparent'
                    }`}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-emerald-400' : 'text-slate-500'}`} />
                  <span className="truncate">{doc.title}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* Markdown Content Area */}
      <main className="flex-grow min-w-0 bg-slate-900/60 rounded-3xl border border-slate-800 p-6 sm:p-8 md:p-10 shadow-2xl overflow-hidden">
        
        {/* Loading State */}
        {loading && (
          <div className="py-24 flex flex-col items-center justify-center text-center gap-4 animate-in fade-in duration-200">
            <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-200">Loading {docConfig.title}...</p>
              <p className="text-xs text-slate-500 font-mono">Fetching document source from public repository</p>
            </div>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="py-16 px-6 text-center max-w-md mx-auto flex flex-col items-center gap-5">
            <div className="w-14 h-14 rounded-3xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <AlertCircle className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-white font-outfit">Failed to Load Document</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{error}</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                onClick={handleRetry}
                className="flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-950 transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Try Again
              </button>
              <button
                onClick={onBackToApp}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                Return to Dashboard
              </button>
            </div>
          </div>
        )}

        {/* Content Rendered State */}
        {!loading && !error && (
          <article className="prose prose-invert prose-emerald max-w-none break-words">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ node: _node, ...props }) => (
                  <h1 className="text-2xl sm:text-3xl md:text-4xl font-outfit font-bold text-white mb-6 pb-4 border-b border-slate-800 tracking-tight" {...props} />
                ),
                h2: ({ node: _node, ...props }) => (
                  <h2 className="text-xl sm:text-2xl font-outfit font-bold text-slate-100 mt-10 mb-4 tracking-tight" {...props} />
                ),
                h3: ({ node: _node, ...props }) => (
                  <h3 className="text-lg sm:text-xl font-outfit font-semibold text-slate-200 mt-8 mb-3 tracking-tight" {...props} />
                ),
                h4: ({ node: _node, ...props }) => (
                  <h4 className="text-base sm:text-lg font-outfit font-semibold text-slate-300 mt-6 mb-2" {...props} />
                ),
                p: ({ node: _node, ...props }) => (
                  <p className="text-slate-300 leading-relaxed mb-4 text-[14px] sm:text-[15px]" {...props} />
                ),
                ul: ({ node: _node, ...props }) => (
                  <ul className="list-disc list-outside ml-5 text-slate-300 mb-6 space-y-2 text-[14px] sm:text-[15px]" {...props} />
                ),
                ol: ({ node: _node, ...props }) => (
                  <ol className="list-decimal list-outside ml-5 text-slate-300 mb-6 space-y-2 text-[14px] sm:text-[15px]" {...props} />
                ),
                li: ({ node: _node, ...props }) => (
                  <li className="pl-1 leading-relaxed" {...props} />
                ),
                a: ({ node: _node, href, children, ...props }) => {
                  const isExternal = href?.startsWith('http://') || href?.startsWith('https://');
                  return (
                    <a
                      href={href}
                      target={isExternal ? '_blank' : undefined}
                      rel={isExternal ? 'noopener noreferrer' : undefined}
                      onClick={(e) => handleLinkClick(href, e)}
                      className="text-emerald-400 hover:text-emerald-300 underline underline-offset-4 decoration-emerald-500/40 hover:decoration-emerald-400 transition-colors cursor-pointer"
                      {...props}
                    >
                      {children}
                    </a>
                  );
                },
                blockquote: ({ node: _node, ...props }) => (
                  <blockquote className="border-l-4 border-emerald-500 bg-emerald-500/10 rounded-r-xl p-4 my-6 text-slate-300 text-sm italic" {...props} />
                ),
                hr: ({ node: _node, ...props }) => (
                  <hr className="my-8 border-slate-800" {...props} />
                ),
                table: ({ node: _node, ...props }) => (
                  <div className="overflow-x-auto w-full my-6 rounded-xl border border-slate-800 bg-slate-950/60 shadow-inner">
                    <table className="w-full text-left border-collapse text-sm min-w-[540px]" {...props} />
                  </div>
                ),
                thead: ({ node: _node, ...props }) => (
                  <thead className="bg-slate-800/80 text-slate-200 border-b border-slate-700 font-mono text-xs uppercase tracking-wider" {...props} />
                ),
                th: ({ node: _node, ...props }) => (
                  <th className="py-3 px-4 font-bold border-r border-slate-800 last:border-r-0" {...props} />
                ),
                tbody: ({ node: _node, ...props }) => (
                  <tbody className="divide-y divide-slate-800/80 font-sans" {...props} />
                ),
                td: ({ node: _node, ...props }) => (
                  <td className="py-3 px-4 border-r border-slate-800/50 last:border-r-0 text-slate-300 align-top text-xs sm:text-sm" {...props} />
                ),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                code: ({ node: _node, className, children, ...props }: any) => {
                  const isMultiline = typeof children === 'string' && children.includes('\n');
                  return !isMultiline && !className ? (
                    <code className="bg-slate-800 text-emerald-300 px-1.5 py-0.5 rounded font-mono text-[13px] border border-slate-700/50" {...props}>
                      {children}
                    </code>
                  ) : (
                    <pre className="bg-slate-950 p-4 rounded-xl overflow-x-auto border border-slate-800 my-6 font-mono text-xs sm:text-sm text-slate-300">
                      <code {...props}>{children}</code>
                    </pre>
                  );
                },
                strong: ({ node: _node, ...props }) => (
                  <strong className="text-white font-semibold" {...props} />
                ),
              }}
            >
              {content}
            </ReactMarkdown>
          </article>
        )}
      </main>
    </div>
  );
}

export default LegalViewer;
