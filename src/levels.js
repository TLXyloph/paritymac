/* Put-call parity problem generators.
   All money is integer cents so answers land exactly on the 0.05 grid.
   Parity: C - P = S - PV(K), forward form C - P = (F - K) * DF. */
(function (root) {
  'use strict';

  var CENT = 100;

  function randInt(lo, hi) { return lo + Math.floor(Math.random() * (hi - lo + 1)); }
  function pick(a) { return a[randInt(0, a.length - 1)]; }
  function coin() { return Math.random() < 0.5; }

  /* a value in cents within [lo, hi], snapped to a grid (default 0.05) */
  function grid5(lo, hi, step) {
    step = step || 5;
    return randInt(Math.ceil(lo / step), Math.floor(hi / step)) * step;
  }

  /* a round strike, in cents: multiples of $5 */
  function strike(loDollars, hiDollars) {
    return randInt(loDollars / 5, hiDollars / 5) * 5 * CENT;
  }

  /* Display: drop a trailing .00 so "100" reads as 100, but keep .25 / .50 / .05 */
  function num(cents) {
    var v = cents / 100;
    return Number.isInteger(v) ? String(v) : v.toFixed(2);
  }

  /* Split a basis into two positive legs with C - P === basis. */
  function legs(basis, lo, hi, step) {
    var small = grid5(lo, hi, step);
    return basis > 0
      ? { C: small + basis, P: small }
      : { C: small, P: small - basis };
  }

  function slot(sym, cents, opts) {
    opts = opts || {};
    return {
      sym: sym,
      cents: cents,
      text: opts.text !== undefined ? opts.text : num(cents),
      fixed: !!opts.fixed
    };
  }

  /* Hide one of the allowed slots; whatever we hide is the answer, so the
     identity holds by construction and never has to be re-derived. */
  function hide(slots, allowed) {
    var sym = pick(allowed);
    var idx = -1;
    for (var i = 0; i < slots.length; i++) if (slots[i].sym === sym) { idx = i; break; }
    var unknown = slots[idx];
    return {
      shape: 'A',
      givens: slots.filter(function (_, j) { return j !== idx; }),
      label: unknown.sym,
      answer: unknown.cents
    };
  }

  /* ---- 1. missing leg, clean integers -------------------------------- */
  /* C - P = S - K, everything whole. Warm-up: target ~3s. */
  function level1() {
    var S = strike(80, 120);
    var gap = pick([-15, -10, -5, 5, 10, 15]) * CENT;   // K - S
    var K = S + gap;
    var l = legs(-gap, 1 * CENT, 12 * CENT, CENT);      // C - P = S - K = -gap
    return hide([
      slot('S', S), slot('K', K), slot('C', l.C), slot('P', l.P)
    ], ['C', 'P', 'S', 'K']);
  }

  /* ---- 2. missing leg, ugly numbers ---------------------------------- */
  /* Same identity, spot and premiums carry cents. Target ~5s. */
  function level2() {
    var K = strike(80, 120);
    var off = 0;
    while (Math.abs(off) < 25) off = grid5(-800, 800);  // S - K, never near zero
    var S = K + off;
    var l = legs(off, 50, 600);
    return hide([
      slot('S', S), slot('K', K), slot('C', l.C), slot('P', l.P)
    ], ['C', 'P', 'S', 'K']);
  }

  /* ---- 3. forward, not spot ------------------------------------------ */
  /* C - P = F - K. Either F is quoted outright, or you get S plus carry. */
  function level3() {
    var K = strike(80, 120);
    var off = 0;
    while (Math.abs(off) < 25) off = grid5(-400, 400);  // F - K
    var F = K + off;

    if (coin()) {                                        // F quoted directly
      var l = legs(off, 50, 500);
      return hide([
        slot('F', F), slot('K', K), slot('C', l.C), slot('P', l.P)
      ], ['C', 'P', 'F', 'K']);
    }

    var carry = 0;                                       // S + carry = F
    while (Math.abs(carry) < 20) carry = grid5(-200, 200);
    var S = F - carry;
    var l2 = legs(off, 50, 500);
    return hide([
      slot('S', S), slot('carry', carry), slot('K', K),
      slot('C', l2.C), slot('P', l2.P)
    ], ['C', 'P']);
  }

  /* ---- 4. rates, simple-interest approximation ----------------------- */
  /* C - P = S - K + KrT. Where the arithmetic gets real. */
  var TERMS = [
    { t: 0.25, text: '3mo' }, { t: 0.5, text: '6mo' },
    { t: 0.75, text: '9mo' }, { t: 1, text: '1y' }
  ];

  function level4() {
    var K, r, T, krt, tries = 0;
    do {
      K = pick([50, 60, 80, 100, 120, 150, 200]) * CENT;
      r = pick([1, 2, 3, 4, 5, 6, 8, 10]);
      T = pick(TERMS);
      krt = K * (r / 100) * T.t;
      tries++;
    } while (tries < 300 && (Math.abs(krt - Math.round(krt)) > 1e-9 || Math.round(krt) % 5 !== 0));
    krt = Math.round(krt);

    var S = K + pick([-500, -250, 0, 0, 250, 500]);
    var basis = S - K + krt;                             // C - P
    var l = legs(basis, 50, 800);

    return hide([
      slot('S', S), slot('K', K),
      slot('r', null, { text: r + '%', fixed: true }),
      slot('T', null, { text: T.text, fixed: true }),
      slot('C', l.C), slot('P', l.P)
    ], ['C', 'P', 'S']);
  }

  /* ---- 5. dividends --------------------------------------------------- */
  /* C - P = S - PV(div) - K, rates zero so PV(div) is the cash amount. */
  function level5() {
    var K = strike(30, 120);
    var div = pick([15, 20, 25, 30, 40, 50, 60, 75, 100]);
    var S = K + grid5(-400, 400);
    var basis = S - div - K;                             // C - P
    var l = legs(basis, 50, 600);
    return hide([
      slot('S', S), slot('K', K), slot('div', div),
      slot('C', l.C), slot('P', l.P)
    ], ['C', 'P', 'S', 'div']);
  }

  /* ---- 6. arb direction ----------------------------------------------- */
  /* All four legs quoted, perturbed off parity. Magnitude plus the trade. */
  function level6() {
    var K = strike(80, 120);
    var S = K + grid5(-300, 300);
    var edge = grid5(10, 100) * (coin() ? 1 : -1);
    var actual = (S - K) + edge;                         // market C - P
    var l = legs(actual, Math.max(50, Math.abs(edge)), 600);

    return {
      shape: 'B',
      givens: [
        slot('S', S), slot('K', K), slot('C', l.C), slot('P', l.P),
        slot('r', null, { text: '0', fixed: true })
      ],
      label: 'edge',
      answer: Math.abs(edge),
      binary: {
        correct: edge > 0 ? 'j' : 'k',
        j: 'sell call · buy put · buy stock',
        k: 'buy call · sell put · short stock'
      }
    };
  }

  /* ---- 7. boxes -------------------------------------------------------- */
  /* A K1/K2 box is worth K2 - K1 at zero rates. Buy it cheap, sell it rich. */
  function level7() {
    var K1 = strike(40, 120);
    var width = pick([5, 10, 20, 25]) * CENT;
    var K2 = K1 + width;
    var edge = grid5(10, 60);
    var rich = coin();
    var price = rich ? width + edge : width - edge;

    return {
      shape: 'B',
      givens: [
        slot('box', null, { text: num(K1) + '/' + num(K2), fixed: true }),
        slot('mkt', price),
        slot('r', null, { text: '0', fixed: true })
      ],
      label: 'edge',
      answer: edge,
      binary: {
        correct: rich ? 'k' : 'j',
        j: 'buy the box',
        k: 'sell the box'
      }
    };
  }

  var LEVELS = [
    { n: 1, name: 'missing leg, clean integers', shape: 'A', gen: level1 },
    { n: 2, name: 'missing leg, ugly numbers',   shape: 'A', gen: level2 },
    { n: 3, name: 'forward, not spot',           shape: 'A', gen: level3 },
    { n: 4, name: 'rates, simple interest',      shape: 'A', gen: level4 },
    { n: 5, name: 'dividends',                   shape: 'A', gen: level5 },
    { n: 6, name: 'arb direction',               shape: 'B', gen: level6 },
    { n: 7, name: 'boxes',                       shape: 'B', gen: level7 }
  ];

  function generate(n) {
    var lv = LEVELS[n - 1];
    var p = lv.gen();
    p.level = n;
    return p;
  }

  root.PCP = root.PCP || {};
  root.PCP.LEVELS = LEVELS;
  root.PCP.generate = generate;
  root.PCP.num = num;
})(window);
