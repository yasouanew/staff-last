const fs = require('fs');
const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Windows drive-letter casing fix.
 *
 * On this machine `process.cwd()` (and therefore Metro's default `projectRoot`)
 * is lowercase — `c:\laragon\www\StaffSaaSMobile` — while Node's
 * `fs.realpathSync.native()` canonicalises the same path to an uppercase drive
 * letter — `C:\laragon\www\StaffSaaSMobile`.
 *
 * Metro's resolver canonicalises every module path with `realpathSync.native`
 * (uppercase), but several config values are produced by `require.resolve`,
 * which inherits the lowercase `process.cwd()`. `RootPathUtils.absoluteToNormal`
 * matches the root prefix *case-sensitively*, so any path whose casing differs
 * from the file map's root fails to resolve — the dev server returns 404 for
 * `./index` (redbox) or throws "Failed to get the SHA-1" for polyfills.
 *
 * The fix is to make every path Metro sees use the same canonical casing:
 *   1. Pin `projectRoot` to the native realpath (uppercase). `loadConfig`
 *      derives `watchFolders` from it, so the crawler and resolver agree.
 *   2. Canonicalise the config values that come from `require.resolve` so they
 *      match the file map instead of the lowercase cwd.
 */
const projectRoot = fs.realpathSync.native(__dirname);

/**
 * Rewrite a path's drive letter (and any other casing differences) to match the
 * canonical `projectRoot`. Paths outside the project root are returned as-is.
 */
const canonicalize = (filePath) => {
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) {
        return filePath;
    }
    const relative = path.relative(projectRoot, filePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        return filePath;
    }
    return path.join(projectRoot, relative);
};

const defaultConfig = getDefaultConfig(projectRoot);

const config = {
    projectRoot,
    resolver: {
        /**
         * Watchman is disabled so the built-in node crawler is used. The node
         * crawler walks from `projectRoot` (the canonical uppercase path),
         * keeping file-map keys consistent with the resolver. Watchman is only a
         * performance optimisation here, not a correctness requirement.
         */
        useWatchman: false,
    },
    serializer: {
        getModulesRunBeforeMainModule: () =>
            defaultConfig.serializer
                .getModulesRunBeforeMainModule()
                .map(canonicalize),
        getPolyfills: () => defaultConfig.serializer.getPolyfills().map(canonicalize),
    },
    transformer: {
        asyncRequireModulePath: canonicalize(
            defaultConfig.transformer.asyncRequireModulePath,
        ),
        babelTransformerPath: canonicalize(
            defaultConfig.transformer.babelTransformerPath,
        ),
    },
    watcher: {
        unstable_lazySha1: false,
    },
};

module.exports = mergeConfig(defaultConfig, config);
