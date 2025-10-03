let students = [];
let qrScanner;
let isScanning = false;
let lastScanTime = 0;
let scanCooldown = 3000; // 3 seconds between scans

// Generate hash ID from name
function generateHashID(name) {
    // Simple hash function - converts name to consistent hash
    let hash = 0;
    const str = name.toUpperCase().replace(/\s+/g, ''); // Remove spaces, uppercase
    
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    
    // Convert to positive number and add prefix
    const positiveHash = Math.abs(hash);
    return `NAV${positiveHash}`;
}

// Load Excel file and generate hash IDs
async function loadExcel() {
    try {
        const response = await fetch('students.xlsx');
        const arrayBuffer = await response.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(firstSheet);
        
        students = data.map(s => {
            const name = s.Name || s.name || '';
            const year = s.Year || s.year || '';
            
            // Generate hash ID from name if ID is empty
            let id = s.ID || s.id || s.Id;
            if (!id || String(id).trim() === '') {
                id = generateHashID(name);
            } else {
                id = String(id).trim();
            }
            
            return {
                ID: id,
                Name: name,
                Year: year,
                Entry_Status: s.Entry_Status || ''
            };
        });
        
        populateTable();
        console.log("Loaded students with hash IDs:", students);
        alert(`Loaded ${students.length} students. Hash IDs generated where needed.`);
        
    } catch (error) {
        alert("Error loading Excel: " + error.message);
        console.error(error);
    }
}

document.getElementById('loadExcelBtn').addEventListener('click', loadExcel);

// Helper: generate QR data URL - contains both ID and Name
function generateQRDataURL(id, name) {
    return new Promise((resolve, reject) => {
        try {
            const container = document.createElement('div');
            container.style.position = 'fixed';
            container.style.top = '0';
            container.style.left = '0';
            container.style.width = '300px';
            container.style.height = '300px';
            container.style.zIndex = '-9999';
            container.style.opacity = '0';
            container.style.pointerEvents = 'none';
            document.body.appendChild(container);

            container.innerHTML = '';

            // QR data format: ID|Name (pipe separated for easy parsing)
            const qrData = `${id}|${name}`;
            
            const qr = new QRCode(container, {
                text: qrData,
                width: 256,
                height: 256,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });

            requestAnimationFrame(() => {
                setTimeout(() => {
                    try {
                        const canvas = container.querySelector('canvas');
                        const img = container.querySelector('img');
                        
                        if (canvas) {
                            const newCanvas = document.createElement('canvas');
                            newCanvas.width = 256;
                            newCanvas.height = 256;
                            const ctx = newCanvas.getContext('2d');
                            
                            ctx.fillStyle = '#ffffff';
                            ctx.fillRect(0, 0, 256, 256);
                            ctx.drawImage(canvas, 0, 0, 256, 256);
                            
                            const dataUrl = newCanvas.toDataURL('image/png', 1.0);
                            
                            if (container.parentNode) {
                                document.body.removeChild(container);
                            }
                            
                            if (dataUrl && dataUrl.startsWith('data:image/png') && dataUrl.length > 1000) {
                                resolve(dataUrl);
                            } else {
                                reject(new Error('Invalid QR code data'));
                            }
                        } else if (img && img.complete && img.src) {
                            const imgCanvas = document.createElement('canvas');
                            imgCanvas.width = 256;
                            imgCanvas.height = 256;
                            const imgCtx = imgCanvas.getContext('2d');
                            
                            imgCtx.fillStyle = '#ffffff';
                            imgCtx.fillRect(0, 0, 256, 256);
                            imgCtx.drawImage(img, 0, 0, 256, 256);
                            
                            const dataUrl = imgCanvas.toDataURL('image/png', 1.0);
                            
                            if (container.parentNode) {
                                document.body.removeChild(container);
                            }
                            
                            if (dataUrl && dataUrl.startsWith('data:image/png') && dataUrl.length > 1000) {
                                resolve(dataUrl);
                            } else {
                                reject(new Error('Invalid QR code data'));
                            }
                        } else {
                            if (container.parentNode) {
                                document.body.removeChild(container);
                            }
                            reject(new Error('QR code generation failed'));
                        }
                    } catch (err) {
                        if (container.parentNode) {
                            document.body.removeChild(container);
                        }
                        reject(err);
                    }
                }, 1200);
            });
        } catch (error) {
            reject(error);
        }
    });
}

// Generate PDF with QR codes
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
        let successCount = 0;
        let failedStudents = [];

        for (let i = 0; i < students.length; i++) {
            const s = students[i];
            
            this.innerText = `Generating ${i + 1}/${students.length}`;
            
            let qrDataUrl = null;
            let retries = 5;
            
            while (retries > 0 && !qrDataUrl) {
                try {
                    qrDataUrl = await generateQRDataURL(s.ID, s.Name);
                    
                    if (!qrDataUrl || !qrDataUrl.startsWith('data:image/png') || qrDataUrl.length < 1000) {
                        throw new Error('Invalid QR data');
                    }
                    
                    console.log(`✓ Generated QR for ${s.Name} (${s.ID})`);
                } catch (err) {
                    retries--;
                    console.log(`Retry for ${s.ID}, attempts left: ${retries}`);
                    if (retries > 0) {
                        await new Promise(resolve => setTimeout(resolve, 800));
                    } else {
                        console.error("Failed for", s.ID, err);
                        failedStudents.push(`${s.Name} (${s.ID})`);
                    }
                }
            }
            
            if (!qrDataUrl) {
                continue;
            }

            doc.setFontSize(16);
            doc.text(`Student: ${s.Name}`, 20, 20);
            doc.text(`Hash ID: ${s.ID}`, 20, 30);
            doc.text(`Year: ${s.Year}`, 20, 40);

            try {
                doc.addImage(qrDataUrl, 'PNG', 20, 50, 60, 60, `qr_${s.ID}`, 'SLOW');
                successCount++;
            } catch (err) {
                console.error(`Failed to add image for ${s.ID}:`, err);
                failedStudents.push(`${s.Name} (${s.ID})`);
            }

            if (i < students.length - 1) doc.addPage();
            
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        doc.save("Navratri_QR_Codes.pdf");
        
        let message = `PDF generated with ${successCount} QR codes!`;
        if (failedStudents.length > 0) {
            message += `\n\nFailed:\n${failedStudents.join('\n')}`;
        }
        alert(message);
        
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
                        const scannedData = result.data || result;
                        handleScan(scannedData);
                    }
                },
                {
                    returnDetailedScanResult: true,
                    highlightScanRegion: true,
                    highlightCodeOutline: true,
                    maxScansPerSecond: 1,
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

// Tap status to reset
document.getElementById('status').addEventListener('click', function() {
    if (isScanning) {
        this.innerText = "Point camera at QR code";
        this.style.color = 'white';
        this.style.fontSize = '18px';
        lastScanTime = 0;
    }
});

// Handle scanned QR - now parses ID|Name format
function handleScan(data) {
    if (!isScanning) return;
    
    const now = Date.now();
    if (now - lastScanTime < scanCooldown) {
        return;
    }
    lastScanTime = now;
    
    let scannedData = '';
    if (typeof data === 'object' && data.data) {
        scannedData = String(data.data).trim();
    } else {
        scannedData = String(data).trim();
    }
    
    console.log("=== SCAN DEBUG ===");
    console.log("Scanned:", scannedData);
    
    if (!scannedData || scannedData === '') {
        const statusDiv = document.getElementById('status');
        statusDiv.innerText = `❌ Empty QR Data!\n\nTap to continue...`;
        statusDiv.style.color = 'red';
        statusDiv.style.fontSize = '18px';
        playBeep(false);
        return;
    }
    
    // Parse QR data (format: ID|Name)
    let scannedID = scannedData;
    let scannedName = '';
    
    if (scannedData.includes('|')) {
        const parts = scannedData.split('|');
        scannedID = parts[0].trim();
        scannedName = parts[1] ? parts[1].trim() : '';
    }
    
    console.log("Parsed - ID:", scannedID, "Name:", scannedName);
    
    // Find student by ID
    let student = students.find(s => String(s.ID).trim() === scannedID);
    
    // Fallback: try to find by name if provided
    if (!student && scannedName) {
        student = students.find(s => 
            String(s.Name).trim().toLowerCase() === scannedName.toLowerCase()
        );
    }
    
    const statusDiv = document.getElementById('status');

    if (!student) {
        statusDiv.innerText = `❌ Invalid QR!\nID: ${scannedID}\n${scannedName ? 'Name: ' + scannedName : ''}\n\nTap to continue...`;
        statusDiv.style.color = 'red';
        statusDiv.style.fontSize = '18px';
        playBeep(false);
        return;
    }

    // Verify name matches if provided in QR
    if (scannedName && scannedName !== student.Name) {
        statusDiv.innerText = `⚠️ Name Mismatch!\nQR: ${scannedName}\nDB: ${student.Name}\n\nTap to continue...`;
        statusDiv.style.color = 'orange';
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
        statusDiv.innerText = `✓ ${student.Name}\n(ID: ${student.ID})\nEntry Confirmed!\n\nTap to continue...`;
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

    const enteredStudents = students.filter(s => s.Entry_Status === 'Entered');
    
    if (enteredStudents.length === 0) {
        alert("No entries yet!");
        return;
    }

    const csv = Papa.unparse(enteredStudents);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    saveAs(blob, "navratri_entry_log.csv");
    alert(`Downloaded ${enteredStudents.length} entries!`);
});