import { state, DEPARTMENTS } from '../../core/state.js'
import { loadRows, saveRows, loadVisible } from '../../core/storage.js'
import { $, toLatin } from '../../core/utils.js'
import { formatDate } from '../../core/dates.js'
import { createDateField } from '../../core/datePicker.js'
import { navigate } from '../../core/nav.js'
import { confirmDelete } from '../../core/confirm.js'
import payment, { STORE_KEY } from '../documents/payment.js'

const SEARCH_FIELDS = { number: 'number', cheque: 'chequeNumber', journal: 'journalNumber' }

/* ================== بناء الصفحة ================== */
const el = document.createElement('section')
el.id = 'page-payment-report'
el.className = 'page hidden'
el.innerHTML = `
  <h2 class="page-title">كشف مستندات الصرف <span class="dept-badge"></span></h2>

  <div class="mode-tabs">
    <button type="button" class="tab active" data-mode="normal">المستندات</button>
    <button type="button" class="tab" data-mode="cancelled">المستندات البطالة</button>
  </div>

  <div class="filter-box">
    <label class="field"><span>الكشف بواسطة</span>
      <select class="r-key">
        <option value="number">رقم المستند</option>
        <option value="cheque">رقم الصك</option>
        <option value="journal">رقم اليومية</option>
      </select></label>
    <label class="field"><span>القيمة</span>
      <input class="r-value" type="text" autocomplete="off" /></label>
    <div class="field"><span>من تاريخ</span><div class="host-from"></div></div>
    <div class="field"><span>إلى تاريخ</span><div class="host-to"></div></div>
    <div class="filter-actions">
      <button class="btn btn-primary r-show" type="button">عرض</button>
      <button class="btn btn-light r-clear" type="button">مسح</button>
    </div>
  </div>
  <p class="form-error error"></p>
  <p class="count"></p>

  <div class="table-wrap">
    <table class="rpt-table">
      <thead>
        <tr>
          <th>#</th>
          <th class="c-docno">رقم المستند</th>
          <th class="c-date">التاريخ</th>
          <th class="c-benef">المستفيد</th>
          <th class="c-cheque">رقم الصك</th>
          <th class="c-journal">رقم اليومية</th>
          <th class="c-cur">العملة</th>
          <th class="c-amount">المبلغ</th>
          <th class="c-stmt">البيان</th>
          <th class="c-act">إجراءات</th>
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

let mode = 'normal' // normal | cancelled
let searched = false
let errorTimer = null

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

function button(label, extraClass, onClick) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = `btn btn-small ${extraClass}`.trim()
    btn.textContent = label
    btn.addEventListener('click', onClick)
    return btn
}

const fmtAmount = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 3 })

/* ================== الكشف ================== */
function search() {
    showError('')
    const key = $('.r-key', el).value
    const value = toLatin($('.r-value', el).value).trim()
    const from = fromField.getValue()
    const to = toField.getValue()

    if (from && to && from > to) {
        return showError('تاريخ البداية يجب أن يكون قبل تاريخ النهاية')
    }

    // مستندات القسم + مستندات "الكل".
    // البطالة تظهر في كشفها فقط، والعادية في الكشف العادي فقط
    let docs = loadVisible(STORE_KEY, state.dept).filter(
        (d) => Boolean(d.cancelled) === (mode === 'cancelled')
    )

    if (value) {
        const field = SEARCH_FIELDS[key]
        docs = docs.filter((d) => String(d[field] ?? '').trim() === value)
    }
    if (from) docs = docs.filter((d) => d.date >= from)
    if (to) docs = docs.filter((d) => d.date <= to)

    docs.sort((a, b) =>
        a.date === b.date
            ? a.number.localeCompare(b.number, undefined, { numeric: true })
            : a.date < b.date ? -1 : 1
    )

    searched = true
    renderRows(docs)
}

function renderRows(docs) {
    tbody.replaceChildren()
    $('.count', el).textContent = `عدد المستندات: ${docs.length}`
    showEmpty(docs.length ? '' : 'لا توجد مستندات مطابقة')

    docs.forEach((doc, index) => {
        const tr = document.createElement('tr')
        tr.append(
            cell(index + 1),
            cell(doc.number),
            cell(formatDate(doc.date)),
            cell(doc.beneficiary),
            cell(doc.chequeNumber),
            cell(doc.journalNumber),
            cell(doc.currency),
            cell(fmtAmount(doc.totalDebit))
        )

        // البيان: سطران كحد أقصى والنص الكامل عند تمرير المؤشر
        const stmt = document.createElement('td')
        const clamp = document.createElement('div')
        clamp.className = 'rpt-stmt'
        clamp.textContent = doc.statement ?? ''
        clamp.title = doc.statement ?? ''
        stmt.append(clamp)
        tr.append(stmt)

        const actionsCell = document.createElement('td')
        const actions = document.createElement('div')
        actions.className = 'actions'
        actions.append(
            button('تعديل', '', () => edit(doc)),
            button('حذف', 'btn-danger', () => remove(doc))
        )
        actionsCell.append(actions)
        tr.append(actionsCell)

        tbody.append(tr)
    })
}

function edit(doc) {
    payment.loadForEdit(doc)
    navigate('page-payment')
}

async function remove(doc) {
    const ok = await confirmDelete(`هل تريد حذف مستند الصرف رقم ${doc.number}؟ لا يمكن التراجع عن الحذف.`)
    if (!ok) return

    // الحذف من القسم الذي حُفظ فيه المستند فعلاً
    saveRows(
        STORE_KEY,
        doc.scope,
        loadRows(STORE_KEY, doc.scope).filter((d) => d.id !== doc.id)
    )
    search()
}

function clearFilters() {
    $('.r-key', el).value = 'number'
    $('.r-value', el).value = ''
    fromField.setValue('')
    toField.setValue('')
    showError('')
    searched = false
    tbody.replaceChildren()
    $('.count', el).textContent = ''
    showEmpty('اختر طريقة الكشف ثم اضغط «عرض»')
}

/* ================== الأحداث ================== */
$('.r-show', el).addEventListener('click', search)
$('.r-clear', el).addEventListener('click', clearFilters)
$('.r-value', el).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') search()
})

el.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
        mode = tab.dataset.mode
        el.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab))
        search()
    })
})

/* ================== واجهة الصفحة ================== */
function render() {
    $('.dept-badge', el).textContent = DEPARTMENTS[state.dept]
    if (searched) search() // تحديث النتائج (بعد تعديل أو تغيير قسم)
}

function reset() {
    mode = 'normal'
    el.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.mode === 'normal'))
    clearFilters()
}

reset()

export default { id: 'page-payment-report', el, render, reset }