import type {
  D1Database as WorkersD1,
  R2Bucket as WorkersR2,
  Fetcher as WorkersFetcher,
} from "@cloudflare/workers-types";
declare global {
  type D1Database = WorkersD1;
  type R2Bucket = WorkersR2;
  // ASTRO 使用 DOM Fetch 类型；运行时是相同的标准 Request / Response。
  type Fetcher = Omit<WorkersFetcher, "fetch"> & {
    fetch: typeof globalThis.fetch;
  };
}
