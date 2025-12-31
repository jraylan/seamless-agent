/* eslint-disable no-console */

/**
 * Generates a types-only package for addon authors.
 *
 * Default output: ./dist-addon-api
 *
 * The generated package contains:
 * - .d.ts (emitDeclarationOnly)
 * - minimal package.json
 * - README.md (composed from src/api/README.md and src/addons/README.md)
 * - LICENSE
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function parseArgs(argv) {
    const args = new Map();
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a.startsWith('--')) {
            const next = argv[i + 1];
            if (!next || next.startsWith('--')) {
                args.set(a, true);
            } else {
                args.set(a, next);
                i++;
            }
        }
    }
    return args;
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function safeReadText(filePath) {
    if (!fs.existsSync(filePath)) return '';
    return fs.readFileSync(filePath, 'utf8');
}

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

function writeFile(filePath, content) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, content);
}

function copyFile(src, dest) {
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
}

function rmDir(dir) {
    if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

function getLocalTscBin(repoRoot) {
    const bin = process.platform === 'win32'
        ? path.join(repoRoot, 'node_modules', '.bin', 'tsc.cmd')
        : path.join(repoRoot, 'node_modules', '.bin', 'tsc');

    if (fs.existsSync(bin)) return bin;
    return null;
}

function main() {
    const repoRoot = path.resolve(__dirname, '..');
    const args = parseArgs(process.argv.slice(2));

    const outDir = path.resolve(repoRoot, args.get('--outDir') || 'dist-addon-api');
    const pkgName = String(args.get('--name') || 'seamless-agent-addon-api');

    const rootPkg = readJson(path.join(repoRoot, 'package.json'));
    const version = String(args.get('--version') || rootPkg.version);

    const vscodeVersion = rootPkg.devDependencies['@types/vscode'] || '^1.81.0';
    const codiconsVersion = rootPkg.devDependencies['@vscode/codicons'] || '^0.0.44';


    console.log('[addon-typedefs] output:', outDir);
    console.log('[addon-typedefs] package name:', pkgName);
    console.log('[addon-typedefs] version:', version);

    rmDir(outDir);

    const tscBin = getLocalTscBin(repoRoot);
    const tscCmd = tscBin ? `"${tscBin}"` : 'npx tsc';

    console.log('[addon-typedefs] generating declarations...');
    execSync(`${tscCmd} -p tsconfig.addon-typedefs.json`, {
        cwd: repoRoot,
        stdio: 'inherit',
    });

    // Create index.d.ts at the package root to simplify imports
    // (re-exports the entrypoint generated in dist-addon-api/addon-typedefs/index.d.ts)
    const indexDts = [
        "/**",
        "* Seamless Agent Addon API (types-only)",
        "*",
        "* Use only in type-only contexts: `import type { ... }`.",
        "*/",
        "export * from './addon-typedefs';",
    ].join('\n');
    writeFile(path.join(outDir, 'index.d.ts'), indexDts);

    // README: compose from the modules' README files
    const apiReadme = safeReadText(path.join(repoRoot, 'src', 'api', 'README.md'));
    const addonsReadme = safeReadText(path.join(repoRoot, 'src', 'addons', 'README.md'));

    const readmeParts = [
        '# Seamless Agent — Addon API (Types Only)\n',
        'This package contains **type definitions only** (TypeScript) for addon authors to integrate with the **Seamless Agent** extension.\n',
        '\n> Tip: always use `import type { ... }` to ensure nothing is imported at runtime.\n',
        apiReadme ? `\n---\n\n## API\n\n${apiReadme.trim()}\n` : '',
        addonsReadme ? `\n---\n\n## Addons\n\n${addonsReadme.trim()}\n` : '',
    ].filter(Boolean);

    writeFile(path.join(outDir, 'README.md'), readmeParts.join('\n'));

    // LICENSE
    const licenseSrc = path.join(repoRoot, 'LICENSE.md');
    if (fs.existsSync(licenseSrc)) {
        copyFile(licenseSrc, path.join(outDir, 'LICENSE.md'));
    }

    // package.json for the types-only package
    const typesPkg = {
        name: pkgName,
        version,
        description: 'Type definitions for Seamless Agent addon extensions',
        license: rootPkg.license || 'MIT',
        repository: rootPkg.repository,
        keywords: ['vscode', 'seamless-agent', 'addon', 'types', 'typings'],
        sideEffects: false,
        types: './index.d.ts',
        exports: {
            '.': {
                types: './index.d.ts'
            }
        },
        // Dependencies used only for consumer typing/compilation
        peerDependencies: {
            '@types/vscode': vscodeVersion,
            '@vscode/codicons': codiconsVersion,
        },
        files: [
            '**/*.d.ts',
            'README.md',
            'LICENSE.md',
        ]
    };

    writeFile(path.join(outDir, 'package.json'), JSON.stringify(typesPkg, null, 2));

    console.log('[addon-typedefs] done');
}

main();
