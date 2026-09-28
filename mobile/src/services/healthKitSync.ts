export interface DailyHealthMetrics {
  date: string;
  steps?: number;
  activeEnergyKcal?: number;
}

export interface HealthSyncProvider {
  isAvailable(): Promise<boolean>;
  requestAuthorization(): Promise<boolean>;
  getDailyMetrics(date: string): Promise<DailyHealthMetrics>;
}

export class HealthKitSync implements HealthSyncProvider {
  async isAvailable() { return false; }
  async requestAuthorization() { return false; }
  async getDailyMetrics(date: string) { return { date }; }
}
