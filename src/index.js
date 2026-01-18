import "http://localhost:30001/modules/masks-newgeneration-unofficial/@vite/client";

window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;

window.global = window; // some libs need this
import("http://localhost:30001/modules/masks-newgeneration-unofficial/src/main.ts");
