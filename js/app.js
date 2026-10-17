/*
 * Shira Group Quotation Generator
 * Vanilla JavaScript; no backend required.
 *
 * Organized version with descriptive comments before every function
 * and event handler. Includes the Sub Item feature
 * (Accessories / Spare Part / Other) inside every quotation item.
 */

/* ==========================================================================
 * 1. COMPANY SETTINGS, DEFAULT CONTENT, AND CONSTANTS
 * ========================================================================== */

// Company details printed in the quotation footer.
// Values beginning with "[" are treated as placeholders and hidden in the PDF.
const COMPANY = {
  name: 'Shira Group',
  website: 'www.shiragroup.com',
  address: '5 Khaled Ibn El-Waled St., Sheraton, Heliopolis Area, Cairo, Egypt',
  phone: '+2 02 2266 1844 / +2 012 0863 3330',
  email: 'info@shiragroup.com',
  tax: '[Tax Registration No.]',
  commercial: '[Commercial Registration No.]'
};

// Path to the default Shira Group logo in the project assets folder.
const LOGO_PATH = 'assets/ShiraTradeLogo.png';

// Key used to save and restore quotation data from localStorage.
const STORE_KEY = 'shiraQuotation.v1';

// Available types for a Sub Item.
const SUB_TYPES = ['Accessories', 'Spare Part', 'Other'];

// Internal pricing categories (never printed). Each maps to the optional tier-price field on every priced line.
const TIERS = { 'Trader': 'priceT', 'Contractor': 'priceC', 'End User': 'priceE' };

// Default commercial terms displayed in the quotation.
const DEFAULT_TERMS = [
  'Payment Terms: 50% Advanced Payment & 50% Cash on delivery',
  'Delivery Period: According To Agreement.',
  'Place Of Delivery: Our Store in Cairo.',
  'Offer Validity is 3 Days',
  'Supply according to the goods present upon receipt.',
  'In Case Offer Validity Is Finished, You Should Refer Back to Us to Renew Prices.',
  "Prices are for supply only, and don't include any site works cost. Prices don't include any accessory items.",
  'In Case of optional products note that the prices without VAT.'
].join('\n');

// Default Arabic notes saved with the quotation.
const DEFAULT_NOTES = [
  'ملحوظة :',
  '• الاسعار استرشادية وتنتهي صلاحيتها بانتهاء تاريخ يوم العرض.',
  '• نظراً للتغير المستمر لأسعار صرف العملات الأجنبية، فإننا ننوه على سيادتكم بأنه في حالة تغير أسعار الصرف سوف نضطر إلى تعديل أسعار أوامر التوريد غير المفعلة بدفعات مقدمة.'
].join('\n');

/* ==========================================================================
 * 2. GENERAL HELPER FUNCTIONS
 * ========================================================================== */

// Returns the first HTML element matching the supplied CSS selector.
const $ = s => document.querySelector(s);

// Escapes HTML-sensitive characters to prevent user-entered text from being
// interpreted as HTML markup.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

// Converts a value into a positive finite number.
// Blank, invalid, zero, and negative values are treated as zero.
const num = v => {
  const n = parseFloat(v);
  return isFinite(n) && n > 0 ? n : 0;
};

// Formats a number as currency with thousands separators and two decimal places.
const money = n => n.toLocaleString('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

// Rounds a number to two decimal places without forcing trailing zeros.
const trim2 = n => String(Math.round(n * 100) / 100);

// Counter used with timestamps to reduce the chance of generating duplicate IDs.
let seq = 0;

// Generates a unique ID using a prefix, the current timestamp, and a counter.
const uid = p => p + Date.now() + (seq++);

/* ==========================================================================
 * 3. UNIT CONVERSION HELPERS
 * ========================================================================== */

// Conversion factors for converting flow rates into the standard unit m³/h.
const FLOW_FACTORS = {
  'm³/h': 1,
  'L/s': 3.6,
  'L/min': 0.06,
  'L/h': 0.001,
  'm³/min': 60,
  'm³/s': 3600
};

// Converts a flow-rate value from its selected unit into m³/h.
const toM3h = (v, unit) => v * (FLOW_FACTORS[unit] || 1);

// Converts a pump head value from its selected unit into metres.
const toMeters = (v, unit) => v * (unit === 'ft' ? 0.3048 : 1);

/* ==========================================================================
 * 4. QUOTATION STATE AND DEFAULT OBJECTS
 * ========================================================================== */

// Returns today's date in YYYY-MM-DD format.
const today = () => new Date().toISOString().slice(0, 10);

// Creates a new additional local item with default values and a unique ID.
const newLocal = () => ({
  id: uid('l'), desc: '', origin: 'Local', unit: 'No.', qty: '1', price: '', priceT: '', priceC: '', priceE: ''
});

// Creates a new Sub Item (accessory / spare part / other) inside an item.
const newSubItem = () => ({
  id: uid('s'), type: 'Accessories', partNo: '', desc: '',
  origin: '', unit: 'No.', qty: '1', price: '', priceT: '', priceC: '', priceE: '', img: ''
});

// Creates a new pump/quotation item with its default fields.
const newItem = () => ({
  id: uid('i'),
  type: 'Booster Set',
  cat: 'Horizontal Pump',
  typeName: '',
  origin: '',
  img: '',
  partNo: '',
  desc: '',
  price: '',
  priceT: '',
  priceC: '',
  priceE: '',
  flow: '',
  flowU: 'm³/h',
  head: '',
  headU: 'm',
  vfd: false,
  duty: '',
  standby: '',
  locals: [],
  subItems: []
});

// Fills in any missing fields on an item (used for old saved quotations
// and imported files) so every item has locals and subItems arrays.
const normalizeItem = it => ({
  ...newItem(),
  ...it,
  locals: (it.locals || []).map(l => ({ ...newLocal(), ...l })),
  subItems: (it.subItems || []).map(x => ({ ...newSubItem(), ...x }))
});

// Creates a fresh quotation with default header information, one item,
// and the default terms and notes.
const freshState = () => ({
  info: {
    so: '',
    date: today(),
    customer: '',
    project: '',
    attn: '',
    rev: '0',
    vat: '14'
  },
  items: [newItem()],
  terms: DEFAULT_TERMS,
  tier: '',
  notes: DEFAULT_NOTES
});

// Loads saved quotation data from localStorage.
// Missing fields are filled with defaults to support older saved quotations.
// If saved data is invalid or unavailable, a fresh quotation is returned.
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));

    if (s && s.info && Array.isArray(s.items)) {
      // Supply defaults for fields added in newer versions.
      s.info.vat ??= '14';
      s.terms ??= DEFAULT_TERMS;
      s.notes ??= DEFAULT_NOTES;
      s.tier ??= '';

      // Ensure every item, local item and sub item contains all expected fields.
      s.items = s.items.map(normalizeItem);

      return s;
    }
  } catch (e) {
    // Continue with a fresh quotation if saved data cannot be read.
  }

  return freshState();
}

// Saves the current quotation state to localStorage.
// Storage errors are ignored so they do not stop the application.
function saveState() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (e) {
    // Ignore storage errors.
  }
}

// Stores the active quotation, restoring it from localStorage if possible.
let state = loadState();

// Stores the logo data used by the quotation preview and PDF export.
let logo = { url: LOGO_PATH, w: 1, h: 1 };

/* ==========================================================================
 * 5. CALCULATIONS
 * ========================================================================== */

// Unit price actually used for a line: the tier price of the selected internal category when one has been
// entered, otherwise the normal unit price typed on the line. This is the only place that applies the tier.
function effPrice(o) {
  const k = TIERS[state.tier];
  return k && String(o[k] ?? '').trim() !== '' ? num(o[k]) : num(o.price);
}

// Calculates the pump quantity, pump total, local-item totals, sub-item totals,
// and subtotal for one quotation item (using the price for the selected category).
function calc(it) {
  const qty = Math.floor(num(it.duty)) + Math.floor(num(it.standby));

  // Use duty + standby quantity; if neither is entered, assume one pump.
  const pumpQty = qty > 0 ? qty : 1;

  // Unit price and total price of all pumps in this item.
  const pumpUnit = effPrice(it);
  const pumpTotal = pumpUnit * pumpQty;

  // Local items and sub items: `price` in the result is the price actually used.
  const locals = it.locals.map(l => {
    const price = effPrice(l);
    return { ...l, price, total: num(l.qty) * price };
  });
  const subs = (it.subItems || []).map(s => {
    const price = effPrice(s);
    return { ...s, price, total: num(s.qty) * price };
  });

  return {
    pumpQty,
    pumpUnit,
    pumpTotal,
    locals,
    subs,
    subtotal: pumpTotal
      + locals.reduce((a, l) => a + l.total, 0)
      + subs.reduce((a, s) => a + s.total, 0)
  };
}

// Adds the subtotals of every quotation item before VAT.
const grandTotal = () => state.items.reduce((s, it) => s + calc(it).subtotal, 0);

// Calculates the subtotal, VAT amount, and grand total including VAT.
function totals() {
  const sub = grandTotal();
  const vat = sub * num(state.info.vat) / 100;
  return { sub, vat, total: sub + vat };
}

/* ==========================================================================
 * 6. AUTOMATIC ITEM HEADING
 * ========================================================================== */

// Builds the descriptive heading for an item.
// The heading includes item type, pump category, speed control, converted flow
// and head values, and duty/standby quantities when supplied.
function buildHeading(it) {
  const f = num(it.flow);
  const h = num(it.head);

  // Build the performance specification using standard units.
  const perf = [
    f ? `Q = ${trim2(toM3h(f, it.flowU))} m³/h` : '',
    h ? `H = ${trim2(toMeters(h, it.headU))} m` : ''
  ].filter(Boolean).join(', ');

  // Identify whether the pump uses variable-speed or fixed-speed operation.
  const speed = it.vfd ? 'Variable Speed' : 'Fixed Speed';

  // Read the duty and standby quantities.
  const d = Math.floor(num(it.duty));
  const s = Math.floor(num(it.standby));

  // Build the duty/standby description if quantities are supplied.
  const cfg = [
    d ? `${d} Duty` : '',
    s ? `${s} Standby` : ''
  ].filter(Boolean).join(' + ');

  // Use the custom pump type when provided; otherwise use the category.
  let base = (it.typeName || '').trim() ? it.typeName.trim() : it.cat;

  // Choose the correct heading prefix based on the item type.
  const lead =
    it.type === 'Booster Set' ? `Locally Assembled Booster Set (${speed}): `
      : it.type === 'Single Pump' ? `Single Pump (${speed}): `
        : '';

  // Combine all available heading components.
  return lead + base + (perf ? ` (${perf})` : '') + (cfg ? ` , (${cfg})` : '');
}

// Builds the printed label of a Sub Item:
//   Accessories -> "Accessories: [Part Number] Description"
//   Spare Part  -> "Spare Parts: [Part Number] Description"
//   Other       -> "[Part Number] Description"
// When the part number is blank the brackets are left out.
function subLabel(s) {
  const pn = (s.partNo || '').trim();
  const body = [pn ? `[${pn}]` : '', (s.desc || '').trim()].filter(Boolean).join(' ');
  const prefix =
    s.type === 'Accessories' ? 'Accessories: '
      : s.type === 'Spare Part' ? 'Spare Parts: '
        : '';
  return prefix + body;
}

/* ==========================================================================
 * 7. FORM HTML GENERATION
 * ========================================================================== */

// Generates a labeled input field linked to a property of a quotation item.
const field = (f, label, v, type = 'text', extra = '') =>
  `<label>${label}<input data-f="${f}" type="${type}" value="${esc(v)}" ${extra}></label>`;

// Generates a numeric input that accepts non-negative decimal values.
const numField = (f, label, v) =>
  field(f, label, v, 'number', 'min="0" step="any" inputmode="decimal"');

// Generates a labeled dropdown and marks the current value as selected.
const select = (f, label, opts, v) =>
  `<label>${label}<select data-f="${f}">${opts.map(o =>
    `<option${o === v ? ' selected' : ''}>${esc(o)}</option>`
  ).join('')}</select></label>`;

// Internal tier-price inputs (Trader / Contractor / End User), shown in a collapsed block on each priced line.
// `attr` is the data attribute the existing handlers use: data-f (pump), data-lf (local item), data-sf (sub item).
const tierInputs = (o, attr) => `<details style="grid-column:1/-1">
  <summary>Tier prices (internal – never printed)</summary>
  <div class="grid" style="margin-top:8px">${[['priceT', 'Trader'], ['priceC', 'Contractor'], ['priceE', 'End User']].map(([k, n]) =>
    `<label>${n} price (EGP)<input ${attr}="${k}" type="number" min="0" step="any" value="${esc(o[k])}"></label>`).join('')}</div>
  <small>Used when this category is selected above; otherwise the unit price is used.</small>
</details>`;

// Generates the editable form row for an additional local item.
// It includes the description, origin, unit, quantity, price, line total,
// and a button for removing the item.
function localHTML(l) {
  return `<div class="lrow" data-lid="${l.id}">
    <label>Description (lines ending with “:” print bold + underlined)<textarea data-lf="desc" rows="4">${esc(l.desc)}</textarea></label>
    <label>Origin<input data-lf="origin" value="${esc(l.origin)}"></label>
    <label>Unit<input data-lf="unit" value="${esc(l.unit)}"></label>
    <label>Quantity<input data-lf="qty" type="number" min="0" step="any" value="${esc(l.qty)}"></label>
    <label>Unit Price (EGP)<input data-lf="price" type="number" min="0" step="any" value="${esc(l.price)}"></label>
    <div class="ltotal"><small>Line total</small><span data-out="ltotal">0.00</span></div>
    <button class="btn danger small" data-act="rm-local">Remove</button>
    ${tierInputs(l, 'data-lf')}
  </div>`;
}

// Generates the editable form row for a Sub Item.
// It includes type, part number, description, origin, unit, quantity,
// price, optional image, line total, and a button for removing the sub item.
function subItemHTML(s) {
  return `<div class="lrow" data-sid="${s.id}">
    <label>Type<select data-sf="type">${SUB_TYPES.map(o =>
    `<option${o === s.type ? ' selected' : ''}>${o}</option>`).join('')}</select></label>
    <label>Part Number<input data-sf="partNo" value="${esc(s.partNo)}"></label>
    <label>Description<textarea data-sf="desc" rows="3">${esc(s.desc)}</textarea></label>
    <label>Origin<input data-sf="origin" value="${esc(s.origin)}"></label>
    <label>Unit<input data-sf="unit" value="${esc(s.unit)}"></label>
    <label>Quantity<input data-sf="qty" type="number" min="0" step="any" value="${esc(s.qty)}"></label>
    <label>Unit Price (EGP)<input data-sf="price" type="number" min="0" step="any" value="${esc(s.price)}"></label>
    <div class="imgbox"><label>Image (optional)<input type="file" accept="image/*" data-simg></label>
      ${s.img ? `<img class="thumb" src="${s.img}" alt=""><button class="btn danger small" data-act="rm-subimg">Remove image</button>` : ''}</div>
    <div class="ltotal"><small>Line total</small><span data-out="stotal">0.00</span></div>
    <button class="btn danger small" data-act="rm-sub">Remove</button>
    ${tierInputs(s, 'data-sf')}
  </div>`;
}

// Generates the complete editable form card for one pump/quotation item.
// The card includes pump details, operating conditions, VFD settings,
// duty/standby quantities, local items, sub items, and calculated totals.
function itemHTML(it, i) {
  const booster = it.type === 'Booster Set';

  return `<article class="card item" data-id="${it.id}">
    <div class="card-h"><h3>Item ${i + 1}</h3><button class="btn danger small" data-act="rm-item">Remove Item</button></div>
    <div class="heading-preview" data-out="heading"></div>
    <div class="grid">${select('type', 'Item Type', ['Booster Set', 'Single Pump', 'Other'], it.type)}
      ${select('cat', 'Pump Category', ['Vertical Pump', 'Horizontal Pump', 'Submersible Pump', 'Self-Priming Pump', 'Circulation Pump'], it.cat)}</div>
    <div class="group"><h4>Pump information</h4><div class="grid">
      ${field('partNo', 'Pump Part Number', it.partNo)}${field('desc', 'Pump Description', it.desc)}${numField('price', 'Pump Unit Price (EGP)', it.price)}
      ${field('typeName', 'Heading pump type (optional)', it.typeName, 'text', 'placeholder="e.g. Horizontal End-suction"')}${field('origin', 'Origin', it.origin, 'text', 'placeholder="e.g. Italy / DAB"')}
      <div class="imgbox"><label>Pump Image (optional)<input type="file" accept="image/*" data-img></label>${it.img ? `<img class="thumb" src="${it.img}" alt=""><button class="btn danger small" data-act="rm-img">Remove image</button>` : ''}</div>
      ${tierInputs(it, 'data-f')}</div></div>
    <div class="group"><h4>Operating conditions</h4><div class="grid">
      ${numField('flow', 'Flow Rate (Q)', it.flow)}${select('flowU', 'Flow Unit', Object.keys(FLOW_FACTORS), it.flowU)}
      ${numField('head', 'Head (H)', it.head)}${select('headU', 'Head Unit', ['m', 'ft'], it.headU)}</div></div>
    <div class="group cfg ${booster ? 'prominent' : 'muted'}"><h4>Pump configuration</h4><div class="grid dq">
      <label class="checkline"><input type="checkbox" data-f="vfd" ${it.vfd ? 'checked' : ''}> Variable Speed / VFD</label>
      ${numField('duty', 'Duty Quantity', it.duty)}${numField('standby', 'Standby Quantity', it.standby)}</div></div>
    <div class="group"><h4>Additional local items</h4>${it.locals.map(localHTML).join('')}
      <button class="btn ghost small" data-act="add-local">+ Add Local Item</button>
    </div>
    <div class="group"><h4>Additional Sub items</h4>${(it.subItems || []).map(subItemHTML).join('')}
      <button class="btn ghost small" data-act="add-sub">+ Add Sub Item</button>
    </div>
    <div class="subtotal">Pump total: <span data-out="pumptotal">0.00</span> EGP &nbsp;|&nbsp; Item subtotal: <span data-out="subtotal">0.00</span> EGP</div>
  </article>`;
}

// Rebuilds the list of quotation item cards using the current state.
function renderItems() {
  $('#items').innerHTML = state.items.map(itemHTML).join('');
}

// Copies the saved quotation header information, terms, and notes into the form.
function renderInfo() {
  document.querySelectorAll('[data-info]').forEach(el => {
    el.value = state.info[el.dataset.info] ?? '';
  });

  $('#terms').value = state.terms;
  $('#notes').value = state.notes;
  $('#tier').value = state.tier || '';
}

/* ==========================================================================
 * 8. LIVE REFRESH AND SUMMARY
 * ========================================================================== */

// Updates item headings, line totals, subtotals, VAT summary, grand total,
// local storage, and the quotation preview when it is visible.
// The input elements are not rebuilt, which helps preserve cursor focus.
function refresh() {
  document.querySelectorAll('.item').forEach(card => {
    const it = state.items.find(x => x.id === card.dataset.id);
    const c = calc(it);

    // Update the calculated heading and totals displayed on each item card.
    card.querySelector('[data-out=heading]').textContent = buildHeading(it);
    card.querySelector('[data-out=pumptotal]').textContent = money(c.pumpTotal);
    card.querySelector('[data-out=subtotal]').textContent = money(c.subtotal);

    // Update each additional local item's line total.
    c.locals.forEach(l => {
      card.querySelector(
        `[data-lid="${l.id}"] [data-out=ltotal]`
      ).textContent = money(l.total);
    });

    // Update each sub item's line total.
    c.subs.forEach(s => {
      card.querySelector(
        `[data-sid="${s.id}"] [data-out=stotal]`
      ).textContent = money(s.total);
    });
  });

  // Calculate the quotation-level subtotal, VAT, and grand total.
  const t = totals();

  // Build the financial summary displayed in the form.
  $('#summary').innerHTML =
    state.items.map((it, i) =>
      `<div><span>Item ${i + 1} subtotal</span><span>${money(calc(it).subtotal)} EGP</span></div>`
    ).join('') +
    `<div><span>Sub Total for all pumps</span><span>${money(t.sub)} EGP</span></div>` +
    `<div><span>Tax ${trim2(num(state.info.vat))}%</span><span>${money(t.vat)} EGP</span></div>` +
    `<div class="gt"><span>Total inc. VAT</span><span>${money(t.total)} EGP</span></div>`;

  // Update the prominent grand-total display.
  $('#grand').textContent = money(t.total);

  // Save the latest quotation data automatically.
  saveState();

  // Show the PDF file name that will be used for the current SO number and revision.
  updateFileNameNote();

  // Keep the quotation preview synchronized if it is currently visible.
  if (!$('#preview').hidden) {
    renderQuote();
  }
}

/* ==========================================================================
 * 9. ITEM AND FORM EVENT HANDLERS
 * ========================================================================== */

// Handles edits to pump fields, local-item fields, and sub-item fields.
// Updates the state and refreshes all calculated values and the preview.
function onItemEdit(e) {
  const t = e.target;
  const card = t.closest('.item');

  // Ignore changes that did not originate inside an item card.
  if (!card) return;

  const it = state.items.find(x => x.id === card.dataset.id);

  // Prevent negative values from remaining in numeric inputs.
  if (t.type === 'number' && parseFloat(t.value) < 0) {
    t.value = '';
  }

  // Update a pump/quotation item's field.
  if (t.dataset.f) {
    it[t.dataset.f] = t.type === 'checkbox' ? t.checked : t.value;

    // Visually emphasize duty/standby settings when the item is a booster set.
    if (t.dataset.f === 'type') {
      const cfg = card.querySelector('.cfg');
      cfg.classList.toggle('prominent', t.value === 'Booster Set');
      cfg.classList.toggle('muted', t.value !== 'Booster Set');
    }
  } else if (t.dataset.lf) {
    // Update a field belonging to an additional local item.
    it.locals.find(
      x => x.id === t.closest('.lrow').dataset.lid
    )[t.dataset.lf] = t.value;
  } else if (t.dataset.sf) {
    // Update a field belonging to a sub item.
    it.subItems.find(
      x => x.id === t.closest('[data-sid]').dataset.sid
    )[t.dataset.sf] = t.value;
  } else {
    return;
  }

  // Refresh totals, save the data, and update the preview if needed.
  refresh();
}

// Handles input events for existing and dynamically added item cards.
$('#items').addEventListener('input', onItemEdit);

// Handles change events such as dropdown selections and checkbox changes.
$('#items').addEventListener('change', onItemEdit);

// Handles buttons inside item cards, including removing items, adding/removing
// local items, adding/removing sub items, and removing pump or sub-item images.
$('#items').addEventListener('click', e => {
  const btn = e.target.closest('[data-act]');

  // Ignore clicks that did not target an action button.
  if (!btn) return;

  const card = btn.closest('.item');
  const it = state.items.find(x => x.id === card.dataset.id);

  // Remove a quotation item after confirming if it is the last item.
  if (btn.dataset.act === 'rm-item') {
    if (
      state.items.length === 1 &&
      !confirm('This is the only item. Remove it anyway?')
    ) {
      return;
    }

    state.items = state.items.filter(x => x !== it);

    // Remove the pump image from the current item.
  } else if (btn.dataset.act === 'rm-img') {
    it.img = '';

    // Add a new additional local item to the current quotation item.
  } else if (btn.dataset.act === 'add-local') {
    it.locals.push(newLocal());

    // Remove the selected additional local item.
  } else if (btn.dataset.act === 'rm-local') {
    it.locals = it.locals.filter(
      l => l.id !== btn.closest('.lrow').dataset.lid
    );

    // Add a new sub item to the current quotation item.
  } else if (btn.dataset.act === 'add-sub') {
    it.subItems.push(newSubItem());

    // Remove the selected sub item.
  } else if (btn.dataset.act === 'rm-sub') {
    it.subItems = it.subItems.filter(
      s => s.id !== btn.closest('[data-sid]').dataset.sid
    );

    // Remove the image from the selected sub item.
  } else if (btn.dataset.act === 'rm-subimg') {
    it.subItems.find(
      s => s.id === btn.closest('[data-sid]').dataset.sid
    ).img = '';
  }

  // Rebuild the item cards and update calculations after the action.
  renderItems();
  refresh();
});

// Adds a new quotation item and updates the form and totals.
$('#addItem').addEventListener('click', () => {
  state.items.push(newItem());
  renderItems();
  refresh();
});

// Saves changes made to quotation header fields such as SO number,
// date, customer, project, attention, revision, and VAT percentage.
document.querySelectorAll('[data-info]').forEach(el =>
  el.addEventListener('input', () => {
    state.info[el.dataset.info] = el.value;
    refresh();
  })
);

// Saves the internal pricing category and re-prices every line.
$('#tier').addEventListener('change', e => {
  state.tier = e.target.value;
  refresh();
});

// Saves changes to the editable terms and conditions.
$('#terms').addEventListener('input', e => {
  state.terms = e.target.value;
  refresh();
});

// Saves changes to the editable quotation notes.
$('#notes').addEventListener('input', e => {
  state.notes = e.target.value;
  refresh();
});

// Reads an image file, resizes it so its longest side is at most `max` px,
// converts it to a JPEG data URL on a white background, and passes the result
// to the callback. Used for both pump images and sub-item images.
function resizeImage(file, max, cb) {
  const fr = new FileReader();

  // Process the image after the browser reads the selected file.
  fr.onload = () => {
    const im = new Image();

    // Resize the image and save it in a PDF-friendly format.
    im.onload = () => {
      const k = Math.min(1, max / Math.max(im.width, im.height));
      const c = document.createElement('canvas');
      c.width = Math.round(im.width * k);
      c.height = Math.round(im.height * k);

      const x = c.getContext('2d');

      // Add a white background before drawing the image.
      x.fillStyle = '#fff';
      x.fillRect(0, 0, c.width, c.height);
      x.drawImage(im, 0, 0, c.width, c.height);

      cb(c.toDataURL('image/jpeg', 0.85));
    };

    im.src = fr.result;
  };

  fr.readAsDataURL(file);
}

// Handles image uploads for pump images (400 px max) and sub-item images
// (300 px max), stores the result in the state, and refreshes the form.
$('#items').addEventListener('change', e => {
  const t = e.target;

  // Ignore changes that are not file uploads.
  if (!t.files || !t.files[0]) return;

  const it = state.items.find(
    x => x.id === t.closest('.item').dataset.id
  );

  if (t.matches('[data-img]')) {
    resizeImage(t.files[0], 400, d => {
      it.img = d;
      renderItems();
      refresh();
    });
  } else if (t.matches('[data-simg]')) {
    const s = it.subItems.find(
      x => x.id === t.closest('[data-sid]').dataset.sid
    );

    resizeImage(t.files[0], 300, d => {
      s.img = d;
      renderItems();
      refresh();
    });
  }
});

// Displays the quotation preview and scrolls the page to it.
$('#previewBtn').addEventListener('click', () => {
  showPreview();
  $('#preview').scrollIntoView({ behavior: 'smooth' });
});

// Starts the PDF export process when the Export PDF button is clicked.
$('#exportBtn').addEventListener('click', exportPdf);

// Clears the quotation after confirmation, removes its saved copy,
// hides the preview, and resets the form.
$('#resetBtn').addEventListener('click', () => {
  if (!confirm('Clear the whole quotation? This cannot be undone.')) {
    return;
  }

  state = freshState();
  localStorage.removeItem(STORE_KEY);
  pdfPrefix = PDF_PREFIX;

  $('#preview').hidden = true;

  renderInfo();
  renderItems();
  refresh();
});

/* ==========================================================================
 * 10. QUOTATION DOCUMENT HTML
 * ========================================================================== */

// Formats a date string as a readable date, such as "14 Oct 2026".
const fmtDate = d => d
  ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })
  : '';

// Escapes text and converts newline characters to HTML line breaks.
const lines = s => esc(s).replace(/\n/g, '<br>');

// Generates a specification row when a value exists.
// The optional wide argument applies a wide layout class.
const specRow = (k, v, wide) =>
  v ? `<div class="${wide ? 'wide' : ''}"><span>${k}:</span> ${esc(v)}</div>` : '';

// Builds the company registration-number text.
// Placeholder values beginning with "[" are excluded.
const regLine = sep => [
  /^\[/.test(COMPANY.tax) ? '' : `Tax Reg. No.: ${COMPANY.tax}`,
  /^\[/.test(COMPANY.commercial) ? '' : `Commercial Reg. No.: ${COMPANY.commercial}`
].filter(Boolean).join(sep);

// Returns the optional pump-image HTML block.
// If no image is available, it returns an empty string.
const pumpImageHTML = it => it.img
  ? `<div style="text-align:center;margin:2mm 0 3mm"><img src="${esc(it.img)}" alt="" style="max-height:42mm;max-width:70%;object-fit:contain"></div>`
  : '';

// Builds the quotation section for one item, including its heading,
// specifications, pump photo, price table (pump, local items, sub items),
// and subtotal.
function itemQuoteHTML(it, idx) {
  const c = calc(it);
  const rows = [];
  const f = num(it.flow);
  const h = num(it.head);

  // Add the main pump as a price-table row when pump information or price exists.
  if (it.partNo || it.desc || c.pumpUnit) {
    const pn = (it.partNo || '').trim();
    rows.push({
      desc: [pn ? `[${pn}]` : '', (it.desc || '').trim()].filter(Boolean).join(' ') || 'Pump',
      origin: it.origin || 'DAB',
      qty: c.pumpQty,
      price: c.pumpUnit,
      total: c.pumpTotal
    });
  }

  // Add additional local items to the same price table.
  c.locals
    .filter(l => l.desc || l.total)
    .forEach(l => rows.push({
      desc: l.desc || '—',
      origin: l.origin || 'DAB',
      qty: num(l.qty),
      price: num(l.price),
      total: l.total
    }));

  // Add sub items (accessories / spare parts / other) to the same price table.
  c.subs
    .filter(s => s.desc || s.partNo || s.total)
    .forEach(s => rows.push({
      desc: subLabel(s) || '—',
      origin: s.origin || '—',
      qty: num(s.qty),
      price: num(s.price),
      total: s.total,
      img: s.img
    }));

  // Convert flow into m³/h and retain the original entered value when applicable.
  const flowTxt = f
    ? `${trim2(toM3h(f, it.flowU))} m³/h` +
    (it.flowU !== 'm³/h' ? ` (entered ${trim2(f)} ${it.flowU})` : '')
    : '';

  // Convert head into metres and retain the original entered value when applicable.
  const headTxt = h
    ? `${trim2(toMeters(h, it.headU))} m` +
    (it.headU !== 'm' ? ` (entered ${trim2(h)} ${it.headU})` : '')
    : '';

  // Read duty and standby quantities.
  const d = Math.floor(num(it.duty));
  const s = Math.floor(num(it.standby));

  // Return the complete HTML block for this quotation item.
  return `<section class="q-block">
    <h4 class="q-h">${idx + 1}. ${esc(buildHeading(it))}</h4>
    <div class="q-spec">
      <span>${specRow('Pump Part No.', it.partNo)}${specRow('Pump Category', it.cat)}${specRow('Flow Rate', flowTxt)}${specRow('Head', headTxt)}</span>
      <span>${specRow('Drive', it.vfd ? 'Variable Speed (VFD)' : 'Fixed Speed')}${specRow('Duty / Standby', d || s ? `${d} Duty / ${s} Standby` : '')}${specRow('Pump Description', it.desc, true)}</span>
      <span>${pumpImageHTML(it)}</span>
    </div>
    <table>
      <thead>
        <tr>
          <th class="n">No.</th>
          <th>Description</th>
          <th class="n">Origin</th>
          <th class="n">Quantity</th>
          <th class="r">Unit Price (EGP)</th>
          <th class="r">Total (EGP)</th>
        </tr>
      </thead>
      <tbody>
        ${rows.length
      ? rows.map((r, i) => `<tr>
              <td class="n">${i + 1}</td>
              <td>${lines(r.desc)}${r.img ? `<div style="margin-top:1mm"><img src="${esc(r.img)}" alt="" style="max-height:18mm;max-width:30mm;object-fit:contain"></div>` : ''}</td>
              <td class="n">${lines(r.origin)}</td>
              <td class="n">${trim2(r.qty)}</td>
              <td class="r">${money(r.price)}</td>
              <td class="r">${money(r.total)}</td>
            </tr>`).join('')
      : '<tr><td colspan="6">No priced items entered.</td></tr>'}
      </tbody>
    </table>
    <div class="q-sub">Item ${idx + 1} Subtotal: ${money(c.subtotal)} EGP</div></section>`;
}

// Converts the editable terms and conditions into HTML paragraphs.
// Text before a colon is displayed in bold.
function termsHTML() {
  return state.terms
    .split('\n')
    .filter(l => l.trim())
    .map(l => {
      const m = l.match(/^([^:]{1,40}):\s*(.*)$/);
      return m
        ? `<p><b>${esc(m[1])}:</b> ${esc(m[2])}</p>`
        : `<p>${esc(l)}</p>`;
    })
    .join('');
}

// Quotation number printed on the document: the SO number plus "-N" once it is a revision
// (S12649, S12649-1, S12649-2 ...). It follows the Revision Number field, like the PDF file name.
const quoteNumber = () =>
  state.info.so.trim() + (revisionNumber() > 0 ? '-' + revisionNumber() : '');

// Converts the editable notes (e.g. the Arabic notes) into paragraphs.
// dir="auto" lets Arabic lines run right-to-left and align to the right.
function notesHTML() {
  return state.notes
    .split('\n')
    .filter(l => l.trim())
    .map(l => `<p dir="auto" style="text-align:start">${esc(l)}</p>`)
    .join('');
}

// Builds the complete quotation document preview.
// It includes the header, customer/project details, items, totals,
// terms and conditions, and company information footer.
function renderQuote() {
  const i = state.info;
  const reg = regLine(' · ');

  $('#quote').innerHTML = `
    <div class="q-top"><div class="q-brand"><img src="${logo.url}" alt="Company's Logo"></div>
      <div class="q-title">
        <p>
          Shira For Trade &amp; Agencies<br/>
          5 Khaled Ibn El Walid St - Sheraton Heliopolis Area<br/>
          Sheraton Heliopolis Egypt
        </p>
        <div><b>SO Number:</b> ${esc(quoteNumber())}</div><div><b>Date:</b> ${esc(fmtDate(i.date))}</div><div><b>Revision:</b> ${esc(i.rev || 0)}</div></div></div>
    <div class="q-cust">
      <div><span>Customer</span><b dir="auto">${esc(i.customer)}</b></div>
      <div><span>Project</span><span dir="auto" class="v">${esc(i.project)}</span></div>
      ${i.attn ? `<div><span>Attention</span><span class="v">${esc(i.attn)}</span></div>` : ''}
    </div>
    ${state.items.map(itemQuoteHTML).join('')}
    <section class="q-block">
      <table>
        <tbody>
          ${state.items.map((it, k) => `<tr>
            <td>Item ${k + 1} Subtotal</td>
            <td class="r">${money(calc(it).subtotal)} EGP</td>
          </tr>`).join('')}
          <tr>
            <td>Subtotal Before VAT</td>
            <td class="r">${money(totals().sub)} EGP</td>
          </tr>
          <tr>
            <td>VAT (${trim2(num(state.info.vat))}%)</td>
            <td class="r">${money(totals().vat)} EGP</td>
          </tr>
          <tr class="q-grand">
            <td>GRAND TOTAL INCLUDING VAT</td>
            <td class="r">${money(totals().total)} EGP</td>
          </tr>
        </tbody>
      </table>
    </section>
    <section class="q-block q-terms"><h3>Terms and Conditions</h3>${termsHTML()}</section>
    ${notesHTML() ? `<section class="q-block q-terms" style="border-top:1px solid #d5dae1;padding-top:6px">${notesHTML()}</section>` : ''}
    <div class="q-footer"><img src="${logo.url}" alt=""><div><b>${esc(COMPANY.name)}</b> · ${esc(COMPANY.website)}<br>${esc(COMPANY.address)}<br>${esc(COMPANY.phone)} · ${esc(COMPANY.email)}${reg ? '<br>' + esc(reg) : ''}</div></div>`;
}

// Makes the quotation preview visible and renders the latest quotation into it.
function showPreview() {
  $('#preview').hidden = false;
  renderQuote();
}

/* ==========================================================================
 * 11. LOGO LOADING AND UPLOAD
 * ========================================================================== */

// Creates a simple navy square logo containing "SG".
// It is used when the actual company logo cannot be loaded or converted.
function fallbackLogo() {
  const c = document.createElement('canvas');
  c.width = c.height = 200;

  const x = c.getContext('2d');
  x.fillStyle = '#0b2a4a';
  x.fillRect(0, 0, 200, 200);
  x.fillStyle = '#fff';
  x.font = 'bold 90px Arial';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('SG', 100, 106);

  return { url: c.toDataURL('image/png'), w: 200, h: 200 };
}

// Key used to store a user-uploaded replacement logo in localStorage.
const LOGO_KEY = 'shiraLogo';

// Retrieves the saved logo data URL, returning null if storage is unavailable.
const storedLogo = () => {
  try {
    return localStorage.getItem(LOGO_KEY);
  } catch (e) {
    return null;
  }
};

// Loads the uploaded logo or the default logo.
// Converts the image to a canvas-safe data URL and uses the fallback logo
// if loading or conversion fails.
function loadLogo() {
  return new Promise(resolve => {
    const img = new Image();

    // Convert the loaded image into a data URL that can be used by the PDF exporter.
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);

        resolve({ url: c.toDataURL('image/png'), w: c.width, h: c.height });
      } catch (e) {
        resolve({ ...fallbackLogo(), fallback: true });
      }
    };

    // Use the fallback logo if the image cannot be loaded.
    img.onerror = () => resolve({ ...fallbackLogo(), fallback: true });

    // Prefer the uploaded logo; otherwise use the default logo path.
    img.src = storedLogo() || LOGO_PATH;
  });
}

// Applies the loaded logo to the application.
// Updates the form image, hides/shows the fallback warning, and refreshes
// the quotation preview if it is currently visible.
function applyLogo(l) {
  logo = l;
  $('#logoImg').src = storedLogo() || LOGO_PATH;
  $('#logoNote').hidden = !l.fallback;

  if (!$('#preview').hidden) {
    renderQuote();
  }
}

// Handles uploading a replacement company logo.
// Resizes the image to a maximum width of 600 px, stores it in localStorage,
// and reloads the saved logo.
$('#logoFile').addEventListener('change', e => {
  const f = e.target.files[0];

  // Clear the file input so the same file can be selected again later.
  e.target.value = '';

  if (!f) return;

  const fr = new FileReader();

  // Continue after the browser has read the uploaded file.
  fr.onload = () => {
    const im = new Image();

    // Resize the logo and save it as a PNG data URL.
    im.onload = () => {
      const k = Math.min(1, 600 / im.width);
      const c = document.createElement('canvas');
      c.width = Math.round(im.width * k);
      c.height = Math.round(im.height * k);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);

      // Save the replacement logo, reporting an error if storage fails.
      try {
        localStorage.setItem(LOGO_KEY, c.toDataURL('image/png'));
      } catch (x) {
        alert('Could not store the logo.');
      }

      // Reload the saved logo and update the interface.
      loadLogo().then(applyLogo);
    };

    im.src = fr.result;
  };

  fr.readAsDataURL(f);
});

/* ==========================================================================
 * 12. SAVE AND OPEN QUOTATION FILES
 * ========================================================================== */

// Customer-safe copy of the quotation for embedding in the exported PDF. Every line keeps the price the customer
// was quoted (the tier price when one applied); the category and ALL tier prices are removed.
function publicState() {
  const s = JSON.parse(JSON.stringify(state));
  const clean = o => {
    const p = effPrice(o);
    o.price = p ? String(p) : '';
    delete o.priceT; delete o.priceC; delete o.priceE;
  };
  s.items.forEach(it => { clean(it); it.locals.forEach(clean); (it.subItems || []).forEach(clean); });
  delete s.tier;
  return s;
}

// Encodes the customer-safe quotation as a UTF-8-safe Base64 string (embedded in the exported PDF metadata).
const encodeState = () => btoa(unescape(encodeURIComponent(JSON.stringify(publicState()))));

// Validates and imports quotation data.
// Fills missing defaults, reads the SO number and revision from the uploaded
// file's name (suggesting the next revision), then refreshes the form and totals.
function importState(s, fileName) {
  if (!s || !s.info || !Array.isArray(s.items)) {
    throw new Error('This is not a quotation data file.');
  }

  // Fill missing values so older quotation files remain compatible.
  s.info.vat ??= '14';
  s.terms ??= DEFAULT_TERMS;
  s.notes ??= DEFAULT_NOTES;
  s.tier ??= '';

  // Ensure all imported items contain the expected fields (including sub items).
  s.items = s.items.map(normalizeItem);

  // Make the imported quotation the active application state.
  state = s;

  // Detect the quotation number and revision from the uploaded file name,
  // suggest the next revision, and let the user accept or change it.
  applyRevisionFromFileName(fileName);

  // Refresh the form, item cards, and calculated values.
  renderInfo();
  renderItems();
  refresh();
}

// Handles opening a saved JSON quotation or a PDF exported by this application.
// For PDFs, it attempts to extract the embedded quotation data from the metadata.
$('#openFile').addEventListener('change', async e => {
  const f = e.target.files[0];

  // Reset the file input so the same file can be selected again.
  e.target.value = '';

  if (!f) return;

  try {
    if (/\.pdf$/i.test(f.name)) {
      // Find the embedded SHIRAQ quotation data in the PDF bytes.
      const m = new TextDecoder('latin1')
        .decode(await f.arrayBuffer())
        .match(/SHIRAQ:([A-Za-z0-9+\/=]+)/);

      if (!m) {
        throw new Error(
          'This PDF has no editable data. Only PDFs exported from this tool can be re-opened.'
        );
      }

      // Decode the embedded data and import it into the application.
      importState(
        JSON.parse(decodeURIComponent(escape(atob(m[1])))),
        f.name
      );
    } else {
      // Read and import a standard JSON quotation file.
      importState(JSON.parse(await f.text()), f.name);
    }
  } catch (err) {
    alert('Could not open file: ' + err.message);
  }
});

// Downloads the current quotation state as a JSON file.
// The file can be stored as a backup and opened again later.
// It uses the same name as the PDF (SO number + revision), with a .json extension.
$('#saveData').addEventListener('click', () => {
  const a = document.createElement('a');

  a.href = URL.createObjectURL(
    new Blob([JSON.stringify(state)], { type: 'application/json' })
  );
  a.download = pdfFileName('json');
  a.click();

  // Release the temporary object URL after triggering the download.
  URL.revokeObjectURL(a.href);
});

/* ==========================================================================
 * 13. PDF FOOTER, FILE NAME / REVISION NUMBERING, AND EXPORT
 * ========================================================================== */

// Draws the company footer and page number on every generated PDF page.
// The footer includes the logo, company details, registration numbers,
// and page numbering.
function drawFooters(pdf) {
  const pages = pdf.internal.getNumberOfPages();
  const W = 210;
  const reg = regLine('  |  ');

  // Add the footer to every page of the generated PDF.
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p);

    // Draw a horizontal line above the footer.
    pdf.setDrawColor(11, 42, 74);
    pdf.setLineWidth(0.6);
    pdf.line(10, 268, W - 10, 268);

    // Calculate logo dimensions while preserving its aspect ratio.
    const lh = 14;
    const lw = Math.min(30, lh * logo.w / logo.h);

    // Add the company logo to the footer.
    try {
      pdf.addImage(logo.url, 'PNG', 10, 271, lw, lh);
    } catch (e) {
      // Continue without the footer logo if adding the image fails.
    }

    const x = 10 + lw + 5;

    // Set footer font size and text color.
    pdf.setFontSize(8);
    pdf.setTextColor(60, 70, 85);

    // Print the company name and website in bold.
    pdf.setFont('helvetica', 'bold');
    pdf.text(`${COMPANY.name}  |  ${COMPANY.website}`, x, 274);

    // Print the remaining company details in regular font.
    pdf.setFont('helvetica', 'normal');
    pdf.text(COMPANY.address, x, 278);
    pdf.text(`${COMPANY.phone}  |  ${COMPANY.email}`, x, 282);

    // Print registration numbers when actual values have been provided.
    if (reg) {
      pdf.text(reg, x, 286);
    }

    // Print the current page number and total page count.
    pdf.text(`Page ${p} of ${pages}`, W - 10, 286, { align: 'right' });
  }
}

/* ---- PDF file name & revision numbering ----
   File name = prefix + SO number + (revision > 0 ? "-" + revision : "") + ".pdf"
   Revision 0 (original):  Shira_Quotation_S12205.pdf
   Revision 1:             Shira_Quotation_S12205-1.pdf
   The revision comes ONLY from the "Revision Number" field. When an old quotation
   is opened, that field is filled from the uploaded file's name (+1) and the user
   can change it. Nothing is stored anywhere to track revisions (no localStorage /
   sessionStorage / database), so it works the same on every PC. */

// Set to 'ShiraGroup_Quotation_' if new quotations should use the long prefix.
const PDF_PREFIX = 'Shira_Quotation_';

// Follows the prefix of the last uploaded file (kept in memory only).
let pdfPrefix = PDF_PREFIX;

// Makes the SO number safe for use in a file name.
const exportKey = so => so.trim().replace(/[^\w-]+/g, '_');

// Revision number from the form: whole number, 0 when blank or invalid.
const revisionNumber = () => Math.floor(num(state.info.rev));

// Builds the download name, e.g. Shira_Quotation_S12205-2.pdf
// (ext 'json' is used for the data file).
function pdfFileName(ext = 'pdf') {
  const rev = revisionNumber();
  return `${pdfPrefix}${exportKey(state.info.so) || 'draft'}${rev > 0 ? '-' + rev : ''}.${ext}`;
}

// Splits "ShiraGroup_Quotation_S12205-2.pdf" into { prefix, so: 'S12205', rev: 2 };
// returns null if not recognised.
// Accepts both prefixes, an optional "-N" revision, and the " (1)" a browser
// may add to a repeated download.
const FILE_NAME_RE = /^(Shira(?:Group)?_Quotation_)(.+?)(?:-(\d+))?(?:\s\(\d+\))?\.(?:pdf|json)$/i;

function parseQuotationFileName(fileName) {
  const m = FILE_NAME_RE.exec(String(fileName || '').trim());

  if (!m || !m[2].trim()) return null;

  return {
    prefix: /^shiragroup/i.test(m[1]) ? 'ShiraGroup_Quotation_' : 'Shira_Quotation_',
    so: m[2].trim(),
    rev: m[3] ? parseInt(m[3], 10) : 0
  };
}

// Called after an old quotation is opened: reads SO + revision from the file name,
// suggests revision + 1, and lets the user accept it or type another whole number
// (manual choice overrides the suggestion).
function applyRevisionFromFileName(fileName) {
  const parsed = parseQuotationFileName(fileName);

  if (!parsed) {
    alert(
      `The quotation number could not be read from "${fileName}".\n` +
      'Expected a name like ShiraGroup_Quotation_S12205.pdf or ShiraGroup_Quotation_S12205-1.pdf.\n' +
      'The quotation was loaded, but its revision was not changed – set the Revision Number manually.'
    );
    return;
  }

  const suggested = parsed.rev + 1;
  const answer = prompt(
    `Quotation ${parsed.so} (current revision ${parsed.rev}).\n` +
    `New revision number – press OK to accept ${suggested}, or type another whole number:`,
    String(suggested)
  );

  let chosen = suggested;

  if (answer !== null && answer.trim() !== '') {
    const n = Number(answer.trim());

    if (Number.isInteger(n) && n >= 0) {
      chosen = n;
    } else {
      alert(`"${answer}" is not a valid revision number, so ${suggested} will be used.`);
    }
  }

  pdfPrefix = parsed.prefix;
  state.info.so = parsed.so;
  state.info.rev = String(chosen);
}

// Shows the file name that "Export PDF" will use, so the user can see
// the effect of the Revision Number.
function updateFileNameNote() {
  const el = $('#fileNameNote');

  if (!el) return;

  el.innerHTML = state.info.so.trim()
    ? `PDF file name: <b>${esc(pdfFileName())}</b> &nbsp;(change the Revision Number to change it)`
    : 'Enter an SO Number to see the PDF file name.';
}

/* On phones/tablets the A4-wide preview is scaled down to fit the screen, so the
   page never scrolls sideways. The scale is removed while exporting, so the PDF
   is always full size. */
function fitPreview() {
  const q = $('#quote'), wrap = q && q.parentElement;

  if (!q || $('#preview').hidden) return;

  q.style.transform = 'none';
  q.style.margin = '';
  wrap.style.height = '';

  const k = Math.min(1, (wrap.clientWidth - 20) / q.offsetWidth);

  if (k < 1) {
    q.style.transformOrigin = 'top left';
    q.style.margin = '0';
    q.style.transform = `scale(${k})`;
    wrap.style.height = Math.ceil(q.offsetHeight * k + 20) + 'px';
  }
}

window.addEventListener('resize', fitPreview);

// Validates required fields, loads the logo, renders the quotation,
// exports it as an A4 PDF, adds footers and embedded quotation data,
// and restores the interface after the export completes.
async function exportPdf() {
  const i = state.info;

  // Require the SO number and customer company name before exporting.
  if (!i.so.trim() || !i.customer.trim()) {
    return alert(
      'Please enter the SO Number and Customer Company Name before exporting.'
    );
  }

  // Require at least one quotation item.
  if (!state.items.length) {
    return alert('Add at least one item.');
  }

  // Check that the PDF generation library is available.
  if (typeof html2pdf === 'undefined') {
    return alert(
      'PDF library not loaded. Check your internet connection and reload.'
    );
  }

  // Load the latest logo and prepare the quotation preview.
  logo = await loadLogo();
  showPreview();

  const el = $('#quote');
  const btn = $('#exportBtn');

  // Apply export styling and disable the button while exporting.
  el.style.transform = 'none';
  el.classList.add('exporting');
  btn.disabled = true;
  btn.textContent = 'Exporting…';

  try {
    // Configure and generate the PDF.
    await html2pdf().set({
      // Margins in millimetres: top, left, bottom, right.
      // The bottom margin reserves space for the repeated footer.
      margin: [12, 6, 30, 6],

      // File name from the SO number and revision, e.g. Shira_Quotation_S12205-1.pdf.
      filename: pdfFileName(),

      // Configure image quality for the PDF.
      image: { type: 'jpeg', quality: 0.98 },

      // Configure HTML-to-canvas rendering.
      html2canvas: { scale: 2, useCORS: true, scrollY: 0 },

      // Configure the PDF page format and orientation.
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },

      // Avoid splitting quotation item sections and table rows where possible.
      pagebreak: { mode: ['css', 'legacy'], avoid: ['.q-block', 'tr'] }
    })
      .from(el)
      .toPdf()
      .get('pdf')
      .then(pdf => {
        // Add the company footer to every page.
        drawFooters(pdf);

        // Store quotation data in the PDF metadata so the app can attempt
        // to reopen the quotation later.
        pdf.setProperties({
          title: `Quotation ${quoteNumber()}`,
          keywords: 'SHIRAQ:' + encodeState()
        });
      })
      .save();
  } catch (err) {
    // Inform the user if PDF generation fails.
    alert('PDF export failed: ' + err.message);
  } finally {
    // Restore the normal interface whether export succeeds or fails.
    el.classList.remove('exporting');
    btn.disabled = false;
    btn.textContent = 'Export PDF';

    // Refresh the quotation document after the export.
    renderQuote();
    fitPreview();
  }
}

/* ==========================================================================
 * 14. APPLICATION INITIALIZATION
 * ========================================================================== */

// Initializes the application by filling the form, rendering quotation items,
// updating totals, and loading the company logo.
function init() {
  renderInfo();
  renderItems();
  refresh();

  // Apply the loaded logo once it is ready.
  loadLogo().then(applyLogo);
}

// Starts the quotation generator after the JavaScript file has loaded.
init();