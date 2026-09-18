import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

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

import { File } from 'expo-file-system';
import { startActivityAsync } from 'expo-intent-launcher';

import { checkForUpdate, downloadAndInstall, markUpdateSeen } from '../appUpdate';

const releaseResponse = {
  assets: [
    { name: 'app-release.apk', browser_download_url: 'https://example.com/app-release.apk', digest: 'sha256:abc123' },
    { name: 'taiwan-fund-planner-latest-arm64.apk', browser_download_url: 'https://example.com/arm64.apk', digest: 'sha256:def456' },
  ],
};

describe('checkForUpdate', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    Platform.OS = 'android';
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => releaseResponse });
  });

  it('reports the universal apk as an update when no digest has been seen yet', async () => {
    const update = await checkForUpdate();
    expect(update).toEqual({
      digest: 'abc123',
      downloadUrl: 'https://example.com/app-release.apk',
      assetName: 'app-release.apk',
    });
  });

  it('returns null once the current digest has been marked as seen', async () => {
    await markUpdateSeen('abc123');
    expect(await checkForUpdate()).toBeNull();
  });

  it('reports an update again once the release digest changes', async () => {
    await markUpdateSeen('abc123');
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        assets: [{ name: 'app-release.apk', browser_download_url: 'https://example.com/app-release.apk', digest: 'sha256:newdigest' }],
      }),
    });
    const update = await checkForUpdate();
    expect(update?.digest).toBe('newdigest');
  });

  it('skips the check entirely on non-Android platforms', async () => {
    Platform.OS = 'ios';
    expect(await checkForUpdate()).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('returns null when GitHub responds with an error status', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({ ok: false, json: async () => ({}) });
    expect(await checkForUpdate()).toBeNull();
  });
});

describe('downloadAndInstall', () => {
  const update = {
    digest: 'abc123',
    downloadUrl: 'https://example.com/app-release.apk',
    assetName: 'app-release.apk',
  };

  beforeEach(async () => {
    await AsyncStorage.clear();
    Platform.OS = 'android';
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => releaseResponse });
    (File.createDownloadTask as jest.Mock).mockReturnValue({
      downloadAsync: jest.fn().mockResolvedValue({ uri: 'file:///cache/app-release.apk' }),
    });
  });

  // Regression: verified on-device that Android can silently cancel the
  // install intent (e.g. REQUEST_INSTALL_PACKAGES not yet granted for this
  // app) without ever showing an installer screen - in that case nothing
  // installed, so the banner must not disappear for good.
  it('leaves the update visible next check when the install is canceled', async () => {
    (startActivityAsync as jest.Mock).mockResolvedValue({ resultCode: 0 });
    await downloadAndInstall(update);
    expect(await checkForUpdate()).not.toBeNull();
  });

  it('stops reporting the update once the install succeeds', async () => {
    (startActivityAsync as jest.Mock).mockResolvedValue({ resultCode: -1 });
    await downloadAndInstall(update);
    expect(await checkForUpdate()).toBeNull();
  });
});
