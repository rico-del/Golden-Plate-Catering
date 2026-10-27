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

const routes = {
  "/": renderHome,
  "/about/": renderAbout,
  "/services/": renderServices,
  "/work/": renderWork,
  "/menu/": renderMenu,
  "/reviews/": renderReviews,
  "/contact/": renderContact,
  "/privacy/": renderPrivacy
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
  return `<button class="media-card ${className}" type="button" data-media-trigger data-media-id="${escapeHtml(item.id)}" aria-label="Open ${escapeHtml(item.title)} in media viewer"><img src="${escapeHtml(item.poster || item.file)}" alt="${escapeHtml(item.alt || item.title)}" loading="lazy" width="${item.width || 1600}" height="${item.height || 720}"><span class="media-card-overlay"><span>${mediaType} · ${escapeHtml(item.category || "work")}</span><strong>${escapeHtml(item.title)}</strong></span>${playMark}</button>`;
}

function foodCard(item) {
  return `<figure class="food-card food-card-${escapeHtml(item.id)}"><div class="food-media"><img src="${escapeHtml(item.file)}" alt="${escapeHtml(item.alt)}" loading="lazy" width="${item.width}" height="${item.height}"></div><figcaption>${escapeHtml(item.title)}</figcaption></figure>`;
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
    <div class="intro-copy"><div class="content-kicker">The story behind the table</div><h2>Food, atmosphere, and a place to arrive.</h2><p>At Golden Plate, every table is prepared with a warm welcome in mind. Browse the food and event setups that have brought past gatherings to life.</p>${button("/about/", "Read the about page", "button-outline")}</div>
  </div></section>
  <section class="section section-dark"><div class="container"><div class="section-heading"><div>${eyebrow("A taste of our work")}<h2>Moments made for gathering.</h2><p>From the buffet to the final place setting, see how we bring colour, comfort, and care to the table.</p></div>${button("/work/", "View our work", "button-secondary")}</div>${workPreview()}</div></section>
  <section class="section section-ivory"><div class="container"><div class="section-heading"><div>${eyebrow("From our kitchen")}<h2>A taste of recent gatherings.</h2><p>Take a look at some of the dishes served at past events—made for sharing, celebrating, and going back for one more helping.</p></div>${button("/menu/", "Browse food", "button-outline")}</div><div class="food-strip">${food.map(foodCard).join("")}</div></div></section>
  <section class="section section-white"><div class="container"><div class="section-heading"><div>${eyebrow("Guest voices")}<h2>Share how your day felt.</h2><p>We welcome honest words from the people who have shared a table with us.</p></div></div><div class="empty-state"><div class="content-kicker">Your voice matters</div><h3>Tell us about your gathering.</h3><p>Had Golden Plate cater for your event? We would be glad to hear what made the day special.</p><a class="text-link" href="/reviews/" data-nav>Leave a review</a></div></div></section>
  <section class="section section-dark"><div class="container split-copy"><div>${eyebrow("Start a conversation")}<h2>Tell us what you are gathering for.</h2></div><div><p>Share the essentials of your enquiry and the information will be stored securely for follow-up. Submitting an enquiry does not confirm a booking.</p>${button("/contact/", "Get a quote", "button-secondary")}</div></div></section>`;
}

function renderAbout() {
  const about = siteConfig.approvedAbout || {};
  return `${pageHero("About Golden Plate", "Golden Plate, Karibu Dala.", "A warm welcome, a generous table, and thoughtful catering for the moments people remember.")}
  <section class="section section-white"><div class="container split-copy"><div><div class="content-kicker">Our welcome</div><h2>${about.story ? escapeHtml(about.story) : "A table where everyone feels at home."}</h2></div><div>${about.story ? `<p>${escapeHtml(about.story)}</p>` : `<p>Golden Plate brings people together through food, hospitality, and the small details that make a gathering feel special.</p>`}${welcomeNotice("Golden Plate, Karibu Dala", "Come in, settle at the table, and let us help make the occasion memorable.")}</div></div></section>
  <section class="section section-ivory"><div class="container"><div class="section-heading"><div>${eyebrow("What guides the work")}<h2>Care in every serving.</h2></div></div><div class="feature-grid"><article class="feature-card"><span class="feature-index">01</span><h3>Warm hospitality</h3><p>${about.approach ? escapeHtml(about.approach) : "From the first conversation to the last plate served, every guest should feel welcome."}</p></article><article class="feature-card"><span class="feature-index">02</span><h3>Gatherings that matter</h3><p>Big celebrations, family milestones, and everyday occasions all deserve a table prepared with care.</p></article><article class="feature-card"><span class="feature-index">03</span><h3>Made for sharing</h3><p>${about.team ? escapeHtml(about.team) : "Good food brings people closer. That spirit is at the heart of every Golden Plate gathering."}</p></article></div></div></section>
  <section class="section section-white"><div class="container intro-grid"><div class="display-image"><img src="/assets/dining_gazebo_2.png" alt="White covered chairs with orange sashes arranged inside a covered dining space" width="1600" height="720" loading="lazy"></div><div class="intro-copy"><div class="content-kicker">See the work</div><h2>See how the table comes together.</h2><p>Browse past events, dining setups, buffet displays, and food prepared for sharing.</p>${button("/work/", "Open our work", "button-outline")}</div></div></section>`;
}

function renderServices() {
  const services = siteConfig.approvedServices || [];
  const serviceContent = services.length
    ? services.map((service, index) => `<article class="feature-card"><span class="feature-index">${String(index + 1).padStart(2, "0")}</span><h3>${escapeHtml(service.title || "Service")}</h3><p>${escapeHtml(service.description || "")}</p></article>`).join("")
    : `<article class="feature-card"><span class="feature-index">01</span><h3>Food for the occasion</h3><p>Tell us the kind of meal and style of service you have in mind, from a relaxed buffet to a beautifully dressed table.</p></article><article class="feature-card"><span class="feature-index">02</span><h3>Celebrations &amp; milestones</h3><p>Weddings, ruracios, graduations, family celebrations, and work gatherings all begin with a conversation.</p></article><article class="feature-card"><span class="feature-index">03</span><h3>Let’s plan together</h3><p>Share your date, venue, guest count, and the feeling you would like your gathering to have.</p></article>`;
  return `${pageHero("Services", "Every gathering has its own flavour.", "Golden Plate, Karibu Dala. Tell us what you are celebrating and we will begin with the details that matter to you.")}
  <section class="section section-white"><div class="container">${welcomeNotice("Let’s make a plan", "Whether it is a family celebration or a work gathering, start by telling us about the day.")}<div class="feature-grid spacing-top-lg">${serviceContent}</div></div></section>
  <section class="section section-dark"><div class="container split-copy"><div>${eyebrow("Your occasion, your brief")}<h2>Let the details lead.</h2></div><div><p>Share the event type, date, location, guest estimate, and any food or setup wishes. We will use your enquiry to start the conversation.</p>${button("/contact/", "Begin an enquiry", "button-secondary")}</div></div></section>`;
}

function renderWork() {
  const filters = ["all", "video", "dining", "buffet"];
  return `${pageHero("Our work", "A closer look at the details.", "Browse past gatherings, from the food and buffet to the dining setup and finishing touches.")}
  <section class="section section-white"><div class="container"><div class="gallery-controls" role="group" aria-label="Filter work"><button class="filter-button" type="button" data-filter="all" aria-pressed="true">All work</button>${filters.slice(1).map((filter) => `<button class="filter-button" type="button" data-filter="${filter}" aria-pressed="false">${filter}</button>`).join("")}</div><div class="gallery-grid" data-gallery>${assets.work.map((item) => `<div class="gallery-item" data-category="${escapeHtml(item.category)}">${mediaCard(item)}</div>`).join("")}</div><p class="muted-small muted-note">Videos are loaded only when opened. Playback controls are available in the viewer.</p></div></section>`;
}

function renderMenu() {
  return `${pageHero("Food", "A taste of gatherings gone by.", "Browse food from previous events and imagine the spread for your own celebration.")}
  <section class="section section-white"><div class="container">${welcomeNotice("Golden Plate, Karibu Dala", "These are a few favourites from past gatherings. Tell us what you would love to serve at yours.")}<div class="food-grid spacing-top-lg">${assets.food.map(foodCard).join("")}</div></div></section>
  <section class="section section-ivory"><div class="container split-copy"><div>${eyebrow("For your gathering")}<h2>What would you like on the table?</h2></div><div><p>Every event has its own taste. Share your menu ideas, guest numbers, dietary needs, and the kind of welcome you want to create.</p>${button("/contact/", "Plan your menu", "button-outline")}</div></div></section>`;
}

function renderReviewForm() {
  return `<div class="form-panel"><h2>Share your experience</h2><form data-review-form novalidate><div class="field"><label for="review-name">Your name</label><input id="review-name" name="name" autocomplete="name" maxlength="120" required aria-describedby="error-review-name"><span class="field-error" id="error-review-name"></span></div><fieldset class="field"><legend class="rating-legend">Rating</legend><div class="rating-options"><input id="rating-5" name="rating" type="radio" value="5" required><label for="rating-5" title="5 stars">★<span class="sr-only">5 stars</span></label><input id="rating-4" name="rating" type="radio" value="4"><label for="rating-4" title="4 stars">★<span class="sr-only">4 stars</span></label><input id="rating-3" name="rating" type="radio" value="3"><label for="rating-3" title="3 stars">★<span class="sr-only">3 stars</span></label><input id="rating-2" name="rating" type="radio" value="2"><label for="rating-2" title="2 stars">★<span class="sr-only">2 stars</span></label><input id="rating-1" name="rating" type="radio" value="1"><label for="rating-1" title="1 star">★<span class="sr-only">1 star</span></label></div><span class="field-error" id="error-review-rating"></span></fieldset><div class="field"><label for="review-text">Your review</label><textarea id="review-text" name="text" maxlength="2000" required aria-describedby="error-review-text" placeholder="What would you like future customers to know?"></textarea><span class="field-error" id="error-review-text"></span></div><div class="honeypot" aria-hidden="true"><label for="review-website">Website</label><input id="review-website" name="website" tabindex="-1" autocomplete="off"></div><p class="form-footnote">Your review is stored as pending and will be checked before it appears publicly. Please do not include private contact details.</p><button class="button" type="submit">Submit for review <span aria-hidden="true">↗</span></button><p class="form-status" data-form-status role="status" aria-live="polite"></p></form></div>`;
}

function renderReviews() {
  return `${pageHero("Reviews", "The memories stay with you.", "If Golden Plate shared your special day, we would love to hear what made it memorable.")}
  <section class="section section-white"><div class="container"><div class="review-summary"><div>${eyebrow("Words from our guests")}<h2>Every gathering has a story.</h2></div><div><p>Guest feedback is shared here after a quick check, so every voice comes from a real experience.</p></div></div><div class="review-list" data-review-list><div class="empty-state"><div class="content-kicker">Guest stories</div><h3>Getting the table ready.</h3><p>We are gathering feedback from our guests. Check back soon for their stories.</p></div></div></div></section>
  <section class="section section-ivory"><div class="container form-layout"><div class="form-intro">${eyebrow("Your experience")}<h2>Tell the next guest what mattered.</h2><p>Use your own words. A review is not published immediately and submitting one does not create an account.</p></div>${renderReviewForm()}</div></section>`;
}

function renderContactForm() {
  return `<div class="form-panel"><h2>Tell us about it</h2><form data-enquiry-form novalidate><div class="form-row"><div class="field"><label for="enquiry-name">Name</label><input id="enquiry-name" name="name" autocomplete="name" maxlength="120" required aria-describedby="error-enquiry-name"><span class="field-error" id="error-enquiry-name"></span></div><div class="field"><label for="enquiry-email">Email <span class="optional">or telephone below</span></label><input id="enquiry-email" name="email" type="email" autocomplete="email" maxlength="254" aria-describedby="error-enquiry-email"><span class="field-error" id="error-enquiry-email"></span></div></div><div class="form-row"><div class="field"><label for="enquiry-phone">Telephone <span class="optional">or email above</span></label><input id="enquiry-phone" name="phone" autocomplete="tel" maxlength="40" aria-describedby="error-enquiry-contact"><span class="field-error" id="error-enquiry-contact"></span></div><div class="field"><label for="enquiry-event">Event type <span class="optional">optional</span></label><input id="enquiry-event" name="eventType" maxlength="120" placeholder="Tell us what you are planning" aria-describedby="error-enquiry-eventType"><span class="field-error" id="error-enquiry-eventType"></span></div></div><div class="form-row"><div class="field"><label for="enquiry-date">Event date <span class="optional">optional</span></label><input id="enquiry-date" name="eventDate" type="date" aria-describedby="error-enquiry-eventDate"><span class="field-error" id="error-enquiry-eventDate"></span></div><div class="field"><label for="enquiry-guests">Estimated guests <span class="optional">optional</span></label><input id="enquiry-guests" name="guests" inputmode="numeric" maxlength="20" placeholder="An estimate is fine"><span class="field-error" id="error-enquiry-guests"></span></div></div><div class="field"><label for="enquiry-location">Event location <span class="optional">optional</span></label><input id="enquiry-location" name="location" maxlength="180" placeholder="Town, venue, or area"><span class="field-error" id="error-enquiry-location"></span></div><div class="field"><label for="enquiry-message">What would you like to discuss?</label><textarea id="enquiry-message" name="message" maxlength="4000" required aria-describedby="error-enquiry-message" placeholder="Share the occasion, requirements, or questions you have."></textarea><span class="field-error" id="error-enquiry-message"></span></div><div class="field"><label for="enquiry-requirements">Additional requirements <span class="optional">optional</span></label><textarea id="enquiry-requirements" name="requirements" maxlength="2000" placeholder="Menu preferences, setup notes, or dietary requirements"></textarea><span class="field-error" id="error-enquiry-requirements"></span></div><div class="honeypot" aria-hidden="true"><label for="enquiry-website">Website</label><input id="enquiry-website" name="website" tabindex="-1" autocomplete="off"></div><p class="form-footnote">We collect the details needed to respond to this enquiry. Sending this form does not confirm availability or a booking.</p><button class="button" type="submit">Send enquiry <span aria-hidden="true">↗</span></button><p class="form-status" data-form-status role="status" aria-live="polite"></p></form></div>`;
}

function renderContact() {
  const contact = publicConfig.contact || {};
  const hasContact = contact.email || contact.phone || contact.whatsapp;
  return `${pageHero("Get a quote", "Let’s set the table together.", "Golden Plate, Karibu Dala. Tell us about the occasion, and let’s begin planning a gathering your guests will enjoy.")}
  <section class="section section-white"><div class="container form-layout"><div class="form-intro">${eyebrow("A warm first step")}<h2>Bring your occasion into focus.</h2><p>Share your date, guest estimate, venue, and the details that will make the day feel like yours.</p>${hasContact ? `<dl class="contact-details">${contact.email ? `<dt>Email</dt><dd><a href="mailto:${escapeHtml(contact.email)}">${escapeHtml(contact.email)}</a></dd>` : ""}${contact.phone ? `<dt>Telephone</dt><dd><a href="tel:${escapeHtml(contact.phone)}">${escapeHtml(contact.phone)}</a></dd>` : ""}${contact.whatsapp ? `<dt>WhatsApp</dt><dd>${escapeHtml(contact.whatsapp)}</dd>` : ""}</dl>` : `<div class="contact-details"><div class="content-kicker">Start here</div><p class="muted-note">Use the form to share your plans and begin the conversation with Golden Plate.</p></div>`}</div>${renderContactForm()}</div></section>`;
}

function renderPrivacy() {
  return `${pageHero("Privacy & data", "A clear account of what the site stores.", "This site collects only the information needed for genuine enquiries and review submissions.")}
  <section class="section section-white"><div class="container privacy-copy"><h2>Information you submit</h2><p>When you send an enquiry, the site stores the name, contact details, event details, and message you provide so the enquiry can be followed up. When you submit a review, it stores your name, rating, review text, submission time, and moderation status.</p><h2>How the information is used</h2><p>Enquiry information is used to respond to the enquiry. Review information is used to moderate and, only after approval, display the review publicly. Email addresses, telephone numbers, and internal moderation details are not displayed in public review listings.</p><h2>Storage and access</h2><p>Submissions are stored on the site's server with access restricted to authorised administrators. Retention periods, backup procedures, and administrator ownership are maintained under the site's operational policies.</p><h2>What is not integrated</h2><ul><li>No analytics, advertising pixels, payment processing, account registration, or third-party review provider is enabled.</li><li>No file upload is enabled.</li><li>Submitting an enquiry does not confirm availability, a booking, or a payment.</li></ul><h2>Questions and requests</h2><p>For questions about your information, or to request access to or removal of your details, use the contact details listed on this site.</p></div></section>`;
}

function setDocumentMeta(path) {
  const titles = { "/": "Golden Plate Catering", "/about/": "About · Golden Plate Catering", "/services/": "Services · Golden Plate Catering", "/work/": "Our Work · Golden Plate Catering", "/menu/": "Food · Golden Plate Catering", "/reviews/": "Reviews · Golden Plate Catering", "/contact/": "Get a Quote · Golden Plate Catering", "/privacy/": "Privacy · Golden Plate Catering" };
  document.title = titles[path] || titles["/"];
  const description = document.querySelector('meta[name="description"]');
  description?.setAttribute("content", path === "/" ? "Golden Plate Catering — thoughtful food, welcoming tables, and care for every gathering." : `${document.title}. Golden Plate, Karibu Dala — explore food, past gatherings, and catering for your occasion.`);
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
    const links = Object.entries(labels).map(([key, label]) => [label, safeExternalUrl(socials[key])]).filter(([, url]) => url).map(([label, url]) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label} <span aria-hidden="true">↗</span></a>`).join("");
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
  // A slow, unhurried loop keeps the hero feeling elegant without appearing frozen.
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
}

async function loadReviews() {
  const list = document.querySelector("[data-review-list]");
  if (!list) return;
  try {
    const response = await fetch("/api/reviews");
    if (!response.ok) throw new Error("Could not load reviews");
    const { reviews } = await response.json();
    list.innerHTML = reviews.length ? reviews.map((review) => `<article class="review-card"><div class="review-stars" aria-label="${review.rating} out of 5 stars">${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}</div><blockquote>“${escapeHtml(review.text)}”</blockquote><cite>${escapeHtml(review.name)}</cite></article>`).join("") : `<div class="empty-state empty-wide"><div class="content-kicker">Guest stories</div><h3>Be the first to share yours.</h3><p>If Golden Plate catered for your gathering, we would be glad to hear from you.</p></div>`;
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

document.querySelector("[data-year]").textContent = new Date().getFullYear();
bindGlobalEvents();
loadPublicConfig().finally(() => renderRoute(routePath()));
