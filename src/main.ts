import { MODULE_ID } from "./config";
import { log } from "./utils/logging";

// Styles
import './index.css';
import './styles/dispatch.scss';

// Legacy module initialization
import './module/masks';

Hooks.once("ready", () => {
    aerisCore.docs.registerDocsMenu("masks-newgeneration-unofficial");
});

Hooks.once("aeris-core.import-css", () => {
    const isDev = import.meta.env.DEV;

    if (!isDev) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "modules/masks-newgeneration-unofficial/assets/main.css";
        document.head.appendChild(link);
    }
});
