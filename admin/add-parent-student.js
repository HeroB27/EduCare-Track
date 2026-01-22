// Use Firebase from core.js - No duplicate declaration
let enrollmentDb = null;

// Enrollment Data Storage
let enrollmentData = {
    parent: null,
    students: [],
    currentStudentIndex: 0
};

// DOM Elements
const parentForm = document.getElementById('parentForm');
const studentForm = document.getElementById('studentForm');
const idPreview = document.getElementById('idPreview');
const studentList = document.getElementById('studentList');

// Initialize database connection
function initializeDatabase() {
    try {
        if (typeof EducareTrack !== 'undefined' && EducareTrack.db) {
            enrollmentDb = EducareTrack.db;
            console.log('Using Supabase database from core.js');
            return;
        }
        // Mock database for demo purposes (fallback)
        enrollmentDb = {
            collection: function(name) {
                console.log('Using mock collection:', name);
                return {
                    add: function(data) {
                        console.log('Mock add:', data);
                        return Promise.resolve({ id: 'mock-id-' + Date.now() });
                    },
                    doc: function(id) {
                        return {
                            set: function(data) {
                                console.log('Mock set:', data);
                                return Promise.resolve();
                            },
                            update: function(data) {
                                console.log('Mock update:', data);
                                return Promise.resolve();
                            },
                            get: function() {
                                return Promise.resolve({
                                    exists: true,
                                    data: function() { return {}; }
                                });
                            }
                        };
                    },
                    where: function() { return this; },
                    get: function() {
                        return Promise.resolve({ empty: true });
                    }
                };
            },
            batch: function() {
                return {
                    set: function(ref, data) { return this; },
                    update: function(ref, data) { return this; },
                    commit: function() { return Promise.resolve(); }
                };
            }
        };
        console.log('Using mock database - Supabase client not available');
    } catch (error) {
        console.error('Error initializing database:', error);
    }
}

// Helper to check if Firebase is properly configured
function isFirebaseAvailable() {
    return typeof firebase !== 'undefined' && 
           firebase.apps.length > 0 && 
           typeof firebase.firestore === 'function';
}

// Progress Steps
function updateProgressSteps(currentStep) {
    const steps = document.querySelectorAll('.flex-1.text-center');
    steps.forEach((step, index) => {
        const number = step.querySelector('div');
        const text = step.querySelector('span');
        
        if (index < currentStep) {
            number.className = 'w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto mb-2';
            text.className = 'text-sm font-medium text-blue-600';
        } else if (index === currentStep) {
            number.className = 'w-10 h-10 bg-blue-500 text-white rounded-full flex items-center justify-center mx-auto mb-2';
            text.className = 'text-sm font-medium text-blue-500';
        } else {
            number.className = 'w-10 h-10 bg-gray-300 text-gray-600 rounded-full flex items-center justify-center mx-auto mb-2';
            text.className = 'text-sm font-medium text-gray-500';
        }
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing enrollment page...');
    
    // Wait a bit for Firebase to initialize
    setTimeout(() => {
        initializeDatabase();
        initializeEventListeners();
        updateProgressSteps(0);
        
        console.log('Database initialized:', enrollmentDb);
        console.log('Firebase available:', isFirebaseAvailable());
    }, 100);
});

function initializeEventListeners() {
    // Navigation
    document.getElementById('nextToStudent').addEventListener('click', nextToStudent);
    document.getElementById('backToParent').addEventListener('click', backToParent);
    document.getElementById('nextToID').addEventListener('click', nextToID);
    document.getElementById('backToStudent').addEventListener('click', backToStudent);
    document.getElementById('addAnotherStudent').addEventListener('click', addAnotherStudent);
    document.getElementById('saveEnrollment').addEventListener('click', saveEnrollment);
    document.getElementById('enrollAnother').addEventListener('click', enrollAnother);
    document.getElementById('printID').addEventListener('click', printID);

    // Grade Level Change
    document.getElementById('gradeLevel').addEventListener('change', toggleStrandField);

    // Photo Handling
    document.getElementById('uploadBtn').addEventListener('click', () => document.getElementById('studentPicture').click());
    document.getElementById('webcamBtn').addEventListener('click', openWebcam);
    document.getElementById('studentPicture').addEventListener('change', handleImageUpload);
    document.getElementById('cancelWebcam').addEventListener('click', closeWebcam);
    document.getElementById('capturePhoto').addEventListener('click', capturePhoto);

    // Student selection for ID preview
    studentList.addEventListener('click', function(e) {
        if (e.target.closest('.student-item')) {
            const index = parseInt(e.target.closest('.student-item').dataset.index);
            showStudentIDPreview(index);
        }
    });
}

// Navigation Functions
function nextToStudent() {
    if (validateParentForm()) {
        enrollmentData.parent = getParentFormData();
        parentForm.classList.add('hidden');
        studentForm.classList.remove('hidden');
        updateProgressSteps(1);
    }
}

function backToParent() {
    studentForm.classList.add('hidden');
    parentForm.classList.remove('hidden');
    updateProgressSteps(0);
}

function nextToID() {
    if (validateStudentForm()) {
        const studentData = getStudentFormData();
        enrollmentData.students[enrollmentData.currentStudentIndex] = studentData;
        
        studentForm.classList.add('hidden');
        idPreview.classList.remove('hidden');
        updateProgressSteps(2);
        
        updateStudentList();
        showStudentIDPreview(0);
    }
}

function backToStudent() {
    idPreview.classList.add('hidden');
    studentForm.classList.remove('hidden');
    updateProgressSteps(1);
}

function addAnotherStudent() {
    // Save current student data
    if (validateStudentForm()) {
        const studentData = getStudentFormData();
        enrollmentData.students[enrollmentData.currentStudentIndex] = studentData;
        
        // Reset form for new student
        resetStudentForm();
        enrollmentData.currentStudentIndex = enrollmentData.students.length;
        
        // Go back to student form
        idPreview.classList.add('hidden');
        studentForm.classList.remove('hidden');
        parentForm.classList.add('hidden');
        updateProgressSteps(1);
    }
}

// Form Handling
function validateParentForm() {
    const form = document.getElementById('parentInfoForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return false;
    }
    
    // Validate phone number format
    const phone = document.getElementById('phoneNumber').value;
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    if (!username || !password) {
        if (window.EducareTrack && typeof window.EducareTrack.showNormalNotification === 'function') {
            window.EducareTrack.showNormalNotification({ title: 'Missing Credentials', message: 'Please enter a username and password for the parent account.' });
        }
        return false;
    }

    const phoneRegex = /^09[0-9]{9}$/;
    if (!phoneRegex.test(phone)) {
        if (window.EducareTrack && typeof window.EducareTrack.showNormalNotification === 'function') {
            window.EducareTrack.showNormalNotification({ title: 'Invalid Phone', message: 'Please enter a valid Philippine phone number (09XXXXXXXXX).' });
        }
        return false;
    }
    
    return true;
}

function validateStudentForm() {
    const form = document.getElementById('studentInfoForm');
    const gradeLevel = document.getElementById('gradeLevel').value;
    const strand = document.getElementById('strand').value;
    const lrn = document.getElementById('studentLRN').value;
    
    if (!form.checkValidity()) {
        form.reportValidity();
        return false;
    }
    
    // Validate LRN format (12 digits)
    const lrnRegex = /^[0-9]{12}$/;
    if (!lrnRegex.test(lrn)) {
        if (window.EducareTrack && typeof window.EducareTrack.showNormalNotification === 'function') {
            window.EducareTrack.showNormalNotification({ title: 'Invalid LRN', message: 'Please enter a valid 12-digit LRN.' });
        }
        return false;
    }
    
    if ((gradeLevel === '11' || gradeLevel === '12') && !strand) {
        if (window.EducareTrack && typeof window.EducareTrack.showNormalNotification === 'function') {
            window.EducareTrack.showNormalNotification({ title: 'Strand Required', message: 'Please select a strand for Senior High School students.' });
        }
        return false;
    }
    
    return true;
}

function getParentFormData() {
    return {
        name: document.getElementById('parentName').value.trim(),
        username: document.getElementById('username').value.trim(),
        password: document.getElementById('password').value,
        phone: document.getElementById('phoneNumber').value.trim(),
        email: document.getElementById('email').value.trim() || null,
        address: document.getElementById('homeAddress').value.trim(),
        relationship: document.getElementById('relationship').value,
        createdAt: new Date().toISOString()
    };
}

// FIXED: Enhanced student data collection
function getStudentFormData() {
    const gradeLevel = document.getElementById('gradeLevel').value;
    const strand = (gradeLevel === '11' || gradeLevel === '12') ? document.getElementById('strand').value : null;
    
    // Convert grade number to full grade name
    const gradeName = convertGradeToName(gradeLevel);
    
    // Generate student ID first
    const lrn = document.getElementById('studentLRN').value.trim();
    const studentId = generateStudentId(lrn);
    
    console.log('Student Form Data Collected:', {
        name: document.getElementById('studentName').value.trim(),
        lrn: lrn,
        grade: gradeName,
        strand: strand,
        level: getLevelFromGrade(gradeLevel),
        studentId: studentId
    });
    
    return {
        name: document.getElementById('studentName').value.trim(),
        lrn: lrn,
        grade: gradeName,
        strand: strand,
        level: getLevelFromGrade(gradeLevel),
        picture: document.getElementById('previewImage').src || null,
        studentId: studentId, // This is crucial for QR codes
        createdAt: new Date().toISOString()
    };
}

// Helper function to convert grade number to full grade name
function convertGradeToName(grade) {
    const gradeMap = {
        'K': 'Kindergarten',
        '1': 'Grade 1',
        '2': 'Grade 2', 
        '3': 'Grade 3',
        '4': 'Grade 4',
        '5': 'Grade 5',
        '6': 'Grade 6',
        '7': 'Grade 7',
        '8': 'Grade 8',
        '9': 'Grade 9',
        '10': 'Grade 10',
        '11': 'Grade 11',
        '12': 'Grade 12'
    };
    return gradeMap[grade] || `Grade ${grade}`;
}

function resetStudentForm() {
    document.getElementById('studentInfoForm').reset();
    document.getElementById('strandField').classList.add('hidden');
    document.getElementById('picturePreview').classList.add('hidden');
    document.getElementById('uploadArea').classList.remove('hidden');
}

// Helper function to determine level from grade - FIXED VERSION
function getLevelFromGrade(grade) {
    if (grade === 'K' || grade === 'Kindergarten') return 'Kindergarten';
    
    const gradeNum = parseInt(grade);
    if (isNaN(gradeNum)) return 'Elementary';
    
    if (gradeNum <= 6) return 'Elementary';
    if (gradeNum <= 10) return 'Junior High School';
    if (gradeNum <= 12) return 'Senior High School';
    return 'Elementary';
}

// Strand Field Toggle
function toggleStrandField() {
    const gradeLevel = document.getElementById('gradeLevel').value;
    const strandField = document.getElementById('strandField');
    const strandSelect = document.getElementById('strand');
    
    if (gradeLevel === '11' || gradeLevel === '12') {
        strandField.classList.remove('hidden');
        strandSelect.required = true;
    } else {
        strandField.classList.add('hidden');
        strandSelect.required = false;
        strandSelect.value = '';
    }
}

// Enhanced Student ID Generation
function generateStudentId(lrn) {
    const year = new Date().getFullYear();
    const lastFourLRN = lrn && lrn.length >= 4 ? lrn.slice(-4) : '0000';
    const randomNum = Math.floor(1000 + Math.random() * 9000); // Random 4-digit number
    
    const studentId = `EDU-${year}-${lastFourLRN}-${randomNum}`;
    console.log('Generated Student ID:', studentId, 'from LRN:', lrn);
    return studentId;
}

// Student List Management
function updateStudentList() {
    studentList.innerHTML = '';
    
    enrollmentData.students.forEach((student, index) => {
        const studentItem = document.createElement('div');
        studentItem.className = 'student-item bg-white border border-gray-200 rounded-lg p-3 cursor-pointer hover:bg-blue-50 transition-colors';
        studentItem.dataset.index = index;
        
        studentItem.innerHTML = `
            <div class="flex items-center space-x-3">
                <div class="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <i class="fas fa-user text-blue-600"></i>
                </div>
                <div class="flex-1">
                    <h4 class="font-semibold text-gray-800">${student.name}</h4>
                    <p class="text-sm text-gray-600">${student.grade} ${student.strand ? `• ${student.strand}` : ''}</p>
                    <p class="text-xs text-gray-500">LRN: ${student.lrn}</p>
                    <p class="text-xs text-blue-600 font-mono">ID: ${student.studentId}</p>
                </div>
                <i class="fas fa-chevron-right text-gray-400"></i>
            </div>
        `;
        
        studentList.appendChild(studentItem);
    });
}

// ID Preview
function showStudentIDPreview(index) {
    const student = enrollmentData.students[index];
    const parent = enrollmentData.parent;
    
    // Update ID Preview
    document.getElementById('idStudentName').textContent = student.name;
    document.getElementById('idGradeLevel').textContent = `${student.grade}${student.strand ? ` - ${student.strand}` : ''}`;
    const addrEl = document.getElementById('idAddress');
    if (addrEl) addrEl.textContent = parent.address || '';
    const lrnEl = document.getElementById('idLRN');
    if (lrnEl) lrnEl.textContent = student.lrn || '';
    document.getElementById('idStudentId').textContent = student.studentId;
    document.getElementById('idParentName').innerHTML = `<strong>Parent:</strong> ${parent.name}`;
    document.getElementById('idParentPhone').innerHTML = `<strong>Contact:</strong> ${parent.phone}`;
    
    // Update photo
    if (student.picture) {
        document.getElementById('idPreviewImage').src = student.picture;
        document.getElementById('idPreviewImage').classList.remove('hidden');
        document.getElementById('idPlaceholder').classList.add('hidden');
    } else {
        document.getElementById('idPreviewImage').classList.add('hidden');
        document.getElementById('idPlaceholder').classList.remove('hidden');
    }
    
    // Generate QR Code
    generateQRCode(student.studentId);
}

// Enhanced QR Code Generation - Fixed Version
function generateQRCode(studentId) {
    const qrContainer = document.getElementById('qrCode');
    qrContainer.innerHTML = '';
    
    console.log('Generating QR code for student ID:', studentId);
    
    try {
        // Method 1: Try using qrcode-generator library (most reliable)
        if (typeof qrcode !== 'undefined') {
            console.log('Using qrcode-generator library');
            
            const typeNumber = 0; // Auto detect
            const errorCorrectionLevel = 'M';
            const qr = qrcode(typeNumber, errorCorrectionLevel);
            
            // Use only the student ID - clean and simple
            qr.addData(studentId.toString());
            qr.make();
            
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const size = 120;
            const margin = 2;
            canvas.width = size;
            canvas.height = size;
            
            // Get QR code module count
            const moduleCount = qr.getModuleCount();
            const tileSize = (size - margin * 2) / moduleCount;
            
            // Draw white background
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, size, size);
            
            // Draw QR code modules
            ctx.fillStyle = '#000000';
            for (let row = 0; row < moduleCount; row++) {
                for (let col = 0; col < moduleCount; col++) {
                    if (qr.isDark(row, col)) {
                        ctx.fillRect(
                            margin + col * tileSize, 
                            margin + row * tileSize, 
                            tileSize, 
                            tileSize
                        );
                    }
                }
            }
            
            qrContainer.appendChild(canvas);
            console.log('QR code generated successfully with qrcode-generator');
            return;
        }
        
        // Method 2: Fallback to simple canvas-based QR-like pattern
        console.log('Using fallback QR code generation');
        createSimpleQRCode(studentId, qrContainer);
        
    } catch (error) {
        console.error('QR Code generation failed:', error);
        // Method 3: Ultimate fallback - text display
        showFallbackQR(studentId, qrContainer);
    }
}

// Enhanced simple QR code generator
function createSimpleQRCode(studentId, container) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const size = 120;
    const margin = 4;
    
    canvas.width = size;
    canvas.height = size;
    
    // Create a deterministic pattern based on the student ID
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    
    ctx.fillStyle = '#000000';
    
    // Use student ID to generate consistent pattern
    let hash = 0;
    for (let i = 0; i < studentId.length; i++) {
        hash = studentId.charCodeAt(i) + ((hash << 5) - hash);
        hash = hash & hash; // Convert to 32-bit integer
    }
    
    // Simple QR-like pattern with position markers
    const moduleSize = 4;
    const modules = 21; // Fixed number of modules for consistency
    
    // Draw position markers (like real QR codes)
    drawPositionMarker(ctx, margin, margin, moduleSize);
    drawPositionMarker(ctx, size - margin - 7 * moduleSize, margin, moduleSize);
    drawPositionMarker(ctx, margin, size - margin - 7 * moduleSize, moduleSize);
    
    // Draw data modules based on hash
    for (let x = 0; x < modules; x++) {
        for (let y = 0; y < modules; y++) {
            // Skip position marker areas
            if ((x < 8 && y < 8) || 
                (x > modules - 9 && y < 8) || 
                (x < 8 && y > modules - 9)) {
                continue;
            }
            
            // Use hash to determine if module should be dark
            const seed = hash + x * 17 + y * 23;
            const randomValue = Math.abs(Math.sin(seed) * 10000);
            const normalized = randomValue - Math.floor(randomValue);
            
            if (normalized > 0.6) { // Adjust threshold for density
                ctx.fillRect(
                    margin + x * moduleSize, 
                    margin + y * moduleSize, 
                    moduleSize - 0.5, 
                    moduleSize - 0.5
                );
            }
        }
    }
    
    container.appendChild(canvas);
    console.log('Fallback QR code generated');
}

// Helper to draw position markers
function drawPositionMarker(ctx, x, y, moduleSize) {
    ctx.fillStyle = '#000000';
    
    // Outer square
    ctx.fillRect(x, y, 7 * moduleSize, 7 * moduleSize);
    
    // Inner white square
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + moduleSize, y + moduleSize, 5 * moduleSize, 5 * moduleSize);
    
    // Center black square
    ctx.fillStyle = '#000000';
    ctx.fillRect(x + 2 * moduleSize, y + 2 * moduleSize, 3 * moduleSize, 3 * moduleSize);
}

function showFallbackQR(studentId, container) {
    container.innerHTML = `
        <div class="text-center p-2">
            <div class="bg-white p-3 rounded-lg inline-block border border-gray-300">
                <div class="w-20 h-20 bg-gray-100 flex items-center justify-center rounded mb-2">
                    <i class="fas fa-qrcode text-gray-400 text-2xl"></i>
                </div>
                <p class="text-xs font-mono text-gray-600 break-all max-w-[100px]">${studentId}</p>
                <p class="text-xs text-gray-500 mt-1">ID: ${studentId.substring(0, 8)}...</p>
            </div>
        </div>
    `;
    console.log('Text fallback QR displayed for ID:', studentId);
}

// Photo Handling
function handleImageUpload(event) {
    const file = event.target.files[0];
    if (file) {
        if (file.size > 2 * 1024 * 1024) {
            if (window.EducareTrack && typeof window.EducareTrack.showNormalNotification === 'function') {
                window.EducareTrack.showNormalNotification({ title: 'File Too Large', message: 'File size must be less than 2MB' });
            }
            return;
        }
        
        if (!file.type.startsWith('image/')) {
            if (window.EducareTrack && typeof window.EducareTrack.showNormalNotification === 'function') {
                window.EducareTrack.showNormalNotification({ title: 'Invalid File', message: 'Please select an image file' });
            }
            return;
        }
        
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('previewImage').src = e.target.result;
            document.getElementById('picturePreview').classList.remove('hidden');
            document.getElementById('uploadArea').classList.add('hidden');
        };
        reader.onerror = function() {
            if (window.EducareTrack && typeof window.EducareTrack.showNormalNotification === 'function') {
                window.EducareTrack.showNormalNotification({ title: 'File Error', message: 'Error reading file. Please try another image.' });
            }
        };
        reader.readAsDataURL(file);
    }
}

// Webcam Functions
let webcamStream = null;

function openWebcam() {
    const modal = document.getElementById('webcamModal');
    const video = document.getElementById('webcamVideo');
    
    modal.classList.remove('hidden');
    
    // Try to access webcam
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: 'user',
                width: { ideal: 640 },
                height: { ideal: 480 }
            } 
        })
        .then(stream => {
            webcamStream = stream;
            video.srcObject = stream;
        })
        .catch(error => {
            console.error('Error accessing webcam:', error);
            if (window.EducareTrack && typeof window.EducareTrack.showNormalNotification === 'function') {
                window.EducareTrack.showNormalNotification({ title: 'Webcam Error', message: 'Cannot access webcam. Please check permissions or try uploading a photo instead.' });
            }
            closeWebcam();
        });
    } else {
        if (window.EducareTrack && typeof window.EducareTrack.showNormalNotification === 'function') {
            window.EducareTrack.showNormalNotification({ title: 'Webcam Unsupported', message: 'Webcam not supported in this browser. Please upload a photo instead.' });
        }
        closeWebcam();
    }
}

function closeWebcam() {
    const modal = document.getElementById('webcamModal');
    const video = document.getElementById('webcamVideo');
    
    if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
        webcamStream = null;
    }
    
    video.srcObject = null;
    modal.classList.add('hidden');
}

function capturePhoto() {
    const video = document.getElementById('webcamVideo');
    const canvas = document.getElementById('webcamCanvas');
    const context = canvas.getContext('2d');
    
    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Draw current video frame to canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Convert to data URL and update preview
    const photoDataUrl = canvas.toDataURL('image/png');
    document.getElementById('previewImage').src = photoDataUrl;
    document.getElementById('picturePreview').classList.remove('hidden');
    document.getElementById('uploadArea').classList.add('hidden');
    
    closeWebcam();
}

// Save Enrollment - FIXED VERSION
async function saveEnrollment() {
    try {
        // Show loading state
        const saveBtn = document.getElementById('saveEnrollment');
        const originalText = saveBtn.innerHTML;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i><span>Saving...</span>';
        saveBtn.disabled = true;

        // Validate we have at least one student
        if (enrollmentData.students.length === 0) {
            throw new Error('Please add at least one student');
        }

        // Validate parent data
        if (!enrollmentData.parent) {
            throw new Error('Parent information is missing');
        }

        console.log('Starting enrollment process...', enrollmentData);

        // Save to Firebase
        let savedIds = [];
        let createdParentId = null;
        
        if (typeof EducareTrack !== 'undefined' && EducareTrack.enrollStudentWithParent) {
            console.log('Using EducareTrack enrollment method');
            // Use EducareTrack method
            for (let i = 0; i < enrollmentData.students.length; i++) {
                const student = enrollmentData.students[i];
                // Ensure student has parent's address/contact if not set (though UI should have handled this)
                if (!student.address && enrollmentData.parent.address) student.address = enrollmentData.parent.address;
                if (!student.emergencyContact && enrollmentData.parent.phone) student.emergencyContact = enrollmentData.parent.phone;

                let result;
                if (i === 0) {
                    // First student: Create Parent + Student
                    result = await EducareTrack.enrollStudentWithParent(
                        enrollmentData.parent,
                        student,
                        student.picture // Pass the picture data URL
                    );
                    createdParentId = result.parentId;
                } else {
                    // Subsequent students: Enroll Student and link to existing Parent
                    if (!createdParentId) throw new Error('Parent ID missing for subsequent student enrollment');
                    
                    const studentId = await EducareTrack.enrollStudentOnly(
                        student,
                        createdParentId,
                        student.picture
                    );
                    result = { parentId: createdParentId, studentId: studentId };
                }
                savedIds.push(result);
            }
        } else {
            console.log('Using direct Firestore method');
            // Use direct database method
            savedIds = await saveToFirestoreDirect();
        }

        console.log('Enrollment successful, saved IDs:', savedIds);

        // Show success message
        document.getElementById('successModal').classList.remove('hidden');
        
    } catch (error) {
        console.error('Error saving enrollment:', error);
        if (window.EducareTrack && typeof window.EducareTrack.showNormalNotification === 'function') {
            window.EducareTrack.showNormalNotification({ title: 'Error', message: 'Error saving enrollment: ' + error.message });
        }
        
        // Restore button state
        const saveBtn = document.getElementById('saveEnrollment');
        saveBtn.innerHTML = '<i class="fas fa-save mr-2"></i><span>Save Enrollment</span>';
        saveBtn.disabled = false;
    }
}

// Improved class creation function - FIXED FOR KINDERGARTEN
async function getOrCreateClassId(grade, strand) {
    try {
        // Create class name - FIXED: Handle Kindergarten properly
        let className = grade; // grade is already in "Grade X" or "Kindergarten" format
        let level = getLevelFromGrade(grade);
        
        // For Kindergarten, no strand
        if (strand && level !== 'Kindergarten') {
            className += ` ${strand}`;
        }

        // For demo or when Firestore is not available
        if (!enrollmentDb || (typeof firebase === 'undefined' && !enrollmentDb.collection)) {
            return `class-${grade.replace(' ', '-').toLowerCase()}-${strand || 'general'}`;
        }

        // Check if class exists - FIXED: Use proper field names
        const classesSnapshot = await enrollmentDb.collection('classes')
            .where('name', '==', className)
            .where('grade', '==', grade)
            .get();

        if (!classesSnapshot.empty) {
            return classesSnapshot.docs[0].id;
        }

        // Create new class - FIXED: Include all required fields
        const classData = {
            name: className,
            grade: grade,
            level: level,
            strand: strand || null,
            subjects: typeof EducareTrack !== 'undefined' ? EducareTrack.getSubjectsForLevel(level, strand, grade) : [],
            studentCount: 0,
            is_active: true,
            created_at: new Date().toISOString()
        };

        const classRef = await enrollmentDb.collection('classes').add(classData);
        console.log(`Created new class: ${className} with ID: ${classRef.id}`);
        return classRef.id;

    } catch (error) {
        console.error('Error getting/creating class:', error);
        // Return fallback class ID
        return `class-${grade.replace(' ', '-').toLowerCase()}-${strand || 'general'}`;
    }
}

// Direct Firestore save method - ENHANCED
async function saveToFirestoreDirect() {
    const batch = enrollmentDb.batch();
    const savedIds = [];

    try {
        // 1. Create Parent
        const parentId = 'parent-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
        const parentRef = enrollmentDb.collection('users').doc(parentId);
        
        const parentData = {
            id: parentId,
            name: enrollmentData.parent.name,
            phone: enrollmentData.parent.phone,
            email: enrollmentData.parent.email || '',
            address: enrollmentData.parent.address,
            relationship: enrollmentData.parent.relationship,
            role: 'parent',
            username: enrollmentData.parent.username,
            password: enrollmentData.parent.password,
            children: [],
            is_active: true,
            created_at: new Date().toISOString()
        };
        
        batch.set(parentRef, parentData);
        console.log('Parent data prepared:', parentData);

        // 2. Create Students
        for (const student of enrollmentData.students) {
            const studentId = student.studentId || generateStudentId(student.lrn);
            const studentRef = enrollmentDb.collection('students').doc(studentId);
            
            // Get or create class - FIXED: Ensure class is created properly
            const classId = await getOrCreateClassId(student.grade, student.strand);
            
            const studentData = {
                id: studentId,
                studentId: studentId,
                name: student.name,
                lrn: student.lrn,
                grade: student.grade,
                level: student.level,
                strand: student.strand || null,
                class_id: classId, // This is crucial for teacher-student relationship
                parent_id: parentId,
                address: enrollmentData.parent.address, // Inherit from parent
                emergencyContact: enrollmentData.parent.phone, // Inherit from parent
                photo_url: student.picture || null,
                qrCode: studentId,
                current_status: 'out_school',
                last_attendance: null,
                last_clinic_visit: null,
                is_active: true,
                created_at: new Date().toISOString()
            };
            
            batch.set(studentRef, studentData);
            savedIds.push(studentId);
            
            // Add student ID to parent's children array
            parentData.children.push(studentId);
            
            console.log('Student data prepared:', studentData);
        }

        // Update parent with children IDs
        batch.update(parentRef, { children: parentData.children });

        // Commit the batch
        await batch.commit();
        console.log('Batch committed successfully');

        return savedIds;

    } catch (error) {
        console.error('Error in direct Firestore save:', error);
        throw error;
    }
}

function enrollAnother() {
    // Close success modal
    document.getElementById('successModal').classList.add('hidden');
    
    // Reset all forms
    document.getElementById('parentInfoForm').reset();
    document.getElementById('studentInfoForm').reset();
    
    // Reset data
    enrollmentData = {
        parent: null,
        students: [],
        currentStudentIndex: 0
    };
    
    // Reset UI
    idPreview.classList.add('hidden');
    studentForm.classList.add('hidden');
    parentForm.classList.remove('hidden');
    updateProgressSteps(0);
    
    // Reset photo previews
    document.getElementById('picturePreview').classList.add('hidden');
    document.getElementById('uploadArea').classList.remove('hidden');
    document.getElementById('strandField').classList.add('hidden');
    
    // Reset file input
    document.getElementById('studentPicture').value = '';
}

// Utility function to show notifications
function showNotification(message, type = 'info') {
    if (window.EducareTrack && typeof window.EducareTrack.showNormalNotification === 'function') {
        window.EducareTrack.showNormalNotification({ title: type === 'error' ? 'Error' : 'Info', message, type });
    }
}

// Add keyboard shortcuts
document.addEventListener('keydown', function(e) {
    // Escape key to close webcam modal
    if (e.key === 'Escape') {
        if (!document.getElementById('webcamModal').classList.contains('hidden')) {
            closeWebcam();
        }
    }
    
    // Enter key to proceed to next step (when not in textarea)
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
        if (!parentForm.classList.contains('hidden')) {
            e.preventDefault();
            nextToStudent();
        } else if (!studentForm.classList.contains('hidden')) {
            e.preventDefault();
            nextToID();
        }
    }
});

function printID() {
    // Select the card container
    const printContent = document.querySelector('.bg-white.rounded-xl.p-6.shadow-lg').innerHTML;
    
    // Create a print window
    const printWindow = window.open('', '', 'height=600,width=800');
    printWindow.document.write('<html><head><title>Print ID</title>');
    printWindow.document.write('<script src="https://cdn.tailwindcss.com"></script>');
    printWindow.document.write('<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">');
    printWindow.document.write('<style>@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }</style>');
    printWindow.document.write('</head><body class="p-8 flex justify-center items-center min-h-screen bg-white">');
    printWindow.document.write('<div class="w-full max-w-2xl border p-4">' + printContent + '</div>');
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    
    // Wait for styles to load
    setTimeout(() => {
        printWindow.focus();
        printWindow.print();
        printWindow.close();
    }, 1500);
}
