let students = [];
let qrScanner;
let isScanning = false;
let lastScanTime = 0;
let scanCooldown = 3000; // 3 seconds between scans

// Save entries to localStorage
function saveEntriesToStorage() {
    const entries = {};
    students.forEach(s => {
        if (s.Entry_Status === 'Entered') {
            entries[s.ID] = {
                Name: s.Name,
                Year: s.Year,
                Entry_Status: s.Entry_Status,
                Timestamp: s.Timestamp || new Date().toISOString()
            };
        }
    });
    localStorage.setItem('navratri_entries', JSON.stringify(entries));
    localStorage.setItem('navratri_last_save', new Date().toISOString());
}

// Load entries from localStorage
function loadEntriesFromStorage() {
    const savedEntries = localStorage.getItem('navratri_entries');
    if (savedEntries) {
        const entries = JSON.parse(savedEntries);
        students.forEach(s => {
            if (entries[s.ID]) {
                s.Entry_Status = entries[s.ID].Entry_Status;
                s.Timestamp = entries[s.ID].Timestamp;
            }
        });
        const lastSave = localStorage.getItem('navratri_last_save');
        console.log('Loaded entries from storage. Last save:', lastSave);
        return Object.keys(entries).length;
    }
    return 0;
}

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

// Helper: generate QR data URL using canvas (more reliable)
function generateQRDataURL(text) {
    return new Promise((resolve, reject) => {
        try {
            // Create a temporary container
            const container = document.createElement('div');
            container.style.position = 'absolute';
            container.style.top = '-9999px';
            container.style.left = '-9999px';
            container.style.width = '300px';
            container.style.height = '300px';
            document.body.appendChild(container);

            // Clear any previous content
            container.innerHTML = '';

            // Generate QR code with higher quality settings
            const qr = new QRCode(container, {
                text: String(text),
                width: 256,
                height: 256,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });

            // Longer wait time for mobile devices to render properly
            setTimeout(() => {
                try {
                    const canvas = container.querySelector('canvas');
                    const img = container.querySelector('img');
                    
                    if (canvas) {
                        // Force canvas to complete rendering
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(canvas, 0, 0);
                        
                        const dataUrl = canvas.toDataURL('image/png', 1.0);
                        document.body.removeChild(container);
                        
                        // Validate the data URL
                        if (dataUrl && dataUrl.length > 100) {
                            resolve(dataUrl);
                        } else {
                            reject(new Error('Invalid QR code data'));
                        }
                    } else if (img && img.src) {
                        const dataUrl = img.src;
                        document.body.removeChild(container);
                        
                        // Validate the data URL
                        if (dataUrl && dataUrl.length > 100) {
                            resolve(dataUrl);
                        } else {
                            reject(new Error('Invalid QR code data'));
                        }
                    } else {
                        document.body.removeChild(container);
                        reject(new Error('QR code generation failed'));
                    }
                } catch (err) {
                    if (container.parentNode) {
                        document.body.removeChild(container);
                    }
                    reject(err);
                }
            }, 800); // Increased wait time for mobile
        } catch (error) {
            reject(error);
        }
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
            
            // Retry mechanism for QR generation
            let qrDataUrl = null;
            let retries = 3;
            
            while (retries > 0 && !qrDataUrl) {
                try {
                    qrDataUrl = await generateQRDataURL(String(s.ID));
                    
                    // Validate QR data
                    if (!qrDataUrl || qrDataUrl.length < 100) {
                        throw new Error('Invalid QR data');
                    }
                } catch (err) {
                    retries--;
                    if (retries > 0) {
                        console.log(`Retry generating QR for ${s.ID}, attempts left: ${retries}`);
                        await new Promise(resolve => setTimeout(resolve, 500));
                    } else {
                        console.error("Failed to generate QR for", s.ID, err);
                    }
                }
            }
            
            if (!qrDataUrl) {
                alert(`Failed to generate QR for ${s.Name} (ID: ${s.ID}). Skipping...`);
                continue;
            }

            doc.setFontSize(16);
            doc.text(`Student: ${s.Name}`, 20, 20);
            doc.text(`ID: ${s.ID}`, 20, 30);
            doc.text(`Year: ${s.Year}`, 20, 40);

            // Add QR code image with higher quality
            doc.addImage(qrDataUrl, 'PNG', 20, 50, 60, 60, undefined, 'FAST');

            if (i < students.length - 1) doc.addPage();
            
            // Give browser more time on mobile
            await new Promise(resolve => setTimeout(resolve, 150));
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
function populateTable(filter = '') {
    const tbody = document.querySelector('#entryTable tbody');
    tbody.innerHTML = '';
    
    const filteredStudents = students.filter(s => {
        if (!filter) return true;
        const searchLower = filter.toLowerCase();
        return String(s.ID).toLowerCase().includes(searchLower) ||
               String(s.Name).toLowerCase().includes(searchLower) ||
               String(s.Year).toLowerCase().includes(searchLower);
    });
    
    filteredStudents.forEach(s => {
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

// Search functionality
document.getElementById('searchBox').addEventListener('input', function(e) {
    populateTable(e.target.value);
});

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
        student.Timestamp = new Date().toISOString();
        statusDiv.innerText = `✓ ${student.Name}\n(ID: ${student.ID})\nEntry Successful!\n\nTap to continue...`;
        statusDiv.style.color = '#00ff00';
        statusDiv.style.fontSize = '22px';
        playBeep(true);
        populateTable();
        
        // Update in Google Sheets
        updateEntryStatus(student.ID, student.Name, 'Entered', student.Timestamp);
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

    // Filter only students who have entered
    const enteredStudents = students.filter(s => s.Entry_Status === 'Entered');
    
    if (enteredStudents.length === 0) {
        alert("No entries yet! No one has been marked as entered.");
        return;
    }

    const csv = Papa.unparse(enteredStudents);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    saveAs(blob, "entry_log.csv");
    alert(`Downloaded entry log with ${enteredStudents.length} entries!`);
});

// Clear all data
document.getElementById('clearDataBtn').addEventListener('click', async function() {
    if (confirm('⚠️ WARNING!\n\nThis will delete ALL entry records from Google Sheets permanently!\n\nAre you sure you want to continue?')) {
        if (confirm('This action cannot be undone!\n\nClick OK to confirm deletion.')) {
            try {
                const response = await fetch(GOOGLE_SHEETS_URL, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        action: 'clearAll'
                    })
                });
                
                students.forEach(s => {
                    s.Entry_Status = '';
                    s.Timestamp = '';
                });
                populateTable();
                alert('All entry data has been cleared from Google Sheets!');
            } catch (error) {
                alert('Error clearing data: ' + error.message);
            }
        }
    }
});

// Test QR functionality
document.getElementById('testQRBtn').addEventListener('click', function() {
    if (!students.length) {
        alert("Load Excel first!");
        return;
    }
    
    const container = document.getElementById('testQRContainer');
    const qrDiv = document.getElementById('testQRCode');
    
    // Clear previous QR
    qrDiv.innerHTML = '';
    
    // Generate test QR with first student's ID
    const testStudent = students[0];
    new QRCode(qrDiv, {
        text: String(testStudent.ID),
        width: 200,
        height: 200,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });
    
    container.style.display = 'block';
});

document.getElementById('closeTestQR').addEventListener('click', function() {
    document.getElementById('testQRContainer').style.display = 'none';
});