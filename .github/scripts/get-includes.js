import * as fs from "fs";
const moduleContent = fs.readFileSync('module.json', 'utf8');
const moduleJson = JSON.parse(moduleContent);
console.log(moduleJson.includes.join(" "));
