const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** @type {import('esbuild').Plugin} */
const esbuildProblemMatcherPlugin = {
    name: 'esbuild-problem-matcher',
    setup(build) {
        build.onStart(() => {
            console.log('[watch] build started');
        });
        build.onEnd((result) => {
            result.errors.forEach(({ text, location }) => {
                console.error(`✘ [ERROR] ${text}`);
                if (location) {
                    console.error(`    ${location.file}:${location.line}:${location.column}:`);
                }
            });
            console.log('[watch] build finished');
        });
    },
};

/** @type {import('esbuild').Plugin} */
const shebangPlugin = {
    name: 'shebang',
    setup(build) {
        build.onEnd(async (result) => {
            if (result.errors.length === 0) {
                const fs = require('fs');
                const outfile = build.initialOptions.outfile;
                if (outfile && outfile.includes('seamless-agent-mcp.js')) {
                    const content = fs.readFileSync(outfile, 'utf8');
                    // Remove any existing shebang and add it at the very start
                    const withoutShebang = content.replace(/^#!.*\n?/, '');
                    fs.writeFileSync(outfile, '#!/usr/bin/env node\n' + withoutShebang);
                }
            }
        });
    },
};

async function main() {
    // Extension bundle (Node.js)
    const extensionCtx = await esbuild.context({
        entryPoints: ['src/extension.ts'],
        bundle: true,
        format: 'cjs',
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        platform: 'node',
        outfile: 'dist/extension.js',
        external: ['vscode'],
        logLevel: 'info',
        plugins: [esbuildProblemMatcherPlugin],
    });

    // Webview bundle (browser)
    const webviewCtx = await esbuild.context({
        entryPoints: ['src/webview/main.ts'],
        bundle: true,
        format: 'iife',
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        platform: 'browser',
        outfile: 'dist/webview.js',
        logLevel: 'info',
        plugins: [esbuildProblemMatcherPlugin],
    });

    // CLI bundle (Node.js standalone)
    const cliCtx = await esbuild.context({
        entryPoints: ['bin/seamless-agent-mcp.js'],
        bundle: true,
        format: 'cjs',
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        platform: 'node',
        outfile: 'dist/seamless-agent-mcp.js',
        external: [],  // Bundle all dependencies
        logLevel: 'info',
        plugins: [esbuildProblemMatcherPlugin, shebangPlugin],
    });

    if (watch) {
        await Promise.all([extensionCtx.watch(), webviewCtx.watch(), cliCtx.watch()]);
    } else {
        await extensionCtx.rebuild();
        await webviewCtx.rebuild();
        await cliCtx.rebuild();
        await extensionCtx.dispose();
        await webviewCtx.dispose();
        await cliCtx.dispose();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
