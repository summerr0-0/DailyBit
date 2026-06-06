import "@testing-library/jest-dom";

// jsdom에는 ResizeObserver가 없어 base-ui 위치계산(floating-ui)이 깨진다. 최소 폴리필.
if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
