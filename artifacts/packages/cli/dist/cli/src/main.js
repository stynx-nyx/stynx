#!/usr/bin/env node
import { buildProgram } from './cli.js';
async function main() {
    await buildProgram().parseAsync(process.argv);
}
main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
//# sourceMappingURL=main.js.map