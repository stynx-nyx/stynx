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
/** Closed tenant-subject preference and narrow profile contracts. @packageDocumentation */
__exportStar(require("./errors"), exports);
__exportStar(require("./in-memory-preferences.store"), exports);
__exportStar(require("./postgres-preferences.store"), exports);
__exportStar(require("./preferences.controller"), exports);
__exportStar(require("./preferences.module"), exports);
__exportStar(require("./preferences.service"), exports);
__exportStar(require("./schema"), exports);
__exportStar(require("./tokens"), exports);
__exportStar(require("./types"), exports);
//# sourceMappingURL=index.js.map