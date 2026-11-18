/* =====================================================================
   SPHERIZONE DCS SIMULATOR — RUNTIME CORE
   Sections: 1 journal & alarms · 2 lab sampling & history · 3 operator / instructor
             command execution · 4 instructor logic (failures, exercises, init)
             · 5 shared-state runtime (one simulation shared by every page)
   ===================================================================== */
(function (G) {
'use strict';
const SZ = G.SZ;
const fmtT = SZ.fmtT = (t) => { t = Math.max(0, Math.floor(t)); const d = Math.floor(t / 86400), h = Math.floor(t / 3600) % 24, m = Math.floor(t / 60) % 60, s = t % 60;
  return (d ? 'D' + (d + 1) + ' ' : '') + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0'); };

/* ---------------- 1. JOURNAL & ALARMS ---------------- */
SZ.log = function (S, src, msg) { S.journal.unshift({ t: S.t, src, msg }); if (S.journal.length > 400) S.journal.length = 400; };

// [id, tag, priority, message, page, condition]
const ALM = [
  ['TAHH211', 'TIC-211', 1, 'MZCR temperature HH ≥ 90 °C', 'mzcr', (S) => S.p.T211 >= 90],
  ['TAH211', 'TIC-211', 2, 'MZCR temperature high ≥ 85 °C', 'mzcr', (S) => S.p.T211 >= 85 && S.p.T211 < 90],
  ['TAL211', 'TIC-211', 3, 'MZCR temperature low ≤ 68 °C', 'mzcr', (S) => S.p.T211 <= 68 && (S.p.rMZ > 2 || S.p.P211 > 15)],
  ['DEW211', 'PIC-211', 1, 'Dew-point margin Pvap − P < 3 bar (condensation risk)', 'mzcr', (S) => S.p.dew < 3],
  ['PAH211', 'PIC-211', 2, 'MZCR pressure high ≥ 31 barg', 'mzcr', (S) => S.p.P211 >= 31],
  ['PAL211', 'PIC-211', 2, 'MZCR pressure low ≤ 24 barg', 'mzcr', (S) => S.p.P211 <= 24],
  ['ADV211', 'AIC-211', 3, 'Riser H2 deviation > 20 % of SP', 'mzcr', (S) => Math.abs(S.ctl['AIC-211'].pv - S.ctl['AIC-211'].sp) > 0.2 * Math.max(S.ctl['AIC-211'].sp, 0.2) && S.ctl['AIC-211'].mode === 'AUTO'],
  ['FDV101', 'FIC-101', 3, 'Catalyst flow deviation > 15 %', 'catalyst', (S) => S.ctl['FIC-101'].mode === 'AUTO' && Math.abs(S.ctl['FIC-101'].pv - S.ctl['FIC-101'].sp) > 0.15 * Math.max(S.ctl['FIC-101'].sp, 0.05)],
  ['FFL102', 'FFIC-102', 2, 'TEAL/catalyst ratio low < 3 g/g', 'catalyst', (S) => S.p.catMeas > 0.05 && S.ctl['FFIC-102'].pv < 3],
  ['AI001', 'AI-001', 2, 'Feed poison analyser AI-001 high > 1 ppm', 'catalyst', (S) => (S.poison.H2O + S.poison.CO + S.poison.COS) > 1],
  ['XS211', 'TIC-211', 2, 'Sticky product: XS above limit for MZCR temperature', 'mzcr', (S) => S.p.sticky > 0],
  ['FOUL', 'TIC-211', 2, 'MZCR fouling index > 30 %', 'mzcr', (S) => S.p.foul > 30],
  ['K211', 'K-211', 1, 'Cycle-gas compressor K-211 STOPPED', 'mzcr', (S) => !S.eq.K211],
  ['P701', 'P-701', 1, 'Cooling-water pump P-701 STOPPED', 'mzcr', (S) => !S.eq.P701],
  ['TEALP', 'P-102', 2, 'TEAL pump P-102 STOPPED', 'catalyst', (S) => !S.eq.TEALP],
  ['PRODL', 'R-211', 3, 'MZCR production low < 20 t/h', 'mzcr', (S) => S.p.rMZ < 20 && S.sis.kill === 'NORMAL'],
  ['PAH301', 'PIC-301', 2, 'Flash D-301 pressure high ≥ 20 barg', 'flash', (S) => S.p.P301 >= 20],
  ['PAL301', 'PIC-301', 3, 'Flash D-301 pressure low ≤ 15 barg', 'flash', (S) => S.p.P301 <= 15],
  ['TAHH401', 'TIC-401', 1, 'GPR temperature HH ≥ 90 °C', 'gpr', (S) => S.eq.GPR && S.p.T401 >= 90],
  ['TAH401', 'TIC-401', 2, 'GPR temperature high ≥ 83 °C', 'gpr', (S) => S.eq.GPR && S.p.T401 >= 83 && S.p.T401 < 90],
  ['LAH401', 'LIC-401', 2, 'GPR bed level high ≥ 80 %', 'gpr', (S) => S.eq.GPR && S.p.lvl401 >= 80],
  ['LAL401', 'LIC-401', 2, 'GPR bed level low ≤ 35 %', 'gpr', (S) => S.eq.GPR && S.p.lvl401 <= 35],
  ['K401', 'K-401', 1, 'GPR compressor K-401 STOPPED (in service)', 'gpr', (S) => S.eq.GPR && !S.eq.K401],
  ['CHUNK', 'R-401', 2, 'GPR chunk / sheeting index > 40', 'gpr', (S) => S.eq.GPR && S.p.chunk > 40],
  ['LAH601', 'LIC-601', 2, 'Silo D-601 level high ≥ 85 %', 'finishing', (S) => S.p.siloLvl >= 85 && S.p.siloLvl < 95],
  ['LAHH601', 'LIC-601', 1, 'Silo D-601 level HH ≥ 95 %', 'finishing', (S) => S.p.siloLvl >= 95],
  ['LAL601', 'LIC-601', 3, 'Silo D-601 level low ≤ 10 %', 'finishing', (S) => S.p.siloLvl <= 10],
  ['EX601', 'EX-601', 2, 'Extruder EX-601 STOPPED', 'finishing', (S) => !S.eq.EX601],
  ['STEAM', 'D-501', 2, 'Steamer D-501 steam OFF — catalyst not deactivated', 'finishing', (S) => !S.eq.STEAM],
  ['OFFSPEC', 'LAB', 3, 'Pellets OFF-SPEC for target grade', 'quality', (S) => !S.p.pelOk],
  ['GRADE', 'LAB', 3, 'Current SPs differ from target-grade recipe', 'quality', (S) => S.recipeDiff > 0 && S.level !== 'hard'],   // a hint: suppressed in HARD mode
  ['KILL', 'XV-901', 1, 'CO KILL injected — reaction stopped', 'mzcr', (S) => S.sis.kill === 'INJECTED' || S.sis.kill === 'PURGE'],
  ['CATCUT', 'FIC-101', 1, 'SIS: catalyst feed cut (silo HH) — reset required', 'catalyst', (S) => S.sis.catCut],
  ['SISBYP', 'SIS', 1, 'SIS BYPASSED by instructor', 'instructor', (S) => S.sis.bypass],
  ['PSV211', 'PSV-211', 1, 'PSV-211 LIFTED — R-211 relieving to flare', 'mzcr', (S) => !!(S.psv && S.psv['PSV-211'] && S.psv['PSV-211'].open)],
  ['PSV301', 'PSV-301', 1, 'PSV-301 LIFTED — D-301 relieving to flare', 'flash', (S) => !!(S.psv && S.psv['PSV-301'] && S.psv['PSV-301'].open)],
  ['PSV401', 'PSV-401', 1, 'PSV-401 LIFTED — R-401 relieving to flare', 'gpr', (S) => !!(S.psv && S.psv['PSV-401'] && S.psv['PSV-401'].open)],
  ['FLARE', 'FL-901', 2, 'Flare load high > 5 t/h', 'utilities', (S) => (S.p.flare || 0) > 5],
  ['KO901', 'D-901', 2, 'Flare knock-out drum D-901 level high ≥ 60 %', 'utilities', (S) => (S.p.koLvl || 0) >= 60]
];
SZ.ALM = ALM;

// State-based alarm suppression (ISA-18.2): alarms that are meaningless while the plant is down
const SUP_IDLE = new Set(['K211', 'P701', 'TEALP', 'FDV101', 'FFL102']);                        // no reaction & no catalyst
const SUP_LOW = new Set(['PRODL', 'PAL211', 'PAL301', 'LAL601', 'EX601', 'STEAM', 'OFFSPEC', 'GRADE', 'ADV211']);  // < 5 t/h
SZ.evalAlarms = function (S) {
  S.recipeDiff = SZ.recipeDiffCount(S);
  const idle = SZ.isIdle(S), low = SZ.isLow(S);
  for (const [id, tag, prio, msg, page, cond] of ALM) {
    let on = false; try { on = !!cond(S); } catch (e) { on = false; }
    if ((idle && SUP_IDLE.has(id)) || (low && SUP_LOW.has(id))) on = false;
    let a = S.alarms.find(x => x.id === id);
    if (on && !a) { S.alarms.unshift({ id, tag, prio, msg, page, t: S.t, active: true, acked: false }); SZ.log(S, 'ALARM', 'P' + prio + ' ' + tag + ' ' + msg); }
    else if (on && a && !a.active) { a.active = true; a.acked = false; a.t = S.t; SZ.log(S, 'ALARM', 'P' + prio + ' ' + tag + ' ' + msg); }
    else if (!on && a && a.active) { a.active = false; a.rtn = S.t; SZ.log(S, 'RTN', tag + ' ' + msg); if (a.acked) S.alarms.splice(S.alarms.indexOf(a), 1); }
  }
};
SZ.ackAlarm = function (S, id) {
  for (const a of S.alarms.slice()) if (id === 'ALL' || a.id === id) { a.acked = true; if (!a.active) S.alarms.splice(S.alarms.indexOf(a), 1); }
};

/* ---------------- 2. LAB SAMPLING & HISTORY ---------------- */
function takeSample(S, kind) {
  S.sampleNo++;
  S.lab.unshift({ no: S.sampleNo, kind, t: S.t, due: S.t + 600, grade: S.target, props: Object.assign({}, S.p.pel), steam: S.eq.STEAM, add: SZ.addOk(S) });
  if (S.lab.length > 40) S.lab.length = 40;
}
SZ.HV = {
  T211: ['MZCR T TIC-211', '°C', S => S.p.T211], SP211: ['TIC-211 SP', '°C', S => S.ctl['TIC-211'].sp], T401: ['GPR T TIC-401', '°C', S => S.p.T401], T101: ['Prepoly T TI-101', '°C', S => S.p.T101],
  rMZ: ['MZCR production', 't/h', S => S.p.rMZ], rG: ['GPR rubber production', 't/h', S => S.p.rG], prod: ['Total production', 't/h', S => S.p.prodTot], ex: ['Extruder rate', 't/h', S => S.p.exRate],
  cat: ['Catalyst FIC-101 PV', 'kg/h', S => S.p.catMeas],
  MFRi: ['MFR instantaneous', 'g/10min', S => S.p.inst.MFR], MFRp: ['MFR pellet', 'g/10min', S => S.p.pel.MFR], XSi: ['XS instantaneous', 'wt%', S => S.p.inst.XS], XSp: ['XS pellet', 'wt%', S => S.p.pel.XS],
  C2p: ['C2 pellet', 'wt%', S => S.p.pel.C2], RUBp: ['Rubber pellet', '%', S => S.p.pel.RUB], PIp: ['PI pellet', '', S => S.p.pel.PI],
  OP211: ['TIC-211 OP (E-211 CW)', '%', S => S.ctl['TIC-211'].op], OP401: ['TIC-401 OP (E-401 CW)', '%', S => S.ctl['TIC-401'].op], OPmk: ['PIC-211 OP (make-up)', '%', S => S.ctl['PIC-211'].op],
  QH: ['E-212 heater duty (% of 4 MW)', '%', S => (S.p.Qh || 0) * 25],
  P211: ['MZCR P PIC-211', 'barg', S => S.p.P211], PVAP: ['C3 vapour pressure (dew)', 'barg', S => S.p.pvap - 1.013], P301: ['Flash P PIC-301', 'barg', S => S.p.P301],
  H2r: ['Riser H2 AIC-211', 'mol%', S => S.p.H2r], H2d: ['Downer H2 AI-212', 'mol%', S => S.p.H2d], H2sp: ['AIC-211 SP', 'mol%', S => S.ctl['AIC-211'].sp], BAR: ['Barrier FIC-212', 't/h', S => S.p.F212],
  L401: ['GPR level LIC-401', '%', S => S.p.lvl401], C2R: ['C2/(C2+C3) ×100', '%', S => S.p.c2r * 100], P401: ['GPR P PIC-401', 'barg', S => S.p.P401],
  SILO: ['Silo level LIC-601', '%', S => S.p.siloLvl], FOUL: ['Fouling index', '%', S => S.p.foul]
};
SZ.TRENDS = {
  temps: ['Temperatures', ['T211', 'SP211', 'T401', 'T101']],
  prod: ['Production', ['rMZ', 'rG', 'prod', 'ex']],
  quality: ['Quality (inst vs pellet)', ['MFRi', 'MFRp', 'XSi', 'XSp']],
  cooling: ['Cooling / heating', ['OP211', 'QH', 'OP401', 'OPmk']],
  press: ['MZCR pressure vs vapour pressure', ['P211', 'PVAP', 'P301']],
  h2: ['Hydrogen zones', ['H2r', 'H2d', 'H2sp', 'BAR']],
  gpr: ['GPR (HECO)', ['L401', 'C2R', 'RUBp', 'P401']],
  silo: ['Silo / extruder', ['SILO', 'ex', 'prod']],
  cat: ['Catalyst & fouling', ['cat', 'FOUL', 'PIp', 'C2p']]
};
function sampleHist(S) {
  const h = S.hist; h.t.push(Math.round(S.t));
  for (const k in SZ.HV) { const v = SZ.HV[k][2](S); if (!h.d[k]) h.d[k] = new Array(h.t.length - 1).fill(+(+v).toPrecision(4)); h.d[k].push(+(+v).toPrecision(4)); }
  if (h.t.length > 720) { h.t.shift(); for (const k in h.d) h.d[k].shift(); }
}

SZ.advance = function (S, secs) {
  let rem = secs;
  while (rem > 1e-6) {
    const dt = Math.min(1, rem); rem -= dt;
    SZ.step(S, dt);
    SZ.evalAlarms(S);
    SZ.procEval(S);
    if (S.t >= S.nextSample) { takeSample(S, 'ROUTINE'); S.nextSample += 1800; }
    if (S.t >= S.histNext) { sampleHist(S); S.histNext = S.t + 10; }
  }
};

/* ---------------- 3. COMMANDS (operator + instructor) ---------------- */
const MOTOR_FAIL = { P701: 'cwTrip', K211: 'k211Trip', K401: 'k401Trip', EX601: 'exTrip', TEALP: 'tealTrip' };
const n = (v, d) => (+v).toFixed(d == null ? 2 : d);

SZ.recipeDiffCount = function (S) {
  let c = 0;
  for (const [, key, val] of SZ.recipeItems(S.target)) { const cur = SZ.currentValue(S, key); if (!SZ.sameVal(cur, val)) c++; }
  return c;
};
SZ.currentValue = function (S, key) {
  if (key === 'donor') return S.donor;
  if (key === 'GPR') return S.eq.GPR ? 'SERVICE' : 'BYPASS';
  if (key === 'HIC-213') return S.ctl[key].op;
  return S.ctl[key] ? S.ctl[key].sp : null;
};
SZ.sameVal = function (a, b) { if (typeof b === 'string') return a === b; return Math.abs(a - b) <= Math.max(0.02 * Math.abs(b), 1e-3); };

SZ.applyRecipe = function (S, grade) {
  const g = SZ.GRADES[grade];
  for (const [, key, val] of SZ.recipeItems(grade)) {
    if (key === 'donor') S.donor = val;
    else if (key === 'GPR') { S.eq.GPR = val === 'SERVICE'; if (S.eq.GPR) { S.eq.K401 = !S.fail.k401Trip; S.ctl['LIC-401'].mode = 'AUTO'; S.ctl['LIC-401'].sp = g.gprLvl || 60; } }
    else if (key === 'HIC-213') S.ctl[key].op = val;
    else { S.ctl[key].sp = val; if (S.ctl[key].mode === 'MAN' && key !== 'LIC-401') S.ctl[key].mode = 'AUTO'; }
  }
  S.add = Object.assign({}, g.add);
  S.target = grade; S.grade = grade;
};

SZ.exec = function (S, c) {
  const src = c.src || 'OPERATOR', C = S.ctl, def = SZ.CTL[c.tag];
  const L = (m) => SZ.log(S, src, m);
  switch (c.type) {
    case 'sp': { if (!C[c.tag] || def.hand) return; const o = C[c.tag].sp; C[c.tag].sp = SZ.clamp(+c.v, def.lo, def.hi); L(c.tag + ' SP ' + n(o, def.dec) + ' → ' + n(C[c.tag].sp, def.dec)); break; }
    case 'op': { if (!C[c.tag]) return; if (C[c.tag].mode !== 'MAN') { L(c.tag + ' OP entry refused (not MAN)'); return; } const o = C[c.tag].op; C[c.tag].op = SZ.clamp(+c.v, 0, 100); L(c.tag + ' OP ' + n(o, 1) + ' → ' + n(C[c.tag].op, 1) + ' %'); break; }
    case 'mode': { if (!C[c.tag] || def.hand) return; if (c.tag === 'FIC-101' && S.sis.catCut && c.m === 'AUTO') { L('FIC-101 AUTO refused — SIS catalyst cut active'); return; }
      if (c.tag === 'LIC-401' && !S.eq.GPR && c.m === 'AUTO') { L('LIC-401 AUTO refused — GPR bypassed'); return; }
      C[c.tag].mode = c.m; C[c.tag].e1 = C[c.tag].e2 = 0; L(c.tag + ' mode → ' + c.m); break; }
    case 'nudge': { const x = C[c.tag]; if (!x) return; if (x.mode === 'AUTO' && !def.hand) { x.sp = SZ.clamp(x.sp + c.dir * (def.hi - def.lo) * 0.005, def.lo, def.hi); L(c.tag + ' SP nudge → ' + n(x.sp, def.dec)); }
      else { x.op = SZ.clamp(x.op + c.dir, 0, 100); L(c.tag + ' OP nudge → ' + n(x.op, 1) + ' %'); } break; }
    case 'motor': { const f = MOTOR_FAIL[c.eq]; if (c.on && f && S.fail[f]) { L(SZ.EQ[c.eq].d + ' START refused — motor tripped (MCC lock-out)'); return; }
      if (c.eq === 'CATF' && c.on && S.sis.catCut) { L('Catalyst feeder START refused — SIS cut active'); return; }
      if (c.eq === 'HTR' && c.on && !S.eq.K211) { L('E-212 heater START refused — K-211 not running (no cycle-gas flow)'); return; }
      if (c.eq === 'HTR' && c.on && S.p.T211 >= 85) { L('E-212 heater START refused — R-211 above 85 °C'); return; }
      S.eq[c.eq] = !!c.on; if (S.trip) delete S.trip[c.eq]; L(SZ.EQ[c.eq].d + (c.on ? ' START' : ' STOP')); break; }
    case 'gpr': { S.eq.GPR = !!c.on; if (c.on) { S.eq.K401 = !S.fail.k401Trip; } L('HS-302 GPR R-401 → ' + (c.on ? 'IN SERVICE' : 'BYPASS')); break; }
    case 'donor': { S.donor = c.v; L('External donor drum switched to ' + c.v + '-donor'); break; }
    case 'kill': { const k = S.sis;
      if (c.a === 'ARM' && k.kill === 'NORMAL') k.kill = 'ARMED';
      else if (c.a === 'DISARM' && k.kill === 'ARMED') k.kill = 'NORMAL';
      else if (c.a === 'INJECT' && k.kill === 'ARMED') { k.kill = 'INJECTED'; if (S.p.P211 > 10) SZ.flareBurst(S, 15); C['FIC-101'].mode = 'MAN'; C['FIC-101'].op = 0; }
      else if (c.a === 'RESET' && k.kill === 'INJECTED') k.kill = 'PURGE';
      else { L('XV-901 ' + c.a + ' not allowed in state ' + k.kill); return; }
      L('XV-901 CO kill ' + c.a + ' → ' + k.kill); break; }
    case 'recipe': if (S.level === 'hard' && src !== 'INSTRUCTOR') { L('Apply recipe refused — HARD mode (enter SPs from the manual)'); return; } SZ.applyRecipe(S, c.grade); L('Recipe SPs applied for grade ' + c.grade); break;
    case 'target': S.target = c.grade; L('Target grade set to ' + c.grade); break;
    case 'add': { const o = S.add[c.k]; S.add[c.k] = Math.max(0, +c.v); L('Additive ' + c.k + ' ' + o + ' → ' + S.add[c.k] + ' ppm'); break; }
    case 'speed': S.speed = +c.v; L('Simulation speed ' + c.v + '×'); break;
    case 'freeze': S.frozen = !!c.on; L(c.on ? 'Simulation FROZEN' : 'Simulation RUN'); break;
    case 'ack': SZ.ackAlarm(S, c.id || 'ALL'); if (c.id === 'ALL' || !c.id) L('Alarms acknowledged (all)'); break;
    case 'noise': S.noiseOn = !!c.on; L('Process noise / disturbances ' + (c.on ? 'ON' : 'OFF')); break;
    case 'alertClose': { for (const a of (S.alerts || [])) if (c.id === 'ALL' || a.id === c.id) { a.closed = true; if (c.ack) SZ.ackAlarm(S, 'ALL'); } return; }
    case 'spot': takeSample(S, 'SPOT'); L('Spot sample taken'); break;
    case 'level': { const v = c.v === 'hard' ? 'hard' : 'easy'; if (S.level === v) return; S.level = v; L('Difficulty set to ' + v.toUpperCase() + (v === 'hard' ? ' — recipe hints hidden' : ' — recipe hints shown')); if (S.proc && S.proc.complete == null && v === 'easy') S.proc.easyUsed = true; break; }
    case 'sisReset': if (S.p.siloLvl < 90) { S.sis.catCut = false; L('SIS catalyst cut RESET'); } else L('SIS reset refused — silo level ≥ 90 %'); break;
    // ---- instructor
    case 'fail': SZ.applyFail(S, c.name, c.on, 'INSTRUCTOR'); break;
    case 'clearFails': for (const f in S.fail) if (S.fail[f]) SZ.applyFail(S, f, false, 'INSTRUCTOR'); S.sched = []; break;
    case 'poison': S.poison[c.k] = Math.max(0, +c.v); L('Feed poison ' + c.k + ' = ' + c.v + ' ppm'); break;
    case 'sisBypass': S.sis.bypass = !!c.on; L('SIS bypass ' + (c.on ? 'ON' : 'OFF')); break;
    case 'resetFoul': S.p.foul = 0; S.p.chunk = 0; L('Fouling / chunk indices reset'); break;
  }
};

/* ---------------- 4. INSTRUCTOR LOGIC ---------------- */
SZ.FAILS = {
  cwTrip: 'Cooling-water pump P-701 trip', k211Trip: 'Cycle-gas compressor K-211 trip', catPlug: 'Catalyst feeder plug (meter reads normal)',
  tealTrip: 'TEAL pump P-102 trip', h2Frozen: 'Riser H2 analyser AIC-211 frozen', pic211Fail: 'PIC-211 fails in AUTO (output ramps open)',
  k401Trip: 'GPR compressor K-401 trip', lv401Stuck: 'GPR discharge valve LV-401 stuck', exTrip: 'Extruder EX-601 trip'
};
SZ.applyFail = function (S, name, on, src) {
  S.fail[name] = !!on;
  const eqMap = { cwTrip: 'P701', k211Trip: 'K211', k401Trip: 'K401', exTrip: 'EX601', tealTrip: 'TEALP' };
  if (on && eqMap[name]) SZ.tripEq(S, eqMap[name], SZ.FAILS[name] + ' (instructor failure). Start is locked out until the failure is cleared.');
  if (name === 'h2Frozen' && on) S.p.H2gc = S.p.H2r;
  if (name === 'lv401Stuck' && on) S.p.lv401 = S.ctl['LIC-401'].op;
  if (!(S.exercise && S.exercise.hidden && src === 'SCHEDULE')) SZ.log(S, src, 'FAILURE ' + (on ? 'ACTIVATED: ' : 'cleared: ') + SZ.FAILS[name]);
  else SZ.log(S, 'INSTRUCTOR', 'Hidden failure activated');
};

SZ.EXERCISES = [
  { id: 'gc-raco', title: 'Grade change H-INJ → R-7 (RACO)', start: 'H-INJ', brief: 'Plant on H-INJ. Change target to R-7: apply recipe, lower TIC-211 SP to 75 °C before adding ethylene, watch XS vs stickiness limit, track off-spec tonnes.' },
  { id: 'gc-heco', title: 'Grade change R-7 → I-12 (HECO start-up)', start: 'R-7', brief: 'Plant on R-7. Put R-401 in service (HS-302), start K-401, apply I-12 recipe, build bed level with LIC-401, bring C2/(C2+C3) and H2/C2 to SP. Rubber 15–19 %.' },
  { id: 'gc-bopp', title: 'Grade change I-12 → H-BOPP (donor change)', start: 'I-12', brief: 'Bypass GPR, switch donor C → D, set TEAL/donor 50 g/g. The donor transition lags by catalyst residence time — expect PI / XS to move slowly.' },
  { id: 'cw', title: 'Cooling-water pump trip', start: 'H-INJ', fail: 'cwTrip', delay: 120, brief: 'P-701 will trip. TIC-211 saturates. Cut catalyst, reduce temperature, decide on CO kill before SIS TZHH-211 (92 °C).' },
  { id: 'k211', title: 'Cycle-gas compressor K-211 trip', start: 'H-INJ', fail: 'k211Trip', delay: 120, brief: 'K-211 trips: riser loses fluidisation and E-211 duty. SIS kills after 60 s. Secure the reactor and recover.' },
  { id: 'hidden', title: 'Diagnose a hidden failure', start: 'H-INJ', hidden: true, delay: 300, brief: 'Something will go wrong within 5 min. No announcement. Use trends, KPIs and mass balances to diagnose.' },
  { id: 'poison', title: 'Feed poisoning (COS)', start: 'H-INJ', poison: { COS: 4 }, delay: 60, brief: 'COS rises in the propylene feed. Activity drops; respond with TEAL/cat ratio and catalyst rate.' },
  { id: 'psv', title: 'PIC-211 failure — PSV-211 lifts to flare', start: 'H-INJ', fail: 'pic211Fail', delay: 120, brief: 'PIC-211 output ramps the make-up valve open in AUTO. Pressure climbs past 31 barg (alarm) to the PSV-211 set pressure of 34 barg, and the PSV relieves to the flare. Spot it early: PIC-211 to MAN and close the make-up.' },
  { id: 'ex', title: 'Extruder trip — silo management', start: 'H-INJ', fail: 'exTrip', delay: 120, brief: 'EX-601 trips. Silo fills at production rate. Reduce rates before LZHH-601 (95 %) cuts catalyst.' }
];
SZ.initSteady = function (grade, keep) {
  const S = SZ.newState(grade), r = SZ.solveRecipe(grade), C = S.ctl, p = S.p;
  if (keep) { S.speed = keep.speed; }
  SZ.applyRecipe(S, grade);
  const set = (t, op) => { C[t].op = op; C[t].pv = C[t].sp; };
  set('FIC-101', r.cat / 1.5 * 100); set('FFIC-102', r.tealCat * r.cat / 10 * 100); set('FFIC-103', r.tealCat * r.cat / r.tealDon * 100);
  set('FIC-201', 22 / 40 * 100); C['FIC-201'].sp = 22; set('FIC-212', r.barrier / 12 * 100); set('FIC-203', r.ethyl / 2500 * 100);
  set('PIC-211', 53); set('AIC-211', r.H2r / 0.6 / 12 * 100); set('TIC-211', 35); C['PIC-301'].sp = 18; set('PIC-301', 16.5);
  C['LIC-601'].sp = 50; set('LIC-601', (r.gpr ? 36 : 30) / 50 * 100);
  if (r.gpr) { set('TIC-401', 35); set('PIC-401', 29); set('AIC-401', 42); set('AIC-402', 45); set('LIC-401', 40); p.M401 = 36; p.lvl401 = 60; p.c2r = r.c2ratio; p.h2c2 = r.h2c2; p.actG = 1; p.T401 = r.gprT; p.P401 = r.gprP; }
  else { C['TIC-401'].sp = 75; C['PIC-401'].sp = 14; C['AIC-401'].sp = 0.4; C['AIC-402'].sp = 0.05; C['LIC-401'].sp = 60; set('TIC-401', 35); set('PIC-401', 29); set('AIC-401', 42); set('AIC-402', 45); p.M401 = 36; p.lvl401 = 60; p.c2r = 0.4; p.h2c2 = 0.05; }
  Object.assign(p, { catAct: r.cat, catMeas: r.cat, c1: r.cat, c2: r.cat, hold: r.cat * SZ.K.tauMZ / 3600, teal: r.tealCat * r.cat, donor: r.tealCat * r.cat / r.tealDon,
    tealRatioAct: r.tealCat, donRatioAct: r.tealDon, fracD: r.donor === 'D' ? 1 : 0, T211: r.T, P211: r.P, H2r: r.H2r, H2d: r.H2r * 0.1, H2gc: r.H2r,
    F212: r.barrier, F203: r.ethyl, C2gas: r.ethyl, silo: 200 });
  SZ.advance(S, 4 * 3600);
  S.t = 0; S.alarms = []; S.journal = []; S.lab = []; S.hist = { t: [], d: {} }; S.histNext = 0; S.nextSample = 1800; S.sampleNo = 0; S.tons = { on: 0, off: 0 };
  S.p.pel = Object.assign({}, S.p.inst);
  SZ.evalAlarms(S); S.alarms.forEach(a => a.acked = true);
  SZ.log(S, 'INSTRUCTOR', 'Initialised at steady state — grade ' + grade);
  return S;
};
SZ.startExercise = function (ex, prev) {
  const S = SZ.initSteady(ex.start, prev);
  S.exercise = { id: ex.id, title: ex.title, hidden: !!ex.hidden, t0: 0 };
  if (ex.fail) S.sched.push({ t: ex.delay || 120, fail: ex.fail });
  if (ex.hidden) { const opts = ['catPlug', 'h2Frozen', 'tealTrip', 'pic211Fail']; S.sched.push({ t: ex.delay, fail: opts[Math.floor(Math.random() * opts.length)] }); }
  if (ex.poison) S.pendingPoison = { t: ex.delay, v: ex.poison };
  if (ex.id === 'gc-raco') S.target = 'R-7';
  if (ex.id === 'gc-heco') S.target = 'I-12';
  if (ex.id === 'gc-bopp') S.target = 'H-BOPP';
  S.session = { mode: ex.fail || ex.hidden || ex.poison ? 'drill' : 'exercise', title: ex.title, brief: ex.brief };
  SZ.log(S, 'INSTRUCTOR', 'Exercise started: ' + ex.title);
  return S;
};

/* ---- cold plant (everything stopped, reactor empty, ambient temperature) ---- */
SZ.initCold = function (grade, keep) {
  const S = SZ.newState(grade), C = S.ctl, p = S.p, g = SZ.GRADES[grade];
  if (keep) S.speed = keep.speed;
  for (const k in S.eq) S.eq[k] = false;
  for (const t in C) { C[t].mode = 'MAN'; C[t].op = 0; C[t].sp = 0; C[t].e1 = C[t].e2 = 0; }
  C['PIC-211'].op = 30;   // split-range mid point: vent and make-up both closed
  C['TIC-212'].op = 100;  // heater steam valve wide open in MAN: E-212 START gives full 4 MW until TIC-212 goes to AUTO
  S.donor = g.donor;
  Object.assign(p, { catAct: 0, catMeas: 0, teal: 0, donor: 0, c1: 0, c2: 0, hold: 0, T104: 14, T101: 20,
    F201: 0, F203: 0, F212: 0, Fmk: 0, Fvent: 0, H2f: 0, C2gas: 0, T211: 25, P211: 1.0, H2r: 0, H2d: 0, H2gc: 0,
    rMZ: 0, Qr: 0, Qc: 0, Qf: 0, Qh: 0, cwT: 30, foul: 0, sticky: 0, P301: 1.0, T301: 25, F301: 0,
    T401: 25, P401: 1, M401: 0, lvl401: 0, rG: 0, actG: 0, chunk: 0, dis401: 0, mk401: 0, C2f401: 0, H2f401: 0,
    toFin: 0, D501in: 0, silo: 0.10 * SZ.K.silo_t, exRate: 0, prodTot: 0, mileage: 0, kill: 0, poisonEff: 0,
    tealRatioAct: g.tealCat, donRatioAct: g.tealDon, fracD: g.donor === 'D' ? 1 : 0, xsMZ: 2.5, c2MZ: g.c2, mfrMZ: g.mfr });
  p.siloLvl = p.silo / SZ.K.silo_t * 100; p.pvap = SZ.pvap(p.T211); p.dew = p.pvap - (p.P211 + 1.013);
  p.inst = { MFR: g.mfr, XS: 2.5 + 1.6 * g.c2, PI: 5, C2: g.c2, RUB: 0, IZOD: 2.5, FLEX: 1500, TM: 163 - 5 * g.c2 };
  p.pel = Object.assign({}, p.inst);
  SZ.advance(S, 5);
  S.t = 0; S.alarms = []; S.journal = []; S.lab = []; S.hist = { t: [], d: {} }; S.histNext = 0; S.nextSample = 1800; S.sampleNo = 0; S.tons = { on: 0, off: 0 };
  SZ.evalAlarms(S); S.alarms.forEach(a => a.acked = true);
  SZ.log(S, 'INSTRUCTOR', 'Initialised COLD — all equipment stopped, R-211 empty at 25 °C / 1 barg (target ' + grade + ')');
  return S;
};

/* ---- start-up / shutdown procedure tracker ----
   Steps latch in order: a step is ticked the first time its check is true after the previous step. */
const RC = (S) => SZ.solveRecipe(S.target), near = (a, b, tol) => Math.abs(a - b) <= tol, auto = (S, t) => S.ctl[t].mode === 'AUTO';
SZ.PROCS = {
  startup: { title: 'Full plant start-up from cold', steps: [
    ['Start cooling-water pump P-701', 'mzcr', S => S.eq.P701],
    ['Start cycle-gas compressor K-211 (fluidises the riser)', 'mzcr', S => S.eq.K211],
    ['Set solids circulation HIC-213 OP to 50–60 %', 'mzcr', S => S.ctl['HIC-213'].op >= 50 && S.ctl['HIC-213'].op <= 60],
    ['Start heater E-212, TIC-212 AUTO at recipe − 2 °C; warm R-211 to ≥ 70 °C — keep pressure low while cold (dew margin!)', 'mzcr', S => S.p.T211 >= 70],
    ['Pressurise R-211: PIC-211 AUTO at the recipe SP (±1 barg) with dew margin > 3 bar', 'mzcr', S => auto(S, 'PIC-211') && near(S.p.P211, RC(S).P, 1) && S.p.dew > 3],
    ['Line up HP flash: PIC-301 AUTO, SP 18 barg', 'flash', S => auto(S, 'PIC-301') && near(S.ctl['PIC-301'].sp, 18, 1)],
    ['Start P-102 TEAL and P-103 donor; FFIC-102 / FFIC-103 AUTO at recipe ratios', 'catalyst', S => S.eq.TEALP && S.eq.DONP && auto(S, 'FFIC-102') && auto(S, 'FFIC-103') && near(S.ctl['FFIC-102'].sp, RC(S).tealCat, 0.5) && near(S.ctl['FFIC-103'].sp, RC(S).tealDon, RC(S).tealDon * 0.1)],
    ['Barrier FIC-212 AUTO at recipe; fresh C3 FIC-201 AUTO at ≈ 5 t/h', 'mzcr', S => auto(S, 'FIC-212') && near(S.ctl['FIC-212'].sp, RC(S).barrier, 0.5) && auto(S, 'FIC-201') && S.p.F201 >= 3],
    ['Riser H2: AIC-211 AUTO at the recipe SP', 'mzcr', S => auto(S, 'AIC-211') && near(S.ctl['AIC-211'].sp, RC(S).H2r, Math.max(0.15 * RC(S).H2r, 0.1))],
    ['Start catalyst feeder D-101; FIC-101 AUTO at ≈ 0.2 kg/h (light-off)', 'catalyst', S => S.eq.CATF && auto(S, 'FIC-101') && S.p.catMeas >= 0.15],
    ['Reaction lit off (> 5 t/h, TIC-212 OP < 10 %): stop heater E-212, TIC-211 AUTO at recipe temperature', 'mzcr', S => S.p.rMZ > 5 && !S.eq.HTR && auto(S, 'TIC-211') && near(S.ctl['TIC-211'].sp, RC(S).T, 1)],
    ['Steam D-501 ON; start extruder EX-601 once silo > 20 %; LIC-601 AUTO', 'finishing', S => S.eq.STEAM && S.eq.EX601 && auto(S, 'LIC-601')],
    ['Ramp FIC-101 towards recipe and FIC-201 to ≥ 20 t/h — production ≥ 27 t/h', 'catalyst', S => S.p.prodTot >= 27 && S.p.F201 >= 20],
    ['Pellets ON-SPEC for the target grade', 'quality', S => S.p.pelOk && S.p.prodTot >= 25]
  ] },
  shutdown: { title: 'Controlled plant shutdown', steps: [
    ['Cut catalyst: FIC-101 MAN, OP 0 % (or stop feeder D-101)', 'catalyst', S => S.p.catMeas < 0.01],
    ['Comonomer off: FIC-203 ethylene to 0 (and GPR C2 if in service)', 'mzcr', S => S.p.F203 < 10 && (!S.eq.GPR || S.p.C2f401 < 0.05)],
    ['Cut fresh C3 FIC-201 in step with production (≈ 0.7 × rate) so cold feed does not chill R-211', 'mzcr', S => S.p.prodTot < 15 && S.p.F201 <= 0.8 * S.p.prodTot + 2],
    ['Production < 10 t/h: start heater E-212 with TIC-212 AUTO (recipe − 2 °C) to hold R-211 temperature — protects the dew margin', 'mzcr', S => S.p.prodTot < 10 && S.eq.HTR],
    ['Wait for the reaction to die away: production < 2 t/h', 'mzcr', S => S.p.prodTot < 2],
    ['GPR R-401 to BYPASS (HS-302)', 'flash', S => !S.eq.GPR],
    ['Hydrogen off: AIC-211 MAN, OP 0 %', 'mzcr', S => S.p.H2f < 0.05],
    ['Stop P-102 TEAL and P-103 donor pumps', 'catalyst', S => !S.eq.TEALP && !S.eq.DONP],
    ['Stop fresh C3 FIC-201 and barrier FIC-212 (MAN, OP 0 %)', 'mzcr', S => S.p.F201 < 0.3 && S.p.F212 < 0.3],
    ['Run the silo down to ≤ 10 % (lower LIC-601 SP), then stop EX-601', 'finishing', S => S.p.siloLvl <= 10 && !S.eq.EX601],
    ['Steam to D-501 OFF', 'finishing', S => !S.eq.STEAM],
    ['Depressurise R-211 to ≤ 5 barg (PIC-211 SP → vent), then stop heater E-212', 'mzcr', S => S.p.P211 <= 5 && !S.eq.HTR],
    ['Stop K-211 and P-701 — plant safely shut down', 'mzcr', S => !S.eq.K211 && !S.eq.P701 && S.p.prodTot < 1]
  ] }
};
SZ.procEval = function (S) {
  const pr = S.proc; if (!pr || pr.complete != null) return;
  const steps = SZ.PROCS[pr.id].steps;
  while (pr.i < steps.length) {
    let ok = false; try { ok = !!steps[pr.i][2](S); } catch (e) { ok = false; }
    if (!ok) break;
    pr.done[pr.i] = S.t; SZ.log(S, 'PROCEDURE', 'Step ' + (pr.i + 1) + ' done: ' + steps[pr.i][0]); pr.i++;
  }
  if (pr.i >= steps.length) {
    pr.complete = S.t; pr.trips = S.journal.filter(j => j.src === 'SIS' && /INJECTED|tripped|CUT/.test(j.msg)).length;
    SZ.log(S, 'PROCEDURE', SZ.PROCS[pr.id].title + ' COMPLETE in ' + fmtT(S.t - pr.t0) + ' · off-spec ' + S.tons.off.toFixed(0) + ' t · SIS trips ' + pr.trips + ' · ' + (pr.easyUsed || S.level !== 'hard' ? 'EASY (recipe hints used)' : 'HARD mode'));
  }
};

/* ---- session start (chosen from the shift-handover menu) ---- */
SZ.startSession = function (c, prev) {
  let S;
  if (c.mode === 'steady') { S = SZ.initSteady(c.grade, prev); S.session = { mode: 'steady', title: 'Normal operation — steady state ' + c.grade, brief: 'Plant lined out at design rate. Free practice — no upset planned.' }; }
  else if (c.mode === 'startup') {
    S = SZ.initCold(c.grade, prev);
    S.session = { mode: 'startup', title: 'Full plant start-up from cold — ' + c.grade, brief: 'All equipment stopped, R-211 empty at 25 °C. Bring the plant up to rate and on-spec. Follow the procedure tracker (manual §8.4).' };
    S.proc = { id: 'startup', i: 0, done: [], t0: 0, complete: null };
  } else if (c.mode === 'shutdown') {
    S = SZ.initSteady(c.grade, prev);
    S.session = { mode: 'shutdown', title: 'Controlled plant shutdown — ' + c.grade, brief: 'Plant at steady state. Take it down safely to a stopped, depressurised condition. Follow the procedure tracker (manual §8.6).' };
    S.proc = { id: 'shutdown', i: 0, done: [], t0: 0, complete: null };
  } else return prev;
  SZ.log(S, 'INSTRUCTOR', 'Session started: ' + S.session.title);
  return S;
};

/* ---------------- 5. SHARED-STATE RUNTIME ----------------
   Every page runs the same simulation. One page (the "leader") integrates the model and
   saves state to localStorage (+ window.name as same-tab fallback); other open pages follow
   and send their operator actions through a command queue.                           */
const KEY = 'szsim.state', LKEY = 'szsim.leader', QKEY = 'szsim.cmdq', SNAP = 'szsim.snap';
const rt = SZ.rt = { id: Math.random().toString(36).slice(2), leader: false, S: null, last: Date.now(), lastSave: 0, lastLoad: 0, ls: true, listeners: [] };
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { rt.ls = false; return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { rt.ls = false; return false; } }
function parse(s) { try { return JSON.parse(s); } catch (e) { return null; } }
function loadState() {
  let a = parse(lsGet(KEY)), b = null;
  if (typeof window.name === 'string' && window.name.startsWith('SZSIM:')) b = parse(window.name.slice(6));
  let S = a; if (b && (!a || (b.savedAt || 0) > (a.savedAt || 0))) S = b;
  if (S && S.v === 3) return SZ.upgradeState(S);
  return null;
}
function saveState() {
  const S = rt.S; if (!S) return; S.savedAt = Date.now();
  const j = JSON.stringify(S); lsSet(KEY, j);
  try { window.name = 'SZSIM:' + j; } catch (e) { }
  rt.lastSave = Date.now();
}
SZ.save = saveState;
function becomeLeader() {
  rt.leader = true;
  let S = loadState();
  if (!S) { S = SZ.initSteady('H-INJ'); }
  else if (!S.frozen && S.savedAt) { const real = Math.max(0, (Date.now() - S.savedAt) / 1000); SZ.advance(S, Math.min(real * S.speed, 7200)); }
  rt.S = S; rt.last = Date.now(); saveState();
}
// code version: a tab running newer simulator code always takes over from a tab with older code
SZ.CODE_VER = 161;
function heartbeat() { lsSet(LKEY, JSON.stringify({ id: rt.id, ts: Date.now(), ver: SZ.CODE_VER })); }
function drainQueue() {
  const q = parse(lsGet(QKEY)); if (!q || !q.length) return; lsSet(QKEY, '[]');
  for (const c of q) runCmd(c);
}
function runCmd(c) {
  const S = rt.S, lvl = c.level || (S && S.level) || 'easy';
  runCmd0(c, S);
  // a new plant (session, exercise, re-init, snapshot) keeps the chosen difficulty
  if (rt.S && rt.S !== S) {
    rt.S.level = lvl === 'hard' ? 'hard' : 'easy';
    if (rt.S.proc) rt.S.proc.easyUsed = rt.S.level !== 'hard';
    if (c.level) SZ.log(rt.S, 'INSTRUCTOR', 'Difficulty: ' + rt.S.level.toUpperCase());
  }
}
function runCmd0(c, S) {
  if (c.type === 'reinit') { rt.S = SZ.initSteady(c.grade, S); rt.S.session = { mode: 'steady', title: 'Normal operation — steady state ' + c.grade, brief: '' }; SZ.log(rt.S, 'INSTRUCTOR', 'Re-initialised (grade ' + c.grade + ')'); return; }
  if (c.type === 'session') { rt.S = SZ.startSession(c, S); return; }
  if (c.type === 'exercise') { const ex = SZ.EXERCISES.find(e => e.id === c.id); if (ex) rt.S = SZ.startExercise(ex, S); return; }
  if (c.type === 'snapSave') { const j = JSON.stringify(S); lsSet(SNAP, j); SZ.log(S, 'INSTRUCTOR', 'Snapshot saved at ' + fmtT(S.t)); return; }
  if (c.type === 'snapRestore') { const s = parse(lsGet(SNAP)); if (s) { rt.S = s; SZ.log(s, 'INSTRUCTOR', 'Snapshot restored'); } return; }
  SZ.exec(S, c);
}
SZ.cmd = function (c) {
  if (rt.leader || !rt.ls) { runCmd(c); saveState(); SZ.render(); }
  else { const q = parse(lsGet(QKEY)) || []; q.push(c); lsSet(QKEY, JSON.stringify(q)); }
};
function tick() {
  const now = Date.now();
  if (!rt.leader) {
    const L = parse(lsGet(LKEY));
    rt.outdated = !!(L && (L.ver || 0) > SZ.CODE_VER);   // another tab runs newer code → this one should be reloaded
    if (!rt.ls || !L || now - L.ts > 1500 || L.id === rt.id || (L.ver || 0) < SZ.CODE_VER) becomeLeader();
  }
  if (rt.leader) {
    const L = parse(lsGet(LKEY));
    if (rt.ls && L && L.id !== rt.id && now - L.ts < 1500 && L.ts > rt.lastBeat && (L.ver || 0) >= SZ.CODE_VER) { rt.leader = false; }   // another tab took over
  }
  if (rt.leader) {
    heartbeat(); rt.lastBeat = Date.now(); rt.outdated = false; drainQueue();
    const S = rt.S, real = Math.min(1, (now - rt.last) / 1000);
    if (!S.frozen) {
      SZ.advance(S, real * S.speed);
      if (S.pendingPoison && S.t >= S.pendingPoison.t) { Object.assign(S.poison, S.pendingPoison.v); SZ.log(S, 'INSTRUCTOR', 'Feed poison ramp applied'); S.pendingPoison = null; }
    }
    if (now - rt.lastSave > 1000) saveState();
  } else if (now - rt.lastLoad > 500) { const S = loadState(); if (S) rt.S = S; rt.lastLoad = now; }
  rt.last = now;
  SZ.render();
}
SZ.render = function () { for (const f of rt.listeners) { try { f(rt.S); } catch (e) { console.error(e); } } };
SZ.onRender = (f) => rt.listeners.push(f);
SZ.start = function () {
  becomeLeaderOrFollow();
  setInterval(tick, 250);
  window.addEventListener('pagehide', () => { if (rt.leader) { saveState(); lsSet(LKEY, JSON.stringify({ id: '', ts: 0 })); } });
};
function becomeLeaderOrFollow() {
  const L = parse(lsGet(LKEY));
  if (!rt.ls || !L || Date.now() - L.ts > 1500) becomeLeader();
  else { rt.S = loadState() || SZ.initSteady('H-INJ'); }
  if (rt.leader) heartbeat();
  rt.lastBeat = Date.now();
  SZ.render();
}
})(window);
