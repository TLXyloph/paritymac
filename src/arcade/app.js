/* Paritycade — screen flow, timing and input for the arcade variant.
   Shares levels.js with Paritymac; the drill logic is identical, the
   presentation and the feedback are not. */
(function () {
  'use strict';

  var PCP = window.PCP;
  var $ = function (id) { return document.getElementById(id); };

  var DURATIONS = [30, 60, 120, 300];
  var STORE = 'paritycade.settings';
  var HIST = 'paritycade.history';
  var HIST_MAX = 200;
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var TIME_CELLS = 40;
  var STREAK_PIPS = 8;

  var cfg = load();
  var game = null;
  var ticker = null;

  /* ---- settings ---------------------------------------------------------- */

  function load() {
    var d = { enabled: [2, 3, 4, 5, 6, 7], duration: 120, enter: false };
    try {
      var raw = JSON.parse(localStorage.getItem(STORE));
      if (!raw) return d;
      if (Array.isArray(raw.enabled)) {
        d.enabled = raw.enabled.filter(function (n) { return n >= 1 && n <= 7; });
      }
      if (DURATIONS.indexOf(raw.duration) >= 0) d.duration = raw.duration;
      d.enter = !!raw.enter;
    } catch (e) { /* first run, or storage unavailable */ }
    return d;
  }

  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(cfg)); } catch (e) { /* ignore */ }
  }

  /* ---- run history -------------------------------------------------------- */

  function loadHistory() {
    try {
      var h = JSON.parse(localStorage.getItem(HIST));
      return Array.isArray(h) ? h : [];
    } catch (e) { return []; }
  }

  function saveRun(rec) {
    try {
      var h = loadHistory();
      h.push(rec);
      if (h.length > HIST_MAX) h = h.slice(h.length - HIST_MAX);
      localStorage.setItem(HIST, JSON.stringify(h));
    } catch (e) { /* storage unavailable: the run simply is not kept */ }
  }

  /* Scores only compare within the same duration and level set. */
  function configKey(dur, levels) { return dur + ':' + (levels || []).join(','); }

  function bestFor(history, key) {
    return history.reduce(function (b, r) {
      return configKey(r.dur, r.levels) === key && r.score > b ? r.score : b;
    }, 0);
  }

  function rateOf(r) { return (r.score / (r.dur / 60)).toFixed(1); }

  function stamp(ms) {
    var d = new Date(ms);
    return {
      day: d.getDate() + ' ' + MONTHS[d.getMonth()],
      time: String(d.getHours()).padStart(2, '0') + ':' +
            String(d.getMinutes()).padStart(2, '0')
    };
  }

  function renderMenu() {
    $('levels').innerHTML = PCP.LEVELS.map(function (lv) {
      var on = cfg.enabled.indexOf(lv.n) >= 0;
      return '<div class="row" data-level="' + lv.n + '" data-on="' + on + '">' +
        '<span class="n">' + lv.n + '</span><span>' + lv.name + '</span>' +
        '<span class="state">' + (on ? 'ON' : 'OFF') + '</span></div>';
    }).join('');

    $('durations').innerHTML = DURATIONS.map(function (d) {
      return '<span class="choice" data-duration="' + d + '" data-on="' +
        (cfg.duration === d) + '">' + d + '</span>';
    }).join('');

    $('submits').innerHTML = [['AUTO', false], ['ENTER', true]].map(function (s) {
      return '<span class="choice" data-enter="' + s[1] + '" data-on="' +
        (cfg.enter === s[1]) + '">' + s[0] + '</span>';
    }).join('');

    $('startHint').dataset.ready = cfg.enabled.length > 0;
  }

  function toggleLevel(n) {
    var i = cfg.enabled.indexOf(n);
    if (i >= 0) cfg.enabled.splice(i, 1); else cfg.enabled.push(n);
    cfg.enabled.sort(function (a, b) { return a - b; });
    save();
    renderMenu();
  }

  $('levels').addEventListener('click', function (e) {
    var row = e.target.closest('[data-level]');
    if (row) toggleLevel(Number(row.dataset.level));
  });
  $('durations').addEventListener('click', function (e) {
    var c = e.target.closest('[data-duration]');
    if (c) { cfg.duration = Number(c.dataset.duration); save(); renderMenu(); }
  });
  $('submits').addEventListener('click', function (e) {
    var c = e.target.closest('[data-enter]');
    if (c) { cfg.enter = c.dataset.enter === 'true'; save(); renderMenu(); }
  });
  $('startHint').addEventListener('click', function () { start(); });

  /* ---- screens ----------------------------------------------------------- */

  function show(name) {
    ['menu', 'game', 'results', 'history'].forEach(function (s) { $(s).hidden = s !== name; });
    if (name === 'menu') renderMenu();
    if (name === 'history') renderHistory();
    if (name === 'game') $('answer').focus();
  }

  /* Re-trigger a stepped animation that may already be on the element. */
  function replay(el, apply) {
    apply(el, false);
    void el.offsetWidth;
    apply(el, true);
  }

  /* ---- game -------------------------------------------------------------- */

  function start() {
    if (!cfg.enabled.length) return;
    game = {
      solved: 0, streak: 0, best: 0,
      stats: {}, misses: [],
      endsAt: performance.now() + cfg.duration * 1000,
      problem: null, tStart: 0, fumbled: false
    };

    $('timebar').innerHTML = new Array(TIME_CELLS + 1).join('<i></i>');
    $('streak').innerHTML = new Array(STREAK_PIPS + 1).join('<i></i>');
    $('best').textContent = '0';
    paintScore();
    paintStreak();

    show('game');
    next();
    tick();
    ticker = setInterval(tick, 100);
  }

  function statFor(n) {
    return game.stats[n] || (game.stats[n] = { solved: 0, missed: 0, ms: 0 });
  }

  function next() {
    var pool = cfg.enabled;
    game.problem = PCP.generate(pool[Math.floor(Math.random() * pool.length)]);
    game.tStart = performance.now();
    game.fumbled = false;
    $('answer').value = '';
    $('typed').textContent = '';
    renderProblem();
  }

  function renderProblem() {
    var p = game.problem;

    $('givens').innerHTML = p.givens.map(function (g) {
      return '<span class="given"><span class="sym">' + g.sym +
        '</span><span class="val">' + g.text + '</span></span>';
    }).join('');

    $('solveLabel').textContent = p.label.toUpperCase();

    var trades = $('trades');
    if (p.binary) {
      trades.dataset.empty = 'false';
      trades.innerHTML =
        '<div><span class="key">J</span>' + p.binary.j + '</div>' +
        '<div><span class="key">K</span>' + p.binary.k + '</div>';
    } else {
      trades.dataset.empty = 'true';
      trades.innerHTML = '<div>&nbsp;</div><div>&nbsp;</div>';
    }

    replay($('stage'), function (el, on) {
      if (on) el.dataset.fresh = 'true'; else el.removeAttribute('data-fresh');
    });
  }

  function paintScore() {
    $('score').textContent = String(game.solved).padStart(4, '0');
  }

  function paintStreak() {
    var pips = $('streak').children;
    for (var i = 0; i < pips.length; i++) {
      if (i < Math.min(game.streak, STREAK_PIPS)) pips[i].dataset.on = 'true';
      else pips[i].removeAttribute('data-on');
    }
  }

  function parseCents(s) {
    s = (s || '').trim();
    if (!s || s === '.' || !/^\d*\.?\d*$/.test(s)) return null;
    var f = parseFloat(s);
    return isFinite(f) ? Math.round(f * 100) : null;
  }

  function describe(p) {
    return {
      level: p.level,
      given: p.givens.map(function (g) { return g.sym + ' ' + g.text; }).join('&nbsp;&nbsp;&nbsp;'),
      answer: PCP.num(p.answer),
      trade: p.binary ? p.binary[p.binary.correct] : ''
    };
  }

  /* Only ever called when the answer was right: moving on is the signal. */
  function advance() {
    var p = game.problem;
    var st = statFor(p.level);
    st.ms += performance.now() - game.tStart;
    st.solved++;
    game.solved++;
    game.streak++;
    if (game.streak > game.best) {
      game.best = game.streak;
      $('best').textContent = game.best;
    }
    paintScore();
    paintStreak();
    replay($('score'), function (el, on) { el.classList.toggle('hit', on); });
    next();
  }

  /* Record a wrong attempt once per problem, so retrying cannot inflate it. */
  function fumble() {
    if (game.fumbled) return;
    game.fumbled = true;
    statFor(game.problem.level).missed++;
    game.misses.push(describe(game.problem));

    game.streak = 0;
    var pips = $('streak');
    pips.dataset.broke = 'true';
    setTimeout(function () { pips.removeAttribute('data-broke'); paintStreak(); }, 340);
  }

  function tryAnswer() {
    var p = game.problem;
    if (!p || p.binary) return;                    // shape B answers with J/K
    var v = parseCents($('answer').value);
    if (v !== null && v === p.answer) advance();
  }

  function tryTrade(key) {
    var p = game.problem;
    if (!p || !p.binary) return;

    var v = parseCents($('answer').value);
    if (v === null) return;            // no magnitude yet, so not yet an attempt

    if (v === p.answer && key === p.binary.correct) {
      advance();
      return;
    }
    // Wrong. Hold the problem rather than moving on, so that advancing means
    // the same thing here as on the typed levels: you got it right.
    fumble();
  }

  $('answer').addEventListener('input', function () {
    var cleaned = this.value.replace(/[^0-9.]/g, '');
    if (cleaned !== this.value) this.value = cleaned;
    $('typed').textContent = cleaned;
    if (!cfg.enter) tryAnswer();
  });

  function tick() {
    var left = Math.max(0, game.endsAt - performance.now());
    var frac = left / (cfg.duration * 1000);

    var secs = Math.ceil(left / 1000);
    var text = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
    if ($('clock').textContent !== text) $('clock').textContent = text;

    var lit = Math.ceil(frac * TIME_CELLS);
    var cells = $('timebar').children;
    for (var i = 0; i < cells.length; i++) {
      if (i < lit) cells[i].dataset.on = 'true';
      else cells[i].removeAttribute('data-on');
    }
    $('timebar').dataset.low = frac <= 0.2;

    if (left <= 0) finish();
  }

  function finish() {
    clearInterval(ticker);
    ticker = null;

    // Read the prior best before saving, or this run would beat itself.
    var priorBest = bestFor(loadHistory(), configKey(cfg.duration, cfg.enabled));

    var rec = {
      t: Date.now(),
      score: game.solved,
      dur: cfg.duration,
      levels: cfg.enabled.slice(),
      streak: game.best,
      stats: {}
    };
    Object.keys(game.stats).forEach(function (k) {
      var st = game.stats[k];
      rec.stats[k] = { s: st.solved, m: st.missed, ms: Math.round(st.ms) };
    });
    saveRun(rec);

    renderResults(priorBest);
    show('results');
  }

  /* ---- results ----------------------------------------------------------- */

  function renderResults(priorBest) {
    var attempts = 0, missed = 0;
    Object.keys(game.stats).forEach(function (k) {
      attempts += game.stats[k].solved + game.stats[k].missed;
      missed += game.stats[k].missed;
    });
    var acc = attempts ? Math.round((attempts - missed) / attempts * 100) : 100;

    $('finals').innerHTML = [
      ['SCORE', String(game.solved).padStart(4, '0')],
      ['RATE', (game.solved / (cfg.duration / 60)).toFixed(1) + '/min'],
      ['BEST STREAK', String(game.best).padStart(2, '0')],
      ['ACCURACY', acc + '%'],
      [game.solved > priorBest ? 'NEW BEST' : 'BEST', game.solved > priorBest
        ? String(game.solved).padStart(4, '0') : String(priorBest).padStart(4, '0')]
    ].map(function (f) {
      return '<span class="final">' + f[0] + '<b>' + f[1] + '</b></span>';
    }).join('');

    var rows = PCP.LEVELS.filter(function (lv) { return game.stats[lv.n]; })
      .map(function (lv) {
        var st = game.stats[lv.n];
        var n = st.solved + st.missed;
        var avg = n ? (st.ms / n / 1000).toFixed(1) + 's' : '—';
        return '<div class="bd"><span class="n">' + lv.n + '</span>' +
          '<span>' + lv.name + '</span>' +
          '<span class="v">' + st.solved + '</span>' +
          '<span class="v">' + avg + '</span>' +
          '<span class="missed">' + (st.missed ? st.missed + ' MISSED' : '') +
          '</span></div>';
      });
    $('breakdown').innerHTML = rows.join('') || '<div class="empty">NOTHING SOLVED</div>';

    $('misses').innerHTML = game.misses.length
      ? '<div class="cap">MISSED</div>' + game.misses.map(function (m) {
          return '<div class="miss">' + m.given + ' &nbsp;&rarr;&nbsp; <span class="was">' +
            m.answer + (m.trade ? ' · ' + m.trade : '') + '</span></div>';
        }).join('')
      : '';
  }

  /* ---- history screen ------------------------------------------------------ */

  function renderHistory() {
    var h = loadHistory();

    var bestScore = h.reduce(function (b, r) { return r.score > b ? r.score : b; }, 0);
    var bestStreak = h.reduce(function (b, r) { return (r.streak || 0) > b ? r.streak : b; }, 0);
    $('histFinals').innerHTML = [
      ['RUNS', String(h.length).padStart(2, '0')],
      ['BEST SCORE', String(bestScore).padStart(4, '0')],
      ['BEST STREAK', String(bestStreak).padStart(2, '0')]
    ].map(function (f) {
      return '<span class="final">' + f[0] + '<b>' + f[1] + '</b></span>';
    }).join('');

    // Best is per configuration, so a 30s run never outranks a 300s one.
    var best = {};
    h.forEach(function (r) {
      var k = configKey(r.dur, r.levels);
      if (!(k in best) || r.score > best[k]) best[k] = r.score;
    });

    var recent = h.slice().reverse().slice(0, 12);
    $('runsCap').textContent = recent.length ? 'RECENT' : '';
    $('runs').innerHTML = recent.length
      ? recent.map(function (r) {
          var s = stamp(r.t);
          var isBest = r.score > 0 && r.score === best[configKey(r.dur, r.levels)];
          return '<div class="run" data-best="' + isBest + '">' +
            '<span>' + s.day + '</span><span>' + s.time + '</span>' +
            '<span>' + r.dur + 's</span>' +
            '<span class="score">' + r.score + '</span>' +
            '<span class="rate">' + rateOf(r) + '/min</span>' +
            '<span class="flag">' + (isBest ? 'BEST' : '') + '</span></div>';
        }).join('')
      : '<div class="empty">NO RUNS YET</div>';

    // Lifetime per-level timing, pooled across every run.
    var agg = {};
    h.forEach(function (r) {
      Object.keys(r.stats || {}).forEach(function (k) {
        var a2 = agg[k] || (agg[k] = { n: 0, ms: 0 });
        a2.n += r.stats[k].s + r.stats[k].m;
        a2.ms += r.stats[k].ms;
      });
    });
    var rows = PCP.LEVELS.filter(function (lv) { return agg[lv.n] && agg[lv.n].n; })
      .map(function (lv) {
        var a2 = agg[lv.n];
        return '<div class="lt"><span class="n">' + lv.n + '</span>' +
          '<span>' + lv.name + '</span>' +
          '<span class="v">' + a2.n + '</span>' +
          '<span class="v">' + (a2.ms / a2.n / 1000).toFixed(1) + 's</span></div>';
      });
    $('ltCap').textContent = rows.length ? 'BY LEVEL · ATTEMPTS · AVG' : '';
    $('lifetime').innerHTML = rows.join('');
  }

  $('history').addEventListener('click', function (e) {
    if (e.target.closest('.start')) show('menu');
  });

  /* ---- keyboard ----------------------------------------------------------- */

  document.addEventListener('keydown', function (e) {
    var on = !$('menu').hidden ? 'menu'
           : !$('game').hidden ? 'game'
           : !$('history').hidden ? 'history'
           : 'results';

    if (on === 'menu') {
      if (e.key >= '1' && e.key <= '7') { toggleLevel(Number(e.key)); e.preventDefault(); }
      else if (e.key === 'Enter') { start(); e.preventDefault(); }
      else if (/^h$/i.test(e.key)) { show('history'); e.preventDefault(); }
      return;
    }

    if (on === 'history') {
      if (e.key === 'Escape' || e.key === 'Enter') { show('menu'); e.preventDefault(); }
      return;
    }

    if (on === 'game') {
      if (e.key === 'Escape') {
        clearInterval(ticker); ticker = null; show('menu'); e.preventDefault();
      } else if (e.key === 'Enter') {
        if (game.problem && !game.problem.binary) {
          var v = parseCents($('answer').value);
          if (v !== null && v === game.problem.answer) advance();
        }
        e.preventDefault();
      } else if (game.problem && game.problem.binary && /^[jk]$/i.test(e.key)) {
        tryTrade(e.key.toLowerCase());
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'Enter') { start(); e.preventDefault(); }
    else if (e.key === 'Escape') { show('menu'); e.preventDefault(); }
    else if (/^h$/i.test(e.key)) { show('history'); e.preventDefault(); }
  });

  /* Keep the caret where the typing goes, even after a stray click. */
  document.addEventListener('mousedown', function (e) {
    if ($('game').hidden) return;
    if (e.target !== $('answer')) { e.preventDefault(); $('answer').focus(); }
  });

  show('menu');
})();
