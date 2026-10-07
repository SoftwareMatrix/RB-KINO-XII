/* API Client Start */

const KinoApi = (() => {
  /* API Configuration Start */

  const BASE_URL = "https://api.kinoxii.redberryinternship.ge/api";
  const TOKEN_KEY = "kinoAuthToken";
  let filterOptionsPromise;

  /* API Configuration End */

  /* API Error Handling Start */

  class ApiError extends Error {
    constructor(status, payload = {}) {
      super(payload.message || "Something went wrong. Please try again.");
      this.name = "ApiError";
      this.status = status;
      this.errors = payload.errors || {};
      this.contested = payload.contested || [];
      this.payload = payload;
    }
  }

  /* API Error Handling End */

  /* Token Management Start */

  const token = () => localStorage.getItem(TOKEN_KEY);
  const setToken = (value) =>
    value
      ? localStorage.setItem(TOKEN_KEY, value)
      : localStorage.removeItem(TOKEN_KEY);

  /* Token Management End */

  /* Request Handler Start */

  async function request(path, options = {}) {
    const {
      method = "GET",
      body,
      auth = false,
      headers = {},
      signal,
      unwrap = true,
    } = options;
    const requestHeaders = { Accept: "application/json", ...headers };
    const accessToken = token();

    if (auth && accessToken)
      requestHeaders.Authorization = `Bearer ${accessToken}`;
    if (body && !(body instanceof FormData))
      requestHeaders["Content-Type"] = "application/json";

    let response;
    try {
      response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: requestHeaders,
        body:
          body instanceof FormData
            ? body
            : body
              ? JSON.stringify(body)
              : undefined,
        signal,
      });
    } catch (error) {
      if (error.name === "AbortError") throw error;
      throw new ApiError(0, {
        message:
          "Unable to reach Kino XII. Check your connection and try again.",
      });
    }

    const payload =
      response.status === 204 ? null : await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401 && auth) setToken(null);
      throw new ApiError(response.status, payload || {});
    }

    return unwrap ? (payload?.data ?? payload) : payload;
  }

  /* Request Handler End */

  /* Request Helpers Start */

  const formData = (values) => {
    const data = new FormData();
    Object.entries(values).forEach(([key, value]) => {
      if (value !== undefined) data.append(key, value ?? "");
    });
    return data;
  };
  const query = (values = {}) => {
    const params = new URLSearchParams();
    Object.entries(values).forEach(([key, value]) => {
      if (Array.isArray(value))
        value.forEach((item) => params.append(`${key}[]`, item));
      else if (value !== undefined && value !== null && value !== "")
        params.set(key, value);
    });
    const text = params.toString();
    return text ? `?${text}` : "";
  };

  /* Request Helpers End */

  /* Public API Start */

  return {
    BASE_URL,
    ApiError,
    token,
    clearToken: () => setToken(null),

    /* Authentication Methods Start */

    async register(values) {
      const result = await request("/register", {
        method: "POST",
        body: formData(values),
      });
      setToken(result.token);
      return result.user;
    },

    async login(email, password) {
      const result = await request("/login", {
        method: "POST",
        body: { email, password },
      });
      setToken(result.token);
      return result.user;
    },

    async logout() {
      try {
        await request("/logout", { method: "POST", auth: true });
      } finally {
        setToken(null);
      }
    },

    me: () => request("/me", { auth: true }),

    updateProfile: (values) =>
      request("/profile", {
        method: "PUT",
        auth: true,
        body: formData(values),
      }),

    /* Authentication Methods End */

    /* Movie Methods Start */

    search: (term, signal) =>
      request(`/search${query({ q: term })}`, { signal }),

    nowPlaying: (limit) => request(`/movies/now-playing${query({ limit })}`),

    comingSoon: (limit) => request(`/movies/coming-soon${query({ limit })}`),

    featured: () => request("/movies/featured"),

    movie: (slug) => request(`/movies/${encodeURIComponent(slug)}`),

    movieSessions: (slug, date, signal) =>
      request(
        `/movies/${encodeURIComponent(slug)}/sessions${query({ date })}`,
        { signal },
      ),

    notify: (slug) =>
      request(`/movies/${encodeURIComponent(slug)}/notify`, {
        method: "POST",
        auth: true,
      }),

    /* Movie Methods End */

    /* Sessions and Booking Methods Start */

    filterOptions() {
      if (!filterOptionsPromise) {
        filterOptionsPromise = request("/filter-options").catch((error) => {
          filterOptionsPromise = null;
          throw error;
        });
      }
      return filterOptionsPromise;
    },

    sessions: (filters, signal) =>
      request(`/sessions${query(filters)}`, { unwrap: false, signal }),

    session: (id) => request(`/sessions/${encodeURIComponent(id)}`),

    seats: (id) =>
      request(`/sessions/${encodeURIComponent(id)}/seats`, {
        auth: Boolean(token()),
      }),

    holdSeats: (id, seats) =>
      request(`/sessions/${encodeURIComponent(id)}/holds`, {
        method: "POST",
        auth: true,
        body: { seats },
      }),

    hold: (id) => request(`/holds/${encodeURIComponent(id)}`, { auth: true }),

    releaseHold: (id) =>
      request(`/holds/${encodeURIComponent(id)}`, {
        method: "DELETE",
        auth: true,
      }),

    /* Sessions and Booking Methods End */

    /* Orders and Tickets Methods Start */

    createOrder: (values) =>
      request("/orders", { method: "POST", auth: true, body: values }),

    tickets: (filter) =>
      request(`/tickets${query({ filter })}`, { auth: true }),

    refund: (reference) =>
      request(`/orders/${encodeURIComponent(reference)}/refund`, {
        method: "POST",
        auth: true,
      }),

    /* Orders and Tickets Methods End */
  };

  /* Public API End */
})();

window.KinoApi = KinoApi;

/* API Client End */
