const path = require("path");
const fse = require("fs-extra");

const MODULE_ID = "masks-newgeneration-unofficial";

function foundryDirectoryPath() {
    const devDataDir = process.env.FVTT_DEV_DATA;
    if (devDataDir && devDataDir.length !== 0) {
        return path.join(devDataDir, "modules", MODULE_ID);
    }
    // We're already in the Foundry modules folder - no copy needed
    return null;
}

function releaseLocal() {
    const targetPath = foundryDirectoryPath();

    if (!targetPath) {
        console.log(`[${MODULE_ID}] Already in Foundry modules folder.`);
        console.log(`[${MODULE_ID}] Build complete - dist/ contains the built module.`);
        return;
    }

    const absolutePath = path.resolve(targetPath);
    console.log(`[${MODULE_ID}] Installing to: "${absolutePath}"`);

    // Copy dist/ contents (JS, CSS, templates, module.json)
    fse.copySync("dist", absolutePath, { overwrite: true });

    // Copy static assets from root (images, packs, lang)
    const staticDirs = ["images", "packs", "lang"];
    staticDirs.forEach(dir => {
        const src = path.resolve(dir);
        const dest = path.join(absolutePath, dir);
        if (fse.existsSync(src)) {
            console.log(`[${MODULE_ID}] Copying ${dir}/...`);
            fse.copySync(src, dest, { overwrite: true });
        }
    });

    console.log(`[${MODULE_ID}] Installation complete.`);
}

releaseLocal();
