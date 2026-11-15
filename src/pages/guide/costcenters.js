import { createTablePage } from '../../core/tablePage.js'

export default createTablePage({
    id: 'page-costcenters',
    title: 'مراكز التكلفة',
    storeKey: 'costcenters',
    numLabel: 'رقم المركز',
    nameLabel: 'اسم المركز',
    addLabel: 'إضافة مركز',
    global: false, // لكل قسم سجلاته
})