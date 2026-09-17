/* History screen: aggregates saved runs into high scores, recent runs and
   lifetime per-level timing. Kept out of engine.js so that running the drill
   and reporting on it stay separable. */
(function (root) {
  'use strict';
  var PCP = root.PCP = root.PCP || {};

  /* ctx supplies the engine's helpers: runs, q, configKey, rateOf, stamp,
     setCap. See engine.js for the single call site. */
  PCP.renderHistory = function (ctx) {
    var h = ctx.runs, q = ctx.q, configKey = ctx.configKey;
    var rateOf = ctx.rateOf, stamp = ctx.stamp, setCap = ctx.setCap;

    q('hist-total').textContent = h.length;
    q('hist-label').textContent = h.length === 1 ? 'run' : 'runs';

    q('hist-finals').innerHTML = [
      ['runs', String(h.length)],
      ['best score', String(h.reduce(function (b, r) { return r.score > b ? r.score : b; }, 0))],
      ['best streak', String(h.reduce(function (b, r) { return (r.streak || 0) > b ? r.streak : b; }, 0))]
    ].map(function (f) {
      return '<span class="final"><span class="k">' + f[0] + '</span><b>' + f[1] + '</b></span>';
    }).join('');

    // Best is per configuration, so a 30s run never outranks a 300s one.
    var best = {};
    h.forEach(function (r) {
      var k = configKey(r.dur, r.levels);
      if (!(k in best) || r.score > best[k]) best[k] = r.score;
    });

    // High scores: the best run of each configuration you have played, since
    // a 30s score and a 300s score are not the same achievement.
    var bestRun = {};
    h.forEach(function (r) {
      var k = configKey(r.dur, r.levels);
      if (!bestRun[k] || r.score > bestRun[k].score) bestRun[k] = r;
    });
    var highs = Object.keys(bestRun).map(function (k) { return bestRun[k]; })
      .filter(function (r) { return r.score > 0; })
      .sort(function (x, y) { return y.score - x.score || y.dur - x.dur; })
      .slice(0, 8);

    setCap('highs-cap', highs.length);
    q('highs').innerHTML = highs.map(function (r, i) {
      return '<div class="high" data-top="' + (i === 0) + '">' +
        '<span class="dur">' + r.dur + 's</span>' +
        '<span class="lv">' + (r.levels || []).join('') + '</span>' +
        '<span class="score">' + r.score + '</span>' +
        '<span class="rate">' + rateOf(r) + '/min</span>' +
        '<span class="when">' + stamp(r.t).day + '</span></div>';
    }).join('');

    var recent = h.slice().reverse().slice(0, 8);
    setCap('runs-cap', recent.length);
    q('runs').innerHTML = recent.length
      ? recent.map(function (r) {
          var s = stamp(r.t);
          var isBest = r.score > 0 && r.score === best[configKey(r.dur, r.levels)];
          return '<div class="run" data-best="' + isBest + '">' +
            '<span>' + s.day + '</span><span>' + s.time + '</span>' +
            '<span>' + r.dur + 's</span>' +
            '<span class="score">' + r.score + '</span>' +
            '<span class="rate">' + rateOf(r) + '/min</span>' +
            '<span class="flag">' + (isBest ? 'best' : '') + '</span></div>';
        }).join('')
      : '<div class="empty">no runs yet</div>';

    var agg = {};
    h.forEach(function (r) {
      Object.keys(r.stats || {}).forEach(function (k) {
        var a = agg[k] || (agg[k] = { n: 0, ms: 0 });
        a.n += r.stats[k].s + r.stats[k].m;
        a.ms += r.stats[k].ms;
      });
    });
    var rows = PCP.LEVELS.filter(function (lv) { return agg[lv.n] && agg[lv.n].n; })
      .map(function (lv) {
        var a = agg[lv.n];
        return '<div class="lt"><span class="n">' + lv.n + '</span>' +
          '<span class="name">' + lv.name + '</span>' +
          '<span class="v">' + a.n + '</span>' +
          '<span class="v">' + (a.ms / a.n / 1000).toFixed(1) + 's</span></div>';
      });
    setCap('lifetime-cap', rows.length);
    q('lifetime').innerHTML = rows.join('');
    q('history-hint').textContent = 'esc back';
  
  };
})(window);
