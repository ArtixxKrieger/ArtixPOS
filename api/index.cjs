'use strict';
// Use the pre-built esbuild bundle (WASM inlined, all deps resolved)
// rather than letting @vercel/node recompile TypeScript at runtime.
const mod = require('../dist/index.cjs');
module.exports = mod.default;
