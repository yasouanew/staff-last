const path = require('path');
const fs = require('fs');
const FileMap = require('metro-file-map').default;

const rootDir = fs.realpathSync.native(process.cwd());
console.log('rootDir:', rootDir);
const target = path.join(rootDir, 'node_modules', 'metro-runtime', 'src', 'polyfills', 'require.js');
const asyncRequire = path.join(rootDir, 'node_modules', 'metro-runtime', 'src', 'modules', 'asyncRequire.js');

(async () => {
    const fileMap = new FileMap({
        rootDir,
        computeSha1: true,
        enableSymlinks: false,
        extensions: ['js', 'jsx', 'ts', 'tsx', 'json', 'cjs', 'mjs'],
        ignorePattern: /(\\__tests__\\.*)$/,
        useWatchman: false,
        watch: false,
        maxWorkers: 1,
        retainAllFiles: true,
        roots: [rootDir],
        healthCheck: { enabled: false, filePrefix: '.metro-health-check', interval: 30000, timeout: 5000 },
    });

    const { fileSystem } = await fileMap.build();
    console.log('build done');

    const all = fileSystem.getAllFiles();
    console.log('total files:', all.length);
    const has = all.some((f) => f.toLowerCase() === target.toLowerCase());
    console.log('target present in getAllFiles:', has);

    const sha = await fileSystem.getOrComputeSha1(target);
    console.log('getOrComputeSha1 (lowercase root):', sha);

    const asyncLookup = fileSystem.lookup(asyncRequire);
    console.log('asyncRequire lookup:', JSON.stringify(asyncLookup));
    const asyncLower = asyncRequire.charAt(0).toLowerCase() + asyncRequire.slice(1);
    const asyncLookupLower = fileSystem.lookup(asyncLower);
    console.log('asyncRequire lookup (lowercase drive):', JSON.stringify(asyncLookupLower));

    const matches = all.filter((f) => f.toLowerCase().includes('metro-runtime'));
    console.log('metro-runtime files count:', matches.length);
    console.log('sample:', matches.slice(0, 5));

    await fileMap.end();
})().catch((e) => {
    console.error('PROBE ERROR', e);
    process.exit(1);
});
