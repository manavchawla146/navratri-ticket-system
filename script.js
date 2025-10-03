let students = [];
let qrScanner;
let isScanning = false;
let lastScanTime = 0;
let scanCooldown = 3000; // 3 seconds between scans

// Load Excel file from same folder
async function loadExcel() {
    const response = await fetch('students.xlsx');
    const arrayBuffer = await response.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(firstSheet);
    students = data;
    students.forEach(s => {
        // Normalize ID - remove any spaces, convert to string
        s.ID = String(s.ID || s.id || s.Id).trim();
        s.Name = s.Name || s.name || '';
        s.Year = s.Year || s.year || '';
        s.Entry_Status = s.Entry_Status || '';
    });
    populateTable();
    console.log("Loaded students:", students); // Debug
}

document.getElementById('loadExcelBtn').addEventListener('click', loadExcel);

// Helper: generate QR data URL using hidden DOM
function generateQRDataURL(text) {
    return new Promise((resolve) => {
        const tempDiv = document.createElement('div');
        tempDiv.style.display = 'none';
        document.body.appendChild(tempDiv);

        new QRCode(tempDiv, {
            text: String(text),
            width: 150,
            height: 150,
            correctLevel: QRCode.CorrectLevel.H
        });

        setTimeout(() => {
            const img = tempDiv.querySelector('img');
            if (img) {
                resolve(img.src);
            } else {
                resolve(null);
            }
            document.body.removeChild(tempDiv);
        }, 200);
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

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        for (let i = 0; i < students.length; i++) {
            const s = students[i];
            
            // Show progress
            this.innerText = `Generating ${i + 1}/${students.length}`;
            
            const qrDataUrl = await generateQRDataURL(String(s.ID));
            
            if (!qrDataUrl) {
                console.error("Failed to generate QR for", s.ID);
                continue;
            }

            doc.setFontSize(16);
            doc.text(`Student: ${s.Name}`, 20, 20);
            doc.text(`ID: ${s.ID}`, 20, 30);
            doc.text(`Year: ${s.Year}`, 20, 40);

            doc.addImage(qrDataUrl, 'PNG', 20, 50, 50, 50);

            if (i < students.length - 1) doc.addPage();
            
            // Give browser time to breathe
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        doc.save("All_Student_QR.pdf");
        alert("PDF generated successfully!");
    } catch (error) {
        alert("Error generating PDF: " + error.message);
        console.error(error);
    } finally {
        this.disabled = false;
        this.innerText = "Generate QR PDF";
    }
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
        statusDiv.style.color = 'white';
        
        if (qrScanner) {
            await qrScanner.start();
        } else {
            qrScanner = new window.QrScanner(
                video, 
                result => {
                    if (isScanning) {
                        // Extract data properly from result
                        const scannedData = result.data || result;
                        handleScan(scannedData);
                    }
                },
                {
                    returnDetailedScanResult: true,
                    highlightScanRegion: true,
                    highlightCodeOutline: true,
                    maxScansPerSecond: 1, // Limit scan rate
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
    lastScanTime = 0;
    document.getElementById('scanner').style.display = 'none';
    document.getElementById('status').innerText = "";
});

// Tap status to reset and scan again
document.getElementById('status').addEventListener('click', function() {
    if (isScanning) {
        this.innerText = "Point camera at QR code";
        this.style.color = 'white';
        this.style.fontSize = '18px';
        lastScanTime = 0; // Reset cooldown
    }
});

// Handle scanned QR
function handleScan(data) {
    if (!isScanning) return;
    
    // Cooldown check to prevent rapid re-scanning
    const now = Date.now();
    if (now - lastScanTime < scanCooldown) {
        return;
    }
    lastScanTime = now;
    
    // Handle different data formats
    let scannedData = '';
    if (typeof data === 'object' && data.data) {
        scannedData = String(data.data).trim();
    } else {
        scannedData = String(data).trim();
    }
    
    console.log("=== SCAN DEBUG ===");
    console.log("Raw data:", data);
    console.log("Processed scannedData:", scannedData);
    console.log("All Student IDs:", students.map(s => `"${s.ID}"`));
    console.log("==================");
    
    // Check if we got empty data
    if (!scannedData || scannedData === '') {
        const statusDiv = document.getElementById('status');
        statusDiv.innerText = `❌ Empty QR Data!\nQR code may be corrupted\n\nTap to continue...`;
        statusDiv.style.color = 'red';
        statusDiv.style.fontSize = '18px';
        playBeep(false);
        return;
    }
    
    // Try multiple matching strategies
    let student = null;
    
    // Strategy 1: Exact match
    student = students.find(s => String(s.ID).trim() === scannedData);
    
    // Strategy 2: Case-insensitive match
    if (!student) {
        student = students.find(s => 
            String(s.ID).trim().toLowerCase() === scannedData.toLowerCase()
        );
    }
    
    // Strategy 3: Extract numbers only
    if (!student) {
        const numbersOnly = scannedData.replace(/\D/g, '');
        console.log("Trying numbers only:", numbersOnly);
        student = students.find(s => String(s.ID).trim() === numbersOnly);
    }
    
    // Strategy 4: Check if scanned data contains the ID
    if (!student) {
        student = students.find(s => scannedData.includes(String(s.ID).trim()));
    }
    
    const statusDiv = document.getElementById('status');

    if (!student) {
        statusDiv.innerText = `❌ Invalid QR Code!\nScanned: "${scannedData}"\n\nTap to continue...`;
        statusDiv.style.color = 'red';
        statusDiv.style.fontSize = '18px';
        playBeep(false);
        return;
    }

    if (student.Entry_Status === 'Entered') {
        statusDiv.innerText = `⚠️ ${student.Name}\n(ID: ${student.ID})\nAlready Entered!\n\nTap to continue...`;
        statusDiv.style.color = 'orange';
        statusDiv.style.fontSize = '20px';
        playBeep(false);
    } else {
        student.Entry_Status = 'Entered';
        statusDiv.innerText = `✓ ${student.Name}\n(ID: ${student.ID})\nEntry Successful!\n\nTap to continue...`;
        statusDiv.style.color = '#00ff00';
        statusDiv.style.fontSize = '22px';
        playBeep(true);
        populateTable();
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