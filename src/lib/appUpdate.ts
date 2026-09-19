import * as Application from 'expo-application';
import * as IntentLauncher from 'expo-intent-launcher';
import { Directory, File, Paths } from 'expo-file-system';
import { getContentUriAsync } from 'expo-file-system/legacy';
import { Platform } from 'react-native';

// The GitHub release process (see AGENTS.md) reuses a single "latest" tag
// updated in place rather than publishing per-build version tags, so the
// release's tag/nativeApplicationVersion can't be diffed for "is this new".
// Instead compare when the APK asset was uploaded against when this app was
// last installed/updated on the device (Android's PackageInfo.lastUpdateTime):
// an asset uploaded after our install is newer than what we're running.
// Both sides come from the OS/GitHub, so a fresh install from the release
// page or an install via the banner (whose process Android kills mid-install,
// so no JS runs afterwards) are both recognised as up to date.
const REPO = 'locodafux/taiwan-expenses';
const RELEASE_TAG = 'latest';
const ASSET_NAME_PREFERENCE = ['app-release.apk'];

export type AvailableUpdate = {
  downloadUrl: string;
  assetName: string;
};

type GithubAsset = {
  name: string;
  browser_download_url: string;
  updated_at: string;
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
// if it was uploaded after this app was last installed/updated.
export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  if (Platform.OS !== 'android') return null;

  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/${RELEASE_TAG}`);
  if (!res.ok) return null;
  const release: GithubRelease = await res.json();

  const asset = pickApkAsset(release.assets ?? []);
  if (!asset) return null;

  const installedAt = await Application.getLastUpdateTimeAsync();
  if (new Date(asset.updated_at) <= installedAt) return null;

  return { downloadUrl: asset.browser_download_url, assetName: asset.name };
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

  // Nothing to record afterwards: a successful install bumps the app's
  // lastUpdateTime (checkForUpdate then sees it's current), and a canceled or
  // permission-blocked one leaves it unchanged so the banner comes back.
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
    type: 'application/vnd.android.package-archive',
  });
}
