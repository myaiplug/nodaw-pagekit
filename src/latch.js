export function installLatchedMediaScroll({
  sectionSelector = "[data-lpk-section]",
  contentSelector = "[data-lpk-content]",
  posterSelector = ".lpk-poster",
  mediaQuery = "(max-width: 760px)",
  renderedEvent = "latched-page:sections-rendered",
  latchViewportRatio = 0.66,
} = {}) {
  const media = window.matchMedia(mediaQuery);
  let states = [];
  let ticking = false;

  const reset = (state) => {
    state.latchScrollY = null;
    state.latchTop = 0;
    state.content.classList.remove("is-latched");
    state.content.style.removeProperty("--lpk-latch-top");
  };

  const updateSectionStackHeight = (state) => {
    const { layout, content, poster } = state;
    if (!media.matches || !poster || content.hidden || layout.classList.contains("has-no-image")) {
      layout.style.removeProperty("--lpk-section-stack-height");
      return;
    }
    const layoutRect = layout.getBoundingClientRect();
    const posterRect = poster.getBoundingClientRect();
    const panelHeight = Math.max(1, content.getBoundingClientRect().height || content.offsetHeight || 0);
    const posterBottomInLayout = Math.max(0, posterRect.bottom - layoutRect.top);
    const stickyTop = window.innerHeight * latchViewportRatio;
    const stackHeight = Math.ceil(Math.max(posterBottomInLayout + panelHeight + 2, stickyTop + panelHeight + 2));
    layout.style.setProperty("--lpk-section-stack-height", `${stackHeight}px`);
  };

  const update = () => {
    ticking = false;
    for (const state of states) {
      const { layout, content, poster } = state;
      if (!poster || !poster.complete || !poster.naturalWidth || !poster.naturalHeight) {
        reset(state);
        continue;
      }
      if (!media.matches || content.hidden || layout.classList.contains("has-no-image")) {
        reset(state);
        updateSectionStackHeight(state);
        continue;
      }
      updateSectionStackHeight(state);
      if (state.latchScrollY !== null) {
        if (window.scrollY < state.latchScrollY) {
          reset(state);
        } else {
          content.style.setProperty("--lpk-latch-top", `${state.latchTop}px`);
        }
        continue;
      }
      const panelRect = content.getBoundingClientRect();
      const posterRect = poster.getBoundingClientRect();
      const layoutRect = layout.getBoundingClientRect();
      const posterBottomDocument = window.scrollY + posterRect.bottom;
      const layoutTopDocument = window.scrollY + layoutRect.top;
      const thresholdScrollY = posterBottomDocument - panelRect.top - 2;
      if (window.scrollY >= thresholdScrollY) {
        state.latchScrollY = thresholdScrollY;
        state.latchTop = (state.latchScrollY + panelRect.top) - layoutTopDocument;
        content.style.setProperty("--lpk-latch-top", `${state.latchTop}px`);
        content.classList.add("is-latched");
      }
    }
  };

  const schedule = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };

  const refresh = () => {
    states = Array.from(document.querySelectorAll(sectionSelector))
      .map((layout) => {
        const state = {
          layout,
          content: layout.querySelector(contentSelector),
          poster: layout.querySelector(posterSelector),
          latchScrollY: null,
          latchTop: 0,
        };
        if (state.poster) {
          state.poster.addEventListener("load", () => {
            reset(state);
            schedule();
          }, { passive: true });
        }
        return state;
      })
      .filter((state) => state.content);
    schedule();
  };

  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", () => {
    for (const state of states) reset(state);
    schedule();
  }, { passive: true });
  window.addEventListener(renderedEvent, refresh);
  refresh();

  return {
    refresh,
    destroy() {
      window.removeEventListener(renderedEvent, refresh);
    },
  };
}
