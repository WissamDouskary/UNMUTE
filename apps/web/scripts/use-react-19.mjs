import { registerHooks } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const reactDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../node_modules/react');
const reactFiles = new Map([
  ['react', 'index.js'],
  ['react/jsx-runtime', 'jsx-runtime.js'],
  ['react/jsx-dev-runtime', 'jsx-dev-runtime.js'],
]);

registerHooks({
  resolve(specifier, context, nextResolve) {
    const file = reactFiles.get(specifier);
    if (!file) return nextResolve(specifier, context);
    return {
      url: pathToFileURL(path.join(reactDir, file)).href,
      shortCircuit: true,
    };
  },
});
