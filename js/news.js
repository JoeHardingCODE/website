/* ============================================================
   News Globe — Perspective
   Uses Globe.gl (Three.js), BigDataCloud reverse geocoding,
   and GNews for headlines. Static-site friendly (no backend).
   ============================================================ */
(function () {
  "use strict";

  /* ───────────────────────────────────────────────────────────
     CONFIG — paste your GNews API key here (free at gnews.io)
     ⚠ The key is visible in the browser. For production, proxy
       this through a tiny backend. See notes at the bottom.
     ─────────────────────────────────────────────────────────── */
  const GNEWS_API_KEY = "YOUR_GNEWS_API_KEY_HERE"; // ← replace
  const GNEWS_ENDPOINT = "https://gnews.io/api/v4/top-headlines";
  const REVERSE_GEOCODE_ENDPOINT =
    "https://api.bigdatacloud.net/data/reverse-geocode-client";

  /* Simple in-memory cache to avoid burning the 100 req/day limit */
  const newsCache = {};

  /* DOM refs */
  const globeContainer = document.getElementById("globe-container");
  const globeHint = document.getElementById("globe-hint");
  const panel = document.getElementById("news-panel");
  const panelTitle = document.getElementById("news-country-name");
  const panelEyebrow = document.getElementById("news-country-eyebrow");
  const panelList = document.getElementById("news-list");
  const closeBtn = document.getElementById("news-close");

  /* ───────────────────────────────────────────────────────────
     1. Build the globe
     ─────────────────────────────────────────────────────────── */
  const world = new Globe(globeContainer)
    .globeImageUrl("//unpkg.com/three-globe/example/img/earth-night.jpg")
    .bumpImageUrl("//unpkg.com/three-globe/example/img/earth-topology.png")
    .backgroundColour("rgba(0,0,0,0)")
    .showAtmosphere(true)
    .atmosphereColor("#4E9C82")          // matches --forest in dark mode
    .atmosphereAltitude(0.18)
    .width(globeContainer.clientWidth)
    .height(globeContainer.clientHeight);

  /* Auto-rotate slowly until the user clicks */
  const controls = world.controls();
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.45;
  controls.enableZoom = false;
  controls.enablePan = false;

  /* Resize handling */
  window.addEventListener("resize", () => {
    world.width(globeContainer.clientWidth)
         .height(globeContainer.clientHeight);
  });

  /* ───────────────────────────────────────────────────────────
     2. Click → reverse geocode → fetch news
     ─────────────────────────────────────────────────────────── */
  world.onGlobeClick(async ({ lat, lng }) => {
    controls.autoRotate = false;            // stop spinning on interaction
    globeHint.classList.add("is-hidden");
    openPanel();
    renderLoading();

    try {
      const place = await reverseGeocode(lat, lng);
      if (!place || !place.countryCode) {
        renderEmpty("No country found at this location — try clicking on land.");
        return;
      }

      panelEyebrow.textContent = "Headlines from";
      panelTitle.textContent = place.countryName;

      const articles = await fetchNews(place.countryCode);
      if (!articles.length) {
        renderEmpty("No recent headlines available for this country.");
        return;
      }
      renderArticles(articles);
    } catch (err) {
      console.error(err);
      renderError("Could not load news. The API rate limit may have been reached — try again in a minute.");
    }
  });

  /* ───────────────────────────────────────────────────────────
     3. Reverse geocode: lat/lng → { countryName, countryCode }
        BigDataCloud's client endpoint needs no API key.
     ─────────────────────────────────────────────────────────── */
  async function reverseGeocode(lat, lng) {
    const url = `${REVERSE_GEOCODE_ENDPOINT}?latitude=${lat}&longitude=${lng}&localityLanguage=en`;
    const r = await fetch(url);
    if (!r.ok) throw new Error("Reverse geocode failed");
    return r.json();
  }

  /* ───────────────────────────────────────────────────────────
     4. Fetch news from GNews (with caching)
     ─────────────────────────────────────────────────────────── */
  async function fetchNews(countryCode) {
    const code = countryCode.toLowerCase();
    if (newsCache[code]) return newsCache[code];

    const url = `${GNEWS_ENDPOINT}?country=${code}&max=10&apikey=${GNEWS_API_KEY}`;
    const r = await fetch(url);
    if (!r.ok) {
      if (r.status === 429) throw new Error("Rate limit exceeded");
      throw new Error(`News API error: ${r.status}`);
    }
    const data = await r.json();
    const articles = (data.articles || []).map((a) => ({
      title: a.title,
      description: a.description,
      url: a.url,
      source: a.source?.name || "Unknown",
      publishedAt: a.publishedAt,
    }));
    newsCache[code] = articles; // cache for session
    return articles;
  }

  /* ───────────────────────────────────────────────────────────
     5. Renderers
     ─────────────────────────────────────────────────────────── */
  function openPanel() {
    panel.classList.add("is-open");
    panel.setAttribute("aria-hidden", "false");
  }
  function closePanel() {
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
    controls.autoRotate = true;            // resume spin
  }
  closeBtn.addEventListener("click", closePanel);

  function renderLoading() {
    panelList.innerHTML = `
      <div class="news-loading">
        <div class="spinner"></div>
        <p>Fetching headlines…</p>
      </div>`;
  }

  function renderEmpty(message) {
    panelList.innerHTML = `<div class="news-empty"><p>${message}</p></div>`;
  }

  function renderError(message) {
    panelList.innerHTML = `<div class="news-error"><p>${message}</p></div>`;
  }

  function renderArticles(articles) {
    panelList.innerHTML = articles.map((a) => `
      <article class="news-item">
        <p class="news-item__source">
          <span>${escapeHtml(a.source)}</span>
          <span>${formatDate(a.publishedAt)}</span>
        </p>
        <h3 class="news-item__title">
          <a href="${a.url}" target="_blank" rel="noopener noreferrer">
            ${escapeHtml(a.title)}
          </a>
        </h3>
        ${a.description ? `<p class="news-item__desc">${escapeHtml(a.description)}</p>` : ""}
      </article>
    `).join("");
  }

  /* ───────────────────────────────────────────────────────────
     6. Helpers
     ─────────────────────────────────────────────────────────── */
  function formatDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
  }

})();
