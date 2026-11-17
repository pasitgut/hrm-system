// jsdom lacks ResizeObserver, which Radix primitives (select, popover, ...) use
// to size their content. A no-op stub is enough: tests assert behaviour, not layout.
if (typeof window !== "undefined" && typeof window.ResizeObserver === "undefined") {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
