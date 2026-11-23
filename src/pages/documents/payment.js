import { state, DEPARTMENTS, CURRENCIES } from "../../core/state.js";
import { loadRows, saveRows, loadVisible } from "../../core/storage.js";
import { $, toLatin } from "../../core/utils.js";
import { todayISO } from "../../core/dates.js";
import { createDateField } from "../../core/datePicker.js";
import { navigate } from "../../core/nav.js";

export const STORE_KEY = "payment-vouchers"; // المستندات تُحفظ لكل قسم على حدة
const ACCOUNTS_STORE = "accounts"; // الدليل المحاسبي (مشترك لكل الأقسام)

/* ================== أدوات ================== */
// المبالغ تُحسب بالألف (3 خانات عشرية) لتفادي أخطاء الكسور العشرية
const toMilli = (text) => {
  const n = parseFloat(toLatin(text).replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) : 0;
};
const fmtMilli = (m) =>
  (m / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 });

// الجذر = أول رقمين من رقم الدليل (مثل 11 أو 12 أو 22)
const rootOf = (accNumber) => accNumber.slice(0, 2);

/* ================== بناء الصفحة ================== */
const el = document.createElement("section");
el.id = "page-payment";
el.className = "page hidden";
el.innerHTML = `
  <h2 class="page-title">مستند صرف <span class="dept-badge"></span></h2>

  <div class="edit-banner hidden">
    وضع التعديل: المستند رقم <b class="edit-number"></b>
  </div>

  <div class="voucher-form">
    <label class="field"><span>رقم المستند <em class="req">*</em></span>
      <input class="f-number" type="text" autocomplete="off" /></label>
    <div class="field"><span>تاريخ المستند <em class="req">*</em></span>
      <div class="host-date"></div></div>
    <label class="field span-2"><span>المستفيد</span>
      <input class="f-beneficiary" type="text" autocomplete="off" /></label>

    <label class="field"><span>رقم الصك</span>
      <input class="f-cheque-number" type="text" autocomplete="off" /></label>
    <div class="field"><span>تاريخ الصك</span>
      <div class="host-cheque-date"></div></div>
    <label class="field"><span>العملة</span>
      <select class="f-currency"></select></label>
    <label class="field"><span>رقم اليومية</span>
      <input class="f-journal" type="text" autocomplete="off" /></label>

    <label class="field span-2"><span>المحاسب</span>
      <input class="f-accountant" type="text" autocomplete="off" /></label>
    <label class="field span-2"><span>المدير</span>
      <input class="f-manager" type="text" autocomplete="off" /></label>

    <label class="field span-4"><span>البيان</span>
      <textarea class="f-statement"></textarea></label>

    <label class="check span-4">
      <input class="f-cancelled" type="checkbox" /> بطال
    </label>
  </div>

  <div class="lines-wrap">
    <table class="lines-table">
      <thead>
        <tr>
          <th class="c-debit">مدين</th>
          <th class="c-credit">دائن</th>
          <th class="c-acc">رقم الدليل</th>
          <th class="c-name">اسم الدليل</th>
          <th class="c-del"></th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>
  </div>
  <button class="btn btn-light btn-add-line" type="button">+ إضافة سطر</button>

  <div class="totals">
    <div class="total-box"><span>مجموع المدين</span><strong class="sum-debit">0</strong></div>
    <div class="total-box"><span>مجموع الدائن</span><strong class="sum-credit">0</strong></div>
    <p class="balance-note"></p>
    <p class="root-note"></p>
  </div>

  <div class="voucher-actions">
    <button class="btn btn-primary btn-save" type="button">حفظ المستند</button>
    <button class="btn btn-light btn-new" type="button">مستند جديد</button>
  </div>
  <p class="form-error error"></p>
  <p class="form-success"></p>
`;

const tbody = $("tbody", el);
let accountMap = new Map(); // رقم الدليل -> اسم الدليل
let formDept = null;
let editingId = null; // null = مستند جديد
let editingScope = null; // القسم الذي حُفظ فيه المستند الجاري تعديله
let messageTimer = null;

// حقلا التاريخ (تقويم عربي)
const docDate = createDateField();
const chequeDate = createDateField();
$(".host-date", el).appendChild(docDate.el);
$(".host-cheque-date", el).appendChild(chequeDate.el);

// قائمة العملات
for (const currency of CURRENCIES) {
  const option = document.createElement("option");
  option.value = currency;
  option.textContent = currency;
  $(".f-currency", el).appendChild(option);
}

/* ================== الدليل المحاسبي ================== */
function refreshAccounts() {
  accountMap = new Map(
    loadRows(ACCOUNTS_STORE, "all").map((r) => [r.number, r.name]),
  );
}

function updateName(tr) {
  const number = $(".in-acc", tr).value.trim();
  const span = $(".acc-name", tr);
  if (!number) {
    span.textContent = "";
    span.classList.remove("missing");
    return;
  }
  const name = accountMap.get(number);
  span.textContent = name ?? "غير موجود في الدليل";
  span.classList.toggle("missing", !name);
}

/* ================== أسطر الجدول ================== */
function addLine() {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td class="c-debit"><input class="in-debit amount" inputmode="decimal" autocomplete="off" /></td>
    <td class="c-credit"><input class="in-credit amount" inputmode="decimal" autocomplete="off" /></td>
    <td class="c-acc"><input class="in-acc" type="text" autocomplete="off" /></td>
    <td class="c-name"><span class="acc-name"></span></td>
    <td class="c-del"><button class="btn btn-small btn-danger btn-del" type="button">حذف</button></td>
  `;
  tbody.appendChild(tr);
  return tr;
}

// لا يمكن إدخال مدين ودائن في نفس السطر: عند الكتابة في أحدهما يُقفل الآخر
function syncLock(tr) {
  const debit = $(".in-debit", tr);
  const credit = $(".in-credit", tr);
  const hasDebit = debit.value.trim() !== "";
  const hasCredit = credit.value.trim() !== "";
  debit.disabled = hasCredit && !hasDebit;
  credit.disabled = hasDebit && !hasCredit;
}

function removeLine(tr) {
  if (tbody.children.length > 1) {
    tr.remove();
  } else {
    // آخر سطر: نفرّغه بدل حذفه
    tr.querySelectorAll("input").forEach((i) => (i.value = ""));
    updateName(tr);
    syncLock(tr);
  }
}

function updateTotals() {
  let debit = 0;
  let credit = 0;
  const roots = new Set();

  tbody.querySelectorAll("tr").forEach((tr) => {
    debit += toMilli($(".in-debit", tr).value);
    credit += toMilli($(".in-credit", tr).value);
    const acc = $(".in-acc", tr).value.trim();
    if (acc) roots.add(rootOf(acc));
  });

  $(".sum-debit", el).textContent = fmtMilli(debit);
  $(".sum-credit", el).textContent = fmtMilli(credit);

  const note = $(".balance-note", el);
  if (debit === 0 && credit === 0) {
    note.textContent = "";
    note.className = "balance-note";
  } else if (debit === credit) {
    note.textContent = "✓ المدين والدائن متطابقان";
    note.className = "balance-note ok";
  } else {
    note.textContent = `المدين والدائن غير متطابقين، الفرق: ${fmtMilli(Math.abs(debit - credit))}`;
    note.className = "balance-note bad";
  }

  // الجذور المستعملة: يجب أن تكون كلها جذراً واحداً
  const rootNote = $(".root-note", el);
  if (roots.size === 0) {
    rootNote.textContent = "";
    rootNote.className = "root-note";
  } else if (roots.size === 1) {
    rootNote.textContent = `جذر المستند: ${[...roots][0]}`;
    rootNote.className = "root-note ok";
  } else {
    rootNote.textContent = `الأسطر على أكثر من جذر (${[...roots].join("، ")}): يجب أن تكون كلها على جذر واحد`;
    rootNote.className = "root-note bad";
  }
}

tbody.addEventListener("input", (e) => {
  const target = e.target;
  const tr = target.closest("tr");
  if (target.classList.contains("amount")) {
    target.value = toLatin(target.value).replace(/[^\d.,]/g, "");
    syncLock(tr);
  }
  if (target.classList.contains("in-acc")) {
    target.value = toLatin(target.value).replace(/\s/g, "");
    updateName(tr);
  }
  updateTotals();
});

// المبلغ: بدون فواصل أثناء الكتابة، ومع فواصل الآلاف عند الخروج من الحقل
tbody.addEventListener("focusin", (e) => {
  if (e.target.classList.contains("amount")) {
    e.target.value = e.target.value.replace(/,/g, "");
  }
});
tbody.addEventListener("focusout", (e) => {
  if (e.target.classList.contains("amount")) {
    const milli = toMilli(e.target.value);
    e.target.value = milli ? fmtMilli(milli) : "";
    syncLock(e.target.closest("tr"));
  }
});

tbody.addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-del");
  if (!btn) return;
  removeLine(btn.closest("tr"));
  updateTotals();
});

$(".btn-add-line", el).addEventListener("click", () => {
  addLine().querySelector(".in-debit").focus();
});

/* ================== الرسائل ================== */
function message(type, text) {
  const error = $(".form-error", el);
  const success = $(".form-success", el);
  error.textContent = type === "error" ? text : "";
  success.textContent = type === "ok" ? text : "";

  clearTimeout(messageTimer);
  if (text) {
    messageTimer = setTimeout(() => {
      error.textContent = "";
      success.textContent = "";
    }, 6000);
  }
}

/* ================== وضع التعديل ================== */
function setEditMode(doc) {
  const on = Boolean(doc);
  $(".edit-banner", el).classList.toggle("hidden", !on);
  $(".edit-number", el).textContent = doc ? doc.number : "";
  $(".btn-save", el).textContent = on ? "حفظ التعديل" : "حفظ المستند";
  $(".btn-new", el).textContent = on ? "إلغاء التعديل" : "مستند جديد";
}

/* ================== مستند جديد ================== */
function resetForm() {
  editingId = null;
  editingScope = null;
  setEditMode(null);

  for (const cls of [
    ".f-number",
    ".f-beneficiary",
    ".f-cheque-number",
    ".f-journal",
    ".f-manager",
    ".f-statement",
  ]) {
    $(cls, el).value = "";
  }
  docDate.setValue(todayISO());
  chequeDate.setValue("");
  $(".f-currency", el).value = CURRENCIES[0];
  $(".f-cancelled", el).checked = false;
  $(".f-accountant", el).value = state.user?.name ?? ""; // يمكن تغييره

  tbody.replaceChildren();
  addLine();
  addLine();
  updateTotals();
  message("", "");
}

// يُستدعى من صفحة الكشف: يملأ الحقول بمستند محفوظ
function loadForEdit(doc) {
  refreshAccounts();
  resetForm();
  editingId = doc.id;
  editingScope = doc.scope;
  formDept = state.dept;
  setEditMode(doc);

  $(".f-number", el).value = doc.number;
  docDate.setValue(doc.date);
  $(".f-beneficiary", el).value = doc.beneficiary ?? "";
  $(".f-cheque-number", el).value = doc.chequeNumber ?? "";
  chequeDate.setValue(doc.chequeDate ?? "");
  $(".f-currency", el).value = doc.currency ?? CURRENCIES[0];
  $(".f-journal", el).value = doc.journalNumber ?? "";
  $(".f-accountant", el).value = doc.accountant ?? "";
  $(".f-manager", el).value = doc.manager ?? "";
  $(".f-statement", el).value = doc.statement ?? "";
  $(".f-cancelled", el).checked = Boolean(doc.cancelled);

  tbody.replaceChildren();
  for (const line of doc.lines?.length ? doc.lines : [{}]) {
    const tr = addLine();
    $(".in-debit", tr).value = line.debit
      ? fmtMilli(Math.round(line.debit * 1000))
      : "";
    $(".in-credit", tr).value = line.credit
      ? fmtMilli(Math.round(line.credit * 1000))
      : "";
    $(".in-acc", tr).value = line.accountNumber ?? "";
    updateName(tr);
    syncLock(tr);
  }
  updateTotals();
}

/* ================== الحفظ ================== */
function save() {
  const number = toLatin($(".f-number", el).value).trim();
  const date = docDate.getValue();
  const cancelled = $(".f-cancelled", el).checked;

  // الحقلان الإلزاميان الوحيدان: رقم المستند وتاريخه
  if (!number) return message("error", "أدخل رقم المستند");
  if (!date) return message("error", "اختر تاريخ المستند");

  // المستند الجديد يُحفظ في القسم المختار حالياً (وإذا كان "الكل" يظهر في كل الأقسام)
  // والمستند المعدَّل يبقى في قسمه الأصلي
  const scope = editingId ? editingScope : state.dept;
  const docs = loadRows(STORE_KEY, scope);

  // رقم المستند لا يتكرر بين المستندات التي تظهر معاً في هذا القسم
  if (
    loadVisible(STORE_KEY, scope).some(
      (d) => d.number === number && d.id !== editingId,
    )
  ) {
    return message("error", "رقم المستند موجود مسبقاً في هذا القسم");
  }

  // ===== قراءة أسطر الجدول =====
  const lines = [];
  let debit = 0;
  let credit = 0;

  const rows = [...tbody.querySelectorAll("tr")];
  for (let index = 0; index < rows.length; index++) {
    const tr = rows[index];
    const debitText = $(".in-debit", tr).value.trim();
    const creditText = $(".in-credit", tr).value.trim();
    const accNumber = $(".in-acc", tr).value.trim();

    // سطر فارغ تماماً: نتجاوزه
    if (!debitText && !creditText && !accNumber) continue;

    const d = toMilli(debitText);
    const c = toMilli(creditText);
    const accName = accountMap.get(accNumber) ?? "";

    // المستند البطال لا يُفحص جدوله
    if (!cancelled) {
      const n = index + 1;
      if (!accNumber) return message("error", `السطر ${n}: أدخل رقم الدليل`);
      if (!accName)
        return message(
          "error",
          `السطر ${n}: رقم الدليل غير موجود في الدليل المحاسبي`,
        );
      if (d && c)
        return message(
          "error",
          `السطر ${n}: لا يمكن إدخال مدين ودائن في نفس السطر`,
        );
      if (!d && !c)
        return message("error", `السطر ${n}: أدخل مبلغ المدين أو الدائن`);
    }

    debit += d;
    credit += c;
    lines.push({
      debit: d / 1000,
      credit: c / 1000,
      accountNumber: accNumber,
      accountName: accName,
    });
  }

  // ===== فحوصات المستند كله (بعد انتهاء الحلقة) =====
  if (!cancelled) {
    if (lines.length === 0) {
      return message("error", "أضف سطراً واحداً على الأقل في الجدول");
    }

    // جميع الأسطر على نفس الجذر (أول رقمين من رقم الدليل)
    const roots = [...new Set(lines.map((l) => rootOf(l.accountNumber)))];
    if (roots.length > 1) {
      return message(
        "error",
        `جميع أسطر المستند يجب أن تكون على نفس الجذر (أول رقمين من رقم الدليل). الجذور الموجودة: ${roots.join("، ")}`,
      );
    }

    if (debit !== credit) {
      return message(
        "error",
        `لا يمكن حفظ المستند: المدين والدائن غير متطابقين (الفرق ${fmtMilli(Math.abs(debit - credit))})`,
      );
    }
  }

  const data = {
    number,
    date,
    beneficiary: $(".f-beneficiary", el).value.trim(),
    chequeNumber: toLatin($(".f-cheque-number", el).value).trim(),
    chequeDate: chequeDate.getValue(),
    currency: $(".f-currency", el).value,
    journalNumber: toLatin($(".f-journal", el).value).trim(),
    accountant: $(".f-accountant", el).value.trim(),
    manager: $(".f-manager", el).value.trim(),
    statement: $(".f-statement", el).value.trim(),
    cancelled,
    lines,
    totalDebit: debit / 1000,
    totalCredit: credit / 1000,
  };

  // حفظ التعديل
  if (editingId) {
    const index = docs.findIndex((d) => d.id === editingId);
    if (index === -1) return message("error", "هذا المستند لم يعد موجوداً");
    docs[index] = {
      ...docs[index],
      ...data,
      updatedAt: new Date().toISOString(),
    };
    saveRows(STORE_KEY, scope, docs);
    resetForm();
    navigate("page-payment-report"); // الرجوع إلى الكشف
    return;
  }

  // مستند جديد
  docs.push({ id: Date.now(), ...data, createdAt: new Date().toISOString() });
  saveRows(STORE_KEY, scope, docs);
  resetForm();
  message("ok", `تم حفظ مستند الصرف رقم ${number}`);
}

$(".btn-save", el).addEventListener("click", save);
$(".btn-new", el).addEventListener("click", () => {
  const wasEditing = editingId !== null;
  resetForm();
  if (wasEditing) navigate("page-payment-report"); // إلغاء التعديل
});

/* ================== واجهة الصفحة ================== */
// تُنفَّذ كلما فُتحت الصفحة أو تغيّر القسم
function render() {
  refreshAccounts();
  $(".dept-badge", el).textContent =
    state.dept === "all"
      ? "الكل: يظهر المستند في جميع الأقسام"
      : DEPARTMENTS[state.dept];

  // المستندات لكل قسم: عند تغيير القسم نبدأ مستنداً جديداً حتى لا يُحفظ في القسم الخطأ
  if (formDept !== null && formDept !== state.dept) resetForm();
  formDept = state.dept;

  tbody.querySelectorAll("tr").forEach(updateName);
}

resetForm();

export default {
  id: "page-payment",
  el,
  render,
  reset: resetForm,
  loadForEdit,
};
