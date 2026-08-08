const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const root = path.join(__dirname, '..');
const resultsDirectory = path.join(root, '.test-results');
const logsDirectory = path.join(resultsDirectory, 'logs');
const jestResultsFile = path.join(resultsDirectory, 'jest-results.json');
const coverageSummaryFile = path.join(resultsDirectory, 'coverage', 'coverage-summary.json');
const gateArgument = process.argv.find((argument) => argument.startsWith('--gate='));
const gate = gateArgument ? gateArgument.slice('--gate='.length) : 'all';
const validGates = new Set(['all', 'fast', 'build', 'native']);

if (!validGates.has(gate)) {
  console.error(`Unknown test gate "${gate}". Use all, fast, build, or native.`);
  process.exit(2);
}

const reportFile = path.join(resultsDirectory, gate === 'all' ? 'REPORT.md' : `REPORT-${gate}.md`);
const runFastGate = gate === 'all' || gate === 'fast';
const runBuildGate = gate === 'all' || gate === 'build';
const runNativeGate = gate === 'all' || gate === 'native';

fs.mkdirSync(resultsDirectory, { recursive: true });
fs.mkdirSync(logsDirectory, { recursive: true });

function runPhase(name, command, args, options = {}) {
  const startedAt = Date.now();
  console.log(`\n=== ${name} ===`);
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    env: { ...process.env, TZ: 'UTC', ...options.env },
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'pipe'],
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  const status = result.error ? 1 : (result.status ?? 1);
  const logFileName = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}.log`;
  const logFile = path.join(logsDirectory, logFileName);
  fs.writeFileSync(logFile, `${result.stdout || ''}${result.stderr || ''}`);
  return {
    durationSeconds: ((Date.now() - startedAt) / 1000).toFixed(1),
    error: result.error?.message || (status === 0 ? null : `See .test-results/logs/${logFileName}`),
    name,
    passed: status === 0,
    status,
  };
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(absolute);
    return /\.(js|jsx)$/.test(entry.name) ? [absolute] : [];
  });
}

function countSourceSurface() {
  const files = [path.join(root, 'App.js'), ...walk(path.join(root, 'src'))];
  let functions = 0;
  let exportedFunctions = 0;
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const ast = parser.parse(source, { sourceType: 'module', plugins: ['jsx'] });
    traverse(ast, {
      Function(pathRef) {
        functions += 1;
        if (pathRef.findParent((parent) => parent.isExportNamedDeclaration() || parent.isExportDefaultDeclaration())) {
          exportedFunctions += 1;
        }
      },
    });
  }
  return { exportedFunctions, functions, modules: files.length };
}

function getJdk21() {
  const candidates = [];
  if (process.env.JAVA_HOME) candidates.push(process.env.JAVA_HOME);
  if (process.platform === 'darwin') {
    const result = spawnSync('/usr/libexec/java_home', ['-v', '21'], { encoding: 'utf8' });
    if (result.status === 0) candidates.push(result.stdout.trim());
  }

  return candidates.find((candidate) => {
    const java = path.join(candidate, 'bin', 'java');
    const result = spawnSync(java, ['-version'], { encoding: 'utf8' });
    return result.status === 0 && /version "21(?:\.|\")/.test(`${result.stdout}${result.stderr}`);
  }) || null;
}

const phases = [];
if (runFastGate) {
  fs.rmSync(jestResultsFile, { force: true });
  phases.push(runPhase('Jest simulated Android runtime and coverage', path.join(root, 'node_modules/.bin/jest'), [
    '--runInBand',
    '--coverage',
    '--json',
    `--outputFile=${jestResultsFile}`,
  ], { env: { NODE_ENV: 'test' } }));
  phases.push(runPhase('Legacy APK updater regression harness', process.execPath, ['scripts/test-apk-updater.js']));
  phases.push(runPhase('Legacy night-driving regression harness', process.execPath, ['scripts/test-night-driving.js']));
  phases.push(runPhase('Legacy storage recovery regression harness', process.execPath, ['scripts/test-storage.js']));
}

if (runBuildGate) {
  const exportDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'drively-test-export-'));
  phases.push(runPhase('Expo Android JavaScript and asset export', path.join(root, 'node_modules/.bin/expo'), [
    'export', '-p', 'android', '--output-dir', exportDirectory,
  ], { env: { NODE_ENV: 'production' } }));
  phases.push(runPhase('Website production build', 'npm', ['--prefix', 'website', 'run', 'build']));
  fs.rmSync(exportDirectory, { force: true, recursive: true });
}

if (runNativeGate) {
  const jdk21 = getJdk21();
  if (jdk21) {
    phases.push(runPhase(
      'Android native Kotlin and Java compilation',
      path.join(root, 'android/gradlew'),
      [':app:compileDebugKotlin', ':app:compileDebugJavaWithJavac', '--no-daemon'],
      { cwd: path.join(root, 'android'), env: { JAVA_HOME: jdk21, NODE_ENV: 'production' } }
    ));
  } else {
    phases.push({
      durationSeconds: '0.0',
      error: 'JDK 21 was not found in JAVA_HOME or the macOS Java registry.',
      name: 'Android native Kotlin and Java compilation',
      passed: false,
      status: 1,
    });
  }
}

let jestResults = null;
let coverage = null;
if (runFastGate) {
  try { jestResults = JSON.parse(fs.readFileSync(jestResultsFile, 'utf8')); } catch {}
  try { coverage = JSON.parse(fs.readFileSync(coverageSummaryFile, 'utf8')).total; } catch {}
}
const surface = countSourceSurface();
const overallPassed = phases.every((phase) => phase.passed);
const coverageCell = (metric) => coverage
  ? `${coverage[metric].pct}% (${coverage[metric].covered}/${coverage[metric].total})`
  : 'Unavailable';
const phaseRows = phases.map((phase) =>
  `| ${phase.passed ? 'PASS' : 'FAIL'} | ${phase.name} | ${phase.durationSeconds}s | ${phase.error || ''} |`
).join('\n');

const report = `# Drively ${gate} test report

Generated: ${new Date().toISOString()}

Overall result: **${overallPassed ? 'PASS' : 'FAIL'}**

Gate: **${gate}**

## Results

| Result | Phase | Time | Error |
| --- | --- | ---: | --- |
${phaseRows}

## Simulated runtime

- Application source modules inventoried: ${surface.modules}
- JavaScript function bodies inventoried: ${surface.functions}
- Exported JavaScript function bodies inventoried: ${surface.exportedFunctions}
- Jest suites: ${jestResults?.numTotalTestSuites ?? 'Unavailable'} total, ${jestResults?.numPassedTestSuites ?? 'Unavailable'} passed
- Jest assertions: ${jestResults?.numTotalTests ?? 'Unavailable'} total, ${jestResults?.numPassedTests ?? 'Unavailable'} passed
- Statements: ${coverageCell('statements')}
- Branches: ${coverageCell('branches')}
- Functions executed: ${coverageCell('functions')}
- Lines executed: ${coverageCell('lines')}

The Jest phase mounts every app screen and simulates Android-facing storage, permissions, background location tasks, drive tracking, drive detection, notifications, PiP, OTA, APK updates, weather, reports, and error paths. The source audit Babel-transforms the complete app, scripts, tests, and website source and checks coordinated Expo/Android release configuration.

## Runtime boundary

No local command can exhaustively prove every input permutation or replace a physical phone and live providers. This report does **not** prove real GPS accuracy, Android background-process survival, actual notification delivery, Picture-in-Picture rendering, Storage Access Framework UI, PDF rendering in a viewer, signed release installation, EAS/GitHub/Open-Meteo network behavior, OTA rollout behavior, or iOS runtime behavior. Those require device and live-service tests.

Coverage details: \`.test-results/coverage/index.html\`
Machine-readable Jest results: \`.test-results/jest-results.json\`
`;

fs.writeFileSync(reportFile, report);
console.log(`\nComprehensive report: ${reportFile}`);
console.log(`Overall result: ${overallPassed ? 'PASS' : 'FAIL'}`);
process.exitCode = overallPassed ? 0 : 1;
