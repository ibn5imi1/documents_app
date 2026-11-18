let dialog = null

// يعرض نافذة تأكيد حذف، ويرجع true إذا ضغط المستخدم "حذف"
export function confirmDelete(text) {
    return new Promise((resolve) => {
        if (!dialog) {
            dialog = document.createElement('dialog')
            dialog.className = 'confirm-dialog'
            dialog.innerHTML = `
        <h3>تأكيد الحذف</h3>
        <p class="confirm-text"></p>
        <div class="dialog-actions">
          <button type="button" class="btn btn-danger btn-yes">حذف</button>
          <button type="button" class="btn btn-light btn-no">إلغاء</button>
        </div>
      `
            document.body.appendChild(dialog)
        }

        let answer = false
        dialog.querySelector('.confirm-text').textContent = text
        dialog.querySelector('.btn-yes').onclick = () => {
            answer = true
            dialog.close()
        }
        dialog.querySelector('.btn-no').onclick = () => dialog.close()
        dialog.onclose = () => resolve(answer)
        dialog.showModal()
    })
}