import { invalidateCacheByPrefix } from "@/lib/cache";
import { officialMetricSnapshotsRepo } from "@/lib/server/official-metric-snapshots.repo";

export function invalidateFinanceCaches(userId: string): void {
  invalidateCacheByPrefix(`dashboard:${userId}:`);
  invalidateCacheByPrefix(`reports:${userId}:`);
  invalidateCacheByPrefix(`official-metrics:${userId}:`);
  invalidateCacheByPrefix(`bootstrap:${userId}:`);
  invalidateCacheByPrefix(`accounts:${userId}:`);
  invalidateCacheByPrefix(`categories:${userId}:`);
  invalidateCacheByPrefix(`category-rules:${userId}:`);
  invalidateCacheByPrefix(`transactions:${userId}:`);
  invalidateCacheByPrefix(`net-worth:${userId}:`);
  invalidateCacheByPrefix(`recurring:${userId}:`);
  invalidateCacheByPrefix(`imports:${userId}:`);
  void officialMetricSnapshotsRepo.deleteByUser(userId).catch(() => {});
}
