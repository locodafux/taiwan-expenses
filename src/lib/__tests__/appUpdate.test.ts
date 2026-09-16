import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { checkForUpdate, markUpdateSeen } from '../appUpdate';

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
