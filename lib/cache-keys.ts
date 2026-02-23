import { invalidateCacheByPrefix } from "@/lib/cache";

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
}
