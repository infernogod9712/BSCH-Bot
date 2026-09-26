// motion.js — the page's movement, all of it opt-out for reduced motion.
//
//  [data-reveal]  fades up once, when it first comes into view
//  [data-count]   counts up to its number the first time you reach it
//
// The hero's entrance is CSS; this file handles everything triggered by
// scrolling, plus the blueprint grid drifting very slightly as you move.

const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (still) {
  document.querySelectorAll("[data-reveal]").forEach(el => el.classList.add("shown"));
} else {
  const reveal = new IntersectionObserver((entries, obs) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const el = entry.target;
      el.style.transitionDelay = (el.dataset.reveal || 0) + "ms";
      el.classList.add("shown");
      obs.unobserve(el);
    }
  }, { rootMargin: "0px 0px -12% 0px", threshold: 0.15 });

  document.querySelectorAll("[data-reveal]").forEach(el => reveal.observe(el));

  // Numbers roll up to their value the first time you see them
  const counters = new IntersectionObserver((entries, obs) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const el = entry.target;
      obs.unobserve(el);

      const target = parseFloat(el.dataset.count);
      if (!isFinite(target)) continue;
      const decimals = (el.dataset.count.split(".")[1] || "").length;
      const prefix = el.dataset.prefix || "";
      const suffix = el.dataset.suffix || "";
      const started = performance.now();
      const run = now => {
        const t = Math.min(1, (now - started) / 900);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = prefix + (target * eased).toFixed(decimals) + suffix;
        if (t < 1) requestAnimationFrame(run);
      };
      requestAnimationFrame(run);
    }
  }, { threshold: 0.6 });

  document.querySelectorAll("[data-count]").forEach(el => counters.observe(el));

  // The blueprint grid drifts a little slower than the page
  let ticking = false;
  addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      document.body.style.setProperty("--grid-shift", (scrollY * 0.12).toFixed(1) + "px");
      ticking = false;
    });
  }, { passive: true });
}
