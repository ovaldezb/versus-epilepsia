const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

let doc = null;
let isDocLoaded = false;

const getMexicoCityTime = () => {
    return new Intl.DateTimeFormat('es-MX', {
        timeZone: 'America/Mexico_City',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
    }).format(new Date());
};

const getDoc = async () => {
    if (doc && isDocLoaded) return doc;

    try {
        let privateKey = process.env.GOOGLE_PRIVATE_KEY;
        if (privateKey) {
            // Robust extraction of PEM just in case, but legacy provider will do the heavy lifting
            const match = privateKey.match(/-----BEGIN PRIVATE KEY-----([\s\S]*)-----END PRIVATE KEY-----/);
            if (match) {
                const content = match[1].replace(/\\n/g, '\n').replace(/\s/g, '');
                privateKey = `-----BEGIN PRIVATE KEY-----\n${content}\n-----END PRIVATE KEY-----\n`;
            } else {
                privateKey = privateKey.replace(/\\n/g, '\n').replace(/^["']|["']$/g, '').trim();
            }
        }

        const auth = new JWT({
            email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            key: privateKey,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, auth);

        await doc.loadInfo();

        // Automatically ensure worksheets and headers exist!
        try {
            // Sheet 0 (Active Sessions)
            let sheet0 = doc.sheetsByIndex[0];
            if (!sheet0) {
                sheet0 = await doc.addSheet({ title: 'Active Sessions' });
            }
            try {
                await sheet0.loadHeaderRow();
            } catch (e) {
                await sheet0.setHeaderRow(['Teléfono', 'Estado', 'Nombre', 'Opcion', 'Detalle', 'Comprobante']);
            }

            // Sheet 1 (Completed Sessions)
            let sheet1 = doc.sheetsByTitle['Completed Sessions'];
            if (!sheet1) {
                sheet1 = await doc.addSheet({ title: 'Completed Sessions' });
            }
            try {
                await sheet1.loadHeaderRow();
            } catch (e) {
                await sheet1.setHeaderRow(['Teléfono', 'Nombre', 'Opcion', 'Detalle', 'Comprobante', 'Fecha']);
            }

            // Sheet 2 (Sponsor Sessions)
            let sheet2 = doc.sheetsByTitle['Patrocinadores'];
            if (!sheet2) {
                sheet2 = await doc.addSheet({ title: 'Patrocinadores' });
            }
            try {
                await sheet2.loadHeaderRow();
            } catch (e) {
                await sheet2.setHeaderRow(['Teléfono', 'Nombre', 'Detalle', 'Fecha']);
            }

            // Sheet 3 (Patient Sessions)
            let sheet3 = doc.sheetsByTitle['Pacientes'];
            if (!sheet3) {
                sheet3 = await doc.addSheet({ title: 'Pacientes' });
            }
            try {
                await sheet3.loadHeaderRow();
            } catch (e) {
                await sheet3.setHeaderRow(['Teléfono', 'Nombre', 'Detalle', 'Fecha']);
            }
        } catch (e) {
            console.error('Error ensuring sheets and headers exist:', e);
        }

        isDocLoaded = true;
        return doc;
    } catch (error) {
        doc = null;
        isDocLoaded = false;
        console.error('Error initializing Google Spreadsheet:', error);
        throw error;
    }
};

const getSession = async (phoneNumber) => {
    const doc = await getDoc();
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();
    const userRow = rows.find(row => row.get('Teléfono') === phoneNumber);
    if (userRow) {
        return {
            phone: userRow.get('Teléfono'),
            state: userRow.get('Estado'),
            name: userRow.get('Nombre'),
            option: userRow.get('Opcion'),
            detail: userRow.get('Detalle'),
            paymentProof: userRow.get('Comprobante'),
            _row: userRow
        };
    }
    return null;
};

const createSession = async (phoneNumber, name = '', initialState = 'INIT') => {
    const doc = await getDoc();
    const sheet = doc.sheetsByIndex[0];
    await sheet.addRow({
        'Teléfono': phoneNumber,
        'Estado': initialState,
        'Nombre': name,
        'Opcion': '',
        'Detalle': '',
        'Comprobante': ''
    });
};

const updateSession = async (phoneNumber, data) => {
    const doc = await getDoc();
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();
    const userRow = rows.find(row => row.get('Teléfono') === phoneNumber);
    if (userRow) {
        if (data.state) userRow.set('Estado', data.state);
        if (data.name !== undefined) userRow.set('Nombre', data.name);
        if (data.option !== undefined) userRow.set('Opcion', data.option);
        if (data.detail !== undefined) userRow.set('Detalle', data.detail);
        if (data.paymentProof !== undefined) userRow.set('Comprobante', data.paymentProof);
        await userRow.save();
    }
};

const archiveSession = async (phoneNumber, additionalData = {}) => {
    const session = await getSession(phoneNumber);
    if (!session) return;
    const doc = await getDoc();
    const completedSheet = doc.sheetsByTitle['Completed Sessions'] || doc.sheetsByIndex[1];
    await completedSheet.addRow({
        'Teléfono': session.phone,
        'Nombre': session.name,
        'Opcion': session.option,
        'Detalle': additionalData.detail || session.detail || '',
        'Comprobante': additionalData.paymentProof || session.paymentProof || '',
        'Fecha': getMexicoCityTime()
    });
    await session._row.delete();
};

const archiveSponsorSession = async (phoneNumber, detail) => {
    const session = await getSession(phoneNumber);
    if (!session) return;
    const doc = await getDoc();
    const sponsorSheet = doc.sheetsByTitle['Patrocinadores'] || doc.sheetsByIndex[2];
    await sponsorSheet.addRow({
        'Teléfono': session.phone,
        'Nombre': session.name,
        'Detalle': detail || session.detail || '',
        'Fecha': getMexicoCityTime()
    });
    await session._row.delete();
};

const savePatientInfo = async (phoneNumber, detail) => {
    const session = await getSession(phoneNumber);
    if (!session) return;
    const doc = await getDoc();
    const patientSheet = doc.sheetsByTitle['Pacientes'] || doc.sheetsByIndex[3];
    await patientSheet.addRow({
        'Teléfono': session.phone,
        'Nombre': session.name,
        'Detalle': detail || session.detail || '',
        'Fecha': getMexicoCityTime()
    });
};

const resetSession = async (phoneNumber) => {
    const session = await getSession(phoneNumber);
    if (session) {
        await session._row.delete();
    }
};

module.exports = {
    getSession,
    createSession,
    updateSession,
    archiveSession,
    archiveSponsorSession,
    savePatientInfo,
    resetSession
};
