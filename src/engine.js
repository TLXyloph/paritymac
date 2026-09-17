/* Drill engine: state, timing, scoring, history and input.
   Skin-agnostic — it only ever writes into [data-pcp] slots. */
(function () {
  'use strict';

  var DURATIONS = [30, 60, 120, 300];
  var STORE = 'pcp.settings';
  var HIST = 'pcp.history';
  var HIST_MAX = 200;
  var TIME_CELLS = 40;
  var STREAK_PIPS = 8;
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  var q = function (name) { return document.querySelector('[data-pcp="' + name + '"]'); };
  var screenOf = function (n) { return document.querySelector('[data-screen="' + n + '"]'); };

  var skin = PCP.applySkin((PCP.currentSkin() || {}).id);
  var cfg = loadCfg();
  var game = null;
  var ticker = null;

  /* ---- storage ------------------------------------------------------------ */

  function loadCfg() {
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

  function saveCfg() {
    try { localStorage.setItem(STORE, JSON.stringify(cfg)); } catch (e) { /* ignore */ }
  }

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
  function padScore(n) { return skin && skin.scorePad ? String(n).padStart(skin.scorePad, '0') : String(n); }

  function stamp(ms) {
    var d = new Date(ms);
    return {
      day: d.getDate() + ' ' + MONTHS[d.getMonth()],
      time: String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
    };
  }

  function setCap(name, show) { q(name).dataset.show = show ? 'true' : 'false'; }

  /* ---- menu --------------------------------------------------------------- */

  function renderMenu() {
    q('levels').innerHTML = PCP.LEVELS.map(function (lv) {
      var on = cfg.enabled.indexOf(lv.n) >= 0;
      return '<div class="row" data-level="' + lv.n + '" data-on="' + on + '">' +
        '<span class="n">' + lv.n + '</span><span class="name">' + lv.name + '</span>' +
        '<span class="state" data-on="' + on + '"></span></div>';
    }).join('');

    q('durations').innerHTML = DURATIONS.map(function (d) {
      return '<span class="choice" data-duration="' + d + '" data-on="' +
        (cfg.duration === d) + '">' + d + '</span>';
    }).join('');

    q('submits').innerHTML = [['auto', false], ['enter', true]].map(function (s) {
      return '<span class="choice" data-enter="' + s[1] + '" data-on="' +
        (cfg.enter === s[1]) + '">' + s[0] + '</span>';
    }).join('');

    q('skins').innerHTML = PCP.skins().map(function (s) {
      return '<span class="choice" data-skinid="' + s.id + '" data-on="' +
        (skin && skin.id === s.id) + '">' + s.name + '</span>';
    }).join('');

    q('menu-hint').textContent = '1–7 toggle · ⏎ start · h history';
    q('menu-hint').dataset.ready = cfg.enabled.length > 0;
  }

  function toggleLevel(n) {
    var i = cfg.enabled.indexOf(n);
    if (i >= 0) cfg.enabled.splice(i, 1); else cfg.enabled.push(n);
    cfg.enabled.sort(function (a, b) { return a - b; });
    saveCfg();
    renderMenu();
  }

  screenOf('menu').addEventListener('click', function (e) {
    var row = e.target.closest('[data-level]');
    if (row) return toggleLevel(Number(row.dataset.level));

    var d = e.target.closest('[data-duration]');
    if (d) { cfg.duration = Number(d.dataset.duration); saveCfg(); return renderMenu(); }

    var s = e.target.closest('[data-enter]');
    if (s) { cfg.enter = s.dataset.enter === 'true'; saveCfg(); return renderMenu(); }

    var k = e.target.closest('[data-skinid]');
    if (k) { skin = PCP.applySkin(k.dataset.skinid); return renderMenu(); }

    if (e.target.closest('[data-pcp="menu-hint"]')) start();
  });

  /* ---- screens ------------------------------------------------------------ */

  function show(name) {
    ['menu', 'game', 'results', 'history'].forEach(function (s) {
      screenOf(s).hidden = s !== name;
    });
    if (name === 'menu') renderMenu();
    if (name === 'history') renderHistory();
    if (name === 'game') q('answer').focus();
  }

  /* Re-trigger a CSS animation that may already be on the element. */
  function replay(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  /* ---- game --------------------------------------------------------------- */

  function start() {
    if (!cfg.enabled.length) return;
    game = {
      solved: 0, streak: 0, best: 0, stats: {}, misses: [],
      endsAt: performance.now() + cfg.duration * 1000,
      problem: null, tStart: 0, fumbled: false
    };
    q('timebar').innerHTML = new Array(TIME_CELLS + 1).join('<i></i>');
    q('streak').innerHTML = new Array(STREAK_PIPS + 1).join('<i></i>');
    q('best').textContent = '0';
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
    q('answer').value = '';
    q('typed').textContent = '';
    renderProblem();
  }

  function renderProblem() {
    var p = game.problem;
    q('givens').innerHTML = p.givens.map(function (g) {
      return '<span class="given"><span class="sym">' + g.sym +
        '</span><span class="val">' + g.text + '</span></span>';
    }).join('');
    q('solve-label').textContent = p.label;

    var trades = q('trades');
    trades.dataset.empty = p.binary ? 'false' : 'true';
    trades.innerHTML = p.binary
      ? '<div><span class="key">J</span>' + p.binary.j + '</div>' +
        '<div><span class="key">K</span>' + p.binary.k + '</div>'
      : '<div>&nbsp;</div><div>&nbsp;</div>';

    replay(q('stage'), 'fresh');
  }

  function paintScore() { q('score').textContent = padScore(game.solved); }

  function paintStreak() {
    var pips = q('streak').children;
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
      q('best').textContent = game.best;
    }
    paintScore();
    paintStreak();
    replay(q('score'), 'hit');
    next();
  }

  /* Record a wrong attempt once per problem, so retrying cannot inflate it. */
  function fumble() {
    if (game.fumbled) return;
    game.fumbled = true;
    statFor(game.problem.level).missed++;
    game.misses.push(describe(game.problem));
    game.streak = 0;
    var pips = q('streak');
    pips.dataset.broke = 'true';
    setTimeout(function () { pips.removeAttribute('data-broke'); paintStreak(); }, 340);
  }

  function tryAnswer() {
    var p = game.problem;
    if (!p || p.binary) return;                    // shape B answers with J/K
    var v = parseCents(q('answer').value);
    if (v !== null && v === p.answer) advance();
  }

  function tryTrade(key) {
    var p = game.problem;
    if (!p || !p.binary) return;
    var v = parseCents(q('answer').value);
    if (v === null) return;          // no magnitude yet, so not yet an attempt

    if (v === p.answer && key === p.binary.correct) return advance();

    // Wrong. Hold the problem rather than moving on, so that advancing means
    // the same thing here as on the typed levels: you got it right.
    fumble();
  }

  q('answer').addEventListener('input', function () {
    var cleaned = this.value.replace(/[^0-9.]/g, '');
    if (cleaned !== this.value) this.value = cleaned;
    q('typed').textContent = cleaned;
    if (!cfg.enter) tryAnswer();
  });

  function tick() {
    var left = Math.max(0, game.endsAt - performance.now());
    var frac = left / (cfg.duration * 1000);

    var secs = Math.ceil(left / 1000);
    var text = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
    if (q('clock').textContent !== text) q('clock').textContent = text;

    var lit = Math.ceil(frac * TIME_CELLS);
    var cells = q('timebar').children;
    for (var i = 0; i < cells.length; i++) {
      if (i < lit) cells[i].dataset.on = 'true'; else cells[i].removeAttribute('data-on');
    }
    q('timebar').dataset.low = frac <= 0.2;

    if (left <= 0) finish();
  }

  function finish() {
    clearInterval(ticker);
    ticker = null;

    // Read the prior best before saving, or this run would beat itself.
    var priorBest = bestFor(loadHistory(), configKey(cfg.duration, cfg.enabled));

    var rec = {
      t: Date.now(), score: game.solved, dur: cfg.duration,
      levels: cfg.enabled.slice(), streak: game.best, stats: {}
    };
    Object.keys(game.stats).forEach(function (k) {
      var st = game.stats[k];
      rec.stats[k] = { s: st.solved, m: st.missed, ms: Math.round(st.ms) };
    });
    saveRun(rec);

    renderResults(priorBest);
    show('results');
  }

  /* ---- results ------------------------------------------------------------ */

  function renderResults(priorBest) {
    var attempts = 0, missed = 0;
    Object.keys(game.stats).forEach(function (k) {
      attempts += game.stats[k].solved + game.stats[k].missed;
      missed += game.stats[k].missed;
    });
    var acc = attempts ? Math.round((attempts - missed) / attempts * 100) : 100;
    var isNew = game.solved > priorBest;

    q('total').textContent = padScore(game.solved);
    q('rate').textContent = (game.solved / (cfg.duration / 60)).toFixed(1) + ' / min';

    var pb = q('pb');
    pb.textContent = isNew ? 'new best' : (priorBest ? 'best ' + priorBest : '');
    if (isNew) pb.dataset.new = 'true'; else pb.removeAttribute('data-new');

    q('finals').innerHTML = [
      ['score', padScore(game.solved)],
      ['rate', (game.solved / (cfg.duration / 60)).toFixed(1) + '/min'],
      ['best streak', String(game.best)],
      ['accuracy', acc + '%'],
      [isNew ? 'new best' : 'best', padScore(isNew ? game.solved : priorBest)]
    ].map(function (f) {
      return '<span class="final"><span class="k">' + f[0] + '</span><b>' + f[1] + '</b></span>';
    }).join('');

    var rows = PCP.LEVELS.filter(function (lv) { return game.stats[lv.n]; })
      .map(function (lv) {
        var st = game.stats[lv.n];
        var n = st.solved + st.missed;
        return '<div class="bd"><span class="n">' + lv.n + '</span>' +
          '<span class="name">' + lv.name + '</span>' +
          '<span class="v">' + st.solved + '</span>' +
          '<span class="v">' + (n ? (st.ms / n / 1000).toFixed(1) + 's' : '—') + '</span>' +
          '<span class="missed">' + (st.missed ? st.missed + ' missed' : '') + '</span></div>';
      });
    q('breakdown').innerHTML = rows.join('') || '<div class="empty">nothing solved</div>';

    q('misses').innerHTML = game.misses.length
      ? '<div class="cap" data-show="true">missed</div>' + game.misses.map(function (m) {
          return '<div class="miss">' + m.given + ' &nbsp;&rarr;&nbsp; <span class="was">' +
            m.answer + (m.trade ? ' · ' + m.trade : '') + '</span></div>';
        }).join('')
      : '';

    q('results-hint').textContent = '⏎ again · esc settings · h history';
  }

  /* ---- history ------------------------------------------------------------ */

  function renderHistory() {
    PCP.renderHistory({
      runs: loadHistory(), q: q, configKey: configKey,
      rateOf: rateOf, stamp: stamp, setCap: setCap
    });
  }

  screenOf('history').addEventListener('click', function (e) {
    if (e.target.closest('[data-pcp="history-hint"]')) show('menu');
  });

  /* ---- keyboard ------------------------------------------------------------ */

  document.addEventListener('keydown', function (e) {
    var on = !screenOf('menu').hidden ? 'menu'
           : !screenOf('game').hidden ? 'game'
           : !screenOf('history').hidden ? 'history'
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
          var v = parseCents(q('answer').value);
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
    if (screenOf('game').hidden) return;
    if (e.target !== q('answer')) { e.preventDefault(); q('answer').focus(); }
  });

  show('menu');
})();
