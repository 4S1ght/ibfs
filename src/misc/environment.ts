// @ts-ignore
export const deno = typeof Deno !== "undefined" && !!Deno?.version?.deno
export const node = typeof process !== "undefined" && !!process?.versions?.node

export const environment = deno ? "deno" : node ? "node" : "unknown"
