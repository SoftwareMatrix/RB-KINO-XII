/* Main Script Start */

/* Global Utilities Start */

const state = { user: null, options: null };
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const escapeHtml = (value = "") =>
  String(value).replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[character],
  );
const money = (value) =>
  `₾${Number(value || 0).toFixed(Number(value || 0) % 1 ? 2 : 0)}`;
const dateText = (value, options = { day: "numeric", month: "short" }) =>
  value
    ? new Intl.DateTimeFormat("en-GB", options).format(
        new Date(`${value}T12:00:00`),
      )
    : "";
const localDate = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const pageReturnTo = () =>
  `${location.pathname.split("/").pop() || "index.html"}${location.search}${location.hash}`;
const safeReturnTo = (value, fallback = "index.html") => {
  if (!value) return fallback;
  try {
    const url = new URL(value, location.href);
    const page = url.pathname.split("/").pop();
    return url.origin === location.origin && /^[a-z-]+\.html$/i.test(page)
      ? `${page}${url.search}${url.hash}`
      : fallback;
  } catch (_) {
    return fallback;
  }
};
const authCloseTarget = () => {
  const referrer = safeReturnTo(document.referrer, "");
  if (
    referrer &&
    !/^(?:authorization|signup|booking)\.html(?:[?#]|$)/.test(referrer)
  )
    return referrer;
  const target = safeReturnTo(
    new URLSearchParams(location.search).get("returnTo"),
  );
  if (/^booking\.html(?:[?#]|$)/.test(target)) {
    const movie = new URL(target, location.href).searchParams.get("movie");
    return movie
      ? `movie.html?movie=${encodeURIComponent(movie)}`
      : "sessions.html";
  }
  return /^(?:profile|tickets)\.html(?:[?#]|$)/.test(target)
    ? "index.html"
    : target;
};

/* Global Utilities End */

/* Feedback and Form States Start */

function loading(label) {
  return `<article class="content-state loading-state"><span class="loading-ring" aria-hidden="true"></span><h2>${escapeHtml(label)}</h2></article>`;
}

function sessionSkeletons() {
  return `<div class="session-skeletons" aria-label="Loading sessions" aria-busy="true">${Array.from({ length: 3 }, () => "<article><i></i><div><span></span><span></span><span></span></div></article>").join("")}</div>`;
}

function empty(title, message) {
  return `<article class="content-state empty-state"><span class="state-icon" aria-hidden="true">□</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p></article>`;
}

function failure(error) {
  return `<article class="content-state error-state"><span class="state-icon" aria-hidden="true">!</span><h2>Something went wrong</h2><p>${escapeHtml(error.message)}</p><button class="state-retry" type="button">Try again</button></article>`;
}

function showFailure(container, error, retry) {
  if (container.classList.contains("content-state")) {
    container.insertAdjacentHTML("afterend", failure(error));
    const replacement = container.nextElementSibling;
    container.remove();
    $(".state-retry", replacement)?.addEventListener("click", retry);
    return;
  }
  container.innerHTML = failure(error);
  $(".state-retry", container)?.addEventListener("click", retry);
}

function setBusy(button, busy, text = "Loading…") {
  if (!button) return;
  if (busy) {
    button.dataset.idle = button.textContent;
    button.textContent = text;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
  } else {
    button.textContent = button.dataset.idle || button.textContent;
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
}

function setField(input, validity, message) {
  const field = input?.closest(".form-field");
  if (!field) return;
  field.classList.toggle("is-valid", validity === true);
  field.classList.toggle("is-invalid", validity === false);
  input.toggleAttribute("aria-invalid", validity === false);
  if (message && $(".field-message", field))
    $(".field-message", field).textContent = message;
}

function formError(form, message, retry) {
  let output = $(".form-api-error", form);
  if (!output) {
    output = document.createElement("p");
    output.className = "form-api-error";
    output.setAttribute("role", "alert");
    form.prepend(output);
  }
  output.textContent = message;
  if (retry) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "form-error-retry";
    button.textContent = "Try again";
    button.addEventListener("click", retry);
    output.append(" ", button);
  }
}

function clearFormError(form) {
  $(".form-api-error", form)?.remove();
}

function showGlobalFailure(message) {
  if ($(".global-api-error")) return;
  const output = document.createElement("div");
  output.className = "global-api-error";
  output.setAttribute("role", "alert");
  output.innerHTML = `<span>${escapeHtml(message)}</span><button type="button">Try again</button>`;
  $("main")?.prepend(output);
  $("button", output)?.addEventListener("click", () => location.reload());
}

function fieldErrors(form, errors = {}) {
  const aliases = {
    fullName: "full_name",
    mobileNumber: "mobile",
    dateOfBirth: "birth_date",
    preferredVenueId: "venue",
    cardNumber: "card_number",
  };
  Object.entries(errors).forEach(([key, messages]) =>
    setField(
      form.elements[aliases[key] || key],
      false,
      Array.isArray(messages) ? messages[0] : messages,
    ),
  );
}

/* Feedback and Form States End */

/* Authentication State Start */

function redirectLogin(target = pageReturnTo(), pendingAction) {
  if (pendingAction)
    sessionStorage.setItem("kinoPendingAction", JSON.stringify(pendingAction));
  location.href = `authorization.html?returnTo=${encodeURIComponent(safeReturnTo(target))}`;
}

async function restoreUser() {
  if (!KinoApi.token()) return;
  try {
    state.user = await KinoApi.me();
  } catch (error) {
    if (error.status !== 401) throw error;
  }
}

async function requireUser(complete = false, target = pageReturnTo()) {
  if (!state.user) {
    redirectLogin(target);
    return false;
  }
  if (complete && !state.user.profileComplete) {
    sessionStorage.setItem(
      "kinoProfileNotice",
      "Please complete your profile to enable booking.",
    );
    location.href = `profile.html?returnTo=${encodeURIComponent(target)}`;
    return false;
  }
  return true;
}

function renderAuthHeader() {
  if (!state.user) return;
  $$(".header-auth").forEach((auth) => {
    const name = state.user.fullName || state.user.username;
    const displayName = name.trim().split(/\s+/)[0];
    const initials = name
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
    const completeClass = state.user.profileComplete ? " is-complete" : "";
    auth.innerHTML = `<div class="header-profile-menu-wrap"><button class="header-profile-trigger" type="button" aria-expanded="false" aria-haspopup="menu"><span class="header-profile-avatar${completeClass}">${escapeHtml(initials)}<i aria-hidden="true"></i></span><span class="header-profile-name">${escapeHtml(displayName)}</span><img class="header-profile-chevron" src="assets/icons/chevron-down.svg" alt="" /></button><div class="header-profile-menu" role="menu" hidden><div class="header-profile-summary"><span class="header-profile-avatar${completeClass}">${escapeHtml(initials)}<i aria-hidden="true"></i></span><p><strong>${escapeHtml(name)}</strong><small>${escapeHtml(state.user.email)}</small></p></div><p class="profile-status${completeClass}"><strong>Profile ${state.user.profileComplete ? "Complete" : "Incomplete"}</strong>${state.user.profileComplete ? '<img src="assets/icons/profile-complete.svg" alt="" />' : "<small>Please complete your profile to enable booking.</small>"}</p><a href="profile.html" role="menuitem"><img class="profile-menu-icon" src="assets/icons/menu-user.svg" alt="" />My Profile</a><a href="tickets.html" role="menuitem"><img class="profile-menu-icon" src="assets/icons/menu-ticket.svg" alt="" />My Tickets</a><button class="header-logout" type="button" role="menuitem"><span class="profile-menu-logout-icon" aria-hidden="true"><img src="assets/icons/menu-logout-arrow.svg" alt="" /><img src="assets/icons/menu-logout-door.svg" alt="" /></span>Log out</button></div></div>`;
    const trigger = $(".header-profile-trigger", auth);
    const menu = $(".header-profile-menu", auth);
    const close = () => {
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
    };
    trigger.addEventListener("click", () => {
      menu.hidden = !menu.hidden;
      trigger.setAttribute("aria-expanded", String(!menu.hidden));
    });
    document.addEventListener("pointerdown", (event) => {
      if (!auth.contains(event.target)) close();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    });
    $(".header-logout", auth).addEventListener("click", async (event) => {
      const button = event.currentTarget;
      setBusy(button, true, "Logging out…");
      await KinoApi.logout().catch(() => {});
      sessionStorage.removeItem("kinoPendingAction");
      location.href = "index.html";
    });
  });
}

/* Authentication State End */

/* Movie Components and Notifications Start */

function movieMeta(movie) {
  return `${movie.genres?.[0]?.name || (movie.kind === "event" ? "Live event" : "Film")} · ${movie.runtimeMinutes} min`;
}

function movieCard(movie) {
  return `<article class="movie-card"><a class="movie-card-poster-link" href="movie.html?movie=${encodeURIComponent(movie.slug)}" aria-label="View ${escapeHtml(movie.title)} details"><img class="movie-card-poster" src="${escapeHtml(movie.posterUrl || "")}" alt="${escapeHtml(movie.title)} poster" /></a><div class="movie-card-info"><h3>${escapeHtml(movie.title)}</h3><p>${escapeHtml(movieMeta(movie))}</p><span class="movie-rating">${escapeHtml(movie.ageRating.code)}</span><p class="movie-card-description">${escapeHtml(movie.synopsis || "Synopsis unavailable.")}</p></div><div class="movie-card-footer"><span>From ${money(movie.fromPrice)}</span><a href="movie.html?movie=${encodeURIComponent(movie.slug)}">Buy Ticket</a></div></article>`;
}

function comingCard(movie) {
  return `<article class="coming-soon-card"><a class="coming-soon-poster" href="movie.html?movie=${encodeURIComponent(movie.slug)}"><img src="${escapeHtml(movie.posterUrl || "")}" alt="${escapeHtml(movie.title)} poster" /></a><div class="coming-soon-card-info"><div class="coming-soon-details"><p class="coming-soon-date">IN CINEMAS ${escapeHtml(dateText(movie.releaseDate, { day: "numeric", month: "long" }).toUpperCase())}</p><h3>${escapeHtml(movie.title)}</h3><p class="coming-soon-meta">${escapeHtml(movieMeta(movie))}</p><span class="coming-soon-rating">${escapeHtml(movie.ageRating.code)}</span></div><button class="notify-button" type="button" data-movie="${escapeHtml(movie.slug)}"><img src="assets/icons/bell.svg" alt="" /> Notify Me</button></div></article>`;
}

function renderHero(movies) {
  const hero = $(".hero");
  if (!hero || !movies.length) return;
  $(".hero-progress", hero).innerHTML = movies
    .map(() => "<span></span>")
    .join("");
  let index = 0;
  let interval;
  const show = (next) => {
    index = (next + movies.length) % movies.length;
    const movie = movies[index];
    hero.classList.add("is-changing");
    setTimeout(() => {
      $(".hero-image", hero).src = movie.backdropUrl || movie.posterUrl || "";
      $(".hero-premiere", hero).textContent =
        `PREMIERE · ${dateText(movie.releaseDate, { day: "numeric", month: "long" }).toUpperCase()}`;
      $("#hero-title", hero).textContent = movie.title.toUpperCase();
      $(".hero-badges", hero).innerHTML =
        `<li class="hero-age">${escapeHtml(movie.ageRating.code)}</li><li><img src="assets/icons/timer.svg" alt="" />${movie.runtimeMinutes} Min</li>${movie.formats
          .slice(0, 2)
          .map((format) => `<li>${escapeHtml(format.name)}</li>`)
          .join("")}`;
      $(".hero-description", hero).textContent = movie.synopsis || "";
      $(".hero-buy", hero).href =
        `movie.html?movie=${encodeURIComponent(movie.slug)}`;
      $$(".hero-progress span", hero).forEach((item, itemIndex) =>
        item.classList.toggle("is-active", itemIndex === index),
      );
      hero.classList.remove("is-changing");
    }, 180);
  };
  const restart = () => {
    clearInterval(interval);
    interval = setInterval(() => show(index + 1), 7000);
  };
  $$(".hero-arrow", hero).forEach((button, buttonIndex) =>
    button.addEventListener("click", () => {
      show(index + (buttonIndex ? 1 : -1));
      restart();
    }),
  );
  hero.addEventListener("mouseenter", () => clearInterval(interval));
  hero.addEventListener("mouseleave", restart);
  show(0);
  restart();
}

function bindNotify(root) {
  $$(".notify-button", root).forEach((button) =>
    button.addEventListener("click", async () => {
      if (!state.user) {
        redirectLogin(pageReturnTo(), {
          type: "notify",
          movie: button.dataset.movie,
        });
        return;
      }
      setBusy(button, true, "Subscribing…");
      try {
        await KinoApi.notify(button.dataset.movie);
        button.classList.add("is-notified");
        button.textContent = "Notified";
      } catch (error) {
        if (error.status === 401) redirectLogin();
        else {
          setBusy(button, false);
          button.textContent = error.message;
        }
      }
    }),
  );
}

async function resumePendingAction() {
  if (!state.user) return;
  let action;
  try {
    action = JSON.parse(sessionStorage.getItem("kinoPendingAction") || "null");
  } catch (_) {
    action = null;
  }
  if (!action) return;
  sessionStorage.removeItem("kinoPendingAction");
  if (action.type === "notify") {
    const button = $(
      `.notify-button[data-movie="${CSS.escape(action.movie)}"]`,
    );
    button?.click();
  }
}

/* Movie Components and Notifications End */

/* Home Page Start */

async function setupHome() {
  if (!document.body.classList.contains("home-page")) return;
  const now = $(".now-playing-list");
  const soon = $(".coming-soon-list");
  const recent = $(".recently-viewed");
  now.innerHTML = loading("Loading films");
  soon.innerHTML = loading("Loading coming soon");
  recent.hidden = true;
  const load = async () => {
    try {
      const [featured, current, upcoming] = await Promise.all([
        KinoApi.featured(),
        KinoApi.nowPlaying(6),
        KinoApi.comingSoon(4),
      ]);
      renderHero(
        Array.isArray(featured) ? featured : [featured].filter(Boolean),
      );
      now.innerHTML = current.length
        ? current.map(movieCard).join("")
        : empty("No films showing", "Please check again soon.");
      soon.innerHTML = upcoming.length
        ? upcoming.map(comingCard).join("")
        : empty("No upcoming films", "New releases will appear here.");
      bindNotify(soon);
      const historySlugs = JSON.parse(
        localStorage.getItem("kinoRecentMovies") || "[]",
      );
      const movieBySlug = new Map(current.map((movie) => [movie.slug, movie]));
      const viewed = historySlugs
        .map((movieSlug) => movieBySlug.get(movieSlug))
        .filter(Boolean)
        .slice(0, 2);
      const fallback = current.filter(
        (movie) => !viewed.some((item) => item.slug === movie.slug),
      );
      while (viewed.length < 2 && fallback.length)
        viewed.push(
          fallback.splice(Math.floor(Math.random() * fallback.length), 1)[0],
        );
      recent.hidden = !viewed.length;
      $(".recently-viewed-list", recent).innerHTML = viewed
        .map(
          (movie) =>
            `<a class="recent-movie" href="movie.html?movie=${encodeURIComponent(movie.slug)}"><img src="${escapeHtml(movie.posterUrl || "")}" alt="${escapeHtml(movie.title)} poster" /><span><strong>${escapeHtml(movie.title.toUpperCase())}</strong><small>${escapeHtml(movieMeta(movie))}</small><b>${escapeHtml(movie.ageRating.code)}</b></span></a>`,
        )
        .join("");
    } catch (error) {
      showFailure(now, error, load);
      showFailure(soon, error, load);
    }
  };
  await load();
}

/* Home Page End */

/* Search Start */

async function setupSearch() {
  $$(".header-search").forEach((form) => {
    const input = $("input", form);
    form.setAttribute("autocomplete", "off");
    input.type = "text";
    input.inputMode = "search";
    input.enterKeyHint = "search";
    input.setAttribute("autocomplete", "off");
    input.setAttribute("autocapitalize", "none");
    input.setAttribute("spellcheck", "false");
    const panel = document.createElement("div");
    panel.className = "header-search-results";
    panel.id = `${input.id}-results`;
    panel.hidden = true;
    panel.setAttribute("role", "listbox");
    panel.setAttribute("aria-live", "polite");
    form.append(panel);
    const clear = document.createElement("button");
    clear.className = "header-search-clear";
    clear.type = "button";
    clear.hidden = true;
    clear.setAttribute("aria-label", "Clear search");
    form.append(clear);
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", panel.id);
    let timer;
    let controller;
    const close = () => {
      panel.hidden = true;
      input.setAttribute("aria-expanded", "false");
    };
    input.addEventListener("input", () => {
      clearTimeout(timer);
      controller?.abort();
      const term = input.value.trim();
      clear.hidden = !term;
      if (!term) {
        panel.innerHTML = "";
        close();
        return;
      }
      panel.hidden = false;
      input.setAttribute("aria-expanded", "true");
      panel.innerHTML = `<div class="header-search-message"><span aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 4.5 4.5" /></svg></span><strong>Searching…</strong></div>`;
      timer = setTimeout(async () => {
        controller = new AbortController();
        try {
          const movies = await KinoApi.search(term, controller.signal);
          const visible = movies.slice(0, 4);
          panel.innerHTML = visible.length
            ? `<div class="header-search-results-heading"><strong>FILMS & EVENTS</strong><span>${visible.length} results</span></div>${visible.map((movie) => `<a class="header-search-result" href="movie.html?movie=${encodeURIComponent(movie.slug)}" role="option"><img src="${escapeHtml(movie.posterUrl || "")}" alt="" /><span><strong>${escapeHtml(movie.title)}</strong><small>${escapeHtml(movieMeta(movie))}</small></span><b class="${movie.isComingSoon ? "coming" : ""}">${movie.isComingSoon ? "Coming Soon" : `from ${money(movie.fromPrice)}`}</b></a>`).join("")}`
            : `<div class="header-search-message"><span aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 4.5 4.5" /></svg></span><strong>No results for “${escapeHtml(term)}”</strong><p>Check the spelling or try another film or live event.</p><a href="sessions.html">Browse all sessions</a></div>`;
        } catch (error) {
          if (error.name !== "AbortError")
            panel.innerHTML = `<div class="header-search-message"><strong>Something went wrong</strong><p>${escapeHtml(error.message)}</p></div>`;
        }
      }, 250);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
      if (event.key === "ArrowDown" && $("a", panel)) {
        event.preventDefault();
        $("a", panel).focus();
      }
    });
    panel.addEventListener("keydown", (event) => {
      const links = $$("a", panel);
      const index = links.indexOf(document.activeElement);
      if (index >= 0 && ["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        links[
          (index + (event.key === "ArrowDown" ? 1 : -1) + links.length) %
            links.length
        ].focus();
      }
    });
    clear.addEventListener("click", () => {
      input.value = "";
      input.dispatchEvent(new Event("input"));
      input.focus();
    });
    document.addEventListener("pointerdown", (event) => {
      if (!form.contains(event.target)) close();
    });
  });
}

/* Search End */

/* Sessions Page Start */

function sevenDays() {
  const today = new Date();
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    return {
      value: localDate(date),
      weekday: new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(
        date,
      ),
      day: date.getDate(),
    };
  });
}

function dayPicker(container, selected, available) {
  const allowed = available ? new Set(available) : null;
  container.innerHTML = sevenDays()
    .map(
      (date) =>
        `<button type="button" data-date="${date.value}" class="${date.value === selected ? "active" : ""}" aria-pressed="${date.value === selected}" ${allowed && !allowed.has(date.value) ? "disabled" : ""}>${date.weekday}<strong>${date.day}</strong></button>`,
    )
    .join("");
}

function filtersFromUrl() {
  const params = new URLSearchParams(location.search);
  const page = Number(params.get("page") || 1);
  return {
    date: params.get("date") || sevenDays()[0].value,
    venues: params.getAll("venues[]"),
    formats: params.getAll("formats[]"),
    languages: params.getAll("languages[]"),
    bands: params.getAll("bands[]"),
    search: params.get("search") || "",
    sort: params.get("sort") || "",
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

function filtersUrl(filters) {
  const params = new URLSearchParams({ date: filters.date });
  [
    ["venues", filters.venues],
    ["formats", filters.formats],
    ["languages", filters.languages],
    ["bands", filters.bands],
  ].forEach(([name, values]) =>
    values.forEach((value) => params.append(`${name}[]`, value)),
  );
  if (filters.search) params.set("search", filters.search);
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.page > 1) params.set("page", filters.page);
  return `sessions.html?${params}`;
}

function buildFilters(options) {
  const panel = $(".filters-panel");
  const sets = $$("fieldset", panel);
  const replaceLabels = (set, html) => {
    $$("label", set).forEach((label) => label.remove());
    set.insertAdjacentHTML("beforeend", html);
  };
  replaceLabels(
    sets[0],
    options.venues
      .map(
        (venue) =>
          `<label><input type="checkbox" name="venue" value="${escapeHtml(venue.slug)}" /> ${escapeHtml(venue.name)} <small>· ${escapeHtml(venue.city)}</small></label>`,
      )
      .join(""),
  );
  replaceLabels(
    sets[2],
    options.formats
      .map(
        (format) =>
          `<label data-format="${escapeHtml(format.slug)}"><input type="checkbox" name="format" value="${escapeHtml(format.slug)}" /> ${escapeHtml(format.name)}</label>`,
      )
      .join(""),
  );
  replaceLabels(
    sets[3],
    options.languages
      .map(
        (language) =>
          `<label><input type="checkbox" name="language" value="${escapeHtml(language.slug)}" /> ${escapeHtml(language.name)}</label>`,
      )
      .join(""),
  );
  replaceLabels(
    sets[4],
    options.timeBands
      .map(
        (band) =>
          `<label><input type="checkbox" name="time" value="${escapeHtml(band.id)}" /> ${escapeHtml(band.label)}</label>`,
      )
      .join(""),
  );
  $('.results-toolbar select[name="sort"]').innerHTML = options.sorts
    .map(
      (item) =>
        `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`,
    )
    .join("");
}

function renderSessionGroups(groups, meta) {
  const results = $(".sessions-results");
  $$(".session-movie, .content-state, .session-skeletons", results).forEach(
    (item) => item.remove(),
  );
  $("#results-title").textContent = meta.totalSessions
    ? `Showing ${meta.totalSessions} sessions`
    : "No sessions found";
  const pager = $(".pagination", results);
  if (!groups.length) {
    pager.insertAdjacentHTML(
      "beforebegin",
      empty("No sessions found", "Try changing or clearing your filters."),
    );
    pager.innerHTML = "";
    return;
  }
  groups.forEach(({ movie, sessions }) => {
    const ageBlocked =
      state.user?.age != null && state.user.age < movie.ageRating.minAge;
    pager.insertAdjacentHTML(
      "beforebegin",
      `<article class="session-movie"><div class="session-movie-heading"><img src="${escapeHtml(movie.posterUrl || "")}" alt="${escapeHtml(movie.title)} poster" /><div><h3>${escapeHtml(movie.title)} <span>${escapeHtml(movie.ageRating.code)}</span></h3><p>${movie.runtimeMinutes} min</p></div></div><div class="showtime-row">${sessions
        .map((session) => {
          const disabled = session.isSoldOut || ageBlocked;
          return `<a class="showtime-card ${disabled ? "sold" : ""}" href="${disabled ? "" : `booking.html?session=${session.id}&movie=${encodeURIComponent(movie.slug)}`}" ${disabled ? 'aria-disabled="true"' : ""} ${ageBlocked ? `title="This film is rated ${escapeHtml(movie.ageRating.code)}. You cannot buy tickets for it with this account."` : ""}><strong>${escapeHtml(session.time)}</strong><span>${escapeHtml(session.format.name)}</span><small>${escapeHtml(session.language.name)}</small><em class="${session.seatsLeft <= 5 ? "few" : ""}">${session.isSoldOut ? "Sold out" : ageBlocked ? "Age restricted" : `${session.seatsLeft} left`}</em><b>${escapeHtml(session.venue.name)} · Hall ${escapeHtml(session.hall.name)}</b><i>${money(session.price)}</i></a>`;
        })
        .join("")}</div></article>`,
    );
  });
  if (meta.lastPage <= 1) {
    pager.innerHTML = "";
    return;
  }
  const pages = [
    ...new Set([
      1,
      meta.currentPage - 1,
      meta.currentPage,
      meta.currentPage + 1,
      meta.lastPage,
    ]),
  ]
    .filter((page) => page > 0 && page <= meta.lastPage)
    .sort((a, b) => a - b);
  pager.innerHTML = `<a href="#" data-page="${Math.max(1, meta.currentPage - 1)}" aria-label="Previous page"><img src="assets/icons/arrow-left.svg" alt="" /></a>${pages.map((page, index) => `${index && page - pages[index - 1] > 1 ? "<span>…</span>" : ""}<a href="#" data-page="${page}" class="${page === meta.currentPage ? "active" : ""}" ${page === meta.currentPage ? 'aria-current="page"' : ""}>${page}</a>`).join("")}<a href="#" data-page="${Math.min(meta.lastPage, meta.currentPage + 1)}" aria-label="Next page"><img src="assets/icons/arrow-right.svg" alt="" /></a>`;
}

async function setupSessions() {
  if (!$(".sessions-page")) return;
  const panel = $(".filters-panel");
  const results = $(".sessions-results");
  let filters = filtersFromUrl();
  let controller;
  const sync = () => {
    const names = {
      venue: "venues",
      format: "formats",
      language: "languages",
      time: "bands",
    };
    const selectedVenues = state.options.venues.filter((venue) =>
      filters.venues.includes(venue.slug),
    );
    const formats = new Set(
      (selectedVenues.length
        ? selectedVenues.flatMap((venue) => venue.formats)
        : state.options.formats
      ).map((format) => format.slug),
    );
    filters.formats = filters.formats.filter((format) => formats.has(format));
    Object.entries(names).forEach(([name, key]) =>
      $$(`input[name="${name}"]`, panel).forEach((input) => {
        input.checked = filters[key].includes(input.value);
      }),
    );
    dayPicker($(".filter-days"), filters.date);
    $('.results-toolbar select[name="sort"]').value = filters.sort;
    $$("[data-format]", panel).forEach((label) => {
      label.hidden = !formats.has(label.dataset.format);
    });
    const count =
      filters.venues.length +
      filters.formats.length +
      filters.languages.length +
      filters.bands.length;
    $(".active-filter-count", panel).textContent =
      `${count} ${count === 1 ? "filter" : "filters"} active`;
  };
  const load = async (push = false) => {
    sync();
    if (push) history.pushState(null, "", filtersUrl(filters));
    controller?.abort();
    controller = new AbortController();
    $$(".session-movie, .content-state, .session-skeletons", results).forEach(
      (item) => item.remove(),
    );
    $(".pagination", results).insertAdjacentHTML(
      "beforebegin",
      sessionSkeletons(),
    );
    try {
      const response = await KinoApi.sessions(filters, controller.signal);
      renderSessionGroups(
        response.data || response,
        response.meta || { totalSessions: 0, currentPage: 1, lastPage: 1 },
      );
    } catch (error) {
      if (error.name === "AbortError") return;
      const target = $(".session-skeletons", results) || results;
      showFailure(target, error, () => load());
    }
  };
  try {
    state.options = await KinoApi.filterOptions();
    buildFilters(state.options);
    const valid = (values, options, key = "slug") =>
      values.filter((value) =>
        options.some((option) => String(option[key]) === value),
      );
    filters.venues = valid(filters.venues, state.options.venues);
    filters.formats = valid(filters.formats, state.options.formats);
    filters.languages = valid(filters.languages, state.options.languages);
    filters.bands = valid(filters.bands, state.options.timeBands, "id");
    filters.sort = state.options.sorts.some((sort) => sort.id === filters.sort)
      ? filters.sort
      : state.options.sorts[0]?.id || "";
    if (!sevenDays().some((day) => day.value === filters.date))
      filters.date = sevenDays()[0].value;
    sync();
  } catch (error) {
    showFailure(panel, error, () => location.reload());
    return;
  }
  panel.addEventListener("change", (event) => {
    if (!event.target.matches('input[type="checkbox"]')) return;
    const names = {
      venue: "venues",
      format: "formats",
      language: "languages",
      time: "bands",
    };
    filters[names[event.target.name]] = $$(
      `input[name="${event.target.name}"]:checked`,
      panel,
    ).map((input) => input.value);
    filters.page = 1;
    load(true);
  });
  $(".filter-days", panel).addEventListener("click", (event) => {
    const button = event.target.closest("button[data-date]");
    if (button) {
      filters.date = button.dataset.date;
      filters.page = 1;
      load(true);
    }
  });
  $(".clear-filters", panel).addEventListener("click", () => {
    filters = {
      ...filters,
      venues: [],
      formats: [],
      languages: [],
      bands: [],
      sort: state.options.sorts[0]?.id || "",
      page: 1,
    };
    load(true);
  });
  $('.results-toolbar select[name="sort"]').addEventListener(
    "change",
    (event) => {
      filters.sort = event.target.value;
      filters.page = 1;
      load(true);
    },
  );
  $(".pagination", results).addEventListener("click", (event) => {
    const link = event.target.closest("[data-page]");
    if (link) {
      event.preventDefault();
      filters.page = Number(link.dataset.page);
      load(true);
    }
  });
  window.addEventListener("popstate", () => {
    filters = filtersFromUrl();
    load();
  });
  await load();
}

/* Sessions Page End */

/* Movie Details Page Start */

function renderMovieSessions(groups, movie) {
  const container = $(".movie-sessions");
  $$(".venue-block, .content-state", container).forEach((item) =>
    item.remove(),
  );
  if (!groups.length) {
    container.insertAdjacentHTML(
      "beforeend",
      empty("No sessions on this date", "Choose another available date."),
    );
    return;
  }
  const ageBlocked =
    state.user?.age != null && state.user.age < movie.ageRating.minAge;
  groups.forEach(({ venue, sessions }) => {
    const halls = sessions.reduce(
      (all, session) => ((all[session.hall.name] ||= []).push(session), all),
      {},
    );
    container.insertAdjacentHTML(
      "beforeend",
      `<section class="venue-block"><h3>${escapeHtml(venue.name)}</h3><div class="hall-grid">${Object.entries(
        halls,
      )
        .map(
          ([hall, items]) =>
            `<div class="hall-card"><h4>Hall ${escapeHtml(hall)}</h4><div>${items
              .map((session) => {
                const disabled = session.isSoldOut || ageBlocked;
                return `<a href="${disabled ? "" : `booking.html?session=${session.id}&movie=${encodeURIComponent(movie.slug)}`}" class="${disabled ? "sold" : ""}" ${disabled ? 'aria-disabled="true"' : ""} ${ageBlocked ? `title="This film is rated ${escapeHtml(movie.ageRating.code)}. You cannot buy tickets for it with this account."` : ""}><strong>${escapeHtml(session.time)}</strong><span>${money(session.price)}</span><small>${escapeHtml(session.language.name)} · ${escapeHtml(session.format.name)}</small><em>${session.isSoldOut ? "Sold out" : `${session.seatsLeft} left`}</em></a>`;
              })
              .join("")}</div></div>`,
        )
        .join("")}</div></section>`,
    );
  });
}

async function setupMovie() {
  if (!$(".movie-page")) return;
  const slug = new URLSearchParams(location.search).get("movie");
  const container = $(".movie-sessions");
  let sessionsController;
  if (!slug) {
    showFailure(container, new Error("No film was selected."), () => {
      location.href = "index.html";
    });
    return;
  }
  const loadSessions = async (movie, date) => {
    sessionsController?.abort();
    sessionsController = new AbortController();
    $$(".venue-block, .content-state", container).forEach((item) =>
      item.remove(),
    );
    container.insertAdjacentHTML("beforeend", loading("Loading sessions"));
    try {
      const groups = await KinoApi.movieSessions(
        movie.slug,
        date,
        sessionsController.signal,
      );
      renderMovieSessions(groups, movie);
      $("#movie-sessions-title + p").textContent =
        `${groups.reduce((total, group) => total + group.sessions.length, 0)} sessions on ${dateText(date, { weekday: "long", day: "numeric", month: "long" })}`;
    } catch (error) {
      if (error.name === "AbortError") return;
      showFailure($(".content-state", container) || container, error, () =>
        loadSessions(movie, date),
      );
    }
  };
  const load = async () => {
    try {
      const movie = await KinoApi.movie(slug);
      document.title = `${movie.title} · KINO XII`;
      const recent = JSON.parse(
        localStorage.getItem("kinoRecentMovies") || "[]",
      );
      localStorage.setItem(
        "kinoRecentMovies",
        JSON.stringify(
          [movie.slug, ...recent.filter((item) => item !== movie.slug)].slice(
            0,
            6,
          ),
        ),
      );
      $(".movie-backdrop").src = movie.backdropUrl || movie.posterUrl || "";
      $(".movie-detail-poster").src = movie.posterUrl || "";
      $(".movie-detail-poster").alt = `${movie.title} poster`;
      $(".movie-status").textContent = movie.isComingSoon
        ? "COMING SOON"
        : "NOW PLAYING";
      $("#movie-title").textContent = movie.title.toUpperCase();
      $(".movie-description").textContent = movie.synopsis || "";
      $(".movie-detail-badges").innerHTML =
        `<li>${escapeHtml(movie.ageRating.code)}</li><li><img src="assets/icons/timer.svg" alt="" />${movie.runtimeMinutes} Min</li>${movie.formats
          .slice(0, 1)
          .map((format) => `<li>${escapeHtml(format.name)}</li>`)
          .join("")}`;
      const details = {
        director: movie.director || "—",
        cast: movie.cast || "—",
        duration: `${movie.runtimeMinutes} minutes`,
        genre: movie.genres?.map((genre) => genre.name).join(", ") || "—",
        "release-date": dateText(movie.releaseDate, {
          day: "numeric",
          month: "long",
          year: "numeric",
        }),
        formats: movie.formats.map((format) => format.name).join(", "),
        price: money(movie.fromPrice),
      };
      Object.entries(details).forEach(([key, value]) => {
        $(`[data-detail="${key}"]`).textContent = value;
      });
      $(".rating-note p").innerHTML =
        `<span>${escapeHtml(movie.ageRating.code)}</span> ${escapeHtml(movie.ageRating.description)}`;
      const selected = movie.availableDates?.[0] || sevenDays()[0].value;
      dayPicker($(".movie-days"), selected, movie.availableDates || []);
      $(".movie-days").addEventListener("click", (event) => {
        const button = event.target.closest("button[data-date]");
        if (!button || button.disabled) return;
        $$("button", event.currentTarget).forEach((item) => {
          item.classList.toggle("active", item === button);
          item.setAttribute("aria-pressed", String(item === button));
        });
        loadSessions(movie, button.dataset.date);
      });
      await loadSessions(movie, selected);
    } catch (error) {
      showFailure(container, error, load);
    }
  };
  await load();
}

/* Movie Details Page End */

/* Authentication Forms Start */

function setupAuthForm() {
  const form = $(".auth-form");
  if (!form) return;
  const signup = Boolean($(".signup-card"));
  const submit = $('[type="submit"]', form);
  const returnTo = safeReturnTo(
    new URLSearchParams(location.search).get("returnTo"),
    "index.html",
  );
  const switchLink = $(".auth-switch a");
  const touched = new WeakSet();
  if (new URLSearchParams(location.search).has("returnTo") && switchLink)
    switchLink.href += `?returnTo=${encodeURIComponent(returnTo)}`;
  $(".modal-close")?.setAttribute("href", authCloseTarget());
  const valid = (input) =>
    input.name === "email"
      ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim())
      : input.name === "password_confirmation"
        ? input.value.length >= 3 &&
          input.value === form.elements.password.value
        : input.value.length >= 3;
  const update = (force = false) => {
    const inputs = $$("input[required]", form);
    inputs.forEach((input) =>
      setField(input, !force && !touched.has(input) ? null : valid(input)),
    );
    submit.disabled = !inputs.every((input) => input.value && valid(input));
    return !submit.disabled;
  };
  form.addEventListener("input", (event) => {
    if (
      event.target === form.elements.password &&
      touched.has(form.elements.password_confirmation)
    )
      touched.add(form.elements.password_confirmation);
    update();
  });
  form.addEventListener("focusout", (event) => {
    if (event.target.matches("input[required]")) {
      touched.add(event.target);
      update();
    }
  });
  form.elements.avatar?.addEventListener("change", () => {
    const file = form.elements.avatar.files[0];
    const preview = $(".avatar-preview");
    if (!file) return;
    if (
      !/^image\/(jpeg|png|webp)$/.test(file.type) ||
      file.size > 2 * 1024 * 1024
    ) {
      formError(form, "Avatar must be a JPG, PNG or WEBP image under 2MB.");
      form.elements.avatar.value = "";
      return;
    }
    clearFormError(form);
    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!update(true)) return;
    setBusy(submit, true, signup ? "Signing up…" : "Logging in…");
    $(".form-api-error", form)?.remove();
    try {
      state.user = signup
        ? await KinoApi.register({
            username: form.elements.username.value.trim(),
            email: form.elements.email.value.trim(),
            password: form.elements.password.value,
            password_confirmation: form.elements.password_confirmation.value,
            avatar: form.elements.avatar?.files[0],
          })
        : await KinoApi.login(
            form.elements.email.value.trim(),
            form.elements.password.value,
          );
      const protectedBooking =
        signup &&
        !state.user.profileComplete &&
        /^booking\.html(?:[?#]|$)/.test(returnTo);
      location.href = protectedBooking
        ? `profile.html?returnTo=${encodeURIComponent(returnTo)}`
        : returnTo;
    } catch (error) {
      setBusy(submit, false);
      const wrongPassword =
        !signup &&
        (error.status === 401 ||
          /invalid credentials/i.test(error.message || ""));
      if (wrongPassword) {
        $(".form-api-error", form)?.remove();
        touched.add(form.elements.password);
        setField(form.elements.password, false, "Wrong password");
        return;
      }
      update();
      fieldErrors(form, error.errors);
      formError(form, error.message);
    }
  });
  update();
}

/* Authentication Forms End */

/* Booking Flow Start */

function drawSeats(map) {
  const root = $(".seat-map");
  root.innerHTML = map.sections
    .map((section, sectionIndex) => {
      const width = Math.max(
        ...section.rows.map(
          (row) =>
            row.seats.length +
            row.seats.filter((seat) => seat.aisleAfter).length,
        ),
      );
      const labels = section.rows.map((row) => row.label);
      const rows = section.rows
        .map((row) => {
          let used = 0;
          const seats = row.seats
            .map((seat) => {
              if (seat.state === "unavailable") {
                used += 1;
                return '<i class="seat-space"></i>';
              }
              used += 1 + Number(seat.aisleAfter);
              const status = seat.isMine
                ? "selected"
                : seat.state === "available"
                  ? ""
                  : seat.state;
              return `<button type="button" class="${status}" data-id="${seat.id}" data-code="${escapeHtml(seat.code)}" aria-label="Seat ${escapeHtml(seat.code)}${status ? `, ${status}` : ""}" aria-pressed="${seat.isMine}" ${["sold", "held"].includes(status) ? "disabled" : ""}>${escapeHtml(seat.label)}</button>${seat.aisleAfter ? '<i class="seat-aisle"></i>' : ""}`;
            })
            .join("");
          return `<span>${escapeHtml(row.label)}</span>${seats}${'<i class="seat-space"></i>'.repeat(width - used)}`;
        })
        .join("");
      return `<section class="seat-section" style="--seat-columns:${width};--seat-size:${width > 11 ? 38 : 52}px;--seat-gap:${width > 11 ? 7 : 10}px">${sectionIndex ? `<h3>${escapeHtml(section.name.toUpperCase())} · ROWS ${escapeHtml(labels[0])}–${escapeHtml(labels.at(-1))}</h3>` : ""}<div class="seat-grid">${rows}</div></section>`;
    })
    .join("");
  const first = map.sections[0];
  const labels = first?.rows.map((row) => row.label) || [];
  $(".seat-map-title").textContent = first
    ? `${first.name.toUpperCase()} · ROWS ${labels[0]}–${labels.at(-1)}`
    : "";
}

async function setupBooking() {
  if (!document.body.classList.contains("booking-page")) return;
  const target = pageReturnTo();
  if (!(await requireUser(true, target))) return;
  const id = new URLSearchParams(location.search).get("session");
  const modal = $(".booking-modal");
  if (!id) {
    modal.innerHTML = failure(new Error("No session was selected."));
    return;
  }
  const holdKey = `kinoHold:${id}`;
  let session;
  let map;
  let hold;
  let timer;
  let picked = new Map();
  let types;
  let max;
  $(".seat-map").innerHTML = loading("Loading seats");
  const price = (slug) =>
    session.price *
    Number(types.find((type) => type.slug === slug)?.priceRatio || 1);
  const allowed = (type) =>
    !type.blockedFromRatingAge ||
    session.movie.ageRating.minAge < type.blockedFromRatingAge;
  const render = () => {
    $(".selected-seats").innerHTML = [...picked.values()]
      .map(
        (seat) =>
          `<article data-id="${seat.id}"><p>Seat <strong>${escapeHtml(seat.code)}</strong><b>${money(price(seat.type))}</b><button class="seat-remove" type="button" aria-label="Remove seat ${escapeHtml(seat.code)}"><img src="assets/icons/close.svg" alt="" /></button></p><div>${types
            .filter(allowed)
            .map(
              (type) =>
                `<button type="button" data-type="${type.slug}" class="${type.slug === seat.type ? "active" : ""}">${escapeHtml(type.name)} ${Math.round(type.priceRatio * 100)}%</button>`,
            )
            .join("")}</div></article>`,
      )
      .join("");
    $(".seats-summary h2").textContent = `Your seats · Max ${max}`;
    $(".seats-summary .booking-total strong").textContent = money(
      [...picked.values()].reduce((sum, seat) => sum + price(seat.type), 0),
    );
    const next = $(".seats-summary .booking-next");
    next.classList.toggle("disabled", !picked.size);
    next.setAttribute("aria-disabled", String(!picked.size));
    $$(".seat-map button").forEach((button) => {
      const active = picked.has(Number(button.dataset.id));
      button.classList.toggle("selected", active);
      button.setAttribute("aria-pressed", String(active));
    });
  };
  const reloadSeats = async ({ preserve = false, contested = [] } = {}) => {
    const blocked = new Set(
      contested
        .flatMap((seat) => [seat, seat?.id, seat?.seatId, seat?.code])
        .filter((value) => value !== undefined)
        .map(String),
    );
    const previous = preserve
      ? [...picked.values()].filter(
          (seat) =>
            !blocked.has(String(seat.id)) && !blocked.has(String(seat.code)),
        )
      : [];
    map = await KinoApi.seats(id);
    drawSeats(map);
    const available = new Map(
      map.sections
        .flatMap((section) => section.rows)
        .flatMap((row) => row.seats)
        .filter((seat) => seat.state === "available" || seat.isMine)
        .flatMap((seat) => [
          [String(seat.id), seat],
          [String(seat.code), seat],
        ]),
    );
    picked = new Map(
      previous
        .map(
          (seat) =>
            available.get(String(seat.id)) || available.get(String(seat.code)),
        )
        .filter(Boolean)
        .map((seat) => [
          Number(seat.id),
          {
            id: Number(seat.id),
            code: seat.code,
            type:
              previous.find(
                (item) =>
                  String(item.id) === String(seat.id) ||
                  item.code === seat.code,
              )?.type || "adult",
          },
        ]),
    );
    render();
  };
  const showHold = (value) => {
    hold = value;
    sessionStorage.setItem(holdKey, value.holdId);
    startTimer(value.expiresAt);
    $(".checkout-summary .booking-total strong").textContent = money(
      value.subtotal,
    );
    const rows = $$(".checkout-summary article > p");
    rows[1].querySelector("strong").textContent = value.seats
      .map((seat) => seat.code)
      .join(", ");
    rows[2].querySelector("strong").textContent = value.seats
      .map((seat) => seat.ticketType.name)
      .join(", ");
  };
  const startTimer = (expiresAt) => {
    clearInterval(timer);
    $(".seat-timer").hidden = false;
    const tick = async () => {
      const seconds = Math.max(
        0,
        Math.ceil((new Date(expiresAt) - Date.now()) / 1000),
      );
      $(".seat-timer strong").textContent =
        `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
      if (!seconds) {
        clearInterval(timer);
        hold = null;
        sessionStorage.removeItem(holdKey);
        location.hash = "seats";
        await reloadSeats();
        formError(
          $(".seats-summary"),
          "Your hold time expired. Please re-select your seats.",
        );
      }
    };
    tick();
    timer = setInterval(tick, 1000);
  };
  try {
    [session, map, state.options] = await Promise.all([
      KinoApi.session(id),
      KinoApi.seats(id),
      KinoApi.filterOptions(),
    ]);
    types = state.options.ticketTypes;
    max = state.options.maxSeatsPerOrder;
    if (
      state.user.age != null &&
      state.user.age < session.movie.ageRating.minAge
    ) {
      modal.innerHTML = `<article class="content-state error-state booking-rule-state"><span class="state-icon" aria-hidden="true">!</span><h2>Age restriction</h2><p>This film is rated ${escapeHtml(session.movie.ageRating.code)}. You cannot buy tickets for it with this account.</p><a href="movie.html?movie=${encodeURIComponent(session.movie.slug)}">Back to film</a></article>`;
      return;
    }
    drawSeats(map);
    const defaultType =
      types.find((type) => type.slug === "adult")?.slug || types[0]?.slug;
    map.sections
      .flatMap((section) => section.rows)
      .flatMap((row) => row.seats)
      .filter((seat) => seat.isMine)
      .forEach((seat) =>
        picked.set(Number(seat.id), {
          id: Number(seat.id),
          code: seat.code,
          type: defaultType,
        }),
      );
    document.title = `${session.movie.title} tickets · KINO XII`;
    $("#booking-title").textContent = session.movie.title.toUpperCase();
    $(".booking-session-meta").textContent =
      `${session.venue.name} · Hall ${session.hall.name} · ${dateText(session.date, { weekday: "long", day: "numeric", month: "long" })} · ${session.time} · ${session.format.name} · ${session.language.name}`;
    $(".checkout-summary h3").textContent = session.movie.title.toUpperCase();
    $(".checkout-summary article > p").textContent =
      `Hall ${session.hall.name} · ${dateText(session.date)} · ${session.time}`;
    $(".booking-close").href =
      `movie.html?movie=${encodeURIComponent(session.movie.slug)}`;
    $(".booking-background").src = $(".booking-close").href;
    render();
    const savedHold = sessionStorage.getItem(holdKey);
    if (savedHold) {
      try {
        const currentHold = await KinoApi.hold(savedHold);
        if (currentHold.isLive) {
          picked = new Map(
            currentHold.seats.map((seat) => [
              Number(seat.seatId),
              {
                id: Number(seat.seatId),
                code: seat.code,
                type: seat.ticketType.slug,
              },
            ]),
          );
          render();
          showHold(currentHold);
        } else sessionStorage.removeItem(holdKey);
      } catch (_) {
        sessionStorage.removeItem(holdKey);
      }
    }
  } catch (error) {
    showFailure(modal, error, () => location.reload());
    return;
  }
  $(".seat-map").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-id]");
    if (!button || button.disabled) return;
    const seatId = Number(button.dataset.id);
    if (picked.has(seatId)) {
      picked.delete(seatId);
      clearFormError($(".seats-summary"));
    } else if (picked.size < max) {
      picked.set(seatId, {
        id: seatId,
        code: button.dataset.code,
        type:
          types.find((type) => type.slug === "adult")?.slug || types[0]?.slug,
      });
      clearFormError($(".seats-summary"));
    } else {
      formError(
        $(".seats-summary"),
        `You can select up to ${max} seats per order.`,
      );
    }
    render();
  });
  $(".selected-seats").addEventListener("click", (event) => {
    const article = event.target.closest("article[data-id]");
    if (!article) return;
    const seat = picked.get(Number(article.dataset.id));
    if (!seat) return;
    if (event.target.closest(".seat-remove")) picked.delete(seat.id);
    else if (event.target.closest("[data-type]"))
      seat.type = event.target.closest("[data-type]").dataset.type;
    clearFormError($(".seats-summary"));
    render();
  });
  $(".seats-summary .booking-next").addEventListener("click", async (event) => {
    event.preventDefault();
    if (!picked.size || event.currentTarget.classList.contains("is-busy"))
      return;
    event.currentTarget.classList.add("disabled", "is-busy");
    event.currentTarget.setAttribute("aria-busy", "true");
    clearFormError($(".seats-summary"));
    try {
      showHold(
        await KinoApi.holdSeats(
          id,
          [...picked.values()].map((seat) => ({
            seatId: seat.id,
            ticketType: seat.type,
          })),
        ),
      );
      location.hash = "checkout";
    } catch (error) {
      if (error.status === 401) return redirectLogin(target);
      if (error.status === 409)
        await reloadSeats({ preserve: true, contested: error.contested });
      if (error.status === 422 && /profile/i.test(error.message || "")) {
        sessionStorage.setItem("kinoProfileNotice", error.message);
        location.href = `profile.html?returnTo=${encodeURIComponent(target)}`;
        return;
      }
      const contested = error.contested?.length
        ? ` Lost seats: ${error.contested.join(", ")}.`
        : "";
      formError($(".seats-summary"), `${error.message}${contested}`);
    } finally {
      event.currentTarget.classList.remove("disabled", "is-busy");
      event.currentTarget.removeAttribute("aria-busy");
    }
  });
  const form = $(".checkout-form");
  const pay = $(".checkout-summary .booking-next");
  form.elements.full_name.value = state.user.fullName || "";
  form.elements.email.value = state.user.email;
  form.elements.mobile.value = state.user.mobileNumber || "";
  const expiryState = (value) => {
    if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(value))
      return { valid: false, message: "Use MM/YY format." };
    const [month, year] = value.split("/").map(Number);
    const valid = new Date(2000 + year, month) > new Date();
    return {
      valid,
      message: valid ? "" : "Card has expired.",
    };
  };
  const validate = (force = false) => {
    const expiry = expiryState(form.elements.expiry.value);
    const checks = {
      full_name: form.elements.full_name.value.trim().length >= 3,
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.elements.email.value),
      mobile: /^5\d{8}$/.test(form.elements.mobile.value.replace(/\s/g, "")),
      card_number: /^\d{16}$/.test(
        form.elements.card_number.value.replace(/\s/g, ""),
      ),
      expiry: expiry.valid,
      cvv: /^\d{3}$/.test(form.elements.cvv.value),
    };
    Object.entries(checks).forEach(([name, ok]) =>
      setField(
        form.elements[name],
        form.elements[name].value || force ? ok : null,
        name === "expiry" && !ok ? expiry.message : undefined,
      ),
    );
    pay.disabled = !hold || !Object.values(checks).every(Boolean);
    return !pay.disabled;
  };
  form.addEventListener("input", (event) => {
    clearFormError(form);
    const input = event.target;
    if (input.name === "mobile")
      input.value = input.value
        .replace(/\D/g, "")
        .slice(0, 9)
        .replace(/(\d{3})(?=\d)/g, "$1 ");
    if (input.name === "card_number")
      input.value = input.value
        .replace(/\D/g, "")
        .slice(0, 16)
        .replace(/(\d{4})(?=\d)/g, "$1 ");
    if (input.name === "expiry")
      input.value = input.value
        .replace(/\D/g, "")
        .slice(0, 4)
        .replace(/(\d{2})(?=\d)/, "$1/");
    if (input.name === "cvv")
      input.value = input.value.replace(/\D/g, "").slice(0, 3);
    validate();
  });
  pay.addEventListener("click", async () => {
    if (!validate(true)) return;
    clearFormError(form);
    setBusy(pay, true, "Completing order…");
    try {
      const order = await KinoApi.createOrder({
        holdId: hold.holdId,
        fullName: form.elements.full_name.value.trim(),
        email: form.elements.email.value.trim(),
        mobileNumber: form.elements.mobile.value,
        cardNumber: form.elements.card_number.value,
        expiry: form.elements.expiry.value,
        cvv: form.elements.cvv.value,
      });
      clearInterval(timer);
      sessionStorage.removeItem(holdKey);
      const confirmed = $(".booking-confirmed");
      $(".order-number", confirmed).textContent = `ORDER #${order.reference}`;
      $("img", confirmed).src = order.session.movie.posterUrl || "";
      $("img", confirmed).alt = `${order.session.movie.title} poster`;
      $("article b", confirmed).textContent =
        order.session.movie.title.toUpperCase();
      $("article small", confirmed).textContent =
        `${dateText(order.session.date)} · ${order.session.time} · ${order.session.venue.name}`;
      const rows = $$("article > p", confirmed);
      rows[0].querySelector("strong").textContent = order.tickets
        .map((ticket) => ticket.seatCode)
        .join(", ");
      rows[1].querySelector("strong").textContent = order.tickets
        .map((ticket) => ticket.ticketType.name)
        .join(", ");
      rows[2].querySelector("strong").textContent = money(order.totalPrice);
      hold = null;
      location.hash = "confirmed";
    } catch (error) {
      if (error.status === 401) return redirectLogin(target);
      setBusy(pay, false);
      if (error.status === 409) {
        hold = null;
        sessionStorage.removeItem(holdKey);
        location.hash = "seats";
        await reloadSeats({ preserve: true, contested: error.contested });
        const contested = error.contested?.length
          ? ` Lost seats: ${error.contested.join(", ")}.`
          : "";
        formError($(".seats-summary"), `${error.message}${contested}`);
      } else if (
        error.status === 422 &&
        !Object.keys(error.errors || {}).length
      ) {
        hold = null;
        sessionStorage.removeItem(holdKey);
        location.hash = "seats";
        await reloadSeats();
        formError($(".seats-summary"), error.message);
      } else {
        validate();
        fieldErrors(form, error.errors);
        formError(form, error.message);
      }
    }
  });
  const closeBooking = async (event) => {
    event?.preventDefault();
    clearInterval(timer);
    if (hold?.holdId) {
      try {
        await KinoApi.releaseHold(hold.holdId);
      } catch (_) {}
    }
    sessionStorage.removeItem(holdKey);
    location.href = $(".booking-close").href;
  };
  $(".booking-close").addEventListener("click", closeBooking);
  $(".booking-layer").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeBooking(event);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeBooking(event);
  });
  validate();
}

/* Booking Flow End */

/* Date Picker Start */

function setupDatePicker(form) {
  const input = form.elements.birth_date;
  const shell = input?.closest(".date-field-shell");
  if (!input || !shell) return;
  const trigger = $(".date-picker-trigger", shell);
  const value = $(".date-picker-value", shell);
  const popup = $(".date-picker", shell);
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const maximum = new Date();
  maximum.setHours(12, 0, 0, 0);
  maximum.setFullYear(maximum.getFullYear() - 12);
  const minimum = new Date(1900, 0, 1, 12);
  const parse = (raw) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    return match
      ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12)
      : null;
  };
  const iso = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const display = (raw) => {
    const date = parse(raw);
    return date
      ? `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}/${date.getFullYear()}`
      : "MM/DD/YYYY";
  };
  let view = parse(input.value) || maximum;
  let calendarView = "days";

  const sync = () => {
    value.textContent = display(input.value);
    value.classList.toggle("is-placeholder", !input.value);
  };
  const close = () => {
    popup.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  };
  const renderDays = () => {
    const year = view.getFullYear();
    const month = view.getMonth();
    const selected = parse(input.value);
    const first = new Date(year, month, 1, 12);
    const start = new Date(year, month, 1 - first.getDay(), 12);
    const previousDisabled =
      year === minimum.getFullYear() && month === minimum.getMonth();
    const nextDisabled =
      year === maximum.getFullYear() && month === maximum.getMonth();
    const days = Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const dateValue = iso(date);
      const outside = date.getMonth() !== month;
      const disabled = date < minimum || date > maximum;
      const chosen = selected && iso(selected) === dateValue;
      return `<button class="calendar-day${outside ? " is-outside" : ""}${chosen ? " is-selected" : ""}" type="button" data-date="${dateValue}" ${disabled ? "disabled" : ""} aria-label="${monthNames[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}" ${chosen ? 'aria-current="date"' : ""}>${date.getDate()}</button>`;
    }).join("");
    popup.innerHTML = `<div class="date-picker-header"><button class="date-picker-nav" type="button" data-calendar-action="previous" ${previousDisabled ? "disabled" : ""} aria-label="Previous month">‹</button><button class="date-picker-heading" type="button" data-calendar-action="years" aria-label="Choose year">${monthNames[month]} ${year}</button><button class="date-picker-nav" type="button" data-calendar-action="next" ${nextDisabled ? "disabled" : ""} aria-label="Next month">›</button></div><div class="date-picker-weekdays" aria-hidden="true"><span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span></div><div class="date-picker-days">${days}</div><div class="date-picker-footer"><button class="date-picker-action" type="button" data-calendar-action="clear">Clear</button><button class="date-picker-action" type="button" data-calendar-action="latest">Latest eligible date</button></div>`;
  };
  const renderYears = () => {
    const minimumYear = minimum.getFullYear();
    const maximumYear = maximum.getFullYear();
    const rangeStart = Math.floor(view.getFullYear() / 12) * 12;
    const rangeEnd = rangeStart + 11;
    const years = Array.from({ length: 12 }, (_, index) => {
      const year = rangeStart + index;
      const disabled = year < minimumYear || year > maximumYear;
      const selected = year === view.getFullYear();
      return `<button class="calendar-year${selected ? " is-selected" : ""}" type="button" data-year="${year}" ${disabled ? "disabled" : ""} ${selected ? 'aria-current="true"' : ""}>${year}</button>`;
    }).join("");
    popup.innerHTML = `<div class="date-picker-header"><button class="date-picker-nav" type="button" data-calendar-action="previous" ${rangeStart <= minimumYear ? "disabled" : ""} aria-label="Previous years">‹</button><strong class="date-picker-heading is-static">${rangeStart}–${rangeEnd}</strong><button class="date-picker-nav" type="button" data-calendar-action="next" ${rangeEnd >= maximumYear ? "disabled" : ""} aria-label="Next years">›</button></div><div class="date-picker-years">${years}</div>`;
  };
  const render = () => {
    if (calendarView === "years") return renderYears();
    renderDays();
  };
  const choose = (raw) => {
    input.value = raw;
    sync();
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    close();
  };

  sync();
  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!popup.hidden) return close();
    view = parse(input.value) || maximum;
    calendarView = "days";
    render();
    popup.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
  });
  popup.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const day = event.target.closest("[data-date]");
    if (day) return choose(day.dataset.date);
    const yearButton = event.target.closest("[data-year]");
    if (yearButton) {
      const selectedYear = Number(yearButton.dataset.year);
      const selectedMonth =
        selectedYear === maximum.getFullYear()
          ? Math.min(view.getMonth(), maximum.getMonth())
          : view.getMonth();
      view = new Date(selectedYear, selectedMonth, 1, 12);
      calendarView = "days";
      return render();
    }
    const action = event.target.closest("[data-calendar-action]")?.dataset
      .calendarAction;
    if (action === "clear") return choose("");
    if (action === "latest") return choose(iso(maximum));
    if (action === "years") {
      calendarView = "years";
      return render();
    }
    if (action === "previous") {
      view =
        calendarView === "years"
          ? new Date(view.getFullYear() - 12, view.getMonth(), 1, 12)
          : new Date(view.getFullYear(), view.getMonth() - 1, 1, 12);
    }
    if (action === "next") {
      view =
        calendarView === "years"
          ? new Date(view.getFullYear() + 12, view.getMonth(), 1, 12)
          : new Date(view.getFullYear(), view.getMonth() + 1, 1, 12);
    }
    if (action === "previous" || action === "next") render();
  });
  input.addEventListener("input", sync);
  document.addEventListener("click", (event) => {
    if (!shell.contains(event.target)) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !popup.hidden) {
      close();
      trigger.focus();
    }
  });
}

/* Date Picker End */

/* Profile Page Start */

async function setupProfile() {
  const form = $(".profile-form");
  if (!form || !(await requireUser())) return;
  const completionAlert = $(".profile-completion-alert");
  const notice = sessionStorage.getItem("kinoProfileNotice");
  sessionStorage.removeItem("kinoProfileNotice");
  completionAlert.hidden = state.user.profileComplete && !notice;
  completionAlert.textContent =
    notice || "Please complete your profile to enable booking.";
  form.classList.add("is-loading");
  form.setAttribute("aria-busy", "true");
  let loadFailed = false;
  try {
    state.options ||= await KinoApi.filterOptions();
    form.elements.full_name.value = state.user.fullName || "";
    form.elements.email.value = state.user.email;
    form.elements.mobile.value = state.user.mobileNumber || "";
    form.elements.birth_date.value = state.user.dateOfBirth || "";
    form.elements.venue.innerHTML = `<option value="">e.g. Text</option>${state.options.venues.map((venue) => `<option value="${venue.id}" ${state.user.preferredVenue?.id === venue.id ? "selected" : ""}>${escapeHtml(venue.name)}</option>`).join("")}`;
    const [future, history] = await Promise.all([
      KinoApi.tickets("upcoming"),
      KinoApi.tickets("past"),
    ]);
    $('.profile-tabs a[href="tickets.html"] span').textContent = String(
      future.length + history.length,
    );
  } catch (error) {
    if (error.status === 401) return redirectLogin();
    loadFailed = true;
    formError(form, error.message, () => location.reload());
  } finally {
    form.classList.remove("is-loading");
    form.removeAttribute("aria-busy");
  }
  if (loadFailed) return;
  setupDatePicker(form);
  const submit = $('[type="submit"]', form);
  let baseline = Object.fromEntries(new FormData(form));
  const validAge = (value) => {
    if (!value) return false;
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 12);
    return new Date(`${value}T12:00:00`) <= cutoff;
  };
  const validate = (force = false) => {
    const name = form.elements.full_name.value.trim();
    const mobile = form.elements.mobile.value.replace(/\s/g, "");
    const birth = form.elements.birth_date.value;
    const checks = {
      full_name: name.length >= 3 && name.length <= 50,
      mobile: /^5\d{8}$/.test(mobile),
      birth_date: validAge(birth),
    };
    const messages = {
      full_name: !name
        ? "Name is required"
        : name.length < 3
          ? "Name must be at least 3 characters"
          : name.length > 50
            ? "Name must not exceed 50 characters"
            : "",
      mobile: !mobile
        ? "Mobile number is required"
        : !mobile.startsWith("5")
          ? "Georgian mobile numbers must start with 5"
          : mobile.length !== 9
            ? "Mobile number must be exactly 9 digits"
            : "Please enter a valid Georgian mobile number (9 digits starting with 5)",
      birth_date: !birth
        ? "Date of birth is required"
        : !validAge(birth)
          ? "You must be at least 12 years old to create an account"
          : "Please enter a valid date of birth",
    };
    Object.entries(checks).forEach(([fieldName, ok]) =>
      setField(
        form.elements[fieldName],
        form.elements[fieldName].value || force ? ok : null,
        messages[fieldName],
      ),
    );
    const changed = Object.entries(baseline).some(
      ([fieldName, value]) => form.elements[fieldName].value !== value,
    );
    submit.disabled = !changed || !Object.values(checks).every(Boolean);
    return !submit.disabled;
  };
  form.addEventListener("input", (event) => {
    clearFormError(form);
    if (event.target.name === "mobile")
      event.target.value = event.target.value
        .replace(/\D/g, "")
        .slice(0, 9)
        .replace(/(\d{3})(?=\d)/g, "$1 ");
    validate();
  });
  form.addEventListener("change", () => {
    clearFormError(form);
    validate();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!validate(true)) return;
    clearFormError(form);
    setBusy(submit, true, "Saving…");
    try {
      state.user = await KinoApi.updateProfile({
        fullName: form.elements.full_name.value.trim(),
        mobileNumber: form.elements.mobile.value,
        dateOfBirth: form.elements.birth_date.value,
        preferredVenueId: form.elements.venue.value || null,
      });
      baseline = Object.fromEntries(new FormData(form));
      completionAlert.hidden = state.user.profileComplete;
      renderAuthHeader();
      submit.dataset.idle = "Saved";
      setBusy(submit, false);
      submit.disabled = true;
      const next = safeReturnTo(
        new URLSearchParams(location.search).get("returnTo"),
        "",
      );
      if (next) location.href = next;
    } catch (error) {
      if (error.status === 401) return redirectLogin();
      setBusy(submit, false);
      validate();
      fieldErrors(form, error.errors);
      formError(form, error.message);
    }
  });
  validate();
}

/* Profile Page End */

/* Tickets Page Start */

function ticketCard(order, upcoming) {
  const session = order.session;
  const movie = session.movie;
  return `<article class="profile-ticket" data-order="${escapeHtml(order.reference)}"><img src="${escapeHtml(movie.posterUrl || "")}" alt="${escapeHtml(movie.title)} poster" /><div class="ticket-film"><h2>${escapeHtml(movie.title.toUpperCase())} <span>${escapeHtml(movie.ageRating.code)}</span><small>${movie.runtimeMinutes} min</small></h2><dl><div><dt>Date</dt><dd>${escapeHtml(dateText(session.date))} · ${escapeHtml(session.time)}</dd></div><div><dt>Venue</dt><dd>${escapeHtml(session.venue.name)} · Hall ${escapeHtml(session.hall.name)}</dd></div><div><dt>Format</dt><dd>${escapeHtml(session.format.name)} · ${escapeHtml(session.language.name)}</dd></div></dl><p><b>Seats</b>${order.tickets.map((ticket) => `<span>${escapeHtml(ticket.seatCode)} · ${escapeHtml(ticket.ticketType.name)}</span>`).join("")}</p></div><aside><small>Order</small><strong>#${escapeHtml(order.reference)}</strong><p>Total paid <b>${money(order.totalPrice)}</b></p>${upcoming ? `<button type="button" ${order.isRefundable ? "" : "disabled"}>Refund</button><small>${order.isRefundable ? "Refund available until two hours before the session" : "Refund period has ended"}</small>` : ""}</aside></article>`;
}

async function setupTickets() {
  const shell = $(".tickets-shell");
  if (!shell || !(await requireUser())) return;
  const upcoming = $("#upcoming");
  const past = $("#past");
  const load = async () => {
    upcoming.innerHTML = loading("Loading tickets");
    past.innerHTML = loading("Loading tickets");
    try {
      const [future, history] = await Promise.all([
        KinoApi.tickets("upcoming"),
        KinoApi.tickets("past"),
      ]);
      upcoming.innerHTML = future.length
        ? future.map((order) => ticketCard(order, true)).join("")
        : empty("No upcoming tickets", "Your next booking will appear here.");
      past.innerHTML = history.length
        ? history.map((order) => ticketCard(order, false)).join("")
        : empty(
            "No past tickets",
            "Completed and refunded bookings will appear here.",
          );
      $(".profile-tabs a.active span").textContent = String(
        future.length + history.length,
      );
      $(".upcoming-tab span").textContent = String(future.length);
      $(".past-tab span").textContent = String(history.length);
    } catch (error) {
      if (error.status === 401) return redirectLogin();
      showFailure(upcoming, error, load);
      past.innerHTML = "";
    }
  };
  shell.addEventListener("click", async (event) => {
    const tab = event.target.closest(".ticket-period a");
    if (tab) {
      event.preventDefault();
      $$(".ticket-period a").forEach((link) =>
        link.classList.toggle("active", link === tab),
      );
      upcoming.hidden = tab.hash !== "#upcoming";
      past.hidden = tab.hash !== "#past";
      return;
    }
    const button = event.target.closest(
      ".profile-ticket button:not(:disabled)",
    );
    if (!button) return;
    const card = button.closest("[data-order]");
    if (!confirm(`Refund order #${card.dataset.order}? This cannot be undone.`))
      return;
    setBusy(button, true, "Refunding…");
    try {
      await KinoApi.refund(card.dataset.order);
      await load();
    } catch (error) {
      if (error.status === 401) return redirectLogin();
      button.insertAdjacentHTML(
        "afterend",
        `<small class="form-api-error">${escapeHtml(error.message)}</small>`,
      );
      setBusy(button, false);
    }
  });
  past.hidden = true;
  await load();
}

/* Tickets Page End */

/* Shared Page Controls Start */

function setupClosing() {
  const fallback = authCloseTarget();
  const close = () => {
    sessionStorage.removeItem("kinoPendingAction");
    location.href = fallback;
  };
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.classList.contains("auth-page"))
      close();
  });
  $(".modal-layer")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) close();
  });
  $(".modal-close")?.addEventListener("click", () =>
    sessionStorage.removeItem("kinoPendingAction"),
  );
}

function prepareAuthLinks() {
  if (document.body.classList.contains("auth-page")) return;
  $$(".page-auth-link").forEach((link) => {
    const url = new URL(link.href);
    url.searchParams.set("returnTo", pageReturnTo());
    link.href = `${url.pathname.split("/").pop()}?${url.searchParams}`;
  });
}

function guardLinks() {
  $$(
    'a[href="profile.html"], a[href="tickets.html"], a[href*="booking.html"]',
  ).forEach((link) =>
    link.addEventListener("click", async (event) => {
      const booking = link.href.includes("booking.html");
      if (state.user && (!booking || state.user.profileComplete)) return;
      event.preventDefault();
      const url = new URL(link.href);
      await requireUser(
        booking,
        `${url.pathname.split("/").pop()}${url.search}`,
      );
    }),
  );
}

/* Shared Page Controls End */

/* Application Initialization Start */

async function init() {
  setupClosing();
  setupAuthForm();
  setupSearch();
  prepareAuthLinks();
  const [authResult, optionsResult] = await Promise.allSettled([
    restoreUser(),
    KinoApi.filterOptions(),
  ]);
  if (authResult.status === "rejected")
    showGlobalFailure(authResult.reason.message);
  if (optionsResult.status === "fulfilled") state.options = optionsResult.value;
  renderAuthHeader();
  guardLinks();
  await Promise.all([
    setupHome(),
    setupSessions(),
    setupMovie(),
    setupBooking(),
    setupProfile(),
    setupTickets(),
  ]);
  await resumePendingAction();
}

init();

/* Application Initialization End */

/* Main Script End */
