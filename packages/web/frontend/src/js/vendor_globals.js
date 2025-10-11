const globalScope = typeof window !== 'undefined' ? window : globalThis;

globalScope.marked = globalScope.marked || {};
globalScope.hljs = globalScope.hljs || {};
