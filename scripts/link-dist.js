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
    console.log(`Linking dist → ${modulePath}`);
    await symlinkDir(resolve("dist"), modulePath);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
