// Preload setup para tests y scripts fuera del entorno Webpack de Next.js
try {
  const serverOnlyPath = require.resolve('server-only');
  require.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    exports: {},
  };
} catch {}

try {
  const React = require('react');
  if (React && !React.cache) {
    React.cache = (fn) => fn;
  }
} catch {}
