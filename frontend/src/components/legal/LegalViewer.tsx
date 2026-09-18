import { useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowLeft, Shield, FileText, RefreshCcw, Cookie } from 'lucide-react';

// Using Vite's ?raw query suffix to bundle the raw text directly
import privacyMd from '../../../../.zayd_docs/PRIVACY_POLICY.md?raw';
import termsMd from '../../../../.zayd_docs/TERMS_OF_SERVICE.md?raw';
import refundMd from '../../../../.zayd_docs/REFUND_POLICY.md?raw';
import cookieMd from '../../../../.zayd_docs/COOKIE_POLICY.md?raw';

type LegalDocument = 'privacy' | 'terms' | 'refund' | 'cookies';

interface LegalViewerProps {
  activeDoc: LegalDocument;
  onNavigate: (doc: LegalDocument) => void;
  onBackToApp: () => void;
}

const docs = {
  privacy: { title: 'Privacy Policy', icon: Shield, content: privacyMd },
  terms: { title: 'Terms of Service', icon: FileText, content: termsMd },
  refund: { title: 'Refund Policy', icon: RefreshCcw, content: refundMd },
  cookies: { title: 'Cookie Policy', icon: Cookie, content: cookieMd },
};

export function LegalViewer({ activeDoc, onNavigate, onBackToApp }: LegalViewerProps) {
  const currentDoc = docs[activeDoc];
  
  // Scroll to top on mount or doc change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeDoc]);

  return (
    <div className="max-w-6xl mx-auto flex flex-col md:flex-row gap-8 py-4">
      
      {/* Navigation Sidebar */}
      <aside className="w-full md:w-64 flex-shrink-0">
        <div className="sticky top-24 bg-slate-900/50 backdrop-blur-sm p-4 rounded-2xl border border-slate-800 shadow-xl">
          
          <button
            onClick={onBackToApp}
            className="flex items-center gap-2 text-sm font-semibold text-emerald-400 hover:text-emerald-300 transition-colors mb-6 pb-4 border-b border-slate-800 w-full"
            aria-label="Back to Application"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to App
          </button>
          
          <nav className="flex flex-col gap-2" aria-label="Legal Documents Navigation">
            {(Object.entries(docs) as [LegalDocument, typeof docs[LegalDocument]][]).map(([key, doc]) => {
              const Icon = doc.icon;
              const isActive = activeDoc === key;
              return (
                <button
                  key={key}
                  onClick={() => onNavigate(key)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left font-medium text-sm
                    ${isActive 
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                      : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border border-transparent'
                    }`}
                >
                  <Icon className="w-4 h-4" />
                  {doc.title}
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* Markdown Content Area */}
      <main className="flex-grow bg-slate-900/40 rounded-3xl border border-slate-800 p-6 md:p-10 shadow-2xl overflow-hidden">
        <div className="prose prose-invert prose-emerald max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({node, ...props}) => <h1 className="text-3xl md:text-4xl font-outfit font-bold text-slate-100 mb-8 pb-4 border-b border-slate-800" {...props} />,
              h2: ({node, ...props}) => <h2 className="text-2xl font-outfit font-bold text-slate-200 mt-10 mb-4" {...props} />,
              h3: ({node, ...props}) => <h3 className="text-xl font-bold text-slate-300 mt-8 mb-4" {...props} />,
              h4: ({node, ...props}) => <h4 className="text-lg font-bold text-slate-300 mt-6 mb-3" {...props} />,
              p: ({node, ...props}) => <p className="text-slate-400 leading-relaxed mb-4 text-[15px]" {...props} />,
              ul: ({node, ...props}) => <ul className="list-disc list-outside ml-5 text-slate-400 mb-6 space-y-2" {...props} />,
              ol: ({node, ...props}) => <ol className="list-decimal list-outside ml-5 text-slate-400 mb-6 space-y-2" {...props} />,
              li: ({node, ...props}) => <li className="pl-2" {...props} />,
              a: ({node, ...props}) => <a className="text-emerald-400 hover:text-emerald-300 underline underline-offset-4 decoration-emerald-500/30" {...props} />,
              blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-emerald-500/50 pl-4 py-1 my-6 text-slate-300 bg-emerald-500/5 rounded-r-lg italic" {...props} />,
              hr: ({node, ...props}) => <hr className="my-10 border-slate-800" {...props} />,
              table: ({node, ...props}) => (
                <div className="overflow-x-auto w-full my-8 rounded-xl border border-slate-800 shadow-sm">
                  <table className="w-full text-left border-collapse text-sm" {...props} />
                </div>
              ),
              thead: ({node, ...props}) => <thead className="bg-slate-800/50 text-slate-200 border-b border-slate-700" {...props} />,
              th: ({node, ...props}) => <th className="py-3 px-4 font-bold" {...props} />,
              td: ({node, ...props}) => <td className="py-3 px-4 border-b border-slate-800 text-slate-400" {...props} />,
              code: ({node, inline, className, children, ...props}: any) => {
                return inline ? (
                  <code className="bg-slate-800 text-emerald-300 px-1.5 py-0.5 rounded font-mono text-[13px]" {...props}>
                    {children}
                  </code>
                ) : (
                  <pre className="bg-slate-950 p-4 rounded-xl overflow-x-auto border border-slate-800 my-6">
                    <code className="text-slate-300 font-mono text-sm" {...props}>
                      {children}
                    </code>
                  </pre>
                );
              },
            }}
          >
            {currentDoc.content}
          </ReactMarkdown>
        </div>
      </main>
    </div>
  );
}

export default LegalViewer;
