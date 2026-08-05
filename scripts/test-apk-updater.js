const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');

const sourcePath = path.join(__dirname, '..', 'src/services/apkUpdater.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const transformed = babel.transformSync(source, {
  filename: sourcePath,
  plugins: ['@babel/plugin-transform-modules-commonjs'],
});
const loadedModule = { exports: {} };
Function('require', 'module', 'exports', transformed.code)(require, loadedModule, loadedModule.exports);

const {
  compareVersions,
  evaluateApkRelease,
  fetchLatestApkRelease,
  fetchReleaseChangelog,
  formatApkSize,
  parseGithubRelease,
} = loadedModule.exports;

const release = parseGithubRelease({
  assets: [{
    browser_download_url: 'https://github.com/jayb029/Drively/releases/download/v2.2.0/Drively-v2.2.0-14.apk',
    name: 'Drively-v2.2.0-14.apk',
    size: 90859730,
  }, {
    browser_download_url: 'https://github.com/jayb029/Drively/releases/download/v2.2.0/Drively-v2.2.0-changelog.json',
    name: 'Drively-v2.2.0-changelog.json',
  }],
  body: 'Native update support.\n\nAdditional details.',
  draft: false,
  html_url: 'https://github.com/jayb029/Drively/releases/tag/v2.2.0',
  name: 'Drively v2.2.0',
  prerelease: false,
  published_at: '2026-08-05T12:00:00Z',
  tag_name: 'v2.2.0',
});

assert.equal(release.version, '2.2.0');
assert.equal(release.versionCode, 14);
assert.equal(release.notes, 'Native update support.');
assert.deepEqual(release.changes, []);
assert.equal(evaluateApkRelease(release, { version: '2.1.0', versionCode: '13' }).isAvailable, true);
assert.equal(evaluateApkRelease(release, { version: '2.2.0', versionCode: '14' }).isAvailable, false);
assert.equal(evaluateApkRelease(
  { ...release, version: '2.0.0', versionCode: 99 },
  { version: '2.1.0', versionCode: 13 }
).isAvailable, false);
assert.equal(compareVersions('2.10.0', '2.9.9'), 1);
assert.equal(compareVersions('v2.1', '2.1.0'), 0);
assert.equal(formatApkSize(90859730), '86.7 MB');

const legacyRelease = parseGithubRelease({
  assets: [{
    browser_download_url: 'https://github.com/jayb029/Drively/releases/download/v2.1.0/Drively-v2.1.0-13.apk',
    name: 'Drively-v2.1.0-13.apk',
  }],
  draft: false,
  prerelease: false,
  tag_name: 'v2.1.0',
});
assert.equal(legacyRelease.changelogUrl, undefined);
assert.deepEqual(legacyRelease.changes, []);

assert.throws(() => parseGithubRelease({
  assets: [{
    browser_download_url: 'https://example.com/Drively-v2.2.0-14.apk',
    name: 'Drively-v2.2.0-14.apk',
  }],
  tag_name: 'v2.2.0',
}), /correctly named APK/);

assert.throws(() => evaluateApkRelease(
  { ...release, version: '2.3.0', versionCode: 13 },
  { version: '2.2.0', versionCode: 14 }
), /must be higher/);

async function runAsyncTests() {
  const releaseWithChanges = await fetchReleaseChangelog(release, async () => ({
    json: async () => ({ version: '2.2.0', changes: ['First change', 'Second change'] }),
    ok: true,
  }));
  assert.deepEqual(releaseWithChanges.changes, ['First change', 'Second change']);

  const responses = [
    {
      json: async () => ({
        assets: [
          {
            browser_download_url: 'https://github.com/jayb029/Drively/releases/download/v2.2.0/Drively-v2.2.0-14.apk',
            name: 'Drively-v2.2.0-14.apk',
          },
          {
            browser_download_url: 'https://github.com/jayb029/Drively/releases/download/v2.2.0/Drively-v2.2.0-changelog.json',
            name: 'Drively-v2.2.0-changelog.json',
          },
        ],
        draft: false,
        prerelease: false,
        tag_name: 'v2.2.0',
      }),
      ok: true,
    },
    {
      json: async () => ({ version: '2.2.0', changes: ['Oldest change', 'Newest change'] }),
      ok: true,
    },
  ];
  const fetchedRelease = await fetchLatestApkRelease(async () => responses.shift());
  assert.deepEqual(fetchedRelease.changes, ['Oldest change', 'Newest change']);
  console.log('APK updater tests passed.');
}

runAsyncTests().catch((error) => {
  process.exitCode = 1;
  console.error(error);
});
