// jsdom lacks the browser APIs Radix/cmdk rely on for measuring overlays.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver

Element.prototype.scrollIntoView ??= () => {}
