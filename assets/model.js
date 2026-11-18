/* =====================================================================
   SPHERIZONE PP DCS TRAINING SIMULATOR — PROCESS MODEL
   Training-grade first-order + energy-balance model.  NOT LICENSOR DATA.
   Sections: 1 constants & grades · 2 state factory · 3 controllers (PID)
             4 process model step · 5 product properties · 6 SIS · 7 recipe solver
   ===================================================================== */
(function (G) {
'use strict';
const SZ = G.SZ = G.SZ || {};
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lag = (y, u, tau, dt) => y + (u - y) * (1 - Math.exp(-dt / Math.max(tau, 1e-6)));
SZ.clamp = clamp;

/* ---------------- 1. CONSTANTS & GRADES ---------------- */
const K = SZ.K = {
  mileage: 50,          // t PP per kg catalyst (= 50 kg/g) at reference conditions
  tauPrecontact: 600,   // s, D-104
  tauPrepoly: 1200,     // s, R-101
  tauMZ: 2160,          // s, catalyst residence in R-211
  dHpoly: 2.0,          // MJ/kg heat of polymerisation
  UA211: 0.725,         // MW/K at 100 % OP (E-211 cycle-gas cooler)
  C211: 300,            // MJ/K reactor heat capacity
  UA401: 0.21, C401: 120,
  wDown: 0.5,           // fraction of MZCR production made in the downer
  silo_t: 400,          // t silo capacity
  gprBed_t: 60          // t bed mass at 100 % level
};
// donor-dependent catalyst behaviour: H2 response (a, n), XS, PI base
const DONOR = {
  C: { a: 13.5, n: 1.10, xs0: 2.5, xsK: 0.8, ref: 10, pi0: 3.6 },
  D: { a: 9.0,  n: 0.95, xs0: 2.2, xsK: 1.4, ref: 10, pi0: 4.2 }
};
SZ.DONOR = DONOR;

SZ.GRADES = {
  'H-RAFFIA': { fam: 'HOMO', desc: 'Homopolymer raffia / tape', donor: 'C', mfr: 3.5, T: 80, P: 28, barrier: 6, tealCat: 5, tealDon: 10, c2: 0, gpr: false, circ: 55,
    spec: { MFR: [3.0, 4.0], XS: [0, 4.0] }, add: { AO: 1500, AS: 500, NUC: 0, AST: 0, SLIP: 0 } },
  'H-INJ':    { fam: 'HOMO', desc: 'Homopolymer injection moulding', donor: 'C', mfr: 12, T: 80, P: 28, barrier: 6, tealCat: 5, tealDon: 10, c2: 0, gpr: false, circ: 55,
    spec: { MFR: [10.5, 13.5], XS: [0, 4.0] }, add: { AO: 1000, AS: 500, NUC: 1000, AST: 500, SLIP: 0 } },
  'H-FIBER':  { fam: 'HOMO', desc: 'Homopolymer fibre (narrow MWD — low barrier)', donor: 'C', mfr: 25, T: 80, P: 28, barrier: 1.5, tealCat: 5, tealDon: 10, c2: 0, gpr: false, circ: 55,
    spec: { MFR: [22, 28], XS: [0, 4.0], PI: [0, 4.6] }, add: { AO: 800, AS: 400, NUC: 0, AST: 0, SLIP: 0 } },
  'H-BOPP':   { fam: 'HOMO', desc: 'Homopolymer BOPP film (D-donor, broad MWD)', donor: 'D', mfr: 3.0, T: 80, P: 28, barrier: 6, tealCat: 5, tealDon: 50, c2: 0, gpr: false, circ: 55,
    spec: { MFR: [2.6, 3.4], XS: [3.5, 5.5], PI: [5.0, 99] }, add: { AO: 1200, AS: 400, NUC: 0, AST: 0, SLIP: 0 } },
  'R-7':      { fam: 'RACO', desc: 'Random copolymer, clarified', donor: 'C', mfr: 7, T: 75, P: 27, barrier: 6, tealCat: 5, tealDon: 10, c2: 3.5, gpr: false, circ: 55,
    spec: { MFR: [6.0, 8.0], C2: [3.0, 4.0] }, add: { AO: 1000, AS: 500, NUC: 2000, AST: 0, SLIP: 0 } },
  'I-12':     { fam: 'HECO', desc: 'Heterophasic impact copolymer', donor: 'C', mfr: 15.5, T: 80, P: 28, barrier: 6, tealCat: 5, tealDon: 10, c2: 0, gpr: true, circ: 55,
    gprT: 75, gprP: 14, c2ratio: 0.40, h2c2: 0.05, gprLvl: 60,
    spec: { MFR: [10.5, 13.5], RUB: [15, 19], IZOD: [8, 99] }, add: { AO: 1500, AS: 800, NUC: 1000, AST: 500, SLIP: 1000 } }
};
SZ.PROPS = {
  MFR: { label: 'MFR', unit: 'g/10min', dec: 2 }, XS: { label: 'XS', unit: 'wt%', dec: 2 }, PI: { label: 'PI Mw/Mn', unit: '', dec: 2 },
  C2: { label: 'C2', unit: 'wt%', dec: 2 }, RUB: { label: 'Rubber', unit: '%', dec: 1 }, IZOD: { label: 'Izod', unit: 'kJ/m²', dec: 1 },
  FLEX: { label: 'Flex mod', unit: 'MPa', dec: 0 }, TM: { label: 'Tm', unit: '°C', dec: 1 }
};

/* Controller catalogue: tag, description, unit, PV range, OP→ actuator, action (+1: OP rises when PV>SP), tuning */
SZ.CTL = {
  'FIC-101': { d: 'Catalyst feed (D-101 feeder)', u: 'kg/h', lo: 0, hi: 1.5, act: -1, kc: 0.6, ti: 8, page: 'catalyst', dec: 3 },
  'FFIC-102': { d: 'TEAL / catalyst ratio', u: 'g/g', lo: 0, hi: 15, act: -1, kc: 0.8, ti: 15, page: 'catalyst', dec: 2 },
  'FFIC-103': { d: 'TEAL / donor ratio', u: 'g/g', lo: 0, hi: 100, act: 1, kc: 0.5, ti: 20, page: 'catalyst', dec: 1 },
  'FIC-201': { d: 'Fresh propylene feed to MZCR', u: 't/h', lo: 0, hi: 40, act: -1, kc: 0.6, ti: 6, page: 'mzcr', dec: 1 },
  'FIC-203': { d: 'Ethylene to MZCR (RACO)', u: 'kg/h', lo: 0, hi: 2500, act: -1, kc: 0.6, ti: 6, page: 'mzcr', dec: 0 },
  'TIC-211': { d: 'MZCR temperature → E-211 CW', u: '°C', lo: 40, hi: 110, act: 1, kc: 6, ti: 150, td: 20, page: 'mzcr', dec: 1 },
  'PIC-211': { d: 'MZCR pressure → split range: vent (0-30 %) / C3 make-up (30-100 %)', u: 'barg', lo: 0, hi: 40, act: -1, kc: 8, ti: 300, page: 'mzcr', dec: 2 },
  'AIC-211': { d: 'Riser H2 (GC) → H2 valve', u: 'mol%', lo: 0, hi: 10, act: -1, kc: 4, ti: 500, page: 'mzcr', dec: 2 },
  'FIC-212': { d: 'Barrier liquid C3 to downer', u: 't/h', lo: 0, hi: 12, act: -1, kc: 0.6, ti: 6, page: 'mzcr', dec: 2 },
  'HIC-213': { d: 'Solids circulation (hand)', u: '%', lo: 0, hi: 100, act: 0, hand: true, page: 'mzcr', dec: 0 },
  'PIC-301': { d: 'HP flash D-301 pressure', u: 'barg', lo: 0, hi: 30, act: 1, kc: 10, ti: 120, page: 'flash', dec: 2 },
  'TIC-401': { d: 'GPR temperature → E-401 CW', u: '°C', lo: 40, hi: 110, act: 1, kc: 6, ti: 200, page: 'gpr', dec: 1 },
  'PIC-401': { d: 'GPR pressure → C3 make-up', u: 'barg', lo: 0, hi: 25, act: -1, kc: 8, ti: 300, page: 'gpr', dec: 2 },
  'AIC-401': { d: 'GPR C2/(C2+C3) → C2 valve', u: 'mol/mol', lo: 0, hi: 1, act: -1, kc: 60, ti: 900, page: 'gpr', dec: 3 },
  'AIC-402': { d: 'GPR H2/C2 → H2 valve', u: 'mol/mol', lo: 0, hi: 0.2, act: -1, kc: 200, ti: 600, page: 'gpr', dec: 4 },
  'LIC-401': { d: 'GPR bed level → LV-401 discharge', u: '%', lo: 0, hi: 100, act: 1, kc: 2, ti: 900, page: 'gpr', dec: 1 },
  'LIC-601': { d: 'Silo D-601 level → EX-601 rate', u: '%', lo: 0, hi: 100, act: 1, kc: 3, ti: 1800, page: 'finishing', dec: 1 }
};
// actuator spans for OP (0-100 %) -> engineering flow
const SPAN = { FV101: 1.5, TEAL: 10, DONOR: 1.0, FV201: 40, FV203: 2500, FV212: 12, MK211: 15, H2_211: 12, PV301: 20,
  MK401: 12, C2_401: 6, H2_401: 20, LV401: 90, EX601: 50 };
SZ.SPAN = SPAN;
/* Final control elements: the control valve (or drive) each controller moves.
   FCV flow · TCV temperature · PCV pressure · LCV level · HCV hand. Split-range PCV-211: A = vent, B = make-up. */
SZ.FCE = {
  'FIC-201': 'FCV-201', 'FIC-203': 'FCV-203', 'FIC-212': 'FCV-212', 'TIC-211': 'TCV-211', 'PIC-211': 'PCV-211A/B',
  'AIC-211': 'FCV-211', 'HIC-213': 'HCV-213', 'PIC-301': 'PCV-301', 'TIC-401': 'TCV-401', 'PIC-401': 'PCV-401',
  'AIC-401': 'FCV-401', 'AIC-402': 'FCV-402', 'LIC-401': 'LCV-401',
  'FIC-101': 'SC-101 (feeder speed)', 'FFIC-102': 'SC-102 (P-102 stroke)', 'FFIC-103': 'SC-103 (P-103 stroke)', 'LIC-601': 'SC-601 (EX-601 speed)'
};

/* Motors / hand switches */
SZ.EQ = {
  P701: { d: 'Cooling-water pump P-701', page: 'mzcr' }, K211: { d: 'Cycle-gas compressor K-211', page: 'mzcr' },
  K401: { d: 'GPR cycle-gas compressor K-401', page: 'gpr' }, EX601: { d: 'Extruder EX-601', page: 'finishing' },
  TEALP: { d: 'TEAL dosing pump P-102', page: 'catalyst' }, CATF: { d: 'Catalyst feeder D-101', page: 'catalyst' },
  DONP: { d: 'Donor dosing pump P-103', page: 'catalyst' }, STEAM: { d: 'Steamer D-501 steam', page: 'finishing' },
  HTR: { d: 'Start-up heater E-212 (steam heater on cycle gas, 4 MW) — needs K-211 running, trips at 85 °C', page: 'mzcr' }
};
// plant "down" states used for state-based alarm suppression and start-up/shutdown
SZ.isIdle = (S) => S.p.prodTot < 1 && S.p.catMeas < 0.02;   // no reaction, no catalyst
SZ.isLow = (S) => S.p.prodTot < 5;                            // starting up / shutting down

/* ---------------- 2. STATE FACTORY ---------------- */
function mkCtl(tag, sp, op, mode) { return { pv: sp, sp: sp, op: op, mode: mode || 'AUTO', e1: 0, e2: 0 }; }

SZ.newState = function (grade) {
  const g = SZ.GRADES[grade] || SZ.GRADES['H-INJ'];
  const S = {
    v: 3, t: 0, speed: 1, frozen: false, grade: grade, target: grade, donor: g.donor,
    ctl: {}, p: {}, eq: { P701: true, K211: true, K401: g.gpr, EX601: true, TEALP: true, CATF: true, DONP: true, STEAM: true, GPR: g.gpr, HTR: false },
    fail: { cwTrip: false, k211Trip: false, catPlug: false, tealTrip: false, h2Frozen: false, pic211Fail: false, k401Trip: false, lv401Stuck: false, exTrip: false },
    poison: { H2O: 0, CO: 0, COS: 0 },
    sis: { bypass: false, catCut: false, k211StopT: 0, kill: 'NORMAL', lastTrip: '' },
    add: Object.assign({}, g.add),
    alarms: [], journal: [], lab: [], nextSample: 1800, sampleNo: 0,
    hist: { t: [], d: {} }, histNext: 0,
    tons: { on: 0, off: 0 }, sched: [], exercise: null, offspecSince: null
  };
  for (const tag in SZ.CTL) S.ctl[tag] = mkCtl(tag, 0, 0, 'AUTO');
  S.ctl['HIC-213'].mode = 'MAN';
  const p = S.p;
  Object.assign(p, {
    catAct: 0.6, catMeas: 0.6, teal: 3, donor: 0.3, c1: 0.6, c2: 0.6, hold: 0.6 * K.tauMZ / 3600,
    tealRatioAct: 5, donRatioAct: 10, fracD: g.donor === 'D' ? 1 : 0,
    T104: 15, T101: 20, F201: 22, F203: 0, F212: g.barrier, Fmk: 5, H2f: 5, C2gas: 0,
    T211: g.T, P211: g.P, H2r: 3, H2d: 0.3, rMZ: 30, Qr: 0, Qc: 0, Qf: 0, cwT: 30, foul: 0, sticky: 0, dew: 8,
    P301: 18, T301: 62, F301: 3,
    T401: 75, P401: 14, M401: 36, lvl401: 60, c2r: 0.4, h2c2: 0.05, C2f401: 0, H2f401: 0, mk401: 0, rG: 0, actG: 0, chunk: 0, dis401: 0,
    toFin: 30, D501in: 30, silo: 160, siloLvl: 40, exRate: 30, pellet_t: 0,
    kill: 0, poisonEff: 0, prodTot: 30, mileage: 50
  });
  p.inst = { MFR: 12, XS: 2.5, PI: 5, C2: 0, RUB: 0, IZOD: 2.5, FLEX: 1500, TM: 163 };
  p.pel = Object.assign({}, p.inst);
  p.MFRr = 30; p.MFRd = 3;
  return S;
};

/* ---------------- 3. CONTROLLERS (velocity-form PID, bumpless) ---------------- */
function pidStep(c, def, pv, dt) {
  // measurement noise: small filtered jitter on every transmitter (≈ 0.06 % of span)
  if (SZ.mnoise && !def.hand) { c.mn = (c.mn || 0) + (SZ.gauss() * 0.0017 * (def.hi - def.lo) - (c.mn || 0)) * Math.min(1, dt / 4); pv += c.mn; }
  c.pv = pv;
  if (def.hand) { c.mode = 'MAN'; return; }
  const span = def.hi - def.lo;
  const e = (pv - c.sp) / span * 100 * def.act;       // % of span; positive → increase OP
  if (c.mode === 'AUTO') {
    const ti = def.ti || 1e9, td = def.td || 0;
    // derivative acts on a filtered error (like a real DCS PID) so transmitter jitter does not kick the valve
    const tf = Math.max(4, td / 4);
    c.ef = c.ef == null ? e : c.ef + (e - c.ef) * Math.min(1, dt / tf);
    const f1 = c.f1 == null ? c.ef : c.f1, f2 = c.f2 == null ? f1 : c.f2;
    const dOP = def.kc * ((e - c.e1) + dt / ti * e + td / dt * (c.ef - 2 * f1 + f2));
    c.op = clamp(c.op + dOP, 0, 100);
    c.f2 = f1; c.f1 = c.ef;
  } else {
    c.sp = pv;   // PV tracking in MAN gives bumpless MAN→AUTO
    c.ef = c.f1 = c.f2 = null;
  }
  c.e2 = c.e1; c.e1 = e;
}
SZ.pidStep = pidStep;

/* ---------------- 4. PROCESS MODEL STEP ---------------- */
SZ.pvap = function (Tc) { return Math.exp(10.03 - 2260 / (Tc + 273.15)); };  // propylene, bar abs

SZ.activity = function (o) {
  // o: {T, tealRatio, donRatio, H2r, P, c2wt, poisonEff, kill}
  const fT = Math.exp(6000 * (1 / 353.15 - 1 / (o.T + 273.15))) * Math.exp(-0.1 * Math.max(0, o.T - 85));
  const fTeal = (1 - Math.exp(-Math.max(0, o.tealRatio) / 1.5)) / (1 - Math.exp(-5 / 1.5));
  const fDon = clamp(1 - 0.15 * Math.log(10 / Math.max(o.donRatio, 1)), 0.5, 1.3);
  const fH2 = clamp(1 + 0.05 * Math.log(Math.max(o.H2r, 0.05) / 2), 0.85, 1.15);
  const fP = Math.max(0, (o.P + 1) / 29);
  const fC2 = 1 + 0.04 * (o.c2wt || 0);
  return fT * fTeal * fDon * fH2 * fP * fC2 * (1 - (o.poisonEff || 0)) * (1 - (o.kill || 0));
};

SZ.step = function (S, dt) {
  const p = S.p, C = S.ctl, E = S.eq, F = S.fail, D = SZ.CTL;
  S.t += dt;
  SZ.noise(S, dt); const N = S.nz;
  // ---- scheduled instructor events
  for (const ev of S.sched) if (!ev.done && S.t >= ev.t) { ev.done = true; SZ.applyFail(S, ev.fail, true, 'SCHEDULE'); }

  // ---- motors forced by failures
  if (F.cwTrip) E.P701 = false; if (F.k211Trip) E.K211 = false; if (F.k401Trip) E.K401 = false;
  if (F.exTrip) E.EX601 = false; if (F.tealTrip) E.TEALP = false;

  // ===== AREA 100 — catalyst / precontact / prepolymerisation =====
  if (S.sis.catCut) { C['FIC-101'].mode = 'MAN'; C['FIC-101'].op = 0; }
  const feederOn = E.CATF && !S.sis.catCut;
  const catCmd = feederOn ? C['FIC-101'].op / 100 * SPAN.FV101 : 0;
  p.catMeas = lag(p.catMeas, catCmd, 10, dt);              // what the flow meter reads
  p.catAct = F.catPlug ? lag(p.catAct, 0, 5, dt) : p.catMeas;  // plug: real flow lost, meter still normal
  p.teal = lag(p.teal, E.TEALP ? C['FFIC-102'].op / 100 * SPAN.TEAL : 0, 8, dt);
  p.donor = lag(p.donor, E.DONP ? C['FFIC-103'].op / 100 * SPAN.DONOR : 0, 8, dt);
  pidStep(C['FIC-101'], D['FIC-101'], p.catMeas, dt);
  pidStep(C['FFIC-102'], D['FFIC-102'], p.teal / Math.max(p.catMeas, 0.02), dt);
  pidStep(C['FFIC-103'], D['FFIC-103'], clamp(p.teal / Math.max(p.donor, 0.005), 0, 100), dt);

  // poisons in propylene feed consume TEAL first, then the catalyst (CO also poisons directly)
  const feedT = p.F201 + p.F212 + p.Fmk;
  const tealNeed = feedT * (p.poisonIn = (S.poison.H2O + S.poison.COS * 1.5)) * 0.006;
  const tealLeft = Math.max(0, p.teal - tealNeed);
  const excess = Math.max(0, tealNeed - p.teal);
  const poisonEff = clamp(1 - Math.exp(-excess / 0.3) * Math.exp(-0.15 * S.poison.CO), 0, 1);
  p.poisonEff = lag(p.poisonEff, poisonEff, 300, dt);
  const tealRatio = tealLeft / Math.max(p.catAct, 0.02);
  p.tealRatioAct = lag(p.tealRatioAct, p.catAct > 0.01 ? Math.min(tealRatio, 20) : p.tealRatioAct, 900, dt);
  p.donRatioAct = lag(p.donRatioAct, clamp(p.teal / Math.max(p.donor, 0.005), 1, 100), 900, dt);
  p.fracD = lag(p.fracD, S.donor === 'D' ? 1 : 0, K.tauPrecontact + K.tauPrepoly + K.tauMZ, dt);
  p.c1 = lag(p.c1, p.catAct, K.tauPrecontact, dt);
  p.c2 = lag(p.c2, p.c1, K.tauPrepoly, dt);
  p.T104 = lag(p.T104, 14 + (E.P701 ? 0 : 8), 300, dt);
  p.T101 = lag(p.T101, 19 + 3 * p.c2 / 0.6 + (E.P701 ? 0 : 10), 300, dt);

  // ===== AREA 200 — multizone circulating reactor R-211 =====
  p.F201 = lag(p.F201, C['FIC-201'].op / 100 * SPAN.FV201, 4, dt);
  p.F203 = lag(p.F203, C['FIC-203'].op / 100 * SPAN.FV203, 4, dt);
  p.F212 = lag(p.F212, C['FIC-212'].op / 100 * SPAN.FV212, 4, dt);
  pidStep(C['FIC-201'], D['FIC-201'], p.F201, dt);
  pidStep(C['FIC-203'], D['FIC-203'], p.F203, dt);
  pidStep(C['FIC-212'], D['FIC-212'], p.F212, dt);
  // PIC-211 "fails in AUTO": output ramps open regardless of PV
  if (F.pic211Fail && C['PIC-211'].mode === 'AUTO') { C['PIC-211'].pv = p.P211; C['PIC-211'].op = clamp(C['PIC-211'].op + 0.08 * dt, 0, 100); }
  else pidStep(C['PIC-211'], D['PIC-211'], p.P211, dt);
  // split range: OP 0-30 % opens vent to D-301, OP 30-100 % opens C3 make-up
  const op211 = C['PIC-211'].op;
  p.Fmk = lag(p.Fmk, Math.max(0, op211 - 30) / 70 * SPAN.MK211, 5, dt);
  p.Fvent = lag(p.Fvent || 0, Math.max(0, 30 - op211) / 30 * 12, 5, dt);
  p.H2f = lag(p.H2f, C['AIC-211'].op / 100 * SPAN.H2_211, 5, dt);
  const circ = C['HIC-213'].op;
  // hydrogen in riser; barrier efficiency keeps H2 out of the downer
  const Ftot = Math.max(feedT, 5);
  p.H2r = lag(p.H2r, clamp(0.6 * p.H2f * 33 / Ftot * (1 + N.h2), 0, 15), 300, dt);
  const eff = (1 - Math.exp(-p.F212 / 2.5)) * (1 - 0.004 * Math.max(0, circ - 60)) * (E.K211 ? 1 : 0.6);
  p.barEff = eff;
  p.H2d = lag(p.H2d, p.H2r * (1 - eff), 180, dt);
  if (!F.h2Frozen) p.H2gc = p.H2r; else if (p.H2gc === undefined) p.H2gc = p.H2r;
  pidStep(C['AIC-211'], D['AIC-211'], p.H2gc, dt);
  // ethylene in gas (RACO)
  p.C2gas = lag(p.C2gas, p.F203, 400, dt);

  // catalyst holdup & production
  p.hold = p.hold + (p.c2 - p.hold / (K.tauMZ / 3600)) * dt / 3600;
  const c2wtPrev = p.c2MZ || 0;
  const act = SZ.activity({ T: p.T211, tealRatio: p.tealRatioAct, donRatio: p.donRatioAct, H2r: p.H2r, P: p.P211, c2wt: c2wtPrev, poisonEff: p.poisonEff, kill: p.kill });
  p.rMZ = Math.max(0, p.hold / (K.tauMZ / 3600) * K.mileage * act * (1 + N.act));

  // energy balance R-211 / E-211
  const k211f = E.K211 ? 1 : 0.1, cwf = E.P701 ? 1 : 0.08;
  p.cwT = lag(p.cwT, (E.P701 ? 30 : 42) + N.cw + N.cwd, 120, dt);
  p.Qr = p.rMZ * 1000 * K.dHpoly / 3600;
  p.Qf = (p.F201 + p.F212 + p.Fmk) * 1000 * (0.30 + 0.0025 * (p.T211 - 25)) / 3600 * (1 + N.qf);
  p.Qc = K.UA211 * C['TIC-211'].op / 100 * Math.max(0, p.T211 - p.cwT) * cwf * k211f * (1 - 0.6 * p.foul / 100);
  if (E.HTR && !E.K211) { SZ.tripEq(S, 'HTR', 'No cycle-gas flow (K-211 stopped). Restart K-211 before the heater.'); SZ.log(S, 'SIS', 'E-212 start-up heater tripped: no cycle-gas flow (K-211 stopped)'); }
  p.Qh = E.HTR ? 4.0 : 0;                          // start-up heater duty, MW
  const Qloss = 0.004 * (p.T211 - 25);             // ambient heat loss, MW
  p.T211 += (p.Qr + p.Qh - p.Qf - p.Qc - Qloss) / K.C211 * dt;
  pidStep(C['TIC-211'], D['TIC-211'], p.T211, dt);
  // pressure (gas inventory)
  const disGas = 0.1 * p.rMZ + 0.3;
  p.P211 = clamp(p.P211 + (p.F201 + p.F212 + p.Fmk + p.F203 / 1000 + N.gas - p.rMZ - disGas - p.Fvent) * 0.0012 * dt, 0, 45);
  p.pvap = SZ.pvap(p.T211);
  p.dew = p.pvap - (p.P211 + 1.013);
  if (p.dew < 0.5 && E.K211) { SZ.tripEq(S, 'K211', 'Liquid carry-over protection: dew-point margin < 0.5 bar. Lower PIC-211 SP until the margin is > 3 bar, then restart.'); SZ.log(S, 'SIS', 'K-211 tripped: liquid carry-over (dew-point margin < 0.5 bar)'); }

  // ===== AREA 300 — HP flash D-301 =====
  const gasIn = disGas + p.Fvent + (E.GPR ? 0.3 : 0);
  p.F301 = C['PIC-301'].op / 100 * SPAN.PV301;
  p.P301 = clamp(p.P301 + (gasIn - p.F301) * 0.004 * dt, 0, 30);
  pidStep(C['PIC-301'], D['PIC-301'], p.P301, dt);
  p.T301 = lag(p.T301, 62 + 0.1 * (p.T211 - 80), 300, dt);

  // ===== AREA 400 — gas-phase reactor R-401 (HECO) =====
  const svc = E.GPR;
  p.actG = lag(p.actG, svc ? (p.rMZ / 30) * (1 - p.kill) : 0, 600, dt);
  if (!svc) { C['LIC-401'].mode = 'MAN'; C['LIC-401'].op = 0; }
  pidStep(C['PIC-401'], D['PIC-401'], p.P401, dt);
  pidStep(C['AIC-401'], D['AIC-401'], p.c2r, dt);
  pidStep(C['AIC-402'], D['AIC-402'], p.h2c2, dt);
  pidStep(C['LIC-401'], D['LIC-401'], p.lvl401, dt);
  if (!F.lv401Stuck) p.lv401 = C['LIC-401'].op; else if (p.lv401 === undefined) p.lv401 = C['LIC-401'].op;
  p.mk401 = lag(p.mk401, C['PIC-401'].op / 100 * SPAN.MK401, 5, dt);
  p.C2f401 = lag(p.C2f401, C['AIC-401'].op / 100 * SPAN.C2_401, 5, dt);
  p.H2f401 = lag(p.H2f401, C['AIC-402'].op / 100 * SPAN.H2_401, 5, dt);
  if (svc) {
    const fT4 = Math.exp(5000 * (1 / 348.15 - 1 / (p.T401 + 273.15))) * Math.exp(-0.1 * Math.max(0, p.T401 - 90));
    p.rG = 3.75 * p.actG * Math.max(0, (p.P401 + 1) / 15) * (1 + 1.5 * p.c2r) * (p.lvl401 / 60) * fT4 * (E.K401 ? 1 : 0.4) * (1 - p.chunk / 200) * (1 + N.actG);
    p.c2r = lag(p.c2r, p.C2f401 / (p.C2f401 + p.mk401 + 0.01), 600, dt);
    p.h2c2 = lag(p.h2c2, 14 * p.H2f401 / (1000 * Math.max(p.C2f401, 0.05)), 300, dt);
    p.P401 = clamp(p.P401 + (p.mk401 + p.C2f401 - p.rG - 0.3) * 0.003 * dt, 0, 25);
    const k401f = E.K401 ? 1 : 0.1;
    const Qr4 = p.rG * 1000 * K.dHpoly / 3600;
    const Qc4 = K.UA401 * C['TIC-401'].op / 100 * Math.max(0, p.T401 - p.cwT) * cwf * k401f * (1 - 0.5 * p.chunk / 100);
    p.T401 += (Qr4 - Qc4 - 0.004 * (p.T401 - 25)) / K.C401 * dt;
    p.dis401 = p.lv401 / 100 * SPAN.LV401 * Math.min(1, p.M401 / 3);
    p.M401 = Math.max(0, p.M401 + (p.rMZ + p.rG - p.dis401) * dt / 3600);
  } else { p.rG = 0; p.dis401 = 0; }
  p.lvl401 = p.M401 / K.gprBed_t * 100;
  pidStep(C['TIC-401'], D['TIC-401'], p.T401, dt);
  const rubFrac = svc ? p.rG / Math.max(p.rMZ + p.rG, 0.1) : 0;
  const dChunk = (svc ? (rubFrac > 0.25 ? 4 : 0) + (p.T401 > 85 ? (p.T401 - 85) : 0) + (!E.K401 ? 6 : 0) : 0);
  p.chunk = clamp(p.chunk + (dChunk - (dChunk === 0 ? 0.5 : 0)) * dt / 60, 0, 100);

  // ===== AREA 500/600 — steamer, silo, extruder =====
  const powder = svc ? p.dis401 : p.rMZ;
  p.D501in = lag(p.D501in, powder, 600, dt);
  p.silo = clamp(p.silo + (p.D501in - p.exRate) * dt / 3600, 0, K.silo_t);
  p.siloLvl = p.silo / K.silo_t * 100;
  pidStep(C['LIC-601'], D['LIC-601'], p.siloLvl, dt);
  p.exRate = lag(p.exRate, E.EX601 ? C['LIC-601'].op / 100 * SPAN.EX601 * (p.silo > 0.5 ? 1 : 0) : 0, 30, dt);
  p.prodTot = p.rMZ + p.rG;
  p.mileage = p.catMeas > 0.01 ? p.prodTot / p.catMeas : 0;

  // fouling: sticky product (XS too high for T) or poor circulation / K-211 stop
  const xsLimit = 12 - 0.15 * (p.T211 - 70);
  p.sticky = (p.xsMZ || 0) - xsLimit;     // matrix made in R-211 (rubber is made later in R-401)
  const dF = (p.sticky > 0 ? 2 * p.sticky : 0) + (circ < 30 && p.rMZ > 2 ? (30 - circ) * 0.2 : 0) + (!E.K211 && p.rMZ > 2 ? 5 : 0);
  p.foul = clamp(p.foul + dF * dt / 60 * 0.5, 0, 100);

  // CO kill dynamics
  const ks = S.sis.kill;
  if (ks === 'INJECTED') p.kill = lag(p.kill, 1, 30, dt);
  else if (ks === 'PURGE') { p.kill = lag(p.kill, 0, 900, dt); if (p.kill < 0.02) { S.sis.kill = 'NORMAL'; p.kill = 0; SZ.log(S, 'SIS', 'XV-901 purge complete — kill system NORMAL'); } }

  // ===== pressure relief: PSVs lift at set pressure, reseat at blowdown, relieve to the flare header
  SZ.relief(S, dt);

  // ===== properties & SIS
  SZ.props(S, dt);
  SZ.sis(S, dt);
};

/* ---------------- 4a. PROCESS NOISE ----------------
   Real plants are never perfectly steady. Slow random drifts (Ornstein-Uhlenbeck processes) act on
   catalyst activity, CW temperature, feed vaporisation, H2 uptake and the reactor gas balance, plus
   a daily cooling-water temperature cycle. Transmitters add small filtered jitter (in pidStep).
   [sigma, time constant s] — sigma is a fraction, except cw (°C) and gas (t/h).                     */
SZ.gauss = () => { let u = 0; while (!u) u = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random()); };
const NZ = { act: [0.012, 1200], actG: [0.02, 900], cw: [0.5, 1800], qf: [0.025, 300], h2: [0.02, 600], gas: [0.12, 120] };
SZ.noise = function (S, dt) {
  const on = S.noiseOn !== false; SZ.mnoise = on;
  const n = S.nz || (S.nz = {});
  for (const k in NZ) {
    const [sig, tau] = NZ[k], x = n[k] || 0;
    n[k] = on ? x - x * dt / tau + sig * Math.sqrt(2 * dt / tau) * SZ.gauss() : x * (1 - Math.min(1, dt / 60));
  }
  n.cwd = on ? 0.8 * Math.sin(S.t * 2 * Math.PI / 86400) : 0;   // ±0.8 °C day/night CW cycle
};

/* ---------------- 4b. PRESSURE RELIEF & FLARE ----------------
   Live PSVs act on the gas-inventory pressure of their vessel. Static devices are shown on the
   graphics (thermal reliefs, PRVs, blowdown valve) but are not operated in this version.          */
SZ.PSV = {
  'PSV-211': { d: 'R-211 MZCR reactor relief valve', p: 'P211', set: 34, reseat: 31, cap: 30, k: 0.0012, page: 'mzcr' },
  'PSV-301': { d: 'D-301 HP flash drum relief valve', p: 'P301', set: 24, reseat: 21.5, cap: 12, k: 0.004, page: 'flash' },
  'PSV-401': { d: 'R-401 GPR relief valve', p: 'P401', set: 20, reseat: 18, cap: 10, k: 0.003, page: 'gpr' }
};
SZ.PSV_STATIC = {
  'PSV-102': ['D-102 TEAL drum relief (to flare)', 'catalyst', '10 barg'], 'PSV-212': ['E-211 cooling-water side thermal relief', 'mzcr', '10 barg'],
  'PSV-501': ['D-501 steamer relief (to atmosphere, safe location)', 'finishing', '3.5 barg'], 'PRV-801': ['LP steam header pressure-reducing valve', 'utilities', '4 barg out'],
  'PRV-802': ['Nitrogen header pressure-reducing valve', 'utilities', '7 barg out'], 'PSV-701': ['CW header relief', 'utilities', '6 barg'],
  'BDV-211': ['R-211 emergency depressuring (blowdown) valve — fail open, normally closed', 'mzcr', 'manual / ESD']
};
SZ.relief = function (S, dt) {
  const p = S.p; S.psv = S.psv || {};
  let load = 0;
  for (const tag in SZ.PSV) {
    const v = SZ.PSV[tag], st = S.psv[tag] || (S.psv[tag] = { open: false, n: 0, f: 0 }), P = p[v.p];
    if (!st.open && P >= v.set) {
      st.open = true; st.n++; st.t = S.t;
      SZ.log(S, 'SIS', tag + ' LIFTED at ' + P.toFixed(1) + ' barg (set ' + v.set + ') — relieving to flare');
      SZ.alert(S, 'psv', tag, tag + ' LIFTED — relieving to flare', v.d + ' opened at ' + P.toFixed(1) + ' barg (set pressure ' + v.set + ' barg). Find and remove the cause of the overpressure.');
    } else if (st.open && P <= v.reseat) { st.open = false; SZ.log(S, 'SIS', tag + ' reseated at ' + P.toFixed(1) + ' barg'); }
    st.f = st.open ? v.cap * clamp(0.35 + 0.65 * (P - v.reseat) / (v.set - v.reseat), 0.2, 1) : 0;
    if (st.f > 0) p[v.p] = Math.max(0, P - st.f * v.k * dt);
    load += st.f;
  }
  p.flareRelief = load;
  // trip flaring: compressor / reactor trips dump gas to the flare as a burst that decays (≈ 5 min)
  p.fb = Math.max(0, (p.fb || 0) * (1 - dt / 300));
  if (p.fb < 0.05) p.fb = 0;
  p.flare = lag(p.flare || 0.3, 0.3 + load + p.fb, 8, dt);   // 0.3 t/h purge + sweep gas
  p.flareCap = 60;                                            // flare design capacity, t/h
  p.koLvl = clamp(lag(p.koLvl == null ? 12 : p.koLvl, 12 + Math.min(load, 40) * 1.2, 600, dt), 0, 100);
};

/* equipment trips and on-screen alerts */
SZ.flareBurst = function (S, tph) { S.p.fb = Math.min(80, (S.p.fb || 0) + tph); };
SZ.alert = function (S, kind, tag, title, msg) {
  S.alerts = S.alerts || []; S.alertSeq = (S.alertSeq || 0) + 1;
  S.alerts.unshift({ id: S.alertSeq, t: S.t, kind, tag, title, msg, closed: false });
  if (S.alerts.length > 30) S.alerts.length = 30;
};
SZ.tripEq = function (S, eq, why) {
  if (!S.eq[eq] && S.trip && S.trip[eq]) return;
  S.eq[eq] = false; S.trip = S.trip || {}; S.trip[eq] = { t: S.t, why };
  // gas sent to flare by the trip (t/h burst, decays over ≈ 5 min); only if the plant is pressurised
  const burst = { K211: 10, K401: S.eq.GPR ? 6 : 0, P701: 3 }[eq] || 0;
  if (burst && S.p.P211 > 10) SZ.flareBurst(S, burst);
  const nm = (SZ.EQ[eq] && SZ.EQ[eq].d) || eq;
  SZ.alert(S, 'trip', eq, 'TRIP — ' + nm, why);
};

/* ---------------- 5. PRODUCT PROPERTIES ---------------- */
SZ.props = function (S, dt) {
  const p = S.p;
  if (p.rMZ >= 0.5) calcInst(S);   // no polymer being made → last properties are held
  for (const k in p.inst) {
    if (k === 'MFR') p.pel.MFR = Math.exp(lag(Math.log(Math.max(p.pel.MFR, 1e-3)), Math.log(Math.max(p.inst.MFR, 1e-3)), 900, dt));
    else p.pel[k] = lag(p.pel[k], p.inst[k], 900, dt);
  }
  // on/off-spec tonnes on pellets leaving the extruder
  const ok = SZ.inSpec(p.pel, S.target).all && S.eq.STEAM && SZ.addOk(S);
  const tons = p.exRate * dt / 3600;
  if (ok) S.tons.on += tons; else S.tons.off += tons;
  p.pelOk = ok;
};
function calcInst(S) {
  const p = S.p, fD = p.fracD;
  const a = DONOR.C.a * (1 - fD) + DONOR.D.a * fD, n = DONOR.C.n * (1 - fD) + DONOR.D.n * fD;
  const c2wt = clamp(100 * 0.9 * (p.C2gas / 1000) / Math.max(p.rMZ, 1), 0, 12);
  const tF = 1 + 0.01 * (p.T211 - 80), cF = 1 + 0.03 * c2wt;
  p.MFRr = a * Math.pow(Math.max(p.H2r, 0.01), n) * tF * cF;
  p.MFRd = a * Math.pow(Math.max(p.H2d, 0.005), n) * tF * cF;
  const w = K.wDown;
  const mfrMZ = Math.exp((1 - w) * Math.log(p.MFRr) + w * Math.log(p.MFRd));
  const pi0 = DONOR.C.pi0 * (1 - fD) + DONOR.D.pi0 * fD;
  const PI = pi0 + 0.6 * Math.abs(Math.log(p.MFRr / p.MFRd));
  const xs0 = DONOR.C.xs0 * (1 - fD) + DONOR.D.xs0 * fD, xsK = DONOR.C.xsK * (1 - fD) + DONOR.D.xsK * fD;
  const xsMZ = Math.max(0.8, xs0 + xsK * Math.log(p.donRatioAct / 10) + 0.04 * (80 - p.T211) + 1.6 * c2wt);
  // GPR rubber
  const svc = S.eq.GPR;
  const wR = svc ? p.rG / Math.max(p.rMZ + p.rG, 0.1) : 0;
  const y = p.c2r, xm = 1.6 * y / (1.6 * y + (1 - y) + 1e-9);
  const c2epr = 100 * 28 * xm / (28 * xm + 42 * (1 - xm) + 1e-9);
  const mfrRub = 3 * Math.pow(Math.max(p.h2c2, 0.002) / 0.05, 1.2);
  const mfr = wR > 0.001 ? Math.exp((1 - wR) * Math.log(mfrMZ) + wR * Math.log(mfrRub)) : mfrMZ;
  const cfac = clamp(1 - Math.abs(c2epr - 45) / 80, 0.3, 1);
  const inst = p.inst;
  inst.MFR = mfr; inst.PI = PI; inst.C2 = c2wt * (1 - wR) + c2epr * wR; inst.RUB = wR * 100;
  inst.XS = (1 - wR) * xsMZ + wR * 90;
  inst.IZOD = 2.2 + 0.08 * (PI - 4) + 0.4 * c2wt + 0.5 * wR * 100 * cfac;
  inst.FLEX = 1500 + 70 * (PI - 4) - 25 * (xsMZ - 2.5 - 1.6 * c2wt) - 80 * c2wt - 22 * wR * 100;
  inst.TM = 163 - 5 * c2wt;
  p.c2epr = c2epr; p.c2MZ = c2wt; p.mfrMZ = mfrMZ; p.xsMZ = xsMZ; p.mfrRub = mfrRub;
}

SZ.inSpec = function (props, grade) {
  const g = SZ.GRADES[grade], r = { all: true };
  if (!g) return r;
  for (const k in g.spec) { const [lo, hi] = g.spec[k]; const v = props[k]; const ok = v >= lo && v <= hi; r[k] = ok; if (!ok) r.all = false; }
  return r;
};
SZ.addOk = function (S) {
  const g = SZ.GRADES[S.target]; if (!g) return true;
  for (const k in g.add) { const t = g.add[k]; if (Math.abs((S.add[k] || 0) - t) > Math.max(50, 0.1 * t)) return false; }
  return true;
};

/* ---------------- 6. SAFETY INSTRUMENTED SYSTEM ---------------- */
SZ.sis = function (S, dt) {
  const p = S.p, s = S.sis, E = S.eq;
  s.k211StopT = (!E.K211 && p.rMZ > 1) ? s.k211StopT + dt : 0;
  const trip = (why) => {
    if (s.kill === 'INJECTED') return;
    if (s.bypass) { if (s.lastTrip !== why) { s.lastTrip = why; SZ.log(S, 'SIS', 'BYPASSED trip demand: ' + why); } return; }
    s.kill = 'INJECTED'; s.lastTrip = why; SZ.log(S, 'SIS', 'CO KILL XV-901 INJECTED — ' + why); if (S.p.P211 > 10) SZ.flareBurst(S, 15); SZ.alert(S, 'sis', 'XV-901', 'SIS TRIP — CO KILL INJECTED', why + '. Reaction stopped. Find the cause, then follow the restart checklist (manual §8.7).');
    S.ctl['FIC-101'].mode = 'MAN'; S.ctl['FIC-101'].op = 0;
  };
  if (E.HTR && p.T211 >= 85) { SZ.tripEq(S, 'HTR', 'TSH-212 high temperature: R-211 reached 85 °C. Stop the heater after light-off (> 5 t/h).'); SZ.log(S, 'SIS', 'TSH-212 E-212 start-up heater tripped at 85 °C'); }
  if (p.T211 >= 92) trip('TZHH-211 MZCR temperature ≥ 92 °C');
  if (E.GPR && p.T401 >= 95) trip('TZHH-401 GPR temperature ≥ 95 °C');
  if (s.k211StopT > 60) trip('K-211 stopped > 60 s');
  if (p.siloLvl >= 95 && !s.catCut) {
    if (s.bypass) { if (s.lastTrip !== 'silo') { s.lastTrip = 'silo'; SZ.log(S, 'SIS', 'BYPASSED trip demand: silo ≥ 95 %'); } }
    else { s.catCut = true; SZ.log(S, 'SIS', 'LZHH-601 silo ≥ 95 % — catalyst feed CUT'); SZ.alert(S, 'sis', 'FIC-101', 'SIS TRIP — CATALYST FEED CUT', 'LZHH-601: silo D-601 reached 95 %. Restore the extruder, lower the silo below 90 %, then reset the cut on the FIC-101 faceplate.'); }
  }
};

/* ---------------- 7. RECIPE SOLVER ---------------- */
// Solves riser H2 for the target MFR (given barrier and donor) and catalyst flow for ~30 t/h.
SZ.solveRecipe = function (grade) {
  const g = SZ.GRADES[grade], d = DONOR[g.donor];
  const eff = 1 - Math.exp(-g.barrier / 2.5);
  const cF = (1 + 0.03 * g.c2) * (1 + 0.01 * (g.T - 80));
  const H2r = Math.pow(g.mfr / (d.a * cF * Math.pow(1 - eff, K.wDown * d.n)), 1 / d.n);
  const act = SZ.activity({ T: g.T, tealRatio: g.tealCat, donRatio: g.tealDon, H2r: H2r, P: g.P, c2wt: g.c2 });
  const cat = 30 / (K.mileage * act);
  const ethyl = g.c2 / 100 * 30 * 1000 / 0.9;
  const r = { grade, H2r, cat, ethyl, barrier: g.barrier, T: g.T, P: g.P, tealCat: g.tealCat, tealDon: g.tealDon, donor: g.donor, gpr: g.gpr, circ: g.circ };
  if (g.gpr) Object.assign(r, { gprT: g.gprT, gprP: g.gprP, c2ratio: g.c2ratio, h2c2: g.h2c2, gprLvl: g.gprLvl });
  return r;
};

/* list of SP items a recipe sets: [label, tag or key, value, unit] */
SZ.recipeItems = function (grade) {
  const r = SZ.solveRecipe(grade);
  const it = [
    ['External donor', 'donor', r.donor, ''],
    ['Catalyst FIC-101', 'FIC-101', r.cat, 'kg/h'],
    ['TEAL/cat FFIC-102', 'FFIC-102', r.tealCat, 'g/g'],
    ['TEAL/donor FFIC-103', 'FFIC-103', r.tealDon, 'g/g'],
    ['MZCR T TIC-211', 'TIC-211', r.T, '°C'],
    ['MZCR P PIC-211', 'PIC-211', r.P, 'barg'],
    ['Riser H2 AIC-211', 'AIC-211', r.H2r, 'mol%'],
    ['Barrier FIC-212', 'FIC-212', r.barrier, 't/h'],
    ['Circulation HIC-213', 'HIC-213', r.circ, '%'],
    ['Ethylene FIC-203', 'FIC-203', r.ethyl, 'kg/h'],
    ['GPR in service', 'GPR', r.gpr ? 'SERVICE' : 'BYPASS', '']
  ];
  if (r.gpr) it.push(['GPR T TIC-401', 'TIC-401', r.gprT, '°C'], ['GPR P PIC-401', 'PIC-401', r.gprP, 'barg'],
    ['C2/(C2+C3) AIC-401', 'AIC-401', r.c2ratio, ''], ['H2/C2 AIC-402', 'AIC-402', r.h2c2, ''], ['GPR level LIC-401', 'LIC-401', r.gprLvl, '%']);
  return it;
};
})(window);
