import { describe, it, expect } from 'vitest';

describe('Production Native Dialog Elimination Regression Guard (Section 26)', () => {
  // Use Vite's raw glob import to inspect all production source files as raw text
  const sourceModules = import.meta.glob<string>(
    ['../*.{ts,tsx}', '../**/*.{ts,tsx}'],
    { query: '?raw', import: 'default', eager: true }
  );

  const getProductionEntries = (): [string, string][] => {
    return Object.entries(sourceModules).filter(([filePath]) => {
      // Exclude tests and test fixtures
      return !filePath.includes('/tests/') && !filePath.includes('.test.') && !filePath.includes('.spec.');
    }) as [string, string][];
  };

  it('scans production modules and verifies non-empty module set', () => {
    const entries = getProductionEntries();
    expect(entries.length).toBeGreaterThan(15);
  });

  it('verifies ZERO calls to window.(alert|confirm|prompt) in production frontend/src', () => {
    const entries = getProductionEntries();
    const violations: { file: string; line: number; content: string }[] = [];
    const regex = /\bwindow\.(alert|confirm|prompt)\s*\(/;

    for (const [filePath, content] of entries) {
      if (typeof content !== 'string') continue;
      const lines = content.split('\n');
      lines.forEach((line: string, index: number) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
          return;
        }
        if (regex.test(line)) {
          violations.push({
            file: filePath,
            line: index + 1,
            content: trimmed,
          });
        }
      });
    }

    expect(
      violations,
      `Detected native window dialog calls in production code:\n${JSON.stringify(violations, null, 2)}`
    ).toEqual([]);
  });

  it('verifies ZERO calls to globalThis.(alert|confirm|prompt) in production frontend/src', () => {
    const entries = getProductionEntries();
    const violations: { file: string; line: number; content: string }[] = [];
    const regex = /\bglobalThis\.(alert|confirm|prompt)\s*\(/;

    for (const [filePath, content] of entries) {
      if (typeof content !== 'string') continue;
      const lines = content.split('\n');
      lines.forEach((line: string, index: number) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
          return;
        }
        if (regex.test(line)) {
          violations.push({
            file: filePath,
            line: index + 1,
            content: trimmed,
          });
        }
      });
    }

    expect(
      violations,
      `Detected native globalThis dialog calls in production code:\n${JSON.stringify(violations, null, 2)}`
    ).toEqual([]);
  });

  it('verifies ZERO bare calls to (alert|confirm|prompt)( in production frontend/src', () => {
    const entries = getProductionEntries();
    const violations: { file: string; line: number; content: string }[] = [];
    const regex = /\b(alert|confirm|prompt)\s*\(/;

    for (const [filePath, content] of entries) {
      if (typeof content !== 'string') continue;
      const lines = content.split('\n');
      lines.forEach((line: string, index: number) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
          return;
        }
        if (regex.test(line)) {
          violations.push({
            file: filePath,
            line: index + 1,
            content: trimmed,
          });
        }
      });
    }

    expect(
      violations,
      `Detected native bare dialog calls in production code:\n${JSON.stringify(violations, null, 2)}`
    ).toEqual([]);
  });
});
