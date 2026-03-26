import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mod = require('../dist/index.cjs');
export default mod.default;
