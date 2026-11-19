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
    <label class="field"><span>الترتيب</span>
      <select class="r-sort">
        <option value="last">من آخر مستند إلى أول مستند</option>
        <option value="date-asc">حسب التاريخ تصاعدي</option>
        <option value="date-desc">حسب التاريخ تنازلي</option>
        <option value="journal-asc">حسب رقم اليومية تصاعدي</option>
        <option value="journal-desc">حسب رقم اليومية تنازلي</option>
        <option value="cheque-asc">حسب رقم الصك تصاعدي</option>
        <option value="cheque-desc">حسب رقم الصك تنازلي</option>
      </select></label>
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

/* ================== الترتيب ================== */
// مقارنة نصية عادية (للتواريخ بصيغة 2026-11-19)
const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
// مقارنة رقمية ذكية (للأرقام مثل 2 قبل 10)
const compareNumeric = (a, b) => a.localeCompare(b, undefined, { numeric: true })

function sortDocs(docs, sortKey) {
  // الافتراضي: آخر مستند أُدخل يظهر أولاً
  if (sortKey === 'last') return docs.sort((a, b) => b.id - a.id)

  const [field, direction] = sortKey.split('-') // مثل date-asc
  const sign = direction === 'desc' ? -1 : 1
  const compare = field === 'date' ? compareText : compareNumeric

  const valueOf = (doc) => {
    if (field === 'date') return doc.date ?? ''
    if (field === 'journal') return doc.journalNumber ?? ''
    return doc.chequeNumber ?? ''
  }

  return docs.sort((a, b) => {
    const va = String(valueOf(a)).trim()
    const vb = String(valueOf(b)).trim()

    // المستند الذي لا يحمل القيمة (مثلاً بلا رقم صك) يبقى في آخر القائمة في الاتجاهين
    if (!va && vb) return 1
    if (va && !vb) return -1

    // عند التساوي نرتب برقم المستند. والتنازلي هو عكس التصاعدي تماماً
    const result = compare(va, vb) || compareNumeric(a.number, b.number)
    return result * sign
  })
}

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

  sortDocs(docs, $('.r-sort', el).value)

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
  $('.r-sort', el).value = 'last'
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

// تغيير الترتيب بعد عرض النتائج يعيد ترتيبها فوراً
$('.r-sort', el).addEventListener('change', () => {
  if (searched) search()
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