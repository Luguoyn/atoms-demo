/**
 * Fullscreen preview support.
 *
 * The preview iframe must never be re-created when toggling fullscreen (Chrome
 * can leave a freshly-mounted `srcdoc` iframe unpainted, and a remount also
 * wipes the app's in-memory state). Instead the panel renders ONE preview
 * surface whose positioning toggles between `absolute` (inside the panel) and
 * `position: fixed` (viewport overlay).
 *
 * A fixed-position element still resolves against the nearest ancestor that
 * creates a containing block. The panel uses `backdrop-filter` for its glass
 * look, which does exactly that — so while fullscreen is active we temporarily
 * neutralise such ancestors and restore them on exit.
 *
 * OWNER: ui-preview.
 */

interface SavedStyle {
  element: HTMLElement;
  style: string | null;
}

const RISKY_CONTAIN = /paint|layout|strict|content/;
const RISKY_WILL_CHANGE = /transform|filter|perspective/;

/**
 * Temporarily remove properties that turn ancestors into containing blocks for
 * `position: fixed` descendants. Returns a restore function (idempotent).
 */
export function neutralizeContainingBlocks(root: Element | null): () => void {
  if (typeof window === "undefined" || !root) return () => {};
  const saved: SavedStyle[] = [];
  let element = root.parentElement;
  while (element && element !== document.body && element !== document.documentElement) {
    const computed = window.getComputedStyle(element);
    const risky =
      computed.filter !== "none" ||
      computed.backdropFilter !== "none" ||
      computed.transform !== "none" ||
      computed.perspective !== "none" ||
      RISKY_CONTAIN.test(computed.contain) ||
      RISKY_WILL_CHANGE.test(computed.willChange);
    if (risky) {
      saved.push({ element, style: element.getAttribute("style") });
      element.style.setProperty("filter", "none");
      element.style.setProperty("backdrop-filter", "none", "important");
      element.style.setProperty("transform", "none");
      element.style.setProperty("perspective", "none");
      element.style.setProperty("contain", "none");
      element.style.setProperty("will-change", "auto");
    }
    element = element.parentElement;
  }

  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    for (const entry of saved) {
      if (entry.style === null) entry.element.removeAttribute("style");
      else entry.element.setAttribute("style", entry.style);
    }
  };
}
