const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');
const antigravity = process.argv.includes('--target=antigravity');

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
    // Clean dist folder
    const distPath = path.join(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
        console.log('Cleaning dist folder...');
        fs.rmSync(distPath, { recursive: true, force: true });
    }

    const extensionEntryPoint = antigravity ? 'src/extension.antigravity.ts' : 'src/extension.ts';
    console.log(`Building for ${antigravity ? 'Antigravity' : 'VS Code'} using entry point: ${extensionEntryPoint}`);

    // Extension bundle (Node.js)
    const extensionCtx = await esbuild.context({
        entryPoints: [extensionEntryPoint],
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

    // Plan Review webview bundle (browser)
    const planReviewCtx = await esbuild.context({
        entryPoints: ['src/webview/planReview.ts'],
        bundle: true,
        format: 'iife',
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        platform: 'browser',
        outfile: 'dist/planReview.js',
        logLevel: 'info',
        plugins: [esbuildProblemMatcherPlugin],
    });

    const contexts = [extensionCtx, webviewCtx, planReviewCtx];

    // CLI bundle (Node.js standalone) - Only for Antigravity
    if (antigravity) {
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
        contexts.push(cliCtx);
    }

    if (watch) {
        await Promise.all(contexts.map(ctx => ctx.watch()));
    } else {
        await Promise.all(contexts.map(ctx => ctx.rebuild()));
        await Promise.all(contexts.map(ctx => ctx.dispose()));
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
