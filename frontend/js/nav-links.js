const NAV_ITEMS = [
  { href: "/index.html", label: "Ricerca orari" },
  { href: "/pages/tracking.html", label: "Tracking live" },
  { href: "/pages/mappa.html", label: "Mappa linee" },
  { href: "/pages/acquista.html", label: "Biglietti" },
  { href: "/pages/avvisi.html", label: "Avvisi" },
];

function isActive(href) {
  const path = window.location.pathname || "";
  if (href === "/index.html") {
    return path === "/" || path.endsWith("/index.html");
  }
  return path.endsWith(href);
}

function buildNav(container) {
  if (!container) return;
  container.innerHTML = "";
  NAV_ITEMS.forEach((item) => {
    const a = document.createElement("a");
    a.href = item.href;
    a.textContent = item.label;
    if (isActive(item.href)) a.classList.add("active");
    container.appendChild(a);
  });
}

function ensureMobileNav(navWrapper) {
  if (!navWrapper) return;
  let mobile = navWrapper.querySelector(".nav-links-mobile");
  if (!mobile) {
    mobile = document.createElement("div");
    mobile.className = "nav-links nav-links-mobile d-flex d-md-none";
    navWrapper.appendChild(mobile);
  }
  buildNav(mobile);
}

document.addEventListener("DOMContentLoaded", () => {
  const navLinks = document.querySelector(".nav-links");
  buildNav(navLinks);

  const navWrapper = document.querySelector(".topbar .container");
  ensureMobileNav(navWrapper);
});
