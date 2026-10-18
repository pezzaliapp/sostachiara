'use strict';
/* Sosta Chiara — app di consultazione e promemoria per la sosta. Nessun pagamento, nessun server. */

const LEGAL_VERSION = 1;               // aumentalo se cambi le note legali: gli utenti dovranno riaccettarle
const $ = id => document.getElementById(id);
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

let DATA = null, BUILD = null;
let city = store.get('city') || 'parma';
let active = store.get('active');
let current = null, warned = false, audio = null, map = null, layer = null, meMarker = null, myPos = null;
let timers = [];

/* ---------- regole orarie ---------- */
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4,
    f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
    i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
    mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, mo - 1, da);
}
function isHoliday(d, c) {
  const md = (d.getMonth() + 1) + '-' + d.getDate();
  const fixed = ['1-1', '1-6', '4-25', '5-1', '6-2', '8-15', '11-1', '12-8', '12-25', '12-26', ...(DATA.cities[c].holidays || [])];
  if (fixed.includes(md)) return true;
  const em = easter(d.getFullYear()); em.setDate(em.getDate() + 1);
  return em.toDateString() === d.toDateString();
}
const toMin = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const slotsOf = z => z.slots || (z.from ? [[z.from, z.to]] : null);
function dayOk(z, c, now) {
  const days = z.allDays ? 'tutti' : (z.days || 'lun-sab');
  if (days === 'tutti') return true;
  // es. Arezzo: si paga anche la prima domenica del mese (Fiera Antiquaria)
  if (now.getDay() === 0 && now.getDate() <= 7 && DATA.cities[c].firstSundayPaid && days === 'lun-sab') return true;
  if (isHoliday(now, c) || now.getDay() === 0) return false;
  if (days === 'lun-ven' && now.getDay() === 6) return false;
  return true;
}
function status(z, c, now = new Date()) {
  const sl = slotsOf(z);
  if (!sl) return { cls: 'p-unk', dot: 'unk', txt: 'Da verificare' };
  const m = now.getHours() * 60 + now.getMinutes();
  const paying = dayOk(z, c, now) && sl.some(([a, b]) => { const s = toMin(a), e = toMin(b); return s <= e ? (m >= s && m < e) : (m >= s || m < e); });
  return paying ? { cls: 'p-pay', dot: '', txt: 'A pagamento ora' } : { cls: 'p-free', dot: 'free', txt: 'Gratis ora*' };
}

/* ---------- formattazione ---------- */
const eur = n => '€ ' + n.toFixed(2).replace('.', ',');
const hm = min => { const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`; };
const maxTxt = z => z.max ? hm(z.max) : 'nessun limite';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dayTxt = z => z.allDays || z.days === 'tutti' ? 'tutti i giorni' : (z.days === 'lun-ven' ? 'lun-ven' : 'feriali');
function hours(z, long = false) {
  const sl = slotsOf(z);
  if (!sl) return long ? 'Da verificare sul cartello' : 'orari sul cartello';
  const t = sl.map(([a, b]) => (a === '00:00' && b === '24:00') ? '24 ore' : `${a.replace(':', '.')}–${b.replace(':', '.')}`).join(' e ');
  return long ? `${t}, ${dayTxt(z)}${z.allDays || z.days === 'tutti' ? '' : ' (festivi esclusi)'}` : `${t} ${dayTxt(z)}`;
}
function dist(a, b) {
  const R = 6371e3, r = x => x * Math.PI / 180, dLat = r(b[0] - a[0]), dLon = r(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
const distTxt = m => m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;

function allZones(c) { return DATA.cities[c].groups.flatMap(g => g.items); }
function findZone(id) { for (const c in DATA.cities) for (const z of allZones(c)) if (z.id === id) return [z, c]; return [null, null]; }

/* ---------- elenco ---------- */
function renderCityPicker() {
  const sel = $('city');
  sel.innerHTML = Object.entries(DATA.cities).sort((a, b) => a[1].label.localeCompare(b[1].label, 'it'))
    .map(([k, v]) => { const zs = v.groups.flatMap(g => g.items); const unv = zs.filter(z => z.verify).length;
      return `<option value="${k}">${esc(v.label)}${unv === zs.length ? ' (dati da verificare)' : ''}</option>`; }).join('');
  sel.value = city;
}
function renderList() {
  const d = DATA.cities[city], q = $('q').value.trim().toLowerCase();
  $('city').value = city;
  const notes = [d.note, d.operator ? `Gestore: ${d.operator}.` : null, d.apps?.length ? `App per pagare accettate: ${d.apps.join(', ')}.` : null].filter(Boolean);
  $('cityNote').hidden = !d.note; $('cityNote').textContent = d.note || '';
  $('src').innerHTML = `Fonte dati ${esc(d.label)}: <a href="${esc(d.source.url)}" target="_blank" rel="noopener">${esc(d.source.name)}</a> (agg. ${esc(d.source.updated)}).` +
    (notes.length > (d.note ? 1 : 0) ? ' ' + esc(notes.filter(n => n !== d.note).join(' ')) : '');

  let groups = d.groups.map(g => ({ kind: g.kind, items: g.items.filter(z => !q || z.name.toLowerCase().includes(q) || (z.q || '').toLowerCase().includes(q)) }));
  if (myPos) {
    const near = allZones(city).filter(z => z.pos && (!q || z.name.toLowerCase().includes(q)))
      .map(z => ({ ...z, _d: dist(myPos, z.pos) })).sort((a, b) => a._d - b._d).slice(0, 5);
    if (near.length && near[0]._d < 20000) groups = [{ kind: 'Più vicine a te', items: near }, ...groups];
  }
  $('list').innerHTML = groups.map(g => !g.items.length ? '' :
    `<p class="kind">${esc(g.kind)}</p><ul class="zones">${g.items.map(z => {
      const s = status(z, city);
      return `<li><button class="zbtn" data-id="${z.id}"><span class="zname">${esc(z.name)}${z.verify && slotsOf(z) ? ' <span class="pill p-unk">da verificare</span>' : ''}</span><span class="pill ${s.cls}">${s.txt}</span>
      <span class="zmeta"><span>${hours(z)}</span><span>${z.rate != null ? eur(z.rate) + '/ora' : 'tariffa sul cartello'}</span><span>max ${maxTxt(z)}</span>${z._d != null ? `<span>a ${distTxt(z._d)}</span>` : ''}</span></button></li>`;
    }).join('')}</ul>`).join('') || '<div class="empty">Nessuna zona trovata con questa ricerca.</div>';
}

/* ---------- mappa ---------- */
function initMap() {
  if (!window.L) { $('map').innerHTML = '<div class="empty" style="margin:12px">Mappa non disponibile.</div>'; return; }
  map = L.map('map', { zoomControl: true, attributionControl: true });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  layer = L.layerGroup().addTo(map);
}
function renderMap(fit = true) {
  if (!map) return;
  layer.clearLayers();
  const d = DATA.cities[city];
  for (const z of allZones(city)) {
    if (!z.pos) continue;
    const s = status(z, city);
    const icon = L.divIcon({ className: '', html: `<div class="dot ${s.dot}">P</div>`, iconSize: [22, 22], iconAnchor: [11, 11] });
    L.marker(z.pos, { icon, title: z.name, keyboard: true }).addTo(layer).on('click', () => openSheet(z.id));
  }
  if (fit) map.setView(d.center, d.zoom || 14);
}
function setCity(c, fit = true) { if (!DATA.cities[c]) return; city = c; store.set('city', c); renderList(); renderMap(fit); }

function locate() {
  if (!navigator.geolocation) { showNotice('Il tuo dispositivo non fornisce la posizione.'); return; }
  $('near').textContent = 'Cerco…';
  navigator.geolocation.getCurrentPosition(p => {
    myPos = [p.coords.latitude, p.coords.longitude];
    $('near').textContent = 'Vicino a me';
    const [nearest, dmin] = Object.entries(DATA.cities).map(([k, v]) => [k, dist(myPos, v.center)]).sort((a, b) => a[1] - b[1])[0];
    if (dmin < 30000 && nearest !== city) setCity(nearest, false);
    if (dmin >= 30000) showNotice('Non sei vicino a nessuna delle città coperte dall\'app.');
    if (map) {
      if (meMarker) meMarker.remove();
      meMarker = L.marker(myPos, { icon: L.divIcon({ className: '', html: '<div class="me"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }) }).addTo(map);
      if (dmin < 30000) map.setView(myPos, 16);
    }
    renderList();
  }, () => { $('near').textContent = 'Vicino a me'; showNotice('Posizione non disponibile: controlla i permessi di localizzazione.'); },
  { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
}
function showNotice(t) { const n = $('cityNote'); n.hidden = false; n.textContent = t; setTimeout(renderList, 6000); }

/* ---------- navigazione ----------
   Semplici link alle app di mappe già presenti sul telefono: nessuna API, nessuna chiave, nessun costo.
   iPhone/iPad/Mac → Mappe di Apple; Android e computer → Google Maps (app o sito). */
const isApple = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
function navLink(z, c) {
  const dest = z.pos ? `${z.pos[0]},${z.pos[1]}` : `${z.q || z.name}, ${DATA.cities[c].label}`;
  return isApple
    ? `https://maps.apple.com/?daddr=${encodeURIComponent(dest)}&dirflg=d`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=driving`;
}
function showOnMap() {
  if (!current?.pos || !map) return;
  closeSheet();
  map.setView(current.pos, 17);
  $('map').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* ---------- scheda zona ---------- */
function openSheet(id) {
  const [z, c] = findZone(id); current = z; const s = status(z, c);
  $('sTitle').textContent = z.name;
  $('sFacts').innerHTML = `<dt>Città</dt><dd>${esc(DATA.cities[c].label)}</dd><dt>Stato</dt><dd>${s.txt}</dd><dt>Orario</dt><dd>${hours(z, true)}</dd><dt>Tariffa</dt><dd>${esc(z.tiers || 'sul cartello')}</dd><dt>Durata max</dt><dd>${maxTxt(z)}</dd>${z.night ? `<dt>Nota</dt><dd>${esc(z.night)}</dd>` : ''}`;
  $('sTip').hidden = !z.free;
  $('sTip').textContent = "Tra le 12.30 e le 14.30 c'è 1 ora gratis al giorno, ma solo pagando con Tap&Park o EasyPark.";
  $('sWarn').hidden = false;
  $('sWarn').textContent = (z.verify ? 'Dati di questa zona non confermati da fonte ufficiale. ' : '') +
    '*"Gratis ora" è un calcolo automatico: controlla sempre il cartello, potrebbero esserci divieti, riserve per residenti o regole temporanee.';
  const r = $('sRange'); r.max = z.max || 240; r.min = Math.min(10, r.max); r.value = Math.min(60, r.max); upd();
  $('sNav').href = navLink(z, c);
  $('sShow').hidden = !z.pos;
  $('scrim').hidden = false; $('sStart').focus();
}
function upd() { const m = +$('sRange').value; $('sDur').textContent = hm(m); $('sCost').textContent = current.rate != null ? eur(current.rate * m / 60) : 'n.d.'; }
function closeSheet() { $('scrim').hidden = true; }

/* ---------- note legali ---------- */
function legalAccepted() { return store.get('legal') === LEGAL_VERSION; }
function openLegal(firstRun) {
  $('lCheck').checked = false; $('lOk').disabled = true;
  $('lCheck').parentElement.hidden = !firstRun; $('lOk').hidden = !firstRun; $('lClose').hidden = firstRun;
  $('lTitle').textContent = firstRun ? 'Prima di usare Sosta Chiara' : 'Note legali e privacy';
  $('legal').hidden = false;
}
$('lCheck').onchange = () => { $('lOk').disabled = !$('lCheck').checked; };
$('lOk').onclick = () => { store.set('legal', LEGAL_VERSION); store.set('legalAt', new Date().toISOString()); $('legal').hidden = true; };
$('lClose').onclick = () => { $('legal').hidden = true; };
document.querySelectorAll('[data-legal]').forEach(b => b.onclick = () => openLegal(false));

/* ---------- avvisi ---------- */
function beep() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = 880; g.gain.value = .15; o.connect(g).connect(audio.destination); o.start(); o.stop(audio.currentTime + .4);
  } catch (e) {}
}
async function notify(title, body) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) reg.showNotification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'sosta', renotify: true, vibrate: [200, 100, 200] });
    else new Notification(title, { body, icon: 'icons/icon-192.png' });
  } catch (e) {}
}
function schedule() {
  timers.forEach(clearTimeout); timers = [];
  if (!active) return;
  const [z] = findZone(active.id); if (!z) return;
  const warnAt = active.end - 10 * 60000 - Date.now(), endAt = active.end - Date.now();
  if (warnAt > 0) timers.push(setTimeout(() => notify('Sosta in scadenza', `${z.name}: mancano 10 minuti.`), warnAt));
  if (endAt > 0) timers.push(setTimeout(() => notify('Sosta scaduta', `${z.name}: il tempo è finito.`), endAt));
}
function calendarFile() {
  const [z, c] = findZone(active.id);
  const f = t => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Sosta Chiara//IT', 'BEGIN:VEVENT',
    `UID:${active.start}@sostachiara`, `DTSTAMP:${f(Date.now())}`, `DTSTART:${f(active.end - 10 * 60000)}`, `DTEND:${f(active.end)}`,
    `SUMMARY:Scade la sosta - ${z.name}`, `LOCATION:${z.name}\\, ${DATA.cities[c].label}`,
    'BEGIN:VALARM', 'TRIGGER:PT0M', 'ACTION:DISPLAY', 'DESCRIPTION:Sosta in scadenza', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  a.download = 'sosta.ics'; document.body.appendChild(a); a.click(); a.remove();
}

/* ---------- sosta attiva ---------- */
async function start() {
  const m = +$('sRange').value;
  try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  if ('Notification' in window && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch (e) {} }
  active = { id: current.id, start: Date.now(), end: Date.now() + m * 60000 };
  warned = false; store.set('active', active); closeSheet(); schedule(); renderMeter();
}
function extend(min) {
  const [z] = findZone(active.id);
  let end = active.end + min * 60000;
  if (z.max) end = Math.min(end, active.start + z.max * 60000);
  active.end = end; warned = false; store.set('active', active); schedule(); renderMeter();
}
function stop() { active = null; store.set('active', null); schedule(); renderMeter(); }

function renderMeter() {
  const el = $('meter');
  if (!active) { el.innerHTML = '<div class="empty">Nessuna sosta attiva. Scegli una zona sulla mappa o nell\'elenco per vedere le regole e avviare il promemoria.</div>'; return; }
  const [z, c] = findZone(active.id); if (!z) { stop(); return; }
  const left = Math.max(0, active.end - Date.now()), used = (Math.min(Date.now(), active.end) - active.start) / 60000;
  const mm = Math.floor(left / 60000), ss = Math.floor(left % 60000 / 1000);
  const atMax = z.max && active.end >= active.start + z.max * 60000;
  el.innerHTML = `<div class="meter ${left < 600000 ? 'alert' : ''}">
    <span class="lbl">${left ? 'Promemoria sosta · ' + esc(DATA.cities[c].label) : 'Tempo scaduto'}</span>
    <span class="zone">${esc(z.name)}</span>
    <span class="clock">${Math.floor(mm / 60)}:${String(mm % 60).padStart(2, '0')}:${String(ss).padStart(2, '0')}</span>
    <div class="row"><span>Scade alle ${new Date(active.end).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span>${z.rate != null ? `<span>Costo stimato ≈ ${eur(z.rate * used / 60)}</span>` : ''}</div>
    ${left < 600000 && left ? '<strong>Mancano meno di 10 minuti: rinnova al parcometro o in app.</strong>' : ''}
    ${atMax ? '<strong>Hai raggiunto la durata massima indicata per la zona.</strong>' : ''}
    <small>Promemoria personale, non è un titolo di sosta.</small>
    <div class="acts">${atMax || !left ? '' : '<button id="mPlus">+15 min</button>'}${left ? '<button id="mCal">Aggiungi al calendario</button>' : ''}<button id="mStop" class="solid">Termina</button></div></div>`;
  if ($('mPlus')) $('mPlus').onclick = () => extend(15);
  if ($('mCal')) $('mCal').onclick = calendarFile;
  $('mStop').onclick = stop;
  if (left < 600000 && !warned) { warned = true; beep(); }
}

/* ---------- aggiornamenti automatici ---------- */
let swReg = null;
async function readBuild() {
  try { return (await (await fetch('version.json?t=' + Date.now(), { cache: 'no-store' })).json()).build; } catch (e) { return null; }
}
async function checkUpdate() {
  if (!navigator.onLine) return;
  try { await swReg?.update(); } catch (e) {}
  const b = await readBuild();
  if (b && BUILD && b !== BUILD) $('update').hidden = false;
}
async function applyUpdate() {
  $('updateBtn').disabled = true; $('updateBtn').textContent = 'Aggiorno…';
  try {
    if (swReg?.waiting) swReg.waiting.postMessage('SKIP_WAITING');
    if ('caches' in window) for (const k of await caches.keys()) await caches.delete(k);
  } catch (e) {}
  location.reload();
}
$('updateBtn').onclick = applyUpdate;
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(reg => {
    swReg = reg;
    if (reg.waiting && navigator.serviceWorker.controller) $('update').hidden = false;
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) $('update').hidden = false; });
    });
  }).catch(() => {});
}

/* ---------- avvio ---------- */
async function boot() {
  if (!legalAccepted()) openLegal(true);
  try { DATA = await (await fetch('zones.json', { cache: 'no-cache' })).json(); }
  catch (e) { $('list').innerHTML = '<div class="empty">Impossibile caricare le zone. Controlla la connessione e riprova.</div>'; return; }
  if (!DATA.cities[city]) city = 'parma';
  BUILD = await readBuild();
  $('ver').textContent = 'Versione ' + (BUILD ? BUILD.slice(0, 7) : 'locale');
  renderCityPicker(); initMap(); renderMap(); renderList(); renderMeter(); schedule();
  $('city').onchange = e => setCity(e.target.value);
  $('q').oninput = renderList;
  $('near').onclick = locate;
  $('list').onclick = e => { const b = e.target.closest('.zbtn'); if (b) openSheet(b.dataset.id); };
  $('sRange').oninput = upd; $('sStart').onclick = start; $('sClose').onclick = closeSheet; $('sShow').onclick = showOnMap;
  $('scrim').onclick = e => { if (e.target.id === 'scrim') closeSheet(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { renderMeter(); schedule(); checkUpdate(); } });
  setInterval(() => { if (active) renderMeter(); }, 1000);
  setInterval(() => { renderList(); renderMap(false); }, 60000);
  setInterval(checkUpdate, 30 * 60000);
}
boot();
