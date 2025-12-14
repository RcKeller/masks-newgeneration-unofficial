import type { Config } from "tailwindcss"

export default {
    // Scope Tailwind to avoid conflicts with Foundry styles
    important: "#dispatch-container",
    content: [
        "./src/public/templates/**/*.{hbs,html}",
        "./src/**/*.{js,mjs,ts,scss}"
    ],
    theme: {
        extend: {},
    },
    plugins: [],
    corePlugins: {
        // Disable preflight to avoid conflicts with Foundry's base styles
        preflight: false,
    }
} satisfies Config
