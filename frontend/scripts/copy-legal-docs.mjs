import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Root repository directory is one level above frontend/
const repoRoot = path.resolve(__dirname, '..', '..');
const sourceDocsDir = path.join(repoRoot, '.zayd_docs');
const targetDocsDir = path.resolve(__dirname, '..', 'public', 'legal');

const LEGAL_FILES = [
  'PRIVACY_POLICY.md',
  'TERMS_OF_SERVICE.md',
  'REFUND_POLICY.md',
  'COOKIE_POLICY.md',
];

export function copyLegalDocs() {
  if (!fs.existsSync(sourceDocsDir)) {
    console.warn(`[copy-legal-docs] Warning: Source directory not found at ${sourceDocsDir}`);
    return false;
  }

  if (!fs.existsSync(targetDocsDir)) {
    fs.mkdirSync(targetDocsDir, { recursive: true });
  }

  let successCount = 0;

  for (const filename of LEGAL_FILES) {
    const src = path.join(sourceDocsDir, filename);
    const dest = path.join(targetDocsDir, filename);

    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      successCount++;
    } else {
      console.error(`[copy-legal-docs] Error: Source legal document not found: ${src}`);
    }
  }

  console.log(`[copy-legal-docs] Successfully synchronized ${successCount}/${LEGAL_FILES.length} legal documents to ${targetDocsDir}`);
  return successCount === LEGAL_FILES.length;
}

// If invoked directly from CLI
if (process.argv[1] === __filename) {
  const ok = copyLegalDocs();
  if (!ok) {
    process.exit(1);
  }
}
