import { MODULE_ID } from "../config";

export const log = (...msg: any[]) => console.log(`${MODULE_ID} | `, ...msg);
