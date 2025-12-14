import { defineConfig } from 'vite';
import * as path from "path";

const MODULE_ID = "masks-newgeneration-unofficial";
const FOUNDRY_PORT = 30000;
const DEV_SERVER_PORT = 30001;

export default defineConfig(({ mode }) => {
    const isDev = mode === 'development';

    return {
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
