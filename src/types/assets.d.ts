/**
 * Static asset module declarations.
 *
 * Metro resolves `require('./logo.png')` to an opaque asset handle at runtime,
 * but TypeScript has no built-in knowledge of that transform. These declarations
 * give the bundler's asset imports a type so a `.png` can be referenced from a
 * typed module (e.g. [`brandAssets`](src/utils/brandAssets.ts:1)) without a
 * `// @ts-expect-error` at every call site.
 *
 * The value is typed as `number` because that is what React Native's asset
 * registry returns for a bundled image — the same shape `ImageSourcePropType`
 * accepts.
 */
declare module '*.png' {
    const asset: number;
    export default asset;
}

declare module '*.jpg' {
    const asset: number;
    export default asset;
}

declare module '*.jpeg' {
    const asset: number;
    export default asset;
}

declare module '*.gif' {
    const asset: number;
    export default asset;
}

declare module '*.webp' {
    const asset: number;
    export default asset;
}

declare module '*.svg' {
    const asset: number;
    export default asset;
}
