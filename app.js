/* DabbaDash – cloud kitchen dispatch dashboard (state kept in localStorage) */
const KEY = 'dabbadash_state_v1';
const MIN = 60000;
const STAGES = ['Received', 'In Kitchen', 'Packed', 'Out for Delivery', 'Delivered'];
const ACTIONS = ['Start cooking', 'Mark packed', 'Dispatch', 'Mark delivered'];
const BRANDS = {
  biryani: { name: 'Biryani Box', color: 'var(--biryani)' },
  burger: { name: 'Burger Den', color: 'var(--burger)' },
  chai: { name: 'Chai Point', color: 'var(--chai)' }
};
const ZONE_KM = { A: 1.2, B: 2.0, C: 2.8, D: 3.5 };
const COURIERS = [
  { id: 1, name: 'Ramesh', zone: 'B', cap: 3 },
  { id: 2, name: 'Suresh', zone: 'A', cap: 2 },
  { id: 3, name: 'Anita', zone: 'C', cap: 3 },
  { id: 4, name: 'Imran', zone: 'D', cap: 2 },
  { id: 5, name: 'Priya', zone: 'A', cap: 3 },
  { id: 6, name: 'Kiran', zone: 'B', cap: 2 }
];
// [brand, items, zone, status, minutes in current stage]
const RAW = [
  ['biryani', 'Chicken Biryani x2', 'A', 0, 3], ['burger', 'Veg Burger, Fries', 'C', 0, 2], ['chai', 'Masala Chai x3, Samosa', 'B', 0, 1],
  ['burger', '2 Burgers, Fries', 'B', 1, 8], ['biryani', 'Paneer Biryani', 'D', 1, 24], ['chai', 'Chai, Bun Maska', 'A', 1, 12], ['biryani', 'Mutton Biryani, Raita', 'C', 1, 26],
  ['burger', 'Chicken Burger', 'B', 2, 5], ['chai', 'Chai x4', 'B', 2, 3], ['biryani', 'Veg Biryani', 'A', 2, 7],
  ['burger', 'Burger Combo', 'A', 3, 6], ['chai', 'Samosa x6', 'C', 3, 4],
  ['biryani', 'Chicken Biryani', 'B', 4, 20], ['burger', 'Veg Burger', 'D', 4, 30], ['chai', 'Chai x2', 'A', 4, 45]
];

const $ = s => document.querySelector(s);
let state = load(), lastRaw = '', selectedId = 104, brandFilter = 'all';

/* ---------- state ---------- */
function seed() {
  const now = Date.now(), dur = [3, 9, 3, 15];
  const orders = RAW.map(([brand, items, zone, status, m], i) => {
    const t = []; t[status] = now - m * MIN;
    for (let k = status - 1; k >= 0; k--) t[k] = t[k + 1] - dur[k] * MIN;
    const courier = status >= 3 ? COURIERS.find(c => c.zone === zone).id : null;
    return { id: 101 + i, brand, items, zone, status, t, courier };
  });
  const s = { orders, sms: [], next: 116 };
  localStorage.setItem(KEY, JSON.stringify(s));
  return s;
}
function load() {
  try { const r = localStorage.getItem(KEY); if (r) return JSON.parse(r); } catch (e) { /* fall through */ }
  return seed();
}
function save() { localStorage.setItem(KEY, JSON.stringify(state)); lastRaw = localStorage.getItem(KEY); }

/* ---------- logic ---------- */
const byId = id => state.orders.find(o => o.id === +id);
const courierOf = o => COURIERS.find(c => c.id === o.courier);
const loadOf = c => state.orders.filter(o => o.courier === c.id && (o.status === 2 || o.status === 3)).length;
const totalMin = o => Math.round(ZONE_KM[o.zone] * 4 + 5);
const mins = ts => Math.floor((Date.now() - ts) / MIN);
const isLate = o => o.status === 1 && mins(o.t[1]) > 20;

function recommend(o) {
  const zi = z => 'ABCD'.indexOf(z);
  return COURIERS.filter(c => c.id === o.courier || loadOf(c) < c.cap)
    .sort((a, b) => Math.abs(zi(a.zone) - zi(o.zone)) - Math.abs(zi(b.zone) - zi(o.zone)) || loadOf(a) - loadOf(b))[0];
}
function sendSms(o) {
  const c = courierOf(o);
  state.sms.unshift({ id: o.id, time: new Date().toLocaleTimeString(),
    text: `${BRANDS[o.brand].name}: ${c.name} is out with order #${o.id}. Track it:` });
  state.sms = state.sms.slice(0, 6);
}
function advance(id) {
  const o = byId(id);
  if (o.status >= 4) return;
  if (o.status === 2 && !o.courier) {
    const c = recommend(o);
    if (!c) return toast('No courier has free capacity right now.');
    o.courier = c.id;
  }
  o.status++; o.t[o.status] = Date.now();
  if (o.status === 3) sendSms(o);
  save(); render();
}
function batchZone(zone) {
  const packed = state.orders.filter(o => o.status === 2 && o.zone === zone);
  let done = 0;
  packed.forEach(o => {
    const c = recommend(o);
    if (c && loadOf(c) < c.cap + (o.courier === c.id ? 1 : 0)) { o.courier = c.id; done++; }
  });
  save(); render();
  toast(done ? `Batched ${done} order(s) in Sector ${zone}.` : 'No courier capacity free.');
}
function newOrder() {
  const keys = Object.keys(BRANDS), zones = Object.keys(ZONE_KM);
  const brand = keys[Math.random() * keys.length | 0];
  const menu = { biryani: ['Chicken Biryani', 'Paneer Biryani, Raita'], burger: ['2 Burgers, Fries', 'Veg Burger'], chai: ['Chai x3, Samosa', 'Bun Maska, Chai'] }[brand];
  state.orders.push({ id: state.next++, brand, items: menu[Math.random() * 2 | 0], zone: zones[Math.random() * 4 | 0], status: 0, t: [Date.now()], courier: null });
  save(); render();
}

/* ---------- render: kitchen ---------- */
function renderKpis() {
  const done = state.orders.filter(o => o.status >= 2);
  const avg = done.length ? Math.round(done.reduce((s, o) => s + (o.t[2] - o.t[1]) / MIN, 0) / done.length) : 0;
  const inKitchen = state.orders.filter(o => o.status === 1).length;
  const pending = state.orders.filter(o => o.status === 2).length;
  const out = state.orders.filter(o => o.status === 3).length;
  const late = state.orders.filter(isLate).length;
  const k = (v, l, cls = '') => `<div class="kpi ${cls}"><b>${v}</b><span>${l}</span></div>`;
  $('#kpis').innerHTML = k(avg + ' min', 'Average prep time') + k(inKitchen, 'Active in kitchen') +
    k(pending, 'Pending courier dispatches') + k(out, 'Out for delivery') + k(late, 'Kitchen delays (20+ min)', late ? 'alert' : '');
}
function cardHtml(o) {
  const b = BRANDS[o.brand], c = courierOf(o);
  let extra = '';
  if (o.status === 2) {
    const rec = recommend(o);
    const opts = COURIERS.map(x => `<option value="${x.id}" ${(o.courier || rec?.id) === x.id ? 'selected' : ''} ${loadOf(x) >= x.cap && o.courier !== x.id ? 'disabled' : ''}>${x.name} (Sector ${x.zone}, ${loadOf(x)}/${x.cap})</option>`).join('');
    extra = `<p class="rec">${rec ? 'Recommended: ' + rec.name : 'No rider free'}</p><select data-asg="${o.id}" aria-label="Assign courier"><option value="">Choose courier</option>${opts}</select>`;
  }
  const stage = o.status === 1 ? `${mins(o.t[1])} min in kitchen` : (c ? 'Rider: ' + c.name : '');
  const late = isLate(o) ? '<span class="late-tag">Delayed</span>' : '';
  const btn = o.status < 4 ? `<button class="btn" data-adv="${o.id}">${ACTIONS[o.status]}</button>` : '';
  return `<article class="card ${isLate(o) ? 'late' : ''}" style="--c:${b.color}">
    <div class="row"><strong>#${o.id}</strong><span>${b.name}</span></div>
    <p>${o.items}</p><div class="row"><span>Sector ${o.zone}</span><span>${stage} ${late}</span></div>${extra}${btn}</article>`;
}
function renderBoard() {
  const list = state.orders.filter(o => brandFilter === 'all' || o.brand === brandFilter);
  $('#board').innerHTML = STAGES.map((name, i) => {
    const items = list.filter(o => o.status === i);
    return `<div class="col"><h3>${name}<em>${items.length}</em></h3>${items.map(cardHtml).join('') || '<p class="empty">No orders</p>'}</div>`;
  }).join('');
}
function renderBatcher() {
  const rows = Object.keys(ZONE_KM).map(z => ({ z, list: state.orders.filter(o => o.status === 2 && o.zone === z) })).filter(g => g.list.length);
  $('#batcher').innerHTML = rows.map(g => `<div class="batch"><div><b>Sector ${g.z}</b> · ${ZONE_KM[g.z]} km<br>${g.list.map(o => '#' + o.id).join(', ')}</div>
    <button class="btn" data-batch="${g.z}">Batch &amp; assign</button></div>`).join('') || '<p class="empty">Packed orders for the same sector will group here.</p>';
}
function renderPayouts() {
  const mult = $('#surge').checked ? 1.5 : 1;
  const rows = COURIERS.map(c => {
    const trips = state.orders.filter(o => o.courier === c.id && o.status >= 3);
    const pay = trips.reduce((s, o) => s + (25 + 10 * ZONE_KM[o.zone]) * mult, 0);
    return `<tr><td>${c.name}</td><td>${trips.length}</td><td>₹${pay.toFixed(0)}</td></tr>`;
  }).join('');
  $('#payouts').innerHTML = `<table><tr><th>Rider</th><th>Trips</th><th>Earnings</th></tr>${rows}</table><p class="hint">₹25 base + ₹10 per km.</p>`;
}
function renderSms() {
  $('#sms').innerHTML = state.sms.map(m => `<div class="sms"><small>${m.time}</small>${m.text} <a data-track="${m.id}">dabbadash.in/t/${m.id}</a></div>`).join('') || '<p class="empty">Dispatch an order to send a tracking SMS.</p>';
}

/* ---------- render: customer ---------- */
function renderSelect() {
  $('#orderSelect').innerHTML = state.orders.map(o => `<option value="${o.id}" ${o.id === selectedId ? 'selected' : ''}>#${o.id} · ${BRANDS[o.brand].name}</option>`).join('');
}
function renderTracker() {
  const o = byId(selectedId); if (!o) return;
  const c = courierOf(o);
  let msg = ['Order received. The kitchen will start soon.', 'Your food is being cooked.',
    c ? `Courier Assigned - ${c.name} is picking up your food!` : 'Packed and waiting for a courier.',
    c ? `${c.name} is on the way to you.` : '', 'Delivered. Enjoy your meal!'][o.status];
  let pct = 0, eta = '';
  if (o.status === 3) {
    const total = totalMin(o) * 60, el = (Date.now() - o.t[3]) / 1000;
    pct = Math.min(el / total, 1) * 100;
    const left = Math.max(Math.round(total - el), 0);
    eta = `<div class="eta" aria-live="off">${String(left / 60 | 0).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}</div><small>Estimated arrival</small>`;
  }
  if (o.status === 4) pct = 100;
  $('#tracker').innerHTML = `<h2>Order #${o.id} · ${BRANDS[o.brand].name}</h2><div>${o.items}</div>
    <div class="msg">${msg}</div>${eta}
    <ol class="stepper">${STAGES.map((s, i) => `<li class="${i <= o.status ? 'done' : ''} ${i === o.status ? 'now' : ''}">${s}</li>`).join('')}</ol>
    <div class="road"><span class="kitchen">🍳</span><span class="scooter" style="left:${Math.min(Math.max(pct, 4), 96)}%">🛵</span><span class="home">🏠</span></div>`;
}

/* ---------- wiring ---------- */
function render() { renderKpis(); renderBoard(); renderBatcher(); renderPayouts(); renderSms(); renderSelect(); renderTracker(); }
function toast(t) { const e = $('#toast'); e.textContent = t; e.classList.add('show'); setTimeout(() => e.classList.remove('show'), 2200); }
function showView(v) {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  $('#view-kitchen').classList.toggle('hidden', v !== 'kitchen');
  $('#view-customer').classList.toggle('hidden', v !== 'customer');
}
function sync() { // pick up changes made in another tab/window
  const raw = localStorage.getItem(KEY);
  if (raw && raw !== lastRaw) { lastRaw = raw; state = JSON.parse(raw); render(); }
}

document.addEventListener('click', e => {
  const t = e.target;
  if (t.dataset.view) showView(t.dataset.view);
  if (t.dataset.adv) advance(t.dataset.adv);
  if (t.dataset.batch) batchZone(t.dataset.batch);
  if (t.dataset.track) { selectedId = +t.dataset.track; showView('customer'); render(); }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.asg) { const o = byId(t.dataset.asg); o.courier = t.value ? +t.value : null; save(); render(); }
});
$('#brandFilter').onchange = e => { brandFilter = e.target.value; renderBoard(); };
$('#orderSelect').onchange = e => { selectedId = +e.target.value; renderTracker(); };
$('#surge').onchange = renderPayouts;
$('#newOrder').onclick = newOrder;
$('#resetDemo').onclick = () => { state = seed(); lastRaw = localStorage.getItem(KEY); render(); toast('Demo data reset.'); };
window.addEventListener('storage', sync);

const q = new URLSearchParams(location.search).get('track');
if (q) { selectedId = +q; showView('customer'); }
lastRaw = localStorage.getItem(KEY);
render();
setInterval(sync, 3000);                 // polling fallback every 3 s
setInterval(renderTracker, 1000);        // live ETA countdown + scooter movement
setInterval(() => { renderKpis(); renderBoard(); }, 30000); // refresh elapsed-minute timers