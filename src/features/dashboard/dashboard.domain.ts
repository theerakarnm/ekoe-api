import { dashboardRepository } from './dashboard.repository';

export class DashboardDomain {
  async getMetrics() {
    return await dashboardRepository.getMetrics();
  }
}

export const dashboardDomain = new DashboardDomain();
