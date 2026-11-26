import { state, DEPARTMENTS } from '../../core/state.js'
import { loadRows, loadVisible } from '../../core/storage.js'
import { $, toLatin } from '../../core/utils.js'
import { formatDate } from '../../core/dates.js'
import { createDateField } from '../../core/datePicker.js'
import { createLoader, createRowRenderer } from '../../core/loader.js'
import { STORE_KEY as PAYMENT_STORE } from '../documents/payment.js'

const ACCOUNTS_STORE = 'accounts' // الدليل المحاسبي (مشترك لكل الأقسام)

// نص "مذكورين" عند اختيار إظهار التفاصيل = من مذكورين
const MANY_DEBIT = 'من مذكورين'
const MANY_CREDIT = 'إلى مذكورين'

// أعمدة السجل الثابتة (الأرقام = العرض بالبكسل)
const FIXED_COLUMNS = [
  { cls: 'c-seq', label: 'ت', width: 60 },
  { cls: 'c-date', label: 'التاريخ', width: 105 },
  { cls: 'c-debit', label: 'من', width: 400 },
  { cls: 'c-credit', label: 'إلى', width: 400 },
  { cls: 'c-stmt', label: 'البيان', width: 400 },
  { cls: 'c-cheque', label: 'رقم الصك', width: 70 },
  { cls: 'c-pay', label: 'مستند الصرف', width: 70 },
  { cls: 'c-jv', label: 'مستند القيد', width: 70 },
  { cls: 'c-type', label: 'النوع', width: 150 },
  { cls: 'c-jseq', label: 'ت اليومية', width: 70 },
  { cls: 'c-amount', label: 'مبلغ المعاملة', width: 140 },
]
const ROOT_COL_WIDTH = 130 // عرض كل عمود (مدين أو دائن) داخل مجموعة الجذر

// الجذر = أول رقمين من رقم الدليل
const rootOf = (accNumber) => String(accNumber ?? '').slice(0, 2)

/* ================== مصادر السجل ================== */
// كل نوع مستند له دالة تحوّل مستنداته إلى أسطر السجل.
// cancelled = false: المستندات العادية، true: المستندات البطالة فقط
// لاحقاً نضيف هنا: مستند القيد ووصل القبض.
function paymentEntries(accountName, cancelled) {
  return loadVisible(PAYMENT_STORE, state.dept)
    .filter((doc) => Boolean(doc.cancelled) === cancelled)
    .map((doc) => {
      const lines = doc.lines ?? []

      // مجموع المدين والدائن لكل جذر (كل سطر يُحسب تحت جذره حتى لو تعددت الجذور في المستند)
      const rootTotals = new Map()
      for (const line of lines) {
        const root = rootOf(line.accountNumber)
        if (!root) continue
        const total = rootTotals.get(root) ?? { debit: 0, credit: 0 }
        total.debit += Number(line.debit) || 0
        total.credit += Number(line.credit) || 0
        rootTotals.set(root, total)
      }

      return {
        id: doc.id,
        date: doc.date ?? '',
        type: cancelled ? 'مستند صرف بطال' : 'مستند صرف',
        debitNames: lines.filter((l) => l.debit > 0).map(accountName),
        creditNames: lines.filter((l) => l.credit > 0).map(accountName),
        statement: doc.statement ?? '',
        chequeNumber: doc.chequeNumber ?? '',
        payNo: doc.number, // مستند الصرف
        jvNo: '', // مستند القيد (لا ينطبق على مستند الصرف)
        journalNo: doc.journalNumber ?? '', // ت اليومية
        amount: doc.totalDebit,
        rootTotals,
      }
    })
}

const SOURCES = [paymentEntries]

/* ================== بناء الصفحة ================== */
const el = document.createElement('section')
el.id = 'page-general-journal'
el.className = 'page hidden'
el.innerHTML = `
  <h2 class="page-title">سجل اليومية العامة <span class="dept-badge"></span></h2>

  <div class="mode-tabs">
    <button type="button" class="tab active" data-mode="normal">المستندات</button>
    <button type="button" class="tab" data-mode="cancelled">المستندات البطالة</button>
  </div>

  <div class="filter-box journal-filter">
    <div class="field"><span>من تاريخ <em class="req">*</em></span>
      <div class="host-from"></div></div>
    <div class="field"><span>إلى تاريخ <em class="req">*</em></span>
      <div class="host-to"></div></div>
    <label class="field"><span>السنة المالية <em class="req">*</em></span>
      <input class="g-year" type="text" inputmode="numeric" maxlength="4"
             placeholder="مثال: 2022" autocomplete="off" /></label>
    <label class="field"><span>الترتيب</span>
      <select class="g-sort">
        <option value="date-asc">حسب التاريخ تصاعدي</option>
        <option value="date-desc">حسب التاريخ تنازلي</option>
        <option value="pay-asc">حسب مستند الصرف تصاعدي</option>
        <option value="pay-desc">حسب مستند الصرف تنازلي</option>
      </select></label>
    <label class="field"><span>إظهار التفاصيل</span>
      <select class="g-detail">
        <option value="all">كل التفاصيل</option>
        <option value="many">من مذكورين</option>
      </select></label>
    <div class="filter-actions">
      <button class="btn btn-primary g-show" type="button">عرض</button>
      <button class="btn btn-light g-clear" type="button">مسح</button>
    </div>
  </div>
  <p class="form-error error"></p>
  <p class="count"></p>

  <div class="table-wrap">
    <table class="reg-table">
      <colgroup></colgroup>
      <thead></thead>
      <tbody></tbody>
    </table>
    <p class="empty"></p>
  </div>
`

const table = $('.reg-table', el)
const tbody = $('tbody', el)
const fromField = createDateField()
const toField = createDateField()
$('.host-from', el).appendChild(fromField.el)
$('.host-to', el).appendChild(toField.el)

// لودر عند كثرة المستندات
const loader = createLoader($('.table-wrap', el))
const drawRows = createRowRenderer({ tbody, loader })

let mode = 'normal' // normal | cancelled
let searched = false
let errorTimer = null
let fiscalYear = '' // السنة المالية المعتمدة في آخر عرض (للطباعة لاحقاً)

/* ================== أدوات ================== */
function showError(text) {
  const box = $('.form-error', el)
  box.textContent = text
  clearTimeout(errorTimer)
  if (text) errorTimer = setTimeout(() => (box.textContent = ''), 6000)
}

function showEmpty(text) {
  const empty = $('.empty', el)
  empty.textContent = text ?? ''
  empty.classList.toggle('hidden', !text)
}

function cell(text, className) {
  const td = document.createElement('td')
  td.textContent = text ?? ''
  if (className) td.className = className
  return td
}

// خلية فيها عدة أسماء: كل اسم في سطر مستقل تحت الآخر
function namesCell(names) {
  const td = document.createElement('td')
  for (const name of names) {
    const line = document.createElement('div')
    line.className = 'acc-line'
    line.textContent = name
    td.append(line)
  }
  return td
}

// جهة المدين أو الدائن: كل التفاصيل، أو "مذكورين" إذا كان فيها سطران فأكثر
function sideCell(names, detailMode, manyText) {
  return namesCell(detailMode === 'many' && names.length > 1 ? [manyText] : names)
}

// مقارنة نصية عادية (للتواريخ بصيغة 2026-11-19)
const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
// مقارنة رقمية ذكية (للأرقام مثل 2 قبل 10)
const compareNumeric = (a, b) => a.localeCompare(b, undefined, { numeric: true })
const fmtAmount = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 3 })

/* ================== الترتيب ================== */
function sortEntries(entries, sortKey) {
  const [field, direction] = sortKey.split('-') // مثل date-asc أو pay-desc
  const sign = direction === 'desc' ? -1 : 1

  return entries.sort((a, b) => {
    if (field === 'date') {
      return (compareText(a.date, b.date) || a.id - b.id) * sign
    }

    // حسب مستند الصرف: من لا يملك رقماً يبقى في الآخر في الاتجاهين
    const pa = String(a.payNo ?? '').trim()
    const pb = String(b.payNo ?? '').trim()
    if (!pa && pb) return 1
    if (pa && !pb) return -1

    // عند تساوي الرقم نرتب بالتاريخ. والتنازلي عكس التصاعدي تماماً
    return (compareNumeric(pa, pb) || compareText(a.date, b.date) || a.id - b.id) * sign
  })
}

/* ================== رأس الجدول ================== */
// roots = [{ root: '11', name: 'اسم الجذر' }, ...]
// لكل جذر مجموعة أعمدة: الاسم / الرقم في الأعلى، وتحته مدين ودائن
function renderHeader(roots) {
  // عرض الأعمدة
  const widths = [
    ...FIXED_COLUMNS.map((c) => c.width),
    ...roots.flatMap(() => [ROOT_COL_WIDTH, ROOT_COL_WIDTH]),
  ]
  const colgroup = $('colgroup', table)
  colgroup.replaceChildren()
  for (const width of widths) {
    const col = document.createElement('col')
    col.style.width = `${width}px`
    colgroup.append(col)
  }
  table.style.width = `${widths.reduce((sum, w) => sum + w, 0)}px`

  // الصف الأول: الأعمدة الثابتة (تمتد على صفين) + اسم كل جذر
  const thead = $('thead', table)
  thead.replaceChildren()
  const row1 = document.createElement('tr')
  const row2 = document.createElement('tr')
  const span = roots.length ? 2 : 1

  for (const column of FIXED_COLUMNS) {
    const th = document.createElement('th')
    th.className = column.cls
    th.rowSpan = span
    th.textContent = column.label
    row1.append(th)
  }

  for (const { root, name } of roots) {
    const group = document.createElement('th')
    group.className = 'root-head'
    group.colSpan = 2
    // الاسم ثم الرقم: الأصول غير المتداولة / 11
    // (إذا لم يوجد حساب بهذا الرقم في الدليل يظهر الرقم وحده)
    group.textContent = name === root ? root : `${name} / ${root}`
    row1.append(group)

    // الصف الثاني: مدين | دائن
    for (const label of ['مدين', 'دائن']) {
      const sub = document.createElement('th')
      sub.textContent = label
      row2.append(sub)
    }
  }

  thead.append(row1)
  if (roots.length) thead.append(row2)
}

/* ================== السجل ================== */
function search() {
  showError('')
  const from = fromField.getValue()
  const to = toField.getValue()
  const year = toLatin($('.g-year', el).value).trim()

  // الحقول الثلاثة إلزامية
  if (!from) return showError('اختر تاريخ البداية (من تاريخ)')
  if (!to) return showError('اختر تاريخ النهاية (إلى تاريخ)')
  if (!year) return showError('أدخل السنة المالية')
  if (!/^\d{4}$/.test(year)) return showError('السنة المالية يجب أن تكون أربعة أرقام، مثل 2022')
  if (from > to) return showError('تاريخ البداية يجب أن يكون قبل تاريخ النهاية')

  // أسماء الحسابات من الدليل المحاسبي الحالي (والاسم المحفوظ في المستند إن لم يوجد)
  const accounts = new Map(loadRows(ACCOUNTS_STORE, 'all').map((r) => [r.number, r.name]))
  const accountName = (line) =>
    accounts.get(line.accountNumber) ?? (line.accountName || line.accountNumber || 'بدون حساب')

  // السجل يعتمد على الفترة فقط. السنة المالية لا تفلتر شيئاً
  const cancelled = mode === 'cancelled'
  const entries = SOURCES.flatMap((load) => load(accountName, cancelled))
    .filter((e) => e.date >= from && e.date <= to)

  // ت: تسلسل المستندات بالترتيب الزمني، ويبقى لكل مستند مهما تغيّر الترتيب المعروض
  entries.sort((a, b) => compareText(a.date, b.date) || a.id - b.id)
  entries.forEach((entry, index) => (entry.seq = index + 1))

  // ثم الترتيب الذي اختاره المستخدم
  sortEntries(entries, $('.g-sort', el).value)

  // الجذور الموجودة في المستندات المعروضة: لكل جذر مجموعة أعمدة
  const roots = [...new Set(entries.flatMap((e) => [...e.rootTotals.keys()]))]
    .sort(compareText)
    .map((root) => ({ root, name: accounts.get(root) ?? root }))

  fiscalYear = year
  searched = true
  renderTable(entries, roots)
}

function buildRow(entry, roots, detailMode) {
  const tr = document.createElement('tr')
  tr.append(
    cell(entry.seq),
    cell(formatDate(entry.date)),
    sideCell(entry.debitNames, detailMode, MANY_DEBIT),
    sideCell(entry.creditNames, detailMode, MANY_CREDIT),
    cell(entry.statement, 'c-stmt'),
    cell(entry.chequeNumber),
    cell(entry.payNo),
    cell(entry.jvNo),
    cell(entry.type),
    cell(entry.journalNo),
    cell(fmtAmount(entry.amount))
  )

  // أعمدة الجذور: مجموع المدين ومجموع الدائن تحت جذر المستند
  for (const { root } of roots) {
    const total = entry.rootTotals.get(root)
    tr.append(
      cell(total?.debit ? fmtAmount(total.debit) : ''),
      cell(total?.credit ? fmtAmount(total.credit) : '')
    )
  }

  return tr
}

function renderTable(entries, roots) {
  const detailMode = $('.g-detail', el).value
  const kind = mode === 'cancelled' ? 'المستندات البطالة — ' : ''

  renderHeader(roots)
  $('.count', el).textContent =
    `${kind}السنة المالية: ${fiscalYear} — عدد المستندات: ${entries.length}`
  showEmpty(entries.length ? '' : 'لا توجد مستندات في هذه الفترة')

  // الرسم على دفعات مع لودر إذا كانت المستندات كثيرة
  drawRows(entries, (entry) => buildRow(entry, roots, detailMode))
}

function clearFilters() {
  $('.g-year', el).value = ''
  $('.g-sort', el).value = 'date-asc'
  $('.g-detail', el).value = 'all'
  fromField.setValue('')
  toField.setValue('')
  showError('')
  fiscalYear = ''
  searched = false
  renderHeader([])
  drawRows([], () => null)
  $('.count', el).textContent = ''
  showEmpty('اختر الفترة وأدخل السنة المالية ثم اضغط «عرض»')
}

/* ================== الأحداث ================== */
$('.g-show', el).addEventListener('click', search)
$('.g-clear', el).addEventListener('click', clearFilters)
$('.g-year', el).addEventListener('input', (e) => {
  e.target.value = toLatin(e.target.value).replace(/\D/g, '')
})
$('.g-year', el).addEventListener('keydown', (e) => {
  if (e.key === 'Enter') search()
})

// تغيير الترتيب أو إظهار التفاصيل بعد عرض السجل يحدّثه فوراً
$('.g-sort', el).addEventListener('change', () => {
  if (searched) search()
})
$('.g-detail', el).addEventListener('change', () => {
  if (searched) search()
})

// التبويبان: سجل المستندات العادية، أو سجل المستندات البطالة
el.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    mode = tab.dataset.mode
    el.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab))
    if (searched) search()
  })
})

/* ================== واجهة الصفحة ================== */
function render() {
  $('.dept-badge', el).textContent = DEPARTMENTS[state.dept]
  if (searched) search() // تحديث النتائج (بعد تغيير قسم أو تعديل مستند)
}

function reset() {
  mode = 'normal'
  el.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.mode === 'normal'))
  clearFilters()
}

reset()

export default {
  id: 'page-general-journal',
  el,
  render,
  reset,
  getFiscalYear: () => fiscalYear, // سنستعملها عند بناء الطباعة
}