import { loadRows } from './storage.js'
import { $, normalize, toLatin, compareNumbers } from './utils.js'

const ACCOUNTS_STORE = 'accounts' // الدليل المحاسبي (مشترك لكل الأقسام)
const MAX_RESULTS = 15

// حقل اختيار حساب من الدليل المحاسبي: يكتب المستخدم الاسم أو الرقم،
// فتظهر قائمة اقتراحات يختار منها. يرجع { el, getValue, clear }
export function createAccountPicker({ placeholder = 'اكتب اسم الحساب أو رقمه ثم اختر من القائمة' } = {}) {
    const root = document.createElement('div')
    root.className = 'account-picker'
    root.innerHTML = `
    <input class="ap-input" type="text" autocomplete="off" placeholder="${placeholder}" />
    <ul class="ap-list hidden"></ul>
  `
    const input = $('.ap-input', root)
    const list = $('.ap-list', root)

    let selected = null // { number, name }
    let matches = []
    let active = -1

    const accounts = () => loadRows(ACCOUNTS_STORE, 'all')

    // الأرقام المطابقة أولاً، ثم الأسماء المحتوية على النص
    function findMatches(text) {
        const numTerm = toLatin(text).trim()
        const nameTerm = normalize(text.trim())
        if (!numTerm) return []

        const scored = []
        for (const acc of accounts()) {
            let rank
            if (acc.number === numTerm) rank = 0
            else if (acc.number.startsWith(numTerm)) rank = 1
            else if (normalize(acc.name).includes(nameTerm)) rank = 2
            else continue
            scored.push({ acc, rank })
        }
        scored.sort((a, b) => a.rank - b.rank || compareNumbers(a.acc.number, b.acc.number))
        return scored.slice(0, MAX_RESULTS).map((item) => item.acc)
    }

    function hideList() {
        list.classList.add('hidden')
        active = -1
    }

    function renderList() {
        list.replaceChildren()
        if (!matches.length) return hideList()

        matches.forEach((acc, index) => {
            const item = document.createElement('li')
            if (index === active) item.className = 'active'
            const number = document.createElement('b')
            number.textContent = acc.number
            item.append(number, ` — ${acc.name}`)
            item.addEventListener('click', () => choose(acc))
            list.append(item)
        })
        list.classList.remove('hidden')
    }

    function choose(acc) {
        selected = acc
        input.value = `${acc.number} — ${acc.name}`
        root.classList.add('selected')
        hideList()
    }

    input.addEventListener('input', () => {
        selected = null // أي تعديل بعد الاختيار يلغيه
        root.classList.remove('selected')
        matches = findMatches(input.value)
        active = -1
        renderList()
    })

    input.addEventListener('keydown', (e) => {
        const open = !list.classList.contains('hidden')
        if (e.key === 'ArrowDown' && open) {
            e.preventDefault()
            active = Math.min(active + 1, matches.length - 1)
            renderList()
        } else if (e.key === 'ArrowUp' && open) {
            e.preventDefault()
            active = Math.max(active - 1, 0)
            renderList()
        } else if (e.key === 'Enter' && open && active >= 0) {
            e.preventDefault()
            choose(matches[active])
        } else if (e.key === 'Escape') {
            hideList()
        }
    })

    // الإغلاق عند الضغط خارج الحقل
    document.addEventListener('click', (e) => {
        if (!e.composedPath().includes(root)) hideList()
    })

    return {
        el: root,

        // الحساب المختار. وإذا كتب المستخدم رقماً مطابقاً تماماً ولم يختر، نختاره له
        getValue() {
            if (selected) return selected
            const typed = toLatin(input.value).trim()
            if (!typed) return null
            const exact = accounts().find((acc) => acc.number === typed)
            if (exact) {
                choose(exact)
                return exact
            }
            return null
        },

        clear() {
            selected = null
            matches = []
            input.value = ''
            root.classList.remove('selected')
            hideList()
        },
    }
}