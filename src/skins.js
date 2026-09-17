/* Skin registry.
   A skin is one CSS file plus the one-line registration below. It never adds
   or removes DOM; it styles the shared structure in index.html and hides what
   it does not want. See AGENTS.md for the full contract. */
(function (root) {
  'use strict';

  var PCP = root.PCP = root.PCP || {};
  var list = [];
  var STORE = 'pcp.skin';

  function find(id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /* Register a skin. id and css are required; everything else is optional. */
  PCP.skin = function (def) {
    if (!def || !def.id || !def.css || find(def.id)) return;
    list.push({
      id: def.id,
      name: def.name || def.id,
      css: def.css,
      // Zero-pad the score to this width, e.g. 4 gives "0012". 0 leaves it bare.
      scorePad: def.scorePad || 0
    });
  };

  PCP.skins = function () { return list.slice(); };

  PCP.currentSkin = function () {
    var id = null;
    try { id = localStorage.getItem(STORE); } catch (e) { /* storage blocked */ }
    return find(id) || list[0] || null;
  };

  PCP.applySkin = function (id) {
    var s = find(id) || list[0];
    if (!s) return null;
    document.getElementById('skin-css').setAttribute('href', s.css);
    document.getElementById('app').setAttribute('data-skin', s.id);
    try { localStorage.setItem(STORE, s.id); } catch (e) { /* storage blocked */ }
    return s;
  };
})(window);
