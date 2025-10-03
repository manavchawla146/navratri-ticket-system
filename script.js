let students = [];
let qrScanner;
let isScanning = false;

// Load Excel file
async function loadExcel() {
    const fileInput = document.getElementById('excelFileInput');
    fileInput.click();
}

document.getElementById('excelFileInput').addEventListener('change', async function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet);
        
        students = jsonData.map(s => ({
            ID: String(s.ID || s.id || s.Id).trim(),
            Name: s.Name || s.name || '',
            Year: s.Year || s.year || '',
            Entry_Status: s.Entry_Status || ''
        }));
        
        populateTable();
        alert(`Loaded ${students.length} students successfully!`);
    };
    reader.readAsArrayBuffer(file);
});

document.getElementById('loadExcelBtn').addEventListener('click', loadExcel);

// Helper: generate QR data URL using hidden DOM
function generateQRDataURL(text) {
    return new Promise((resolve) => {
        const tempDiv = document.createElement('div');
        tempDiv.style.display = 'none';
        document.body.appendChild(tempDiv);

        new QRCode(tempDiv, {
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

    this.disabled = true;
    this.innerText = "Generating...";

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    for (let i = 0; i < students.length; i++) {
        const s = students[i];
        const qrDataUrl = await generateQRDataURL(s.ID);

        doc.setFontSize(16);
        doc.text(`Student: ${s.Name}`, 20, 20);
        doc.text(`ID: ${s.ID}`, 20, 30);
        doc.text(`Year: ${s.Year}`, 20, 40);

        doc.addImage(qrDataUrl, 'PNG', 20, 50, 50, 50);

        if (i < students.length - 1) doc.addPage();
    }

    doc.save("All_Student_QR.pdf");
    
    this.disabled = false;
    this.innerText = "Generate QR PDF";
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
            <td>${s.Entry_Status || '-'}</td>
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

    if (isScanning) {
        return;
    }

    try {
        const scannerDiv = document.getElementById('scanner');
        const video = document.getElementById('preview');
        const statusDiv = document.getElementById('status');
        
        scannerDiv.style.display = 'flex';
        statusDiv.innerText = "Initializing camera...";
        statusDiv.style.color = '#333';
        
        if (qrScanner) {
            await qrScanner.start();
        } else {
            qrScanner = new window.QrScanner(
                video, 
                result => {
                    if (isScanning) {
                        handleScan(result.data);
                    }
                },
                {
                    returnDetailedScanResult: true,
                    highlightScanRegion: true,
                    highlightCodeOutline: true,
                }
            );
            await qrScanner.start();
        }
        
        isScanning = true;
        statusDiv.innerText = "Point camera at QR code";
        
    } catch (error) {
        alert("Camera access denied or not available: " + error.message);
        document.getElementById('scanner').style.display = 'none';
    }
});

// Close scanner
document.getElementById('closeScanBtn').addEventListener('click', function() {
    if (qrScanner) {
        qrScanner.stop();
    }
    isScanning = false;
    document.getElementById('scanner').style.display = 'none';
    document.getElementById('status').innerText = "";
});

// Handle scanned QR
function handleScan(data) {
    if (!isScanning) return;
    
    const scannedID = String(data).trim();
    const student = students.find(s => String(s.ID).trim() === scannedID);
    const statusDiv = document.getElementById('status');

    if (!student) {
        statusDiv.innerText = "❌ Invalid QR Code!";
        statusDiv.style.color = 'red';
        statusDiv.style.fontSize = '24px';
        playBeep(false);
        
        setTimeout(() => {
            if (isScanning) {
                statusDiv.innerText = "Point camera at QR code";
                statusDiv.style.color = '#333';
                statusDiv.style.fontSize = '18px';
            }
        }, 2000);
        return;
    }

    if (student.Entry_Status === 'Entered') {
        statusDiv.innerText = `⚠️ ${student.Name}\nAlready Entered!`;
        statusDiv.style.color = 'orange';
        statusDiv.style.fontSize = '24px';
        playBeep(false);
        
        setTimeout(() => {
            if (isScanning) {
                statusDiv.innerText = "Point camera at QR code";
                statusDiv.style.color = '#333';
                statusDiv.style.fontSize = '18px';
            }
        }, 2000);
    } else {
        student.Entry_Status = 'Entered';
        statusDiv.innerText = `✓ ${student.Name}\nEntry Successful!`;
        statusDiv.style.color = 'green';
        statusDiv.style.fontSize = '24px';
        playBeep(true);
        populateTable();
        
        setTimeout(() => {
            if (isScanning) {
                statusDiv.innerText = "Point camera at QR code";
                statusDiv.style.color = '#333';
                statusDiv.style.fontSize = '18px';
            }
        }, 2000);
    }
}

// Audio feedback
function playBeep(success) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = success ? 800 : 400;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.2);
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
    alert("Entry log downloaded!");
});