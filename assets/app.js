/* Morgue de Sunagakure — logique commune à toutes les pages.
   Si assets/firebase-config.js contient la configuration Firebase, les données sont partagées en direct
   entre tous les visiteurs. Sinon, elles restent dans le navigateur (localStorage). */
var firebaseConfig = window.FIREBASE_CONFIG || null;

(async function () {
  'use strict';

  var CAISSONS = 30;
  var LS = 'morgue-suna-v1';
  var GRADES = ['Inconnu', 'Genin', 'Chûnin', 'Jônin', 'Jônin spécial', 'ANBU', 'Kage', 'Médecin-nin', 'Civil'];
  var VILLAGES = ['Sunagakure', 'Konohagakure', 'Kirigakure', 'Kumogakure', 'Iwagakure', 'Amegakure', 'Otogakure', 'Village inconnu', 'Déserteur / sans village'];
  var CAUSES = ['Inconnue', 'Arme blanche', 'Technique de feu', 'Technique de foudre', 'Technique de vent', 'Poison', 'Épuisement de chakra', 'Noyade / asphyxie', 'Écrasement / chute', 'Trauma contondant', 'Maladie', 'Technique interdite'];
  var NATURES = ['Indéterminée', 'Au combat', 'Accidentelle', 'Homicide', 'Naturelle'];
  var RTYPES = ['Incident', 'Mission', 'Enquête', 'Transfert de corps', 'Interne'];

  var S = { admissions: [], autopsies: [], rapports: [] };
  var AM = new Map();
  var expanded = new Set(), armed = null, armT = 0, toastT = 0;
  var params = new URLSearchParams(location.search);
  var fb = null, ready = true, admApplied = false;

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };
  var todayISO = function () { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var fmt = function (iso) { if (!iso) return '—'; var p = String(iso).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso; };
  var byNew = function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); };
  var who = function (a) { return a ? (a.nom || 'Inconnu') + (a.prenom ? ' ' + a.prenom : '') : 'Dossier supprimé'; };
  var isPresent = function (a) { return a.statut !== 'libere'; };

  /* ---------- stockage ---------- */
  function load() {
    try {
      var j = JSON.parse(localStorage.getItem(LS) || 'null');
      if (j) Object.keys(S).forEach(function (c) { S[c] = Array.isArray(j[c]) ? j[c] : []; });
    } catch (e) {}
  }
  function save() {
    try { localStorage.setItem(LS, JSON.stringify(S)); return true; }
    catch (e) { toast('Enregistrement impossible : le navigateur bloque le stockage local.'); return false; }
  }
  function errMsg(e) {
    return e && e.code === 'permission-denied'
      ? "Écriture refusée par les règles Firebase (voir le README, étape 4)."
      : "Enregistrement impossible. Vérifie ta connexion et réessaie.";
  }
  async function put(c, rec) {
    if (fb) {
      try { await fb.setDoc(fb.doc(fb.db, c, rec.id), rec); return true; }
      catch (e) { toast(errMsg(e)); return false; }
    }
    var i = S[c].findIndex(function (x) { return x.id === rec.id; });
    if (i >= 0) S[c][i] = rec; else S[c].push(rec);
    var ok = save(); renderAll(); return ok;
  }
  async function del(c, id) {
    if (fb) {
      try { await fb.deleteDoc(fb.doc(fb.db, c, id)); return true; }
      catch (e) { toast(errMsg(e)); return false; }
    }
    S[c] = S[c].filter(function (x) { return x.id !== id; });
    save(); renderAll(); return true;
  }
  /* Crée une admission avec un numéro unique et, si demandé, réserve le caisson.
     En mode partagé, tout se fait dans une transaction : deux personnes ne peuvent pas obtenir
     le même numéro ni le même caisson. */
  async function createAdmission(rec, caisson) {
    if (!fb) {
      if (caisson && occupied().has(caisson)) { toast("Ce caisson vient d'être pris. Choisis-en un autre."); return false; }
      rec.numero = nextNum();
      return put('admissions', rec);
    }
    try {
      await fb.runTransaction(fb.db, async function (tx) {
        var counterRef = fb.doc(fb.db, 'meta', 'compteur');
        var cs = await tx.get(counterRef);
        var n = (cs.exists() ? cs.data().admissions : 0) + 1;
        var claimRef = null;
        if (caisson) {
          claimRef = fb.doc(fb.db, 'caissons', String(caisson));
          var cl = await tx.get(claimRef);
          if (cl.exists()) {
            var as = await tx.get(fb.doc(fb.db, 'admissions', cl.data().admissionId));
            if (as.exists() && as.data().statut !== 'libere') throw new Error('caisson-pris');
          }
        }
        rec.numero = 'ADM-' + String(n).padStart(4, '0');
        tx.set(counterRef, { admissions: n });
        tx.set(fb.doc(fb.db, 'admissions', rec.id), rec);
        if (claimRef) tx.set(claimRef, { admissionId: rec.id });
      });
      return true;
    } catch (e) {
      if (e && e.message === 'caisson-pris') toast("Ce caisson vient d'être pris. Choisis-en un autre.");
      else toast(errMsg(e));
      return false;
    }
  }
  function toast(msg) {
    var t = $('toast'); if (!t) return;
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 3200);
  }

  /* ---------- calculs ---------- */
  function occupied() {
    var m = new Map();
    S.admissions.forEach(function (a) { if (isPresent(a) && a.caisson) m.set(a.caisson, a); });
    return m;
  }
  function nextNum(offset) {
    var n = Math.max.apply(null, [0].concat(S.admissions.map(function (a) { return parseInt(String(a.numero || '').replace(/\D/g, ''), 10) || 0; })));
    return 'ADM-' + String(n + 1 + (offset || 0)).padStart(4, '0');
  }

  /* ---------- listes déroulantes ---------- */
  function setOpts(id, items) {
    var sel = $(id); if (!sel) return;
    var old = sel.value;
    sel.innerHTML = items.map(function (p) { return '<option value="' + esc(p[0]) + '">' + esc(p[1]) + '</option>'; }).join('');
    if (Array.prototype.some.call(sel.options, function (o) { return o.value === old; })) sel.value = old;
  }
  var plain = function (arr) { return arr.map(function (x) { return [x, x]; }); };
  function fillStatic() {
    setOpts('adm-grade', plain(GRADES));
    setOpts('adm-village', plain(VILLAGES));
    setOpts('adm-cause', plain(CAUSES));
    setOpts('aut-cause', plain(CAUSES));
    setOpts('aut-nature', plain(NATURES));
    setOpts('rap-type', plain(RTYPES));
    setOpts('fv', [['', 'Tous les villages']].concat(plain(VILLAGES)));
  }
  function refreshSelects() {
    var occ = occupied(), free = [['', 'Attribuer plus tard']];
    for (var i = 1; i <= CAISSONS; i++) if (!occ.has(i)) free.push([String(i), 'Caisson n° ' + pad(i)]);
    setOpts('adm-caisson', free);
    var done = new Set(S.autopsies.map(function (x) { return x.admissionId; }));
    var list = S.admissions.slice().sort(byNew);
    setOpts('aut-adm', [['', 'Choisir un dossier…']].concat(list.map(function (a) {
      return [a.id, a.numero + ' — ' + who(a) + (done.has(a.id) ? ' (autopsie faite)' : '')];
    })));
    setOpts('rap-adm', [['', 'Aucun']].concat(list.map(function (a) { return [a.id, a.numero + ' — ' + who(a)]; })));
  }
  function setDefaults() {
    ['adm-date', 'aut-date', 'rap-date'].forEach(function (id) { var el = $(id); if (el && !el.value) el.value = todayISO(); });
  }

  /* ---------- affichage ---------- */
  var kv = function (l, v) { return v ? '<div><dt>' + esc(l) + '</dt><dd>' + esc(v) + '</dd></div>' : ''; };
  var delBtn = function (action, id) {
    var k = action + id;
    return '<button type="button" class="btn-s danger' + (armed === k ? ' armed' : '') + '" data-action="' + action + '" data-id="' + id + '">' + (armed === k ? 'Confirmer ?' : 'Supprimer') + '</button>';
  };

  function renderDash() {
    var el = $('dash-out'); if (!el) return;
    if (!S.admissions.length && !S.autopsies.length && !S.rapports.length) {
      el.innerHTML = '<div class="empty">Le registre est vide. Enregistre une première admission pour commencer.' +
        '<div class="btn-row"><a class="btn" href="admission.html">Nouvelle admission</a>' +
        '<button class="btn-s" type="button" data-action="samples">Charger 3 exemples</button></div></div>';
      return;
    }
    var pres = S.admissions.filter(isPresent);
    var done = new Set(S.autopsies.map(function (x) { return x.admissionId; }));
    var todo = pres.filter(function (a) { return !done.has(a.id); }).sort(byNew);
    var open = S.rapports.filter(function (r) { return r.statut !== 'clos'; }).length;
    var free = CAISSONS - occupied().size;
    var recent = S.admissions.slice().sort(byNew).slice(0, 5);
    el.innerHTML =
      '<div class="stats">' +
      '<div class="stat"><b>' + pres.length + '</b><span>Corps présents</span></div>' +
      '<div class="stat' + (todo.length ? ' alert' : '') + '"><b>' + todo.length + '</b><span>À autopsier</span></div>' +
      '<div class="stat"><b>' + S.autopsies.length + '</b><span>Autopsies réalisées</span></div>' +
      '<div class="stat"><b>' + open + '</b><span>Rapports ouverts</span></div>' +
      '<div class="stat"><b>' + free + '<small style="font-size:1rem;color:var(--muted)"> / ' + CAISSONS + '</small></b><span>Caissons libres</span></div>' +
      '</div>' +
      '<div class="cols"><div><h3 class="sec-title">En attente d\'autopsie</h3>' +
      (todo.length ? '<ul class="rows">' + todo.slice(0, 6).map(function (a) {
        return '<li><div class="main"><div class="t">' + esc(who(a)) + '</div><div class="s">' + esc(a.numero) + ' · ' + esc(a.cause || 'Inconnue') + ' · ' + fmt(a.dateDeces) + '</div></div>' +
          '<a class="btn-s" href="autopsies.html?adm=' + a.id + '">Autopsie</a></li>';
      }).join('') + '</ul>' : '<div class="empty">Aucun corps en attente.</div>') +
      '</div><div><h3 class="sec-title">Dernières admissions</h3><ul class="rows">' +
      recent.map(function (a) {
        return '<li><div class="main"><div class="t">' + esc(who(a)) + '</div><div class="s">' + esc(a.numero) + ' · ' + esc(a.village || '') + ' · ' + (isPresent(a) ? (a.caisson ? 'Caisson ' + pad(a.caisson) : 'Sans caisson') : 'Libéré') + '</div></div>' +
          '<a class="btn-s" href="registre.html?open=' + a.id + '">Dossier</a></li>';
      }).join('') + '</ul></div></div>';
  }

  function renderRegistre() {
    var out = $('reg-out'); if (!out) return;
    var q = $('q').value.trim().toLowerCase(), vf = $('fv').value, sf = $('fs').value;
    var done = new Set(S.autopsies.map(function (x) { return x.admissionId; }));
    var list = S.admissions.slice().sort(byNew).filter(function (a) {
      if (vf && a.village !== vf) return false;
      if (sf === 'present' && !isPresent(a)) return false;
      if (sf === 'libere' && isPresent(a)) return false;
      if (q && [a.nom, a.prenom, a.numero, a.lieu, a.ramenePar, a.cause].join(' ').toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    $('reg-count').textContent = list.length + (list.length > 1 ? ' dossiers' : ' dossier');
    if (!list.length) {
      out.innerHTML = '<div class="empty">' + (S.admissions.length ? 'Aucun dossier ne correspond à cette recherche.' : 'Aucune admission enregistrée pour le moment.') + '</div>';
      return;
    }
    out.innerHTML = '<div class="tablewrap"><table><thead><tr><th>N°</th><th>Défunt</th><th>Grade</th><th>Village</th><th>Décès</th><th>Cause présumée</th><th>Caisson</th><th>Statut</th><th></th></tr></thead><tbody>' +
      list.map(function (a) {
        var open = expanded.has(a.id), pres = isPresent(a);
        var row = '<tr class="row" data-action="toggle" data-id="' + a.id + '">' +
          '<td class="num">' + esc(a.numero) + '</td>' +
          '<td><button class="linklike" type="button" data-action="toggle" data-id="' + a.id + '" aria-expanded="' + open + '">' + esc(who(a)) + '</button></td>' +
          '<td>' + esc(a.grade) + '</td><td>' + esc(a.village) + '</td><td class="num">' + fmt(a.dateDeces) + '</td><td>' + esc(a.cause) + '</td>' +
          '<td class="num">' + (pres && a.caisson ? pad(a.caisson) : '—') + '</td>' +
          '<td><span class="pill ' + (pres ? 'present' : 'libere') + '">' + (pres ? 'Présent' : 'Libéré') + '</span>' + (done.has(a.id) ? ' <span class="pill ok">Autopsie</span>' : '') + '</td>' +
          '<td><div style="display:flex;gap:6px;justify-content:flex-end">' +
          (done.has(a.id) ? '' : '<a class="btn-s" href="autopsies.html?adm=' + a.id + '">Autopsie</a>') +
          (pres ? '<button class="btn-s' + (armed === 'release' + a.id ? ' armed' : '') + '" type="button" data-action="release" data-id="' + a.id + '">' + (armed === 'release' + a.id ? 'Confirmer ?' : 'Libérer') + '</button>' : '') +
          delBtn('del-adm', a.id) + '</div></td></tr>';
        if (open) {
          row += '<tr class="detail"><td colspan="9"><dl class="kv">' +
            kv('Circonstances', a.circonstances) + kv('Lieu du décès', a.lieu) + kv('Ramené par', a.ramenePar) + kv('Notes', a.notes) +
            kv('Libéré le', a.dateLiberation ? fmt(a.dateLiberation) : '') + kv('Admis le', a.createdAt ? fmt(a.createdAt.slice(0, 10)) : '') +
            '</dl></td></tr>';
        }
        return row;
      }).join('') + '</tbody></table></div>';
  }

  function renderAut() {
    var out = $('aut-out'); if (!out) return;
    var list = S.autopsies.slice().sort(function (a, b) { return (b.dateAutopsie || '').localeCompare(a.dateAutopsie || '') || byNew(a, b); });
    out.innerHTML = list.length ? list.map(function (x) {
      var a = AM.get(x.admissionId);
      return '<article class="rec"><header><div><h3>' + esc(who(a)) + (a ? ' <span class="meta">· ' + esc(a.numero) + '</span>' : '') + '</h3>' +
        '<div class="meta">' + fmt(x.dateAutopsie) + (x.legiste ? ' · Dr ' + esc(x.legiste) : '') + '</div></div>' +
        (x.nature ? '<span class="pill nature">' + esc(x.nature) + '</span>' : '') + '</header>' +
        '<dl class="kv">' + kv('Cause confirmée', x.cause) + kv('Examen externe', x.externe) + kv('Examen interne', x.interne) + kv('Chakra et analyses', x.analyses) + kv('Conclusion', x.conclusion) + '</dl>' +
        '<footer>' + delBtn('del-aut', x.id) + '</footer></article>';
    }).join('') : '<div class="empty">Aucune autopsie enregistrée.</div>';
  }

  function renderRap() {
    var out = $('rap-out'); if (!out) return;
    var list = S.rapports.slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || '') || byNew(a, b); });
    out.innerHTML = list.length ? list.map(function (r) {
      var a = r.admissionId ? AM.get(r.admissionId) : null, clos = r.statut === 'clos';
      return '<article class="rec"><header><div><h3>' + esc(r.titre) + '</h3>' +
        '<div class="meta">' + esc(r.type) + ' · ' + fmt(r.date) + (r.auteur ? ' · ' + esc(r.auteur) : '') + (r.admissionId ? ' · ' + esc(who(a)) : '') + '</div></div>' +
        '<span class="pill ' + (clos ? 'clos' : 'ouvert') + '">' + (clos ? 'Clos' : 'Ouvert') + '</span></header>' +
        '<p>' + esc(r.contenu) + '</p>' +
        '<footer><button type="button" class="btn-s" data-action="rap-toggle" data-id="' + r.id + '">' + (clos ? 'Rouvrir' : 'Clore') + '</button>' + delBtn('del-rap', r.id) + '</footer></article>';
    }).join('') : '<div class="empty">Aucun rapport enregistré.</div>';
  }

  function renderBays() {
    var out = $('bay-out'); if (!out) return;
    var occ = occupied(), h = '';
    for (var i = 1; i <= CAISSONS; i++) {
      var a = occ.get(i);
      h += a ? '<a class="bay" href="registre.html?open=' + a.id + '"><span class="n">' + pad(i) + '</span><span class="who">' + esc(who(a)) + '</span><span class="sub">' + esc(a.village || '') + '</span></a>'
             : '<div class="bay"><span class="n">' + pad(i) + '</span><span class="who">Libre</span></div>';
    }
    out.innerHTML = h;
    $('bay-count').textContent = occ.size + ' occupés · ' + (CAISSONS - occ.size) + ' libres';
  }

  function renderAll() {
    if (!ready) {
      ['dash-out', 'reg-out', 'aut-out', 'rap-out', 'bay-out'].forEach(function (id) { var el = $(id); if (el) el.innerHTML = '<div class="empty">Ouverture du registre…</div>'; });
      return;
    }
    AM = new Map(S.admissions.map(function (a) { return [a.id, a]; }));
    refreshSelects();
    renderDash(); renderRegistre(); renderAut(); renderRap(); renderBays();
  }

  function arm(key) {
    armed = key; clearTimeout(armT);
    armT = setTimeout(function () { armed = null; renderAll(); }, 3500);
    renderAll();
  }

  /* ---------- exemples ---------- */
  async function loadSamples() {
    var t = todayISO();
    var A = [
      { nom: 'Hanabe', prenom: 'Rakuto', grade: 'Chûnin', village: 'Sunagakure', cause: 'Arme blanche', circonstances: "Embuscade lors d'une patrouille à la frontière.", lieu: 'Désert ouest, dunes de la frontière', ramenePar: 'Équipe de patrouille 4', caisson: 3 },
      { nom: 'Inconnu', prenom: '', grade: 'Inconnu', village: 'Village inconnu', cause: 'Inconnue', circonstances: 'Corps retrouvé sans plaque ni équipement.', lieu: 'Oasis nord', ramenePar: 'Marchand de passage', caisson: null },
      { nom: 'Tsuchida', prenom: 'Mirei', grade: 'Genin', village: 'Sunagakure', cause: 'Épuisement de chakra', circonstances: "Effondrement à la fin d'un exercice.", lieu: "Terrain d'entraînement", ramenePar: 'Instructeur', caisson: 7 }
    ];
    var first = null;
    for (var i = 0; i < A.length; i++) {
      var rec = Object.assign({ id: uid(), dateDeces: t, notes: 'Exemple de démonstration, à supprimer.', statut: 'present', createdAt: new Date(Date.now() + i).toISOString() }, A[i]);
      if (!first) first = rec;
      if (!(await createAdmission(rec, rec.caisson))) return;
    }
    await put('autopsies', { id: uid(), admissionId: first.id, dateAutopsie: t, legiste: 'Exemple', cause: 'Arme blanche', nature: 'Au combat', externe: 'Plaie profonde au flanc gauche.', interne: 'Perforation du poumon gauche.', analyses: 'Aucune trace de poison.', conclusion: 'Mort par hémorragie interne.', createdAt: new Date().toISOString() });
    toast('Exemples chargés.');
  }

  /* ---------- événements ---------- */
  document.addEventListener('click', function (e) {
    if (e.target.closest('a')) return;
    var t = e.target.closest('[data-action]');
    if (!t) return;
    var act = t.dataset.action, id = t.dataset.id, a = id ? AM.get(id) : null;
    switch (act) {
      case 'toggle': if (expanded.has(id)) expanded.delete(id); else expanded.add(id); renderRegistre(); break;
      case 'release':
        if (armed !== 'release' + id) return arm('release' + id);
        armed = null;
        if (a) put('admissions', Object.assign({}, a, { statut: 'libere', dateLiberation: todayISO() })).then(function (ok) { if (ok) toast('Corps libéré, caisson disponible.'); });
        break;
      case 'del-adm': case 'del-aut': case 'del-rap':
        if (armed !== act + id) return arm(act + id);
        armed = null;
        del(act === 'del-adm' ? 'admissions' : act === 'del-aut' ? 'autopsies' : 'rapports', id).then(function (ok) { if (ok) toast('Supprimé.'); });
        break;
      case 'rap-toggle':
        var r = S.rapports.find(function (x) { return x.id === id; });
        if (r) put('rapports', Object.assign({}, r, { statut: r.statut === 'clos' ? 'ouvert' : 'clos' }));
        break;
      case 'samples': loadSamples(); break;
    }
  });

  ['q', 'fv', 'fs'].forEach(function (id) { var el = $(id); if (el) el.addEventListener('input', renderRegistre); });

  function onSubmit(formId, handler) {
    var f = $(formId); if (!f) return;
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      handler(f, function (n) { return f.elements[n].value.trim(); });
    });
  }
  function afterSave(f) { f.reset(); setDefaults(); refreshSelects(); }

  onSubmit('f-adm', async function (f, v) {
    var cais = v('caisson');
    if (cais && occupied().has(+cais)) { toast("Ce caisson vient d'être pris. Choisis-en un autre."); refreshSelects(); return; }
    var rec = { id: uid(), nom: v('nom') || 'Inconnu', prenom: v('prenom'), grade: v('grade'), village: v('village'), dateDeces: v('dateDeces'), cause: v('cause'), circonstances: v('circonstances'), lieu: v('lieu'), ramenePar: v('ramenePar'), caisson: cais ? +cais : null, notes: v('notes'), statut: 'present', createdAt: new Date().toISOString() };
    if (await createAdmission(rec, rec.caisson)) { toast('Admission ' + rec.numero + ' enregistrée.'); afterSave(f); }
  });

  onSubmit('f-aut', async function (f, v) {
    if (!AM.has(v('admissionId'))) { toast('Choisis un défunt dans la liste.'); return; }
    var rec = { id: uid(), admissionId: v('admissionId'), dateAutopsie: v('dateAutopsie'), legiste: v('legiste'), cause: v('cause'), nature: v('nature'), externe: v('externe'), interne: v('interne'), analyses: v('analyses'), conclusion: v('conclusion'), createdAt: new Date().toISOString() };
    if (await put('autopsies', rec)) { toast('Autopsie enregistrée.'); afterSave(f); }
  });

  onSubmit('f-rap', async function (f, v) {
    var rec = { id: uid(), type: v('type'), date: v('date'), titre: v('titre'), auteur: v('auteur'), admissionId: v('admissionId'), contenu: v('contenu'), statut: 'ouvert', createdAt: new Date().toISOString() };
    if (await put('rapports', rec)) { toast('Rapport enregistré.'); afterSave(f); }
  });

  /* ---------- démarrage ---------- */
  function setMode() {
    var m = $('mode'), f = $('foot'); if (!m || !f) return;
    if (fb) {
      m.textContent = 'Registre partagé en direct';
      f.textContent = 'Les dossiers sont enregistrés en ligne : toutes les personnes qui ouvrent ce site voient les mêmes données, en direct.';
    } else {
      m.textContent = 'Données sur cet appareil';
      f.textContent = 'Mode local : les dossiers restent dans ce navigateur. Pour les partager entre tous, configure Firebase (voir le README).';
    }
  }
  function applyAdmParam() {
    var v = params.get('adm');
    if (!admApplied && v && $('aut-adm') && AM.has(v)) { $('aut-adm').value = v; admApplied = true; }
  }
  async function connect() {
    var V = '10.12.2', base = 'https://www.gstatic.com/firebasejs/' + V + '/';
    var appM = await import(base + 'firebase-app.js');
    var fsM = await import(base + 'firebase-firestore.js');
    return Object.assign({ db: fsM.getFirestore(appM.initializeApp(firebaseConfig)) }, fsM);
  }

  fillStatic();
  setDefaults();
  if (params.get('open')) expanded.add(params.get('open'));

  if (firebaseConfig && firebaseConfig.projectId) {
    try { fb = await connect(); }
    catch (e) { fb = null; toast('Registre partagé injoignable : le site passe en mode local.'); }
  }
  setMode();

  if (!fb) {
    load(); renderAll(); applyAdmParam();
    // Si une autre page ou un autre onglet modifie le registre, on se met à jour.
    window.addEventListener('storage', function (e) { if (e.key === LS) { load(); renderAll(); } });
    return;
  }

  ready = false; renderAll();
  var waiting = 3;
  Object.keys(S).forEach(function (c) {
    var first = true;
    var arrived = function () { if (first) { first = false; if (--waiting === 0) ready = true; } };
    fb.onSnapshot(fb.collection(fb.db, c), function (snap) {
      S[c] = snap.docs.map(function (d) { return Object.assign({}, d.data(), { id: d.id }); });
      arrived();
      if (ready) { renderAll(); applyAdmParam(); }
    }, function () {
      toast('Lecture du registre impossible. Vérifie les règles Firebase (README, étape 4).');
      arrived(); if (ready) renderAll();
    });
  });
})();
