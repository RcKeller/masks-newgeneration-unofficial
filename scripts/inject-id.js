const fs = require("fs");
const path = require("path");

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const filePath = path.resolve(__dirname, "../dist/module.json");

let moduleJson = fs.readFileSync(filePath, "utf8");

moduleJson = moduleJson.replace(/ID_PLACEHOLDER/g, pkg.name);

fs.writeFileSync(filePath, moduleJson);
console.log(`Replaced ID_PLACEHOLDER with "${pkg.name}"`);
