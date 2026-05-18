// Preload hook: stub `server-only` so we can require server-side modules
// (which guard themselves with `import "server-only"`) from a Node script.
// In Next.js this guard prevents accidental client bundling — in a script
// context there's no client to leak to, so swapping the implementation for
// an empty object is safe.
const Module = require("node:module");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === "server-only") {
    return require.resolve(__filename);
  }
  return origResolve.call(this, request, parent, isMain, options);
};
module.exports = {};
