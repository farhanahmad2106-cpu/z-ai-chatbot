import re
with open('MEMORY.md', 'r', encoding='utf-8') as f:
    s = f.read()

summary = """### 2026-09-26: Frontend Strict-Typing Normalization & Clean ESLint Baseline (Part 2)
- Continued ESLint diagnostics remediation across frontend codebase.
- Replaced 'any' occurrences with explicit typing or 'unknown' in test files (codeSplitting.test.ts, offlineSync.test.ts, scanRemediation.test.ts).
- Fixed unsafe 'Function' types and empty catch blocks.
- Fixed 'no-useless-assignment' violations in macroCalculator.ts.
- Reduced frontend ESLint warnings/errors from 186 to 141.
- Remaining errors are primarily related to react-hooks/set-state-in-effect and component prop types which require manual refactoring in future sessions.

"""

new_s = re.sub(r'(## 📝 Last Session Summary\n\n)', r'\1' + summary, s, count=1)

with open('MEMORY.md', 'w', encoding='utf-8') as f:
    f.write(new_s)
