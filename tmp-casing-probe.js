/* Temporary diagnostic: compare file map with watch on vs off. */
const { loadConfig } = require('metro-config');

(async () => {
    const config = await loadConfig({ cwd: process.cwd() }, {});
    console.log('projectRoot   =', config.projectRoot);

    const createFileMap = require('metro/private/node-haste/DependencyGraph/createFileMap').default;
    const defaults = require('metro-config/private/defaults/defaults');
    const ms = defaults.moduleSystem;

    for (const watch of [false, true]) {
        const { fileMap } = createFileMap(config, { watch, throwOnModuleCollision: false });
        const { fileSystem } = await fileMap.build();
        const all = Array.from(fileSystem.getAllFiles());
        const nm = all.filter(k => /require\.js$/.test(k) && /metro-runtime/.test(k));
        console.log(`--- watch=${watch} ---`);
        console.log('  total files   =', all.length);
        console.log('  lookup exists =', fileSystem.lookup(ms).exists);
        console.log('  getSha1       =', fileSystem.getSha1(ms));
        console.log('  require.js key=', JSON.stringify(nm.slice(0, 2)));
        await fileMap.end();
    }
    process.exit(0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
