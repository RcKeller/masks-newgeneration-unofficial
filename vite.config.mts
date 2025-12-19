import tailwindcss from "@tailwindcss/vite";
import path, { resolve } from "path";
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { MODULE_ID } from "./src/config";

export default defineConfig(({ mode }) => {
    const isDev = mode === "development";

    return {
        plugins: [
            tailwindcss(),
            viteStaticCopy({
                targets: [
                    {
                        src: "docs",
                        dest: "",
                    },
                    {
                        src: "module.json",
                        dest: "",
                    },
                ],
            }),
        ],

        base: isDev ? `/modules/${MODULE_ID}/` : "./",

        server: isDev
            ? {
                  port: 30001,
                  proxy: {
                      [`^/(?!modules/${MODULE_ID})`]: "http://localhost:30000",
                      "/socket.io": {
                          target: "ws://localhost:30000",
                          ws: true,
                      },
                  },
              }
            : undefined,

        publicDir: resolve(__dirname, "src/public"),

        build: {
            outDir: "dist",
            sourcemap: true,
            rollupOptions: {
                input: {
                    main: resolve(__dirname, "src/main.ts"),
                },
                output: {
                    entryFileNames: "[name].bundle.js",
                    chunkFileNames: "assets/[name].js",
                    assetFileNames: "assets/[name].[ext]",
                },
            },
        },

        css: {
            devSourcemap: true,
        },

        resolve: {
            alias: {
                "@": path.resolve(__dirname, "src"),
            },
        },
    };
});
