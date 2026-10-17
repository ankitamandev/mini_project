// The dashboard: sign-in, Overview, Links, Account.
// Plain JavaScript, no framework: each screen is a function that writes HTML
// into <main id="view">, then attaches its event handlers.

import { createApi } from './api.js';
import { createSampleApi } from './demo.js';
import {
    esc, fmtNum, fmtDate, fmtShortDate, hostOf, pathOf, safeHref, linkStatus,
    STATUS_COLOR, change, fmtPct, lastIstDays, sum
} from './format.js';
import { drawLineCompare, drawWaffle, drawColumns, drawTimeline, drawMiniColumns, bindTips, hideTip } from './charts.js';

// ---------- icons (20px, stroke = currentColor) ----------
const svg = (body, size = 20) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const icons = {
    logo: svg('<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>', 26),
    overview: svg('<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>'),
    links: svg('<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>'),
    account: svg('<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l2 2M14 9l2 2"/>'),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
    refresh: svg('<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20v-4h-4"/>'),
    signOut: svg('<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5"/><path d="M5 12h11"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    copy: svg('<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>', 16),
    trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>', 16),
    chart: svg('<path d="M5 20V10M12 20V4M19 20v-7"/>', 16),
    chevron: svg('<path d="M6 9l6 6 6-6"/>', 16),
    alert: svg('<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/>', 18),
    up: '<svg width="12" height="10" viewBox="0 0 12 10" aria-hidden="true"><path d="M6 0l6 10H0z" fill="var(--lime)"/></svg>',
    down: '<svg width="12" height="10" viewBox="0 0 12 10" aria-hidden="true"><path d="M6 10L0 0h12z" fill="var(--orange)"/></svg>',
    flat: '<svg width="12" height="10" viewBox="0 0 12 10" aria-hidden="true"><rect y="4" width="12" height="2.5" rx="1" fill="var(--ink-3)"/></svg>'
};

// ---------- per-browser conveniences ----------
// localStorage can throw (private windows, blocked storage), so every access
// is wrapped. Nothing breaks without it; you just sign in again.
const KEY_STORE = 'shortener.apiKey';
const RANGE_STORE = 'shortener.range';
const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* ignore */ } }
};

const SAMPLE_ONLY = Boolean(window.SHORTENER_SAMPLE_ONLY);
const VIEWS = ['overview', 'links', 'account'];

const state = {
    api: null,
    sample: false,
    key: null,
    user: null,
    view: 'overview',
    range: [7, 14, 30].includes(Number(store.get(RANGE_STORE))) ? Number(store.get(RANGE_STORE)) : 7,

    summary: null,      // GET /users/me/stats
    recent: null,       // newest 8 links, for the timeline
    overviewError: null,

    page: { limit: 20, offset: 0 },
    links: [],
    linksLoaded: false,
    linksError: null,
    hasNext: false,
    filter: '',
    showCreate: false,
    newCode: null,
    openCode: null,
    stats: {},
    confirmDelete: null,

    confirmRotate: false,
    freshKey: null
};

const $ = (sel, root = document) => root.querySelector(sel);
const view = () => $('#view');

// ---------- toasts ----------
function toast(message, kind = 'ok', action = null) {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = `toast ${kind === 'error' ? 'error' : ''}`;
    el.innerHTML = `${kind === 'error' ? icons.alert : ''}<span>${esc(message)}</span>`;
    if (action) {
        const b = document.createElement('button');
        b.className = 'pill sm';
        b.style.marginLeft = 'auto';
        b.textContent = action.label;
        b.addEventListener('click', action.run);
        el.append(b);
    }
    box.append(el);
    setTimeout(() => el.remove(), kind === 'error' ? 7000 : 4500);
}

function copyText(text, what) {
    // writeText must be called straight from the click, before any await.
    navigator.clipboard.writeText(text)
        .then(() => toast(`${what} copied`))
        .catch(() => toast(`Copying is blocked here. Select the ${what.toLowerCase()} and copy it yourself.`, 'error'));
}

const shortDisplay = (url) => url.replace(/^https?:\/\//, '');
// In the list every short link has the same host, so rows show "/code".
const shortPath = (url) => { try { return new URL(url).pathname; } catch { return url; } };

// A 401 anywhere means the saved key stopped working (rotated elsewhere, or
// the database was reset). Send the person back to sign in.
function handleAuthError(err) {
    if (err.status === 401 && !state.sample) {
        store.set(KEY_STORE, null);
        showAuth('Your API key stopped working. It may have been rotated. Sign in with the current key.');
        return true;
    }
    return false;
}

// ---------- sign in ----------
function showAuth(message = '', tab = 'new') {
    $('#app').hidden = true;
    $('#fab-new').hidden = true;
    const auth = $('#auth');
    auth.hidden = false;
    auth.innerHTML = `
      <div class="card auth-card">
        <div class="brand">${icons.logo}</div>
        <div class="auth-intro">
          <h1>Short links</h1>
          <p class="note">Make short links, give them an expiry date or a click limit, and see how often they're opened.</p>
        </div>
        <div class="tabs" role="tablist">
          <button role="tab" id="tab-new" aria-selected="${tab === 'new'}" aria-controls="auth-form">New account</button>
          <button role="tab" id="tab-key" aria-selected="${tab === 'key'}" aria-controls="auth-form">I have a key</button>
        </div>
        <form id="auth-form" novalidate>
          ${tab === 'new' ? `
            <div class="field">
              <label for="auth-email">Email</label>
              <input id="auth-email" type="email" autocomplete="email" placeholder="you@example.com" required>
              <span class="hint">Your account gets an API key. The dashboard and your scripts both use it.</span>
            </div>` : `
            <div class="field">
              <label for="auth-key">API key</label>
              <input id="auth-key" type="password" autocomplete="off" placeholder="sk_..." required>
              <span class="hint">The key you got when you signed up, or after rotating it.</span>
            </div>`}
          <p class="error-text" id="auth-error" ${message ? '' : 'hidden'}>${esc(message)}</p>
          <div class="form-actions" style="margin-top:16px">
            <button class="pill accent" type="submit" id="auth-submit">${tab === 'new' ? 'Create account' : 'Sign in'}</button>
          </div>
        </form>
        <div class="or">or</div>
        <button class="pill quiet" id="try-sample" type="button">Explore with sample data</button>
      </div>`;

    $('#tab-new').addEventListener('click', () => showAuth('', 'new'));
    $('#tab-key').addEventListener('click', () => showAuth('', 'key'));
    $('#try-sample').addEventListener('click', enterSample);
    $('#auth-form').addEventListener('submit', (e) => { e.preventDefault(); tab === 'new' ? signUp() : signIn(); });
    (tab === 'new' ? $('#auth-email') : $('#auth-key')).focus();
}

function authError(msg) {
    const el = $('#auth-error');
    el.textContent = msg;
    el.hidden = !msg;
}

async function signUp() {
    const email = $('#auth-email').value.trim();
    if (!email) return authError('Enter your email to create an account.');
    const btn = $('#auth-submit');
    btn.disabled = true; btn.textContent = 'Creating account…';
    const api = createApi({ getKey: () => null });
    try {
        const res = await api.signUp(email);
        state.key = res.api_key;
        store.set(KEY_STORE, res.api_key);
        showNewKey(res);
    } catch (err) {
        authError(err.status === 400 ? 'Enter a valid email address, like you@example.com.'
            : err.status === 409 ? 'An account with this email already exists. Use "I have a key" instead.'
            : err.message);
        btn.disabled = false; btn.textContent = 'Create account';
    }
}

// The key is only ever shown once by the server, so make that moment clear.
function showNewKey(res) {
    $('#auth').innerHTML = `
      <div class="card auth-card">
        <div class="brand">${icons.logo}</div>
        <div class="auth-intro">
          <h1>Your API key</h1>
          <p class="note">Copy it somewhere safe now. The server keeps only a fingerprint of it, so it can't show it to you again. This browser remembers it so you stay signed in.</p>
        </div>
        <div class="keybox"><code id="new-key">${esc(res.api_key)}</code>
          <button class="pill sm quiet" id="copy-new-key" type="button">${icons.copy} Copy key</button></div>
        <div class="form-actions"><button class="pill accent" id="continue" type="button">Go to dashboard</button></div>
      </div>`;
    $('#copy-new-key').addEventListener('click', () => copyText(res.api_key, 'API key'));
    $('#continue').addEventListener('click', () => {
        state.api = createApi({ getKey: () => state.key });
        state.user = { id: res.id, email: res.email };
        enterApp();
    });
}

async function signIn() {
    const key = $('#auth-key').value.trim();
    if (!key) return authError('Paste your API key. It starts with sk_.');
    const btn = $('#auth-submit');
    btn.disabled = true; btn.textContent = 'Signing in…';
    const api = createApi({ getKey: () => key });
    try {
        state.user = await api.me();
        state.key = key;
        state.api = api;
        store.set(KEY_STORE, key);
        enterApp();
    } catch (err) {
        authError(err.status === 401 ? 'That key was not accepted. Check for missing characters, or rotate it if it leaked.' : err.message);
        btn.disabled = false; btn.textContent = 'Sign in';
    }
}

function enterSample() {
    state.sample = true;
    state.api = createSampleApi();
    state.key = 'sk_sample_k3Y9qLm2Vx8RtB4nZw7HcD1f';
    state.api.me().then((u) => { state.user = u; enterApp(); });
}

function resetData() {
    Object.assign(state, {
        summary: null, recent: null, overviewError: null, links: [], linksLoaded: false,
        linksError: null, hasNext: false, openCode: null, stats: {}, confirmDelete: null,
        newCode: null, freshKey: null, confirmRotate: false, filter: ''
    });
    state.page.offset = 0;
}

function signOut() {
    store.set(KEY_STORE, null);
    state.key = null; state.user = null; state.sample = false;
    resetData();
    showAuth();
}

// ---------- shell ----------
function enterApp() {
    resetData();
    $('#auth').hidden = true;
    $('#auth').innerHTML = '';
    $('#app').hidden = false;
    $('#fab-new').hidden = false;

    const email = state.user?.email || '';
    $('#who-email').textContent = email;
    $('#who-meta').textContent = state.sample ? 'Sample account' : `Account #${state.user?.id ?? ''}`;
    $('#who-avatar').textContent = email.charAt(0) || '?';

    const banner = $('#sample-banner');
    banner.hidden = !state.sample;
    banner.innerHTML = SAMPLE_ONLY
        ? '<span><strong>Sample data.</strong> This preview runs without the server. Run <code>npm run dev</code> and open <code>localhost:3000</code> to use your own links.</span>'
        : '<span><strong>Sample data.</strong> Nothing you do here reaches your server.</span><button class="pill sm quiet" id="exit-sample" type="button">Leave sample data</button>';
    $('#exit-sample')?.addEventListener('click', signOut);
    $('#rail-signout').hidden = SAMPLE_ONLY;

    route();
}

function wireShell() {
    $('#brand-logo').innerHTML = icons.logo;
    $('#nav-overview').insertAdjacentHTML('afterbegin', icons.overview);
    $('#nav-links').insertAdjacentHTML('afterbegin', icons.links);
    $('#nav-account').insertAdjacentHTML('afterbegin', icons.account);
    $('#search-btn').innerHTML = icons.search;
    $('#rail-refresh').innerHTML = icons.refresh;
    $('#rail-signout').innerHTML = icons.signOut;
    $('#rail-new').innerHTML = icons.plus;
    $('#fab-new').innerHTML = icons.plus;

    $('#search-btn').addEventListener('click', () => {
        if (state.view !== 'links') location.hash = 'links';
        requestAnimationFrame(() => $('#filter')?.focus());
    });
    $('#rail-refresh').addEventListener('click', refreshCurrent);
    $('#rail-signout').addEventListener('click', signOut);
    const openCreate = () => {
        state.showCreate = true;
        if (state.view !== 'links') location.hash = 'links';
        else renderLinks();
        requestAnimationFrame(() => $('#f-link')?.focus());
    };
    $('#rail-new').addEventListener('click', openCreate);
    $('#fab-new').addEventListener('click', openCreate);

    addEventListener('hashchange', route);
    let t;
    addEventListener('resize', () => { clearTimeout(t); t = setTimeout(redrawCharts, 150); });
}

function route() {
    if ($('#app').hidden) return;
    const v = location.hash.replace('#', '');
    state.view = VIEWS.includes(v) ? v : 'overview';
    document.querySelectorAll('.nav-pill').forEach((a) => {
        if (a.dataset.view === state.view) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
    });
    hideTip();
    if (state.view === 'overview') renderOverview();
    if (state.view === 'links') renderLinks();
    if (state.view === 'account') renderAccount();
}

function refreshCurrent() {
    if (state.view === 'overview') { state.summary = null; state.recent = null; renderOverview(); }
    else if (state.view === 'links') { state.stats = {}; loadLinks(); }
    else renderAccount();
}

function redrawCharts() {
    if (state.view === 'overview' && state.summary) drawOverviewCharts();
}

// ---------- overview ----------
function kpi({ kicker, value, label, title }) {
    return `<div class="kpi"${title ? ` title="${esc(title)}"` : ''}>
              <span class="delta">${kicker}</span>
              <span class="value">${value}</span>
              <span class="label">${esc(label)}</span>
            </div>`;
}

function deltaKicker(current, previous, versus) {
    const c = change(current, previous);
    const icon = icons[c.dir];
    if (c.pct === null) return { html: `${icon}<span>${c.dir === 'up' ? 'New' : '0%'}</span>`, title: `Nothing ${versus} to compare with` };
    const pct = c.dir === 'flat' ? '0%' : fmtPct(c.pct);
    const word = c.dir === 'up' ? 'more than' : c.dir === 'down' ? 'fewer than' : 'the same as';
    return { html: `${icon}<span>${pct}</span>`, title: `${pct} ${word} ${versus}` };
}

const legend = (items) => items.map(([color, text]) =>
    `<span class="legend-item"><span class="swatch" style="--swatch:${color}"></span>${text}</span>`).join('');

function renderOverview() {
    view().innerHTML = `
      <div class="page-head">
        <h1>Overview</h1>
        <div class="controls">
          <label class="pill select-pill" for="range"><span>Range:</span>
            <select id="range">${[7, 14, 30].map((d) => `<option value="${d}" ${d === state.range ? 'selected' : ''}>${d} days</option>`).join('')}</select>
            ${icons.chevron}</label>
          <button class="circle" id="refresh" type="button" aria-label="Refresh numbers" title="Refresh">${icons.refresh}</button>
        </div>
      </div>
      <div id="overview-error" hidden></div>
      <div class="grid overview">
        <article class="card card-clicks" aria-labelledby="h-clicks">
          <div class="card-head"><h2 id="h-clicks">Clicks</h2></div>
          <div id="clicks-body" class="card-body-fill"></div>
        </article>
        <article class="card card-links" aria-labelledby="h-links">
          <div class="card-head"><h2 id="h-links">Links</h2></div>
          <div id="links-body"></div>
        </article>
        <article class="card card-top" aria-labelledby="h-top">
          <div class="card-head"><h2 id="h-top">Top links</h2><span class="meta" id="top-meta"></span></div>
          <div id="top-body"></div>
        </article>
        <article class="card card-timeline" aria-labelledby="h-timeline">
          <div class="card-head"><h2 id="h-timeline">Link timeline</h2><span class="meta">Newest first</span></div>
          <div id="timeline-body"></div>
        </article>
      </div>`;

    $('#range').addEventListener('change', (e) => {
        state.range = Number(e.target.value);
        store.set(RANGE_STORE, String(state.range));
        state.summary = null;
        loadOverview();
    });
    $('#refresh').addEventListener('click', () => { state.summary = null; state.recent = null; loadOverview(); });

    if (state.summary && state.recent && state.summary.days === state.range) fillOverview();
    else loadOverview();
}

async function loadOverview() {
    if (!state.summary) ['#clicks-body', '#links-body', '#top-body', '#timeline-body']
        .forEach((s) => { const el = $(s); if (el) el.innerHTML = '<p class="note">Loading…</p>'; });
    try {
        const [summary, recent] = await Promise.all([
            state.api.summary(state.range),
            state.recent ? Promise.resolve({ links: state.recent }) : state.api.listLinks({ limit: 8, offset: 0 })
        ]);
        state.summary = summary;
        state.recent = recent.links;
        state.overviewError = null;
    } catch (err) {
        if (handleAuthError(err)) return;
        state.overviewError = err.message;
    }
    if (state.view === 'overview') fillOverview();
}

function fillOverview() {
    const errBox = $('#overview-error');
    errBox.hidden = !state.overviewError;
    if (state.overviewError) {
        errBox.innerHTML = `<div class="sample-banner"><span class="error-text">${esc(state.overviewError)}</span>
            <button class="pill sm quiet" id="retry-overview" type="button">Try again</button></div>`;
        $('#retry-overview').addEventListener('click', loadOverview);
        if (!state.summary) {
            ['#clicks-body', '#links-body', '#top-body', '#timeline-body'].forEach((s) => { $(s).innerHTML = ''; });
            return;
        }
    } else errBox.innerHTML = '';

    const s = state.summary;
    const d = s.days;
    const prev = s.daily.slice(0, d);
    const cur = s.daily.slice(d);
    const curSum = sum(cur.map((x) => x.clicks));
    const prevSum = sum(prev.map((x) => x.clicks));
    const today = cur[cur.length - 1]?.clicks ?? 0;
    const yesterday = cur[cur.length - 2]?.clicks ?? 0;
    const t = s.totals;

    const dPeriod = deltaKicker(curSum, prevSum, `the previous ${d} days`);
    const dToday = deltaKicker(today, yesterday, 'yesterday');
    $('#clicks-body').innerHTML = `
      <div class="kpis">
        ${kpi({ kicker: dPeriod.html, value: fmtNum(curSum), label: `in the last ${d} days`, title: dPeriod.title })}
        ${kpi({ kicker: dToday.html, value: fmtNum(today), label: 'today', title: dToday.title })}
      </div>
      <div class="chart" id="clicks-chart" style="margin-top:14px"></div>
      <div class="card-foot" style="margin-top:12px">${legend([['var(--lime)', 'This period'], ['var(--orange)', `Previous ${d} days`]])}</div>`;

    const working = t.live + t.unused;
    const workingPct = t.links ? Math.round((working / t.links) * 100) : 0;
    $('#links-body').innerHTML = `
      <div class="kpis">
        ${kpi({ kicker: '<span>All time</span>', value: fmtNum(t.links), label: t.links === 1 ? 'link created' : 'links created' })}
        ${kpi({ kicker: `<span class="swatch" style="--swatch:var(--lime)"></span><span>${fmtNum(working)} working</span>`, value: `${workingPct}%`, label: 'still working' })}
      </div>
      <div class="chart" id="links-chart" style="margin-top:16px"></div>
      <div class="card-foot" style="margin-top:14px">${legend([
          ['var(--lime)', `Live ${fmtNum(t.live)}`],
          ['var(--chalk)', `Not clicked yet ${fmtNum(t.unused)}`],
          ['var(--orange)', `Ended ${fmtNum(t.ended)}`]
      ])}</div>`;

    $('#top-meta').textContent = `Last ${d} days against the ${d} before`;
    $('#top-body').innerHTML = `
      <div class="chart" id="top-chart"></div>
      <div class="card-foot" style="margin-top:18px">
        ${legend([['var(--lime)', 'This period'], ['var(--orange)', 'Previous period']])}
        <span class="total">Total this period: <b class="num">${fmtNum(curSum)}</b></span>
      </div>`;

    if (!state.recent.length) {
        $('#timeline-body').innerHTML = `
          <div class="empty"><strong>No links yet</strong>
            <span>Your newest links will line up here, from the day you made them to the day they expire.</span>
            <button class="pill accent" id="first-link" type="button">${icons.plus} Create your first link</button></div>`;
        $('#first-link').addEventListener('click', () => { state.showCreate = true; location.hash = 'links'; });
    } else {
        $('#timeline-body').innerHTML = `
          <div class="chart" id="timeline-chart"></div>
          <div class="card-foot" style="margin-top:14px">
            ${legend([['var(--lime)', 'Live'], ['var(--chalk)', 'Not clicked yet'], ['var(--orange)', 'Ended']])}
            <span class="total">All-time clicks: <b class="num">${fmtNum(t.clicks)}</b></span>
          </div>`;
    }
    drawOverviewCharts();
}

function drawOverviewCharts() {
    const s = state.summary;
    if (!s || !$('#clicks-chart')) return;
    const d = s.days;
    const prev = s.daily.slice(0, d);
    const cur = s.daily.slice(d);
    drawLineCompare($('#clicks-chart'), {
        current: cur.map((x) => x.clicks), previous: prev.map((x) => x.clicks),
        curDays: cur.map((x) => x.day), prevDays: prev.map((x) => x.day)
    });
    drawWaffle($('#links-chart'), [
        { label: 'Live', count: s.totals.live, color: 'var(--lime)' },
        { label: 'Not clicked yet', count: s.totals.unused, color: 'var(--chalk)' },
        { label: 'Ended', count: s.totals.ended, color: 'var(--orange)' }
    ]);
    drawColumns($('#top-chart'), s.top_links, { half: innerWidth < 600 ? 64 : 84 });
    if ($('#timeline-chart')) {
        drawTimeline($('#timeline-chart'), state.recent, {
            onSelect: (code) => openLinkStats(code)
        });
    }
}

// From the timeline: jump to Links with that link's stats open.
function openLinkStats(code) {
    state.page.offset = 0;
    state.filter = '';
    state.openCode = code;
    state.linksLoaded = false;
    if (state.view === 'links') renderLinks(); else location.hash = 'links';
    if (!state.stats[code]) loadStats(code);
}

// ---------- links ----------
function renderLinks() {
    view().innerHTML = `
      <div class="page-head">
        <h1>Links</h1>
        <div class="controls">
          <label class="pill search-pill" for="filter">${icons.search}
            <input id="filter" type="search" placeholder="Filter this page" value="${esc(state.filter)}" autocomplete="off"></label>
          <button class="pill accent" id="toggle-create" type="button" aria-expanded="${state.showCreate}" aria-controls="create-card">${icons.plus} New link</button>
        </div>
      </div>

      <article class="card" id="create-card" aria-labelledby="h-create" ${state.showCreate ? '' : 'hidden'}>
        <div class="card-head"><h2 id="h-create">New link</h2><span class="meta">Only the long URL is required</span></div>
        <form id="create-form" novalidate>
          <div class="form-grid">
            <div class="field field-link">
              <label for="f-link">Long URL</label>
              <input id="f-link" type="url" inputmode="url" autocomplete="off" placeholder="https://example.com/a/very/long/path" aria-describedby="e-link">
              <span class="err" id="e-link"></span>
            </div>
            <div class="field">
              <label for="f-alias">Custom alias</label>
              <input id="f-alias" type="text" autocomplete="off" spellcheck="false" placeholder="my-resume" aria-describedby="h-alias e-alias">
              <span class="hint" id="h-alias">3–30 letters, digits, - or _</span>
              <span class="err" id="e-alias"></span>
            </div>
            <div class="field">
              <label for="f-expires">Expires</label>
              <input id="f-expires" type="datetime-local" aria-describedby="h-expires e-expires_at">
              <span class="hint" id="h-expires">Empty means it never expires</span>
              <span class="err" id="e-expires_at"></span>
            </div>
            <div class="field">
              <label for="f-max">Click limit</label>
              <input id="f-max" type="number" min="1" step="1" inputmode="numeric" placeholder="No limit" aria-describedby="e-max_clicks">
              <span class="err" id="e-max_clicks"></span>
            </div>
          </div>
          <div class="form-actions" style="margin-top:18px">
            <button class="pill accent" type="submit" id="create-submit">Create link</button>
            <button class="pill quiet" type="button" id="create-cancel">Cancel</button>
          </div>
        </form>
      </article>

      <article class="card" aria-label="Your links">
        <p class="note" id="links-host" hidden></p>
        <div class="row-head" aria-hidden="true">
          <span>Short link</span><span>Goes to</span><span>Clicks</span><span>Expires</span><span>Status</span><span></span>
        </div>
        <div class="rows" id="rows"></div>
        <div class="pager" id="pager"></div>
      </article>`;

    const minLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000 + 60_000).toISOString().slice(0, 16);
    $('#f-expires').min = minLocal;

    $('#toggle-create').addEventListener('click', () => {
        state.showCreate = !state.showCreate;
        $('#create-card').hidden = !state.showCreate;
        $('#toggle-create').setAttribute('aria-expanded', String(state.showCreate));
        if (state.showCreate) $('#f-link').focus();
    });
    $('#create-cancel').addEventListener('click', () => {
        state.showCreate = false;
        $('#create-form').reset();
        clearFieldErrors();
        $('#create-card').hidden = true;
        $('#toggle-create').setAttribute('aria-expanded', 'false');
    });
    $('#create-form').addEventListener('submit', onCreate);
    $('#filter').addEventListener('input', (e) => { state.filter = e.target.value; fillLinks(); });
    $('#rows').addEventListener('click', onRowClick);

    if (state.linksLoaded) fillLinks(); else loadLinks();
}

async function loadLinks() {
    const rows = $('#rows');
    if (rows && !state.linksLoaded) rows.innerHTML = '<p class="note" style="padding:14px 0">Loading…</p>';
    try {
        // Ask for one extra row: if it comes back, there is a next page.
        const res = await state.api.listLinks({ limit: state.page.limit + 1, offset: state.page.offset });
        state.hasNext = res.links.length > state.page.limit;
        state.links = res.links.slice(0, state.page.limit);
        state.linksError = null;
    } catch (err) {
        if (handleAuthError(err)) return;
        state.linksError = err.message;
    }
    state.linksLoaded = true;
    if (state.view === 'links') fillLinks();
    if (state.openCode && !state.stats[state.openCode]) loadStats(state.openCode);
}

function matches(l, q) {
    if (!q) return true;
    q = q.toLowerCase();
    return l.code.toLowerCase().includes(q) || l.original_url.toLowerCase().includes(q);
}

function fillLinks() {
    const rows = $('#rows');
    if (!rows) return;

    if (state.linksError) {
        rows.innerHTML = `<div class="empty"><span class="error-text">${esc(state.linksError)}</span>
            <button class="pill sm quiet" id="retry-links" type="button">Try again</button></div>`;
        $('#retry-links').addEventListener('click', loadLinks);
    } else if (!state.links.length) {
        rows.innerHTML = state.page.offset === 0
            ? `<div class="empty"><strong>No links yet</strong><span>Paste a long URL into New link and you'll get a short one back.</span></div>`
            : `<div class="empty"><strong>Nothing on this page</strong><span>Go back a page to see your links.</span></div>`;
    } else {
        const shown = state.links.filter((l) => matches(l, state.filter));
        rows.innerHTML = shown.length
            ? shown.map(rowHtml).join('')
            : `<div class="empty"><strong>No link on this page matches "${esc(state.filter)}"</strong><span>The filter only looks at the links on this page.</span></div>`;
        rows.querySelectorAll('[data-mini]').forEach((el) => {
            const s = state.stats[el.dataset.mini];
            const byDay = new Map(s.daily.map((x) => [x.day, x.clicks]));
            drawMiniColumns(el, lastIstDays(8).map((day) => ({ day, clicks: byDay.get(day) || 0 })));
        });
    }

    const hostNote = $('#links-host');
    if (state.links[0]) {
        hostNote.innerHTML = `Every short link starts with <b>${esc(new URL(state.links[0].short_url).host)}</b>, followed by the code below.`;
        hostNote.hidden = false;
    }

    const { limit, offset } = state.page;
    const from = state.links.length ? offset + 1 : 0;
    $('#pager').innerHTML = `
      <span class="num">${state.links.length ? `Showing ${from}–${offset + state.links.length}` : ''}</span>
      <span class="spacer"></span>
      <label class="pill sm select-pill" for="page-size"><span>Per page</span>
        <select id="page-size">${[10, 20, 50].map((n) => `<option value="${n}" ${n === limit ? 'selected' : ''}>${n}</option>`).join('')}</select>
        ${icons.chevron}</label>
      <button class="pill sm quiet" id="prev-page" type="button" ${offset === 0 ? 'disabled' : ''}>Previous</button>
      <button class="pill sm quiet" id="next-page" type="button" ${state.hasNext ? '' : 'disabled'}>Next</button>`;
    $('#page-size').addEventListener('change', (e) => { state.page.limit = Number(e.target.value); state.page.offset = 0; loadLinks(); });
    $('#prev-page').addEventListener('click', () => { state.page.offset = Math.max(0, offset - limit); state.openCode = null; loadLinks(); });
    $('#next-page').addEventListener('click', () => { state.page.offset = offset + limit; state.openCode = null; loadLinks(); });

    if (state.openCode) {
        const open = rows.querySelector(`.row[data-code="${CSS.escape(state.openCode)}"]`);
        open?.scrollIntoView({ block: 'nearest' });
    }
}

function rowHtml(l) {
    const st = linkStatus(l);
    const href = safeHref(l.original_url);
    const host = hostOf(l.original_url);
    const path = pathOf(l.original_url);
    const expired = l.expires_at && new Date(l.expires_at) <= new Date();
    const actions = state.confirmDelete === l.code
        ? `<div class="confirm" role="group" aria-label="Confirm delete">
             <span>Delete this link?</span>
             <button class="pill sm danger" type="button" data-act="delete-yes">Delete</button>
             <button class="pill sm quiet" type="button" data-act="delete-no">Keep</button>
           </div>`
        : `<div class="actions">
             <button class="pill sm quiet" type="button" data-act="stats" aria-expanded="${state.openCode === l.code}">${icons.chart} ${state.openCode === l.code ? 'Hide stats' : 'Stats'}</button>
             <button class="circle sm" type="button" data-act="delete" aria-label="Delete ${esc(l.code)}" title="Delete">${icons.trash}</button>
           </div>`;
    return `
      <div class="row ${l.code === state.newCode ? 'is-new' : ''}" data-code="${esc(l.code)}">
        <div class="cell c-short">
          <div class="short">
            <code title="${esc(l.short_url)}">${esc(shortPath(l.short_url))}</code>
            <button class="circle sm" type="button" data-act="copy" aria-label="Copy ${esc(l.short_url)}" title="Copy short link">${icons.copy}</button>
          </div>
          <span class="sub">Made ${esc(fmtDate(l.created_at))}</span>
        </div>
        <div class="cell c-dest dest">
          ${href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(host)}</a>` : `<b>${esc(host)}</b>`}
          <span title="${esc(l.original_url)}">${esc(path) || 'Home page'}</span>
        </div>
        <div class="cell c-clicks num"><b>${fmtNum(l.clicks)}</b>
          <span class="sub">${l.max_clicks != null ? `of ${fmtNum(l.max_clicks)} allowed` : 'clicks, no limit'}</span></div>
        <div class="cell c-expires">${l.expires_at
            ? `<b>${esc(fmtShortDate(l.expires_at))}</b><span class="sub">${expired ? 'expired' : 'expires'}</span>`
            : '<b>Never</b><span class="sub">expires</span>'}</div>
        <div class="cell c-status"><span class="status" style="--dot:${STATUS_COLOR[st.key]}" title="${esc(st.reason)}">${esc(st.label)}</span></div>
        <div class="cell c-actions">${actions}</div>
        ${state.openCode === l.code ? detailHtml(l) : ''}
      </div>`;
}

function detailHtml(l) {
    const s = state.stats[l.code];
    if (!s) return '<div class="detail"><p class="note">Loading stats…</p></div>';
    if (s.error) return `<div class="detail"><span class="error-text">${esc(s.error)}</span></div>`;
    return `
      <div class="detail">
        <div class="kpis">
          ${kpi({ kicker: '<span>All time</span>', value: fmtNum(s.total_clicks), label: 'clicks' })}
          ${kpi({ kicker: '<span>Last 7 days</span>', value: fmtNum(s.last_7_days), label: 'clicks' })}
          ${kpi({ kicker: '<span>Average</span>', value: fmtNum(s.avg_per_day), label: 'clicks a day' })}
        </div>
        ${s.last_7_days > 0
            ? `<div class="chart" data-mini="${esc(l.code)}"></div>`
            : '<p class="quiet-note">No clicks in the last 7 days, so there is no daily chart to show.</p>'}
      </div>`;
}

async function loadStats(code) {
    try {
        state.stats[code] = await state.api.linkStats(code);
    } catch (err) {
        if (handleAuthError(err)) return;
        state.stats[code] = { error: err.message };
    }
    if (state.view === 'links') fillLinks();
}

function onRowClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const code = btn.closest('.row').dataset.code;
    const link = state.links.find((l) => l.code === code);
    const act = btn.dataset.act;

    if (act === 'copy') return copyText(link.short_url, 'Short link');
    if (act === 'stats') {
        state.openCode = state.openCode === code ? null : code;
        if (state.openCode && !state.stats[code]) loadStats(code);
        return fillLinks();
    }
    if (act === 'delete') { state.confirmDelete = code; fillLinks(); return $(`.row[data-code="${CSS.escape(code)}"] [data-act="delete-no"]`)?.focus(); }
    if (act === 'delete-no') { state.confirmDelete = null; return fillLinks(); }
    if (act === 'delete-yes') return deleteLink(code);
}

async function deleteLink(code) {
    try {
        await state.api.deleteLink(code);
        toast(`Deleted ${code}. Its short link now returns 404.`);
        state.confirmDelete = null;
        if (state.openCode === code) state.openCode = null;
        delete state.stats[code];
        state.summary = null;
        state.recent = null;
        if (state.links.length === 1 && state.page.offset > 0) {
            state.page.offset = Math.max(0, state.page.offset - state.page.limit);
        }
        await loadLinks();
    } catch (err) {
        if (handleAuthError(err)) return;
        state.confirmDelete = null;
        toast(err.message, 'error');
        loadLinks();
    }
}

function clearFieldErrors() {
    document.querySelectorAll('#create-form .err').forEach((el) => { el.textContent = ''; });
    document.querySelectorAll('#create-form input').forEach((el) => el.removeAttribute('aria-invalid'));
}

const FIELD_INPUT = { link: 'f-link', alias: 'f-alias', expires_at: 'f-expires', max_clicks: 'f-max' };

function fieldError(field, message) {
    const err = $(`#e-${field}`);
    if (!err) return toast(message, 'error');
    err.textContent = message.charAt(0).toUpperCase() + message.slice(1);
    $(`#${FIELD_INPUT[field]}`)?.setAttribute('aria-invalid', 'true');
}

async function onCreate(e) {
    e.preventDefault();
    clearFieldErrors();

    const body = { link: $('#f-link').value.trim() };
    const alias = $('#f-alias').value.trim();
    const expires = $('#f-expires').value;
    const max = $('#f-max').value.trim();
    if (alias) body.alias = alias;
    if (expires) {
        const when = new Date(expires);   // the browser reads it as local time
        if (Number.isNaN(when.getTime())) return fieldError('expires_at', 'Pick a date and time.');
        body.expires_at = when.toISOString();
    }
    if (max) body.max_clicks = Number(max);
    if (!body.link) {
        fieldError('link', 'Paste the long URL you want to shorten.');
        return $('#f-link').focus();
    }

    const btn = $('#create-submit');
    btn.disabled = true;
    btn.textContent = 'Creating…';
    try {
        const link = await state.api.createLink(body);
        $('#create-form').reset();
        state.newCode = link.code;
        state.page.offset = 0;
        state.filter = '';
        $('#filter').value = '';
        state.summary = null;
        state.recent = null;
        const rl = state.api.lastRateLimit;
        const left = rl ? ` You can make ${rl.remaining} more this minute.` : '';
        toast(`Created ${shortDisplay(link.short_url)}.${left}`, 'ok', { label: 'Copy', run: () => copyText(link.short_url, 'Short link') });
        await loadLinks();
    } catch (err) {
        if (handleAuthError(err)) return;
        if (err.status === 400 && err.details.length) {
            err.details.forEach((d) => fieldError(d.field, d.message));
            $('#create-form [aria-invalid="true"]')?.focus();
        } else if (err.status === 409) {
            fieldError('alias', 'That alias is already taken. Try another one.');
            $('#f-alias').focus();
        } else {
            toast(err.message, 'error');
        }
    } finally {
        btn.disabled = false;
        btn.textContent = 'Create link';
    }
}

// ---------- account ----------
function renderAccount() {
    const key = state.key || '';
    const masked = key.length > 12 ? `${key.slice(0, 6)}••••••••${key.slice(-4)}` : key;
    const origin = state.sample ? 'http://localhost:3000' : location.origin;
    const snippet = `curl -X POST ${origin}/links \\
  -H "Authorization: Bearer $KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"link":"https://example.com","max_clicks":100}'`;

    let rotate;
    if (state.freshKey) {
        rotate = `
          <p class="note">This is your new key. It's the only time the full key is shown, and this browser has already switched to it.</p>
          <div class="keybox"><code>${esc(state.freshKey)}</code>
            <button class="pill sm quiet" id="copy-fresh" type="button">${icons.copy} Copy key</button></div>`;
    } else if (state.confirmRotate) {
        rotate = `
          <p class="note">Rotate now? The current key stops working immediately, including in any script that uses it.</p>
          <div class="form-actions">
            <button class="pill sm danger" id="rotate-yes" type="button">Rotate key</button>
            <button class="pill sm quiet" id="rotate-no" type="button">Cancel</button>
          </div>`;
    } else {
        rotate = `
          <p class="note">If your key leaks, rotate it. You get a new key and the old one stops working.</p>
          <div class="form-actions"><button class="pill sm quiet" id="rotate" type="button">Rotate key</button></div>`;
    }

    const rl = state.api.lastRateLimit;
    view().innerHTML = `
      <div class="page-head"><h1>Account</h1></div>
      <div class="grid account">
        <article class="card" aria-labelledby="h-account">
          <div class="card-head"><h2 id="h-account">Your account</h2></div>
          <dl class="facts">
            <dt>Email</dt><dd>${esc(state.user?.email)}</dd>
            <dt>Account</dt><dd>#${esc(state.user?.id)}</dd>
            <dt>Data</dt><dd>${state.sample ? 'Sample data in this browser' : esc(`Your server at ${location.origin}`)}</dd>
          </dl>
          <div class="field">
            <label for="key-text">API key</label>
            <div class="keybox"><code id="key-text">${esc(masked)}</code>
              <button class="pill sm quiet" id="copy-key" type="button">${icons.copy} Copy key</button></div>
            <span class="hint">Saved in this browser so you stay signed in. Signing out removes it.</span>
          </div>
          ${rotate}
          ${SAMPLE_ONLY ? '' : `<div class="form-actions"><button class="pill sm quiet" id="sign-out" type="button">${icons.signOut} ${state.sample ? 'Leave sample data' : 'Sign out'}</button></div>`}
        </article>

        <article class="card" aria-labelledby="h-terminal">
          <div class="card-head"><h2 id="h-terminal">From the terminal</h2></div>
          <p class="note">This dashboard calls the same API your scripts can. Set <code>KEY</code> to your API key, then:</p>
          <pre class="snippet">${esc(snippet).replace('$KEY', '<b>$KEY</b>')}</pre>
          <div class="form-actions"><button class="pill sm quiet" id="copy-snippet" type="button">${icons.copy} Copy command</button></div>
          <p class="note">New links are limited to ${rl ? rl.limit : 10} a minute per account${rl ? `, and you have ${rl.remaining} left in the current minute` : ''}. Sign-ups are limited to 5 an hour per network.</p>
        </article>
      </div>`;

    $('#copy-key').addEventListener('click', () => copyText(key, 'API key'));
    $('#copy-snippet').addEventListener('click', () => copyText(snippet, 'Command'));
    $('#sign-out')?.addEventListener('click', signOut);
    $('#rotate')?.addEventListener('click', () => { state.confirmRotate = true; renderAccount(); $('#rotate-no').focus(); });
    $('#rotate-no')?.addEventListener('click', () => { state.confirmRotate = false; renderAccount(); });
    $('#copy-fresh')?.addEventListener('click', () => copyText(state.freshKey, 'API key'));
    $('#rotate-yes')?.addEventListener('click', async () => {
        try {
            const res = await state.api.rotateKey();
            state.key = res.api_key;
            if (!state.sample) store.set(KEY_STORE, res.api_key);
            state.freshKey = res.api_key;
            state.confirmRotate = false;
            toast('Key rotated. The old key no longer works.');
        } catch (err) {
            if (handleAuthError(err)) return;
            toast(err.message, 'error');
        }
        renderAccount();
    });
}

// ---------- start ----------
async function boot() {
    bindTips(document.body);
    wireShell();
    if (SAMPLE_ONLY) return enterSample();

    const key = store.get(KEY_STORE);
    if (!key) return showAuth();
    state.key = key;
    state.api = createApi({ getKey: () => state.key });
    try {
        state.user = await state.api.me();
        enterApp();
    } catch (err) {
        if (err.status === 401) {
            store.set(KEY_STORE, null);
            showAuth('Your saved key no longer works. It may have been rotated. Sign in with the current key.', 'key');
        } else {
            showAuth(err.message, 'key');
        }
    }
}

boot();
