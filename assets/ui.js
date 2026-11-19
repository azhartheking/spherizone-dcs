/* =====================================================================
   SPHERIZONE DCS SIMULATOR — HMI / UI LAYER
   Sections: 1 page registry & navigation · 2 header · 3 bindings · 4 SVG drawing kit
             · 5 faceplate · 6 side-panel cards (KPI, mini trend) · 7 trend renderer · 8 alarm banner
   ===================================================================== */
(function (G) {
'use strict';
const SZ = G.SZ, UI = G.UI = {};
const $ = (s, r) => (r || document).querySelector(s);
const h = (tag, attrs, html) => { const e = document.createElement(tag); if (attrs) for (const k in attrs) { if (k === 'on') for (const ev in attrs.on) e.addEventListener(ev, attrs.on[ev]); else e.setAttribute(k, attrs[k]); } if (html != null) e.innerHTML = html; return e; };
const NS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs || {}) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
const fx = (v, d) => (v == null || isNaN(v)) ? '—' : (+v).toFixed(d == null ? 1 : d);
UI.h = h; UI.fx = fx; UI.$ = $;

/* ---------------- 1. PAGES ---------------- */
UI.PAGES = [
  ['index', 'Overview'], ['catalyst', '100 Catalyst'], ['mzcr', '200 MZCR'], ['flash', '300 Flash'], ['gpr', '400 GPR'],
  ['finishing', '500 Finishing & Silo'], ['extrusion', '600 Extrusion'], ['utilities', '900 Utilities & Flare'], ['trends', 'Trends'], ['alarms', 'Alarms & Journal'], ['quality', 'Quality & Grades'], ['instructor', 'Instructor'], ['manual', 'Manual']
];
// Page addresses. In the single-file offline version (window.SZ_SINGLE) every page lives in one HTML file
// and is chosen with ?p=<page>; documents (PDFs, printable forms) then open from the online site.
UI.ONLINE = 'https://azhartheking.github.io/spherizone-dcs/';
UI.href = (id, tag) => (window.SZ_SINGLE ? '?p=' + id : id + '.html') + (tag ? '#' + encodeURIComponent(tag) : '');
UI.resolve = (h) => {
  if (!window.SZ_SINGLE || !h) return h;
  if (/^(docs|forms)\//.test(h)) return UI.ONLINE + h;
  const m = /^([\w-]+)\.html(\?[^#]*)?(#.*)?$/.exec(h);
  return m ? '?p=' + m[1] + (m[2] ? '&' + m[2].slice(1) : '') + (m[3] || '') : h;
};
if (window.SZ_SINGLE) document.addEventListener('click', (e) => {
  const a = e.target.closest && e.target.closest('a[href]'); if (!a) return;
  const h = a.getAttribute('href'), r = UI.resolve(h);
  if (r !== h) { e.preventDefault(); if (/^https?:/.test(r)) window.open(r, '_blank'); else location.href = r; }
}, true);
// which page owns each tag (for cross-page jumps)
UI.TAGPAGE = {};
for (const t in SZ.CTL) UI.TAGPAGE[t] = SZ.CTL[t].page;
Object.assign(UI.TAGPAGE, { 'K-211': 'mzcr', 'P-701': 'mzcr', 'K-401': 'gpr', 'EX-601': 'finishing', 'P-102': 'catalyst', 'D-501': 'finishing', 'XV-901': 'mzcr', 'AI-001': 'catalyst', 'R-211': 'mzcr', 'R-401': 'gpr', 'LAB': 'quality', 'SIS': 'instructor', 'E-212': 'mzcr', 'FL-901': 'utilities', 'D-901': 'utilities' });
for (const t in SZ.PSV) UI.TAGPAGE[t] = SZ.PSV[t].page;
for (const t in SZ.PSV_STATIC) UI.TAGPAGE[t] = SZ.PSV_STATIC[t][1];
const EQTAG = { P701: 'P-701', K211: 'K-211', K401: 'K-401', EX601: 'EX-601', TEALP: 'P-102', CATF: 'D-101', DONP: 'P-103', STEAM: 'D-501', HTR: 'E-212' };
const TAGEQ = {}; for (const k in EQTAG) TAGEQ[EQTAG[k]] = k;
UI.go = (tag) => { const pg = UI.TAGPAGE[tag];
  if (UI.isPop && pg) {   // from a pop-out: show the tag in the main window
    try { if (window.opener && !window.opener.closed) { window.opener.location.href = UI.href(pg, tag); window.opener.focus(); return; } } catch (e) { }
    window.open(UI.href(pg, tag), 'sz_main'); return;
  } if (pg && pg !== UI.pageId) location.href = UI.href(pg, tag); else UI.select(tag); };

/* ---------------- 3. BINDINGS ---------------- */
const binds = [];
UI.bind = (el, fn) => { binds.push([el, fn]); return el; };
UI.text = (el, fn) => UI.bind(el, (S) => { const v = fn(S); if (el.textContent !== v) el.textContent = v; });
function renderBinds(S) { for (const [el, fn] of binds) fn(S, el); }

/* ---------------- 2. HEADER ---------------- */
function buildHeader() {
  const hd = $('#hdr');
  const r1 = h('div', { class: 'hrow' });
  r1.append(h('div', { class: 'brand' }, 'SPHERIZONE PP · DCS<small>Multizone circulating reactor training simulator</small>'));
  const grade = h('div', { class: 'chip', title: 'Target grade (set on Quality & Grades)' });
  UI.bind(grade, (S) => { grade.innerHTML = 'Target <b>' + S.target + '</b> · ' + (SZ.GRADES[S.target] || {}).fam + ' · pellets ' + (S.p.pelOk ? '<b style="color:var(--ok)">ON-SPEC</b>' : '<b style="color:var(--p1)">OFF-SPEC</b>'); });
  r1.append(h('a', { class: 'chip np', href: 'https://azhartheking.github.io/plant-simulators/', title: 'Back to the plant selection page (Alkylation · Spherizone PP · CDU)', style: 'text-decoration:none;color:inherit' }, '⌂ All plants'));
  r1.append(grade, h('div', { class: 'spacer' }));
  const role = h('div', { class: 'chip', title: 'Only one open page integrates the model; other open tabs follow it' });
  UI.bind(role, () => { const o = SZ.rt.outdated; role.textContent = SZ.rt.remote ? 'SIM ◉ live' : o ? '⚠ OLD VERSION — press Ctrl+F5' : SZ.rt.leader ? 'SIM ●' : 'SIM ○ follower'; role.style.background = o ? 'var(--p2)' : ''; role.style.fontWeight = o ? '700' : ''; });
  // live room (claude.ai artifact): one instructor hosts, everyone else operates the same plant
  const live = h('button', { class: 'np', title: 'Live room: the instructor hosts the plant; everyone who opens the page follows it and operates it together' });
  live.style.display = 'none';
  live.addEventListener('click', () => {
    const L = SZ.live; if (!L || !L.room) return;
    if (L.state === 'host') { if (confirm('Stop hosting? Operators drop back to their own plant.')) SZ.roomHost(false); }
    else if (L.state === 'op') { if (confirm('Leave the live room and practise on your own plant?')) SZ.roomFollow(false); }
    else if (L.left) SZ.roomFollow(true);
    else if (L.canHost) { if (confirm('Host this plant live? Everyone who opens the simulator will see your plant and can operate it with you. Failures, sessions and speed stay instructor-only.')) SZ.roomHost(true); }
    else alert('No instructor is hosting right now. When the instructor presses HOST you join automatically; until then you operate your own plant.');
  });
  UI.bind(live, () => {
    const L = SZ.live; if (!L || !L.room) { live.style.display = 'none'; return; }
    live.style.display = '';
    live.textContent = '👥 ' + (L.state === 'host' ? 'HOST · ' + L.n + ' online' : L.state === 'op' ? 'LIVE · following host' : L.left ? 'SOLO · rejoin live' : L.canHost ? 'SOLO · host live' : 'SOLO · ' + L.n + ' online');
    live.classList.toggle('on', L.state !== 'solo');
  });
  const clk = h('div', { class: 'clock', title: 'Simulation clock' }); UI.text(clk, (S) => SZ.fmtT(S.t));
  const fr = h('button', { on: { click: () => SZ.cmd({ type: 'freeze', on: !SZ.rt.S.frozen }) } });
  UI.bind(fr, (S) => { fr.textContent = S.frozen ? '▶ RUN' : '❚❚ FREEZE'; fr.classList.toggle('warn', S.frozen); });
  const sp = h('div', { class: 'grp' });
  for (const v of [1, 5, 20, 60]) { const b = h('button', { on: { click: () => SZ.cmd({ type: 'speed', v }) } }, v + '×'); UI.bind(b, (S) => b.classList.toggle('on', S.speed === v)); sp.append(b); }
  const ab = h('a', { class: 'almbadge', href: UI.href('alarms'), title: 'Alarm summary (P1 / P2 / P3)' });
  const a = [1, 2, 3].map(i => { const s = h('span', { class: 'a' + i }, 'P' + i + ' 0'); ab.append(s); return s; });
  UI.bind(ab, (S) => { for (let i = 1; i <= 3; i++) { const act = S.alarms.filter(x => x.prio === i); const un = act.some(x => !x.acked); a[i - 1].textContent = 'P' + i + ' ' + act.length; a[i - 1].classList.toggle('act', act.length > 0); a[i - 1].classList.toggle('blink', un); } });
  const ack = h('button', { on: { click: () => SZ.cmd({ type: 'ack', id: 'ALL' }) }, title: 'Acknowledge all alarms' }, 'ACK ALL');
  const sil = h('button', { on: { click: () => UI.audio.silence() }, title: 'Silence the horn for the current alarms (new alarms sound again)' }, '🔕 SILENCE');
  UI.bind(sil, () => sil.classList.toggle('warn', UI.audio.sounding));
  const snd = h('button', { on: { click: () => UI.audio.toggle() }, title: 'Alarm sound on / off' });
  UI.bind(snd, () => { snd.textContent = UI.audio.on ? '🔊' : '🔇'; snd.classList.toggle('on', !UI.audio.on); });
  const ses = h('button', { on: { click: () => UI.sessionMenu(true) }, title: 'Shift handover — choose normal operation, an upset drill, start-up or shutdown' });
  const SL = { steady: 'NORMAL', drill: 'UPSET DRILL', exercise: 'EXERCISE', startup: 'START-UP', shutdown: 'SHUTDOWN' };
  UI.bind(ses, (S) => { ses.textContent = '☰ SESSION' + (S.session ? ': ' + (SL[S.session.mode] || '') : ''); });
  // difficulty: EASY = recipe hints + one-click buttons, HARD = setpoints from the manual only
  const lvl = h('button', { title: 'Difficulty — EASY: recipe SP hints and one-click buttons · HARD: no hints, setpoints from the manual only' });
  lvl.addEventListener('click', () => {
    const hard = SZ.rt.S.level === 'hard';
    if (hard) { if (!confirm('Switch to EASY mode? Recipe hints will be shown. This is logged in the journal, and a running procedure is then scored as EASY.')) return; }
    else if (!confirm('Switch to HARD mode? Recipe SP hints, "Use recipe" buttons and "Apply recipe SPs" are hidden. Use the manual for every setpoint.')) return;
    SZ.cmd({ type: 'level', v: hard ? 'easy' : 'hard' });
  });
  UI.bind(lvl, (S) => { const hard = S.level === 'hard'; lvl.textContent = hard ? '◆ HARD' : '◇ EASY'; lvl.classList.toggle('on', hard); });
  ses.classList.add('np'); lvl.classList.add('np');   // not shown in pop-out windows
  r1.append(ses, lvl, live, role, clk, fr, sp, ab, ack, sil, snd);
  const nav = h('nav', { class: 'pages' });
  UI.PAGES.forEach(([id, label], i) => {
    const l = h('a', { href: UI.href(id), title: label + ' (Alt+' + ((i + 1) % 10) + ')' }, label);
    if (id === UI.pageId) l.classList.add('cur');
    const dot = h('span', { class: 'dot' }); l.append(dot);
    UI.bind(dot, (S) => { const al = S.alarms.filter(x => x.page === id && x.active); const p = al.length ? Math.min(...al.map(x => x.prio)) : 0; dot.className = 'dot' + (p ? ' p' + p : '') + (al.some(x => !x.acked) ? ' blink' : ''); });
    nav.append(l);
  });
  hd.append(r1, nav);
  document.addEventListener('keydown', (e) => { if (e.altKey && /^[0-9]$/.test(e.key)) { const i = (+e.key + 9) % 10; if (UI.PAGES[i]) location.href = UI.href(UI.PAGES[i][0]); } });
}

/* ---------------- 4. SVG DRAWING KIT ---------------- */
function kit(svg) {
  const d = { svg };
  const L = { bg: sv('g', {}, svg), pipes: sv('g', {}, svg), eq: sv('g', {}, svg), fg: sv('g', {}, svg) };
  d.layer = L;
  const ptsStr = (p) => p.map(q => q.join(',')).join(' ');
  d.pipe = (pts, cls, opt) => {
    const e = sv('polyline', { points: ptsStr(pts), class: 'pipe ' + (cls || ''), 'marker-end': (opt && opt.noArrow) ? '' : 'url(#arr)' }, L.pipes);
    if (opt && opt.live) UI.bind(e, (S) => e.classList.toggle('dead', !opt.live(S)));
    return e;
  };
  d.rect = (x, y, w, hh, cls, rx) => sv('rect', { x, y, width: w, height: hh, rx: rx || 0, class: cls || 'eq' }, L.eq);
  d.vessel = (x, y, w, hh, label, sub) => {
    const g = sv('g', {}, L.eq); sv('rect', { x, y, width: w, height: hh, rx: Math.min(w / 2, 22), class: 'eq' }, g);
    if (label) d.label(x + w / 2, y + hh + 14, label, 'lbl', 'middle');
    if (sub) d.label(x + w / 2, y + hh + 26, sub, 'lbl s', 'middle');
    return g;
  };
  d.label = (x, y, t, cls, anchor) => { const e = sv('text', { x, y, class: cls || 'lbl', 'text-anchor': anchor || 'start' }, L.fg); e.textContent = t; return e; };
  d.dyn = (x, y, fn, cls, anchor) => { const e = d.label(x, y, '', cls, anchor); UI.text(e, fn); return e; };
  d.level = (x, y, w, hh, fn) => {
    const r = sv('rect', { x, y, width: w, height: 0, class: 'lvl' }, L.eq);
    UI.bind(r, (S) => { const v = Math.max(0, Math.min(100, fn(S))); r.setAttribute('height', hh * v / 100); r.setAttribute('y', y + hh - hh * v / 100); });
    return r;
  };
  d.hx = (x, y, label) => {
    const g = sv('g', {}, L.eq); sv('circle', { cx: x, cy: y, r: 16, class: 'eq2' }, g);
    sv('polyline', { points: `${x - 16},${y} ${x - 9},${y - 8} ${x - 3},${y + 8} ${x + 3},${y - 8} ${x + 9},${y + 8} ${x + 16},${y}`, fill: 'none', stroke: '#53575c', 'stroke-width': 1.4 }, g);
    if (label) d.label(x, y + 30, label, 'lbl', 'middle');
    return g;
  };
  d.motor = (x, y, eq, kind, label) => {
    const g = sv('g', { class: 'motor', 'data-tag': EQTAG[eq] }, L.eq);
    if (kind === 'comp') { sv('path', { d: `M${x - 18},${y - 16} L${x + 18},${y - 8} L${x + 18},${y + 8} L${x - 18},${y + 16} Z`, class: 'body' }, g); sv('circle', { cx: x, cy: y, r: 3, class: 'mk' }, g); }
    else if (kind === 'ext') { sv('rect', { x: x - 40, y: y - 12, width: 80, height: 24, rx: 3, class: 'body' }, g); sv('path', { d: `M${x - 34},${y} L${x + 30},${y}`, stroke: '#888', 'stroke-width': 2 }, g); sv('circle', { cx: x + 30, cy: y, r: 3, class: 'mk' }, g); }
    else if (kind === 'heat') { sv('rect', { x: x - 15, y: y - 13, width: 30, height: 26, rx: 3, class: 'body' }, g); sv('polyline', { points: `${x - 10},${y + 7} ${x - 5},${y - 7} ${x},${y + 7} ${x + 5},${y - 7} ${x + 10},${y + 7}`, fill: 'none', class: 'mk', 'stroke-width': 1.6, stroke: 'currentColor' }, g); }
    else { sv('circle', { cx: x, cy: y, r: 14, class: 'body' }, g); sv('path', { d: `M${x - 6},${y - 8} L${x + 9},${y} L${x - 6},${y + 8} Z`, class: 'mk' }, g); }
    if (label) d.label(x, y + (kind === 'ext' ? 28 : 30), label, 'lbl', 'middle');
    // run-status lamp: green = running, red = stopped, blinking red = tripped
    const lp = { comp: [21, -18], ext: [46, -12], heat: [19, -15] }[kind] || [14, -14];
    const lamp = sv('circle', { cx: x + lp[0], cy: y + lp[1], r: 4.5, class: 'lamp' }, g);
    lamp.appendChild(document.createElementNS(NS, 'title'));
    g.addEventListener('click', () => UI.select(EQTAG[eq]));
    UI.bind(g, (S) => {
      const run = !!S.eq[eq], tripped = !run && !!(S.trip && S.trip[eq]);
      g.classList.toggle('run', run);
      const fmap = { P701: 'cwTrip', K211: 'k211Trip', K401: 'k401Trip', EX601: 'exTrip', TEALP: 'tealTrip' };
      g.classList.toggle('trip', tripped || (!run && (!!S.fail[fmap[eq]] || ((eq === 'K211' || eq === 'P701') && !SZ.isIdle(S)) || (eq === 'K401' && S.eq.GPR))));
      g.classList.toggle('tripped', tripped);
      lamp.setAttribute('class', 'lamp ' + (run ? 'on' : tripped ? 'tr' : 'off'));
      lamp.firstChild.textContent = run ? 'RUNNING' : tripped ? 'TRIPPED — ' + S.trip[eq].why : 'STOPPED';
      g.classList.toggle('sel', UI.sel === EQTAG[eq]);
    });
    return g;
  };
  // pressure relief valve (PSV / PRV / BDV). dir: 'u' = outlet up, 'r' = outlet right, 'l' = outlet left
  d.psv = (x, y, tag, dir) => {
    const live = !!SZ.PSV[tag], g = sv('g', { class: 'psv' + (live ? '' : ' static'), 'data-tag': tag }, L.fg);
    // inlet at (x, y+12); body bow-tie; spring bonnet on top; outlet to the side
    sv('path', { d: `M${x},${y + 12} L${x},${y + 7}`, class: 'pipe thin', 'marker-end': '' }, g);
    sv('path', { d: `M${x - 6},${y + 7} L${x + 6},${y + 7} L${x},${y - 1} Z`, class: 'pv' }, g);
    const ox = dir === 'l' ? -9 : 9;
    sv('path', { d: `M${x},${y - 1} L${x + ox},${y - 7} L${x + ox},${y + 5} Z`, class: 'pv' }, g);
    sv('polyline', { points: `${x - 3},${y - 3} ${x + 3},${y - 6} ${x - 3},${y - 9} ${x + 3},${y - 12} ${x - 3},${y - 15}`, fill: 'none', stroke: '#45494e', 'stroke-width': 1.1 }, g);
    sv('rect', { x: x - 4, y: y - 18, width: 8, height: 3, fill: '#45494e' }, g);
    const t = sv('text', { x: x + (dir === 'l' ? -12 : 12), y: y + 16, class: 'lbl s', 'text-anchor': dir === 'l' ? 'end' : 'start' }, g); t.textContent = tag;
    const v = sv('text', { x: x + (dir === 'l' ? -12 : 12), y: y + 26, class: 'lbl s', 'text-anchor': dir === 'l' ? 'end' : 'start' }, g);
    g.addEventListener('click', () => UI.select(tag));
    UI.bind(g, (S) => {
      const st = live && S.psv && S.psv[tag], open = !!(st && st.open);
      g.classList.toggle('open', open); g.classList.toggle('sel', UI.sel === tag);
      v.textContent = live ? (open ? 'RELIEVING ' + fx(st.f, 1) + ' t/h' : 'set ' + SZ.PSV[tag].set + ' barg') : SZ.PSV_STATIC[tag][2];
      UI.alarmClass(g, S, tag);
    });
    return { x: x + ox, y: y - 1 };   // outlet point for the flare line
  };
  d.valve = (x, y, tag, vert, label) => {
    const g = sv('g', { class: 'tagbox', 'data-tag': tag }, L.eq);
    const p = vert ? `M${x - 7},${y - 9} L${x + 7},${y - 9} L${x - 7},${y + 9} L${x + 7},${y + 9} Z` : `M${x - 9},${y - 7} L${x - 9},${y + 7} L${x + 9},${y - 7} L${x + 9},${y + 7} Z`;
    const b = sv('path', { d: p, class: 'valve' }, g);
    // valve tag (e.g. TCV-211) and valve position under (or beside) the symbol
    const vt = sv('text', { x: x + (vert ? 11 : 0), y: y + (vert ? -1 : 19), class: 'lbl vtag', 'text-anchor': vert ? 'start' : 'middle' }, g); vt.textContent = SZ.FCE[tag] || label || '';
    const t = sv('text', { x: x + (vert ? 11 : 0), y: y + (vert ? 10 : 29), class: 'lbl s', 'text-anchor': vert ? 'start' : 'middle' }, g);
    g.addEventListener('click', () => UI.select(tag));
    UI.bind(g, (S) => { const c = S.ctl[tag]; let op = c ? c.op : 0; if (tag === 'LIC-401' && S.p.lv401 != null) op = S.p.lv401; t.textContent = fx(op, 0) + '%'; b.classList.toggle('open', op > 1); });
    return g;
  };
  d.tag = (x, y, tag, w) => {
    w = w || 118; const def = SZ.CTL[tag];
    const g = sv('g', { class: 'tagbox', 'data-tag': tag, transform: `translate(${x},${y})` }, L.fg);
    sv('rect', { class: 'b', width: w, height: 46, rx: 2 }, g);
    const ab = sv('g', { class: 'ab' }, g); sv('rect', { x: w - 12, y: 3, width: 9, height: 9 }, ab);
    const t1 = sv('text', { x: 5, y: 13, class: 't' }, g); t1.textContent = tag;
    const mb = sv('rect', { x: w - 46, y: 3, width: 31, height: 12, class: 'mbg' }, g);
    const mt = sv('text', { x: w - 30.5, y: 12.5, class: 'm', 'text-anchor': 'middle' }, g);
    const v = sv('text', { x: 5, y: 29, class: 'v' }, g);
    const u = sv('text', { x: w - 5, y: 29, class: 'u', 'text-anchor': 'end' }, g); u.textContent = def.u;
    const s = sv('text', { x: 5, y: 42, class: 's' }, g);
    g.addEventListener('click', () => UI.select(tag));
    UI.bind(g, (S) => {
      const c = S.ctl[tag];
      v.textContent = def.hand ? fx(c.op, 0) : fx(c.pv, def.dec);
      // heater controller with E-212 stopped: standby, not in control (PV is the same R-211 temperature as TIC-211)
      const standby = def.standby && !S.eq[def.standby];
      s.textContent = def.hand ? 'HAND  OP ' + fx(c.op, 0) + '%' : standby ? 'E-212 OFF · standby' : 'SP ' + fx(c.sp, def.dec) + '  OP ' + fx(c.op, 0) + '%';
      mt.textContent = def.hand ? 'HIC' : standby ? 'OFF' : c.mode; mb.style.display = (c.mode === 'AUTO' && !def.hand && !standby) ? 'none' : ''; mt.style.display = mb.style.display;
      g.classList.toggle('standby', !!standby);
      UI.alarmClass(g, S, tag);
      g.classList.toggle('sel', UI.sel === tag);
    });
    return g;
  };
  d.ind = (x, y, label, fn, unit, dec, w, almTag) => {
    w = w || 104;
    const g = sv('g', { class: 'tagbox ind', transform: `translate(${x},${y})` }, L.fg);
    sv('rect', { class: 'b', width: w, height: 32, rx: 2 }, g);
    const ab = sv('g', { class: 'ab' }, g); sv('rect', { x: w - 11, y: 3, width: 8, height: 8 }, ab);
    const t = sv('text', { x: 4, y: 12, class: 't' }, g); t.textContent = label;
    const v = sv('text', { x: 4, y: 27, class: 'v' }, g);
    const u = sv('text', { x: w - 4, y: 27, class: 'u', 'text-anchor': 'end' }, g); u.textContent = unit || '';
    UI.bind(g, (S) => { const r = fn(S); v.textContent = typeof r === 'string' ? r : fx(r, dec); if (almTag) UI.alarmClass(g, S, almTag); });
    if (almTag) { g.style.cursor = 'pointer'; g.addEventListener('click', () => UI.select(almTag)); }
    return g;
  };
  d.link = (x, y, text, href, dir) => {
    const g = sv('g', { class: 'link' }, L.fg);
    const w = Math.max(70, text.length * 6.2 + 18);
    const p = dir === 'l' ? `M${x},${y} L${x + 10},${y - 11} L${x + w},${y - 11} L${x + w},${y + 11} L${x + 10},${y + 11} Z` : `M${x},${y - 11} L${x + w - 10},${y - 11} L${x + w},${y} L${x + w - 10},${y + 11} L${x},${y + 11} Z`;
    sv('path', { d: p }, g);
    const t = sv('text', { x: x + w / 2 + (dir === 'l' ? 4 : -4), y: y + 3.5, 'text-anchor': 'middle' }, g); t.textContent = text;
    g.addEventListener('click', () => location.href = UI.resolve(href));
    return g;
  };
  d.area = (x, y, w, hh, title, href) => {
    const r = sv('rect', { x, y, width: w, height: hh, rx: 3, class: 'area-r' }, L.bg);
    r.addEventListener('click', () => location.href = UI.resolve(href));
    const t = sv('text', { x: x + 8, y: y + 16, class: 'lbl area' }, L.bg); t.textContent = title;
    return r;
  };
  d.btn = (x, y, w, fnText, onClick, fnOn) => {
    const g = sv('g', { class: 'link' }, L.fg);
    const r = sv('path', { d: `M${x},${y} h${w} v22 h${-w} Z` }, g);
    const t = sv('text', { x: x + w / 2, y: y + 15, 'text-anchor': 'middle' }, g);
    g.addEventListener('click', onClick);
    UI.bind(g, (S) => { t.textContent = fnText(S); if (fnOn) { const on = fnOn(S); r.style.fill = on ? '#5b5f64' : ''; t.style.fill = on ? '#fff' : ''; } });
    return g;
  };
  // arrow marker
  const defs = sv('defs', {}, svg);
  const m = sv('marker', { id: 'arr', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' }, defs);
  sv('path', { d: 'M0,0 L10,5 L0,10 z', fill: '#45494e' }, m);
  return d;
}
UI.alarmClass = function (g, S, tag) {
  const al = S.alarms.filter(a => a.tag === tag);
  const p = al.length ? Math.min(...al.map(a => a.prio)) : 0;
  g.classList.remove('a1', 'a2', 'a3'); if (p) g.classList.add('a' + p);
  g.classList.toggle('unack', al.some(a => !a.acked));
};

/* ---------------- 5. FACEPLATE ---------------- */
UI.sel = null;
UI.select = function (tag) {
  UI.sel = tag; try { sessionStorage.setItem('szsel.' + UI.pageId, tag); } catch (e) { }
  history.replaceState(null, '', '#' + encodeURIComponent(tag));
  buildFaceplate();
  // phones / small tablets: the faceplate slides up from the bottom as a sheet
  const fp = $('#fp'); if (fp && window.matchMedia('(max-width: 1000px)').matches) fp.classList.add('sheet');
  SZ.render();
};
let fpBinds = [];
// Normal operating SP for tags that are not part of the grade recipe
const NORMAL_SP = { 'FIC-201': [22, 'normal at full rate (start-up: ≈ 5 t/h, then ≈ 0.75 × production)'], 'PIC-301': [18, 'normal'], 'LIC-601': [50, 'normal'] };
UI.recipeSP = function (S, tag) {
  const it = SZ.recipeItems(S.target).find(x => x[1] === tag);
  if (it) return { v: it[2], note: 'recipe ' + S.target };
  if (NORMAL_SP[tag]) return { v: NORMAL_SP[tag][0], note: NORMAL_SP[tag][1] };
  return null;
};
// "Recipe SP" line on the faceplate: shows the value to use and loads it with one click
function recipeRow(tag, def, fb) {
  const row = h('div', { class: 'row recipe' });
  const txt = h('span', { class: 'hint' }), btn = h('button', {}, 'Use recipe');
  btn.addEventListener('click', () => {
    const r = UI.recipeSP(SZ.rt.S, tag); if (!r || typeof r.v !== 'number') return;
    if (def.hand) { SZ.cmd({ type: 'op', tag, v: r.v }); return; }
    if (SZ.rt.S.ctl[tag].mode !== 'AUTO') SZ.cmd({ type: 'mode', tag, m: 'AUTO' });
    SZ.cmd({ type: 'sp', tag, v: r.v });
  });
  row.append(txt, btn);
  fb(row, (S) => {
    const r = UI.recipeSP(S, tag);
    if (!r || typeof r.v !== 'number' || S.level === 'hard') { row.style.display = 'none'; return; }   // HARD mode: no recipe hint
    row.style.display = '';
    const cur = def.hand ? S.ctl[tag].op : S.ctl[tag].sp, same = SZ.sameVal(cur, r.v);
    const d = Math.abs(r.v) < 1 ? 3 : Math.abs(r.v) < 10 ? 2 : 1;
    txt.innerHTML = (def.hand ? 'Recipe OP ' : 'Recipe SP ') + '<b>' + fx(r.v, d) + ' ' + (def.hand ? '%' : def.u) + '</b> <span>(' + r.note + ')</span>';
    row.classList.toggle('diff', !same); btn.disabled = same;
    btn.textContent = def.hand ? 'Use recipe OP' : (S.ctl[tag].mode === 'AUTO' ? 'Use recipe SP' : 'AUTO + recipe SP');
  });
  return row;
}
function buildFaceplate() {
  const box = $('#fp'); if (!box) return;
  const bd = box.querySelector('.bd'); bd.innerHTML = ''; fpBinds = [];
  const tag = UI.sel, S = SZ.rt.S;
  const fb = (el, fn) => { fpBinds.push([el, fn]); return el; };
  if (!tag) { bd.innerHTML = '<div class="hint">Click a tag box, valve or motor on the graphic to open its faceplate.</div>'; return; }
  const own = UI.TAGPAGE[tag];
  const head = h('div', { class: 'fp' });
  head.append(h('div', { class: 'tag' }, tag));
  if (own && own !== UI.pageId) head.append(h('div', {}, '<a href="' + UI.href(own, tag) + '">→ open on ' + UI.PAGES.find(p => p[0] === own)[1] + ' page</a>'));
  bd.append(head);
  const def = SZ.CTL[tag];
  if (def) {
    head.append(h('div', { class: 'desc' }, def.d + (SZ.FCE[tag] ? ' · final element <b>' + SZ.FCE[tag] + '</b>' : '')));
    const grid = h('div', { class: 'grid' });
    const bar = h('div', { class: 'bar' }), pvb = h('div', { class: 'pvb' }), spm = h('div', { class: 'spm' }), opb = h('div', { class: 'opb' });
    bar.append(pvb, spm, opb);
    const tb = h('table');
    const row = (k, u) => { const tr = h('tr'); const v = h('td', { class: 'v' }); tr.append(h('td', { class: 'k' }, k), v, h('td', { class: 'uu' }, u)); tb.append(tr); return v; };
    const vPV = row('PV', def.u), vSP = row('SP', def.u), vOP = row('OP', '%'), vM = row('MODE', '');
    const rng = h('div', { class: 'note' }, 'Range ' + def.lo + ' – ' + def.hi + ' ' + def.u + (def.act ? ' · ' + (def.act > 0 ? 'direct' : 'reverse') + ' acting' : ''));
    const right = h('div'); right.append(tb, rng);
    grid.append(bar, right); head.append(grid);
    fb(bar, (S) => { const c = S.ctl[tag], span = def.hi - def.lo; const pct = (v) => Math.max(0, Math.min(100, (v - def.lo) / span * 100));
      pvb.style.height = pct(def.hand ? def.lo + c.op / 100 * span : c.pv) + '%'; spm.style.bottom = pct(c.sp) + '%'; spm.style.display = def.hand ? 'none' : ''; opb.style.height = c.op + '%';
      vPV.textContent = def.hand ? '—' : fx(c.pv, def.dec); vSP.textContent = def.hand ? '—' : fx(c.sp, def.dec); vOP.textContent = fx(c.op, 1); vM.textContent = def.hand ? 'HAND' : c.mode; });
    if (!def.hand) {
      const r1 = h('div', { class: 'row' });
      const bA = h('button', { on: { click: () => SZ.cmd({ type: 'mode', tag, m: 'AUTO' }) } }, 'AUTO');
      const bM = h('button', { on: { click: () => SZ.cmd({ type: 'mode', tag, m: 'MAN' }) } }, 'MAN');
      fb(bA, (S) => { bA.classList.toggle('on', S.ctl[tag].mode === 'AUTO'); bM.classList.toggle('on', S.ctl[tag].mode === 'MAN'); });
      r1.append(bA, bM); head.append(r1);
      const r2 = h('div', { class: 'row' });
      const iS = h('input', { type: 'number', step: 'any', value: fx(S.ctl[tag].sp, def.dec) });
      r2.append(h('span', {}, 'SP'), iS, h('button', { on: { click: () => SZ.cmd({ type: 'sp', tag, v: +iS.value }) } }, 'Set SP'));
      iS.addEventListener('keydown', e => { if (e.key === 'Enter') SZ.cmd({ type: 'sp', tag, v: +iS.value }); });
      fb(iS, (S) => { if (document.activeElement !== iS) iS.value = fx(S.ctl[tag].sp, def.dec); });
      head.append(r2);
    }
    head.append(recipeRow(tag, def, fb));
    const r3 = h('div', { class: 'row' });
    const iO = h('input', { type: 'number', step: 'any', min: 0, max: 100, value: fx(S.ctl[tag].op, 1) });
    r3.append(h('span', {}, 'OP'), iO, h('button', { on: { click: () => SZ.cmd({ type: 'op', tag, v: +iO.value }) } }, 'Set OP'));
    iO.addEventListener('keydown', e => { if (e.key === 'Enter') SZ.cmd({ type: 'op', tag, v: +iO.value }); });
    fb(iO, (S) => { if (document.activeElement !== iO) iO.value = fx(S.ctl[tag].op, 1); iO.disabled = S.ctl[tag].mode !== 'MAN'; });
    head.append(r3);
    const r4 = h('div', { class: 'row' });
    r4.append(h('button', { on: { click: () => SZ.cmd({ type: 'nudge', tag, dir: 1 }) } }, '▲'), h('button', { on: { click: () => SZ.cmd({ type: 'nudge', tag, dir: -1 }) } }, '▼'),
      h('span', { class: 'hint' }, def.hand ? 'nudges OP ±1 %' : 'AUTO: SP ±0.5 % span · MAN: OP ±1 %'));
    head.append(r4);
    if (tag === 'FIC-101') { const n = h('div', { class: 'row' }); const b = h('button', { on: { click: () => SZ.cmd({ type: 'sisReset' }) } }, 'SIS catalyst-cut RESET'); fb(b, (S) => b.classList.toggle('warn', S.sis.catCut)); n.append(b); head.append(n); }
  } else if (SZ.PSV[tag] || SZ.PSV_STATIC[tag]) {
    const v = SZ.PSV[tag];
    if (v) {
      head.append(h('div', { class: 'desc' }, v.d + ' · relieves to the flare header (Area 900)'));
      const st = h('div', { class: 'big' }); head.append(st);
      const kv = UI.kv([['Vessel pressure', S => S.p[v.p], 'barg', 2], ['Set pressure', () => v.set, 'barg', 1], ['Reseat (blowdown)', () => v.reseat, 'barg', 1],
        ['Relief flow', S => (S.psv && S.psv[tag] ? S.psv[tag].f : 0), 't/h', 1], ['Rated capacity', () => v.cap, 't/h', 0], ['Lifts this session', S => (S.psv && S.psv[tag] ? S.psv[tag].n : 0), '', 0]]);
      head.append(kv);
      fb(st, (S) => { const o = S.psv && S.psv[tag] && S.psv[tag].open; st.innerHTML = o ? '<span class="state bad">RELIEVING</span>' : 'CLOSED'; });
      head.append(h('div', { class: 'note' }, 'Spring-loaded, self-acting: it cannot be operated from the DCS. It lifts at set pressure and reseats at blowdown. Remove the cause of the overpressure (PIC controller, feeds, cooling).'));
    } else {
      const s = SZ.PSV_STATIC[tag];
      head.append(h('div', { class: 'desc' }, s[0]), h('div', { class: 'big' }, 'CLOSED'), h('div', { class: 'note' }, 'Setting: ' + s[2] + '. Shown for information — not simulated in this version.'));
    }
  } else if (TAGEQ[tag]) {
    const eq = TAGEQ[tag];
    head.append(h('div', { class: 'desc' }, SZ.EQ[eq].d));
    const st = h('div', { class: 'big' }); fb(st, (S) => { st.innerHTML = S.eq[eq] ? 'RUNNING' : '<span class="state bad">STOPPED</span>'; });
    head.append(st);
    const r = h('div', { class: 'row' });
    r.append(h('button', { on: { click: () => SZ.cmd({ type: 'motor', eq, on: true }) } }, 'START'), h('button', { on: { click: () => SZ.cmd({ type: 'motor', eq, on: false }) } }, 'STOP'));
    head.append(r);
    if (eq === 'K211') { const n = h('div', { class: 'note' }); fb(n, (S) => n.textContent = S.eq.K211 ? 'Riser fluidised. Barrier efficiency ' + fx(S.p.barEff * 100, 0) + ' %' : 'SIS kills reaction after 60 s stopped — stopped for ' + fx(S.sis.k211StopT, 0) + ' s'); head.append(n); }
  } else {
    head.append(h('div', { class: 'desc' }, 'Indicator / alarm point'));
  }
  // alarms for this tag
  const al = h('div', { class: 'note' });
  fb(al, (S) => { const a = S.alarms.filter(x => x.tag === tag); al.innerHTML = a.length ? a.map(x => '<span class="state ' + (x.prio === 1 ? 'bad' : 'warn') + '">P' + x.prio + '</span> ' + x.msg).join('<br>') : ''; });
  head.append(al);
}

/* ---------------- 6. SIDE CARDS ---------------- */
UI.card = function (title, extra) { const c = h('div', { class: 'card' }); c.append(h('h3', {}, title + (extra || '')), h('div', { class: 'bd' })); return c; };
UI.kv = function (rows) {
  const box = h('div', { class: 'kv' });
  for (const [k, fn, u, d, bad] of rows) {
    const v = h('span', { class: 'v' });
    box.append(h('span', { class: 'k' }, k), v, h('span', { class: 'u' }, u || ''));
    UI.bind(v, (S) => { const r = fn(S); v.textContent = typeof r === 'string' ? r : fx(r, d); if (bad) v.classList.toggle('bad', !!bad(S)); });
  }
  return box;
};
UI.kpiCard = function () {
  const c = UI.card('Production KPIs', ' <a href="trends.html">trends →</a>');
  const spec = (k) => (S) => { const g = SZ.GRADES[S.target]; return g.spec[k] && (S.p.pel[k] < g.spec[k][0] || S.p.pel[k] > g.spec[k][1]); };
  c.querySelector('.bd').append(UI.kv([
    ['MZCR rate', S => S.p.rMZ, 't/h', 1], ['GPR rubber rate', S => S.p.rG, 't/h', 2], ['Total production', S => S.p.prodTot, 't/h', 1],
    ['Extruder', S => S.p.exRate, 't/h', 1], ['Catalyst mileage', S => S.p.mileage, 't/kg', 1],
    ['MFR inst / pellet', S => fx(S.p.inst.MFR, 2) + ' / ' + fx(S.p.pel.MFR, 2), 'g/10', 2, spec('MFR')],
    ['XS inst / pellet', S => fx(S.p.inst.XS, 2) + ' / ' + fx(S.p.pel.XS, 2), 'wt%', 2, spec('XS')],
    ['PI pellet', S => S.p.pel.PI, '', 2, spec('PI')],
    ['C2 / rubber pellet', S => fx(S.p.pel.C2, 2) + ' / ' + fx(S.p.pel.RUB, 1), '%', 1, (S) => spec('C2')(S) || spec('RUB')(S)],
    ['On / off-spec', S => fx(S.tons.on, 0) + ' / ' + fx(S.tons.off, 0), 't', 0]
  ]));
  return c;
};
UI.trendCard = function (group, win) {
  const c = UI.card(SZ.TRENDS[group][1] ? SZ.TRENDS[group][0] : group, ' <span><a href="trends.html#' + group + '">open →</a><a href="#" class="popa" title="Pop out this trend into its own window">⧉</a></span>');
  c.querySelector('.popa').addEventListener('click', (e) => { e.preventDefault(); UI.popout('trends', group, 760, 460); });
  const cv = h('canvas', { class: 'trend', height: 150 }); const lg = h('div', { class: 'legend' });
  c.querySelector('.bd').append(cv, lg);
  UI.bind(cv, (S) => UI.drawTrend(cv, lg, S, SZ.TRENDS[group][1], win || 1800));
  return c;
};

/* session card: current session, brief, and the start-up / shutdown step tracker */
UI.sessionCard = function () {
  const c = UI.card('Session', ' <a href="#" class="chg">change →</a>');
  c.querySelector('.chg').addEventListener('click', (e) => { e.preventDefault(); UI.sessionMenu(true); });
  const bd = c.querySelector('.bd'); let sig = '';
  UI.bind(c, (S) => {
    const ss = S.session; c.style.display = ss ? '' : 'none'; if (!ss) return;
    const pr = S.proc, P = pr && SZ.PROCS[pr.id];
    const s2 = ss.title + '|' + (pr ? pr.i + '|' + pr.complete : '') + '|' + (S.exercise && S.exercise.hidden) + '|' + S.level;
    if (s2 === sig) return; sig = s2;
    let html = '<b>' + ss.title + '</b> <span class="state' + (S.level === 'hard' ? ' warn' : '') + '" style="font-size:10.5px">' + (S.level === 'hard' ? '◆ HARD' : '◇ EASY') + '</span>' + (ss.brief ? '<div class="hint" style="margin:3px 0 4px">' + ss.brief + '</div>' : '');
    if (P) {
      html += '<ol class="proc">' + P.steps.map((st, i) => {
        const cls = pr.done[i] != null ? 'done' : i === pr.i ? 'next' : '';
        return '<li class="' + cls + '"><a href="' + UI.href(st[1]) + '">' + st[0] + '</a>' + (pr.done[i] != null ? ' <span class="hint">' + SZ.fmtT(pr.done[i]) + '</span>' : '') + '</li>';
      }).join('') + '</ol>';
      html += pr.complete != null ? '<div class="state" style="background:var(--ok);color:#fff;border-color:var(--ok)">COMPLETE in ' + SZ.fmtT(pr.complete - pr.t0) + '</div><div class="hint">Off-spec ' + fx(S.tons.off, 0) + ' t · SIS trips ' + (pr.trips || 0) + ' · ' + (pr.easyUsed || S.level !== 'hard' ? 'EASY' : '<b>HARD</b>') + '</div>'
        : '<div class="hint">Step ' + (pr.i + 1) + ' of ' + P.steps.length + ' · steps tick in order when the plant reaches them</div>';
    }
    bd.innerHTML = html;
  });
  return c;
};

/* shift-handover / session menu (modal) */
UI.sessionMenu = function (manual) {
  if ($('#sesdlg')) return;
  const S = SZ.rt.S;
  const ov = h('div', { id: 'sesdlg', class: 'modal' }), box = h('div', { class: 'mbox' });
  ov.append(box);
  const close = () => { ov.remove(); try { sessionStorage.setItem('szsession', '1'); } catch (e) { } };
  let level = (S && S.level) || 'easy';
  const go = (cmd, label) => {
    if (manual && !confirm('Start "' + label + '" in ' + level.toUpperCase() + ' mode? The current plant state is replaced.')) return;
    cmd.level = level; SZ.cmd(cmd); close();
  };
  box.append(h('div', { class: 'mhd' }, '<span>Shift handover — Spherizone PP plant</span>'));
  if (manual) { const x = h('button', { class: 'mx', title: 'Close', on: { click: close } }, '✕'); box.firstChild.append(x); }
  box.append(h('p', { class: 'hint', style: 'font-size:12.5px;margin:2px 0 8px' }, 'Choose the plant condition for this session:'));
  const gsel = h('select'); for (const g in SZ.GRADES) gsel.append(h('option', { value: g }, g + ' — ' + SZ.GRADES[g].fam));
  gsel.value = S && SZ.GRADES[S.target] ? S.target : 'H-INJ';
  const gr = h('div', { class: 'mgrade' }); gr.append(h('span', {}, 'Grade for normal operation / start-up / shutdown:'), gsel); box.append(gr);
  // difficulty choice
  const lr = h('div', { class: 'mgrade' }); lr.append(h('span', {}, 'Difficulty:'));
  const bE = h('button', {}, '◇ EASY — recipe hints and one-click buttons'), bH = h('button', {}, '◆ HARD — no hints, setpoints from the manual only');
  const paint = () => { bE.classList.toggle('on', level === 'easy'); bH.classList.toggle('on', level === 'hard'); };
  bE.addEventListener('click', () => { level = 'easy'; paint(); }); bH.addEventListener('click', () => { level = 'hard'; paint(); });
  paint(); lr.append(bE, bH); box.append(lr);
  const sec = (title) => { box.append(h('div', { class: 'msec' }, title)); const g = h('div', { class: 'mgrid' }); box.append(g); return g; };
  const tile = (grid, title, text, fn, dis) => { const b = h('button', { class: 'mtile' }, '<b>' + title + '</b><span>' + text + '</span>'); b.addEventListener('click', () => { if (!b.disabled) fn(); }); grid.append(b); if (dis) UI.bind(b, () => { const d = dis(); b.disabled = !!d; b.title = d || ''; }); return b; };
  if (S && S.t > 0) {
    const g0 = sec('Continue');
    tile(g0, 'Continue previous session', 'Resume the plant as you left it — ' + (S.session ? S.session.title : 'grade ' + S.target) + ', sim time ' + SZ.fmtT(S.t) + '.', () => { if (level !== (S.level || 'easy')) SZ.cmd({ type: 'level', v: level }); close(); });
  }
  const g1 = sec('Normal operation');
  tile(g1, 'Steady state', 'Normal operation at design rate (~30 t/h) on the selected grade. Free practice — no upset.', () => go({ type: 'session', mode: 'steady', grade: gsel.value }, 'Steady state ' + gsel.value));
  const g2 = sec('Plant start-up & shutdown');
  const heco = () => SZ.GRADES[gsel.value].gpr ? 'Start up on a HOMO or RACO grade, then grade-change to HECO (manual §7.5)' : '';
  tile(g2, 'Full plant start-up (cold)', 'Everything stopped, R-211 empty at 25 °C. Start utilities, heat up, pressurise, light off and bring the plant to rate and on-spec. Step tracker shown.', () => go({ type: 'session', mode: 'startup', grade: gsel.value }, 'Cold start-up ' + gsel.value), heco);
  tile(g2, 'Controlled plant shutdown', 'Plant at steady state. Stop the reaction, empty the silo, depressurise and stop the machines in a safe order. Step tracker shown.', () => go({ type: 'session', mode: 'shutdown', grade: gsel.value }, 'Shutdown from ' + gsel.value));
  const g3 = sec('Upset drills');
  const g4 = sec('Grade-change exercises');
  for (const ex of SZ.EXERCISES) {
    const isDrill = !!(ex.fail || ex.hidden || ex.poison);
    tile(isDrill ? g3 : g4, (isDrill ? 'Upset: ' : '') + ex.title, ex.brief + ' (starts on ' + ex.start + ')', () => go({ type: 'exercise', id: ex.id }, ex.title));
  }
  box.append(h('div', { class: 'hint', style: 'margin-top:8px' }, 'You can reopen this menu at any time with the ☰ SESSION button in the header. Instructors have more controls on the Instructor page.'));
  document.body.append(ov);
};

/* ---------------- 7. TREND RENDERER ---------------- */
UI.PEN = ['#1f5fbf', '#c0392b', '#2e7d32', '#8e44ad', '#d07a00', '#00838f'];
UI.drawTrend = function (cv, lg, S, keys, win, fixed) {
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 300, H = cv.clientHeight || +cv.getAttribute('height');
  if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, H);
  const t = S.hist.t, t1 = S.t, t0 = t1 - win, padL = 4, padR = 4, padT = 6, padB = 16;
  x.strokeStyle = '#cfd1d3'; x.lineWidth = 1; x.font = '10px Segoe UI'; x.fillStyle = '#555';
  for (let i = 0; i <= 6; i++) { const xx = padL + (W - padL - padR) * i / 6; x.beginPath(); x.moveTo(xx, padT); x.lineTo(xx, H - padB); x.stroke();
    const tm = t0 + win * i / 6; x.textAlign = i === 0 ? 'left' : i === 6 ? 'right' : 'center'; x.fillText(SZ.fmtT(Math.max(0, tm)).slice(-8, -3), xx, H - 4); }
  for (let i = 0; i <= 4; i++) { const yy = padT + (H - padT - padB) * i / 4; x.beginPath(); x.moveTo(padL, yy); x.lineTo(W - padR, yy); x.stroke(); }
  if (lg) lg.innerHTML = '';
  keys.forEach((k, i) => {
    const d = S.hist.d[k] || [], def = SZ.HV[k];
    let lo = Infinity, hi = -Infinity;
    for (let j = 0; j < t.length; j++) if (t[j] >= t0) { lo = Math.min(lo, d[j]); hi = Math.max(hi, d[j]); }
    const cur = def[2](S); lo = Math.min(lo, cur); hi = Math.max(hi, cur);
    if (fixed && fixed[k]) { lo = fixed[k][0]; hi = fixed[k][1]; }
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    const pad = Math.max((hi - lo) * 0.1, Math.abs(hi) * 0.02, 0.05); lo -= pad; hi += pad;
    const X = (tt) => padL + (W - padL - padR) * (tt - t0) / win, Y = (v) => padT + (H - padT - padB) * (1 - (v - lo) / (hi - lo));
    x.strokeStyle = UI.PEN[i % UI.PEN.length]; x.lineWidth = 1.6; x.beginPath(); let st = false;
    for (let j = 0; j < t.length; j++) { if (t[j] < t0) continue; const px = X(t[j]), py = Y(d[j]); if (!st) { x.moveTo(px, py); st = true; } else x.lineTo(px, py); }
    if (st) x.lineTo(X(t1), Y(cur)); x.stroke();
    if (lg) { lg.insertAdjacentHTML('beforeend', `<i style="background:${UI.PEN[i % UI.PEN.length]}"></i><span>${def[0]}</span><span class="v">${fx(cur, Math.abs(cur) < 10 ? 2 : 1)} ${def[1]}</span><span class="r">${fx(lo, 1)}–${fx(hi, 1)}</span>`); }
  });
};

/* ---------------- 8. ALARM BANNER ---------------- */
function buildBanner() {
  const b = $('#banner'); if (!b) return;
  const tb = h('table'); b.append(tb);
  UI.bind(tb, (S) => {
    const list = S.alarms.slice().sort((a, c) => (a.acked - c.acked) || (a.prio - c.prio) || (c.t - a.t)).slice(0, 3);
    if (!list.length) { tb.innerHTML = '<tr><td class="hint">No active alarms · <a href="alarms.html">alarm summary & event journal</a> · ' + SZ.fmtT(S.t) + '</td></tr>'; return; }
    tb.innerHTML = list.map(a => `<tr class="alm-row p${a.prio}${a.acked ? '' : ' unack'}${a.active ? '' : ' rtn'}" data-id="${a.id}" data-tag="${a.tag}"><td>P${a.prio}</td><td>${SZ.fmtT(a.t)}</td><td><b>${a.tag}</b></td><td class="msg">${a.msg}${a.active ? '' : ' (RTN)'}</td><td>${a.acked ? 'ACK' : 'UNACK'}</td></tr>`).join('') +
      (S.alarms.length > 3 ? `<tr><td colspan="5" class="hint">+${S.alarms.length - 3} more · <a href="alarms.html">alarm summary</a></td></tr>` : '');
  });
  tb.addEventListener('click', (e) => { const r = e.target.closest('tr[data-id]'); if (!r) return; SZ.cmd({ type: 'ack', id: r.dataset.id }); UI.go(r.dataset.tag); });
}

/* ---------------- 9. ALARM SOUNDS (Web Audio, synthesised — no sound files) ----------------
   P1: fast two-tone warble, repeats every 1.4 s until ACK / SILENCE
   P2: double beep, repeats every 4 s until ACK / SILENCE
   P3: single soft chime, once per new alarm
   Silence = horn off for the alarms standing now; any new alarm sounds again.                */
UI.audio = (function () {
  const ss = (k, v) => { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { return null; } };
  const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };
  const A = { ctx: null, on: ls('szsound') !== 'off', sounding: false, next: 0, cur: 0 };
  const silenced = new Set(JSON.parse(ss('szsil') || '[]')), played = new Set(JSON.parse(ss('szplayed') || '[]'));
  const keep = () => { ss('szsil', JSON.stringify([...silenced].slice(-200))); ss('szplayed', JSON.stringify([...played].slice(-200))); };
  const key = (a) => a.id + '@' + Math.round(a.t);
  function unlock() {
    if (!A.ctx) { try { A.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; } }
    if (A.ctx.state === 'suspended') A.ctx.resume();
  }
  ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, true));
  function claimSound() { ls('szsndowner', JSON.stringify({ id: SZ.rt.id, ts: Date.now() })); }
  ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, claimSound, true));
  window.addEventListener('focus', claimSound);
  function tone(f, t0, dur, type, vol, f2) {
    const c = A.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.linearRampToValueAtTime(f2, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
    g.gain.setValueAtTime(vol, t0 + dur - 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  A.play = function (p) {
    if (!A.ctx || A.ctx.state !== 'running') return;
    const t = A.ctx.currentTime + 0.02;
    if (p === 1) for (let i = 0; i < 6; i++) tone(i % 2 ? 700 : 1050, t + i * 0.14, 0.13, 'square', 0.10);
    else if (p === 2) { tone(620, t, 0.22, 'triangle', 0.22); tone(620, t + 0.32, 0.22, 'triangle', 0.22); }
    else tone(1046, t, 0.35, 'sine', 0.18, 784);
  };
  // PSV relief sound: filtered white noise — a "kshhhh" burst on lift, then a steady roar while relieving
  let hiss = null;
  function hissOn(level) {
    if (!A.ctx || A.ctx.state !== 'running') return;
    const c = A.ctx;
    if (!hiss) {
      const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500;
      const pk = c.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 4200; pk.Q.value = 0.8; pk.gain.value = 7;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.55, c.currentTime + 0.04);            // pop
      g.gain.exponentialRampToValueAtTime(0.12 + 0.16 * level, c.currentTime + 0.9);  // settle to roar
      src.connect(hp); hp.connect(pk); pk.connect(g); g.connect(c.destination); src.start();
      hiss = { src, g };
    } else hiss.g.gain.setTargetAtTime(0.12 + 0.16 * level, c.currentTime, 0.4);
  }
  function hissOff() { if (!hiss) return; const c = A.ctx, x = hiss; hiss = null; x.g.gain.setTargetAtTime(0.0001, c.currentTime, 0.3); x.src.stop(c.currentTime + 1.5); }
  // flare roar: low-pass brown noise with a slow flicker; louder and deeper as flare load rises
  let roar = null;
  function roarOn(level) {
    if (!A.ctx || A.ctx.state !== 'running') return;
    const c = A.ctx, vol = 0.06 + 0.5 * level;
    if (!roar) {
      const len = c.sampleRate * 3, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      let last = 0; for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
      const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260 + 380 * level; lp.Q.value = 0.7;
      const g = c.createGain(); g.gain.value = 0.0001;
      const flick = c.createGain(); flick.gain.value = 1;                    // flame flicker
      const lfo = c.createOscillator(); lfo.frequency.value = 2.3; const lfoG = c.createGain(); lfoG.gain.value = 0.25;
      lfo.connect(lfoG); lfoG.connect(flick.gain); lfo.start();
      src.connect(lp); lp.connect(flick); flick.connect(g); g.connect(c.destination); src.start();
      g.gain.setTargetAtTime(vol, c.currentTime, 0.6);
      roar = { src, g, lp, lfo };
    } else { roar.g.gain.setTargetAtTime(vol, c.currentTime, 0.8); roar.lp.frequency.setTargetAtTime(260 + 380 * level, c.currentTime, 0.8); }
  }
  function roarOff() { if (!roar) return; const c = A.ctx, x = roar; roar = null; x.g.gain.setTargetAtTime(0.0001, c.currentTime, 0.8); x.src.stop(c.currentTime + 4); x.lfo.stop(c.currentTime + 4); }
  A.testRoar = () => { unlock(); setTimeout(() => { roarOn(0.5); setTimeout(roarOff, 3500); }, 60); };
  A.testHiss = () => { unlock(); setTimeout(() => { hissOn(0.6); setTimeout(hissOff, 2200); }, 60); };
  A.test = (p) => { unlock(); setTimeout(() => A.play(p), 60); };
  A.toggle = () => { A.on = !A.on; ls('szsound', A.on ? 'on' : 'off'); if (A.on) unlock(); SZ.render(); };
  A.silence = () => { const S = SZ.rt.S; if (!S) return; S.alarms.forEach(a => silenced.add(key(a))); keep(); A.sounding = false; SZ.render(); };
  A.update = function (S) {
    if (!S) return;
    const live = S.alarms.filter(a => a.active && !a.acked && !silenced.has(key(a)));
    const horn = live.filter(a => a.prio <= 2);
    const p = horn.length ? Math.min(...horn.map(a => a.prio)) : 0;
    A.sounding = p > 0;
    const relieving = S.psv ? Object.values(S.psv).filter(x => x.open) : [];
    A.relieving = relieving.length > 0;
    if (!A.on || document.hidden || S.frozen) { hissOff(); roarOff(); return; }
    // with several windows open, only one plays the horn: the last one you clicked or focused
    let o = null; try { o = JSON.parse(ls('szsndowner') || 'null'); } catch (e) { o = null; }
    if (!o || Date.now() - o.ts > 3000 || o.id === SZ.rt.id) claimSound(); else { hissOff(); roarOff(); return; }
    if (relieving.length) hissOn(Math.min(1, relieving.reduce((s, x) => s + x.f, 0) / 30)); else hissOff();
    const fl = S.p.flare || 0;                                    // flare roar above 1 t/h, full at ≈ 40 t/h
    if (fl > 1) roarOn(Math.min(1, (fl - 1) / 40)); else if (fl < 0.8) roarOff();
    const now = Date.now();
    if (p && (now >= A.next || p < A.cur)) { A.play(p); A.cur = p; A.next = now + (p === 1 ? 1400 : 4000); }
    if (!p) A.cur = 0;
    const fresh = live.filter(a => a.prio === 3 && !played.has(key(a)));
    if (fresh.length) { fresh.forEach(a => played.add(key(a))); keep(); if (!p) A.play(3); }
  };
  return A;
})();

/* ---------------- PAGE BOOTSTRAP ---------------- */
/* ---------------- 10. POP-OUT WINDOWS ----------------
   Any page opened with ?pop=1 becomes a compact window (no page tabs, no side panel)
   that follows the same live simulation — put alarms or trends on a second screen.   */
UI.isPop = new URLSearchParams(location.search).has('pop');
UI.popout = function (page, hash, w, hh) {
  const url = UI.resolve(page + '.html?pop=1' + (hash ? '#' + hash : ''));
  const win = window.open(url, 'sz_pop_' + page + (hash || ''), 'popup=yes,width=' + (w || 980) + ',height=' + (hh || 640));
  if (win) win.focus(); else location.href = url;   // pop-ups blocked → open here
};
UI.POPS = [['alarms', '', 'Alarm summary & journal', 1000, 620], ['trends', '', 'Trends (all groups)', 1100, 800],
  ['trends', 'temps', 'Trend — temperatures', 760, 460], ['trends', 'press', 'Trend — pressure vs dew point', 760, 460],
  ['trends', 'prod', 'Trend — production', 760, 460], ['index', '', 'Plant overview graphic', 1200, 760]];
function popMenuButton() {
  const wrap = h('span', { style: 'position:relative' });
  const b = h('button', { title: 'Open a view in its own window — drag it to a second screen or snap it side by side' }, '⧉ POP OUT');
  const menu = h('div', { class: 'popmenu' }); menu.style.display = 'none';
  const all = UI.POPS.concat([[UI.pageId, (UI.pageId === 'trends' ? location.hash.slice(1) : ''), 'This page (' + ((UI.PAGES.find(p => p[0] === UI.pageId) || [, 'page'])[1]) + ')', 1200, 760]]);
  for (const [pg, hs, label, w, hh] of all) menu.append(h('button', { on: { click: () => { menu.style.display = 'none'; UI.popout(pg, hs, w, hh); } } }, label));
  b.addEventListener('click', (e) => { e.stopPropagation(); menu.style.display = menu.style.display === 'none' ? '' : 'none'; });
  document.addEventListener('click', () => menu.style.display = 'none');
  wrap.append(b, menu); return wrap;
}

/* ---------------- 11. SAFETY ALERT POP-UP ----------------
   Equipment trips, PSV lifts and SIS trips open a large alert over the screen. Closing it is shared
   by all open windows. The alarm horn keeps going until the alarm itself is acknowledged.       */
let alertSig = '';
UI.alertUpdate = function (S) {
  const open = (S.alerts || []).filter(a => !a.closed);
  const sig = open.map(a => a.id).join(',');
  if (sig === alertSig) return; alertSig = sig;
  let ov = $('#szalert');
  if (!open.length) { if (ov) ov.remove(); return; }
  const a = open[0];
  if (!ov) { ov = h('div', { id: 'szalert' }); document.body.append(ov); }
  const kindTxt = { trip: 'EQUIPMENT TRIP', psv: 'PRESSURE RELIEF', sis: 'SAFETY SYSTEM' }[a.kind] || 'ALERT';
  const tag = EQTAG[a.tag] || a.tag;
  ov.className = 'k-' + a.kind;
  ov.innerHTML = `<div class="ab"><div class="ah"><span class="blink">⚠</span> ${kindTxt}<span class="at">${SZ.fmtT(a.t)}</span></div>
    <div class="abd"><div class="att">${a.title}</div><div class="amsg">${a.msg}</div>
    ${open.length > 1 ? `<div class="amore">+ ${open.length - 1} more alert${open.length > 2 ? 's' : ''} waiting</div>` : ''}</div>
    <div class="abtn"><button data-a="go">Go to ${tag}</button><button data-a="close">Close</button><button data-a="ack" class="on">Close + ACK alarms</button>${open.length > 1 ? '<button data-a="all">Close all</button>' : ''}</div></div>`;
  ov.querySelector('.abtn').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.a === 'go') { SZ.cmd({ type: 'alertClose', id: a.id }); UI.go(tag); }
    if (b.dataset.a === 'close') SZ.cmd({ type: 'alertClose', id: a.id });
    if (b.dataset.a === 'ack') SZ.cmd({ type: 'alertClose', id: a.id, ack: true });
    if (b.dataset.a === 'all') SZ.cmd({ type: 'alertClose', id: 'ALL' });
  });
};

/* ---------------- 12. APP INSTALL & AUTOMATIC UPDATES ----------------
   When served over http(s) (GitHub Pages or the local launcher) the simulator registers a service
   worker (sw.js): pages load fresh when online and still work offline. version.json is checked every
   10 min; if a newer version has been published, a banner offers to reload. Browsers that support it
   show an INSTALL APP button so the simulator gets its own window and desktop icon.              */
UI.appInit = function () {
  if (window.claude && typeof window.claude.use === 'function') return;   // inside claude.ai: no service worker, no update check
  if (window.SZ_SINGLE) {                                       // single-file offline copy: just tell the user if a newer one is online
    setTimeout(async () => {
      try {
        const j = await (await fetch(UI.ONLINE + 'version.json?t=' + Date.now(), { cache: 'no-store' })).json();
        if (j && j.ver > SZ.CODE_VER && !$('#szupd') && !UI.isPop) {
          const b = h('div', { id: 'szupd' }, '<b>Newer version ' + (j.label || j.ver) + ' is online</b><span>' + (j.notes || '') + '</span>');
          b.append(h('button', { class: 'on', on: { click: () => window.open(UI.ONLINE, '_blank') } }, 'Open online version'),
            h('button', { on: { click: () => window.open(UI.ONLINE + 'docs/Spherizone-DCS-Simulator-offline.html', '_blank') } }, 'Download new single file'),
            h('button', { on: { click: () => b.remove() } }, 'Later'));
          document.body.append(b);
        }
      } catch (e) { }                                             // offline: nothing to check
    }, 5000);
    return;
  }
  if (!/^https?:/.test(location.protocol)) return;            // opened from a folder (file://): no app features
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
  const check = async () => {
    try {
      const j = await (await fetch('version.json?t=' + Date.now(), { cache: 'no-store' })).json();
      if (j && j.ver > SZ.CODE_VER && !$('#szupd')) {
        const b = h('div', { id: 'szupd' }, '<b>New version ' + (j.label || j.ver) + ' available</b><span>' + (j.notes || '') + '</span>');
        const r = h('button', { class: 'on', on: { click: () => { SZ.save && SZ.save(); location.reload(); } } }, 'Reload now');
        const x = h('button', { on: { click: () => b.remove() } }, 'Later');
        b.append(r, x); document.body.append(b);
      }
    } catch (e) { }
  };
  setTimeout(check, 4000); setInterval(check, 10 * 60 * 1000);
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); UI.installEvt = e;
    if ($('#szinst') || UI.isPop) return;
    const ib = h('button', { id: 'szinst', title: 'Install the simulator as an app (own window, desktop icon, works offline)' }, '⬇ INSTALL APP');
    ib.addEventListener('click', async () => { UI.installEvt.prompt(); await UI.installEvt.userChoice; ib.remove(); });
    $('#hdr .hrow').append(ib);
  });
};

UI.page = function (cfg) {
  UI.pageId = document.body.dataset.page;
  if (UI.isPop) { document.body.classList.add('pop'); document.title = '⧉ ' + document.title; }
  SZ.start();       // loads / initialises shared simulation state
  buildHeader();
  if (!UI.isPop) $('#hdr .hrow').append(popMenuButton());
  UI.appInit();
  const view = $('#view'), side = $('#side');
  if (cfg.graphic !== false) {
    const wrap = h('div', { class: 'gfxwrap' });
    const svg = sv('svg', { class: 'gfx', viewBox: cfg.viewBox || '0 0 1200 660', preserveAspectRatio: 'xMidYMid meet' });
    wrap.append(svg); view.append(wrap);
    UI.d = kit(svg); cfg.draw && cfg.draw(UI.d);
  }
  if (cfg.panels) { const pn = h('div', { class: 'panels' }); view.append(pn); cfg.panels(pn); }
  if (cfg.body) cfg.body(view);
  if (side) {
    if (UI.pageId !== 'manual') side.append(UI.sessionCard());
    if (cfg.faceplate !== false) {
      const fp = UI.card('Faceplate', ' <button class="fpclose" title="Close faceplate">✕ close</button>'); fp.id = 'fp'; side.append(fp);
      fp.querySelector('.fpclose').addEventListener('click', () => fp.classList.remove('sheet'));
    }
    (cfg.side || ['kpi']).forEach(s => { if (typeof s === 'function') side.append(s()); else if (s === 'kpi') side.append(UI.kpiCard()); else if (s.startsWith('trend:')) side.append(UI.trendCard(s.slice(6))); else if (typeof s === 'function') side.append(s()); });
  }
  buildBanner();
  const hashTag = decodeURIComponent(location.hash.slice(1));
  let sel = null; try { sel = sessionStorage.getItem('szsel.' + UI.pageId); } catch (e) { }
  UI.sel = hashTag && (SZ.CTL[hashTag] || TAGEQ[hashTag] || UI.TAGPAGE[hashTag]) ? hashTag : (sel || cfg.defaultTag || null);
  buildFaceplate();
  const foot = h('div', { class: 'disclaimer' }, 'Training-grade dynamic model — first-order and energy balances tuned for operator training. NOT licensor data. Spherizone and Avant are trademarks of the LyondellBasell family of companies.');
  document.body.append(foot);
  SZ.onRender((S) => { UI.audio.update(S); UI.alertUpdate(S); renderBinds(S); for (const [el, fn] of fpBinds) fn(S, el); });
  SZ.render();
  // first page opened in this browser session (and this tab runs the model) → ask for the plant condition
  let asked = null; try { asked = sessionStorage.getItem('szsession'); } catch (e) { asked = '1'; }
  if (!asked && SZ.rt.leader && UI.pageId !== 'manual' && !UI.isPop) UI.sessionMenu(false);
};
})(window);
