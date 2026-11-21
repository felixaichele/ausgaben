/* Ausgaben – gemeinsame Logik für Eingabe und Dashboard.
 * Daten liegen lokal (localStorage). Optional: Abgleich mit einer JSON-Datei
 * in einem PRIVATEN GitHub-Repository (siehe README).
 */
(function () {
  'use strict';

  const KEY = 'ausgaben.v1';
  const SKEY = 'ausgaben.settings.v1';

  const CATS = [
    { id: 'kochen',    name: 'Kochen',         short: 'Kochen',   color: 'var(--series-1)', rl: false },
    { id: 'essen',     name: 'Essen bestellt', short: 'Bestellt', color: 'var(--series-2)', rl: false },
    { id: 'bibi',      name: 'BIBI',           short: 'BIBI',     color: 'var(--series-3)', rl: true  },
    { id: 'sonstiges', name: 'Sonstiges',      short: 'Sonstiges',color: 'var(--series-4)', rl: true  },
    { id: 'einnahme',  name: 'Einnahme',       short: 'Einnahme', color: 'var(--income)',   rl: false, income: true },
  ];
  const CAT = Object.fromEntries(CATS.map(c => [c.id, c]));
  const EXPENSE_CATS = CATS.filter(c => !c.income);

  // Vorgaben aus deiner Excel-Monatsvorlage (Zeile 57–61), in den Einstellungen änderbar.
  const DEFAULT_SETTINGS = {
    grundkosten: 1141.86,
    budgets: { kochen: 250, essen: 150, bibi: 150, sonstiges: 600 },
    essenProTag: 11,
    einnahmenZiel: 2250,
    decimalComma: true,
    sync: { owner: '', repo: '', branch: 'main', path: 'ausgaben.json', token: '' },
    lastExport: {},   // { 'YYYY-MM': ISO-Zeit }
  };

  /* ---------- Hilfen ---------- */
  const pad = n => String(n).padStart(2, '0');
  const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const monthOf = iso => iso.slice(0, 7);
  const MONTHS = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  const monthLabel = ym => { const [y, m] = ym.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };
  const daysInMonth = ym => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };
  const fmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
  const fmt0 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const eur = v => fmt.format(v || 0);
  const eur0 = v => fmt0.format(v || 0);
  const parseAmount = s => {
    if (typeof s === 'number') return s;
    s = String(s || '').trim().replace(/\s|€/g, '');
    if (!s) return NaN;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    return Math.round(parseFloat(s) * 100) / 100;
  };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'style') n.setAttribute('style', v);
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null) n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return n;
  };

  /* ---------- Speicher ---------- */
  function loadRaw() {
    try { return JSON.parse(localStorage.getItem(KEY)) || { entries: [] }; }
    catch { return { entries: [] }; }
  }
  let db = loadRaw();
  function saveLocal() { localStorage.setItem(KEY, JSON.stringify(db)); }

  function loadSettings() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(SKEY)) || {}; } catch {}
    return {
      ...DEFAULT_SETTINGS, ...s,
      budgets: { ...DEFAULT_SETTINGS.budgets, ...(s.budgets || {}) },
      sync: { ...DEFAULT_SETTINGS.sync, ...(s.sync || {}) },
      lastExport: { ...(s.lastExport || {}) },
    };
  }
  let settings = loadSettings();
  function saveSettings(patch) {
    settings = { ...settings, ...patch };
    localStorage.setItem(SKEY, JSON.stringify(settings));
  }

  const listeners = new Set();
  const emit = () => listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });

  const live = () => db.entries.filter(e => !e.deleted);
  const entriesOf = ym => live().filter(e => monthOf(e.date) === ym)
    .sort((a, b) => (b.date.localeCompare(a.date)) || (b.createdAt || 0) - (a.createdAt || 0));
  const months = () => {
    const set = new Set(live().map(e => monthOf(e.date)));
    set.add(monthOf(todayISO()));
    return [...set].sort().reverse();
  };

  function upsert(entry) {
    const now = Date.now();
    const i = db.entries.findIndex(e => e.id === entry.id);
    if (i >= 0) db.entries[i] = { ...db.entries[i], ...entry, updatedAt: now };
    else db.entries.push({ id: uid(), createdAt: now, ...entry, updatedAt: now });
    saveLocal(); emit(); Sync.schedule();
  }
  function remove(id) {
    const e = db.entries.find(x => x.id === id);
    if (!e) return;
    e.deleted = true; e.updatedAt = Date.now();
    saveLocal(); emit(); Sync.schedule();
  }
  function clearMonth(ym) {
    const now = Date.now();
    db.entries.forEach(e => { if (!e.deleted && monthOf(e.date) === ym) { e.deleted = true; e.updatedAt = now; } });
    saveLocal(); emit(); Sync.schedule();
  }
  function purgeTombstones() {
    const cutoff = Date.now() - 90 * 864e5;
    db.entries = db.entries.filter(e => !(e.deleted && e.updatedAt < cutoff));
  }

  function merge(remote) {
    const map = new Map(db.entries.map(e => [e.id, e]));
    for (const r of (remote && remote.entries) || []) {
      const l = map.get(r.id);
      if (!l || (r.updatedAt || 0) > (l.updatedAt || 0)) map.set(r.id, r);
    }
    db.entries = [...map.values()];
    purgeTombstones();
    saveLocal();
  }

  /* ---------- Kennzahlen eines Monats ---------- */
  function summary(ym) {
    const list = entriesOf(ym);
    const by = Object.fromEntries(CATS.map(c => [c.id, { real: 0, ohneRL: 0, n: 0 }]));
    for (const e of list) {
      const b = by[e.cat]; if (!b) continue;
      b.real += e.amount; b.n++;
      if (!e.rl) b.ohneRL += e.amount;
    }
    const variabelReal = EXPENSE_CATS.reduce((s, c) => s + by[c.id].real, 0);
    const variabelOhneRL = EXPENSE_CATS.reduce((s, c) => s + by[c.id].ohneRL, 0);
    const einnahmen = by.einnahme.real;
    const essen = by.kochen.real + by.essen.real;
    const days = daysInMonth(ym);
    const isCurrent = ym === monthOf(todayISO());
    const dayNow = isCurrent ? new Date().getDate() : days;
    // wie Excel: Ausgaben = Grundkosten + alles ohne Rücklagen-Käufe; Real = inkl. Rücklagen
    const ausgaben = settings.grundkosten + variabelOhneRL;
    const real = settings.grundkosten + variabelReal;
    return {
      list, by, variabelReal, variabelOhneRL, einnahmen, essen, days, dayNow, isCurrent,
      ausgaben, real, ergebnis: einnahmen - ausgaben,
      essenProTag: essen / dayNow,
    };
  }

  /* ---------- Export für Excel ---------- */
  // Spaltenblock C..N deiner Monatsblätter, einfügen ab Zelle C2 (Zeilen 2–54).
  function excelBlock(ym) {
    const list = entriesOf(ym).slice().sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0));
    const col = id => list.filter(e => e.cat === id);
    const num = v => {
      if (v === '' || v == null) return '';
      const s = (Math.round(v * 100) / 100).toString();
      return settings.decimalComma ? s.replace('.', ',') : s;
    };
    const clean = s => String(s || '').replace(/[\t\r\n]+/g, ' ').trim();
    const k = col('kochen'), es = col('essen'), bi = col('bibi'), so = col('sonstiges'), ei = col('einnahme');
    const rows = Math.max(k.length, es.length, bi.length, so.length, ei.length);
    const lines = [];
    for (let i = 0; i < rows; i++) {
      const c = [];
      const a = k[i];  c.push(a ? clean(a.label || 'Kochen') : '', a ? num(a.amount) : '');
      const b = es[i]; c.push(b ? clean(b.label || 'Essen') : '', b ? num(b.amount) : '');
      const d = bi[i]; c.push(d ? clean(d.label || 'BIBI') : '', d ? num(d.amount) : '', d ? (d.rl ? '' : num(d.amount)) : '');
      const f = so[i]; c.push(f ? clean(f.label || 'Sonstiges') : '', f ? num(f.amount) : '', f ? (f.rl ? '' : num(f.amount)) : '');
      const g = ei[i]; c.push(g ? clean(g.label || 'Einnahme') : '', g ? num(g.amount) : '');
      lines.push(c.join('\t'));
    }
    return { text: lines.join('\r\n'), rows, overflow: rows > 53 };
  }

  function csv(ym) {
    const list = entriesOf(ym).slice().sort((a, b) => a.date.localeCompare(b.date));
    const q = s => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const n = v => settings.decimalComma ? String(v).replace('.', ',') : String(v);
    const head = ['Datum', 'Kategorie', 'Notiz', 'Betrag', 'Aus Rücklage'];
    const rows = list.map(e => [e.date, CAT[e.cat]?.name || e.cat, e.label || '', n(e.amount), e.rl ? 'ja' : ''].map(q).join(';'));
    return '﻿' + [head.map(q).join(';'), ...rows].join('\r\n');
  }

  function download(name, text, type = 'text/csv;charset=utf-8') {
    const blob = new Blob([text], { type });
    const a = el('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch {
      const ta = el('textarea', { style: 'position:fixed;opacity:0' }); ta.value = text;
      document.body.append(ta); ta.select();
      const ok = document.execCommand('copy'); ta.remove(); return ok;
    }
  }

  function markExported(ym) { saveSettings({ lastExport: { ...settings.lastExport, [ym]: new Date().toISOString() } }); }

  /* ---------- Abgleich mit privatem GitHub-Repo (optional) ---------- */
  const Sync = (() => {
    let timer = null, state = 'off', msg = 'Nur auf diesem Gerät';
    const subs = new Set();
    const set = (s, m) => { state = s; msg = m; subs.forEach(f => f(state, msg)); };
    const cfg = () => settings.sync;
    const enabled = () => !!(cfg().owner && cfg().repo && cfg().token && cfg().path);
    const api = p => `https://api.github.com/repos/${encodeURIComponent(cfg().owner)}/${encodeURIComponent(cfg().repo)}/contents/${p.split('/').map(encodeURIComponent).join('/')}`;
    const headers = () => ({ Authorization: `Bearer ${cfg().token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' });
    const b64enc = str => { const bytes = new TextEncoder().encode(str); let bin = ''; bytes.forEach(b => bin += String.fromCharCode(b)); return btoa(bin); };
    const b64dec = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, '')), c => c.charCodeAt(0)));

    async function getFile(path) {
      const r = await fetch(api(path) + `?ref=${encodeURIComponent(cfg().branch || 'main')}&t=${Date.now()}`, { headers: headers(), cache: 'no-store' });
      if (r.status === 404) return { sha: null, text: null };
      if (!r.ok) throw new Error(`GitHub ${r.status}`);
      const j = await r.json();
      return { sha: j.sha, text: b64dec(j.content || '') };
    }
    async function putFile(path, text, sha, message) {
      const body = { message, content: b64enc(text), branch: cfg().branch || 'main' };
      if (sha) body.sha = sha;
      const r = await fetch(api(path), { method: 'PUT', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (r.status === 409 || r.status === 422) { const e = new Error('conflict'); e.conflict = true; throw e; }
      if (!r.ok) throw new Error(`GitHub ${r.status}`);
      return r.json();
    }

    async function run(push = true) {
      if (!enabled()) { set('off', 'Nur auf diesem Gerät'); return; }
      if (!navigator.onLine) { set('err', 'Offline – wird später abgeglichen'); return; }
      set('busy', 'Gleiche ab …');
      try {
        for (let attempt = 0; attempt < 3; attempt++) {
          const { sha, text } = await getFile(cfg().path);
          const before = JSON.stringify(db.entries.map(e => [e.id, e.updatedAt]).sort());
          if (text) merge(JSON.parse(text));
          const after = JSON.stringify(db.entries.map(e => [e.id, e.updatedAt]).sort());
          if (before !== after) emit();
          const out = JSON.stringify({ version: 1, entries: db.entries }, null, 1);
          if (!push || (text && out === text)) break;
          try { await putFile(cfg().path, out, sha, `Ausgaben ${new Date().toLocaleString('de-DE')}`); break; }
          catch (e) { if (!e.conflict || attempt === 2) throw e; }
        }
        set('ok', 'Synchronisiert ' + new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }));
      } catch (e) {
        console.error(e);
        set('err', e.message.includes('401') ? 'Token ungültig' : e.message.includes('404') ? 'Repo nicht gefunden' : 'Abgleich fehlgeschlagen');
      }
    }
    async function archive(ym) {
      if (!enabled()) return false;
      const path = `archiv/${ym}.csv`;
      const { sha } = await getFile(path);
      await putFile(path, csv(ym), sha, `Monatsabschluss ${monthLabel(ym)}`);
      return true;
    }
    return {
      enabled, archive,
      schedule() { clearTimeout(timer); if (enabled()) timer = setTimeout(() => run(true), 1200); },
      now: () => run(true),
      pull: () => run(true),
      onChange(fn) { subs.add(fn); fn(state, msg); },
    };
  })();

  /* ---------- UI-Gemeinsames ---------- */
  function toast(text) {
    let t = document.querySelector('.toast');
    if (!t) { t = el('div', { class: 'toast', role: 'status' }); document.body.append(t); }
    t.textContent = text; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2200);
  }

  function mountSyncBadge(node) {
    Sync.onChange((state, msg) => {
      node.className = 'sync-badge ' + ({ ok: 'ok', err: 'err', busy: 'busy' }[state] || '');
      node.replaceChildren(el('span', { class: 'dot' }), el('span', {}, msg));
    });
  }

  window.addEventListener('online', () => Sync.now());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') Sync.pull(); });
  window.addEventListener('storage', ev => { if (ev.key === KEY) { db = loadRaw(); emit(); } if (ev.key === SKEY) { settings = loadSettings(); emit(); } });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  window.App = {
    CATS, CAT, EXPENSE_CATS, pad, todayISO, monthOf, monthLabel, daysInMonth, eur, eur0, parseAmount, el,
    get settings() { return settings; }, saveSettings,
    entriesOf, months, upsert, remove, clearMonth, summary,
    excelBlock, csv, download, copyText, markExported,
    labelsFor: cat => {
      const count = new Map();
      live().filter(e => e.cat === cat && e.label).forEach(e => count.set(e.label, (count.get(e.label) || 0) + 1));
      return [...count.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]).slice(0, 30);
    },
    importBackup: data => {
      const before = live().length;
      merge(data && data.entries ? data : { entries: [] });
      emit();
      return live().length - before;
    },
    onChange: fn => listeners.add(fn),
    Sync, toast, mountSyncBadge,
  };
  Sync.pull();
  // Browser bitten, die Daten dauerhaft zu behalten (nicht automatisch löschen)
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
})();
