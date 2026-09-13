import { validateDisplayName, validateEmail, validateInviteCode, validatePassword } from '../validation';

describe('validateEmail', () => {
  it('rejects empty input', () => {
    expect(validateEmail('')).toMatch(/required/i);
  });
  it('rejects a malformed address', () => {
    expect(validateEmail('not-an-email')).toMatch(/valid/i);
  });
  it('accepts a well-formed address', () => {
    expect(validateEmail('leo@example.com')).toBeNull();
  });
});

describe('validatePassword', () => {
  it('rejects empty input', () => {
    expect(validatePassword('')).toMatch(/required/i);
  });
  it('rejects passwords under 8 characters', () => {
    expect(validatePassword('short1')).toMatch(/8 characters/);
  });
  it('accepts a password of 8+ characters', () => {
    expect(validatePassword('longenough')).toBeNull();
  });
});

describe('validateInviteCode', () => {
  it('rejects empty input', () => {
    expect(validateInviteCode('   ')).toMatch(/required/i);
  });
  it('accepts any non-empty code', () => {
    expect(validateInviteCode('TAIWAN-4F82')).toBeNull();
  });
});

describe('validateDisplayName', () => {
  it('rejects empty input', () => {
    expect(validateDisplayName('')).toMatch(/required/i);
  });
  it('accepts a non-empty name', () => {
    expect(validateDisplayName('Ann')).toBeNull();
  });
});
