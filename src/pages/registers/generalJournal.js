import { state, DEPARTMENTS } from '../../core/state.js'
import { loadRows, loadVisible } from '../../core/storage.js'
import { $, toLatin } from '../../core/utils.js'
import { formatDate } from '../../core/dates.js'
import { createDateField } from '../../core/datePicker.js'
import { STORE_KEY as PAYMENT_STORE } from '../documents/payment.js'

const ACCOUNTS_STORE = 'accounts' // الدليل المحاسبي (مشترك لكل الأقسام)

/* ================== مصادر السجل ================== */
// كل نوع مستند له دالة تحوّل مستنداته إلى أسطر السجل.
// لاحقاً نضيف هنا: مستند القيد ووصل القبض.
function paymentEntries(accountName) {
    return loadVisible(PAYMENT_STORE, state.dept)
        .filter((doc) => !doc.cancelled) // المستند البطال لا يظهر في السجل
        .map((doc) => {
            const lines = doc.lines ?? []
            return {
                id: doc.id,
                date: doc.date ?? '',
                type: 'مستند صرف',
                debitNames: lines.filter((l) => l.debit > 0).map(accountName),
                creditNames: lines.filter((l) => l.credit > 0).map(accountName),
                statement: doc.statement ?? '',
                chequeNumber: doc.chequeNumber ?? '',
                payNo: doc.number, // مستند الصرف
                jvNo: '', // مستند القيد (لا ينطبق على مستند الصرف)
                journalNo: doc.journalNumber ?? '', // ت اليومية
                amount: doc.totalDebit,
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
    <div class="filter-actions">
      <button class="btn btn-primary g-show" type="button">عرض</button>
      <button class="btn btn-light g-clear" type="button">مسح</button>
    </div>
  </div>
  <p class="form-error error"></p>
  <p class="count"></p>

  <div class="table-wrap">
    <table class="reg-table">
      <thead>
        <tr>
          <th class="c-seq">ت</th>
          <th class="c-date">التاريخ</th>
          <th class="c-debit">من</th>
          <th class="c-credit">إلى</th>
          <th class="c-stmt">البيان</th>
          <th class="c-cheque">رقم الصك</th>
          <th class="c-pay">مستند الصرف</th>
          <th class="c-jv">مستند القيد</th>
          <th class="c-type">النوع</th>
          <th class="c-jseq">ت اليومية</th>
          <th class="c-amount">مبلغ المعاملة</th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>
    <p class="empty"></p>
  </div>
`

const tbody = $('tbody', el)
const fromField = createDateField()
const toField = createDateField()
$('.host-from', el).appendChild(fromField.el)
$('.host-to', el).appendChild(toField.el)

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
        accounts.get(line.accountNumber) ?? line.accountName ?? line.accountNumber

    // السجل يعتمد على الفترة فقط. السنة المالية لا تفلتر شيئاً
    const entries = SOURCES.flatMap((load) => load(accountName))
        .filter((e) => e.date >= from && e.date <= to)

    // ت: تسلسل المستندات بالترتيب الزمني، ويبقى لكل مستند مهما تغيّر الترتيب المعروض
    entries.sort((a, b) => compareText(a.date, b.date) || a.id - b.id)
    entries.forEach((entry, index) => (entry.seq = index + 1))

    // ثم الترتيب الذي اختاره المستخدم
    sortEntries(entries, $('.g-sort', el).value)

    fiscalYear = year
    searched = true
    renderRows(entries)
}

function renderRows(entries) {
    tbody.replaceChildren()
    $('.count', el).textContent =
        `السنة المالية: ${fiscalYear} — عدد المستندات: ${entries.length}`
    showEmpty(entries.length ? '' : 'لا توجد مستندات في هذه الفترة')

    for (const entry of entries) {
        const tr = document.createElement('tr')
        tr.append(
            cell(entry.seq),
            cell(formatDate(entry.date)),
            namesCell(entry.debitNames),
            namesCell(entry.creditNames),
            cell(entry.statement, 'c-stmt'),
            cell(entry.chequeNumber),
            cell(entry.payNo),
            cell(entry.jvNo),
            cell(entry.type),
            cell(entry.journalNo),
            cell(fmtAmount(entry.amount))
        )
        tbody.append(tr)
    }
}

function clearFilters() {
    $('.g-year', el).value = ''
    $('.g-sort', el).value = 'date-asc'
    fromField.setValue('')
    toField.setValue('')
    showError('')
    fiscalYear = ''
    searched = false
    tbody.replaceChildren()
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

// تغيير الترتيب بعد عرض السجل يعيد ترتيبه فوراً
$('.g-sort', el).addEventListener('change', () => {
    if (searched) search()
})

/* ================== واجهة الصفحة ================== */
function render() {
    $('.dept-badge', el).textContent = DEPARTMENTS[state.dept]
    if (searched) search() // تحديث النتائج (بعد تغيير قسم أو تعديل مستند)
}

clearFilters()

export default {
    id: 'page-general-journal',
    el,
    render,
    reset: clearFilters,
    getFiscalYear: () => fiscalYear, // سنستعملها عند بناء الطباعة
}