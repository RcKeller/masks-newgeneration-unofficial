import tailwindcss from "@tailwindcss/vite";
import fs from "fs";
import path, { resolve } from "path";
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { MODULE_ID } from "./src/config";

export default defineConfig(({ mode }) => {
    const isDev = mode === "development";

    const targets: { src: string; dest: string }[] = [
        { src: "docs", dest: "" },
        { src: "module.json", dest: "" },
    ];

    // Only copy packs if they exist (CI may not have them yet)
    if (fs.existsSync(resolve(__dirname, "packs")) &&
        fs.readdirSync(resolve(__dirname, "packs")).length > 0) {
        targets.push({ src: "packs", dest: "" });
    }

    return {
        plugins: [
            tailwindcss(),
            viteStaticCopy({ targets }),
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
