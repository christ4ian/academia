const fs = require('fs');
const path = require('path');

const localCacheModules = 'C:\\Users\\cacap\\.cache\\academia-deps\\node_modules';
if (fs.existsSync(localCacheModules)) {
  module.paths.unshift(localCacheModules);
}

const esbuild = require('esbuild');

async function build() {
  if (!fs.existsSync('www')) fs.mkdirSync('www', { recursive: true });

  const nodePaths = [];
  if (fs.existsSync(localCacheModules)) nodePaths.push(localCacheModules);

  await esbuild.build({
    entryPoints: ['src/main.js'],
    bundle: true,
    minify: true,
    sourcemap: false,
    target: ['es2020'],
    nodePaths,
    outfile: 'www/app.js',
  });

  await esbuild.build({
    entryPoints: ['src/styles.css'],
    bundle: true,
    minify: true,
    outfile: 'www/app.css',
  });

  // Copy app.js & app.css to root so `python -m http.server 8080` works in root too
  fs.copyFileSync('www/app.js', 'app.js');
  fs.copyFileSync('www/app.css', 'app.css');

  // Copy static assets to www/
  const assets = [
    'index.html',
    'manifest.webmanifest',
    'service-worker.js',
    'icon-192.png',
    'icon-512.png',
  ];
  for (const file of assets) {
    if (fs.existsSync(file)) {
      fs.copyFileSync(file, path.join('www', file));
    }
  }
  if (fs.existsSync('www/gemini-quickadd.js')) {
    fs.unlinkSync('www/gemini-quickadd.js');
  }
  console.log('Build finished: www/app.js, www/app.css, and static assets prepared.');
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
