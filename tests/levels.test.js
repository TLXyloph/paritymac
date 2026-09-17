/* Verifies every generated problem actually satisfies put-call parity,
   and that the seven worked examples resolve to their stated answers.
   Run: node tests/levels.test.js */
'use strict';

global.window = {};
require('../src/levels.js');
var PCP = global.window.PCP;

var fails = [];
function check(cond, msg) { if (!cond) fails.push(msg); }

var TERM = { '3mo': 0.25, '6mo': 0.5, '9mo': 0.75, '1y': 1 };

/* ---- fixtures: the seven worked examples, against the bare identities --- */
var D = function (x) { return Math.round(x * 100); };

var fixtures = [
  ['L1 S=100 K=105 C=3 -> P=8',
    D(3) - (D(100) - D(105)), D(8)],
  ['L2 S=97.40 K=95 P=1.85 -> C=4.25',
    D(1.85) + (D(97.40) - D(95)), D(4.25)],
  ['L3 F=101.20 K=100 C=4.10 -> P=2.90',
    D(4.10) - (D(101.20) - D(100)), D(2.90)],
  ['L4 S=100 K=100 r=5% T=6mo C=6 -> P=3.50',
    D(6) - (D(100) - D(100) + D(100) * 0.05 * 0.5), D(3.50)],
  ['L5 S=50 div=0.60 K=50 P=2 -> C=1.40',
    D(2) + (D(50) - D(0.60) - D(50)), D(1.40)],
  ['L6 S=100 K=100 C=5.00 P=4.50 -> edge 0.50, call rich',
    (D(5.00) - D(4.50)) - (D(100) - D(100)), D(0.50)],
  ['L7 95/100 box at 4.80 -> edge 0.20, buy',
    (D(100) - D(95)) - D(4.80), D(0.20)]
];
fixtures.forEach(function (f) {
  check(f[1] === f[2], 'fixture ' + f[0] + ' -> got ' + (f[1] / 100));
});

/* ---- generated problems: identity must hold every time ----------------- */
var N = 20000;

for (var lv = 1; lv <= 7; lv++) {
  for (var i = 0; i < N; i++) {
    var p = PCP.generate(lv);
    var v = {};
    p.givens.forEach(function (g) { v[g.sym] = g; });

    var tag = 'L' + lv + ' #' + i;

    // the hidden slot must not leak into the givens
    check(v[p.label] === undefined || p.shape === 'B',
      tag + ' unknown ' + p.label + ' also shown as a given');

    // every displayed money value round-trips through its own display text
    p.givens.forEach(function (g) {
      if (g.cents === null) return;
      check(Math.round(parseFloat(g.text) * 100) === g.cents,
        tag + ' display "' + g.text + '" != ' + g.cents + 'c for ' + g.sym);
    });

    check(p.answer > 0, tag + ' non-positive answer ' + p.answer);
    check(p.answer % 5 === 0, tag + ' answer off the 0.05 grid: ' + p.answer);

    if (p.shape === 'A') {
      v[p.label] = { cents: p.answer };
      var C = v.C.cents, P = v.P.cents, K = v.K.cents;
      check(C > 0 && P > 0, tag + ' non-positive premium C=' + C + ' P=' + P);

      var rhs;
      if (lv === 1 || lv === 2) rhs = v.S.cents - K;
      else if (lv === 3) rhs = (v.F ? v.F.cents : v.S.cents + v.carry.cents) - K;
      else if (lv === 4) {
        var r = parseFloat(v.r.text) / 100, T = TERM[v.T.text];
        check(T !== undefined, tag + ' bad term "' + v.T.text + '"');
        rhs = v.S.cents - K + K * r * T;
        check(Number.isInteger(rhs), tag + ' KrT not whole cents: ' + rhs);
      } else rhs = v.S.cents - v.div.cents - K;

      check(C - P === rhs, tag + ' parity broken: C-P=' + (C - P) + ' rhs=' + rhs);
      if (lv === 1) {
        check([C, P, v.S.cents, K].every(function (c) { return c % 100 === 0; }),
          tag + ' level 1 should be whole dollars');
      }
    } else if (lv === 6) {
      var S6 = v.S.cents, K6 = v.K.cents, C6 = v.C.cents, P6 = v.P.cents;
      var edge = (C6 - P6) - (S6 - K6);
      check(Math.abs(edge) === p.answer, tag + ' edge ' + edge + ' != answer ' + p.answer);
      check(p.binary.correct === (edge > 0 ? 'j' : 'k'), tag + ' wrong trade direction');
      // neither leg may be quoted below intrinsic, or there is a second arb
      check(C6 >= Math.max(0, S6 - K6), tag + ' call below intrinsic');
      check(P6 >= Math.max(0, K6 - S6), tag + ' put below intrinsic');
    } else {
      var ks = v.box.text.split('/').map(Number);
      var width = Math.round((ks[1] - ks[0]) * 100);
      var mkt = v.mkt.cents;
      check(Math.abs(width - mkt) === p.answer, tag + ' box edge mismatch');
      check(p.binary.correct === (mkt > width ? 'k' : 'j'), tag + ' wrong box direction');
      check(mkt > 0, tag + ' non-positive box price');
    }
  }
}

if (fails.length) {
  console.error('FAIL (' + fails.length + ')');
  fails.slice(0, 15).forEach(function (f) { console.error('  ' + f); });
  process.exit(1);
}
console.log('pass: 7 fixtures + ' + (N * 7).toLocaleString() + ' generated problems');
