import { defineConfig, Plugin } from 'vite';
import * as path from "path";
import * as fs from "fs";

const MODULE_ID = "masks-newgeneration-unofficial";
const FOUNDRY_PORT = 30000;
const DEV_SERVER_PORT = 30001;

/**
 * Plugin to replace dist/ prefix in template paths for production builds.
 * In dev, templates are at modules/MODULE/dist/templates/
 * In prod, templates are at modules/MODULE/templates/
 */
function templatePathPlugin(isDev: boolean): Plugin {
    // Match both literal paths and template literal paths like `modules/${var}/dist/`
    const distPatterns = [
        new RegExp(`modules/${MODULE_ID}/dist/`, 'g'),
        /\/dist\/templates\//g,  // Also catch template literals
    ];

    return {
        name: 'template-path-replace',
        // Transform the final bundle JS
        renderChunk(code) {
            if (isDev) return null;
            let result = code;
            // Replace /dist/templates/ with /templates/
            if (result.includes('/dist/templates/')) {
                result = result.replace(/\/dist\/templates\//g, '/templates/');
            }
            // Replace /dist/lang/ with /lang/ (if any)
            if (result.includes('/dist/lang/')) {
                result = result.replace(/\/dist\/lang\//g, '/lang/');
            }
            // Replace /dist/styles/ with /styles/ (if any)
            if (result.includes('/dist/styles/')) {
                result = result.replace(/\/dist\/styles\//g, '/styles/');
            }
            return result !== code ? result : null;
        },
        // Handle the publicDir copy (HBS files)
        closeBundle() {
            if (isDev) return;
            const distDir = path.resolve(__dirname, 'dist');
            const templatesDir = path.join(distDir, 'templates');
            const distPattern = new RegExp(`modules/${MODULE_ID}/dist/`, 'g');
            const prodPath = `modules/${MODULE_ID}/`;

            function processHbsFiles(dir: string) {
                if (!fs.existsSync(dir)) return;
                const files = fs.readdirSync(dir);
                for (const file of files) {
                    const filePath = path.join(dir, file);
                    const stat = fs.statSync(filePath);
                    if (stat.isDirectory()) {
                        processHbsFiles(filePath);
                    } else if (file.endsWith('.hbs')) {
                        let content = fs.readFileSync(filePath, 'utf8');
                        if (content.includes(`modules/${MODULE_ID}/dist/`)) {
                            content = content.replace(distPattern, prodPath);
                            fs.writeFileSync(filePath, content);
                        }
                    }
                }
            }
            processHbsFiles(templatesDir);
        }
    };
}

export default defineConfig(({ mode }) => {
    const isDev = mode === 'development';

    return {
        plugins: [templatePathPlugin(isDev)],
        // Vite automatically copies publicDir contents to outDir
        publicDir: path.resolve(__dirname, 'src/public'),
        base: `/modules/${MODULE_ID}/`,
        root: "src/",
        css: {
            devSourcemap: true,
        },
        server: {
            port: DEV_SERVER_PORT,
            open: false,
            proxy: {
                // Proxy everything except our module to Foundry
                [`^(?!/modules/${MODULE_ID})`]: `http://localhost:${FOUNDRY_PORT}/`,
                "/socket.io": {
                    target: `ws://localhost:${FOUNDRY_PORT}`,
                    ws: true,
                }
            },
            hmr: true,
        },
        build: {
            outDir: path.resolve(__dirname, "dist"),
            emptyOutDir: true,
            sourcemap: true,
            minify: !isDev,
            lib: {
                name: MODULE_ID,
                entry: path.resolve(__dirname, "src/dispatch.ts"),
                formats: ["es"],
                fileName: "dispatch"
            },
            rollupOptions: {
                output: {
                    assetFileNames: (assetInfo) => {
                        if (assetInfo.name?.endsWith('.css')) {
                            return 'styles/dispatch.css';
                        }
                        return 'assets/[name]-[hash][extname]';
                    }
                }
            }
        },
    };
});
