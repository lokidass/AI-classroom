// Polyfill for libraries that expect Node.js global
if (typeof window !== 'undefined' && typeof window.global === 'undefined') {
  // @ts-ignore
  window.global = window;
}

export {}; // Make this a module