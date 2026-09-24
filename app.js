/* =========================================================
   ဘဏ္ဍာစိုး — APP LOGIC  (v4 – Type Lock + Validation)
   ========================================================= */
const STORAGE_KEY = 'bhandasoe-v2';
const THEME_KEY   = 'bhandasoe-theme';

const TYPES = {
  income:  { label: 'ဝင်ငွေ',  color: '#4CAF50', icon: '▲' },
  expense: { label: 'ထွက်ငွေ', color: '#F44336', icon: '▼' },
  savings: { label: 'စုငွေ',   color: '#1E88E5', icon: '🏦' }
};
const TYPE_KEYS = ['income', 'expense', 'savings'];
const MY_MONTHS = ['ဇန်','ဖေ','မတ်','ဧပြီ','မေ','ဇွန်','ဇူ','ဩ','စက်','အောက်','နို','ဒီ'];

/* =========================================================
   DOM
   ========================================================= */
const $ = id => document.getElementById(id);
const monthPicker = $('monthPicker');
const todayLabel  = $('todayLabel');
const themeToggle = $('themeToggle');
const balanceNum  = $('balanceNum');
const savingsNum  = $('savingsNum');
const monthIncome = $('monthIncome');
const monthExpense= $('monthExpense');
const monthSavings= $('monthSavings');
const filterBar   = $('filterBar');
const historyList = $('historyList');
const searchBox   = $('searchBox');
const exportBtn   = $('exportBtn');

const modal       = $('modal');
const modalTitle  = $('modalTitle');
const modalIcon   = $('modalIcon');
const txForm      = $('txForm');
const txId        = $('txId');
const txType      = $('txType');
const txAmount    = $('txAmount');
const txAmountLabel = $('txAmountLabel');
const txDate      = $('txDate');
const txNote      = $('txNote');
const txNoteLabel = $('txNoteLabel');
const txFromSavings = $('txFromSavings');
const savingsToggleWrap = $('savingsToggleWrap');
const savingsAvailableLabel = $('savingsAvailableLabel');
const availableInfo = $('availableInfo');
const availableLabel = $('availableLabel');
const availableValue = $('availableValue');
const submitBtn   = $('submitBtn');

const exportModal = $('exportModal');
const exportMonthLabel = $('exportMonthLabel');
const exportAllLabel   = $('exportAllLabel');

/* =========================================================
   STATE
   ========================================================= */
let transactions = loadData();
let filter       = 'all';
let searchTerm   = '';
let charts       = { pie: null, bar: null, line: null };

/* =========================================================
   HELPERS
   ========================================================= */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];

    let fixed = 0;
    arr.forEach(t => {
      if (!t.id || t.id === 'null' || t.id === 'undefined') {
        t.id = uid() + (fixed++).toString(36);
      }
    });

    if (fixed > 0) {
      console.log(`🔧 Auto-repair: ${fixed} transaction(s) ပြုပြင်ပြီး`);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); } catch (e) {}
    }
    return arr;
  } catch (e) {
    console.warn('Load failed', e);
    return [];
  }
}

function saveData() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions)); }
  catch (e) { console.warn('Save failed', e); }
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function pad2(n) { return String(n).padStart(2, '0'); }

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function curMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function fmtMoney(n) {
  const abs = Math.abs(Math.round(n || 0));
  return abs.toLocaleString('en-US');
}

function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function monthLabel(mk) {
  const [y, m] = mk.split('-').map(Number);
  return `${MY_MONTHS[m - 1]} ${y}`;
}

function lastNMonths(mk, n) {
  const [y, m] = mk.split('-').map(Number);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    out.push(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`);
  }
  return out;
}

/* =========================================================
   CALCULATION
   ========================================================= */
function computeCumulative() {
  let income = 0, regularExpense = 0, savingsTopup = 0, savingsSpend = 0;

  transactions.forEach(t => {
    const amt = Number(t.amount) || 0;
    if (t.type === 'income') income += amt;
    else if (t.type === 'savings') savingsTopup += amt;
    else if (t.type === 'expense') {
      if (t.fromSavings) savingsSpend += amt;
      else regularExpense += amt;
    }
  });

  return {
    balance: income - regularExpense - savingsTopup,
    savings: savingsTopup - savingsSpend
  };
}

function monthStats(mk) {
  let income = 0, regularExpense = 0, savingsTopup = 0, savingsSpend = 0;

  transactions.forEach(t => {
    if ((t.date || '').slice(0, 7) !== mk) return;
    const amt = Number(t.amount) || 0;
    if (t.type === 'income') income += amt;
    else if (t.type === 'savings') savingsTopup += amt;
    else if (t.type === 'expense') {
      if (t.fromSavings) savingsSpend += amt;
      else regularExpense += amt;
    }
  });

  return {
    income, regularExpense, savingsTopup, savingsSpend,
    totalExpense: regularExpense + savingsSpend
  };
}

/* =========================================================
   VALIDATION
   ========================================================= */
/**
 * type အလိုက် လက်ကျန် တွက်
 * (editing ဖြစ်ရင် old transaction ကို ပြန်ထည့်)
 */
function getAvailable(type, editingId, fromSavings) {
  const cum = computeCumulative();

  let oldAmount = 0, oldType = null, oldFromSavings = false;

  if (editingId) {
    const old = transactions.find(t => t.id === editingId);
    if (old) {
      oldAmount = Number(old.amount) || 0;
      oldType = old.type;
      oldFromSavings = !!old.fromSavings;
    }
  }

  // ===== expense =====
  if (type === 'expense') {
    if (fromSavings) {
      // စုငွေကနေ ထုတ်သုံး
      let extra = 0;
      if (oldType === 'expense' && oldFromSavings) extra = oldAmount;
      const available = cum.savings + extra;
      return { available, source: 'savings' };
    } else {
      // ပုံမှန် expense → balance ကနေ
      let extra = 0;
      if (oldType === 'expense' && !oldFromSavings) extra = oldAmount;
      if (oldType === 'savings') extra += oldAmount; // old topup ပြန်ဖြုတ်
      const available = cum.balance + extra;
      return { available, source: 'balance' };
    }
  }

  // ===== savings (top-up) =====
  if (type === 'savings') {
    let extra = 0;
    if (oldType === 'expense' && !oldFromSavings) extra = oldAmount;
    if (oldType === 'savings') extra += oldAmount;
    const available = cum.balance + extra;
    return { available, source: 'balance' };
  }

  // ===== income =====
  return { available: Infinity, source: 'none' };
}

function validateTx(type, amount, fromSavings, editingId) {
  if (type === 'income') return { ok: true };

  const { available, source } = getAvailable(type, editingId, fromSavings);

  if (amount > available) {
    const srcName = source === 'savings' ? 'စုငွေ' : 'လက်ကျန်ငွေ';
    return {
      ok: false,
      msg: `${srcName} မလုံလောက်ပါ။\n\nလက်ကျန်: ${fmtMoney(available)} ကျပ်\nထည့်လိုတာ: ${fmtMoney(amount)} ကျပ်`
    };
  }
  return { ok: true };
}

/* =========================================================
   RENDER : BALANCE
   ========================================================= */
function renderBalance() {
  const cum = computeCumulative();
  const mk  = monthPicker.value || curMonthKey();
  const m   = monthStats(mk);

  balanceNum.textContent = fmtMoney(cum.balance) + ' ကျပ်';
  balanceNum.style.color = cum.balance < 0 ? 'var(--expense)' : 'var(--text)';
  savingsNum.textContent = fmtMoney(cum.savings) + ' ကျပ်';
  monthIncome.textContent  = fmtMoney(m.income);
  monthExpense.textContent = fmtMoney(m.totalExpense);
  monthSavings.textContent = fmtMoney(m.savingsTopup);
}

/* =========================================================
   RENDER : FILTERS
   ========================================================= */
function renderFilters() {
  const counts = { all: transactions.length };
  TYPE_KEYS.forEach(k => counts[k] = transactions.filter(t => t.type === k).length);

  const items = [
    { key: 'all', label: 'အားလုံး' },
    ...TYPE_KEYS.map(k => ({ key: k, label: TYPES[k].label }))
  ];

  filterBar.innerHTML = items.map(f => `
    <button class="filter-chip ${filter === f.key ? 'active' : ''}"
            data-filter="${f.key}">
      ${f.label} <span style="opacity:.55">${counts[f.key]}</span>
    </button>
  `).join('');
}

/* =========================================================
   RENDER : HISTORY
   ========================================================= */
function renderHistory() {
  const mk = monthPicker.value || curMonthKey();

  let items = transactions.filter(t => {
    if ((t.date || '').slice(0, 7) !== mk) return false;
    if (filter !== 'all' && t.type !== filter) return false;
    if (searchTerm && !(t.note || '').toLowerCase().includes(searchTerm)) return false;
    return true;
  });

  items.sort((a, b) => {
    const d = (b.date || '').localeCompare(a.date || '');
    if (d !== 0) return d;
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });

  if (!items.length) {
    historyList.innerHTML = `
      <li class="text-center py-12 text-muted">
        <p class="text-4xl mb-2">📭</p>
        <p class="text-sm">မှတ်တမ်း မရှိသေးပါ</p>
      </li>`;
    return;
  }

  const groups = {};
  items.forEach(t => {
    const d = t.date || '';
    (groups[d] = groups[d] || []).push(t);
  });

  historyList.innerHTML = Object.keys(groups).sort((a, b) => b.localeCompare(a))
    .map(date => {
      const list = groups[date];
      const dayTotal = list.reduce((sum, t) => {
        const amt = Number(t.amount) || 0;
        return t.type === 'income' ? sum + amt : sum - amt;
      }, 0);

      return `
        <li class="mb-4">
          <div class="flex justify-between items-center px-1 mb-2">
            <p class="text-xs text-muted font-medium">${fmtDate(date)}</p>
            <p class="text-xs font-medium"
               style="color:${dayTotal >= 0 ? 'var(--income)' : 'var(--expense)'}">
              ${dayTotal >= 0 ? '+' : '−'} ${fmtMoney(dayTotal)}
            </p>
          </div>
          <ul class="space-y-2">
            ${list.map(renderTxRow).join('')}
          </ul>
        </li>`;
    }).join('');
}

function renderTxRow(t) {
  const info = TYPES[t.type] || TYPES.income;
  const amt  = Number(t.amount) || 0;
  const isSavingsSpend = (t.type === 'expense' && t.fromSavings);
  const sign = t.type === 'income' ? '+' : '−';

  return `
    <li class="fade-in card p-3">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg flex items-center justify-center text-white text-base shrink-0"
             style="background:${info.color}">
          ${info.icon}
        </div>

        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium truncate">
            ${t.note ? esc(t.note) : info.label}
          </p>
          <div class="flex items-center gap-2 mt-0.5 flex-wrap">
            <p class="text-xs text-muted">${info.label}</p>
            ${isSavingsSpend ? `<span class="badge-savings">🏦 စုငွေကနေ</span>` : ''}
          </div>
        </div>

        <div class="text-right shrink-0">
          <p class="font-semibold" style="color:${info.color}">
            ${sign} ${fmtMoney(amt)}
          </p>
        </div>
      </div>

      <div class="flex gap-2 mt-3 pt-3" style="border-top:1px solid var(--border)">
        <button type="button" onclick="handleEdit('${t.id}')"
          class="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium transition active:scale-95"
          style="background:var(--card-2);color:var(--primary)">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
          ပြင်
        </button>
        <button type="button" onclick="handleDelete('${t.id}')"
          class="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium transition active:scale-95"
          style="background:color-mix(in srgb, var(--expense) 12%, transparent);color:var(--expense)">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18"></path>
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"></path>
            <path d="M10 11v6M14 11v6"></path>
            <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"></path>
          </svg>
          ဖျက်
        </button>
      </div>
    </li>`;
}

/* =========================================================
   HANDLERS (inline onclick)
   ========================================================= */
window.handleEdit = function(id) {
  const tx = transactions.find(t => t.id === id);
  if (!tx) { console.warn('Edit: မတွေ့', id); return; }
  openModal(tx);
};

window.handleDelete = function(id) {
  const tx = transactions.find(t => t.id === id);
  if (!tx) { console.warn('Delete: မတွေ့', id); return; }
  const label = tx.note ? `"${tx.note}"` : TYPES[tx.type].label;
  if (!confirm(`${label} ကို ဖျက်မှာ သေချာလား?`)) return;
  transactions = transactions.filter(t => t.id !== id);
  saveData();
  renderAll();
};

/* =========================================================
   RENDER : CHARTS
   ========================================================= */
function renderCharts() {
  const mk = monthPicker.value || curMonthKey();
  const m  = monthStats(mk);

  const css = getComputedStyle(document.documentElement);
  const textColor = css.getPropertyValue('--text-muted').trim();
  const gridColor = css.getPropertyValue('--border').trim();

  const commonOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          boxWidth: 10, boxHeight: 10,
          usePointStyle: true, pointStyle: 'circle',
          color: textColor, font: { size: 11 }
        }
      }
    }
  };

  // PIE
  if (charts.pie) charts.pie.destroy();
  charts.pie = new Chart($('pieChart'), {
    type: 'doughnut',
    data: {
      labels: ['ဝင်ငွေ', 'ထွက်ငွေ', 'စုငွေ'],
      datasets: [{
        data: [m.income, m.totalExpense, m.savingsTopup],
        backgroundColor: [TYPES.income.color, TYPES.expense.color, TYPES.savings.color],
        borderWidth: 0, hoverOffset: 6
      }]
    },
    options: {
      ...commonOpts,
      cutout: '62%',
      plugins: {
        ...commonOpts.plugins,
        tooltip: { callbacks: { label: c => ` ${c.label}: ${fmtMoney(c.parsed)}` } }
      }
    }
  });

  // BAR
  const months6 = lastNMonths(mk, 6);
  const barDatasets = [
    { label: 'ဝင်ငွေ', data: months6.map(x => monthStats(x).income),
      backgroundColor: TYPES.income.color, borderRadius: 4, maxBarThickness: 24 },
    { label: 'ထွက်ငွေ', data: months6.map(x => monthStats(x).totalExpense),
      backgroundColor: TYPES.expense.color, borderRadius: 4, maxBarThickness: 24 },
    { label: 'စုငွေ', data: months6.map(x => monthStats(x).savingsTopup),
      backgroundColor: TYPES.savings.color, borderRadius: 4, maxBarThickness: 24 }
  ];

  if (charts.bar) charts.bar.destroy();
  charts.bar = new Chart($('barChart'), {
    type: 'bar',
    data: {
      labels: months6.map(x => MY_MONTHS[Number(x.split('-')[1]) - 1]),
      datasets: barDatasets
    },
    options: {
      ...commonOpts,
      scales: {
        x: { stacked: true, grid: { display: false },
             ticks: { color: textColor, font: { size: 10 } } },
        y: { stacked: true, beginAtZero: true,
             ticks: { color: textColor, precision: 0, font: { size: 10 },
               callback: v => v >= 1000 ? (v / 1000) + 'k' : v },
             grid: { color: gridColor } }
      }
    }
  });

  // LINE
  const lineIncome  = months6.map(x => monthStats(x).income);
  const lineExpense = months6.map(x => monthStats(x).totalExpense);
  const lineSavings = months6.map(x => monthStats(x).savingsTopup);

  if (charts.line) charts.line.destroy();
  charts.line = new Chart($('lineChart'), {
    type: 'line',
    data: {
      labels: months6.map(x => MY_MONTHS[Number(x.split('-')[1]) - 1]),
      datasets: [
        { label: 'ဝင်ငွေ', data: lineIncome,
          borderColor: TYPES.income.color, backgroundColor: TYPES.income.color + '22',
          fill: true, tension: 0.35, borderWidth: 2,
          pointBackgroundColor: TYPES.income.color, pointRadius: 3 },
        { label: 'ထွက်ငွေ', data: lineExpense,
          borderColor: TYPES.expense.color, backgroundColor: TYPES.expense.color + '22',
          fill: true, tension: 0.35, borderWidth: 2,
          pointBackgroundColor: TYPES.expense.color, pointRadius: 3 },
        { label: 'စုငွေ', data: lineSavings,
          borderColor: TYPES.savings.color, backgroundColor: TYPES.savings.color + '22',
          fill: false, tension: 0.35, borderWidth: 2, borderDash: [5, 4],
          pointBackgroundColor: TYPES.savings.color, pointRadius: 3 }
      ]
    },
    options: {
      ...commonOpts,
      scales: {
        x: { grid: { display: false },
             ticks: { color: textColor, font: { size: 10 } } },
        y: { beginAtZero: true,
             ticks: { color: textColor, precision: 0, font: { size: 10 },
               callback: v => v >= 1000 ? (v / 1000) + 'k' : v },
             grid: { color: gridColor } }
      }
    }
  });
}

/* =========================================================
   MASTER RENDER
   ========================================================= */
function renderAll() {
  renderBalance();
  renderFilters();
  renderHistory();
  renderCharts();
}

/* =========================================================
   MODAL
   ========================================================= */
function openModal(tx = null, forceType = null) {
  const type = tx ? tx.type : (forceType || 'income');
  const isEdit = !!tx;

  txId.value     = tx ? tx.id : '';
  txType.value   = type;
  txAmount.value = tx ? tx.amount : '';
  txDate.value   = tx ? tx.date : todayISO();
  txNote.value   = tx ? (tx.note || '') : '';
  txFromSavings.checked = tx ? !!tx.fromSavings : false;

  applyModalType(type, isEdit);

  modal.classList.remove('hidden');
  setTimeout(() => txAmount.focus(), 250);
}

function applyModalType(type, isEdit = false) {
  const info = TYPES[type];

  // Icon + background
  modalIcon.style.background = info.color;
  modalIcon.textContent = info.icon;

  // Title
  const titles = {
    income:  isEdit ? 'ဝင်ငွေ ပြင်' : 'ဝင်ငွေ ထည့်',
    expense: isEdit ? 'ထွက်ငွေ ပြင်' : 'ထွက်ငွေ ထည့်',
    savings: isEdit ? 'စုငွေ ပြင်'   : 'စုငွေ ထည့်'
  };
  modalTitle.textContent = titles[type];

  // Amount label
  txAmountLabel.textContent = type === 'income'
    ? 'ရရှိငွေ (ကျပ်)'
    : type === 'expense'
    ? 'သုံးငွေ (ကျပ်)'
    : 'စုငွေ (ကျပ်)';

  // Note label + placeholder
  const noteCfg = {
    income:  { label: 'ဘယ်ကနေ ရလဲ (optional)', placeholder: 'ဥပမာ – လစာ၊ Bonus၊ ရောင်းရငွေ...' },
    expense: { label: 'ဘာဖိုးလဲ (optional)',    placeholder: 'ဥပမာ – ဆီဖိုး၊ အစားအသောက်...' },
    savings: { label: 'ဘာအတွက် (optional)',    placeholder: 'ဥပမာ – ကားဝယ်ဖို့၊ ခရီး...' }
  };
  txNoteLabel.textContent = noteCfg[type].label;
  txNote.placeholder = noteCfg[type].placeholder;

  // Savings toggle (expense only)
  if (type === 'expense') {
    savingsToggleWrap.classList.remove('hidden');
  } else {
    savingsToggleWrap.classList.add('hidden');
    txFromSavings.checked = false;
  }

  // Available info
  refreshAvailableInfo();
}

function refreshAvailableInfo() {
  const type = txType.value;
  const fromSav = txFromSavings.checked;

  // income – ဘာ info မှ မပြ
  if (type === 'income') {
    availableInfo.classList.add('hidden');
    return;
  }

  availableInfo.classList.remove('hidden');

  const { available, source } = getAvailable(type, txId.value || null, fromSav);

  if (type === 'expense') {
    if (fromSav) {
      availableLabel.textContent = '🏦 စုငွေ လက်ကျန်';
      availableValue.textContent = fmtMoney(available) + ' ကျပ်';
      availableValue.style.color = 'var(--savings)';
      // toggle label
      savingsAvailableLabel.textContent = available > 0
        ? `စုငွေ လက်ကျန်: ${fmtMoney(available)} ကျပ်`
        : 'စုငွေ မရှိသေးပါ';
      txFromSavings.disabled = available <= 0;
    } else {
      availableLabel.textContent = '💵 လက်ကျန်ငွေ (သုံးလို့ရ)';
      availableValue.textContent = fmtMoney(available) + ' ကျပ်';
      availableValue.style.color = available > 0 ? 'var(--income)' : 'var(--expense)';
      savingsAvailableLabel.textContent = `စုငွေ လက်ကျန်: ${fmtMoney(computeCumulative().savings)} ကျပ်`;
      txFromSavings.disabled = false;
    }
  } else if (type === 'savings') {
    availableLabel.textContent = '💵 လက်ကျန်ငွေ (စုဖို့ရ)';
    availableValue.textContent = fmtMoney(available) + ' ကျပ်';
    availableValue.style.color = available > 0 ? 'var(--income)' : 'var(--expense)';
  }
}

function closeModal() {
  modal.classList.add('hidden');
}

/* =========================================================
   CRUD
   ========================================================= */
function saveTx(data) {
  if (data.id) {
    const i = transactions.findIndex(t => t.id === data.id);
    if (i >= 0) {
      transactions[i] = {
        ...transactions[i],
        type: data.type,
        amount: data.amount,
        date: data.date,
        note: data.note,
        fromSavings: data.fromSavings,
        updatedAt: new Date().toISOString()
      };
    }
  } else {
    const { id, ...rest } = data;
    transactions.push({
      id: uid(),
      ...rest,
      createdAt: new Date().toISOString()
    });
  }
  saveData();
  renderAll();
}

/* =========================================================
   EXCEL EXPORT
   ========================================================= */
function exportExcel(scope) {
  const mk = monthPicker.value || curMonthKey();
  const data = scope === 'month'
    ? transactions.filter(t => (t.date || '').slice(0, 7) === mk)
    : transactions.slice();

  if (!data.length) { alert('ဒေတာ မရှိပါ'); return; }

  data.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  const rows = data.map(t => ({
    'ရက်စွဲ': t.date,
    'အမျိုးအစား': TYPES[t.type].label,
    'ပမာဏ (ကျပ်)': Number(t.amount),
    'စုငွေကနေ': t.type === 'expense' && t.fromSavings ? 'ဟုတ်' : '',
    'မှတ်ချက်': t.note || ''
  }));

  let s;
  if (scope === 'month') {
    const m = monthStats(mk);
    s = { income: m.income, totalExpense: m.totalExpense,
          savingsTopup: m.savingsTopup, savingsSpend: m.savingsSpend };
  } else {
    let income = 0, regExp = 0, svTop = 0, svSpend = 0;
    transactions.forEach(t => {
      const a = Number(t.amount) || 0;
      if (t.type === 'income') income += a;
      else if (t.type === 'savings') svTop += a;
      else if (t.type === 'expense') {
        if (t.fromSavings) svSpend += a; else regExp += a;
      }
    });
    s = { income, totalExpense: regExp + svSpend,
          savingsTopup: svTop, savingsSpend: svSpend };
  }

  const summary = [
    { 'အမျိုးအစား': 'ဝင်ငွေ',             'ပမာဏ': s.income },
    { 'အမျိုးအစား': 'ထွက်ငွေ (စုစုပေါင်း)',  'ပမာဏ': s.totalExpense },
    { 'အမျိုးအစား': '  └ ပုံမှန်',          'ပမာဏ': s.totalExpense - s.savingsSpend },
    { 'အမျိုးအစား': '  └ စုငွေကနေ',         'ပမာဏ': s.savingsSpend },
    { 'အမျိုးအစား': 'စုငွေ (top-up)',       'ပမာဏ': s.savingsTopup },
    { 'အမျိုးအစား': 'လက်ကျန်',              'ပမာဏ': s.income - s.totalExpense - s.savingsTopup }
  ];

  const wb = XLSX.utils.book_new();

  const wsData = XLSX.utils.json_to_sheet(rows);
  wsData['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, wsData, 'Transactions');

  const wsSum = XLSX.utils.json_to_sheet(summary);
  wsSum['!cols'] = [{ wch: 22 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, wsSum, 'Summary');

  const fname = `bhandasoe_${scope}_${mk}_${Date.now()}.xlsx`;
  XLSX.writeFile(wb, fname);
}

/* =========================================================
   EVENTS
   ========================================================= */

// Quick add – type lock နဲ့ ဖွင့်
document.querySelectorAll('[data-add]').forEach(btn => {
  btn.addEventListener('click', () => {
    openModal(null, btn.dataset.add);
  });
});

// Form submit
txForm.addEventListener('submit', e => {
  e.preventDefault();

  const type = txType.value;
  const amount = Number(txAmount.value);

  if (!amount || amount <= 0) {
    alert('ပမာဏ မှန်ကန်စွာ ထည့်ပါ');
    return;
  }

  const fromSavings = type === 'expense' && txFromSavings.checked;

  // Validation
  const v = validateTx(type, amount, fromSavings, txId.value || null);
  if (!v.ok) {
    alert(v.msg);
    return;
  }

  saveTx({
    id: txId.value || null,
    type,
    amount,
    date: txDate.value,
    note: txNote.value.trim(),
    fromSavings
  });

  closeModal();
});

// Savings toggle
txFromSavings.addEventListener('change', () => {
  refreshAvailableInfo();
});

// Amount change – realtime info
txAmount.addEventListener('input', () => {
  if (txType.value === 'income') return;
  refreshAvailableInfo();
});

// Close buttons
document.querySelectorAll('[data-close]').forEach(el => {
  el.addEventListener('click', () => {
    modal.classList.add('hidden');
    exportModal.classList.add('hidden');
  });
});

// Filters
filterBar.addEventListener('click', e => {
  const btn = e.target.closest('[data-filter]');
  if (!btn) return;
  filter = btn.dataset.filter;
  renderFilters();
  renderHistory();
});

// Search
searchBox.addEventListener('input', e => {
  searchTerm = e.target.value.trim().toLowerCase();
  renderHistory();
});

// Month picker
monthPicker.addEventListener('change', renderAll);

// Export
exportBtn.addEventListener('click', () => {
  const mk = monthPicker.value || curMonthKey();
  const monthCount = transactions.filter(t => (t.date || '').slice(0, 7) === mk).length;
  exportMonthLabel.textContent = `${monthLabel(mk)} — ${monthCount} ခု`;
  exportAllLabel.textContent = `စုစုပေါင်း ${transactions.length} ခု`;
  exportModal.classList.remove('hidden');
});

document.querySelectorAll('[data-export]').forEach(btn => {
  btn.addEventListener('click', () => {
    exportExcel(btn.dataset.export);
    exportModal.classList.add('hidden');
  });
});

/* =========================================================
   THEME
   ========================================================= */
function applyTheme(t) {
  document.documentElement.classList.toggle('dark', t === 'dark');
  themeToggle.textContent = t === 'dark' ? '☀️' : '🌙';
  localStorage.setItem(THEME_KEY, t);
}

themeToggle.addEventListener('click', () => {
  const cur = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  applyTheme(cur === 'dark' ? 'light' : 'dark');
  setTimeout(renderCharts, 50);
});

/* =========================================================
   PWA
   ========================================================= */
function makeIcon(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, '#6366f1');
  g.addColorStop(1, '#8b5cf6');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = '#ffffff';
  const pad = size * 0.22;
  ctx.fillRect(pad, size * 0.32, size - pad * 2, size * 0.36);
  ctx.fillStyle = '#6366f1';
  ctx.beginPath();
  ctx.arc(size * 0.68, size * 0.5, size * 0.055, 0, Math.PI * 2);
  ctx.fill();

  return c.toDataURL('image/png');
}

(function setupPWA() {
  const icon192 = makeIcon(192);
  const icon512 = makeIcon(512);
  const appleIcon = $('appleIcon');
  if (appleIcon) appleIcon.href = makeIcon(180);

  const manifest = {
    name: 'ဘဏ္ဍာစိုး',
    short_name: 'ဘဏ္ဍာစိုး',
    description: 'ဝင်ငွေ၊ ထွက်ငွေ၊ စုငွေ စာရင်း',
    start_url: './',
    scope: './',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f1f5f9',
    theme_color: '#4f46e5',
    icons: [
      { src: icon192, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: icon512, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: icon512, sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  };

  const blob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' });
  const link = $('manifestLink');
  if (link) link.href = URL.createObjectURL(blob);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js')
        .then(() => console.log('✅ SW registered'))
        .catch(err => console.warn('SW skip:', err.message));
    });
  }
})();

/* =========================================================
   INIT
   ========================================================= */
(function init() {
  const savedTheme = localStorage.getItem(THEME_KEY);
  if (savedTheme) applyTheme(savedTheme);
  else if (window.matchMedia('(prefers-color-scheme: dark)').matches) applyTheme('dark');
  else applyTheme('light');

  monthPicker.value = curMonthKey();

  const d = new Date();
  todayLabel.textContent = `${MY_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;

  renderAll();
  window.addEventListener('focus', renderAll);
})();