#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cli_1 = require("./cli");
async function main() {
    await (0, cli_1.buildProgram)().parseAsync(process.argv);
}
main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
//# sourceMappingURL=main.js.map