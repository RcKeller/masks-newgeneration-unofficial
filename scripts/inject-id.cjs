const fs = require("fs");
const path = require("path");

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const filePath = path.resolve(__dirname, "../dist/module.json");

let moduleJson = JSON.parse(fs.readFileSync(filePath, "utf8"));

// Replace ID placeholder if present
if (moduleJson.id === "ID_PLACEHOLDER") {
    moduleJson.id = pkg.name;
    console.log(`Replaced ID_PLACEHOLDER with "${pkg.name}"`);
}

// Fix paths for production (remove dist/ prefix since dist/ becomes the root)
if (moduleJson.esmodules) {
    moduleJson.esmodules = moduleJson.esmodules.map(p => p.replace(/^dist\//, ""));
}
if (moduleJson.styles) {
    moduleJson.styles = moduleJson.styles.map(p => p.replace(/^dist\//, ""));
}

// Remove the non-standard "includes" key if present
delete moduleJson.includes;

fs.writeFileSync(filePath, JSON.stringify(moduleJson, null, 2));
console.log("Production module.json prepared successfully");
