let students = [];
let qrScanner;

// Load Excel file from same folder
async function loadExcel() {
    const response = await fetch('students.xlsx');
    const arrayBuffer = await response.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(firstSheet);
    students = data;
    students.forEach(s => s.Entry_Status = '');
    populateTable();
}

document.getElementById('loadExcelBtn').addEventListener('click', loadExcel);

// Helper: generate QR data URL using hidden DOM
function generateQRDataURL(text) {
    return new Promise((resolve) => {
        const tempDiv = document.createElement('div');
        tempDiv.style.display = 'none';
        document.body.appendChild(tempDiv);

        const qr = new QRCode(tempDiv, {
            text: text,
            width: 150,
            height: 150,
            correctLevel: QRCode.CorrectLevel.H
        });

        setTimeout(() => {
            const img = tempDiv.querySelector('img');
            if (img) resolve(img.src);
            document.body.removeChild(tempDiv);
        }, 100);
    });
}

// Generate single PDF with all students (separate pages)
document.getElementById('generatePDFBtn').addEventListener('click', async function() {
    if (!students.length) {
        alert("Load Excel first!");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    for (let i = 0; i < students.length; i++) {
        const s = students[i];
        const qrDataUrl = await generateQRDataURL(s.ID);

        // Add student info
        doc.setFontSize(16);
        doc.text(`Student: ${s.Name}`, 20, 20);
        doc.text(`ID: ${s.ID}`, 20, 30);

        // Add QR code
        doc.addImage(qrDataUrl, 'PNG', 20, 40, 50, 50);

        if (i < students.length - 1) {
            doc.addPage();
        }
    }

    doc.save("All_Student_QR.pdf");
});

// Populate table
function populateTable() {
    const tbody = document.querySelector('#entryTable tbody');
    tbody.innerHTML = '';
    students.forEach(s => {
        const tr = document.createElement('tr');
        tr.className = s.Entry_Status === 'Entered' ? 'entered' : '';
        tr.innerHTML = `
            <td>${s.ID}</td>
            <td>${s.Name}</td>
            <td>${s.Year}</td>
            <td>${s.Entry_Status}</td>
        `;
        tbody.appendChild(tr);
    });
}

// Start scanning
document.getElementById('startScanBtn').addEventListener('click', async function() {
    if (!students.length) {
        alert("Load Excel first!");
        return;
    }

    const video = document.getElementById('preview');
    qrScanner = new QrScanner(video, result => {
        handleScan(result);
    });
    await qrScanner.start();
});

// Handle scanned QR
function handleScan(data) {
    const student = students.find(s => s.ID == data);
    const statusDiv = document.getElementById('status');

    if (!student) {
        statusDiv.innerText = "Invalid QR!";
        statusDiv.style.color = 'red';
        return;
    }

    if (student.Entry_Status === 'Entered') {
        statusDiv.innerText = `${student.Name} already entered`;
        statusDiv.style.color = 'orange';
    } else {
        student.Entry_Status = 'Entered';
        statusDiv.innerText = `${student.Name} entry successful!`;
        statusDiv.style.color = 'green';
        populateTable();
    }
}

// Download CSV
document.getElementById('downloadBtn').addEventListener('click', function() {
    if (!students.length) {
        alert("Load Excel first!");
        return;
    }

    const csv = Papa.unparse(students);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    saveAs(blob, "entry_log.csv");
});
