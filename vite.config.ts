import { defineConfig, type PluginOption } from 'vite';
import * as path from "path";
import * as fs from "fs";

const MODULE_ID = "masks-newgeneration-unofficial";
const FOUNDRY_PORT = 30000;
const DEV_SERVER_PORT = 30001;

/**
 * Plugin to copy templates, module.json, and lang to dist
 */
function copyAssetsPlugin(): PluginOption {
    const srcPublic = path.resolve(__dirname, 'src/public');
    const distDir = path.resolve(__dirname, 'dist');
    const langSrc = path.resolve(__dirname, 'lang');

    function ensureDir(dir: string) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    function copyDir(src: string, dest: string) {
        ensureDir(dest);
        if (fs.existsSync(src)) {
            fs.cpSync(src, dest, { recursive: true });
        }
    }

    function copyFile(src: string, dest: string) {
        if (fs.existsSync(src)) {
            fs.copyFileSync(src, dest);
        }
    }

    function syncAssets() {
        ensureDir(distDir);
        copyDir(path.join(srcPublic, 'templates'), path.join(distDir, 'templates'));
        copyFile(path.join(srcPublic, 'module.json'), path.join(distDir, 'module.json'));
        copyDir(langSrc, path.join(distDir, 'lang'));
    }

    return {
        name: 'copy-assets',
        buildStart() {
            syncAssets();
            console.log(`[${MODULE_ID}] Assets synced to dist/`);
        },
        writeBundle() {
            syncAssets();
        },
        // For vite build --watch: use fs.watch to detect template/lang changes
        configResolved(config) {
            if (config.build.watch) {
                const watchDirs = [
                    { src: path.join(srcPublic, 'templates'), dest: path.join(distDir, 'templates'), name: 'templates' },
                    { src: langSrc, dest: path.join(distDir, 'lang'), name: 'lang' }
                ];

                watchDirs.forEach(({ src, dest, name }) => {
                    if (fs.existsSync(src)) {
                        fs.watch(src, { recursive: true }, (event, filename) => {
                            if (!filename) return;
                            console.log(`[${MODULE_ID}] ${name}/${filename} changed, syncing...`);
                            copyDir(src, dest);
                            // Touch a file to trigger Foundry's hot reload
                            const touchFile = name === 'templates'
                                ? path.join(dest, filename)
                                : path.join(dest, filename);
                            if (fs.existsSync(touchFile)) {
                                const now = new Date();
                                fs.utimesSync(touchFile, now, now);
                            }
                        });
                        console.log(`[${MODULE_ID}] Watching ${name}/`);
                    }
                });
            }
        }
    };
}

/**
 * Plugin to serve files correctly for Vite dev server
 * This enables true HMR when using `npm run serve`
 */
function devServerPlugin(): PluginOption {
    return {
        name: 'dev-server-middleware',
        configureServer(server) {
            // Middleware to serve dist files for the dev server
            server.middlewares.use((req, res, next) => {
                const url = req.url || '';

                // If requesting a dist file, serve from the dist directory
                if (url.includes('/dist/')) {
                    const distPath = path.resolve(__dirname, 'dist', url.replace(/.*\/dist\//, ''));
                    if (fs.existsSync(distPath)) {
                        const stat = fs.statSync(distPath);
                        if (stat.isFile()) {
                            const content = fs.readFileSync(distPath);
                            const ext = path.extname(distPath);
                            const mimeTypes: Record<string, string> = {
                                '.js': 'application/javascript',
                                '.mjs': 'application/javascript',
                                '.css': 'text/css',
                                '.json': 'application/json',
                                '.hbs': 'text/html',
                                '.html': 'text/html',
                            };
                            res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
                            res.end(content);
                            return;
                        }
                    }
                }
                next();
            });
        }
    };
}

export default defineConfig(({ command, mode }) => {
    const isServe = command === 'serve';
    const isDev = mode === 'development';
    const isWatch = isDev && !isServe;

    return {
        publicDir: false,
        base: `/modules/${MODULE_ID}/`,
        root: "src/",
        css: {
            devSourcemap: true,
            preprocessorOptions: {
                scss: {}
            }
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
            watch: {
                usePolling: true, // More reliable on macOS
                interval: 100
            }
        },
        build: {
            outDir: path.resolve(__dirname, "dist"),
            // CRITICAL: Don't empty the directory in watch mode - breaks file watching!
            emptyOutDir: !isWatch,
            sourcemap: true,
            cssCodeSplit: false,
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
        plugins: [
            copyAssetsPlugin(),
            isServe ? devServerPlugin() : null
        ].filter(Boolean)
    };
});
