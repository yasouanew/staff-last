/* Directly exercise the metro-file-map node crawler to see what it returns. */
const path = require('path');
const nodeCrawl = require(
    path.join(process.cwd(), 'node_modules/metro-file-map/src/crawlers/node/index.js'),
).default;

const rootDir = process.cwd();
const extensions = ['js', 'jsx', 'ts', 'tsx', 'json', 'png', 'xml'];

const ignore = (filePath) => /(\__tests__\.*)$/.test(filePath);

const previousState = {
    fileSystem: {
        getDifference: (fileData) => ({
            changedFiles: fileData,
            removedFiles: new Set(),
            clocks: new Map(),
        }),
    },
};

(async () => {
    const t = Date.now();
    const delta = await nodeCrawl({
        console: console,
        previousState,
        extensions,
        ignore,
        rootDir,
        includeSymlinks: true,
        roots: [rootDir],
        abortSignal: { throwIfAborted() { } },
    });
    let nm = 0;
    for (const k of delta.changedFiles.keys()) {
        if (k.includes('node_modules')) nm++;
    }
    console.log('crawl ms:', Date.now() - t);
    console.log('changedFiles:', delta.changedFiles.size, '| node_modules:', nm);
    process.exit(0);
})().catch((e) => {
    console.error('CRAWL ERROR:', e && e.stack ? e.stack : e);
    process.exit(1);
});
