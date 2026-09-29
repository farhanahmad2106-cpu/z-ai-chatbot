export const ENDPOINTS = {
  SCAN_ANALYZE: '/api/scan/analyze',
  LOG_MEAL: '/api/user/log_meal',
  BARCODE_LOOKUP: (barcode: string) => `/api/barcode/${encodeURIComponent(barcode)}`,
  BIOMETRICS_SYNC: '/api/user/biometrics/sync',
  FOODS_SEARCH: '/api/foods',
  WEEKLY_PLAN: '/api/meals/weekly-plan',
  TRANSLATE_PLAN: '/api/meals/translate-plan',
  CUSTOM_MEALS: '/api/meals/custom',
} as const;
