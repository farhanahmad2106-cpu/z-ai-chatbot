import { HealthSyncProvider, DailyHealthMetrics } from './healthKitSync';

export class HealthConnectSync implements HealthSyncProvider {
  async isAvailable() { return false; }
  async requestAuthorization() { return false; }
  async getDailyMetrics(date: string) { return { date }; }
}
