const fs = require('fs');
const path = require('path');

const version = process.argv[2];

if (!version) {
  console.error('Usage: npm run version:set -- <version>');
  process.exit(1);
}

const root = path.resolve(__dirname, '..');
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const writeJson = (file, data) => {
  fs.writeFileSync(path.join(root, file), `${JSON.stringify(data, null, 2)}\n`);
};

const packageJson = readJson('package.json');
packageJson.version = version;
writeJson('package.json', packageJson);

const packageLock = readJson('package-lock.json');
packageLock.version = version;
if (packageLock.packages?.['']) {
  packageLock.packages[''].version = version;
}
writeJson('package-lock.json', packageLock);

const appJson = readJson('app.json');
appJson.expo.version = version;
appJson.expo.android.runtimeVersion = version;
writeJson('app.json', appJson);

const replaceInFile = (file, pattern, replacement) => {
  const fullPath = path.join(root, file);
  const original = fs.readFileSync(fullPath, 'utf8');

  if (!pattern.test(original)) {
    throw new Error(`No version match found in ${file}`);
  }

  const updated = original.replace(pattern, replacement);
  fs.writeFileSync(fullPath, updated);
};

replaceInFile(
  'android/app/build.gradle',
  /versionName "([^"]+)"/,
  `versionName "${version}"`
);

replaceInFile(
  'android/app/src/main/res/values/strings.xml',
  /<string name="expo_runtime_version">[^<]+<\/string>/,
  `<string name="expo_runtime_version">${version}</string>`
);

console.log(`Updated Drively version to ${version}`);
