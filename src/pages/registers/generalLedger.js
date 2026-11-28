import { state, DEPARTMENTS } from "../../core/state.js";
import { loadRows, loadVisible } from "../../core/storage.js";
import { $, compareNumbers } from "../../core/utils.js";
import { formatDate } from "../../core/dates.js";
import { createDateField } from "../../core/datePicker.js";
import { createAccountPicker } from "../../core/accountPicker.js";
import { createLoader, nextFrame } from "../../core/loader.js";
import { STORE_KEY as PAYMENT_STORE } from "../documents/payment.js";
import {
  STORE_KEY as JOURNAL_STORE,
  OPENING_TYPE,
} from "../documents/journal.js";

const ACCOUNTS_STORE = "accounts"; // الدليل المحاسبي (مشترك لكل الأقسام)
const ROW_CHUNK = 300; // عدد الصفوف في كل دفعة رسم

/* ================== المبالغ ================== */
// المبالغ تُحسب بالألف (3 خانات عشرية) لتفادي أخطاء الكسور العشرية
const toMilli = (n) => Math.round((Number(n) || 0) * 1000);
const fmtMilli = (m) =>
  (m / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 });

// رصيد موقّع (المدين موجب والدائن سالب) يُعرض بالقيمة وجهته
function balanceText(signed) {
  if (signed === 0) return "0";
  return `${fmtMilli(Math.abs(signed))} ${signed > 0 ? "مدين" : "دائن"}`;
}

const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// القيد الافتتاحي: مستند القيد رقم 1 من نوع «قيد افتتاحي»
const isOpeningEntry = (doc) =>
  parseInt(doc.number, 10) === 1 && doc.type === OPENING_TYPE;

// سطور المستند التي فيها مبلغ (وإذا حُدد حساب: التي ترجع له فقط)
const linesOf = (doc, onlyAccount) =>
  (doc.lines ?? []).filter(
    (line) =>
      line.accountNumber &&
      (!onlyAccount || line.accountNumber === onlyAccount) &&
      (toMilli(line.debit) || toMilli(line.credit)),
  );

const toRow = (doc, line, type) => ({
  id: doc.id,
  date: doc.date,
  number: doc.number,
  type,
  details: doc.statement ?? "",
  debit: toMilli(line.debit),
  credit: toMilli(line.credit),
});

/* ================== مصادر الحركة ================== */
// كل مصدر يملأ map: رقم الحساب -> { opening, rows, fallbackName }
function entryOf(map, line) {
  let entry = map.get(line.accountNumber);
  if (!entry) {
    entry = { opening: 0, rows: [], fallbackName: "" };
    map.set(line.accountNumber, entry);
  }
  entry.fallbackName ||= line.accountName ?? "";
  return entry;
}

// مستندات الصرف: كلها حركات عادية
function paymentSource(map, from, to, onlyAccount) {
  for (const doc of loadVisible(PAYMENT_STORE, state.dept)) {
    if (doc.cancelled || doc.date < from || doc.date > to) continue;
    for (const line of linesOf(doc, onlyAccount)) {
      entryOf(map, line).rows.push(toRow(doc, line, "مستند صرف"));
    }
  }
}

// مستندات القيد: القيد الافتتاحي يدخل في الرصيد الافتتاحي (ولا يُعد حركة حتى لا يُحسب مرتين)،
// وبقية القيود (يومية، ختامي، غلق...) حركات عادية
function journalSource(map, from, to, onlyAccount) {
  for (const doc of loadVisible(JOURNAL_STORE, state.dept)) {
    if (doc.cancelled) continue;
    const opening = isOpeningEntry(doc);
    if (!opening && (doc.date < from || doc.date > to)) continue;

    for (const line of linesOf(doc, onlyAccount)) {
      const entry = entryOf(map, line);
      if (opening) entry.opening += toMilli(line.debit) - toMilli(line.credit);
      else entry.rows.push(toRow(doc, line, doc.type ?? "مستند قيد"));
    }
  }
}

const SOURCES = [paymentSource, journalSource];

// تجهيز بيانات حساب واحد: الصفوف مرتبة + المجاميع + الأرصدة
function makeBlock(account, entry) {
  const rows = [...entry.rows].sort(
    (a, b) => compareText(a.date, b.date) || a.id - b.id,
  );
  const totalDebit = rows.reduce((sum, row) => sum + row.debit, 0);
  const totalCredit = rows.reduce((sum, row) => sum + row.credit, 0);

  // رصيد الحركة: الأكبر ناقص الأصغر (مدين - دائن، وإذا كان الدائن أكبر نعكس)
  const movement = totalDebit - totalCredit;
  return {
    number: account.number,
    name: account.name,
    opening: entry.opening,
    rows,
    totalDebit,
    totalCredit,
    movement,
    // الرصيد النهائي = الرصيد الافتتاحي + رصيد الحركة بحسب الجهة
    final: entry.opening + movement,
  };
}

/* ================== بناء الصفحة ================== */
const el = document.createElement("section");
el.id = "page-general-ledger";
el.className = "page hidden";
el.innerHTML = `
  <h2 class="page-title">سجل الأستاذ العام / <span class="dept-name"></span></h2>

    <div class="filter-box ledger-filter">
    <div class="field account-field">
      <span>الحساب (بالاسم أو الرقم) <em class="req">*</em></span>
      <div class="host-account"></div>
    </div>
    <div class="field"><span>من تاريخ <em class="req">*</em></span>
      <div class="host-from"></div></div>
    <div class="field"><span>إلى تاريخ <em class="req">*</em></span>
      <div class="host-to"></div></div>

    <div class="ledger-options">
      <label class="check-all">
        <input class="l-all" type="checkbox" />
        كشف جميع الحسابات (التي فيها مدين أو دائن)
      </label>
      <div class="filter-actions">
        <button class="btn btn-primary l-search" type="button">بحث</button>
        <button class="btn btn-light l-clear" type="button">مسح</button>
      </div>
    </div>
  </div>
  <p class="form-error error"></p>
  <p class="start-hint"></p>

  <div class="ledger-results hidden">
    <p class="all-title hidden"></p>
    <div class="ledger-blocks"></div>
  </div>
`;

// قالب جدول حساب واحد (البيانات تُملأ بعد ذلك بـ textContent)
const BLOCK_HTML = `
  <div class="ledger-info">
    <div><span>اسم الحساب</span><strong class="i-name"></strong></div>
    <div><span>الدليل المحاسبي</span><strong class="i-number"></strong></div>
    <div><span>الرصيد الافتتاحي</span><strong class="i-opening"></strong></div>
    <div><span>الفترة</span><strong class="i-period"></strong></div>
  </div>

  <p class="count"></p>

  <div class="table-wrap">
    <table class="ledger-table">
      <thead>
        <tr>
          <th class="c-debit">المدين</th>
          <th class="c-credit">الدائن</th>
          <th class="c-docno">رقم المستند</th>
          <th class="c-date">التاريخ</th>
          <th class="c-type">النوع</th>
          <th class="c-details">التفاصيل</th>
        </tr>
      </thead>
      <tbody></tbody>
      <tfoot>
        <tr>
          <td class="c-debit t-debit"></td>
          <td class="c-credit t-credit"></td>
          <td colspan="4" class="t-label">المجموع (مدين / دائن)</td>
        </tr>
      </tfoot>
    </table>
    <p class="empty hidden">لا توجد حركات على هذا الحساب في الفترة المحددة</p>
  </div>

  <div class="ledger-summary">
    <div class="sum-row">
      <span>رصيد الحركة السنوية من <b class="s-from"></b> لغاية <b class="s-to"></b></span>
      <strong class="s-movement"></strong>
    </div>
    <div class="sum-row">
      <span>الرصيد الافتتاحي</span>
      <strong class="s-opening"></strong>
    </div>
    <div class="sum-row total">
      <span>الرصيد النهائي</span>
      <strong class="s-final"></strong>
    </div>
  </div>
`;

const picker = createAccountPicker();
const fromField = createDateField();
const toField = createDateField();
$(".host-account", el).appendChild(picker.el);
$(".host-from", el).appendChild(fromField.el);
$(".host-to", el).appendChild(toField.el);

const resultsBox = $(".ledger-results", el);
const blocksBox = $(".ledger-blocks", el);

// لودر عند كثرة الحسابات أو الحركات
const loader = createLoader(resultsBox);

let searched = false;
let errorTimer = null;
let renderId = 0; // لإيقاف رسم قديم إذا بدأ بحث جديد

/* ================== أدوات ================== */
function showError(text) {
  const box = $(".form-error", el);
  box.textContent = text;
  clearTimeout(errorTimer);
  if (text) errorTimer = setTimeout(() => (box.textContent = ""), 6000);
}

function cell(text, className) {
  const td = document.createElement("td");
  td.textContent = text ?? "";
  if (className) td.className = className;
  return td;
}

function buildRow(row) {
  const tr = document.createElement("tr");
  tr.append(
    cell(row.debit ? fmtMilli(row.debit) : "", "c-debit"),
    cell(row.credit ? fmtMilli(row.credit) : "", "c-credit"),
    cell(row.number, "c-docno"),
    cell(formatDate(row.date), "c-date"),
    cell(row.type, "c-type"),
    cell(row.details, "c-details"),
  );
  return tr;
}

/* ================== كشف جميع الحسابات: تعطيل خانة الحساب ================== */
function setAllMode(on) {
  picker.el.classList.toggle("disabled", on);
  $(".ap-input", picker.el).disabled = on;
  $(".account-field", el).classList.toggle("ignored", on);
}

/* ================== الرسم ================== */
// يبني جدول حساب واحد ويضيفه للصفحة (الصفوف على دفعات إذا كثرت)
async function appendBlock(block, from, to, id, heavy) {
  const section = document.createElement("section");
  section.className = "ledger-block";
  section.innerHTML = BLOCK_HTML;
  blocksBox.append(section);

  $(".i-name", section).textContent = block.name;
  $(".i-number", section).textContent = block.number;
  $(".i-opening", section).textContent = balanceText(block.opening);
  $(".i-period", section).textContent =
    `من ${formatDate(from)} إلى ${formatDate(to)}`;
  $(".count", section).textContent = `عدد الحركات: ${block.rows.length}`;
  $(".empty", section).classList.toggle("hidden", block.rows.length > 0);

  $(".t-debit", section).textContent = fmtMilli(block.totalDebit);
  $(".t-credit", section).textContent = fmtMilli(block.totalCredit);

  $(".s-from", section).textContent = formatDate(from);
  $(".s-to", section).textContent = formatDate(to);
  $(".s-movement", section).textContent = balanceText(block.movement);
  $(".s-opening", section).textContent = balanceText(block.opening);
  $(".s-final", section).textContent = balanceText(block.final);

  const tbody = $("tbody", section);
  for (let start = 0; start < block.rows.length; start += ROW_CHUNK) {
    if (id !== renderId) return false;
    const fragment = document.createDocumentFragment();
    for (const row of block.rows.slice(start, start + ROW_CHUNK))
      fragment.append(buildRow(row));
    tbody.append(fragment);
    if (heavy && block.rows.length > ROW_CHUNK) await nextFrame();
  }
  return true;
}

async function renderBlocks(blocks, from, to) {
  const id = ++renderId;
  blocksBox.replaceChildren();

  const totalRows = blocks.reduce((sum, block) => sum + block.rows.length, 0);
  const heavy = totalRows > 200 || blocks.length > 30;

  if (heavy) {
    loader.show(`جاري تحميل ${blocks.length} حساب (${totalRows} حركة)...`);
    await nextFrame();
  } else {
    loader.hide();
  }

  for (const [index, block] of blocks.entries()) {
    if (id !== renderId) return;
    const ok = await appendBlock(block, from, to, id, heavy);
    if (!ok) return;

    // نترك للمتصفح فرصة الرسم كل بضعة حسابات ونعرض التقدم
    if (heavy && (index % 5 === 4 || block.rows.length > ROW_CHUNK)) {
      loader.show(`جاري التحميل... ${index + 1} من ${blocks.length} حساب`);
      await nextFrame();
    }
  }

  if (id === renderId) loader.hide();
}

/* ================== البحث ================== */
function search() {
  showError("");

  const allMode = $(".l-all", el).checked;
  const account = allMode ? null : picker.getValue();
  const from = fromField.getValue();
  const to = toField.getValue();

  // الحساب (إلا في كشف جميع الحسابات) ومن وإلى إلزامية
  if (!allMode && !account) {
    return showError("اختر الحساب من القائمة، أو فعّل «كشف جميع الحسابات»");
  }
  if (!from) return showError("اختر تاريخ البداية (من تاريخ)");
  if (!to) return showError("اختر تاريخ النهاية (إلى تاريخ)");
  if (from > to)
    return showError("تاريخ البداية يجب أن يكون قبل تاريخ النهاية");

  // جمع الحركات من كل مصادر المستندات (لحساب واحد أو لكل الحسابات)
  const map = new Map();
  for (const source of SOURCES) source(map, from, to, account?.number ?? null);

  let blocks;
  if (allMode) {
    // كل حساب فيه حركة في الفترة، أو رصيد افتتاحي. مرتبة بحسب رقم الدليل
    const names = new Map(
      loadRows(ACCOUNTS_STORE, "all").map((r) => [r.number, r.name]),
    );
    blocks = [...map.entries()]
      .filter(([, entry]) => entry.rows.length > 0 || entry.opening !== 0)
      .map(([number, entry]) =>
        makeBlock(
          { number, name: names.get(number) ?? (entry.fallbackName || number) },
          entry,
        ),
      )
      .sort((a, b) => compareNumbers(a.number, b.number));
  } else {
    blocks = [
      makeBlock(account, map.get(account.number) ?? { opening: 0, rows: [] }),
    ];
  }

  // ===== العرض =====
  searched = true;
  resultsBox.classList.remove("hidden");
  $(".start-hint", el).textContent = "";

  const title = $(".all-title", el);
  title.classList.toggle("hidden", !allMode);
  if (allMode) {
    title.textContent = blocks.length
      ? `كشف جميع الحسابات — عدد الحسابات: ${blocks.length}`
      : "لا توجد حسابات عليها حركات في الفترة المحددة";
  }

  renderBlocks(blocks, from, to);
}

function clearAll() {
  picker.clear();
  fromField.setValue("");
  toField.setValue("");
  $(".l-all", el).checked = false;
  setAllMode(false);
  showError("");
  searched = false;
  renderId++; // نوقف أي رسم جارٍ
  loader.hide();
  blocksBox.replaceChildren();
  resultsBox.classList.add("hidden");
  $(".start-hint", el).textContent =
    "اختر الحساب (أو كشف جميع الحسابات) والفترة ثم اضغط «بحث»";
}

/* ================== الأحداث ================== */
$(".l-search", el).addEventListener("click", search);
$(".l-clear", el).addEventListener("click", clearAll);
$(".l-all", el).addEventListener("change", (e) => setAllMode(e.target.checked));

/* ================== واجهة الصفحة ================== */
function render() {
  // اسم القسم بجانب العنوان: الكل أو اسم القسم
  $(".dept-name", el).textContent = DEPARTMENTS[state.dept];
  if (searched) search(); // تحديث النتائج (بعد تغيير قسم أو تعديل مستند)
}

clearAll();

export default { id: "page-general-ledger", el, render, reset: clearAll };
