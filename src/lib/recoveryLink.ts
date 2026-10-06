export type RecoveryLink =
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  | { kind: 'error'; message: string }
  | { kind: 'none' };

// Supabase's reset email redirects to `<redirectTo>#access_token=...&refresh_token=...&type=recovery`
// (implicit flow). A used/expired link comes back as `#error=...&error_code=otp_expired` instead.
// Both can also arrive as a query string, so read the fragment and the query alike.
export function parseRecoveryLink(url: string | null): RecoveryLink {
  if (!url) return { kind: 'none' };
  const hashAt = url.indexOf('#');
  const queryAt = url.indexOf('?');
  const params = new URLSearchParams(
    [
      queryAt >= 0 ? url.slice(queryAt + 1, hashAt > queryAt ? hashAt : undefined) : '',
      hashAt >= 0 ? url.slice(hashAt + 1) : '',
    ].join('&'),
  );

  if (params.get('error') || params.get('error_code')) {
    return {
      kind: 'error',
      message:
        params.get('error_code') === 'otp_expired'
          ? 'This reset link has expired or was already used. Request a new one.'
          : 'This reset link is not valid. Request a new one.',
    };
  }
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken && params.get('type') === 'recovery') {
    return { kind: 'tokens', accessToken, refreshToken };
  }
  return { kind: 'none' };
}
