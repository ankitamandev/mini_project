// Hand-drawn charts (SVG or plain HTML), no chart library. Each function
// takes a container element and data, and replaces the container's contents.

import { esc, fmtNum, fmtDay, fmtShortDate, fmtDate, hostOf, linkStatus, STATUS_COLOR } from './format.js';

const DAY = 86_400_000;

// ---------- shared tooltip ----------
// Any element with a data-tip attribute shows it on hover or keyboard focus.
// data-tip holds HTML that was built from escaped values (see tipAttr).
let tipEl = null;

function tipNode() {
    if (!tipEl) {
        tipEl = document.createElement('div');
        tipEl.className = 'tooltip';
        tipEl.hidden = true;
        tipEl.setAttribute('aria-hidden', 'true');
        document.body.append(tipEl);
    }
    return tipEl;
}

export function showTip(html, x, y) {
    const t = tipNode();
    t.innerHTML = html;
    t.hidden = false;
    const r = t.getBoundingClientRect();
    let left = x + 14;
    let top = y + 16;
    if (left + r.width > innerWidth - 8) left = x - r.width - 14;
    if (top + r.height > innerHeight - 8) top = y - r.height - 14;
    t.style.left = `${Math.max(8, left)}px`;
    t.style.top = `${Math.max(8, top)}px`;
}

export function hideTip() {
    if (tipEl) tipEl.hidden = true;
}

export function bindTips(root) {
    root.addEventListener('pointermove', (e) => {
        if (e.target.closest('[data-hover-chart]')) return;   // line chart draws its own
        const t = e.target.closest('[data-tip]');
        if (t) showTip(t.dataset.tip, e.clientX, e.clientY);
        else hideTip();
    });
    root.addEventListener('focusin', (e) => {
        const t = e.target.closest('[data-tip]');
        if (!t) return;
        const r = t.getBoundingClientRect();
        showTip(t.dataset.tip, r.left + r.width / 2, r.bottom);
    });
    root.addEventListener('focusout', hideTip);
    addEventListener('scroll', hideTip, { passive: true });
}

const tipAttr = (html) => `data-tip="${esc(html)}"`;

// 0..max rounded up to a "nice" number (1, 2, 2.5, 5 × 10^k) for the axis.
function niceCeil(v) {
    if (v <= 4) return 4;
    const exp = 10 ** Math.floor(Math.log10(v));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * exp >= v) return m * exp;
    return 10 * exp;
}

// ---------- 1. this period vs previous period, as two lines ----------
// current[i] and previous[i] are the same position in each period
// (e.g. "3rd day of this week" vs "3rd day of last week").
export function drawLineCompare(el, { current, previous, curDays, prevDays }) {
    const w = Math.max(220, Math.round(el.clientWidth || 300));
    const h = 136;
    const pad = { top: 12, right: 6, bottom: 26, left: 30 };
    const n = current.length;
    const max = niceCeil(Math.max(1, ...current, ...previous));
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;
    const x = (i) => pad.left + (n === 1 ? plotW / 2 : (i * plotW) / (n - 1));
    const y = (v) => pad.top + plotH * (1 - v / max);
    const path = (arr) => arr.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
    const last = n - 1;

    const grid = [0, max / 2, max].map((v) => `
        <line x1="${pad.left}" x2="${w - pad.right}" y1="${y(v)}" y2="${y(v)}"
              stroke="${v === 0 ? 'var(--line-strong)' : 'var(--line)'}" stroke-dasharray="${v === 0 ? '0' : '3 5'}"/>
        <text x="${pad.left - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" font-weight="600" fill="var(--ink-3)">${fmtNum(v)}</text>`).join('');

    const total = current.reduce((a, b) => a + b, 0);
    el.innerHTML = `
      <svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" data-hover-chart role="img"
           aria-label="${esc(`Daily clicks: ${fmtNum(total)} in the last ${n} days, compared with the ${n} days before`)}">
        ${grid}
        <path d="${path(previous)}" fill="none" stroke="var(--orange)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        <path d="${path(current)}" fill="none" stroke="var(--lime)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        <circle cx="${x(last)}" cy="${y(current[last])}" r="4.5" fill="var(--lime)" stroke="var(--card)" stroke-width="2"/>
        <text x="${pad.left}" y="${h - 6}" font-size="11" font-weight="600" fill="var(--ink-3)">${esc(fmtDay(curDays[0]))}</text>
        <text x="${w - pad.right}" y="${h - 6}" text-anchor="end" font-size="11" font-weight="600" fill="var(--ink-3)">Today</text>
        <g class="hover" visibility="hidden">
          <line y1="${pad.top}" y2="${h - pad.bottom}" stroke="var(--ink-3)" stroke-dasharray="2 4"/>
          <circle class="hp" r="4" fill="var(--orange)" stroke="var(--card)" stroke-width="2"/>
          <circle class="hc" r="4.5" fill="var(--lime)" stroke="var(--card)" stroke-width="2"/>
        </g>
        <rect x="${pad.left - 8}" y="0" width="${plotW + 16}" height="${h}" fill="transparent"/>
      </svg>`;

    const svg = el.querySelector('svg');
    const hover = svg.querySelector('.hover');
    const move = (e) => {
        const box = svg.getBoundingClientRect();
        const px = ((e.clientX - box.left) / box.width) * w;
        const i = Math.max(0, Math.min(last, Math.round(((px - pad.left) / plotW) * (n - 1))));
        hover.setAttribute('visibility', 'visible');
        hover.querySelector('line').setAttribute('x1', x(i));
        hover.querySelector('line').setAttribute('x2', x(i));
        hover.querySelector('.hp').setAttribute('cx', x(i));
        hover.querySelector('.hp').setAttribute('cy', y(previous[i]));
        hover.querySelector('.hc').setAttribute('cx', x(i));
        hover.querySelector('.hc').setAttribute('cy', y(current[i]));
        showTip(
            `${esc(fmtDay(curDays[i], true))}: ${fmtNum(current[i])} clicks<br>` +
            `<span class="t-muted">${esc(fmtDay(prevDays[i], true))}: ${fmtNum(previous[i])} clicks</span>`,
            e.clientX, e.clientY
        );
    };
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerdown', move);
    svg.addEventListener('pointerleave', () => { hover.setAttribute('visibility', 'hidden'); hideTip(); });
}

// ---------- 2. links by status, one dot per link ----------
export function drawWaffle(el, groups, maxDots = 64) {
    const total = groups.reduce((n, g) => n + g.count, 0);
    if (total === 0) {
        el.innerHTML = '<div class="waffle-note">Each dot will be one link.</div>';
        return;
    }
    const per = total <= maxDots ? 1 : Math.ceil(total / maxDots);
    const dotCount = Math.ceil(total / per);

    // Largest-remainder rounding, so the dots add up exactly.
    const raw = groups.map((g) => (g.count / total) * dotCount);
    const dots = raw.map(Math.floor);
    let left = dotCount - dots.reduce((a, b) => a + b, 0);
    raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0])
        .forEach(([, i]) => { if (left > 0 && groups[i].count > 0) { dots[i]++; left--; } });

    const html = groups.flatMap((g, i) =>
        Array.from({ length: dots[i] }, () =>
            `<span class="dot" style="--dot:${g.color}" ${tipAttr(`${esc(g.label)}: ${fmtNum(g.count)} ${g.count === 1 ? 'link' : 'links'}`)}></span>`)
    ).join('');

    // Fewer links get bigger dots, so a new account's card isn't mostly empty.
    const size = dotCount <= 24 ? 18 : dotCount <= 40 ? 15 : 12;
    el.innerHTML = `
      <div class="waffle" style="--dot-size:${size}px;--dot-gap:${size <= 12 ? 9 : 11}px" role="img" aria-label="${esc(groups.map((g) => `${g.label} ${g.count}`).join(', '))}">${html}</div>
      <div class="waffle-note">${per === 1 ? 'Each dot is one link' : `Each dot is about ${per} links`}</div>`;
}

// ---------- 3. top links: this period up, previous period down ----------
export function drawColumns(el, rows, { half = 84 } = {}) {
    if (!rows.length) {
        el.innerHTML = '<div class="empty"><strong>No clicks in this range yet</strong><span>Share a short link and its clicks will show up here.</span></div>';
        return;
    }
    const max = Math.max(1, ...rows.flatMap((r) => [r.current, r.previous]));
    const cap = (value, cls) => {
        if (value === 0) return `<span class="cap ${cls}" style="height:0"><span class="out">0</span></span>`;
        const hgt = Math.max(4, Math.round((value / max) * half));
        return hgt >= 24
            ? `<span class="cap ${cls}" style="height:${hgt}px">${fmtNum(value)}</span>`
            : `<span class="cap ${cls}" style="height:${hgt}px"><span class="out">${fmtNum(value)}</span></span>`;
    };
    el.innerHTML = `
      <div class="columns" role="img" aria-label="${esc(rows.map((r) => `${r.code}: ${r.current} this period, ${r.previous} before`).join('; '))}">
        ${rows.map((r) => `
          <div class="col" style="--half:${half}px"
               ${tipAttr(`${esc(r.code)}<br>This period: ${fmtNum(r.current)} clicks<br><span class="t-muted">Previous: ${fmtNum(r.previous)} clicks</span>`)}>
            <div class="up">${cap(r.current, 'cur')}</div>
            <span class="mid"></span>
            <div class="down">${cap(r.previous, 'prev')}</div>
            <span class="code">${esc(r.code)}</span>
          </div>`).join('')}
      </div>`;
}

// ---------- 4. link timeline: created → expiry (or today) ----------
export function drawTimeline(el, links, { now = Date.now(), onSelect } = {}) {
    const rows = links.slice(0, 8);
    const w = Math.max(280, Math.round(el.clientWidth || 400));
    const labelW = 58, rowH = 52, barH = 32, top = 26, axisH = 30, right = 6;
    const h = top + rows.length * rowH + axisH;

    let start = Math.min(...rows.map((l) => +new Date(l.created_at)));
    const futureEnds = rows.map((l) => (l.expires_at ? +new Date(l.expires_at) : 0)).filter((t) => t > now);
    let end = futureEnds.length ? Math.min(Math.max(...futureEnds), now + 21 * DAY) : now;
    end = Math.max(end, now + 2 * DAY);              // a little room after "today"
    if (end - start < 7 * DAY) start = end - 7 * DAY;
    const plotW = w - labelW - right;
    const x = (t) => labelW + ((t - start) / (end - start)) * plotW;

    const ticks = Array.from({ length: 5 }, (_, i) => start + ((end - start) * i) / 4);
    const grid = ticks.map((t, i) => `
        <line x1="${x(t)}" x2="${x(t)}" y1="${top - 6}" y2="${top + rows.length * rowH}" stroke="var(--line)" stroke-dasharray="3 5"/>
        <text x="${x(t)}" y="${h - 8}" font-size="11" font-weight="600" fill="var(--ink-3)"
              text-anchor="${i === 0 ? 'start' : i === 4 ? 'end' : 'middle'}">${esc(fmtShortDate(t))}</text>`).join('');

    const bars = rows.map((l, i) => {
        const st = linkStatus(l, now);
        const created = +new Date(l.created_at);
        const expires = l.expires_at ? +new Date(l.expires_at) : null;
        const until = expires ? Math.min(expires, end) : now;
        let x1 = x(created);
        const width = Math.max(x(until) - x1, 78);
        x1 = Math.min(x1, w - right - width);
        const y = top + i * rowH + (rowH - barH) / 2;
        const cy = y + barH / 2;
        const showCode = width >= 150;
        const maxChars = Math.floor((width - barH - 52) / 7);
        const code = l.code.length > maxChars ? `${l.code.slice(0, Math.max(1, maxChars - 1))}…` : l.code;
        const ink = 'var(--on-accent)';
        const tip = `${esc(l.code)} <span class="t-muted">${esc(hostOf(l.original_url))}</span><br>` +
            `Created ${esc(fmtDate(l.created_at))}<br>` +
            (expires ? `${expires > now ? 'Expires' : 'Expired'} ${esc(fmtDate(l.expires_at))}` : 'Never expires') + '<br>' +
            `${fmtNum(l.clicks)}${l.max_clicks != null ? ` of ${fmtNum(l.max_clicks)}` : ''} clicks · ${esc(st.label)}`;
        return `
          <text x="0" y="${cy + 4}" font-size="12" font-weight="700" fill="var(--ink-2)">${esc(fmtShortDate(created))}</text>
          <g class="timeline-bar" tabindex="0" role="button" data-code="${esc(l.code)}"
             aria-label="${esc(`${l.code}, ${st.label}, ${l.clicks} clicks. Open in Links`)}" ${tipAttr(tip)}>
            <rect class="bar" x="${x1}" y="${y}" width="${width}" height="${barH}" rx="${barH / 2}" fill="${STATUS_COLOR[st.key]}"/>
            <circle cx="${x1 + barH / 2}" cy="${cy}" r="${barH / 2 - 4}" fill="var(--shell)"/>
            <text x="${x1 + barH / 2}" y="${cy + 4}" text-anchor="middle" font-size="11" font-weight="800" fill="var(--ink)">${esc(hostOf(l.original_url).charAt(0).toUpperCase())}</text>
            ${showCode ? `<text x="${x1 + barH + 4}" y="${cy + 4}" font-size="12" font-weight="700" fill="${ink}">${esc(code)}</text>` : ''}
            <text x="${x1 + width - 14}" y="${cy + 4}" text-anchor="end" font-size="12" font-weight="800" fill="${ink}">${fmtNum(l.clicks)}</text>
          </g>`;
    }).join('');

    const todayX = x(now);
    el.innerHTML = `
      <svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="group" aria-label="Newest links from creation to expiry">
        ${grid}
        <line x1="${todayX}" x2="${todayX}" y1="${top - 8}" y2="${top + rows.length * rowH}" stroke="var(--ink-2)" stroke-dasharray="2 3"/>
        <text x="${todayX}" y="${top - 12}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--ink-2)">Today</text>
        ${bars}
      </svg>`;

    if (onSelect) {
        el.querySelectorAll('.timeline-bar').forEach((g) => {
            g.addEventListener('click', () => onSelect(g.dataset.code));
            g.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(g.dataset.code); }
            });
        });
    }
}

// ---------- 5. one link's recent days ----------
export function drawMiniColumns(el, days) {
    const max = Math.max(1, ...days.map((d) => d.clicks));
    const H = 84;
    el.innerHTML = `
      <div class="mini" role="img" aria-label="${esc(days.map((d) => `${fmtDay(d.day)}: ${d.clicks}`).join(', '))}">
        ${days.map((d) => {
            const hgt = d.clicks ? Math.max(6, Math.round((d.clicks / max) * H)) : 0;
            return `<div class="mini-col" ${tipAttr(`${esc(fmtDay(d.day, true))}: ${fmtNum(d.clicks)} clicks`)}>
                      <span class="mini-v num">${fmtNum(d.clicks)}</span>
                      <span class="mini-bar" style="height:${hgt}px"></span>
                      <span class="mini-d">${esc(fmtDay(d.day, true).split(' ')[0].replace(',', ''))}</span>
                    </div>`;
        }).join('')}
      </div>`;
}
