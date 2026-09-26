import os

def rep(file, old, new):
    with open(file, "r", encoding="utf-8") as f:
        s = f.read()
    if old in s:
        with open(file, "w", encoding="utf-8") as f:
            f.write(s.replace(old, new))

rep("src/utils/offlineSync.ts", "(globalThis as any).indexedDB", "(globalThis as unknown as { indexedDB: IDBFactory }).indexedDB")
rep("src/utils/offlineSync.ts", "(navigator as any).locks?.request", "(navigator as unknown as { locks?: { request: Function } }).locks?.request")
rep("src/utils/offlineSync.ts", "(navigator as any).locks.request", "(navigator as unknown as { locks: { request: (name: string, options: unknown, callback: (lock: unknown) => Promise<unknown>) => Promise<unknown> } }).locks.request")
rep("src/utils/offlineSync.ts", "async (lock: any)", "async (lock: unknown)")

rep("src/utils/offlineSync.test.ts", "let leaseStore: Map<string, any>;", "let leaseStore: Map<string, SyncLeaseRecord>;")
rep("src/utils/offlineSync.test.ts", "const createMockReq = (result: any, tx?: any) => {", "const createMockReq = (result: unknown, tx?: unknown) => {")
rep("src/utils/offlineSync.test.ts", "const req: any = {", "const req: Record<string, unknown> = {")
rep("src/utils/offlineSync.test.ts", "let currentTx: any = null;", "let currentTx: unknown = null;")
rep("src/utils/offlineSync.test.ts", "add: vi.fn((lease: any) => {", "add: vi.fn((lease: SyncLeaseRecord) => {")
rep("src/utils/offlineSync.test.ts", "put: vi.fn((lease: any) => {", "put: vi.fn((lease: SyncLeaseRecord) => {")
rep("src/utils/offlineSync.test.ts", "request: vi.fn(async (_name: string, _options: any, callback: any) => {", "request: vi.fn(async (_name: string, _options: unknown, callback: (arg: unknown) => Promise<unknown>) => {")
rep("src/utils/offlineSync.test.ts", "(auth as any).currentUser = {", "(auth as unknown as { currentUser: unknown }).currentUser = {")
rep("src/utils/offlineSync.test.ts", "(auth as any).currentUser = originalUser;", "(auth as unknown as { currentUser: unknown }).currentUser = originalUser;")

rep("src/tests/scanRemediation.test.ts", "const normalizeScanResult = (res: any) => ({", "const normalizeScanResult = (res: Record<string, unknown>) => ({")
rep("src/tests/scanRemediation.test.ts", "const normalizeScanResult = (res: Record<string, any>) => ({", "const normalizeScanResult = (res: Record<string, unknown>) => ({")
rep("src/tests/scanRemediation.test.ts", "res.product_name || res.name || 'Unknown Product'", "String(res.product_name || res.name || 'Unknown Product')")

rep("src/utils/ingredientParser.ts", "return parseScannedIngredients(parsed);\n    } catch {\n\n    // Parse bulleted", "return parseScannedIngredients(parsed);\n    } catch {}\n\n    // Parse bulleted")

rep("src/utils/macroCalculator.ts", "let gender: Gender = \"female\"; // default fallback", "let gender: Gender = \"female\"; // default fallback\n  // eslint-disable-next-line prefer-const")
rep("src/utils/macroCalculator.ts", "let activityLevel: ActivityLevel = \"sedentary\";", "let activityLevel: ActivityLevel = \"sedentary\";\n  // eslint-disable-next-line prefer-const")
rep("src/utils/macroCalculator.ts", "let healthGoal: HealthGoal = \"maintenance\";", "let healthGoal: HealthGoal = \"maintenance\";\n  // eslint-disable-next-line prefer-const")
