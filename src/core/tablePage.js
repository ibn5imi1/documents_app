import { state, DEPARTMENTS } from './state.js'
import { scopeOf, loadRows, saveRows } from './storage.js'
import { seedIfEmpty } from './seed.js'
import { $, normalize, compareNumbers } from './utils.js'

/* ===== نافذة الإضافة والتعديل (واحدة مشتركة لكل الصفحات) ===== */
const dialog = $('#entry-dialog')
const entryForm = $('#entry-form')
const numberInput = $('#entry-number')
const nameInput = $('#entry-name')
const entryError = $('#entry-error')

let editing = null // { page, rowId }

function openDialog(page, row = null) {
    const cfg = page.cfg
    editing = { page, rowId: row ? row.id : null }

    $('#dialog-title').textContent = row ? `تعديل: ${cfg.title}` : cfg.addLabel
    $('#label-number').textContent = cfg.numLabel
    $('#label-name').textContent = cfg.nameLabel
    numberInput.value = row ? row.number : ''
    nameInput.value = row ? row.name : ''
    entryError.textContent = ''

    dialog.showModal()
    numberInput.focus()
}

entryForm.addEventListener('submit', (e) => {
    e.preventDefault()

    const number = numberInput.value.trim()
    const name = nameInput.value.replace(/\s+/g, ' ').trim()
    if (!number || !name) {
        entryError.textContent = 'يرجى ملء الحقلين'
        return
    }

    const { page, rowId } = editing
    const cfg = page.cfg
    const scope = scopeOf(cfg)
    const rows = loadRows(cfg.storeKey, scope)

    if (rows.some((r) => r.number === number && r.id !== rowId)) {
        entryError.textContent = 'هذا الرقم موجود مسبقاً'
        return
    }

    if (rowId) {
        const row = rows.find((r) => r.id === rowId)
        row.number = number
        row.name = name
    } else {
        rows.push({ id: Date.now(), number, name })
    }

    saveRows(cfg.storeKey, scope, rows)
    dialog.close()
    page.render()
})

$('#btn-cancel').addEventListener('click', () => dialog.close())
// زر Enter في حقل الاسم يحفظ مباشرة (بدل إنشاء سطر جديد)
nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault()
        entryForm.requestSubmit()
    }
})

/* ===== نافذة تأكيد الحذف ===== */
const confirmDialog = $('#confirm-dialog')
let deleting = null // { page, row }

function askDelete(page, row) {
    deleting = { page, row }
    $('#confirm-text').textContent = `هل تريد حذف "${row.name}" (${row.number})؟ لا يمكن التراجع عن الحذف.`
    confirmDialog.showModal()
}

$('#btn-confirm-delete').addEventListener('click', () => {
    const { page, row } = deleting
    const cfg = page.cfg
    const scope = scopeOf(cfg)

    const rows = loadRows(cfg.storeKey, scope).filter((r) => r.id !== row.id)
    saveRows(cfg.storeKey, scope, rows)

    confirmDialog.close()
    page.render()
})

$('#btn-confirm-cancel').addEventListener('click', () => confirmDialog.close())

/* ===== قالب صفحة الجدول ===== */
function makeCell(text) {
    const td = document.createElement('td')
    td.textContent = text
    return td
}

function makeButton(label, extraClass, onClick) {
    const btn = document.createElement('button')
    btn.className = `btn btn-small ${extraClass}`.trim()
    btn.type = 'button'
    btn.textContent = label
    btn.addEventListener('click', onClick)
    return btn
}

export function createTablePage(cfg) {
    // البيانات الافتراضية للصفحات العامة (مرة واحدة فقط)
    if (cfg.global && cfg.seed) seedIfEmpty(cfg)

    const el = document.createElement('section')
    el.id = cfg.id
    el.className = 'page hidden'
    el.innerHTML = `
    <h2 class="page-title">${cfg.title} <span class="dept-badge"></span></h2>
    <p class="print-meta"></p>

    <div class="toolbar">
      <input class="search" type="search" placeholder="بحث بالاسم أو الرقم..." />
      <button class="btn btn-primary btn-add" type="button">+ ${cfg.addLabel}</button>
      <button class="btn btn-light btn-print" type="button">طباعة</button>
    </div>

    <p class="count"></p>

    <div class="table-wrap">
      <table>
                <thead>
          <tr class="print-spacer"><th colspan="4"></th></tr>
          <tr>
            <th>#</th>
            <th>${cfg.numLabel}</th>
            <th>${cfg.nameLabel}</th>
            <th class="no-print">إجراءات</th>
          </tr>
        </thead>
        <tbody></tbody>
        <tfoot>
          <tr class="print-spacer"><td colspan="4"></td></tr>
        </tfoot>
        <tbody></tbody>
      </table>
      <p class="empty hidden">لا توجد بيانات</p>
    </div>
  `

    const page = { id: cfg.id, cfg, el, render }

    function render() {
        const term = normalize($('.search', el).value.trim())

        const all = loadRows(cfg.storeKey, scopeOf(cfg))
        const rows = all
            .filter(
                (r) =>
                    !term ||
                    normalize(r.number).includes(term) ||
                    normalize(r.name).includes(term)
            )
            .sort((a, b) => compareNumbers(a.number, b.number))

        // الدليل المحاسبي لا علاقة له بالأقسام: لا يظهر أي اسم قسم فيه
        $('.dept-badge', el).textContent = cfg.global ? '' : DEPARTMENTS[state.dept]
        $('.print-meta', el).textContent = cfg.global ? '' : `القسم: ${DEPARTMENTS[state.dept]}`

        $('.count', el).textContent = term
            ? `النتائج: ${rows.length} من ${all.length}`
            : `عدد السجلات: ${all.length}`

        const tbody = $('tbody', el)
        tbody.replaceChildren()

        rows.forEach((row, index) => {
            const tr = document.createElement('tr')
            tr.append(makeCell(index + 1), makeCell(row.number), makeCell(row.name))

            const actionsCell = document.createElement('td')
            actionsCell.className = 'no-print'
            const actions = document.createElement('div')
            actions.className = 'actions'
            actions.append(
                makeButton('تعديل', '', () => openDialog(page, row)),
                makeButton('حذف', 'btn-danger', () => askDelete(page, row))
            )
            actionsCell.append(actions)

            tr.append(actionsCell)
            tbody.append(tr)
        })

        $('.empty', el).classList.toggle('hidden', rows.length > 0)
    }

    $('.search', el).addEventListener('input', render)
    $('.btn-add', el).addEventListener('click', () => openDialog(page))
    $('.btn-print', el).addEventListener('click', () => window.print())

    return page
}