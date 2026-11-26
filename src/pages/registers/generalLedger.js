import { state, DEPARTMENTS } from '../../core/state.js'
import { loadVisible } from '../../core/storage.js'
import { $ } from '../../core/utils.js'
import { formatDate } from '../../core/dates.js'
import { createDateField } from '../../core/datePicker.js'
import { createAccountPicker } from '../../core/accountPicker.js'
import { createLoader, createRowRenderer } from '../../core/loader.js'
import { STORE_KEY as PAYMENT_STORE } from '../documents/payment.js'

/* ================== المبالغ ================== */
// المبالغ تُحسب بالألف (3 خانات عشرية) لتفادي أخطاء الكسور العشرية
const toMilli = (n) => Math.round((Number(n) || 0) * 1000)
const fmtMilli = (m) => (m / 1000).toLocaleString('en-US', { maximumFractionDigits: 3 })

// رصيد موقّع (المدين موجب والدائن سالب) يُعرض بالقيمة وجهته
function balanceText(signed) {
    if (signed === 0) return '0'
    return `${fmtMilli(Math.abs(signed))} ${signed > 0 ? 'مدين' : 'دائن'}`
}

const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

// المستند رقم 1 هو المستند الافتتاحي
const isOpeningDoc = (doc) => parseInt(doc.number, 10) === 1

/* ================== مصادر الحركة ================== */
// كل نوع مستند له دالة ترجع: الرصيد الافتتاحي (موقّع) + حركات الحساب في الفترة.
// لاحقاً نضيف هنا: مستند القيد ووصل القبض.
function paymentMovements(accountNumber, from, to) {
    const docs = loadVisible(PAYMENT_STORE, state.dept).filter((doc) => !doc.cancelled)

    let opening = 0
    const rows = []

    for (const doc of docs) {
        const lines = (doc.lines ?? []).filter(
            (line) => line.accountNumber === accountNumber && (toMilli(line.debit) || toMilli(line.credit))
        )
        if (!lines.length) continue

        // المستند الافتتاحي: يدخل في الرصيد الافتتاحي ولا يُعد حركة (حتى لا يُحسب مرتين)
        if (isOpeningDoc(doc)) {
            for (const line of lines) opening += toMilli(line.debit) - toMilli(line.credit)
            continue
        }

        if (doc.date < from || doc.date > to) continue

        // كل سطر في المستند يرجع لنفس الحساب = حركة مستقلة
        for (const line of lines) {
            rows.push({
                id: doc.id,
                date: doc.date,
                number: doc.number,
                type: 'مستند صرف',
                details: doc.statement ?? '',
                debit: toMilli(line.debit),
                credit: toMilli(line.credit),
            })
        }
    }

    return { opening, rows }
}

const SOURCES = [paymentMovements]

/* ================== بناء الصفحة ================== */
const el = document.createElement('section')
el.id = 'page-general-ledger'
el.className = 'page hidden'
el.innerHTML = `
  <h2 class="page-title">سجل الأستاذ العام / <span class="dept-name"></span></h2>

  <div class="filter-box ledger-filter">
    <div class="field"><span>الحساب (بالاسم أو الرقم) <em class="req">*</em></span>
      <div class="host-account"></div></div>
    <div class="field"><span>من تاريخ <em class="req">*</em></span>
      <div class="host-from"></div></div>
    <div class="field"><span>إلى تاريخ <em class="req">*</em></span>
      <div class="host-to"></div></div>
    <div class="filter-actions">
      <button class="btn btn-primary l-search" type="button">بحث</button>
      <button class="btn btn-light l-clear" type="button">مسح</button>
    </div>
  </div>
  <p class="form-error error"></p>
  <p class="start-hint"></p>

  <div class="ledger-results hidden">
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
      <p class="empty hidden"></p>
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
  </div>
`

const picker = createAccountPicker()
const fromField = createDateField()
const toField = createDateField()
$('.host-account', el).appendChild(picker.el)
$('.host-from', el).appendChild(fromField.el)
$('.host-to', el).appendChild(toField.el)

const tbody = $('tbody', el)

// لودر عند كثرة الحركات
const loader = createLoader($('.table-wrap', el))
const drawRows = createRowRenderer({ tbody, loader })

let searched = false
let errorTimer = null

/* ================== أدوات ================== */
function showError(text) {
    const box = $('.form-error', el)
    box.textContent = text
    clearTimeout(errorTimer)
    if (text) errorTimer = setTimeout(() => (box.textContent = ''), 6000)
}

function cell(text, className) {
    const td = document.createElement('td')
    td.textContent = text ?? ''
    if (className) td.className = className
    return td
}

function buildRow(row) {
    const tr = document.createElement('tr')
    tr.append(
        cell(row.debit ? fmtMilli(row.debit) : '', 'c-debit'),
        cell(row.credit ? fmtMilli(row.credit) : '', 'c-credit'),
        cell(row.number, 'c-docno'),
        cell(formatDate(row.date), 'c-date'),
        cell(row.type, 'c-type'),
        cell(row.details, 'c-details')
    )
    return tr
}

/* ================== البحث ================== */
function search() {
    showError('')

    // المدخلات الثلاثة إلزامية
    const account = picker.getValue()
    const from = fromField.getValue()
    const to = toField.getValue()

    if (!account) return showError('اختر الحساب من القائمة (اكتب الاسم أو الرقم ثم اختر)')
    if (!from) return showError('اختر تاريخ البداية (من تاريخ)')
    if (!to) return showError('اختر تاريخ النهاية (إلى تاريخ)')
    if (from > to) return showError('تاريخ البداية يجب أن يكون قبل تاريخ النهاية')

    // جمع الحركات من كل مصادر المستندات
    let opening = 0
    let rows = []
    for (const load of SOURCES) {
        const result = load(account.number, from, to)
        opening += result.opening
        rows = rows.concat(result.rows)
    }
    rows.sort((a, b) => compareText(a.date, b.date) || a.id - b.id)

    // المجاميع
    const totalDebit = rows.reduce((sum, row) => sum + row.debit, 0)
    const totalCredit = rows.reduce((sum, row) => sum + row.credit, 0)

    // رصيد الحركة: الأكبر ناقص الأصغر (مدين - دائن، وإذا كان الدائن أكبر نعكس)
    const movement = totalDebit - totalCredit
    // الرصيد النهائي = الرصيد الافتتاحي + رصيد الحركة (بحسب جهة كل منهما)
    const final = opening + movement

    // ===== العرض =====
    searched = true
    $('.ledger-results', el).classList.remove('hidden')
    $('.start-hint', el).textContent = ''

    $('.i-name', el).textContent = account.name
    $('.i-number', el).textContent = account.number
    $('.i-opening', el).textContent = balanceText(opening)
    $('.i-period', el).textContent = `من ${formatDate(from)} إلى ${formatDate(to)}`

    $('.count', el).textContent = `عدد الحركات: ${rows.length}`
    const empty = $('.empty', el)
    empty.textContent = 'لا توجد حركات على هذا الحساب في الفترة المحددة'
    empty.classList.toggle('hidden', rows.length > 0)

    $('.t-debit', el).textContent = fmtMilli(totalDebit)
    $('.t-credit', el).textContent = fmtMilli(totalCredit)

    $('.s-from', el).textContent = formatDate(from)
    $('.s-to', el).textContent = formatDate(to)
    $('.s-movement', el).textContent = balanceText(movement)
    $('.s-opening', el).textContent = balanceText(opening)
    $('.s-final', el).textContent = balanceText(final)

    drawRows(rows, buildRow)
}

function clearAll() {
    picker.clear()
    fromField.setValue('')
    toField.setValue('')
    showError('')
    searched = false
    $('.ledger-results', el).classList.add('hidden')
    drawRows([], buildRow)
    $('.start-hint', el).textContent = 'اختر الحساب والفترة ثم اضغط «بحث»'
}

/* ================== الأحداث ================== */
$('.l-search', el).addEventListener('click', search)
$('.l-clear', el).addEventListener('click', clearAll)

/* ================== واجهة الصفحة ================== */
function render() {
    // اسم القسم بجانب العنوان: الكل أو اسم القسم
    $('.dept-name', el).textContent = DEPARTMENTS[state.dept]
    if (searched) search() // تحديث النتائج (بعد تغيير قسم أو تعديل مستند)
}

clearAll()

export default { id: 'page-general-ledger', el, render, reset: clearAll }