// Small helpers shared by every screen.

const IST = 'Asia/Kolkata';

// Everything from the server is data, never markup. Any value placed into
// HTML goes through esc() first, so a URL like "https://x.com/<script>" shows
// up as text instead of running.
export function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

const numberFmt = new Intl.NumberFormat('en-IN');
export const fmtNum = (n) => numberFmt.format(n);

// The server sends calendar days as "2026-10-16" (already in IST). Format them
// in UTC so the browser's own timezone can't shift them by a day.
const dayFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const weekdayFmt = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
export function fmtDay(isoDay, withWeekday = false) {
    return (withWeekday ? weekdayFmt : dayFmt).format(new Date(`${isoDay}T00:00:00Z`));
}

const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: IST });
const shortDateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: IST });
const dateTimeFmt = new Intl.DateTimeFormat('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: IST
});
export const fmtDate = (ts) => dateFmt.format(new Date(ts));
export const fmtShortDate = (ts) => shortDateFmt.format(new Date(ts));
export const fmtDateTime = (ts) => dateTimeFmt.format(new Date(ts));

// Date -> "2026-10-16", the IST calendar day it falls on.
const istDayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' });
export const istDay = (date) => istDayFmt.format(date);

// The last `count` IST days, oldest first, ending today.
export function lastIstDays(count, now = Date.now()) {
    const days = [];
    for (let i = count - 1; i >= 0; i--) days.push(istDay(new Date(now - i * 86_400_000)));
    return [...new Set(days)];
}

// Same rule the server uses: a link works until it expires or uses up its
// click limit.
export function linkStatus(link, now = Date.now()) {
    if (link.expires_at && new Date(link.expires_at).getTime() <= now) {
        return { key: 'ended', label: 'Ended', reason: `Expired ${fmtDate(link.expires_at)}` };
    }
    if (link.max_clicks != null && link.clicks >= link.max_clicks) {
        return { key: 'ended', label: 'Ended', reason: `Used all ${fmtNum(link.max_clicks)} clicks` };
    }
    if (link.clicks === 0) return { key: 'unused', label: 'Not clicked yet', reason: 'Working, no clicks yet' };
    return { key: 'live', label: 'Live', reason: 'Working' };
}

export const STATUS_COLOR = { live: 'var(--lime)', unused: 'var(--chalk)', ended: 'var(--orange)' };

// { dir: 'up' | 'down' | 'flat', pct } where pct is null when there is
// nothing to compare against (the previous value was 0).
export function change(current, previous) {
    if (previous === 0) return { dir: current === 0 ? 'flat' : 'up', pct: null };
    const pct = ((current - previous) / previous) * 100;
    if (Math.abs(pct) < 0.5) return { dir: 'flat', pct: 0 };
    return { dir: pct > 0 ? 'up' : 'down', pct: Math.abs(pct) };
}

export function fmtPct(pct) {
    return pct >= 10 ? `${Math.round(pct)}%` : `${pct.toFixed(1)}%`;
}

export function hostOf(url) {
    try { return new URL(url).host.replace(/^www\./, ''); } catch { return url; }
}

export function pathOf(url) {
    try {
        const u = new URL(url);
        const rest = `${u.pathname}${u.search}`;
        return rest === '/' ? '' : rest;
    } catch { return ''; }
}

// Only ever turn http(s) URLs into clickable links.
export function safeHref(url) {
    try {
        const u = new URL(url);
        return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
    } catch { return null; }
}

export const sum = (arr) => arr.reduce((a, b) => a + b, 0);
