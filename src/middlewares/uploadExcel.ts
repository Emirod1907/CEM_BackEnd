import multer from 'multer'

const MIMES_VALIDOS = new Set([
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel',                                          // .xls
    'application/octet-stream',                                          // algunos browsers
])

const uploadExcel = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    fileFilter: (_req, file, cb) => {
        if (MIMES_VALIDOS.has(file.mimetype)) {
            cb(null, true)
        } else {
            cb(new Error('Solo se permiten archivos .xlsx o .xls'))
        }
    },
})

export default uploadExcel
