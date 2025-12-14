#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const version = process.argv[2];
if (!version) {
    console.error('Version argument is required');
    process.exit(1);
}

async function prepareRelease() {
    const rootDir = path.join(__dirname, '../..');
    const distDir = path.join(rootDir, 'dist');

    try {
        // 1. Update module.json version in dist
        const moduleJsonPath = path.join(distDir, 'module.json');
        if (fs.existsSync(moduleJsonPath)) {
            const moduleJson = JSON.parse(fs.readFileSync(moduleJsonPath, 'utf8'));
            moduleJson.version = version;
            fs.writeFileSync(moduleJsonPath, JSON.stringify(moduleJson, null, 2));
            console.log(`Updated module.json version to ${version}`);
        } else {
            console.error('dist/module.json not found!');
            process.exit(1);
        }

        // 2. Copy static assets from root to dist for packaging
        const staticAssets = [
            { src: 'images', dest: 'images' },
            { src: 'packs', dest: 'packs' },
            { src: 'LICENSE', dest: 'LICENSE' },
            { src: 'README.md', dest: 'README.md' },
            { src: 'CHANGELOG.md', dest: 'CHANGELOG.md' }
        ];

        for (const asset of staticAssets) {
            const srcPath = path.join(rootDir, asset.src);
            const destPath = path.join(distDir, asset.dest);

            if (fs.existsSync(srcPath)) {
                const stat = fs.statSync(srcPath);
                if (stat.isDirectory()) {
                    // Remove existing directory if it exists
                    if (fs.existsSync(destPath)) {
                        fs.rmSync(destPath, { recursive: true });
                    }
                    fs.cpSync(srcPath, destPath, { recursive: true });
                    console.log(`Copied ${asset.src}/ to dist/`);
                } else {
                    fs.copyFileSync(srcPath, destPath);
                    console.log(`Copied ${asset.src} to dist/`);
                }
            } else {
                console.warn(`Warning: ${asset.src} not found, skipping...`);
            }
        }

        // 3. Get includes from module.json
        const getIncludesScript = path.join(__dirname, 'get-includes.js');
        const includes = execSync(`node ${getIncludesScript}`, {
            encoding: 'utf8',
            cwd: rootDir
        }).trim();
        console.log(`Files to include: ${includes}`);

        // 4. Create zip file from dist directory
        const zipPath = path.join(rootDir, 'module.zip');

        // Remove existing zip if it exists
        if (fs.existsSync(zipPath)) {
            fs.unlinkSync(zipPath);
        }

        // Create the zip - execute from dist directory
        execSync(`zip -r "${zipPath}" ${includes}`, {
            stdio: 'inherit',
            cwd: distDir
        });
        console.log(`Created module.zip with version ${version}`);

        // 5. Verify the zip was created
        if (!fs.existsSync(zipPath)) {
            console.error('Failed to create module.zip!');
            process.exit(1);
        }

        const stats = fs.statSync(zipPath);
        console.log(`module.zip size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

    } catch (error) {
        console.error('Error preparing release:', error.message);
        process.exit(1);
    }
}

prepareRelease();
