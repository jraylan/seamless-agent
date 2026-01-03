const fs = require('fs');
const { execSync } = require('child_process');

const target = process.argv[2]; // 'vsce' or 'ovsx'

if (!target || (target !== 'vsce' && target !== 'ovsx')) {
    console.error('Usage: node build-package.js <vsce|ovsx>');
    process.exit(1);
}

const originalReadme = 'README.md';
const antigravityReadme = 'README.antigravity.md';
const backupReadme = 'README.md.bak';

try {
    // 1. Prepare README and package.json
    if (target === 'ovsx') {
        console.log(`[${target}] Preparing Antigravity README and package.json...`);

        // Swap README
        if (fs.existsSync(originalReadme)) {
            fs.copyFileSync(originalReadme, backupReadme);
        }
        if (fs.existsSync(antigravityReadme)) {
            fs.copyFileSync(antigravityReadme, originalReadme);
        } else {
            console.error(`Error: ${antigravityReadme} not found!`);
            process.exit(1);
        }

        // Modify package.json
        const packageJson = 'package.json';
        const backupPackageJson = 'package.json.bak';
        if (fs.existsSync(packageJson)) {
            fs.copyFileSync(packageJson, backupPackageJson);
            const pkg = JSON.parse(fs.readFileSync(packageJson, 'utf8'));

            if (!pkg.contributes) pkg.contributes = {};
            if (!pkg.contributes.commands) pkg.contributes.commands = [];

            // Add Antigravity-specific command
            pkg.contributes.commands.push({
                "command": "seamless-agent.restartMcpServer",
                "title": "Restart Seamless Agent MCP Server"
            });

            // Add bin entry
            pkg.bin = {
                "seamless-agent-mcp": "./dist/seamless-agent-mcp.js"
            };

            fs.writeFileSync(packageJson, JSON.stringify(pkg, null, 2));
        }

    } else {
        console.log(`[${target}] Using standard README...`);
        // Ensure we are using the original README (if backup exists, restore it to be safe, though we usually clean up)
        if (fs.existsSync(backupReadme)) {
            fs.copyFileSync(backupReadme, originalReadme);
        }
    }

    // 2. Compile
    console.log(`[${target}] Compiling...`);
    if (target === 'ovsx') {
        execSync('npm run compile:antigravity', { stdio: 'inherit' });
    } else {
        execSync('npm run compile:vscode', { stdio: 'inherit' });
    }

    // 3. Package
    console.log(`[${target}] Packaging...`);
    // We use vsce package for both, as it generates the VSIX. 
    // If 'ovsx' CLI is strictly required for packaging, we would use it, but usually vsce produces the standard VSIX.
    // The user command name 'package:ovsx' implies targeting the OVSX registry/ecosystem.
    // We'll add a flag to the output filename to distinguish them.
    const version = require('../package.json').version;
    const outFile = target === 'ovsx' ? `seamless-agent-${version}-antigravity.vsix` : `seamless-agent-${version}.vsix`;

    execSync(`npx vsce package --out ${outFile}`, { stdio: 'inherit' });

    console.log(`[${target}] Done! Created ${outFile}`);

} catch (error) {
    console.error(`[${target}] Error:`, error.message);
    process.exit(1);
} finally {
    // 4. Cleanup / Restore
    if (target === 'ovsx') {
        if (fs.existsSync(backupReadme)) {
            console.log(`[${target}] Restoring original README...`);
            fs.copyFileSync(backupReadme, originalReadme);
            fs.unlinkSync(backupReadme);
        }
        const backupPackageJson = 'package.json.bak';
        const packageJson = 'package.json';
        if (fs.existsSync(backupPackageJson)) {
            console.log(`[${target}] Restoring original package.json...`);
            fs.copyFileSync(backupPackageJson, packageJson);
            fs.unlinkSync(backupPackageJson);
        }
    }
}
