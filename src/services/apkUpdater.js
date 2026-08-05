const RELEASES_API_URL = 'https://api.github.com/repos/jayb029/Drively/releases/latest';
const RELEASE_DOWNLOAD_PREFIX = '/jayb029/Drively/releases/download/';
const APK_NAME_PATTERN = /^Drively-v(.+)-(\d+)\.apk$/i;
const CHANGELOG_NAME_PATTERN = /^Drively-v(.+)-changelog\.json$/i;
const VERSION_PATTERN = /^\d+\.\d+(?:\.\d+)?$/;
const REQUEST_TIMEOUT_MS = 12000;

function normalizeVersion(version) {
  return String(version || '')
    .trim()
    .replace(/^v/i, '')
    .split(/[+-]/, 1)[0];
}

export function compareVersions(left, right) {
  const leftParts = normalizeVersion(left).split('.').map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = normalizeVersion(right).split('.').map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }

  return 0;
}

function parseApkAsset(asset) {
  const match = String(asset?.name || '').match(APK_NAME_PATTERN);
  if (!match) return null;

  const downloadUrl = String(asset?.browser_download_url || '');
  let parsedUrl;
  try {
    parsedUrl = new URL(downloadUrl);
  } catch {
    return null;
  }

  if (
    parsedUrl.protocol !== 'https:'
    || parsedUrl.hostname !== 'github.com'
    || !parsedUrl.pathname.startsWith(RELEASE_DOWNLOAD_PREFIX)
  ) {
    return null;
  }

  return {
    downloadUrl,
    fileName: asset.name,
    sizeBytes: Number(asset.size) || 0,
    version: normalizeVersion(match[1]),
    versionCode: Number.parseInt(match[2], 10),
  };
}

function parseChangelogAsset(asset, releaseVersion) {
  const match = String(asset?.name || '').match(CHANGELOG_NAME_PATTERN);
  if (!match || normalizeVersion(match[1]) !== releaseVersion) return null;

  const downloadUrl = String(asset?.browser_download_url || '');
  try {
    const parsedUrl = new URL(downloadUrl);
    if (
      parsedUrl.protocol !== 'https:'
      || parsedUrl.hostname !== 'github.com'
      || !parsedUrl.pathname.startsWith(RELEASE_DOWNLOAD_PREFIX)
    ) return null;
  } catch {
    return null;
  }

  return downloadUrl;
}

function summarizeReleaseNotes(body) {
  const firstParagraph = String(body || '')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/^#+\s*/gm, '').replace(/[*_`]/g, '').trim())
    .find(Boolean);

  if (!firstParagraph) return null;
  return firstParagraph.length > 220 ? `${firstParagraph.slice(0, 217).trim()}…` : firstParagraph;
}

export function parseGithubRelease(payload) {
  if (!payload || payload.draft || payload.prerelease) {
    throw new Error('GitHub did not return a public stable Drively release.');
  }

  const releaseVersion = normalizeVersion(payload.tag_name);
  if (!VERSION_PATTERN.test(releaseVersion)) {
    throw new Error('The latest Drively release does not have a valid version tag.');
  }

  const apkAssets = (payload.assets || [])
    .map(parseApkAsset)
    .filter(Boolean)
    .filter((asset) => asset.version === releaseVersion && asset.versionCode > 0)
    .sort((left, right) => right.versionCode - left.versionCode);

  if (!apkAssets.length) {
    throw new Error(`Drively v${releaseVersion} does not include a correctly named APK.`);
  }

  const apk = apkAssets[0];
  const changelogUrl = (payload.assets || [])
    .map((asset) => parseChangelogAsset(asset, releaseVersion))
    .find(Boolean);

  return {
    ...apk,
    changelogUrl,
    changes: [],
    name: payload.name || `Drively v${releaseVersion}`,
    notes: summarizeReleaseNotes(payload.body),
    publishedAt: payload.published_at || null,
    releaseUrl: payload.html_url || null,
    tag: payload.tag_name,
    version: releaseVersion,
  };
}

export async function fetchReleaseChangelog(release, fetchImpl = fetch, signal) {
  if (!release.changelogUrl) return release;

  const response = await fetchImpl(release.changelogUrl, {
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response.ok) throw new Error(`GitHub changelog download failed (${response.status}).`);

  const payload = await response.json();
  if (normalizeVersion(payload?.version) !== release.version || !Array.isArray(payload?.changes)) {
    throw new Error('The update changelog does not match this Drively release.');
  }

  const changes = payload.changes
    .filter((change) => typeof change === 'string')
    .map((change) => change.trim())
    .filter(Boolean)
    .slice(0, 40);

  return { ...release, changes };
}

export function evaluateApkRelease(release, installed) {
  const installedVersionCode = Number.parseInt(installed?.versionCode, 10);
  if (!Number.isFinite(installedVersionCode)) {
    throw new Error('Drively could not read this APK build number.');
  }

  const versionComparison = compareVersions(release.version, installed.version);
  if (release.versionCode <= installedVersionCode && versionComparison > 0) {
    throw new Error(
      `Drively v${release.version} uses build ${release.versionCode}; it must be higher than installed build ${installedVersionCode}.`
    );
  }

  return {
    installedVersionCode,
    isAvailable: versionComparison >= 0 && release.versionCode > installedVersionCode,
    release,
  };
}

export async function fetchLatestApkRelease(fetchImpl = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetchImpl(RELEASES_API_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Drively-Android-Updater',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`GitHub update check failed (${response.status}).`);
    }

    const release = parseGithubRelease(await response.json());
    return await fetchReleaseChangelog(release, fetchImpl, controller.signal);
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('The APK update check timed out.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function formatApkSize(sizeBytes) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return null;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}
