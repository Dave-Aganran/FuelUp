(() => {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const toast = document.querySelector(".interaction-toast");

  document.documentElement.classList.add("js-ready");

  function showToast(message) {
    if (!toast || !message) return;
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove("is-visible"), 1800);
  }

  document.querySelectorAll(".button, button").forEach((button) => {
    button.addEventListener("pointerdown", () => button.classList.add("is-pressing"));
    ["pointerup", "pointerleave", "blur"].forEach((eventName) => {
      button.addEventListener(eventName, () => button.classList.remove("is-pressing"));
    });
  });

  document.querySelectorAll(".listing-card, .metric-card, .summary-card, .terminal-card").forEach((card) => {
    card.addEventListener("pointermove", (event) => {
      const bounds = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${event.clientX - bounds.left}px`);
      card.style.setProperty("--my", `${event.clientY - bounds.top}px`);
    });
  });

  document.querySelectorAll(".filter-bar").forEach((filterBar) => {
    const inputs = filterBar.querySelectorAll("input, select");
    const cards = [...document.querySelectorAll(".listing-card")];
    const grid = document.querySelector(".grid");
    const emptyState = document.createElement("p");
    emptyState.className = "empty-panel compact filter-empty";
    emptyState.textContent = "No listings match those filters yet.";
    emptyState.hidden = true;
    grid?.appendChild(emptyState);
    const applyFilter = () => {
      const rawValues = [...inputs].map((input) => input.value || "");
      const text = rawValues
        .filter((value) => !["All fuel products", "Pickup or delivery"].includes(value))
        .join(" ")
        .trim()
        .toLowerCase();
      let visibleCount = 0;
      cards.forEach((card) => {
        const visible = !text || card.textContent.toLowerCase().includes(text);
        card.classList.toggle("is-filtered-out", !visible);
        if (visible) visibleCount += 1;
      });
      if (text) {
        showToast(`${visibleCount} matching listing${visibleCount === 1 ? "" : "s"}`);
      }
      emptyState.hidden = !text || visibleCount > 0;
    };
    filterBar.querySelector("button")?.addEventListener("click", applyFilter);
    inputs.forEach((input) => input.addEventListener("input", applyFilter));
    inputs.forEach((input) => input.addEventListener("change", applyFilter));
  });

  document.querySelectorAll(".inventory-form select[name='adjustmentMode']").forEach((select) => {
    const form = select.closest("form");
    const quantity = form?.querySelector("input[name='adjustmentQuantity']");
    const stock = form?.querySelector("input[name='availableQuantity']");
    const syncMode = () => {
      const additive = select.value !== "set";
      quantity?.closest("label")?.classList.toggle("is-emphasized", additive);
      stock?.closest("label")?.classList.toggle("is-muted-field", additive);
    };
    select.addEventListener("change", syncMode);
    syncMode();
  });

  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    document.documentElement.classList.add("motion-settled");
    return;
  }

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.14 });

  document.querySelectorAll(".hero, .trust-strip, .listing-card, .form-card, .order-context, .metric-card, .table-wrap, .activity-panel").forEach((element, index) => {
    element.classList.add("reveal");
    element.style.setProperty("--reveal-delay", `${Math.min(index * 42, 260)}ms`);
    revealObserver.observe(element);
  });
})();
