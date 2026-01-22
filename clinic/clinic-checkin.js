// Enhanced clinic-checkin.js with Medical Assessment and Real-time Updates
class ClinicCheckin {
    constructor() {
        this.currentUser = null;
        this.currentPatients = [];
        this.recentVisits = [];
        this.selectedStudent = null;
        
        // QR Scanner properties
        this.videoElement = document.getElementById('video');
        this.canvasElement = document.createElement('canvas');
        this.canvasContext = this.canvasElement.getContext('2d');
        this.scanning = false;
        this.currentStream = null;
        this.facingMode = 'environment';
        this.currentMode = 'checkin'; // 'checkin' or 'checkout'
        this.recentScans = [];
        
        // Medical Assessment properties
        this.pendingStudent = null;
        this.pendingReason = '';
        
        // Statistics
        this.todayVisits = 0;
        this.urgentCases = 0;
        
        this.init();
    }

    async init() {
        try {
            await this.checkAuth();
            await this.loadCurrentPatients();
            await this.loadRecentVisits();
            await this.loadStatistics();
            this.setupEventListeners();
            this.setupScannerEventListeners();
            this.setupRealTimeListeners();
            this.updateCurrentTime();
            setInterval(() => this.updateCurrentTime(), 60000);
            
            console.log('Clinic Check-in initialized with Medical Assessment');
        } catch (error) {
            console.error('Error initializing clinic check-in:', error);
            this.showError('Failed to initialize clinic check-in');
        }
    }

    async checkAuth() {
        const savedUser = localStorage.getItem('educareTrack_user');
        if (!savedUser) {
            window.location.href = '../index.html';
            return;
        }

        this.currentUser = JSON.parse(savedUser);
        if (this.currentUser.role !== 'clinic') {
            window.location.href = '../index.html';
            return;
        }

        document.getElementById('userName').textContent = this.currentUser.name;
        document.getElementById('userInitials').textContent = this.currentUser.name
            .split(' ')
            .map(n => n[0])
            .join('')
            .substring(0, 2)
            .toUpperCase();
    }

    updateCurrentTime() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('en-PH', {
            hour: '2-digit',
            minute: '2-digit'
        });
        document.getElementById('currentTime').textContent = timeString;
    }

    setupEventListeners() {
        // Student search with debouncing
        const studentSearch = document.getElementById('studentSearch');
        studentSearch.addEventListener('input', this.debounce((event) => {
            this.searchStudents(event.target.value);
        }, 300));

        // Click outside to close student results
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#studentSearch') && !e.target.closest('#studentResults')) {
                document.getElementById('studentResults').classList.add('hidden');
            }
        });

        // Quick action buttons
        document.querySelectorAll('button[onclick^="clinicCheckin.quickCheckIn"]').forEach(btn => {
            const reason = btn.getAttribute('onclick').match(/'([^']+)'/)[1];
            btn.onclick = () => this.quickCheckIn(reason);
        });
    }

    setupScannerEventListeners() {
        // Scanner mode switching
        document.getElementById('checkinModeBtn').addEventListener('click', () => this.switchMode('checkin'));
        document.getElementById('checkoutModeBtn').addEventListener('click', () => this.switchMode('checkout'));
        
        // Scanner controls
        document.getElementById('startScanner').addEventListener('click', () => this.startScanner());
        document.getElementById('stopScanner').addEventListener('click', () => this.stopScanner());
        document.getElementById('switchCamera').addEventListener('click', () => this.switchCamera());
    }

    setupRealTimeListeners() {
        if (window.USE_SUPABASE && window.supabaseClient) {
            if (this.pollTimer) {
                clearInterval(this.pollTimer);
            }
            this.pollTimer = setInterval(async () => {
                try {
                    await this.loadRecentVisits();
                    await this.loadCurrentPatients();
                    await this.loadStatistics();
                } catch (e) {
                    console.error('Polling error:', e);
                }
            }, 15000);
        } else {
            this.clinicVisitsListener = firebase.firestore()
                .collection('clinicVisits')
                .orderBy('timestamp', 'desc')
                .limit(10)
                .onSnapshot(snapshot => {
                    snapshot.docChanges().forEach(change => {
                        if (change.type === 'added') {
                            this.loadRecentVisits();
                            this.loadStatistics();
                        }
                    });
                });
            this.studentsListener = firebase.firestore()
                .collection('students')
                .where('currentStatus', '==', 'in_clinic')
                .onSnapshot(snapshot => {
                    this.loadCurrentPatients();
                    this.loadStatistics();
                });
        }
    }

    // Switch between Check-in and Check-out modes
    switchMode(mode) {
        this.currentMode = mode;
        this.updateModeDisplay();
        
        const modeText = mode === 'checkin' ? 'Check-in' : 'Check-out';
        this.updateScannerStatus(`Scanner ready for ${modeText} - Click Start Scanner to begin`);
        
        this.showNotification(`Mode changed to ${modeText}`, 'info');
    }

    updateModeDisplay() {
        const checkinBtn = document.getElementById('checkinModeBtn');
        const checkoutBtn = document.getElementById('checkoutModeBtn');
        const modeText = document.getElementById('currentModeText');
        
        if (this.currentMode === 'checkin') {
            checkinBtn.classList.add('border-blue-500', 'text-blue-600');
            checkinBtn.classList.remove('border-transparent', 'text-gray-500');
            checkoutBtn.classList.remove('border-blue-500', 'text-blue-600');
            checkoutBtn.classList.add('border-transparent', 'text-gray-500');
            modeText.textContent = 'Current Mode: Check-in';
        } else {
            checkoutBtn.classList.add('border-blue-500', 'text-blue-600');
            checkoutBtn.classList.remove('border-transparent', 'text-gray-500');
            checkinBtn.classList.remove('border-blue-500', 'text-blue-600');
            checkinBtn.classList.add('border-transparent', 'text-gray-500');
            modeText.textContent = 'Current Mode: Check-out';
        }
    }

    async startScanner() {
        try {
            this.updateScannerStatus('Requesting camera permission...');
            
            const constraints = {
                video: {
                    facingMode: this.facingMode,
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            };
            
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.currentStream = stream;
            this.videoElement.srcObject = stream;
            
            this.updateScannerStatus(`Camera active. Scanning for QR codes (${this.currentMode === 'checkin' ? 'Check-in' : 'Check-out'})...`);
            this.scanning = true;
            this.scanFrame();
        } catch (error) {
            console.error('Error accessing camera:', error);
            this.updateScannerStatus('Camera access denied. Please check permissions.');
            this.showScanResult('error', 'Camera Error', 'Unable to access camera: ' + error.message);
        }
    }

    stopScanner() {
        this.scanning = false;
        if (this.currentStream) {
            this.currentStream.getTracks().forEach(track => track.stop());
            this.currentStream = null;
        }
        this.updateScannerStatus('Scanner stopped.');
        this.hideScanResult();
    }

    switchCamera() {
        this.facingMode = this.facingMode === 'environment' ? 'user' : 'environment';
        this.stopScanner();
        setTimeout(() => this.startScanner(), 500);
    }

    scanFrame() {
        if (!this.scanning) return;
        
        if (this.videoElement.readyState === this.videoElement.HAVE_ENOUGH_DATA) {
            this.canvasElement.height = this.videoElement.videoHeight;
            this.canvasElement.width = this.videoElement.videoWidth;
            this.canvasContext.drawImage(this.videoElement, 0, 0, this.canvasElement.width, this.canvasElement.height);
            
            const imageData = this.canvasContext.getImageData(0, 0, this.canvasElement.width, this.canvasElement.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            
            if (code) {
                this.processQRCode(code.data);
            }
        }
        
        requestAnimationFrame(() => this.scanFrame());
    }

    async processQRCode(data) {
        try {
            // Check for duplicate scans (within 3 seconds)
            const raw = data.trim();
            let scanKey = raw;
            try {
                const parsed = JSON.parse(raw);
                if (parsed && (parsed.studentId || parsed.id)) {
                    scanKey = parsed.studentId || parsed.id;
                }
            } catch (_) {}
            const match = raw.match(/EDU-\d{4}-\d{4}-\d{4}/) || raw.match(/EDU-\d{2}-\d{4}-\d{4}/);
            if (match) {
                scanKey = match[0];
            }
            if (this.recentScans.some(scan => scan.data === scanKey && 
                (Date.now() - scan.timestamp) < 3000)) {
                this.updateScannerStatus('Duplicate scan detected. Ignoring.');
                return;
            }
            
            this.recentScans.push({
                data: scanKey,
                timestamp: Date.now()
            });
            
            // Keep only recent scans (last 10 seconds)
            this.recentScans = this.recentScans.filter(
                scan => (Date.now() - scan.timestamp) < 10000
            );
            
            this.updateScannerStatus('Processing QR code...');
            
            let studentId = scanKey;
            let studentDoc = await firebase.firestore().collection('students').doc(studentId).get();
            
            if (!studentDoc.exists) {
                const q = await firebase.firestore().collection('students')
                    .where('studentId', '==', studentId)
                    .limit(1)
                    .get();
                if (q.empty) {
                    this.showScanResult('error', 'Invalid QR Code', 'Student not found in database.');
                    return;
                }
                studentDoc = q.docs[0];
                studentId = studentDoc.id;
            }
            
            const student = studentDoc.data();
            
            // Check if student is already in clinic for check-in
            if (this.currentMode === 'checkin') {
                if (student.currentStatus === 'in_clinic') {
                    this.showScanResult('warning', 'Already in Clinic', `${student.name} is already checked into the clinic.`);
                    return;
                }
            } else {
                // Check-out mode
                if (student.currentStatus !== 'in_clinic') {
                    this.showScanResult('warning', 'Not in Clinic', `${student.name} is not currently in the clinic.`);
                    return;
                }
            }

            // Store pending student for medical assessment
            this.pendingStudent = { id: studentId, ...student };
            this.pendingReason = this.getDefaultReason();

            // Show medical assessment modal for check-ins
            if (this.currentMode === 'checkin') {
                this.showMedicalAssessmentModal();
            } else {
                // For check-outs, process directly
                await this.processClinicVisit(studentId, student);
            }
            
        } catch (error) {
            console.error('Error processing QR code:', error);
            this.showScanResult('error', 'Scan Error', 'Failed to process QR code: ' + error.message);
        }
    }

    showMedicalAssessmentModal() {
        if (!this.pendingStudent) return;
        
        // Populate student info
        document.getElementById('modalStudentInfo').innerHTML = `
            <div class="flex items-center">
                <div class="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                    <span class="text-blue-600 font-semibold">${this.pendingStudent.name.split(' ').map(n => n[0]).join('').substring(0, 2)}</span>
                </div>
                <div>
                    <h4 class="font-semibold">${this.pendingStudent.name}</h4>
                    <p class="text-sm text-gray-600">${this.pendingStudent.grade} • ${this.pendingStudent.classId || 'No class'}</p>
                </div>
            </div>
        `;
        
        // Clear previous form data
        document.getElementById('modalMedicalFindings').value = '';
        document.getElementById('modalTreatmentGiven').value = '';
        document.getElementById('modalRecommendations').value = '';
        document.getElementById('modalAdditionalNotes').value = '';
        
        // Show modal
        document.getElementById('medicalAssessmentModal').classList.remove('hidden');
        
        this.updateScannerStatus('Please complete medical assessment for ' + this.pendingStudent.name);
    }

    closeMedicalAssessment() {
        document.getElementById('medicalAssessmentModal').classList.add('hidden');
        this.pendingStudent = null;
        this.pendingReason = '';
        this.updateScannerStatus('Medical assessment cancelled.');
    }

    async submitMedicalAssessment() {
        if (!this.pendingStudent) return;

        try {
            const medicalFindings = document.getElementById('modalMedicalFindings').value;
            const treatmentGiven = document.getElementById('modalTreatmentGiven').value;
            const recommendations = document.getElementById('modalRecommendations').value;
            const additionalNotes = document.getElementById('modalAdditionalNotes').value;

            // Validate required fields
            if (!medicalFindings.trim()) {
                this.showNotification('Please enter medical findings', 'error');
                return;
            }

            // Process clinic visit with medical assessment
            await this.processClinicVisitWithAssessment(
                this.pendingStudent.id, 
                this.pendingStudent,
                medicalFindings,
                treatmentGiven,
                recommendations,
                additionalNotes
            );

            // Close modal
            this.closeMedicalAssessment();
            
        } catch (error) {
            console.error('Error submitting medical assessment:', error);
            this.showNotification('Failed to submit medical assessment', 'error');
        }
    }

    async processClinicVisitWithAssessment(studentId, student, medicalFindings, treatmentGiven, recommendations, additionalNotes) {
        try {
            const checkIn = this.currentMode === 'checkin';
            const notes = this.buildAssessmentNotes(medicalFindings, treatmentGiven, recommendations, additionalNotes);

            await this.recordClinicVisit(studentId, this.pendingReason, notes, checkIn, {
                medicalFindings,
                treatmentGiven,
                recommendations,
                additionalNotes
            });
            
            // Reload data
            await this.loadCurrentPatients();
            await this.loadRecentVisits();
            await this.loadStatistics();
            
            // Show success result
            const action = checkIn ? 'checked into' : 'checked out from';
            this.showScanResult('success', 
                `${checkIn ? 'Check-in' : 'Check-out'} Successful`, 
                `${student.name} ${action} clinic with medical assessment`
            );
            
            this.playBeepSound();
            
        } catch (error) {
            console.error('Error processing clinic visit with assessment:', error);
            this.showScanResult('error', 'Processing Error', 'Failed to process clinic visit: ' + error.message);
        }
    }

    buildAssessmentNotes(medicalFindings, treatmentGiven, recommendations, additionalNotes) {
        let notes = 'QR Code Check-in with Medical Assessment\n\n';
        
        if (medicalFindings) notes += `Findings: ${medicalFindings}\n`;
        if (treatmentGiven) notes += `Treatment: ${treatmentGiven}\n`;
        if (recommendations) notes += `Recommendation: ${this.getRecommendationText(recommendations)}\n`;
        if (additionalNotes) notes += `Notes: ${additionalNotes}`;
        
        return notes;
    }

    getRecommendationText(recommendation) {
        const recommendations = {
            'return_to_class': 'Return to class with monitoring',
            'rest_in_clinic': 'Rest in clinic for observation',
            'fetch_child': 'Recommended to fetch your child',
            'immediate_pickup': 'Immediate pickup required',
            'medical_attention': 'Refer to doctor/hospital',
            'follow_up': 'Follow-up tomorrow'
        };
        
        return recommendations[recommendation] || recommendation;
    }

    async processClinicVisit(studentId, student) {
        try {
            const reason = this.getDefaultReason();
            const notes = `QR Code ${this.currentMode === 'checkin' ? 'Check-in' : 'Check-out'}`;
            const checkIn = this.currentMode === 'checkin';

            await this.recordClinicVisit(studentId, reason, notes, checkIn);
            
            // Reload data
            await this.loadCurrentPatients();
            await this.loadRecentVisits();
            await this.loadStatistics();
            
            // Show success result
            const action = checkIn ? 'checked into' : 'checked out from';
            this.showScanResult('success', 
                `${checkIn ? 'Check-in' : 'Check-out'} Successful`, 
                `${student.name} ${action} clinic`
            );
            
            this.playBeepSound();
            
        } catch (error) {
            console.error('Error processing clinic visit:', error);
            this.showScanResult('error', 'Processing Error', 'Failed to process clinic visit: ' + error.message);
        }
    }

    getDefaultReason() {
        return this.currentMode === 'checkin' ? 'QR Code Check-in' : 'QR Code Check-out';
    }

    showScanResult(type, title, message) {
        const resultDiv = document.getElementById('lastScanResult');
        const icon = document.getElementById('scanResultIcon');
        const titleEl = document.getElementById('scanResultTitle');
        const messageEl = document.getElementById('scanResultMessage');
        
        let bgColor, textColor, iconSymbol;
        
        switch(type) {
            case 'success':
                bgColor = 'bg-green-100 border border-green-200';
                textColor = 'text-green-800';
                iconSymbol = '✅';
                break;
            case 'error':
                bgColor = 'bg-red-100 border border-red-200';
                textColor = 'text-red-800';
                iconSymbol = '❌';
                break;
            case 'warning':
                bgColor = 'bg-yellow-100 border border-yellow-200';
                textColor = 'text-yellow-800';
                iconSymbol = '⚠️';
                break;
            default:
                bgColor = 'bg-blue-100 border border-blue-200';
                textColor = 'text-blue-800';
                iconSymbol = 'ℹ️';
        }
        
        resultDiv.className = `${bgColor} ${textColor} rounded-lg p-3`;
        icon.textContent = iconSymbol;
        titleEl.textContent = title;
        messageEl.textContent = message;
        resultDiv.classList.remove('hidden');
        
        // Add success animation for successful scans
        if (type === 'success') {
            const scannerFrame = document.querySelector('.scanner-frame');
            scannerFrame.classList.add('scanner-success');
            setTimeout(() => {
                scannerFrame.classList.remove('scanner-success');
            }, 2000);
        }
        
        // Auto-hide after 5 seconds for non-error messages
        if (type !== 'error') {
            setTimeout(() => {
                this.hideScanResult();
            }, 5000);
        }
    }

    hideScanResult() {
        document.getElementById('lastScanResult').classList.add('hidden');
    }

    updateScannerStatus(message) {
        document.getElementById('scannerStatus').textContent = message;
    }

    playBeepSound() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 800;
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.2);
        } catch (error) {
            console.warn('Audio context not supported:', error);
        }
    }

    // Enhanced manual check-in with medical assessment
    async submitClinicCheckin(checkIn) {
        if (!this.selectedStudent) {
            this.showNotification('Please select a student', 'error');
            return;
        }

        const reason = document.getElementById('checkinReason').value;
        const medicalFindings = document.getElementById('medicalFindings').value;
        const treatmentGiven = document.getElementById('treatmentGiven').value;
        const recommendations = document.getElementById('recommendations').value;
        const additionalNotes = document.getElementById('additionalNotes').value;

        if (!reason) {
            this.showNotification('Please select a reason for visit', 'error');
            return;
        }

        if (checkIn && !medicalFindings.trim()) {
            this.showNotification('Please enter medical findings for check-in', 'error');
            return;
        }

        try {
            if (checkIn) {
                if (window.USE_SUPABASE && window.supabaseClient) {
                    const { data: s, error } = await window.supabaseClient
                        .from('students')
                        .select('id,currentStatus')
                        .eq('id', this.selectedStudent.id)
                        .single();
                    if (!error && s && s.currentStatus === 'in_clinic') {
                        this.showNotification('Student is already in clinic', 'warning');
                        return;
                    }
                } else {
                    const studentDoc = await firebase.firestore().collection('students').doc(this.selectedStudent.id).get();
                    if (studentDoc.exists && studentDoc.data().currentStatus === 'in_clinic') {
                        this.showNotification('Student is already in clinic', 'warning');
                        return;
                    }
                }
            }

            // Build notes with medical assessment for check-ins
            let notes = '';
            if (checkIn) {
                notes = this.buildAssessmentNotes(medicalFindings, treatmentGiven, recommendations, additionalNotes);
            } else {
                notes = 'Manual Check-out';
                if (additionalNotes) notes += `\nNotes: ${additionalNotes}`;
            }

            await this.recordClinicVisit(this.selectedStudent.id, reason, notes, checkIn, {
                medicalFindings: checkIn ? medicalFindings : '',
                treatmentGiven: checkIn ? treatmentGiven : '',
                recommendations: checkIn ? recommendations : '',
                additionalNotes
            });
            
            // Clear form
            this.clearForm();
            
            // Reload data
            await this.loadCurrentPatients();
            await this.loadRecentVisits();
            await this.loadStatistics();
            
            this.showNotification(
                `${this.selectedStudent.name} ${checkIn ? 'checked into' : 'checked out from'} clinic`, 
                'success'
            );
            
        } catch (error) {
            console.error('Error recording clinic visit:', error);
            this.showNotification('Failed to record clinic visit', 'error');
        }
    }

    async recordClinicVisit(studentId, reason, notes, checkIn, medicalData = {}) {
        try {
            if (window.USE_SUPABASE && window.supabaseClient) {
                const { data: student, error: sErr } = await window.supabaseClient
                    .from('students')
                    .select('id,firstName,lastName,classId,parentId')
                    .eq('id', studentId)
                    .single();
                if (sErr || !student) throw new Error('Student not found');
                const timestamp = new Date();
                const timeStr = timestamp.toTimeString().split(' ')[0].substring(0, 5);
                const insertData = {
                    studentId: studentId,
                    studentName: [student.firstName, student.lastName].filter(Boolean).join(' '),
                    classId: student.classId || '',
                    reason: reason,
                    checkIn: !!checkIn,
                    timestamp: timestamp,
                    notes: notes || '',
                    treatedBy: this.currentUser.name || this.currentUser.id,
                    outcome: medicalData.recommendations || medicalData.treatmentGiven || ''
                };
                const { data: inserted, error } = await window.supabaseClient
                    .from('clinicVisits')
                    .insert(insertData)
                    .select('id')
                    .single();
                if (error) throw error;
                const newStatus = checkIn ? 'in_clinic' : 'in_school';
                await window.supabaseClient.from('students').update({ currentStatus: newStatus }).eq('id', studentId);
                await this.sendEnhancedClinicNotifications(
                    { id: studentId, parentId: student.parentId, classId: student.classId, name: insertData.studentName },
                    checkIn,
                    reason,
                    notes,
                    medicalData,
                    timeStr
                );
                return inserted.id;
            } else {
                const studentDoc = await firebase.firestore().collection('students').doc(studentId).get();
                if (!studentDoc.exists) {
                    throw new Error('Student not found');
                }
                const student = studentDoc.data();
                const timestamp = new Date();
                const clinicData = {
                    studentId: studentId,
                    studentName: student.name,
                    classId: student.classId || '',
                    checkIn: checkIn,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    time: timestamp.toTimeString().split(' ')[0].substring(0, 5),
                    reason: reason,
                    notes: notes,
                    staffId: this.currentUser.id,
                    staffName: this.currentUser.name,
                    medicalFindings: medicalData.medicalFindings || '',
                    treatmentGiven: medicalData.treatmentGiven || '',
                    recommendations: medicalData.recommendations || '',
                    additionalNotes: medicalData.additionalNotes || '',
                    teacherValidationStatus: checkIn ? 'pending' : 'n_a',
                    requiresTeacherValidation: !!checkIn
                };
                const clinicRef = await firebase.firestore().collection('clinicVisits').add(clinicData);
                await firebase.firestore().collection('students').doc(studentId).update({
                    currentStatus: checkIn ? 'in_clinic' : 'in_school',
                    lastClinicVisit: new Date().toISOString()
                });
                await this.sendEnhancedClinicNotifications(student, checkIn, reason, notes, medicalData, clinicData.time);
                return clinicRef.id;
            }
        } catch (error) {
            console.error('Error recording clinic visit:', error);
            throw error;
        }
    }

    async sendEnhancedClinicNotifications(student, checkIn, reason, notes, medicalData = {}, timeStr = '') {
        try {
            const parentId = student.parentId;
            let teacherId = null;
            if (window.USE_SUPABASE && window.supabaseClient) {
                if (student.classId) {
                    const { data: homeroom, error: hrErr } = await window.supabaseClient
                        .from('users')
                        .select('id')
                        .eq('role', 'teacher')
                        .eq('classId', student.classId)
                        .eq('isHomeroom', true)
                        .limit(1);
                    if (!hrErr && Array.isArray(homeroom) && homeroom.length > 0) {
                        teacherId = homeroom[0].id;
                    }
                }
            } else {
                if (student.classId) {
                    const teacherQuery = await firebase.firestore()
                        .collection('users')
                        .where('role', '==', 'teacher')
                        .where('classId', '==', student.classId)
                        .where('isHomeroom', '==', true)
                        .limit(1)
                        .get();
                    if (!teacherQuery.empty) {
                        teacherId = teacherQuery.docs[0].id;
                    }
                }
            }

            const targetUsers = [parentId];
            if (teacherId) targetUsers.push(teacherId);

            const action = checkIn ? 'checked into' : 'checked out from';
            const notificationTitle = checkIn ? 'Clinic Check-in' : 'Clinic Check-out';
            
            let message = `${student.name} has ${action} the clinic.`;
            if (timeStr) {
                message += `\nTime ${checkIn ? 'In' : 'Out'}: ${timeStr}`;
            }
            
            // Add medical assessment details for check-ins
            if (checkIn) {
                message += `\nReason: ${reason}`;
                
                
                if (medicalData.medicalFindings) {
                    message += `\nFindings: ${medicalData.medicalFindings}`;
                }
                
                if (medicalData.treatmentGiven) {
                    message += `\nTreatment: ${medicalData.treatmentGiven}`;
                }
                
                if (medicalData.recommendations) {
                    const recText = this.getRecommendationText(medicalData.recommendations);
                    message += `\nRecommendation: ${recText}`;
                }
                
                if (medicalData.additionalNotes) {
                    message += `\nAdditional Notes: ${medicalData.additionalNotes}`;
                }
                
                // Add urgency for certain recommendations
                if (medicalData.recommendations === 'fetch_child' || 
                    medicalData.recommendations === 'immediate_pickup' ||
                    medicalData.recommendations === 'medical_attention') {
                    message += '\n\n🚨 PLEASE REVIEW URGENTLY';
                }
            } else {
                // For check-outs
                if (reason) message += ` Reason: ${reason}`;
                if (notes) message += ` Notes: ${notes}`;
            }

            const notificationData = {
                type: 'clinic',
                title: notificationTitle,
                message: message,
                targetUsers: targetUsers
            };
            if (window.EducareTrack && typeof window.EducareTrack.createNotification === 'function') {
                await window.EducareTrack.createNotification(notificationData);
            } else {
                await firebase.firestore().collection('notifications').add({
                    ...notificationData,
                    createdAt: new Date().toISOString()
                });
            }
            
            console.log(`Enhanced notifications sent for ${student.name}'s clinic ${checkIn ? 'check-in' : 'check-out'}`);
            
        } catch (error) {
            console.error('Error sending clinic notifications:', error);
        }
    }

    clearForm() {
        this.selectedStudent = null;
        document.getElementById('studentSearch').value = '';
        document.getElementById('studentSearch').removeAttribute('data-student-id');
        document.getElementById('checkinReason').value = '';
        document.getElementById('medicalFindings').value = '';
        document.getElementById('treatmentGiven').value = '';
        document.getElementById('recommendations').value = '';
        document.getElementById('additionalNotes').value = '';
        document.getElementById('studentResults').classList.add('hidden');
    }

    async searchStudents(query) {
        const resultsContainer = document.getElementById('studentResults');
        
        if (query.length < 2) {
            resultsContainer.classList.add('hidden');
            return;
        }

        try {
            let students = [];
            if (window.USE_SUPABASE && window.supabaseClient) {
                const term = `%${query}%`;
                const { data, error } = await window.supabaseClient
                    .from('students')
                    .select('id,firstName,lastName,currentStatus,studentId')
                    .or(`firstName.ilike.${term},lastName.ilike.${term},studentId.ilike.${term}`);
                if (error) throw error;
                students = (data || []).map(s => ({
                    id: s.id,
                    name: `${s.firstName || ''} ${s.lastName || ''}`.trim(),
                    currentStatus: s.currentStatus,
                    studentId: s.studentId
                })).slice(0, 5);
            } else {
                const snapshot = await firebase.firestore()
                    .collection('students')
                    .where('isActive', '==', true)
                    .get();
                students = snapshot.docs
                    .map(doc => ({ id: doc.id, ...doc.data() }))
                    .filter(student => 
                        student.name.toLowerCase().includes(query.toLowerCase()) || 
                        (student.studentId && student.studentId.toLowerCase().includes(query.toLowerCase()))
                    )
                    .slice(0, 5);
            }

            if (students.length === 0) {
                resultsContainer.innerHTML = '<div class="p-3 text-gray-500 text-sm">No students found</div>';
                resultsContainer.classList.remove('hidden');
                return;
            }

            resultsContainer.innerHTML = students.map(student => {
                const status = student.currentStatus === 'in_clinic' ? 
                    '<span class="text-red-600 text-xs">(In Clinic)</span>' : '';
                
                return `
                    <div class="p-3 hover:bg-gray-100 cursor-pointer border-b border-gray-100 last:border-b-0 transition duration-200" 
                         onclick="clinicCheckin.selectStudent('${student.id}', '${student.name.replace(/'/g, "\\'")}')">
                        <div class="font-medium flex justify-between">
                            <span>${student.name}</span>
                            ${status}
                        </div>
                        <div class="text-xs text-gray-600">ID: ${student.studentId} • Grade: ${student.grade}</div>
                    </div>
                `;
            }).join('');

            resultsContainer.classList.remove('hidden');
        } catch (error) {
            console.error('Error searching students:', error);
        }
    }

    selectStudent(studentId, studentName) {
        this.selectedStudent = { id: studentId, name: studentName };
        document.getElementById('studentSearch').value = `${studentName}`;
        document.getElementById('studentSearch').setAttribute('data-student-id', studentId);
        document.getElementById('studentResults').classList.add('hidden');
        
        // Auto-focus on reason field
        document.getElementById('checkinReason').focus();
    }

    async quickCheckIn(reason) {
        if (!this.selectedStudent) {
            this.showNotification('Please select a student first', 'info');
            return;
        }

        // Set the reason and submit check-in
        document.getElementById('checkinReason').value = reason;
        await this.submitClinicCheckin(true);
    }

    async quickCheckout(studentId) {
        const ok = window.EducareTrack && typeof window.EducareTrack.confirmAction === 'function'
            ? await window.EducareTrack.confirmAction('Are you sure you want to check out this student?', 'Confirm Checkout', 'Checkout', 'Cancel')
            : true;
        if (!ok) return;
        try {
            await this.recordClinicVisit(studentId, 'Quick Checkout', 'Checked out from current patients list', false);
            await this.loadCurrentPatients();
            await this.loadRecentVisits();
            await this.loadStatistics();
            this.showNotification('Student checked out successfully', 'success');
        } catch (error) {
            console.error('Error during quick checkout:', error);
            this.showNotification('Failed to check out student', 'error');
        }
    }

    async loadCurrentPatients() {
        try {
            if (window.USE_SUPABASE && window.supabaseClient) {
                const { data, error } = await window.supabaseClient
                    .from('students')
                    .select('id,firstName,lastName,classId,currentStatus')
                    .eq('currentStatus', 'in_clinic');
                if (error) throw error;
                this.currentPatients = (data || []).map(s => ({
                    id: s.id,
                    name: [s.firstName, s.lastName].filter(Boolean).join(' ').trim(),
                    classId: s.classId || '',
                    grade: ''
                }));
            } else {
                const snapshot = await firebase.firestore()
                    .collection('students')
                    .where('currentStatus', '==', 'in_clinic')
                    .get();
                this.currentPatients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            }
            this.updateCurrentPatientsDisplay();
        } catch (error) {
            console.error('Error loading current patients:', error);
        }
    }

    async loadRecentVisits() {
        try {
            if (window.USE_SUPABASE && window.supabaseClient) {
                const { data, error } = await window.supabaseClient
                    .from('clinicVisits')
                    .select('id,studentId,studentName,classId,reason,checkIn,timestamp,notes,treatedBy,outcome')
                    .order('timestamp', { ascending: false })
                    .limit(10);
                if (error) throw error;
                this.recentVisits = (data || []).map(v => ({
                    id: v.id,
                    studentId: v.studentId,
                    studentName: v.studentName,
                    classId: v.classId,
                    checkIn: !!v.checkIn,
                    timestamp: v.timestamp ? new Date(v.timestamp) : new Date(),
                    reason: v.reason || '',
                    notes: v.notes || '',
                    staffName: v.treatedBy || '',
                    medicalFindings: '',
                    recommendations: v.outcome || ''
                }));
            } else {
                const snapshot = await firebase.firestore()
                    .collection('clinicVisits')
                    .orderBy('timestamp', 'desc')
                    .limit(10)
                    .get();
                this.recentVisits = snapshot.docs.map(doc => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        ...data,
                        timestamp: data.timestamp?.toDate() || new Date()
                    };
                });
            }
            this.updateRecentVisitsDisplay();
        } catch (error) {
            console.error('Error loading recent visits:', error);
        }
    }

    async loadStatistics() {
        try {
            const currentPatientsCount = this.currentPatients.length;
            document.getElementById('currentPatientsCount').textContent = currentPatientsCount;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            if (window.USE_SUPABASE && window.supabaseClient) {
                const { count: visitsCount } = await window.supabaseClient
                    .from('clinicVisits')
                    .select('id', { count: 'exact', head: true })
                    .gte('timestamp', today.toISOString())
                    .lt('timestamp', tomorrow.toISOString());
                this.todayVisits = visitsCount || 0;
                document.getElementById('todayVisits').textContent = this.todayVisits;
                const { count: urgentCount } = await window.supabaseClient
                    .from('clinicVisits')
                    .select('id', { count: 'exact', head: true })
                    .gte('timestamp', today.toISOString())
                    .eq('checkIn', true)
                    .in('outcome', ['fetch_child', 'immediate_pickup', 'medical_attention']);
                this.urgentCases = urgentCount || 0;
                document.getElementById('urgentCases').textContent = this.urgentCases;
            } else {
                const todaySnapshot = await firebase.firestore()
                    .collection('clinicVisits')
                    .where('timestamp', '>=', today)
                    .where('timestamp', '<', tomorrow)
                    .get();
                this.todayVisits = todaySnapshot.size;
                document.getElementById('todayVisits').textContent = this.todayVisits;
                const urgentSnapshot = await firebase.firestore()
                    .collection('clinicVisits')
                    .where('timestamp', '>=', today)
                    .where('checkIn', '==', true)
                    .where('recommendations', 'in', ['fetch_child', 'immediate_pickup', 'medical_attention'])
                    .get();
                this.urgentCases = urgentSnapshot.size;
                document.getElementById('urgentCases').textContent = this.urgentCases;
            }
        } catch (error) {
            console.error('Error loading statistics:', error);
        }
    }

    updateCurrentPatientsDisplay() {
        const container = document.getElementById('currentPatients');
        
        if (this.currentPatients.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <i class="fas fa-user-injured text-4xl mb-4 text-gray-400"></i>
                    <p>No current patients in clinic</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.currentPatients.map(patient => `
            <div class="flex items-center justify-between p-4 bg-red-50 border border-red-200 rounded-lg">
                <div class="flex items-center space-x-3">
                    <div class="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                        <span class="text-red-600 font-semibold">${patient.name.charAt(0)}</span>
                    </div>
                    <div>
                        <h4 class="text-sm font-medium text-gray-900">${patient.name}</h4>
                        <p class="text-xs text-gray-600">${patient.grade} • ${patient.classId || 'No class'}</p>
                    </div>
                </div>
                <button onclick="clinicCheckin.quickCheckout('${patient.id}')" 
                        class="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition duration-200 flex items-center">
                    <i class="fas fa-sign-out-alt mr-1"></i>
                    Check-out
                </button>
            </div>
        `).join('');
    }

    updateRecentVisitsDisplay() {
        const container = document.getElementById('recentVisits');
        
        if (this.recentVisits.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <i class="fas fa-clipboard-list text-4xl mb-4 text-gray-400"></i>
                    <p>No recent clinic visits</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.recentVisits.map(visit => {
            const time = new Date(visit.timestamp).toLocaleTimeString('en-PH', {
                hour: '2-digit',
                minute: '2-digit'
            });
            const type = visit.checkIn ? 'Check-in' : 'Check-out';
            const typeColor = visit.checkIn ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800';
            const icon = visit.checkIn ? '🟢' : '🔴';
            
            // Check if urgent
            const isUrgent = visit.recommendations && 
                (visit.recommendations === 'fetch_child' || 
                 visit.recommendations === 'immediate_pickup' || 
                 visit.recommendations === 'medical_attention');
            
            const urgentBadge = isUrgent ? 
                '<span class="ml-2 px-2 py-1 bg-red-100 text-red-800 text-xs font-semibold rounded-full">URGENT</span>' : '';
            
            // Show medical findings if available
            const medicalInfo = visit.medicalFindings ? 
                `<p class="text-xs text-gray-500 mt-1">${visit.medicalFindings.substring(0, 50)}${visit.medicalFindings.length > 50 ? '...' : ''}</p>` : '';
            
            return `
                <div class="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg ${isUrgent ? 'urgent-case' : ''}">
                    <div class="flex items-center space-x-3">
                        <span class="text-lg">${icon}</span>
                        <div>
                            <div class="flex items-center">
                                <h4 class="text-sm font-medium text-gray-900">${visit.studentName}</h4>
                                ${urgentBadge}
                            </div>
                            <p class="text-xs text-gray-600">${time} • ${this.capitalizeFirstLetter(visit.reason)}</p>
                            ${medicalInfo}
                        </div>
                    </div>
                    <div class="flex items-center space-x-2">
                        <span class="px-2 py-1 text-xs font-semibold rounded-full ${typeColor}">
                            ${type}
                        </span>
                        <span class="text-xs text-gray-500">${visit.staffName}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Utility Methods
    capitalizeFirstLetter(string) {
        return string ? string.charAt(0).toUpperCase() + string.slice(1) : 'N/A';
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    showNotification(message, type = 'info') {
        if (window.EducareTrack && typeof window.EducareTrack.showNormalNotification === 'function') {
            window.EducareTrack.showNormalNotification({ title: type === 'error' ? 'Error' : 'Info', message, type });
        }
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    showLoading() {
        document.getElementById('loadingSpinner').classList.remove('hidden');
    }

    hideLoading() {
        document.getElementById('loadingSpinner').classList.add('hidden');
    }

    destroy() {
        this.stopScanner();
        if (this.clinicVisitsListener) {
            this.clinicVisitsListener();
        }
        if (this.studentsListener) {
            this.studentsListener();
        }
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    window.clinicCheckin = new ClinicCheckin();
});
