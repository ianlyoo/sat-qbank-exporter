import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const STAGING_DIR = path.join(DIST_DIR, 'staging');
const RELEASE_DIR = path.join(DIST_DIR, 'release');

const COMMON_PATHS = [
  'README.md',
  'package.json',
  'package-lock.json',
  'batch_export.mjs',
  'server.mjs',
  'public',
  'src',
  'scripts/launch.mjs',
];

function run(command, args, description) {
  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(`${description} failed.`);
  }
}

async function removeAndRecreate(dirPath) {
  await fs.rm(dirPath, { recursive: true, force: true });
  await fs.mkdir(dirPath, { recursive: true });
}

async function copyEntry(sourceRelativePath, destinationRoot) {
  const sourcePath = path.join(ROOT_DIR, sourceRelativePath);
  const destinationPath = path.join(destinationRoot, sourceRelativePath);
  await fs.cp(sourcePath, destinationPath, { recursive: true });
}

async function writeQuickStart(destinationRoot, launcherName, platformLabel) {
  const contents = [
    'SAT Question Bank Exporter',
    '',
    `Platform: ${platformLabel}`,
    '',
    'Quick start:',
    `1. Install Node.js 20+ if it is not already available.`,
    `2. Run ${launcherName}.`,
    '3. On first launch, dependencies and Playwright Chromium will install automatically.',
    '4. The launcher will open http://localhost:4173 in your browser.',
    '',
    'Exported PDFs are saved into the output folder next to the app files.',
    '',
  ].join('\n');

  await fs.writeFile(path.join(destinationRoot, 'QUICK_START.txt'), contents);
}

async function stagePackage({ platform, launcherSource, launcherTarget, platformLabel }) {
  const packageDirName = `sat-qbank-exporter-${platform}`;
  const destinationRoot = path.join(STAGING_DIR, packageDirName);

  await removeAndRecreate(destinationRoot);

  for (const entry of COMMON_PATHS) {
    await copyEntry(entry, destinationRoot);
  }

  await fs.copyFile(path.join(ROOT_DIR, launcherSource), path.join(destinationRoot, launcherTarget));
  if (launcherTarget.endsWith('.command')) {
    await fs.chmod(path.join(destinationRoot, launcherTarget), 0o755);
  }

  await writeQuickStart(destinationRoot, launcherTarget, platformLabel);
  return { packageDirName, destinationRoot };
}

async function createArchive(sourceDir, archivePath) {
  await fs.rm(archivePath, { force: true });

  if (process.platform === 'win32') {
    run(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Compress-Archive -Path '${sourceDir}\\*' -DestinationPath '${archivePath}' -CompressionLevel Optimal`,
      ],
      `Creating archive ${path.basename(archivePath)}`
    );
    return;
  }

  run('zip', ['-qr', archivePath, path.basename(sourceDir)], `Creating archive ${path.basename(archivePath)}`);
}

async function main() {
  const packageJson = JSON.parse(await fs.readFile(path.join(ROOT_DIR, 'package.json'), 'utf8'));
  const version = packageJson.version || '0.1.0';
  const versionSuffix = `v${version}`;

  await fs.mkdir(DIST_DIR, { recursive: true });
  await removeAndRecreate(STAGING_DIR);
  await removeAndRecreate(RELEASE_DIR);

  const windowsStage = await stagePackage({
    platform: 'windows',
    launcherSource: 'launch.bat',
    launcherTarget: 'Start SAT Exporter.bat',
    platformLabel: 'Windows',
  });

  const macStage = await stagePackage({
    platform: 'macos',
    launcherSource: 'launch.command',
    launcherTarget: 'Start SAT Exporter.command',
    platformLabel: 'macOS',
  });

  const archives = [
    {
      sourceDir: windowsStage.destinationRoot,
      archivePath: path.join(RELEASE_DIR, `sat-qbank-exporter-windows-${versionSuffix}.zip`),
    },
    {
      sourceDir: macStage.destinationRoot,
      archivePath: path.join(RELEASE_DIR, `sat-qbank-exporter-macos-${versionSuffix}.zip`),
    },
  ];

  for (const archive of archives) {
    await createArchive(archive.sourceDir, archive.archivePath);
  }

  console.log('\nRelease artifacts:');
  archives.forEach((archive) => {
    console.log(`- ${archive.archivePath}`);
  });
}

await main();
