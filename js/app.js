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

// Pump categories offered in the item form (also used to validate the category read from the price list).
const PUMP_CATS = ['Vertical Pump', 'Horizontal Pump', 'Submersible Pump', 'Self-Priming Pump', 'Circulation Pump'];

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
    ${partField('data-sf', 'Part Number', s)}
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
      ${select('cat', 'Pump Category', PUMP_CATS, it.cat)}</div>
    <div class="group"><h4>Pump information</h4><div class="grid">
      ${partField('data-f', 'Pump Part Number', it)}${field('desc', 'Pump Description', it.desc)}${numField('price', 'Pump Unit Price (EGP)', it.price)}
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
// Builds the price-table rows of one item (pump, local items, sub items). Shared by the HTML preview and the PDF export
// so both always show the same descriptions, quantities and prices.
function itemRows(it, c) {
  const rows = [];
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

  return rows;
}

// Builds the quotation section for one item, including its heading,
// specifications, pump photo, price table (pump, local items, sub items),
// and subtotal.
function itemQuoteHTML(it, idx) {
  const c = calc(it);
  const rows = itemRows(it, c);
  const f = num(it.flow);
  const h = num(it.head);

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
      // Read the embedded quotation data (new and older PDFs) and import it into the application.
      importState(await extractQuotationPayload(await f.arrayBuffer()), f.name);
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

/* ==========================================================================
 * 13B. NATIVE TEXT PDF EXPORT AND PDF DATA EXTRACTION (pdf-lib)
 * ========================================================================== */

// A4 page geometry in PDF points (1 mm = 2.835 pt): margins, and the bottom area reserved for the footer.
const PG = { w: 595.28, h: 841.89, ml: 28, mr: 28, mt: 32, mb: 84 };

// Matches Arabic / Hebrew characters (used to choose right-to-left drawing).
const RTL_RE = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

// Splits a line into Latin/number runs (odd items) and the text between them (even items).
const LTR_RUN = /([A-Za-z0-9][A-Za-z0-9.,%:/+\-_()@#&]*)/;

// Set to true only if Arabic comes out with its letters in reversed order in the exported PDF (see the notes).
const ARABIC_REVERSE = false;

// Decodes a Base64 string or a data URL into bytes.
const b64ToBytes = s => Uint8Array.from(atob(String(s).split(',').pop()), c => c.charCodeAt(0));

// Reads the editable quotation data embedded in a PDF. New PDFs are parsed with pdf-lib (Keywords field);
// PDFs exported by the older version are also found by searching the raw bytes. Throws a clear error otherwise.
async function extractQuotationPayload(buf) {
  const find = s => /SHIRAQ:([A-Za-z0-9+\/=]+)/.exec(s || '');
  let m = null;

  if (typeof PDFLib !== 'undefined') {
    try {
      const doc = await PDFLib.PDFDocument.load(buf, { updateMetadata: false, ignoreEncryption: true });
      m = find(doc.getKeywords());
    } catch (e) {
      // Not parsable by pdf-lib: fall back to the raw search below.
    }
  }

  if (!m) m = find(new TextDecoder('latin1').decode(buf));

  if (!m) {
    throw new Error('This PDF has no editable quotation data. Only PDFs exported from this tool can be re-opened.');
  }

  try {
    return JSON.parse(decodeURIComponent(escape(atob(m[1]))));
  } catch (e) {
    throw new Error('The quotation data inside this PDF is damaged and could not be read.');
  }
}

// Builds the quotation as a native-text PDF (selectable, searchable, vector) and returns its bytes.
// Layout is done here (wrapping, tables, pagination, footer); nothing is rendered to an image except real photos/logo.
async function buildQuotationPdf() {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const pdf = await PDFDocument.create();
  const RGB = (r, g, b) => rgb(r / 255, g / 255, b / 255);
  const C = { navy: RGB(11, 42, 74), ink: RGB(28, 39, 51), mute: RGB(91, 103, 117), line: RGB(196, 204, 215),
              panel: RGB(241, 244, 248), head: RGB(227, 233, 241), white: RGB(255, 255, 255) };

  // Fonts: embedded Unicode fonts (needs fontkit + js/fonts.js); plain Helvetica only if those are missing.
  let F;
  if (typeof fontkit !== 'undefined' && typeof PDF_FONT_REGULAR_B64 !== 'undefined') {
    pdf.registerFontkit(fontkit);
    F = {
      r: await pdf.embedFont(b64ToBytes(PDF_FONT_REGULAR_B64), { subset: true }),
      b: await pdf.embedFont(b64ToBytes(PDF_FONT_BOLD_B64), { subset: true })
    };
  } else {
    F = { r: await pdf.embedFont(StandardFonts.Helvetica), b: await pdf.embedFont(StandardFonts.HelveticaBold) };
  }

  // Embed every real image once (logo, pump photos, sub-item photos).
  const imgs = new Map();
  const addImg = async url => {
    if (!url || imgs.has(url)) return;
    try {
      const bytes = b64ToBytes(url);
      imgs.set(url, /^data:image\/png/i.test(url) ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes));
    } catch (e) {
      imgs.set(url, null);
    }
  };
  await addImg(logo.url);
  for (const it of state.items) {
    await addImg(it.img);
    for (const s of it.subItems) await addImg(s.img);
  }

  const W = PG.w - PG.ml - PG.mr;
  const pages = [];
  let page, y;

  // Converts a distance from the top of the page to a PDF y coordinate.
  const top = v => PG.h - v;

  // Starts a new page and puts the cursor at the top margin.
  const newPage = () => { page = pdf.addPage([PG.w, PG.h]); pages.push(page); y = PG.mt; };

  // Starts a new page when less than h points remain above the footer; returns true if it did.
  const need = h => { if (PG.h - PG.mb - y < h) { newPage(); return true; } return false; };

  // Width of a text in points.
  const wd = (s, f, z) => f.widthOfTextAtSize(s, z);

  // True when the first letter of the text is Arabic/Hebrew (paragraph runs right to left).
  const isRtl = s => { const m = String(s).match(/\p{L}/u); return !!m && RTL_RE.test(m[0]); };

  // Splits a word that is wider than the box into pieces that fit.
  const breakWord = (w, f, z, maxW) => {
    const out = []; let cur = '';
    for (const ch of w) { if (cur && wd(cur + ch, f, z) > maxW) { out.push(cur); cur = ''; } cur += ch; }
    return out.concat(cur);
  };

  // Wraps text (explicit line breaks kept) into lines no wider than maxW.
  const wrap = (str, f, z, maxW) => {
    const out = [];
    String(str ?? '').split('\n').forEach(par => {
      let cur = '';
      par.split(' ').forEach(word => {
        const t = cur ? cur + ' ' + word : word;
        if (!cur || wd(t, f, z) <= maxW) { cur = t; return; }
        out.push(cur); cur = word;
      });
      out.push(cur);
    });
    return out.flatMap(l => (wd(l, f, z) > maxW && !l.includes(' ')) ? breakWord(l, f, z, maxW) : [l]);
  };

  // Draws one line of text inside a box (x = left edge, boxW = width). Arabic runs and Latin/number runs are
  // placed in the right visual order: right-to-left paragraphs start at the right edge.
  const drawLine = (s, x, base, z, f, col, align = 'l', boxW = 0) => {
    s = String(s ?? '');
    if (!s) return;
    let parts = [s];
    const rtl = isRtl(s);
    if (RTL_RE.test(s)) parts = s.split(LTR_RUN).filter(p => p !== '');
    const seg = p => (ARABIC_REVERSE && RTL_RE.test(p) && !LTR_RUN.test(p)) ? [...p].reverse().join('') : p;
    const widths = parts.map(p => wd(seg(p), f, z));
    const total = widths.reduce((a, b) => a + b, 0);
    let start = align === 'r' ? x + boxW - total : align === 'c' ? x + (boxW - total) / 2 : x;
    if (rtl) {
      let cur = start + total;
      parts.forEach((p, k) => { cur -= widths[k]; page.drawText(seg(p), { x: cur, y: base, size: z, font: f, color: col }); });
    } else {
      parts.forEach((p, k) => { page.drawText(seg(p), { x: start, y: base, size: z, font: f, color: col }); start += widths[k]; });
    }
  };

  // Draws a wrapped paragraph at the cursor (right-aligned when it is Arabic) and moves the cursor down.
  // nb = true skips automatic page breaks (used inside blocks whose height was reserved beforehand).
  const para = (str, x, w, z, f, col, lh, nb) => {
    const rtl = isRtl(str);
    wrap(str, f, z, w).forEach(l => {
      if (!nb) need(lh);
      drawLine(l, x, top(y + z), z, f, col, rtl ? 'r' : 'l', w);
      y += lh;
    });
  };

  // Draws "Label: text" with a bold label and wrapped text (the text before a colon is bold).
  const flowLabel = (label, text, x, w, z, lh, lcol, nb) => {
    const lw = wd(label, F.b, z) + 3;
    const words = String(text).split(' ');
    let line = '', i = 0;
    while (i < words.length) {
      const t = line ? line + ' ' + words[i] : words[i];
      if (line && wd(t, F.r, z) > w - lw) break;
      line = t; i++;
    }
    if (!nb) need(lh);
    drawLine(label, x, top(y + z), z, F.b, lcol, 'l', w);
    drawLine(line, x + lw, top(y + z), z, F.r, C.ink, 'l', w - lw);
    y += lh;
    const rest = words.slice(i).join(' ');
    if (rest) para(rest, x, w, z, F.r, C.ink, lh, nb);
  };

  // Draws a filled rectangle (optionally with a border) given its top-left corner.
  const box = (x, topY, w, h, fill, border) =>
    page.drawRectangle({ x, y: top(topY + h), width: w, height: h, color: fill, borderColor: border, borderWidth: border ? 0.5 : 0 });

  // Scales an embedded image to fit inside maxW x maxH.
  const fit = (im, maxW, maxH) => { const k = Math.min(maxW / im.width, maxH / im.height, 1); return { w: im.width * k, h: im.height * k }; };

  // ---------- header ----------
  newPage();
  const logoImg = imgs.get(logo.url);
  let hdrH = 0;
  if (logoImg) {
    const d = fit(logoImg, 190, 62);
    page.drawImage(logoImg, { x: PG.ml, y: top(y + d.h), width: d.w, height: d.h });
    hdrH = d.h;
  }
  const info = state.info;
  const right = PG.w - PG.mr;
  let ry = y;
  ['Shira For Trade & Agencies', '5 Khaled Ibn El Walid St - Sheraton Heliopolis Area', 'Sheraton Heliopolis Egypt'].forEach(t => {
    drawLine(t, PG.ml, top(ry + 8), 8, F.r, C.mute, 'r', W); ry += 11;
  });
  ry += 3;
  [['SO Number:', quoteNumber()], ['Date:', fmtDate(info.date)], ['Revision:', String(info.rev || 0)]].forEach(([k, v]) => {
    const vw = wd(v, F.r, 9.5);
    drawLine(v, right - vw, top(ry + 9.5), 9.5, F.r, C.ink);
    drawLine(k, right - vw - 4 - wd(k, F.b, 9.5), top(ry + 9.5), 9.5, F.b, C.ink);
    ry += 13;
  });
  y = Math.max(y + hdrH, ry) + 8;
  page.drawLine({ start: { x: PG.ml, y: top(y) }, end: { x: right, y: top(y) }, thickness: 2, color: C.navy });
  y += 12;

  // ---------- customer box ----------
  const cust = [['Customer', info.customer, true], ['Project', info.project, false]];
  if (info.attn) cust.push(['Attention', info.attn, false]);
  const custH = cust.length * 15 + 12;
  box(PG.ml, y, W, custH, C.panel);
  box(PG.ml, y, 3, custH, C.navy);
  cust.forEach(([k, v, bold], n) => {
    const base = top(y + 14 + n * 15);
    drawLine(k, PG.ml + 12, base, 9, F.r, C.mute);
    drawLine(v, PG.ml + 95, base, 9.5, bold ? F.b : F.r, C.ink, isRtl(v) ? 'r' : 'l', W - 105);
  });
  y += custH + 14;

  // ---------- price table ----------
  const COLS = [{ w: 26, a: 'c', h: 'No.' }, { w: 0, a: 'l', h: 'Description' }, { w: 58, a: 'c', h: 'Origin' },
                { w: 46, a: 'c', h: 'Quantity' }, { w: 76, a: 'r', h: 'Unit Price (EGP)' }, { w: 80, a: 'r', h: 'Total (EGP)' }];
  COLS[1].w = W - COLS.reduce((a, c) => a + c.w, 0);

  // Draws the table header row (repeated on every page the table continues on).
  const tableHead = () => {
    let x = PG.ml;
    COLS.forEach(c => { box(x, y, c.w, 20, C.head, C.line); drawLine(c.h, x + 4, top(y + 13.5), 8, F.b, C.navy, c.a, c.w - 8); x += c.w; });
    y += 20;
  };

  // Calculates the height of a table row (text lines or image, whichever is taller).
  const rowInfo = (r, n) => {
    const cells = [String(n), r.desc, r.origin, trim2(r.qty), money(r.price), money(r.total)];
    const lines = wrap(cells[1], F.r, 8.5, COLS[1].w - 8);
    const sub = r.img && imgs.get(r.img) ? fit(imgs.get(r.img), 85, 51) : null;
    const oLines = wrap(cells[2], F.r, 8.5, COLS[2].w - 8);
    const h = Math.max(lines.length * 11 + (sub ? sub.h + 4 : 0), oLines.length * 11, 11) + 9;
    return { cells, lines, oLines, sub, h };
  };

  // Draws one table row at the cursor.
  const drawRow = (r, n) => {
    const ri = rowInfo(r, n);
    let x = PG.ml;
    COLS.forEach((c, k) => { box(x, y, c.w, ri.h, undefined, C.line); x += c.w; });
    x = PG.ml;
    COLS.forEach((c, k) => {
      if (k === 1) {
        const rtl = isRtl(r.desc);
        ri.lines.forEach((l, i) => drawLine(l, x + 4, top(y + 12 + i * 11), 8.5, F.r, C.ink, rtl ? 'r' : 'l', c.w - 8));
        if (ri.sub) page.drawImage(imgs.get(r.img), { x: x + 4, y: top(y + 6 + ri.lines.length * 11 + ri.sub.h), width: ri.sub.w, height: ri.sub.h });
      } else if (k === 2) {
        ri.oLines.forEach((l, i) => drawLine(l, x + 4, top(y + 12 + i * 11), 8.5, F.r, C.ink, 'c', c.w - 8));
      } else {
        drawLine(ri.cells[k], x + 4, top(y + 12), 8.5, F.r, C.ink, c.a, c.w - 8);
      }
      x += c.w;
    });
    y += ri.h;
  };

  // ---------- items ----------
  state.items.forEach((it, idx) => {
    const c = calc(it);
    const rows = itemRows(it, c);
    const f = num(it.flow), h = num(it.head);
    const flowTxt = f ? `${trim2(toM3h(f, it.flowU))} m³/h` + (it.flowU !== 'm³/h' ? ` (entered ${trim2(f)} ${it.flowU})` : '') : '';
    const headTxt = h ? `${trim2(toMeters(h, it.headU))} m` + (it.headU !== 'm' ? ` (entered ${trim2(h)} ${it.headU})` : '') : '';
    const d = Math.floor(num(it.duty)), s = Math.floor(num(it.standby));
    const colA = [['Pump Part No.:', it.partNo], ['Pump Category:', it.cat], ['Flow Rate:', flowTxt], ['Head:', headTxt]].filter(r => r[1]);
    const colB = [['Drive:', it.vfd ? 'Variable Speed (VFD)' : 'Fixed Speed'], ['Duty / Standby:', d || s ? `${d} Duty / ${s} Standby` : ''], ['Pump Description:', it.desc]].filter(r => r[1]);
    const pumpIm = it.img && imgs.get(it.img) ? fit(imgs.get(it.img), 110, 100) : null;
    const colW = (W - (pumpIm ? 120 : 0) - 16) / 2;
    const linesOf = col => col.reduce((n, r) => n + wrap(r[0] + ' ' + r[1], F.r, 8.5, colW).length, 0);
    const specH = Math.max(linesOf(colA), linesOf(colB)) * 11.5 + 6;
    const headLines = wrap(`${idx + 1}. ${buildHeading(it)}`, F.b, 10, W - 20);
    const headH = headLines.length * 13 + 10;
    const specBlock = Math.max(specH, pumpIm ? pumpIm.h + 6 : 0);

    // Keep the heading, details, table header and the first row together on one page.
    need(headH + 6 + specBlock + 20 + (rows.length ? rowInfo(rows[0], 1).h : 20));

    box(PG.ml, y, W, headH, C.navy);
    headLines.forEach((l, i) => drawLine(l, PG.ml + 10, top(y + 7 + 10 + i * 13 - 2), 10, F.b, C.white, isRtl(l) ? 'r' : 'l', W - 20));
    y += headH + 6;

    const y0 = y;
    [[colA, PG.ml], [colB, PG.ml + colW + 16]].forEach(([col, x]) => {
      y = y0;
      col.forEach(([k, v]) => flowLabel(k, v, x, colW, 8.5, 11.5, C.mute, true));
    });
    if (pumpIm) page.drawImage(imgs.get(it.img), { x: right - pumpIm.w, y: top(y0 + pumpIm.h), width: pumpIm.w, height: pumpIm.h });
    y = y0 + specBlock;

    tableHead();
    if (!rows.length) { box(PG.ml, y, W, 20, undefined, C.line); drawLine('No priced items entered.', PG.ml + 4, top(y + 13), 8.5, F.r, C.ink); y += 20; }
    rows.forEach((r, n) => {
      if (need(rowInfo(r, n + 1).h)) tableHead();
      drawRow(r, n + 1);
    });

    // Item subtotal strip.
    need(24);
    box(PG.ml, y, W, 20, C.panel, C.line);
    const stx = `Item ${idx + 1} Subtotal: ${money(c.subtotal)} EGP`;
    drawLine(stx, PG.ml, top(y + 13.5), 9, F.b, C.navy, 'r', W - 6);
    y += 20 + 16;
  });

  // ---------- totals ----------
  const t = totals();
  const trows = state.items.map((it, k) => [`Item ${k + 1} Subtotal`, `${money(calc(it).subtotal)} EGP`])
    .concat([['Subtotal Before VAT', `${money(t.sub)} EGP`], [`VAT (${trim2(num(state.info.vat))}%)`, `${money(t.vat)} EGP`]]);
  need(trows.length * 19 + 28 + 10);
  trows.forEach(([k, v]) => {
    box(PG.ml, y, W, 19, undefined, C.line);
    drawLine(k, PG.ml + 6, top(y + 13), 9, F.r, C.ink);
    drawLine(v, PG.ml, top(y + 13), 9, F.r, C.ink, 'r', W - 6);
    y += 19;
  });
  box(PG.ml, y, W, 28, C.navy);
  drawLine('GRAND TOTAL INCLUDING VAT', PG.ml + 6, top(y + 18), 10.5, F.b, C.white);
  drawLine(`${money(t.total)} EGP`, PG.ml, top(y + 18), 10.5, F.b, C.white, 'r', W - 6);
  y += 28 + 18;

  // ---------- terms and conditions ----------
  need(40);
  drawLine('Terms and Conditions', PG.ml, top(y + 11), 11, F.b, C.navy);
  y += 16;
  page.drawLine({ start: { x: PG.ml, y: top(y) }, end: { x: right, y: top(y) }, thickness: 1.5, color: C.navy });
  y += 8;
  state.terms.split('\n').filter(l => l.trim()).forEach(l => {
    const m = l.match(/^([^:]{1,40}):\s*(.*)$/);
    if (m) flowLabel(m[1] + ':', m[2], PG.ml, W, 9, 12.5, C.ink); else para(l, PG.ml, W, 9, F.r, C.ink, 12.5);
    y += 2;
  });

  // ---------- notes (Arabic supported, right-to-left) ----------
  const noteLines = state.notes.split('\n').filter(l => l.trim());
  if (noteLines.length) {
    y += 8; need(30);
    page.drawLine({ start: { x: PG.ml, y: top(y) }, end: { x: right, y: top(y) }, thickness: 0.5, color: C.line });
    y += 10;
    noteLines.forEach(l => { para(l, PG.ml, W, 9.5, F.r, C.ink, 15); });
  }

  // ---------- footer + page numbers on every page ----------
  const reg = regLine('  |  ');
  pages.forEach((pg, n) => {
    page = pg;
    const base = 74;
    pg.drawLine({ start: { x: PG.ml, y: base }, end: { x: right, y: base }, thickness: 1, color: C.navy });
    let tx = PG.ml;
    if (logoImg) { const d = fit(logoImg, 80, 30); pg.drawImage(logoImg, { x: PG.ml, y: base - 8 - d.h, width: d.w, height: d.h }); tx = PG.ml + d.w + 12; }
    [[`${COMPANY.name}  |  ${COMPANY.website}`, F.b], [COMPANY.address, F.r], [`${COMPANY.phone}  |  ${COMPANY.email}`, F.r], [reg, F.r]]
      .filter(r => r[0]).forEach(([s, f], i) => drawLine(s, tx, base - 18 - i * 10, 7.5, f, i ? C.mute : C.ink));
    const pt = `Page ${n + 1} of ${pages.length}`;
    drawLine(pt, PG.ml, base - 18, 8, F.r, C.mute, 'r', W);
  });

  // ---------- metadata: title + the editable (customer-safe) quotation data ----------
  pdf.setTitle(`Quotation ${quoteNumber()}`);
  pdf.setAuthor(COMPANY.name);
  pdf.setCreator('Shira Group Quotation Generator');
  pdf.setProducer('pdf-lib');
  pdf.setKeywords(['SHIRAQ:' + encodeState()]);

  return pdf.save({ useObjectStreams: false });
}

// Validates required fields, loads the logo, builds the native-text PDF and downloads it
// (file name from the SO number and revision), then restores the interface.
async function exportPdf() {
  const i = state.info;

  // Require the SO number and customer company name before exporting.
  if (!i.so.trim() || !i.customer.trim()) {
    return alert('Please enter the SO Number and Customer Company Name before exporting.');
  }

  // Require at least one quotation item.
  if (!state.items.length) {
    return alert('Add at least one item.');
  }

  // Check that the PDF library is available.
  if (typeof PDFLib === 'undefined') {
    return alert('PDF library not loaded. Check your internet connection and reload.');
  }

  // Load the latest logo and keep the HTML preview in sync.
  logo = await loadLogo();
  showPreview();

  const btn = $('#exportBtn');
  btn.disabled = true;
  btn.textContent = 'Exporting…';

  try {
    const bytes = await buildQuotationPdf();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    a.download = pdfFileName();
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch (err) {
    alert('PDF export failed: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Export PDF';
    renderQuote();
    fitPreview();
  }
}

/* ==========================================================================
 * 15. PART-NUMBER PRICE LIST (Excel / CSV lookup)
 * ========================================================================== */

// The loaded price list. It is kept in memory only, so load it again after reloading the page.
// Quotations keep a copy of the data they were filled with, so reopening one never re-prices it.
let priceList = null;

// Short messages shown under part-number fields, keyed by item / sub-item id (not saved with the quotation).
const pnNotes = {};

// Generates a part-number input with suggestions from the loaded price list and a small status line.
const partField = (attr, label, o) => {
  const n = pnNotes[o.id];
  return `<label>${label}<input ${attr}="partNo" list="pnList" autocomplete="off" value="${esc(o.partNo)}">` +
    `<small class="pn-note" style="font-weight:400;color:${n && n.ok ? '#1d6b2e' : '#a32727'}">${n ? esc(n.text) : ''}</small></label>`;
};

// Normalizes a part number so "k 40/800", "K-40-800" and "K40800" match each other.
const pnKey = v => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// Normalizes a column heading so "Price_Trader (EGP)" and "price trader" are recognized as the same column.
const hdrKey = h => String(h ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Cleans a text cell, and a price/number cell (blank unless it is a positive number).
const cellText = v => String(v ?? '').trim();
const cellNum = v => {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return isFinite(n) && n > 0 ? String(n) : '';
};

// Builds the part-number index from the rows of the price-list sheet (one object per row, keyed by column heading).
// Recognized headings: PartNo, Description, ProductType, PumpCategory, Origin, Flow_m3h, Head_m,
// Price_Trader, Price_Contractor, Price_EndUser (extra columns are ignored).
function setPriceList(rows, fileName) {
  const keys = rows.length ? Object.keys(rows[0]) : [];
  const find = (...p) => keys.find(k => p.some(x => hdrKey(k).includes(x)));
  const col = {
    part: find('partno', 'partnumber') || find('part'),
    desc: find('description', 'desc'),
    type: find('producttype'),
    cat: find('pumpcategory', 'category'),
    origin: find('origin'),
    flow: find('flow'),
    head: find('head'),
    t: find('pricetrader'),
    c: find('pricecontractor'),
    e: find('priceenduser')
  };

  if (!col.part) throw new Error('The sheet needs a "PartNo" column.');
  if (!col.desc && !col.t && !col.c && !col.e) {
    throw new Error('The sheet needs a Description column or price columns (Price_Trader, Price_Contractor, Price_EndUser).');
  }

  const map = new Map();
  let dups = 0, skipped = 0;

  rows.forEach(r => {
    const part = cellText(r[col.part]);
    if (!part) { skipped++; return; }

    const key = pnKey(part);
    if (map.has(key)) { dups++; return; }          // the first row of a duplicated part number wins

    map.set(key, {
      part,
      desc: cellText(r[col.desc]),
      type: cellText(r[col.type]),
      cat: cellText(r[col.cat]),
      origin: cellText(r[col.origin]),
      flow: cellNum(r[col.flow]),
      head: cellNum(r[col.head]),
      t: cellNum(r[col.t]),
      c: cellNum(r[col.c]),
      e: cellNum(r[col.e])
    });
  });

  if (!map.size) throw new Error('No part numbers found in the price list.');

  priceList = { name: fileName, map, dups, skipped };

  // Suggestions shown while typing a part number.
  $('#pnList').innerHTML = [...map.values()]
    .map(r => `<option value="${esc(r.part)}" label="${esc(r.desc)}"></option>`).join('');

  // Part numbers typed before the list was loaded are looked up now (only items with no description or price yet).
  state.items.forEach(it => {
    [[it, true], ...it.subItems.map(s => [s, false])].forEach(([o, isPump]) => {
      const n = pnNotes[o.id];
      const row = n && n.needsList && !o.desc && !o.price && map.get(pnKey(o.partNo));
      if (!row) return;
      (isPump ? applyPartToItem : applyPartToSub)(o, row);
      pnNotes[o.id] = { ok: true, text: 'Filled from the price list.', filled: true };
    });
  });
  renderItems();
  refresh();

  $('#priceNote').textContent =
    `Price list: ${fileName} – ${map.size} parts` +
    (dups ? `, ${dups} duplicate part number(s) ignored` : '') +
    (skipped ? `, ${skipped} row(s) without a part number skipped` : '');
}

// Copies the price-list data of a part into a pump item.
// The typed unit price becomes the End User price (highest tier available); the three tier prices are stored
// on the item and applied by effPrice() according to the selected pricing category.
function applyPartToItem(it, row) {
  it.desc = row.desc || it.desc;
  it.origin = row.origin || it.origin;
  if (PUMP_CATS.includes(row.cat)) it.cat = row.cat;
  if (row.flow) { it.flow = row.flow; it.flowU = 'm³/h'; }
  if (row.head) { it.head = row.head; it.headU = 'm'; }
  it.price = row.e || row.c || row.t || it.price;
  it.priceT = row.t; it.priceC = row.c; it.priceE = row.e;
}

// Copies the price-list data of a part into a sub item (type is taken from the ProductType column).
function applyPartToSub(s, row) {
  const ty = row.type.toLowerCase();
  s.type = ty.includes('access') ? 'Accessories' : ty.includes('spare') ? 'Spare Part' : 'Other';
  s.desc = row.desc || s.desc;
  s.origin = row.origin || s.origin;
  s.price = row.e || row.c || row.t || s.price;
  s.priceT = row.t; s.priceC = row.c; s.priceE = row.e;
}

// Handles the "Load price list" button: reads the Products sheet of an Excel file (or a CSV file).
$('#priceFile').addEventListener('change', async e => {
  const f = e.target.files[0];

  // Reset the file input so the same file can be selected again.
  e.target.value = '';

  if (!f) return;

  try {
    if (typeof XLSX === 'undefined') {
      throw new Error('Excel reader not loaded. Check your internet connection and reload.');
    }

    const wb = /\.csv$/i.test(f.name)
      ? XLSX.read(await f.text(), { type: 'string' })
      : XLSX.read(await f.arrayBuffer(), { type: 'array' });

    // Prefer a sheet named "Products", then any sheet with "price" in its name, then the first sheet.
    const sheetName =
      wb.SheetNames.find(n => /^products?$/i.test(n)) ||
      wb.SheetNames.find(n => /price/i.test(n)) ||
      wb.SheetNames[0];

    setPriceList(XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' }), f.name);
  } catch (err) {
    alert('Could not read the price list: ' + err.message);
  }
});

// Looks up a part number when it is entered (on leaving the field, pressing Enter, or choosing a suggestion)
// and fills the pump item or sub item from the price list.
$('#items').addEventListener('change', e => {
  const t = e.target;
  const isPump = t.dataset.f === 'partNo';
  const isSub = t.dataset.sf === 'partNo';

  if (!isPump && !isSub) return;

  const it = state.items.find(x => x.id === t.closest('.item').dataset.id);
  const o = isPump ? it : it.subItems.find(x => x.id === t.closest('[data-sid]').dataset.sid);
  const pn = t.value.trim();
  const note = t.parentElement.querySelector('.pn-note');

  // Shows a status under the field without rebuilding the form (keeps the cursor where it is).
  const say = (ok, text, needsList) => {
    pnNotes[o.id] = { ok, text, needsList };
    if (note) { note.textContent = text; note.style.color = ok ? '#1d6b2e' : '#a32727'; }
  };

  if (!pn) { delete pnNotes[o.id]; if (note) note.textContent = ''; return; }
  if (!priceList) return say(false, 'Load a price list first (header button).', true);

  const row = priceList.map.get(pnKey(pn));
  if (!row) return say(false, 'Not found in the price list – enter the details manually.');

  // Ask before replacing details that were typed by hand.
  const wasFilled = pnNotes[o.id] && pnNotes[o.id].filled;
  if (!wasFilled && (o.desc || o.price) && (o.desc !== row.desc) &&
      !confirm(`Replace the current description and prices with the price-list data for ${row.part}?`)) {
    return say(true, 'Found – your entries were kept.');
  }

  if (isPump) applyPartToItem(o, row); else applyPartToSub(o, row);

  pnNotes[o.id] = { ok: true, text: 'Filled from the price list.', filled: true };
  renderItems();
  refresh();
});

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