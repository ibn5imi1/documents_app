import { createTablePage } from '../../core/tablePage.js'
import seed from './accounts.txt?raw'

export default createTablePage({
    id: 'page-accounts',
    title: 'الدليل المحاسبي',
    storeKey: 'accounts',
    numLabel: 'رقم الحساب',
    nameLabel: 'اسم الحساب',
    addLabel: 'إضافة حساب',
    itemLabel: 'الحساب',
    global: true, // مشترك بين كل الأقسام
    seed,
})