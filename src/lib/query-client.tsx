import { QueryClient, QueryClientProvider as TanstackProvider } from '@tanstack/react-query';

// Realtime (src/lib/realtime.ts) invalidates these queries on change;
// staleTime/refetchOnWindowFocus remain as a fallback for when a client
// reconnects or the channel hasn't delivered an event yet.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    },
  },
});

export function QueryClientProvider({ children }: { children: React.ReactNode }) {
  return <TanstackProvider client={queryClient}>{children}</TanstackProvider>;
}
