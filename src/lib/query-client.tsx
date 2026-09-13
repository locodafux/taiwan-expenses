import { QueryClient, QueryClientProvider as TanstackProvider } from '@tanstack/react-query';

// Plain refetch, no Realtime channel - docs/techspec.md §3's explicit
// recommendation for a 2-user household ("a few seconds later is fine").
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
