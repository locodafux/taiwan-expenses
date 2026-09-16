import AsyncStorage from '@react-native-async-storage/async-storage';
import * as IntentLauncher from 'expo-intent-launcher';
import { Directory, File, Paths } from 'expo-file-system';
import { getContentUriAsync } from 'expo-file-system/legacy';
import { Platform } from 'react-native';

// The GitHub release process (see AGENTS.md) reuses a single "latest" tag
// updated in place rather than publishing per-build version tags, so the
// release's tag/nativeApplicationVersion can't be diffed for "is this new".
// The asset's sha256 digest is the one thing GitHub's API gives us that
// actually changes every build - use it as the version identifier instead,
// persisted locally after each check/install so we know what's "seen".
const REPO = 'locodafux/taiwan-expenses';
const RELEASE_TAG = 'latest';
const SEEN_DIGEST_KEY = 'app-update:seen-digest';
const ASSET_NAME_PREFERENCE = ['app-release.apk'];

export type AvailableUpdate = {
  digest: string;
  downloadUrl: string;
  assetName: string;
};

type GithubAsset = {
  name: string;
  browser_download_url: string;
  digest?: string;
};

type GithubRelease = {
  assets: GithubAsset[];
};

function pickApkAsset(assets: GithubAsset[]): GithubAsset | undefined {
  for (const preferred of ASSET_NAME_PREFERENCE) {
    const match = assets.find((a) => a.name === preferred);
    if (match) return match;
  }
  return assets.find((a) => a.name.endsWith('.apk'));
}

// Checks GitHub for the latest release APK and reports it as an update only
// if its digest hasn't already been seen (installed or dismissed) on this device.
export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  if (Platform.OS !== 'android') return null;

  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/${RELEASE_TAG}`);
  if (!res.ok) return null;
  const release: GithubRelease = await res.json();

  const asset = pickApkAsset(release.assets ?? []);
  if (!asset?.digest) return null;

  const digest = asset.digest.replace(/^sha256:/, '');
  const seenDigest = await AsyncStorage.getItem(SEEN_DIGEST_KEY);
  if (digest === seenDigest) return null;

  return { digest, downloadUrl: asset.browser_download_url, assetName: asset.name };
}

export async function markUpdateSeen(digest: string): Promise<void> {
  await AsyncStorage.setItem(SEEN_DIGEST_KEY, digest);
}

// Downloads the APK to the cache dir and hands it to Android's package
// installer. Android requires a content:// URI (not file://) for the
// install intent on API 24+, so we convert via the FileProvider that
// expo-file-system already registers.
export async function downloadAndInstall(
  update: AvailableUpdate,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  const destination = new File(new Directory(Paths.cache), update.assetName);
  if (destination.exists) destination.delete();

  const task = File.createDownloadTask(update.downloadUrl, destination, {
    onProgress: ({ bytesWritten, totalBytes }) => {
      if (totalBytes > 0) onProgress?.(bytesWritten / totalBytes);
    },
  });
  const file = await task.downloadAsync();
  if (!file) throw new Error('Download was cancelled');

  const contentUri = await getContentUriAsync(file.uri);

  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
    type: 'application/vnd.android.package-archive',
  });

  await markUpdateSeen(update.digest);
}
