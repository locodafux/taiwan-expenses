import { parseRecoveryLink } from '../recoveryLink';

describe('parseRecoveryLink', () => {
  it('reads tokens from the fragment', () => {
    expect(
      parseRecoveryLink('taiwanfundplanner://reset-password#access_token=a.b&refresh_token=r1&expires_in=3600&type=recovery'),
    ).toEqual({ kind: 'tokens', accessToken: 'a.b', refreshToken: 'r1' });
  });

  it('reads tokens from the query too', () => {
    expect(parseRecoveryLink('taiwanfundplanner://reset-password?access_token=a&refresh_token=r&type=recovery')).toEqual({
      kind: 'tokens',
      accessToken: 'a',
      refreshToken: 'r',
    });
  });

  it('refuses tokens that are not from a recovery link', () => {
    expect(parseRecoveryLink('taiwanfundplanner://reset-password#access_token=a&refresh_token=r&type=signup')).toEqual({
      kind: 'none',
    });
  });

  it('reports an expired link', () => {
    const link = parseRecoveryLink(
      'taiwanfundplanner://reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid',
    );
    expect(link).toMatchObject({ kind: 'error' });
    expect((link as { message: string }).message).toMatch(/expired or was already used/);
  });

  it('reports any other error generically', () => {
    expect(parseRecoveryLink('taiwanfundplanner://reset-password#error=server_error')).toMatchObject({
      kind: 'error',
      message: 'This reset link is not valid. Request a new one.',
    });
  });

  it('returns none for a bare or missing url', () => {
    expect(parseRecoveryLink('taiwanfundplanner://reset-password')).toEqual({ kind: 'none' });
    expect(parseRecoveryLink(null)).toEqual({ kind: 'none' });
  });
});
