const axios = require('axios');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const path = require('path');

const PDF_URL = 'https://www.ncrb.gov.in/uploads/SankalanPortal/DownloadPDF/BNS2023.pdf';
const OUTPUT_DIR = path.join(__dirname, '..');
const PDF_PATH = path.join(OUTPUT_DIR, 'BNS2023.pdf');
const TXT_PATH = path.join(OUTPUT_DIR, 'BNS2023_raw.txt');

async function downloadAndExtract() {
    try {
        if (!fs.existsSync(OUTPUT_DIR)) {
            fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        }

        console.log('Downloading PDF...');
        const response = await axios({
            url: PDF_URL,
            method: 'GET',
            responseType: 'arraybuffer',
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }) // Handle gov cert issues just in case
        });

        fs.writeFileSync(PDF_PATH, response.data);
        console.log(`Saved PDF to ${PDF_PATH}`);

        console.log('Extracting text...');
        const dataBuffer = fs.readFileSync(PDF_PATH);
        const data = await pdfParse(dataBuffer);

        fs.writeFileSync(TXT_PATH, data.text);
        console.log(`Saved extracted text to ${TXT_PATH}`);
        console.log(`Total Pages: ${data.numpages}`);
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

downloadAndExtract();
