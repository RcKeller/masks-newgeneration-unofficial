// only required for dev
// in prod, foundry loads dispatch.js, which is compiled by vite/rollup
// in dev, foundry loads dispatch.js, this file, which loads lancer.ts

window.global = window;
import * as DISPATCH from "./dispatch.ts";
