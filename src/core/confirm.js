let dialog = null

// يعرض نافذة تأكيد حذف، ويرجع true إذا ضغط المستخدم "تأكيد الحذف"
export function confirmDelete(text) {
    return new Promise((resolve) => {
        if (!dialog) {
            dialog = document.createElement('dialog')
            dialog.className = 'confirm-dialog'
            dialog.innerHTML = `
        <h3>تأكيد الحذف</h3>
        <p class="confirm-text"></p>
        <div class="dialog-actions">
          <button type="button" class="btn btn-danger btn-yes">تأكيد الحذف</button>
          <button type="button" class="btn btn-light btn-no">إلغاء</button>
        </div>
      `
            document.body.appendChild(dialog)
        }

        if (dialog.open) dialog.close()

        let settled = false
        const finish = (value) => {
            if (settled) return
            settled = true
            if (dialog.open) dialog.close()
            resolve(value)
        }

        dialog.querySelector('.confirm-text').textContent = text
        dialog.querySelector('.btn-yes').onclick = () => finish(true)
        dialog.querySelector('.btn-no').onclick = () => finish(false)
        dialog.onclose = () => finish(false) // الإغلاق بزر Esc
        dialog.showModal()
    })
}