const siteConfig = window.GOLDEN_PLATE_CONFIG || { businessName: "Golden Plate Catering", contact: {}, socials: {}, approvedServices: [], approvedAbout: {} };
const assets = window.GOLDEN_PLATE_ASSETS;
const main = document.querySelector("#main-content");
const header = document.querySelector("[data-site-header]");
const dialog = document.querySelector("[data-media-dialog]");
const dialogMedia = document.querySelector("[data-dialog-media]");
const dialogCaption = document.querySelector("[data-dialog-caption]");
let publicConfig = { contact: {}, socials: {}, siteUrl: "" };
let modalItems = [];
let modalIndex = 0;
let previousFocus = null;
let toastTimer;
let activePath = "/";
let adminSession = null;

const routes = {
  "/": renderHome,
  "/about/": renderAbout,
  "/services/": renderServices,
  "/work/": renderWork,
  "/menu/": renderMenu,
  "/reviews/": renderReviews,
  "/contact/": renderContact,
  "/privacy/": renderPrivacy,
  "/admin/": renderAdmin
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

function routePath() {
  const path = window.location.pathname.replace(/index\.html$/, "");
  if (path === "") return "/";
  return path.endsWith("/") ? path : `${path}/`;
}

function navLink(path, label, className = "") {
  return `<a class="${className}" href="${path}" data-nav>${label}</a>`;
}

function eyebrow(label) {
  return `<div class="eyebrow">${escapeHtml(label)}</div>`;
}

function pageHero(kicker, title, intro) {
  return `<section class="page-hero"><div class="container">${eyebrow(kicker)}<h1>${escapeHtml(title)}</h1><p>${escapeHtml(intro)}</p></div></section>`;
}

function button(path, label, className = "") {
  return `<a class="button ${className}" href="${path}" data-nav>${escapeHtml(label)} <span aria-hidden="true">↗</span></a>`;
}

function mediaCard(item, className = "") {
  const mediaType = item.type === "video" ? "Video" : "Image";
  const playMark = item.type === "video" ? `<span class="play-mark" aria-hidden="true">▶</span>` : "";
  return `<button class="media-card ${className}" type="button" data-media-trigger data-media-id="${escapeHtml(item.id)}" aria-label="Open ${escapeHtml(item.title)} in media viewer"><img src="${escapeHtml(item.file)}" alt="${escapeHtml(item.alt || item.title)}" loading="lazy" width="${item.width || 800}" height="${item.height || 600}">${playMark}<span class="media-card-label">${escapeHtml(mediaType)}</span></button>`;
}

function foodCard(item) {
  return `<figure class="food-card food-card-${escapeHtml(item.id)}"><div class="food-media"><img src="${escapeHtml(item.file)}" alt="${escapeHtml(item.alt)}" loading="lazy" width="${item.width}" height="${item.height}"></div><figcaption><h3>${escapeHtml(item.title)}</h3></figcaption></figure>`;
}

function workPreview(items = assets.work.slice(0, 4)) {
  return `<div class="work-grid">${items.map((item, index) => mediaCard(item, index === 0 ? "media-card-feature" : "")).join("")}</div>`;
}

function welcomeNotice(title, message) {
  return `<div class="notice" role="note"><p><strong>${escapeHtml(title)}</strong>${escapeHtml(message)}</p></div>`;
}

function renderHome() {
  const food = assets.food.slice(0, 4);
  return `<section class="hero">
    <img class="hero-fallback hero-media" src="${assets.heroVideo.poster}" alt="Dining gazebo with round tables prepared for an event">
    <video class="hero-video hero-media" autoplay muted loop playsinline preload="metadata" poster="${assets.heroVideo.poster}" aria-hidden="true">
      <source src="${assets.heroVideo.file}" type="video/mp4">
    </video>
    <div class="hero-overlay"></div>
    <div class="container hero-content">
      ${eyebrow("Golden Plate Catering")}
      <h1>A table worth gathering around.</h1>
      <p class="hero-intro">Golden Plate, Karibu Dala. Thoughtful food, welcoming tables, and care for every gathering.</p>
      <div class="hero-actions">${button("/contact/", "Plan your enquiry")} ${button("/work/", "See our work", "button-secondary")}</div>
      <div class="hero-meta"><div><strong>01</strong>Food on display</div><div><strong>02</strong>Gatherings in focus</div><div><strong>03</strong>Details that matter</div></div>
    </div>
  </section>
  <section class="section section-white"><div class="container intro-grid">
    <div class="display-image"><img src="/assets/dining_gazebo_1.png" alt="Round tables and covered chairs arranged inside a black and gold dining gazebo" width="1600" height="720" loading="lazy"></div>
    <div class="intro-copy"><div class="content-kicker">The story behind the table</div><h2>Food, atmosphere, and a place to arrive.</h2><p>At Golden Plate, every table is prepared with a warm welcome, a generous spread, and attention to the little details that make a gathering feel cared for.</p><p>From intimate family meals to larger community events, we help create a setting that feels comfortable, polished, and easy to enjoy.</p></div>
  </div></section>
  <section class="section section-dark"><div class="container"><div class="section-heading"><div>${eyebrow("A taste of our work")}<h2>Moments made for gathering.</h2><p>From the buffet to the final table setting, each detail is chosen to help the occasion feel effortless and memorable.</p></div></div>${workPreview()}</div></section>
  <section class="section section-ivory"><div class="container"><div class="section-heading"><div>${eyebrow("From our kitchen")}<h2>A taste of recent gatherings.</h2><p>Take a look at a few favourite dishes and moments from the kitchen.</p></div></div><div class="food-grid">${food.map(foodCard).join("")}</div></div></section>
  <section class="section section-white"><div class="container"><div class="section-heading"><div>${eyebrow("Guest voices")}<h2>Share how your day felt.</h2><p>We welcome honest words from the people whose gatherings have been shaped by Golden Plate.</p></div></div><div class="cta-row"><a class="button" href="/reviews/" data-nav>Read guest feedback <span aria-hidden="true">↗</span></a><a class="button button-secondary" href="/contact/" data-nav>Start your enquiry</a></div></div></section>
  <section class="section section-dark"><div class="container split-copy"><div>${eyebrow("Start a conversation")}<h2>Tell us what you are gathering for.</h2></div><div><p>Share the essentials of your event, and we can begin exploring the right menu, setup, and service for the day.</p>${button("/contact/", "Get a quote", "button-inline")}</div></div></section>`;
}

function renderAbout() {
  const about = siteConfig.approvedAbout || {};
  return `${pageHero("About Golden Plate", "Golden Plate, Karibu Dala.", "A warm welcome, a generous table, and thoughtful catering for the moments people remember.")}
  <section class="section section-white"><div class="container split-copy"><div><div class="content-kicker">Our welcome</div><h2>${about.story ? escapeHtml(about.story) : "A table where everyone feels at ease."}</h2><p>We believe a good gathering is shaped by warmth, care, and a sense that every guest has been considered. Our approach is rooted in thoughtful preparation, clear communication, and food that feels generous without fuss.</p></div><div class="detail-panel"><h3>What guides our work</h3><p>${about.approach ? escapeHtml(about.approach) : "We pay attention to the details that make an event feel finished: timing, comfort, presentation, and a relaxed host experience from start to finish."}</p></div></div></section>
  <section class="section section-ivory"><div class="container"><div class="section-heading"><div>${eyebrow("The team behind the table")}<h2>Care in every serving.</h2></div></div><div class="feature-grid"><article class="feature-card"><span class="feature-index">01</span><h3>Prepared with care</h3><p>Each event begins with a careful review of the brief, guest needs, timing, and atmosphere you want to create.</p></article><article class="feature-card"><span class="feature-index">02</span><h3>Thoughtful service</h3><p>We focus on smooth delivery, practical pacing, and a presentation that feels polished without being overdone.</p></article><article class="feature-card"><span class="feature-index">03</span><h3>Warm hospitality</h3><p>The best gatherings feel easy and welcoming. We aim to create that atmosphere from the first welcome to the last plate.</p></article></div></div></section>
  <section class="section section-white"><div class="container intro-grid"><div class="display-image"><img src="/assets/dining_view2.jpg" alt="Dining space prepared for a catered gathering" width="2784" height="1856" loading="lazy"></div><div class="intro-copy"><div class="content-kicker">Our story</div><h2>Thoughtful food, welcoming tables.</h2><p>${about.team ? escapeHtml(about.team) : "Golden Plate is built around the idea that gatherings deserve care, comfort, and the kind of food people remember long after the meal."}</p></div></div></section>`;
}

function renderServices() {
  const services = siteConfig.approvedServices || [];
  const serviceContent = services.length
    ? services.map((service, index) => `<article class="feature-card"><span class="feature-index">${String(index + 1).padStart(2, "0")}</span><h3>${escapeHtml(service.title || "Service")}</h3><p>${escapeHtml(service.description || "Tailored service for your gathering.")}</p></article>`).join("")
    : `<article class="feature-card"><span class="feature-index">01</span><h3>Food for the occasion</h3><p>Tell us the kind of meal and style of service you have in mind, from a relaxed buffet to a more formal table setting.</p></article><article class="feature-card"><span class="feature-index">02</span><h3>Complete event support</h3><p>We can coordinate the menu, guest flow, setup, and practical details required for a smoother overall experience.</p></article><article class="feature-card"><span class="feature-index">03</span><h3>Flexible planning</h3><p>Whether the gathering is small and intimate or larger and more complex, we tailor the experience to suit the event.</p></article>`;
  return `${pageHero("Services", "Every gathering has its own flavour.", "Golden Plate, Karibu Dala. Tell us what you are celebrating and we will begin with the details that matter to you.")}
  <section class="section section-white"><div class="container">${welcomeNotice("Let’s make a plan", "Whether it is a family celebration or a work gathering, start by telling us about the day, the guests, and the feeling you want the table to carry.")}</div></section>
  <section class="section section-dark"><div class="container split-copy"><div>${eyebrow("Your occasion, your brief")}<h2>Let the details lead.</h2></div><div><p>Share the event type, date, location, guest estimate, and any practical preferences. From there, we can shape a menu and setup that fit the occasion.</p>${button("/contact/", "Share your brief", "button-inline")}</div></div></section>
  <section class="section section-ivory"><div class="container"><div class="feature-grid">${serviceContent}</div></div></section>`;
}

function renderWork() {
  const filters = ["all", "video", "dining", "buffet", "celebration"];
  return `${pageHero("Our work", "A closer look at the details.", "Browse past gatherings, from the food and buffet to the dining setup and finishing touches.")}
  <section class="section section-white"><div class="container"><div class="gallery-controls" role="group" aria-label="Filter work"><button class="filter-button" type="button" data-filter="all" aria-pressed="true">All</button>${filters.filter((filter) => filter !== "all").map((filter) => `<button class="filter-button" type="button" data-filter="${filter}" aria-pressed="false">${escapeHtml(filter.charAt(0).toUpperCase() + filter.slice(1))}</button>`).join("")}</div><div class="gallery-grid" data-gallery>${assets.work.map((item) => `<figure class="gallery-item" data-category="${escapeHtml(item.category || "all")}"><button class="gallery-trigger" type="button" data-media-trigger data-media-id="${escapeHtml(item.id)}" aria-label="Open ${escapeHtml(item.title)}"><img src="${escapeHtml(item.file)}" alt="${escapeHtml(item.alt || item.title)}" loading="lazy" width="${item.width || 900}" height="${item.height || 600}"></button><figcaption>${escapeHtml(item.title)}</figcaption></figure>`).join("")}</div></div></section>`;
}

function renderMenu() {
  return `${pageHero("Food", "A taste of gatherings gone by.", "Browse food from previous events and imagine the spread for your own celebration.")}
  <section class="section section-white"><div class="container">${welcomeNotice("Golden Plate, Karibu Dala", "These are a few favourites from past gatherings. Tell us what you would love to serve at yours, and we can shape a menu around the occasion.")}</div></section>
  <section class="section section-ivory"><div class="container split-copy"><div>${eyebrow("For your gathering")}<h2>What would you like on the table?</h2></div><div><p>Every event has its own tastes, guest mix, and rhythm. We work with your brief to suggest a menu that feels right for the gathering.</p>${button("/contact/", "Discuss your menu", "button-inline")}</div></div></section>
  <section class="section section-white"><div class="container"><div class="food-grid">${assets.food.map(foodCard).join("")}</div></div></section>`;
}

function renderReviewForm() {
  return `<div class="form-panel"><h2>Share your experience</h2><form data-review-form novalidate><div class="field"><label for="review-name">Your name</label><input id="review-name" name="name" type="text" autocomplete="name"></div><div class="field"><label for="review-rating">Your rating</label><select id="review-rating" name="rating"><option value="">Select a rating</option><option value="5">5 / 5</option><option value="4">4 / 5</option><option value="3">3 / 5</option><option value="2">2 / 5</option><option value="1">1 / 5</option></select></div><div class="field"><label for="review-text">Your feedback</label><textarea id="review-text" name="text" rows="5"></textarea></div><div class="field-error" id="error-review-name"></div><div class="field-error" id="error-review-rating"></div><div class="field-error" id="error-review-text"></div><button class="button" type="submit">Send review</button><p class="form-status" data-form-status aria-live="polite"></p></form></div>`;
}

function renderReviews() {
  return `${pageHero("Reviews", "The memories stay with you.", "If Golden Plate shared your special day, we would love to hear what made it memorable.")}
  <section class="section section-white"><div class="container"><div class="review-summary"><div>${eyebrow("Words from our guests")}<h2>Every gathering has a story.</h2></div><div><p>Guest feedback helps us keep improving and helps future hosts understand the experience they can expect.</p></div></div><div class="review-list" data-review-list></div></div></section>
  <section class="section section-ivory"><div class="container form-layout"><div class="form-intro">${eyebrow("Your experience")}<h2>Tell the next guest what mattered.</h2><p>Use your own words. Whether it was a beautiful menu, the warmth of the team, or the flow of the day, your feedback helps others feel prepared.</p></div>${renderReviewForm()}</div></section>`;
}

function renderContactForm() {
  return `<div class="form-panel"><h2>Tell us about it</h2><form data-enquiry-form novalidate><div class="form-row"><div class="field"><label for="enquiry-name">Name</label><input id="enquiry-name" name="name" type="text" autocomplete="name"></div><div class="field"><label for="enquiry-email">Email</label><input id="enquiry-email" name="email" type="email" autocomplete="email"></div></div><div class="form-row"><div class="field"><label for="enquiry-phone">Phone</label><input id="enquiry-phone" name="phone" type="tel" autocomplete="tel"></div><div class="field"><label for="enquiry-event-type">Event type</label><input id="enquiry-event-type" name="eventType" type="text"></div></div><div class="form-row"><div class="field"><label for="enquiry-event-date">Event date</label><input id="enquiry-event-date" name="eventDate" type="date"></div><div class="field"><label for="enquiry-guests">Estimated guests</label><input id="enquiry-guests" name="guests" type="number" min="1" inputmode="numeric"></div></div><div class="form-row"><div class="field"><label for="enquiry-location">Location</label><input id="enquiry-location" name="location" type="text"></div></div><div class="field"><label for="enquiry-requirements">Requirements</label><textarea id="enquiry-requirements" name="requirements" rows="4" placeholder="Menu ideas, dietary requests, setup details, staffing needs, etc."></textarea></div><div class="field"><label for="enquiry-message">Tell us more</label><textarea id="enquiry-message" name="message" rows="5"></textarea></div><div class="field-error" id="error-enquiry-name"></div><div class="field-error" id="error-enquiry-contact"></div><div class="field-error" id="error-enquiry-email"></div><div class="field-error" id="error-enquiry-phone"></div><div class="field-error" id="error-enquiry-eventDate"></div><div class="field-error" id="error-enquiry-guests"></div><div class="field-error" id="error-enquiry-message"></div><button class="button" type="submit">Send enquiry</button><p class="form-status" data-form-status aria-live="polite"></p></form></div>`;
}

function renderContact() {
  const contact = publicConfig.contact || {};
  const hasContact = contact.email || contact.phone || contact.whatsapp;
  return `${pageHero("Get a quote", "Let’s set the table together.", "Golden Plate, Karibu Dala. Tell us about the occasion, and let’s begin planning a gathering your guests will enjoy.")}
  <section class="section section-white"><div class="container form-layout"><div class="form-intro">${eyebrow("A warm first step")}<h2>Bring your occasion into focus.</h2><p>Share your date, guests, location, and any ideas you already have. We can then suggest a setup and menu plan that suits the event.</p>${hasContact ? `<div class="contact-list"><p><strong>Email:</strong> <a href="mailto:${escapeHtml(contact.email || "")}">${escapeHtml(contact.email || "")}</a></p><p><strong>Phone:</strong> <a href="tel:${escapeHtml(contact.phone || "")}">${escapeHtml(contact.phone || "")}</a></p>${contact.whatsapp ? `<p><strong>WhatsApp:</strong> <a href="https://wa.me/${escapeHtml(contact.whatsapp.replace(/\D/g, ""))}" target="_blank" rel="noreferrer">Message on WhatsApp</a></p>` : ""}</div>` : ""}</div>${renderContactForm()}</div></section>`;
}

function renderPrivacy() {
  return `${pageHero("Privacy & data", "A clear account of what the site stores.", "This site collects only the information needed for genuine enquiries and review submissions.")}
  <section class="section section-white"><div class="container privacy-copy"><h2>Information you submit</h2><p>When you send an enquiry, the site stores the name, contact details, event details, and any notes you include so the catering team can respond appropriately.</p><p>When you submit a review, the website stores your name, rating, and review text for moderation before it is published.</p><h2>How it is used</h2><p>Submitted information is used to handle enquiries, assess service feedback, and improve the client experience. It is not sold or shared with unrelated third parties.</p><h2>Access and control</h2><p>Anyone with the site administrator credentials can review enquiry and review submissions using the admin monitoring area.</p></div></section>`;
}

function statusBadge(status) {
  const label = {
    new: "New",
    contacted: "Contacted",
    quoted: "Quoted",
    booked: "Booked",
    closed: "Closed"
  }[status] || "New";
  return `<span class="status-badge status-${escapeHtml(status || "new")}">${escapeHtml(label)}</span>`;
}

function renderAdminLogin() {
  return `<section class="section section-white"><div class="container admin-login-shell"><div class="admin-panel"><div class="content-kicker">Owner dashboard</div><h1>Monitor catering enquiries</h1><p>Sign in with the configured admin credentials to review new requests and update their status.</p><form data-admin-login><div class="field"><label for="admin-username">Username</label><input id="admin-username" name="username" type="text" autocomplete="username"></div><div class="field"><label for="admin-password">Password</label><input id="admin-password" name="password" type="password" autocomplete="current-password"></div><button class="button" type="submit">Open dashboard</button></form></div></div></section>`;
}

function formatEnquiryDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return value;
  }
}

function renderAdminEnquiries(enquiries) {
  if (!enquiries.length) {
    return `<div class="empty-state"><h3>No pending enquiries</h3><p>New enquiries will appear here as soon as guests submit them.</p></div>`;
  }

  return enquiries.map((enquiry) => `
    <article class="admin-card">
      <div class="admin-card-header">
        <div>
          <h3>${escapeHtml(enquiry.name || "Unknown guest")}</h3>
          <p>${escapeHtml(enquiry.email || "No email")} · ${escapeHtml(enquiry.phone || "No phone")}</p>
        </div>
        ${statusBadge(enquiry.status || "new")}
      </div>
      <dl class="admin-meta">
        <div><dt>Event</dt><dd>${escapeHtml(enquiry.eventType || "Not specified")}</dd></div>
        <div><dt>Date</dt><dd>${escapeHtml(enquiry.eventDate || "Not specified")}</dd></div>
        <div><dt>Guests</dt><dd>${escapeHtml(enquiry.guests || "Not specified")}</dd></div>
        <div><dt>Location</dt><dd>${escapeHtml(enquiry.location || "Not specified")}</dd></div>
      </dl>
      <p class="admin-message"><strong>Requirements:</strong> ${escapeHtml(enquiry.requirements || "No specific requirements provided.")}</p>
      <p class="admin-message"><strong>Message:</strong> ${escapeHtml(enquiry.message || "No message provided.")}</p>
      <div class="admin-actions">
        <label>
          <span>Update status</span>
          <select data-enquiry-status data-enquiry-id="${escapeHtml(enquiry.id)}">
            <option value="new" ${enquiry.status === "new" ? "selected" : ""}>New</option>
            <option value="contacted" ${enquiry.status === "contacted" ? "selected" : ""}>Contacted</option>
            <option value="quoted" ${enquiry.status === "quoted" ? "selected" : ""}>Quoted</option>
            <option value="booked" ${enquiry.status === "booked" ? "selected" : ""}>Booked</option>
            <option value="closed" ${enquiry.status === "closed" ? "selected" : ""}>Closed</option>
          </select>
        </label>
        <span class="admin-submitted">Submitted ${escapeHtml(formatEnquiryDate(enquiry.submittedAt))}</span>
      </div>
    </article>
  `).join("");
}

async function fetchAdminEnquiries() {
  if (!adminSession) return;
  const response = await fetch("/api/admin/enquiries", {
    headers: { Authorization: `Basic ${btoa(`${adminSession.username}:${adminSession.password}`)}` }
  });
  if (response.status === 401) {
    adminSession = null;
    sessionStorage.removeItem("goldenPlateAdmin");
    showToast("Admin session expired. Please sign in again.");
    renderRoute("/admin/");
    return;
  }
  if (!response.ok) {
    throw new Error("Could not load enquiries.");
  }
  const payload = await response.json();
  const list = document.querySelector("[data-admin-list]");
  if (list) list.innerHTML = renderAdminEnquiries(payload.enquiries || []);
}

async function updateEnquiryStatus(id, status) {
  if (!adminSession) return;
  const response = await fetch(`/api/admin/enquiries/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${btoa(`${adminSession.username}:${adminSession.password}`)}`
    },
    body: JSON.stringify({ status })
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Could not update the enquiry status.");
  }
  await fetchAdminEnquiries();
  showToast(`Enquiry marked as ${status}.`);
}

function renderAdmin() {
  if (!adminSession) return renderAdminLogin();
  return `<section class="section section-white"><div class="container admin-shell"><div class="admin-header"><div><div class="content-kicker">Owner dashboard</div><h1>Enquiry overview</h1></div><button class="button button-secondary" type="button" data-admin-logout>Log out</button></div><div class="admin-dashboard"><div class="admin-panel"><div class="panel-heading"><h2>All catering requests</h2></div><div data-admin-list>Loading enquiries…</div></div><div class="admin-panel"><h2>Status guide</h2><ul class="status-list"><li><span class="status-badge status-new">New</span> New request waiting for response.</li><li><span class="status-badge status-contacted">Contacted</span> Owner has reached out to the guest.</li><li><span class="status-badge status-quoted">Quoted</span> A quote or menu plan is prepared.</li><li><span class="status-badge status-booked">Booked</span> The event has been confirmed.</li><li><span class="status-badge status-closed">Closed</span> The request is resolved or archived.</li></ul></div></div></div></section>`;
}

function setAdminSession(username, password) {
  adminSession = { username, password };
  sessionStorage.setItem("goldenPlateAdmin", JSON.stringify({ username, password }));
}

function restoreAdminSession() {
  try {
    const saved = JSON.parse(sessionStorage.getItem("goldenPlateAdmin") || "null");
    if (saved && saved.username && saved.password) {
      adminSession = { username: saved.username, password: saved.password };
    }
  } catch {
    // Ignore storage issues and fall back to the sign-in screen.
  }
}

function setDocumentMeta(path) {
  const titles = { "/": "Golden Plate Catering", "/about/": "About · Golden Plate Catering", "/services/": "Services · Golden Plate Catering", "/work/": "Our Work · Golden Plate Catering", "/menu/": "Menu · Golden Plate Catering", "/reviews/": "Reviews · Golden Plate Catering", "/contact/": "Get a quote · Golden Plate Catering", "/privacy/": "Privacy · Golden Plate Catering", "/admin/": "Admin · Golden Plate Catering" };
  document.title = titles[path] || titles["/"];
  const description = document.querySelector('meta[name="description"]');
  description?.setAttribute("content", path === "/" ? "Golden Plate Catering — thoughtful food, welcoming tables, and care for every gathering." : `${document.title}. Golden Plate, Karibu Dala.`);
  const canonical = document.querySelector('link[rel="canonical"]');
  if (publicConfig.siteUrl) {
    const link = canonical || document.head.appendChild(Object.assign(document.createElement("link"), { rel: "canonical" }));
    link.href = `${publicConfig.siteUrl.replace(/\/$/, "")}${path}`;
  } else if (canonical) {
    canonical.remove();
  }
}

function updateHeader(path) {
  activePath = path;
  header.classList.toggle("is-solid", path !== "/" || window.scrollY > 60);
  document.querySelectorAll(".primary-nav a[data-nav]").forEach((link) => link.setAttribute("aria-current", link.getAttribute("href") === path ? "page" : "false"));
}

function updateSocialLinks() {
  const socials = publicConfig.socials || {};
  const labels = { facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok" };
  document.querySelectorAll("[data-social-links]").forEach((container) => {
    const links = Object.entries(labels).map(([key, label]) => [label, safeExternalUrl(socials[key])]).filter(([, url]) => url).map(([label, url]) => `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer" aria-label="${escapeHtml(label)}">${escapeHtml(label)}</a>`).join("");
    container.innerHTML = links || `<span class="muted-small">Find Golden Plate online soon.</span>`;
  });
}

function showToast(message) {
  const toast = document.querySelector("[data-toast]");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 4500);
}

function setupHeroVideo() {
  const video = document.querySelector(".hero-video");
  if (!video) return;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduced) {
    video.pause();
    video.removeAttribute("autoplay");
    video.classList.add("is-reduced");
    return;
  }
  video.defaultPlaybackRate = 0.54;
  video.playbackRate = 0.54;
  video.play().catch(() => {});
}

function openMedia(id, collection = assets.work) {
  modalItems = collection;
  modalIndex = Math.max(0, collection.findIndex((item) => item.id === id));
  previousFocus = document.activeElement;
  renderModalItem();
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  document.body.classList.add("modal-open");
  dialog.querySelector("[data-dialog-close]")?.focus();
}

function renderModalItem() {
  const item = modalItems[modalIndex];
  if (!item) return;
  const media = item.type === "video"
    ? `<video controls playsinline preload="metadata" poster="${escapeHtml(item.poster || "")}"><source src="${escapeHtml(item.file)}" type="video/mp4">Your browser does not support this video format.</video>`
    : `<img src="${escapeHtml(item.file)}" alt="${escapeHtml(item.alt || item.title)}">`;
  dialogMedia.innerHTML = media;
  dialogCaption.textContent = `${item.title} · ${item.type === "video" ? "Video" : "Image"}`;
  const multiple = modalItems.length > 1;
  document.querySelector("[data-dialog-prev]").hidden = !multiple;
  document.querySelector("[data-dialog-next]").hidden = !multiple;
}

function closeMedia() {
  if (dialog.open) dialog.close();
  else dialog.removeAttribute("open");
  dialogMedia.innerHTML = "";
  document.body.classList.remove("modal-open");
  previousFocus?.focus?.();
}

function setupGallery() {
  document.querySelectorAll("[data-filter]").forEach((buttonElement) => buttonElement.addEventListener("click", () => {
    const filter = buttonElement.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach((button) => button.setAttribute("aria-pressed", String(button === buttonElement)));
    document.querySelectorAll("[data-gallery] .gallery-item").forEach((item) => { item.hidden = filter !== "all" && item.dataset.category !== filter; });
  }));
}

function setFieldError(form, name, message) {
  const field = form.querySelector(`[name="${name}"]`);
  const errorName = form.matches("[data-enquiry-form]") && name === "phone" ? "contact" : name;
  const error = form.querySelector(`#error-${form.matches("[data-review-form]") ? "review-" : "enquiry-"}${errorName}`);
  if (field) field.setAttribute("aria-invalid", message ? "true" : "false");
  if (error) error.textContent = message || "";
}

function clearFormErrors(form) {
  form.querySelectorAll(".field-error").forEach((error) => { error.textContent = ""; });
  form.querySelectorAll("[aria-invalid]").forEach((field) => field.setAttribute("aria-invalid", "false"));
}

function validateClientForm(form, type) {
  const data = Object.fromEntries(new FormData(form).entries());
  const errors = {};
  if (type === "review") {
    if (!data.name?.trim()) errors.name = "Please enter your name.";
    if (!data.rating) errors.rating = "Choose a rating from 1 to 5.";
    if (!data.text?.trim() || data.text.trim().length < 10) errors.text = "Please share at least 10 characters.";
  } else {
    if (!data.name?.trim()) errors.name = "Please enter your name.";
    if (!data.email?.trim() && !data.phone?.trim()) errors.contact = "Please provide an email address or telephone number.";
    if (data.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) errors.email = "Please enter a valid email address.";
    if (data.phone?.trim() && !/^\+254\d{9}$/.test(data.phone.trim())) errors.phone = "Use the format +254712345678.";
    if (!data.message?.trim() || data.message.trim().length < 10) errors.message = "Please tell us a little more about your enquiry.";
    if (data.eventDate && data.eventDate < new Date().toISOString().slice(0, 10)) errors.eventDate = "Choose today or a future date.";
    if (data.guests && !/^\d{1,6}$/.test(data.guests)) errors.guests = "Enter a whole-number guest estimate.";
  }
  return { data, errors };
}

async function handleFormSubmit(form, type) {
  const status = form.querySelector("[data-form-status]");
  const submit = form.querySelector('button[type="submit"]');
  clearFormErrors(form);
  const result = validateClientForm(form, type);
  Object.entries(result.errors).forEach(([name, message]) => setFieldError(form, name === "contact" ? "phone" : name, message));
  if (Object.keys(result.errors).length) {
    status.textContent = "Please check the highlighted fields.";
    status.className = "form-status is-error";
    form.querySelector('[aria-invalid="true"]')?.focus();
    return;
  }
  submit.disabled = true;
  submit.setAttribute("aria-busy", "true");
  status.textContent = "Sending…";
  status.className = "form-status";
  try {
    const response = await fetch(type === "review" ? "/api/reviews" : "/api/enquiries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(result.data) });
    const payload = await response.json();
    if (!response.ok) {
      Object.entries(payload.errors || {}).forEach(([name, message]) => setFieldError(form, name === "contact" ? "phone" : name, message));
      throw new Error(payload.error || "Please check the form and try again.");
    }
    form.reset();
    clearFormErrors(form);
    status.textContent = payload.message || "Your submission was received.";
    status.className = "form-status is-success";
    showToast(type === "review" ? "Review received for moderation." : "Enquiry saved for follow-up.");
  } catch (error) {
    status.textContent = error.message || "We could not process this submission. Please try again.";
    status.className = "form-status is-error";
  } finally {
    submit.disabled = false;
    submit.removeAttribute("aria-busy");
  }
}

function setupForms() {
  document.querySelector("[data-review-form]")?.addEventListener("submit", (event) => { event.preventDefault(); handleFormSubmit(event.currentTarget, "review"); });
  const enquiryForm = document.querySelector("[data-enquiry-form]");
  const phoneInput = enquiryForm?.elements.phone;
  if (phoneInput) {
    phoneInput.type = "tel";
    phoneInput.inputMode = "tel";
    phoneInput.maxLength = 13;
    phoneInput.pattern = "\\+254[0-9]{9}";
    phoneInput.placeholder = "+254712345678";
    phoneInput.title = "Use the format +254712345678";
  }
  enquiryForm?.addEventListener("submit", (event) => { event.preventDefault(); handleFormSubmit(event.currentTarget, "enquiry"); });
  document.querySelector("[data-admin-login]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const username = form.elements.username.value.trim();
    const password = form.elements.password.value;
    if (!username || !password) {
      showToast("Please enter both admin username and password.");
      return;
    }
    setAdminSession(username, password);
    renderRoute("/admin/");
    showToast("Admin dashboard ready.");
  });
  document.querySelector("[data-admin-logout]")?.addEventListener("click", () => {
    adminSession = null;
    sessionStorage.removeItem("goldenPlateAdmin");
    renderRoute("/admin/");
  });
  document.addEventListener("change", async (event) => {
    const select = event.target.closest("[data-enquiry-status]");
    if (!select) return;
    const id = select.dataset.enquiryId;
    const status = select.value;
    try {
      await updateEnquiryStatus(id, status);
    } catch (error) {
      showToast(error.message || "Status update failed.");
      select.value = select.dataset.previousValue || "new";
    }
    select.dataset.previousValue = status;
  });
}

async function loadReviews() {
  const list = document.querySelector("[data-review-list]");
  if (!list) return;
  try {
    const response = await fetch("/api/reviews");
    if (!response.ok) throw new Error("Could not load reviews");
    const { reviews } = await response.json();
    list.innerHTML = reviews.length ? reviews.map((review) => `<article class="review-card"><div class="review-stars" aria-label="${review.rating} out of 5 stars">${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}</div><p>“${escapeHtml(review.text)}”</p><div class="review-meta"><strong>${escapeHtml(review.name)}</strong><span>${escapeHtml(new Date(review.approvedAt || review.submittedAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }))}</span></div></article>`).join("") : `<div class="empty-state empty-wide"><div class="content-kicker">Reviews unavailable</div><h3>We could not load feedback.</h3><p>Please try again later.</p></div>`;
  } catch {
    list.innerHTML = `<div class="empty-state empty-wide"><div class="content-kicker">Reviews unavailable</div><h3>We could not load feedback.</h3><p>Please try again later.</p></div>`;
  }
}

function bindGlobalEvents() {
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[data-nav]");
    if (link && link.origin === window.location.origin) {
      event.preventDefault();
      navigate(link.pathname);
    }
    const trigger = event.target.closest("[data-media-trigger]");
    if (trigger) openMedia(trigger.dataset.mediaId);
  });
  window.addEventListener("popstate", () => renderRoute(routePath()));
  window.addEventListener("scroll", () => header.classList.toggle("is-solid", activePath !== "/" || window.scrollY > 60), { passive: true });
  document.querySelector(".menu-toggle")?.addEventListener("click", (event) => {
    const buttonElement = event.currentTarget;
    const nav = document.querySelector("#primary-nav");
    const open = nav.classList.toggle("is-open");
    buttonElement.setAttribute("aria-expanded", String(open));
  });
  document.querySelector("[data-dialog-close]")?.addEventListener("click", closeMedia);
  document.querySelector("[data-dialog-prev]")?.addEventListener("click", () => { modalIndex = (modalIndex - 1 + modalItems.length) % modalItems.length; renderModalItem(); });
  document.querySelector("[data-dialog-next]")?.addEventListener("click", () => { modalIndex = (modalIndex + 1) % modalItems.length; renderModalItem(); });
  dialog?.addEventListener("close", () => { document.body.classList.remove("modal-open"); previousFocus?.focus?.(); });
  document.addEventListener("keydown", (event) => {
    if (!dialog?.open) return;
    if (event.key === "ArrowLeft") { modalIndex = (modalIndex - 1 + modalItems.length) % modalItems.length; renderModalItem(); }
    if (event.key === "ArrowRight") { modalIndex = (modalIndex + 1) % modalItems.length; renderModalItem(); }
  });
}

function navigate(path) {
  const normalized = routes[path] ? path : "/";
  if (normalized !== routePath()) history.pushState({}, "", normalized);
  renderRoute(normalized);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderRoute(path) {
  const renderer = routes[path] || routes["/"];
  main.innerHTML = renderer();
  setDocumentMeta(path);
  updateHeader(path);
  updateSocialLinks();
  setupHeroVideo();
  setupGallery();
  setupForms();
  if (path === "/reviews/") loadReviews();
  if (path === "/admin/" && adminSession) fetchAdminEnquiries().catch((error) => { showToast(error.message || "Could not load admin dashboard."); const list = document.querySelector("[data-admin-list]"); if (list) list.innerHTML = `<div class=\"empty-state\"><h3>Unable to load enquiries</h3><p>${escapeHtml(error.message || "Please try again soon.")}</p></div>`; });
  const menu = document.querySelector("#primary-nav");
  const menuButton = document.querySelector(".menu-toggle");
  menu?.classList.remove("is-open");
  menuButton?.setAttribute("aria-expanded", "false");
  main.focus({ preventScroll: true });
}

async function loadPublicConfig() {
  try {
    const response = await fetch("/api/config");
    if (response.ok) publicConfig = await response.json();
  } catch {
    publicConfig = { contact: siteConfig.contact || {}, socials: siteConfig.socials || {}, siteUrl: "" };
  }
}

restoreAdminSession();
document.querySelector("[data-year]").textContent = new Date().getFullYear();
bindGlobalEvents();
loadPublicConfig().finally(() => renderRoute(routePath()));
