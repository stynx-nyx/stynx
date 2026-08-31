"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.withSystemContext = exports.createStynxPgClient = exports.createStynxPgPool = exports.StynxPoolRegistry = exports.createDrizzle = exports.Transaction = exports.Database = exports.DataModule = exports.StynxDataModule = void 0;
/**
 * Public data access exports for pools, migrations, transactions, schemas, and archive helpers.
 *
 * @packageDocumentation
 */
/* istanbul ignore file -- barrel export surface; package behavior is covered through concrete modules. */
/** Data module exports for NestJS consumers. */
var data_module_1 = require("./data.module");
Object.defineProperty(exports, "StynxDataModule", { enumerable: true, get: function () { return data_module_1.StynxDataModule; } });
Object.defineProperty(exports, "DataModule", { enumerable: true, get: function () { return data_module_1.StynxDataModule; } });
/** Database service export. */
var database_1 = require("./database");
Object.defineProperty(exports, "Database", { enumerable: true, get: function () { return database_1.Database; } });
/** Transaction and Drizzle helper exports. */
var transaction_1 = require("./transaction");
Object.defineProperty(exports, "Transaction", { enumerable: true, get: function () { return transaction_1.Transaction; } });
Object.defineProperty(exports, "createDrizzle", { enumerable: true, get: function () { return transaction_1.createDrizzle; } });
/** PostgreSQL pool registry exports. */
var pools_1 = require("./pools");
Object.defineProperty(exports, "StynxPoolRegistry", { enumerable: true, get: function () { return pools_1.StynxPoolRegistry; } });
Object.defineProperty(exports, "createStynxPgPool", { enumerable: true, get: function () { return pools_1.createStynxPgPool; } });
/** PostgreSQL client factory exports for controlled test and CLI utilities. */
var client_1 = require("./client");
Object.defineProperty(exports, "createStynxPgClient", { enumerable: true, get: function () { return client_1.createStynxPgClient; } });
/** System-context helper export. */
var system_context_1 = require("./system-context");
Object.defineProperty(exports, "withSystemContext", { enumerable: true, get: function () { return system_context_1.withSystemContext; } });
__exportStar(require("./table-markers"), exports);
__exportStar(require("./types"), exports);
__exportStar(require("./errors"), exports);
__exportStar(require("./tokens"), exports);
__exportStar(require("./schema"), exports);
__exportStar(require("./query-helpers"), exports);
//# sourceMappingURL=index.js.map