const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');

const root = path.join(__dirname, '..');

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(absolute);
    return absolute.endsWith('.js') || absolute.endsWith('.jsx') ? [absolute] : [];
  });
}

describe('whole application source and native configuration', () => {
  test('Babel transforms every application, test, script, and website module', () => {
    const files = [
      path.join(root, 'App.js'),
      path.join(root, 'index.js'),
      ...walk(path.join(root, 'src')),
      ...walk(path.join(root, 'scripts')),
      ...walk(path.join(root, 'tests')),
      ...walk(path.join(root, 'website', 'src')),
    ];
    expect(files.length).toBeGreaterThan(50);
    for (const file of files) {
      expect(() => babel.transformFileSync(file, { babelrc: true, configFile: true })).not.toThrow();
    }
  });

  test('keeps Expo, npm, Android, OTA, permission, and release metadata coordinated', () => {
    const pkg = require('../package.json');
    const app = require('../app.json').expo;
    const gradle = fs.readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8');
    const manifest = fs.readFileSync(path.join(root, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
    const patch = fs.readFileSync(path.join(root, 'patches/expo-task-manager+57.0.8.patch'), 'utf8');

    expect(pkg.version).toBe(app.version);
    expect(app.android.runtimeVersion).toBe(app.version);
    expect(gradle).toContain(`versionName "${app.version}"`);
    expect(app.updates.requestHeaders['expo-channel-name']).toBe('production');
    expect(manifest).toContain('expo-channel-name&quot;:&quot;production');
    for (const permission of [
      'ACCESS_FINE_LOCATION',
      'ACCESS_BACKGROUND_LOCATION',
      'FOREGROUND_SERVICE_LOCATION',
      'POST_NOTIFICATIONS',
      'INTERNET',
    ]) {
      expect(manifest).toContain(permission);
    }
    expect(manifest).toContain('android:supportsPictureInPicture="true"');
    expect(patch).toContain('mApplicationContext');
  });

  test('keeps the native PiP bridge registered and release builds fail closed without signing', () => {
    const application = fs.readFileSync(path.join(root, 'android/app/src/main/java/com/jaysapps/drively/MainApplication.kt'), 'utf8');
    const activity = fs.readFileSync(path.join(root, 'android/app/src/main/java/com/jaysapps/drively/MainActivity.kt'), 'utf8');
    const gradle = fs.readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8');
    expect(application).toContain('DrivePipPackage()');
    expect(activity).toContain('onPictureInPictureRequested');
    expect(gradle).toContain('Release signing requires');
  });
});
