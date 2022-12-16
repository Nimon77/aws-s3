"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.slurpFile = void 0;
// ToDo: Change to "fs/promises" when supporting nodejs>=14
const fs_1 = require("fs");
const { readFile } = fs_1.promises;
const filePromisesHash = {};
const slurpFile = (path) => {
    // if (!filePromisesHash[path]) {
    //   filePromisesHash[path] = readFile(path, "utf8");
    // }
    filePromisesHash[path] = readFile(path, "utf8");
    return filePromisesHash[path];
};
exports.slurpFile = slurpFile;
//# sourceMappingURL=slurpFile.js.map