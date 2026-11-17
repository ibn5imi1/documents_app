import { state, DEPARTMENTS, CURRENCIES } from '../../core/state.js'
import { loadRows, saveRows } from '../../core/storage.js'
import { $ } from '../../core/utils.js'

const STORE_KEY = 'payment-vouchers' // المستندات تُحفظ لكل قسم على حدة
const ACCOUNTS_STORE = 'accounts' // الدليل المحاسبي (مشترك لكل الأقسام)

/* ================== أدوات ================== */
// تحويل الأرقام العربية (٠١٢) إلى لاتينية
const toLatin = (s) =>
    s
        .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
        .replace(/٫/g, '.')
        .replace(/[٬،]/g, ',')

const todayISO = () => {
    const d = new Date()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${d.getFullYear()}-${mm}-${dd}`
}

// المبالغ تُحسب بالألف (3 خانات عشرية) لتفادي أخطاء الكسور العشرية
const toMilli = (text) => {
    const n = parseFloat(toLatin(text).replace(/,/g, ''))
    return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) : 0
}
const fmtMilli = (m) => (m / 1000).toLocaleString('en-US', { maximumFractionDigits: 3 })

/* ================== بناء الصفحة ================== */
const el = document.createElement('section')
el.id = 'page-payment'
el.className = 'page hidden'
el.innerHTML = `
  <h2 class="page-title">مستند صرف <span class="dept-badge"></span></h2>

  <div class="voucher-form">
    <label class="field"><span>رقم المستند</span>
      <input class="f-number" type="text" autocomplete="off" /></label>
    <label class="field"><span>تاريخ المستند</span>
      <input class="f-date" type="date" /></label>
    <label class="field span-2"><span>المستفيد</span>
      <input class="f-beneficiary" type="text" autocomplete="off" /></label>

    <label class="field"><span>رقم الصك</span>
      <input class="f-cheque-number" type="text" autocomplete="off" /></label>
    <label class="field"><span>تاريخ الصك</span>
      <input class="f-cheque-date" type="date" /></label>
    <label class="field"><span>العملة</span>
      <select class="f-currency"></select></label>
    <label class="field"><span>رقم اليومية</span>
      <input class="f-journal" type="text" autocomplete="off" /></label>

    <label class="field"><span>حالة القيد</span>
      <input class="f-status" type="text" autocomplete="off" /></label>
    <label class="field"><span>المحاسب</span>
      <input class="f-accountant" type="text" readonly /></label>

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
  </div>

  <div class="voucher-actions">
    <button class="btn btn-primary btn-save" type="button">حفظ المستند</button>
    <button class="btn btn-light btn-new" type="button">مستند جديد</button>
  </div>
  <p class="form-error error"></p>
  <p class="form-success"></p>
`

const tbody = $('tbody', el)
let accountMap = new Map() // رقم الدليل -> اسم الدليل
let formDept = null
let messageTimer = null

// قائمة العملات
for (const currency of CURRENCIES) {
    const option = document.createElement('option')
    option.value = currency
    option.textContent = currency
    $('.f-currency', el).appendChild(option)
}

/* ================== الدليل المحاسبي ================== */
function refreshAccounts() {
    accountMap = new Map(loadRows(ACCOUNTS_STORE, 'all').map((r) => [r.number, r.name]))
}

function updateName(tr) {
    const number = $('.in-acc', tr).value.trim()
    const span = $('.acc-name', tr)
    if (!number) {
        span.textContent = ''
        span.classList.remove('missing')
        return
    }
    const name = accountMap.get(number)
    span.textContent = name ?? 'غير موجود في الدليل'
    span.classList.toggle('missing', !name)
}

/* ================== أسطر الجدول ================== */
function addLine() {
    const tr = document.createElement('tr')
    tr.innerHTML = `
    <td class="c-debit"><input class="in-debit amount" inputmode="decimal" autocomplete="off" /></td>
    <td class="c-credit"><input class="in-credit amount" inputmode="decimal" autocomplete="off" /></td>
    <td class="c-acc"><input class="in-acc" type="text" autocomplete="off" /></td>
    <td class="c-name"><span class="acc-name"></span></td>
    <td class="c-del"><button class="btn btn-small btn-danger btn-del" type="button">حذف</button></td>
  `
    tbody.appendChild(tr)
    return tr
}

function removeLine(tr) {
    if (tbody.children.length > 1) {
        tr.remove()
    } else {
        // آخر سطر: نفرّغه بدل حذفه
        tr.querySelectorAll('input').forEach((i) => (i.value = ''))
        updateName(tr)
    }
}

function updateTotals() {
    let debit = 0
    let credit = 0
    tbody.querySelectorAll('tr').forEach((tr) => {
        debit += toMilli($('.in-debit', tr).value)
        credit += toMilli($('.in-credit', tr).value)
    })

    $('.sum-debit', el).textContent = fmtMilli(debit)
    $('.sum-credit', el).textContent = fmtMilli(credit)

    const note = $('.balance-note', el)
    if (debit === 0 && credit === 0) {
        note.textContent = ''
        note.className = 'balance-note'
    } else if (debit === credit) {
        note.textContent = '✓ المدين والدائن متطابقان'
        note.className = 'balance-note ok'
    } else {
        note.textContent = `المدين والدائن غير متطابقين، الفرق: ${fmtMilli(Math.abs(debit - credit))}`
        note.className = 'balance-note bad'
    }
}

tbody.addEventListener('input', (e) => {
    const target = e.target
    if (target.classList.contains('amount')) {
        target.value = toLatin(target.value).replace(/[^\d.,]/g, '')
    }
    if (target.classList.contains('in-acc')) {
        target.value = toLatin(target.value).replace(/\s/g, '')
        updateName(target.closest('tr'))
    }
    updateTotals()
})

// المبلغ: بدون فواصل أثناء الكتابة، ومع فواصل الآلاف عند الخروج من الحقل
tbody.addEventListener('focusin', (e) => {
    if (e.target.classList.contains('amount')) {
        e.target.value = e.target.value.replace(/,/g, '')
    }
})
tbody.addEventListener('focusout', (e) => {
    if (e.target.classList.contains('amount')) {
        const milli = toMilli(e.target.value)
        e.target.value = milli ? fmtMilli(milli) : ''
    }
})

tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-del')
    if (!btn) return
    removeLine(btn.closest('tr'))
    updateTotals()
})

$('.btn-add-line', el).addEventListener('click', () => {
    addLine().querySelector('.in-debit').focus()
})

/* ================== الرسائل ================== */
function message(type, text) {
    const error = $('.form-error', el)
    const success = $('.form-success', el)
    error.textContent = type === 'error' ? text : ''
    success.textContent = type === 'ok' ? text : ''

    clearTimeout(messageTimer)
    if (text) {
        messageTimer = setTimeout(() => {
            error.textContent = ''
            success.textContent = ''
        }, 6000)
    }
}

/* ================== مستند جديد ================== */
function resetForm() {
    for (const cls of ['.f-number', '.f-beneficiary', '.f-cheque-number', '.f-cheque-date', '.f-journal', '.f-status', '.f-statement']) {
        $(cls, el).value = ''
    }
    $('.f-date', el).value = todayISO()
    $('.f-currency', el).value = CURRENCIES[0]
    $('.f-cancelled', el).checked = false
    $('.f-accountant', el).value = state.user?.name ?? ''

    tbody.replaceChildren()
    addLine()
    addLine()
    updateTotals()
    message('', '')
}

/* ================== الحفظ ================== */
function save() {
    const number = $('.f-number', el).value.trim()
    const date = $('.f-date', el).value
    const cancelled = $('.f-cancelled', el).checked

    if (!number) return message('error', 'أدخل رقم المستند')
    if (!date) return message('error', 'أدخل تاريخ المستند')

    const docs = loadRows(STORE_KEY, state.dept)
    if (docs.some((d) => d.number === number)) {
        return message('error', 'رقم المستند موجود مسبقاً في هذا القسم')
    }

    const lines = []
    let debit = 0
    let credit = 0

    const rows = [...tbody.querySelectorAll('tr')]
    for (const [index, tr] of rows.entries()) {
        const debitText = $('.in-debit', tr).value.trim()
        const creditText = $('.in-credit', tr).value.trim()
        const accNumber = $('.in-acc', tr).value.trim()
        if (!debitText && !creditText && !accNumber) continue // سطر فارغ

        const d = toMilli(debitText)
        const c = toMilli(creditText)
        const accName = accountMap.get(accNumber) ?? ''

        // المستند البطال لا يُفحص جدوله
        if (!cancelled) {
            const n = index + 1
            if (!accNumber) return message('error', `السطر ${n}: أدخل رقم الدليل`)
            if (!accName) return message('error', `السطر ${n}: رقم الدليل غير موجود في الدليل المحاسبي`)
            if (d && c) return message('error', `السطر ${n}: أدخل مديناً أو دائناً وليس كليهما`)
            if (!d && !c) return message('error', `السطر ${n}: أدخل مبلغ المدين أو الدائن`)
        }

        debit += d
        credit += c
        lines.push({
            debit: d / 1000,
            credit: c / 1000,
            accountNumber: accNumber,
            accountName: accName,
        })
    }

    if (!cancelled) {
        if (!lines.length) return message('error', 'أضف سطراً واحداً على الأقل في الجدول')
        if (debit !== credit) {
            return message(
                'error',
                `لا يمكن حفظ المستند: المدين والدائن غير متطابقين (الفرق ${fmtMilli(Math.abs(debit - credit))})`
            )
        }
    }

    docs.push({
        id: Date.now(),
        number,
        date,
        beneficiary: $('.f-beneficiary', el).value.trim(),
        chequeNumber: $('.f-cheque-number', el).value.trim(),
        chequeDate: $('.f-cheque-date', el).value,
        currency: $('.f-currency', el).value,
        journalNumber: $('.f-journal', el).value.trim(),
        entryStatus: $('.f-status', el).value.trim(),
        statement: $('.f-statement', el).value.trim(),
        cancelled,
        lines,
        totalDebit: debit / 1000,
        totalCredit: credit / 1000,
        accountant: state.user?.name ?? '',
        createdAt: new Date().toISOString(),
    })

    saveRows(STORE_KEY, state.dept, docs)
    resetForm()
    message('ok', `تم حفظ مستند الصرف رقم ${number}`)
}

$('.btn-save', el).addEventListener('click', save)
$('.btn-new', el).addEventListener('click', resetForm)

/* ================== واجهة الصفحة ================== */
// تُنفَّذ كلما فُتحت الصفحة أو تغيّر القسم
function render() {
    refreshAccounts()
    $('.dept-badge', el).textContent = DEPARTMENTS[state.dept]

    // المستندات لكل قسم: عند تغيير القسم نبدأ مستنداً جديداً حتى لا يُحفظ في القسم الخطأ
    if (formDept !== null && formDept !== state.dept) resetForm()
    formDept = state.dept

    $('.f-accountant', el).value = state.user?.name ?? ''
    tbody.querySelectorAll('tr').forEach(updateName)
}

resetForm()

export default { id: 'page-payment', el, render, reset: resetForm }