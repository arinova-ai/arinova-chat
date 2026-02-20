import "@testing-library/jest-dom/vitest";

// Provide a minimal localStorage implementation before any store modules load.
// Some jsdom configurations expose localStorage as a non-functional stub.
const _localStorageStore: Record<string, string> = {};
const _localStorage: Storage = {
  getItem: (key) => _localStorageStore[key] ?? null,
  setItem: (key, value) => { _localStorageStore[key] = value; },
  removeItem: (key) => { delete _localStorageStore[key]; },
  clear: () => { Object.keys(_localStorageStore).forEach((k) => delete _localStorageStore[k]); },
  get length() { return Object.keys(_localStorageStore).length; },
  key: (index) => Object.keys(_localStorageStore)[index] ?? null,
};

Object.defineProperty(globalThis, "localStorage", {
  value: _localStorage,
  writable: true,
  configurable: true,
});
