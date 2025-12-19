import os from "os";
import { join, resolve } from "path";
import symlinkDir from "symlink-dir";

const foundryModules =
    process.env.FOUNDRY_MODULES_PATH ||
    (process.platform === "win32"
        ? join(
              os.homedir(),
              "AppData",
              "Local",
              "FoundryVTT",
              "Data",
              "modules"
          )
        : process.platform === "darwin"
        ? join(
              os.homedir(),
              "Library",
              "Application Support",
              "FoundryVTT",
              "Data",
              "modules"
          )
        : join(
              os.homedir(),
              ".local",
              "share",
              "FoundryVTT",
              "Data",
              "modules"
          ));

const moduleName = "masks-newgeneration-unofficial";
const modulePath = join(foundryModules, moduleName);

async function main() {
    console.log(`Linking dev → ${modulePath}`);
    await symlinkDir(resolve("dev"), modulePath);

    // Symlink docs for aeris-core documentation
    console.log("Linking docs → dev/docs");
    await symlinkDir(resolve("docs"), join("dev", "docs"));

    // Symlink packs for compendium content
    console.log("Linking packs → dev/packs");
    await symlinkDir(resolve("packs"), join("dev", "packs"));

    // Symlink static assets from src/public
    console.log("Linking src/public/lang → dev/lang");
    await symlinkDir(resolve("src/public/lang"), join("dev", "lang"));

    console.log("Linking src/public/templates → dev/templates");
    await symlinkDir(resolve("src/public/templates"), join("dev", "templates"));

    console.log("Linking src/public/images → dev/images");
    await symlinkDir(resolve("src/public/images"), join("dev", "images"));

    console.log("Linking src/public/assets → dev/assets");
    await symlinkDir(resolve("src/public/assets"), join("dev", "assets"));

    console.log("Done! Development symlinks created.");
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
