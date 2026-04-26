import { createLibConfig } from './index.mjs';

export default createLibConfig({
  files: ['**/*.ts'],
  tsconfig: './tsconfig.test.json',
});
