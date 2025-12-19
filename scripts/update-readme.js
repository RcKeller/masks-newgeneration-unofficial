import fs from "fs";

const docsConfig = JSON.parse(fs.readFileSync("docs/config.json", "utf8"));

function replaceSection(readme, id, content) {
    const start = `<!-- docs:group:${id}:start -->`;
    const end = `<!-- docs:group:${id}:end -->`;
    // Use dotAll so [\s\S] isn’t needed
    const regex = new RegExp(`${start}[\\s\\S]*?${end}`, "s");
    return readme.replace(regex, `${start}\n${content}\n${end}`);
}

function buildGroupContent(group) {
    return group.children
        .map((child) => {
            const filePath = `docs/${child.file}`;
            let content = fs.readFileSync(filePath, "utf8").trim();
            content = content
                .replace(
                    /\]\(modules\/aeris-bg3-rolls\/examples\//g,
                    "](examples/"
                )
                .replace(
                    /src=(["'])modules\/aeris-bg3-rolls\/examples\//g,
                    "src=$1examples/"
                )
                .replace(
                    /<video[\s\S]*?<source src="examples\/([^"]+)\.webm"[^>]*>[\s\S]*?<\/video>/g,
                    "![](git-examples/$1.mp4)"
                );

            return content + "\n\n---";
        })
        .join("\n\n");
}

let readme = fs.readFileSync("README.md", "utf8");

for (const group of docsConfig.groups) {
    const id = group.label.toLowerCase().replace(/\s+/g, "-");
    if (readme.includes(`docs:group:${id}:start`)) {
        const content = buildGroupContent(group);
        readme = replaceSection(readme, id, content);
    }
}

fs.writeFileSync("README.md", readme);
console.log("README updated from docs groups.");
