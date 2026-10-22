import { QueryClient } from "@tanstack/react-query";
import { NotFoundError } from "./error";

/**
 * One client for the app. Reads stay fresh for 30 s; the live stream and the write hooks
 * invalidate them sooner, so a short stale time never shows old data after a change.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      retry: (count, error) => !(error instanceof NotFoundError) && count < 1,
    },
    mutations: { retry: false },
  },
});
