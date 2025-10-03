let students = [];
let qrScanner;
let isScanning = false;
let lastScanTime = 0;
let scanCooldown = 3000; // 3 seconds between scans
let syncInterval = null;
let lastSyncTime = 0;
let isSyncing = false;

// Google Sheets URL
const GOOGLE_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbxKDEGUr9uCd3ZlU4SMvPI6v7u8N8Dud1suJPCaJuYv9dqMemv3HZVJo375UKF-VSNYcw/exec';

// Simple hash function to generate hash from string
function generateHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    // Convert to positive hex string
    return Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
}

// Update sync status indicator
function updateSyncStatus(message, isError = false) {
    let statusEl = document.getElementById('syncStatus');
    if (!statusEl) {
        statusEl = document.createElement('div');
        statusEl.id = 'syncStatus';
        statusEl.style.cssText = 'position: fixed; top: 10px; right: 10px; background: rgba(0,0,0,0.8); color: white; padding: 8px 15px; border-radius: 4px; font-size: 12px; z-index: 999;';
        document.body.appendChild(statusEl);
    }
    statusEl.textContent = message;
    statusEl.style.background = isError ? 'rgba(220, 53, 69, 0.9)' : 'rgba(40, 167, 69, 0.9)';
    lastSyncTime = Date.now();
}

// Load data from Google Sheets (silent mode for background sync)
async function loadExcel(silent = false) {
    if (isSyncing) return; // Prevent concurrent syncs
    
    try {
        isSyncing = true;
        const loadBtn = document.getElementById('loadExcelBtn');
        
        if (!silent) {
            loadBtn.disabled = true;
            loadBtn.innerText = 'Loading...';
        } else {
            updateSyncStatus('Syncing...', false);
        }

        // Fetch data from Google Sheets
        const response = await fetch(GOOGLE_SHEETS_URL + '?action=getData');
        const data = await response.json();
        
        if (data.status === 'success') {
            students = data.data;
            
            // Process each student
            students.forEach(s => {
                // Normalize all fields
                s.ID = String(s.ID || '').trim();
                s.Hash_Code = String(s.Hash_Code || '').trim();
                s.Name = String(s.Name || '').trim();
                s.Year = String(s.Year || '').trim();
                s.Entry_Status = String(s.Entry_Status || '').trim();
                s.Timestamp = String(s.Timestamp || '').trim();
            });
            
            populateTable();
            
            const enteredCount = students.filter(s => s.Entry_Status === 'Entered').length;
            console.log(`Synced: ${enteredCount} entered out of ${students.length} total`);
            
            if (!silent) {
                alert(`Loaded ${students.length} students from Google Sheets!\nCurrent entries: ${enteredCount}`);
            } else {
                updateSyncStatus(`✓ ${enteredCount} Entered | Total: ${students.length}`, false);
            }
        } else {
            throw new Error(data.message || 'Failed to load data');
        }
        
        if (!silent) {
            loadBtn.disabled = false;
            loadBtn.innerText = 'Load Excel';
        }
    } catch (error) {
        console.error('Error loading from Google Sheets:', error);
        if (!silent) {
            alert('Error loading data from Google Sheets: ' + error.message);
            document.getElementById('loadExcelBtn').disabled = false;
            document.getElementById('loadExcelBtn').innerText = 'Load Excel';
        } else {
            updateSyncStatus('✗ Sync failed', true);
        }
    } finally {
        isSyncing = false;
    }
}

// Start automatic background sync
function startAutoSync() {
    if (syncInterval) return; // Already running
    
    // Sync every 8 seconds
    syncInterval = setInterval(() => {
        if (!isSyncing && students.length > 0) {
            loadExcel(true); // Silent sync
        }
    }, 8000);
    
    console.log("Auto-sync started (every 8 seconds)");
}

// Stop automatic background sync
function stopAutoSync() {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
        console.log("Auto-sync stopped");
    }
}

// Update entry status in Google Sheets
async function updateEntryStatus(id, name, status, timestamp) {
    try {
        const response = await fetch(GOOGLE_SHEETS_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'updateEntry',
                id: id,
                name: name,
                status: status,
                timestamp: timestamp
            })
        });
        
        console.log('Entry updated in Google Sheets:', { id, name, status, timestamp });
        
        // Immediately sync to get latest data after an update
        setTimeout(() => {
            if (!isSyncing) {
                loadExcel(true);
            }
        }, 1000);
        
        return true;
    } catch (error) {
        console.error('Error updating Google Sheets:', error);
        return false;
    }
}

document.getElementById('loadExcelBtn').addEventListener('click', () => loadExcel(false));

// Auto-load data when page loads
window.addEventListener('DOMContentLoaded', async () => {
    console.log("Page loaded - auto-loading data...");
    await loadExcel(false);
    
    // Start auto-sync after initial load
    startAutoSync();
});

// Helper: generate QR data URL using canvas (mobile-optimized)
function generateQRDataURL(text) {
    return new Promise((resolve, reject) => {
        try {
            // Create a visible temporary container (required for some mobile browsers)
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

            // Clear any previous content
            container.innerHTML = '';

            // Generate QR code with optimized settings for mobile
            const qr = new QRCode(container, {
                text: String(text),
                width: 256,
                height: 256,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });

            // Use requestAnimationFrame to ensure rendering is complete
            requestAnimationFrame(() => {
                setTimeout(() => {
                    try {
                        const canvas = container.querySelector('canvas');
                        const img = container.querySelector('img');
                        
                        if (canvas) {
                            // Create a new canvas to ensure clean render
                            const newCanvas = document.createElement('canvas');
                            newCanvas.width = 256;
                            newCanvas.height = 256;
                            const ctx = newCanvas.getContext('2d');
                            
                            // Draw white background first
                            ctx.fillStyle = '#ffffff';
                            ctx.fillRect(0, 0, 256, 256);
                            
                            // Draw the QR code
                            ctx.drawImage(canvas, 0, 0, 256, 256);
                            
                            const dataUrl = newCanvas.toDataURL('image/png', 1.0);
                            
                            if (container.parentNode) {
                                document.body.removeChild(container);
                            }
                            
                            // Validate the data URL
                            if (dataUrl && dataUrl.startsWith('data:image/png') && dataUrl.length > 1000) {
                                resolve(dataUrl);
                            } else {
                                reject(new Error('Invalid QR code data'));
                            }
                        } else if (img && img.complete && img.src) {
                            // Use image if available
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
                            reject(new Error('QR code generation failed - no canvas or image'));
                        }
                    } catch (err) {
                        if (container.parentNode) {
                            document.body.removeChild(container);
                        }
                        reject(err);
                    }
                }, 1200); // Longer wait for mobile
            });
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
        let successCount = 0;
        let failedStudents = [];

        for (let i = 0; i < students.length; i++) {
            const s = students[i];
            
            // Show progress
            this.innerText = `Generating ${i + 1}/${students.length}`;
            
            // Retry mechanism for QR generation
            let qrDataUrl = null;
            let retries = 5; // Increased retries for mobile
            
            while (retries > 0 && !qrDataUrl) {
                try {
                    // Use Hash_Code for QR generation
                    qrDataUrl = await generateQRDataURL(String(s.Hash_Code));
                    
                    // Stricter validation
                    if (!qrDataUrl || !qrDataUrl.startsWith('data:image/png') || qrDataUrl.length < 1000) {
                        throw new Error('Invalid QR data');
                    }
                    
                    console.log(`Generated QR for ${s.Name} (Hash: ${s.Hash_Code}), size: ${qrDataUrl.length}`);
                } catch (err) {
                    retries--;
                    console.log(`Retry generating QR for ${s.Hash_Code}, attempts left: ${retries}`);
                    if (retries > 0) {
                        await new Promise(resolve => setTimeout(resolve, 800));
                    } else {
                        console.error("Failed to generate QR for", s.Hash_Code, err);
                        failedStudents.push(`${s.Name} (${s.ID})`);
                    }
                }
            }
            
            if (!qrDataUrl) {
                continue; // Skip this student
            }

            // Add page content
            doc.setFontSize(16);
            doc.text(`Student: ${s.Name}`, 20, 20);
            doc.text(`ID: ${s.ID}`, 20, 30);
            doc.text(`Year: ${s.Year}`, 20, 40);
            doc.text(`Hash: ${s.Hash_Code}`, 20, 50);

            // Add QR code image
            try {
                doc.addImage(qrDataUrl, 'PNG', 20, 60, 60, 60, `qr_${s.Hash_Code}`, 'SLOW');
                successCount++;
            } catch (err) {
                console.error(`Failed to add image for ${s.Hash_Code}:`, err);
                failedStudents.push(`${s.Name} (${s.ID})`);
            }

            if (i < students.length - 1) doc.addPage();
            
            // Longer delay for mobile to prevent memory issues
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        // Save the PDF
        doc.save("All_Student_QR.pdf");
        
        // Show result
        let message = `PDF generated with ${successCount} QR codes!`;
        if (failedStudents.length > 0) {
            message += `\n\nFailed to generate for:\n${failedStudents.join('\n')}`;
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
               String(s.Year).toLowerCase().includes(searchLower) ||
               String(s.Hash_Code).toLowerCase().includes(searchLower);
    });
    
    filteredStudents.forEach(s => {
        const tr = document.createElement('tr');
        tr.className = s.Entry_Status === 'Entered' ? 'entered' : '';
        tr.innerHTML = `
            <td>${s.ID}</td>
            <td>${s.Hash_Code}</td>
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
        alert("Waiting for data to load... Please try again in a moment.");
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
        
        // Do an immediate sync when scanner starts
        if (!isSyncing) {
            loadExcel(true);
        }
        
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
    console.log("All Student Hash Codes:", students.map(s => `"${s.Hash_Code}"`));
    console.log("==================");
    
    // Check if we got empty data
    if (!scannedData || scannedData === '') {
        const statusDiv = document.getElementById('status');
        statusDiv.innerText = `Empty QR Data!\nQR code may be corrupted\n\nTap to continue...`;
        statusDiv.style.color = 'red';
        statusDiv.style.fontSize = '18px';
        playBeep(false);
        return;
    }
    
    // Try multiple matching strategies using Hash_Code
    let student = null;
    
    // Strategy 1: Exact hash match
    student = students.find(s => String(s.Hash_Code).trim() === scannedData);
    
    // Strategy 2: Case-insensitive hash match
    if (!student) {
        student = students.find(s => 
            String(s.Hash_Code).trim().toLowerCase() === scannedData.toLowerCase()
        );
    }
    
    // Strategy 3: Check if scanned data contains the hash
    if (!student) {
        student = students.find(s => scannedData.includes(String(s.Hash_Code).trim()));
    }
    
    const statusDiv = document.getElementById('status');

    if (!student) {
        statusDiv.innerText = `Invalid QR Code!\nScanned: "${scannedData}"\n\nTap to continue...`;
        statusDiv.style.color = 'red';
        statusDiv.style.fontSize = '18px';
        playBeep(false);
        return;
    }

    if (student.Entry_Status === 'Entered') {
        statusDiv.innerText = `${student.Name}\n(ID: ${student.ID})\nAlready Entered!\n\nTap to continue...`;
        statusDiv.style.color = 'orange';
        statusDiv.style.fontSize = '20px';
        playBeep(false);
    } else {
        student.Entry_Status = 'Entered';
        student.Timestamp = new Date().toISOString();
        statusDiv.innerText = `${student.Name}\n(ID: ${student.ID})\nEntry Successful!\n\nTap to continue...`;
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