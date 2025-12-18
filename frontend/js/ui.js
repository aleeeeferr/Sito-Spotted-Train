document.addEventListener("DOMContentLoaded", () => {
  const tiltNodes = Array.from(document.querySelectorAll("[data-tilt]"));
  tiltNodes.forEach((node) => {
    node.addEventListener("pointermove", (event) => {
      const rect = node.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 100;
      const y = ((event.clientY - rect.top) / rect.height) * 100;
      node.style.setProperty("--glow-x", `${x}%`);
      node.style.setProperty("--glow-y", `${y}%`);
    });
    node.addEventListener("pointerleave", () => {
      node.style.removeProperty("--glow-x");
      node.style.removeProperty("--glow-y");
    });
  });
});
