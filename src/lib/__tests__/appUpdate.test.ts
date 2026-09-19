import { Platform } from 'react-native';

jest.mock('expo-application', () => ({ getLastUpdateTimeAsync: jest.fn() }));

jest.mock('expo-intent-launcher', () => ({
  startActivityAsync: jest.fn(),
  ResultCode: { Success: -1, Canceled: 0 },
}));

jest.mock('expo-file-system', () => {
  const File = jest.fn().mockImplementation(() => ({ exists: false, delete: jest.fn() })) as jest.Mock & {
    createDownloadTask: jest.Mock;
  };
  File.createDownloadTask = jest.fn();
  return { File, Directory: jest.fn(), Paths: { cache: 'file:///cache' } };
});

jest.mock('expo-file-system/legacy', () => ({
  getContentUriAsync: jest.fn().mockResolvedValue('content://fake/app-release.apk'),
}));

import { getLastUpdateTimeAsync } from 'expo-application';

import { checkForUpdate } from '../appUpdate';

// Mirrors the real `latest` release's assets as of 2026-09-18.
const UPLOADED_AT = '2026-09-18T04:19:47Z';
const releaseResponse = {
  assets: [
    { name: 'app-release.apk', browser_download_url: 'https://example.com/app-release.apk', updated_at: UPLOADED_AT },
    {
      name: 'taiwan-fund-planner-latest-arm64.apk',
      browser_download_url: 'https://example.com/arm64.apk',
      updated_at: '2026-09-14T00:35:23Z',
    },
  ],
};

const installedAt = (iso: string) => (getLastUpdateTimeAsync as jest.Mock).mockResolvedValue(new Date(iso));

describe('checkForUpdate', () => {
  beforeEach(() => {
    Platform.OS = 'android';
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => releaseResponse });
  });

  // Regression: reproduced on-device (2026-09-19) - installing the exact
  // published APK, or updating through the banner itself, still showed
  // "A new version is available" because "current" was a locally persisted
  // digest that neither of those paths ever wrote.
  it('reports nothing when the installed app is newer than the published apk', async () => {
    installedAt('2026-09-19T05:13:43Z');
    expect(await checkForUpdate()).toBeNull();
  });

  it('reports the universal apk when it was uploaded after the app was installed', async () => {
    installedAt('2026-09-17T00:00:00Z');
    expect(await checkForUpdate()).toEqual({
      downloadUrl: 'https://example.com/app-release.apk',
      assetName: 'app-release.apk',
    });
  });

  it('skips the check entirely on non-Android platforms', async () => {
    Platform.OS = 'ios';
    expect(await checkForUpdate()).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('returns null when GitHub responds with an error status', async () => {
    installedAt('2026-09-17T00:00:00Z');
    (globalThis.fetch as jest.Mock).mockResolvedValue({ ok: false, json: async () => ({}) });
    expect(await checkForUpdate()).toBeNull();
  });
});
