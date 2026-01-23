// QR Scanner JavaScript with Working Time In/Time Out
class QRScanner {
    constructor() {
        this.videoElement = document.getElementById('video');
        this.canvasElement = document.createElement('canvas');
        this.canvasContext = this.canvasElement.getContext('2d');
        this.scanning = false;
        this.currentStream = null;
        this.facingMode = 'environment';
        this.recentScans = [];
        this.currentUser = null;
        this.currentStudent = null;
        this.currentMode = 'timeIn'; // 'timeIn' or 'timeOut'
        this.physicalModeActive = false;
        this.physicalBuffer = '';
        this.physicalTimer = null;
        this.scannerDebounceMs = 100;
        
        // Initialize Attendance Logic
        this.attendanceLogic = new AttendanceLogic();
        
        this.initEventListeners();
        this.loadRecentScans().catch(error => console.error('Error loading recent scans:', error));
        this.checkAuth();
        this.loadAbsentStudents();
        this.updateModeDisplay();
    }

    async checkAuth() {
        const savedUser = localStorage.getItem('educareTrack_user');
        if (!savedUser) {
            window.location.href = '../index.html';
            return;
        }

        this.currentUser = JSON.parse(savedUser);
        if (this.currentUser.role !== 'guard') {
            window.location.href = '../index.html';
            return;
        }

        document.getElementById('userName').textContent = this.currentUser.name;
    }

    initEventListeners() {
        // Scanner mode switching
        document.getElementById('webcamModeBtn').addEventListener('click', () => this.switchMode('webcam'));
        document.getElementById('physicalModeBtn').addEventListener('click', () => this.switchMode('physical'));
        
        // Time In/Time Out mode switching
        document.getElementById('timeInModeBtn').addEventListener('click', () => this.switchAttendanceMode('timeIn'));
        document.getElementById('timeOutModeBtn').addEventListener('click', () => this.switchAttendanceMode('timeOut'));
        
        // Webcam scanner controls
        document.getElementById('startScanner').addEventListener('click', () => this.startWebcamScanner());
        document.getElementById('stopScanner').addEventListener('click', () => this.stopWebcamScanner());
        document.getElementById('switchCamera').addEventListener('click', () => this.switchCamera());

        // Physical scanner input (keyboard‑wedge friendly)
        const physInput = document.getElementById('physicalScannerInput');
        physInput.addEventListener('input', (e) => this.handlePhysicalInput(e.target.value));
        physInput.addEventListener('keydown', (e) => this.handlePhysicalKeydown(e));
        physInput.addEventListener('paste', (e) => {
            const text = (e.clipboardData || window.clipboardData).getData('text');
            e.preventDefault();
            this.processPhysicalData(text);
        });
        physInput.addEventListener('focus', () => { physInput.value = ''; });
        // Also capture global keydown so scanner works even without focus
        document.addEventListener('keydown', (e) => {
            if (!this.physicalModeActive) return;
            this.handlePhysicalKeydown(e);
        });

        // Camera settings controls
        document.getElementById('brightnessControl').addEventListener('input', (e) => this.updateVideoFilter());
        document.getElementById('contrastControl').addEventListener('input', (e) => this.updateVideoFilter());
        document.getElementById('saturationControl').addEventListener('input', (e) => this.updateVideoFilter());

        // Update value displays
        document.getElementById('brightnessControl').addEventListener('input', (e) => {
            document.getElementById('brightnessValue').textContent = Math.round(e.target.value * 100) + '%';
        });
        document.getElementById('contrastControl').addEventListener('input', (e) => {
            document.getElementById('contrastValue').textContent = Math.round(e.target.value * 100) + '%';
        });
        document.getElementById('saturationControl').addEventListener('input', (e) => {
            document.getElementById('saturationValue').textContent = Math.round(e.target.value * 100) + '%';
        });
    }

    // Switch between Time In and Time Out modes
    switchAttendanceMode(mode) {
        this.currentMode = mode;
        this.updateModeDisplay();
        
        // Show mode change notification
        const modeText = mode === 'timeIn' ? 'Time In (Arrivals)' : 'Time Out (Dismissals)';
        this.showResult('info', `Mode Changed`, `Now recording ${modeText}`);
        
        // Update scanner status
        this.updateScannerStatus(`Ready for scanning (${mode === 'timeIn' ? 'Time In' : 'Time Out'})...`);
    }

    // Update the UI to reflect current mode
    updateModeDisplay() {
        const timeInBtn = document.getElementById('timeInModeBtn');
        const timeOutBtn = document.getElementById('timeOutModeBtn');
        const modeText = document.getElementById('currentModeText');
        
        if (this.currentMode === 'timeIn') {
            // Activate Time In button
            timeInBtn.classList.add('time-in-active', 'mode-active');
            timeInBtn.classList.remove('border-gray-300', 'bg-gray-50');
            timeInBtn.querySelector('p:last-child').textContent = 'ACTIVE';
            timeInBtn.querySelector('p:last-child').classList.remove('text-gray-600');
            timeInBtn.querySelector('p:last-child').classList.add('text-green-600');
            
            // Deactivate Time Out button
            timeOutBtn.classList.remove('time-out-active', 'mode-active');
            timeOutBtn.classList.add('border-gray-300', 'bg-gray-50');
            timeOutBtn.querySelector('p:last-child').textContent = 'INACTIVE';
            timeOutBtn.querySelector('p:last-child').classList.remove('text-red-600');
            timeOutBtn.querySelector('p:last-child').classList.add('text-gray-600');
            
            modeText.textContent = 'Current Mode: Recording Time In (Arrivals)';
        } else {
            // Activate Time Out button
            timeOutBtn.classList.add('time-out-active', 'mode-active');
            timeOutBtn.classList.remove('border-gray-300', 'bg-gray-50');
            timeOutBtn.querySelector('p:last-child').textContent = 'ACTIVE';
            timeOutBtn.querySelector('p:last-child').classList.remove('text-gray-600');
            timeOutBtn.querySelector('p:last-child').classList.add('text-red-600');
            
            // Deactivate Time In button
            timeInBtn.classList.remove('time-in-active', 'mode-active');
            timeInBtn.classList.add('border-gray-300', 'bg-gray-50');
            timeInBtn.querySelector('p:last-child').textContent = 'INACTIVE';
            timeInBtn.querySelector('p:last-child').classList.remove('text-green-600');
            timeInBtn.querySelector('p:last-child').classList.add('text-gray-600');
            
            modeText.textContent = 'Current Mode: Recording Time Out (Dismissals)';
        }
    }

    switchMode(mode) {
        document.querySelectorAll('.mode-tab').forEach(tab => {
            tab.classList.remove('border-blue-500', 'text-blue-600');
            tab.classList.add('border-transparent', 'text-gray-500');
        });
        
        document.querySelectorAll('.scanner-section').forEach(section => {
            section.classList.add('hidden');
        });
        
        if (mode === 'webcam') {
            document.getElementById('webcamModeBtn').classList.add('border-blue-500', 'text-blue-600');
            document.getElementById('webcamSection').classList.remove('hidden');
            this.stopWebcamScanner();
            this.physicalModeActive = false;
        } else {
            document.getElementById('physicalModeBtn').classList.add('border-blue-500', 'text-blue-600');
            document.getElementById('physicalSection').classList.remove('hidden');
            this.stopWebcamScanner();
            this.physicalModeActive = true;
            const physInput = document.getElementById('physicalScannerInput');
            if (physInput) { physInput.focus(); physInput.value = ''; }
        }
        
        this.cancelAction();
    }

    updateVideoFilter() {
        const brightness = document.getElementById('brightnessControl').value;
        const contrast = document.getElementById('contrastControl').value;
        const saturation = document.getElementById('saturationControl').value;
        
        this.videoElement.style.filter = `brightness(${brightness}) contrast(${contrast}) saturate(${saturation})`;
    }

    async startWebcamScanner() {
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
            
            this.updateVideoFilter();
            
            this.updateScannerStatus(`Camera active. Scanning for QR codes (${this.currentMode === 'timeIn' ? 'Time In' : 'Time Out'})...`);
            this.scanning = true;
            this.scanFrame();
        } catch (error) {
            console.error('Error accessing camera:', error);
            this.updateScannerStatus('Camera access denied. Please check permissions.');
            this.showResult('error', 'Camera Error', 'Unable to access camera: ' + error.message);
        }
    }

    stopWebcamScanner() {
        this.scanning = false;
        if (this.currentStream) {
            this.currentStream.getTracks().forEach(track => track.stop());
            this.currentStream = null;
        }
        this.updateScannerStatus('Scanner stopped.');
    }

    switchCamera() {
        this.facingMode = this.facingMode === 'environment' ? 'user' : 'environment';
        this.stopWebcamScanner();
        setTimeout(() => this.startWebcamScanner(), 500);
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

    handlePhysicalInput(value) {
        if (!this.physicalModeActive) return;
        // Accumulate buffer and debounce finalize to avoid premature processing
        this.physicalBuffer = value;
        if (this.physicalTimer) clearTimeout(this.physicalTimer);
        this.physicalTimer = setTimeout(() => {
            if (this.physicalBuffer && this.physicalBuffer.length > 5) {
                this.processPhysicalData(this.physicalBuffer);
            }
        }, this.scannerDebounceMs);
    }

    handlePhysicalKeydown(e) {
        if (!this.physicalModeActive) return;
        // Many scanners send Enter at the end
        if (e.key === 'Enter') {
            e.preventDefault();
            const value = document.getElementById('physicalScannerInput').value || this.physicalBuffer;
            if (value && value.length > 1) {
                this.processPhysicalData(value);
            }
        }
    }

    processPhysicalData(text) {
        const cleaned = (text || '').trim();
        document.getElementById('physicalScannerInput').value = '';
        this.physicalBuffer = '';
        if (!cleaned) return;
        this.processQRCode(cleaned);
    }

    async processQRCode(data) {
        try {
            this.updateScannerStatus('Processing QR code...');
            console.log('🔍 QR Code raw data:', data);
            
            let qrContent = data.trim();
            if (/^qr_/i.test(qrContent)) {
                qrContent = qrContent.replace(/^qr_/i, '');
            }
            console.log('🔍 Cleaned QR content:', qrContent);

            let studentIdCandidate = qrContent;
            try {
                const parsed = JSON.parse(qrContent);
                if (parsed && (parsed.studentId || parsed.id)) {
                    studentIdCandidate = parsed.studentId || parsed.id;
                }
            } catch (_) {}

            const patternMatch = qrContent.match(/EDU-\d{4}-\d{4}-\d{4}/) || qrContent.match(/EDU-\d{2}-\d{4}-\d{4}/);
            if (patternMatch) {
                studentIdCandidate = patternMatch[0];
            }
            
            // Check for duplicate scans
            const scanKey = studentIdCandidate || qrContent;
            if (this.recentScans.some(scan => scan.data === scanKey && 
                (Date.now() - scan.timestamp) < 3000)) {
                this.updateScannerStatus('Duplicate scan detected. Ignoring.');
                return;
            }
            
            this.recentScans.push({
                data: scanKey,
                timestamp: Date.now()
            });
            
            this.recentScans = this.recentScans.filter(
                scan => (Date.now() - scan.timestamp) < 10000
            );
            
            // Try to find student by multiple methods
            const student = await this.findStudentByAnyMeans(studentIdCandidate);
            
            if (!student) {
                console.error('❌ Student not found with QR content:', studentIdCandidate);
                this.showResult('error', 'Student Not Found', 
                    `No student found with ID: ${studentIdCandidate}. Please check enrollment.`);
                return;
            }
            
            console.log('✅ Student found:', `${student.first_name || ''} ${student.last_name || ''}`.trim(), 'ID:', student.id, 'StudentID:', student.studentId);
            
            this.currentStudent = student;
            
            // Determine entry type based on current mode
            const entryType = this.currentMode === 'timeIn' ? 'entry' : 'exit';
            
            // Record attendance using the actual Firestore document ID
            await this.recordAttendance(student.id, student, entryType);
            
        } catch (error) {
            console.error('❌ Error processing QR code:', error);
            this.showResult('error', 'Scan Error', 'Failed to process QR code: ' + error.message);
        }
    }

    // NEW: Enhanced student search
    async findStudentByAnyMeans(candidate) {
        console.log('🔍 Searching for student with:', candidate);
        const col = window.EducareTrack.db.collection('students');

        // Direct doc lookup (most robust when QR encodes document ID)
        try {
            const byDoc = await col.doc(candidate).get();
            if (byDoc.exists) {
                console.log('✅ Found by document ID');
                return { id: byDoc.id, ...byDoc.data() };
            }
        } catch (_) {}

        // Field: studentId
        try {
            let byStudentId = await col.where('student_id', '==', candidate).limit(1).get();
            if (!byStudentId.empty) {
                console.log('✅ Found by studentId field');
                const doc = byStudentId.docs[0];
                return { id: doc.id, ...doc.data() };
            }
            const altCandidate = candidate.toUpperCase();
            if (altCandidate !== candidate) {
                byStudentId = await col.where('student_id', '==', altCandidate).limit(1).get();
                if (!byStudentId.empty) {
                    console.log('✅ Found by studentId (uppercase)');
                    const doc = byStudentId.docs[0];
                    return { id: doc.id, ...doc.data() };
                }
            }
        } catch (_) {}

        // Field: qrCode (supports legacy qr_ prefix or raw studentId)
        try {
            let byQR = await col.where('qrCode', '==', candidate).limit(1).get();
            if (!byQR.empty) {
                console.log('✅ Found by qrCode field');
                const doc = byQR.docs[0];
                return { id: doc.id, ...doc.data() };
            }
            const prefixed = candidate.startsWith('qr_') ? candidate : `qr_${candidate}`;
            byQR = await col.where('qrCode', '==', prefixed).limit(1).get();
            if (!byQR.empty) {
                console.log('✅ Found by qrCode (prefixed)');
                const doc = byQR.docs[0];
                return { id: doc.id, ...doc.data() };
            }
        } catch (_) {}

        // Field: LRN (12 digits)
        if (/^\d{12}$/.test(candidate)) {
            try {
                const byLRN = await col.where('lrn', '==', candidate).limit(1).get();
                if (!byLRN.empty) {
                    console.log('✅ Found by LRN');
                    const doc = byLRN.docs[0];
                    return { id: doc.id, ...doc.data() };
                }
            } catch (_) {}
        }

        // Field: name (exact, last resort)
        try {
            const byName = await col.where('first_name', '==', candidate).limit(1).get();
            if (!byName.empty) {
                console.log('✅ Found by name');
                const doc = byName.docs[0];
                return { id: doc.id, ...doc.data() };
            }
        } catch (_) {}

        console.log('❌ Student not found with any method');
        return null;
    }

    cancelAction() {
        this.currentStudent = null;
        this.updateScannerStatus(`Ready for scanning (${this.currentMode === 'timeIn' ? 'Time In' : 'Time Out'})...`);
    }

    async recordAttendance(studentId, student, entryType) {
        try {
            const timestamp = new Date();
            const timeString = timestamp.toTimeString().split(' ')[0].substring(0, 5);
            const session = this.getCurrentSession();
            
            // Use Attendance Logic for advanced status calculation
            let status = 'present';
            let remarks = '';
            
            if (entryType === 'entry') {
                // Time In logic
                if (session === 'morning') {
                    if (timeString <= '07:30') {
                        status = 'present';
                        remarks = 'On time arrival';
                    } else {
                        status = 'late';
                        remarks = 'Late arrival';
                    }
                } else if (session === 'afternoon') {
                    if (timeString <= '13:00') {
                        status = 'present';
                        remarks = 'On time after lunch';
                    } else {
                        status = 'late';
                        remarks = 'Late after lunch';
                    }
                } else {
                    status = 'present';
                    remarks = 'Arrival recorded';
                }
            } else {
                // Time Out logic
                status = 'present';
                
                // Check if student was absent in morning but tapping out in afternoon
                if (session === 'afternoon') {
                    const morningAttendance = await this.getStudentMorningAttendance(studentId);
                    if (!morningAttendance) {
                        status = 'half_day';
                        remarks = 'Absent morning, present afternoon (Half day)';
                    } else {
                        remarks = 'Dismissal recorded';
                    }
                } else {
                    remarks = 'Dismissal recorded';
                }
                
                // Special case: if student is tapping out during lunch (12:00-13:00)
                if (timeString >= '12:00' && timeString < '13:00') {
                    remarks = 'Lunch break departure';
                }
            }

            // Create attendance record
            const attendanceData = {
                studentId: studentId,
                student_id: studentId, // Snake case
                studentName: `${student.first_name || ''} ${student.last_name || ''}`.trim(),
                student_name: `${student.first_name || ''} ${student.last_name || ''}`.trim(), // Snake case
                classId: student.class_id || student.classId || '',
                class_id: student.class_id || student.classId || '', // Snake case
                entryType: entryType,
                entry_type: entryType, // Snake case
                timestamp: timestamp,
                time: timeString,
                session: session,
                status: status,
                remarks: remarks,
                recordedBy: this.currentUser.id,
                recorded_by: this.currentUser.id, // Snake case
                recordedByName: this.currentUser.name,
                recorded_by_name: this.currentUser.name, // Snake case
                manualEntry: false,
                manual_entry: false, // Snake case
                created_at: timestamp
            };

            const attendanceRef = await window.EducareTrack.db.collection('attendance').add(attendanceData);

            // Update student's current status
            const newStatus = entryType === 'entry' ? 'in_school' : 'out_school';
            await window.EducareTrack.db.collection('students').doc(studentId).update({
                currentStatus: newStatus,
                current_status: newStatus,
                lastAttendance: timestamp,
                last_attendance: timestamp,
                updated_at: timestamp
            });

            // Send enhanced notifications to both parent and teacher
            await this.sendEnhancedNotifications(student, entryType, timeString, status, remarks, attendanceRef.id);

            // Show success result
            const actionText = entryType === 'entry' ? 'Time In' : 'Time Out';
            const actionVerb = entryType === 'entry' ? 'arrived' : 'departed';
            
            this.showResult('success', 
                `${actionText} Recorded`, 
                `${(student.first_name || '' + ' ' + student.last_name || '').trim()} ${actionVerb} at ${timeString} (${remarks})`,
                studentId
            );
            
            // Add to recent scans
            this.addRecentScan({
                studentName: `${student.first_name || ''} ${student.last_name || ''}`.trim(),
                time: timeString,
                entryType: entryType,
                status: status,
                remarks: remarks,
                classId: student.class_id || student.classId
            });
            
            // Reload absent students list
            this.loadAbsentStudents();
            
            this.playBeepSound();
            
        } catch (error) {
            console.error('Error recording attendance:', error);
            throw error;
        }
    }

    // Enhanced notification system for teachers and parents
    async sendEnhancedNotifications(student, entryType, timeString, status, remarks, attendanceId) {
        try {
            // Get parent ID
            const parentId = student.parentId;
            
            // Get homeroom teacher and subject teachers
            const teacherIds = await this.getRelevantTeachers(student);
            
            // Combine all target users
            const targetUsers = [parentId, ...teacherIds].filter(id => id && id !== '');
            
            if (targetUsers.length === 0) {
                console.warn('No target users found for notifications');
                return;
            }

            const actionType = entryType === 'entry' ? 'arrived' : 'left';
            const notificationTitle = entryType === 'entry' ? 'Student Arrival' : 'Student Departure';
            
            // Create detailed message
            let message = `${(student.first_name || '' + ' ' + student.last_name || '').trim()} has ${actionType} at ${timeString}`;
            if (remarks) {
                message += `. ${remarks}`;
            }
            if (status === 'late') {
                message += ' - LATE ARRIVAL';
            } else if (status === 'half_day') {
                message += ' - HALF DAY';
            }

            // Create notification data
            const notificationData = {
                type: 'attendance',
                title: notificationTitle,
                message: message,
                targetUsers: targetUsers,
                studentId: student.id,
                student_id: student.id,
                studentName: `${student.first_name || ''} ${student.last_name || ''}`.trim(),
                isUrgent: status === 'late' || status === 'half_day',
                relatedRecord: attendanceId,
                createdAt: new Date(),
                created_at: new Date()
            };

            // Use EducareTrack notification system if available
            if (window.EducareTrack && window.EducareTrack.createNotification) {
                await window.EducareTrack.createNotification(notificationData);
            } else {
                // Fallback to direct Firestore (wrapper)
                await window.EducareTrack.db.collection('notifications').add(notificationData);
            }

            console.log(`Notification sent to ${targetUsers.length} users for ${(student.first_name || '' + ' ' + student.last_name || '').trim()}`);
            
        } catch (error) {
            console.error('Error sending enhanced notifications:', error);
            // Don't throw error to prevent attendance recording from failing
        }
    }

    // Get relevant teachers for notifications
    async getRelevantTeachers(student) {
        const teacherIds = [];
        
        try {
            // Get homeroom teacher for the student's class
            if (student.classId || student.class_id) {
                const classId = student.class_id || student.classId;
                const homeroomTeacherQuery = await window.EducareTrack.db
                    .collection('users')
                    .where('role', '==', 'teacher')
                    .where('class_id', '==', classId) // Updated to snake_case
                    .where('is_homeroom', '==', true)
                    .where('is_active', '==', true)
                    .limit(1)
                    .get();
                    
                if (!homeroomTeacherQuery.empty) {
                    teacherIds.push(homeroomTeacherQuery.docs[0].id);
                }

                // Also get any teacher assigned to this class (as backup)
                const classTeachersQuery = await window.EducareTrack.db
                    .collection('users')
                    .where('role', '==', 'teacher')
                    .where('assigned_classes', 'array-contains', classId)
                    .where('is_active', '==', true)
                    .limit(3)
                    .get();
                    
                classTeachersQuery.docs.forEach(doc => {
                    if (!teacherIds.includes(doc.id)) {
                        teacherIds.push(doc.id);
                    }
                });
            }

            // If no teachers found for class, try to find teachers by grade level from class info
            if (teacherIds.length === 0 && student.class_id) {
                // Get class info to determine grade
                try {
                    const classDoc = await window.EducareTrack.db.collection('classes').doc(student.class_id).get();
                    if (classDoc.exists) {
                        const classData = classDoc.data();
                        const gradeTeachersQuery = await window.EducareTrack.db
                            .collection('users')
                            .where('role', '==', 'teacher')
                            .where('assigned_subjects', 'array-contains', classData.grade)
                            .where('is_active', '==', true)
                            .limit(2)
                            .get();
                            
                        gradeTeachersQuery.docs.forEach(doc => {
                            teacherIds.push(doc.id);
                        });
                    }
                } catch (error) {
                    console.error('Error getting class info for grade lookup:', error);
                }
            }

            return teacherIds;
        } catch (error) {
            console.error('Error getting relevant teachers:', error);
            return teacherIds;
        }
    }

    // Helper method to check morning attendance
    async getStudentMorningAttendance(studentId) {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const snapshot = await window.EducareTrack.db
                .collection('attendance')
                .where('student_id', '==', studentId)
                .where('timestamp', '>=', today)
                .where('entry_type', '==', 'entry')
                .where('session', '==', 'morning')
                .limit(1)
                .get();
                
            return !snapshot.empty;
        } catch (error) {
            console.error('Error checking morning attendance:', error);
            return false;
        }
    }

    async loadAbsentStudents() {
        try {
            // Use the advanced attendance logic to get absent students
            const absentStudents = await this.attendanceLogic.getAbsentStudents();
            this.displayAbsentStudents(absentStudents);
        } catch (error) {
            console.error('Error loading absent students:', error);
            // Fallback to basic absent student loading
            await this.loadAbsentStudentsBasic();
        }
    }

    async loadAbsentStudentsBasic() {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            // Get all enrolled students (excluding withdrawn/transferred)
            const studentsSnapshot = await window.EducareTrack.db
                .collection('students')
                .where('current_status', 'not-in', ['withdrawn', 'transferred', 'graduated'])
                .get();
                
            const allStudents = studentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // Get today's attendance entries
            const attendanceSnapshot = await window.EducareTrack.db
                .collection('attendance')
                .where('timestamp', '>=', today)
                .where('entry_type', '==', 'entry')
                .get();
                
            const presentStudentIds = new Set();
            attendanceSnapshot.docs.forEach(doc => {
                presentStudentIds.add(doc.data().student_id);
            });
            
            // Find absent students
            const absentStudents = allStudents.filter(student => !presentStudentIds.has(student.id));
            
            this.displayAbsentStudents(absentStudents);
            
        } catch (error) {
            console.error('Error loading absent students (basic):', error);
        }
    }

    displayAbsentStudents(absentStudents) {
        const container = document.getElementById('absentStudents');
        
        if (absentStudents.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <svg class="w-12 h-12 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    <p>No absent students found for today</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = absentStudents.map(student => {
            const status = student.attendanceStatus || { status: 'absent', remarks: 'Full day absence' };
            return `
                <div class="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
                    <div>
                        <h4 class="text-sm font-medium text-gray-900">${(student.first_name || '' + ' ' + student.last_name || '').trim()}</h4>
                        <p class="text-xs text-gray-600">${student.id}${(student.class_id || student.classId) ? ` • ${student.class_id || student.classId}` : ''}</p>
                        <p class="text-xs text-red-600 mt-1">${status.remarks}</p>
                    </div>
                    <span class="px-2 py-1 text-xs font-semibold rounded-full ${this.getStatusColor(status.status)}">
                        ${this.getStatusText(status.status)}
                    </span>
                </div>
            `;
        }).join('');
    }

    showResult(type, title, message, studentId = null) {
        const resultsDiv = document.getElementById('scanResults');
        const resultContent = document.getElementById('resultContent');
        
        let icon, bgColor, textColor;
        
        switch(type) {
            case 'success':
                icon = '<svg class="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>';
                bgColor = 'bg-green-50 border-green-200';
                textColor = 'text-green-800';
                break;
            case 'error':
                icon = '<svg class="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>';
                bgColor = 'bg-red-50 border-red-200';
                textColor = 'text-red-800';
                break;
            case 'info':
                icon = '<svg class="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
                bgColor = 'bg-blue-50 border-blue-200';
                textColor = 'text-blue-800';
                break;
        }
        
        resultContent.innerHTML = `
            <div class="${bgColor} border rounded-lg p-4">
                <div class="flex items-center">
                    ${icon}
                    <div class="ml-3">
                        <h4 class="font-semibold ${textColor}">${title}</h4>
                        <p class="${textColor} text-sm">${message}</p>
                        ${studentId ? `<p class="text-gray-600 text-xs mt-1">Student ID: ${studentId}</p>` : ''}
                    </div>
                </div>
            </div>
        `;
        
        resultsDiv.classList.remove('hidden');
        
        if (type === 'success' || type === 'info') {
            setTimeout(() => {
                resultsDiv.classList.add('hidden');
            }, 5000);
        }
    }

    addRecentScan(scanData) {
        const recentScansDiv = document.getElementById('recentScans');
        const statusColor = this.getStatusColor(scanData.status);
        
        const scanElement = document.createElement('div');
        scanElement.className = 'flex items-center justify-between p-3 bg-gray-50 rounded-lg';
        scanElement.innerHTML = `
            <div>
                <h4 class="text-sm font-medium text-gray-900">${scanData.studentName}</h4>
                <p class="text-xs text-gray-600">${scanData.time} • ${scanData.entryType}</p>
            </div>
            <span class="px-2 py-1 text-xs font-semibold rounded-full ${statusColor}">
                ${this.getStatusText(scanData.status)}
            </span>
        `;
        
        if (recentScansDiv.firstChild) {
            recentScansDiv.insertBefore(scanElement, recentScansDiv.firstChild);
        } else {
            recentScansDiv.appendChild(scanElement);
        }
        
        if (recentScansDiv.children.length > 10) {
            recentScansDiv.removeChild(recentScansDiv.lastChild);
        }
    }

    async loadRecentScans() {
        try {
            const snapshot = await window.EducareTrack.db.collection('attendance')
                .orderBy('timestamp', 'desc')
                .limit(10)
                .get();
            
            const docs = snapshot.docs;
            // Process in reverse order to show newest first
            for (let i = docs.length - 1; i >= 0; i--) {
                const doc = docs[i];
                const data = doc.data();
                let studentName = data.student_name || data.studentName;
                
                // If no student name in attendance record, fetch from student collection
                if (!studentName && data.student_id) {
                    try {
                        const studentDoc = await window.EducareTrack.db.collection('students').doc(data.student_id).get();
                        if (studentDoc.exists) {
                            const studentData = studentDoc.data();
                            studentName = `${studentData.first_name || ''} ${studentData.last_name || ''}`.trim() || 'Unknown Student';
                        }
                    } catch (error) {
                        console.error('Error fetching student name:', error);
                        studentName = 'Unknown Student';
                    }
                }
                
                this.addRecentScan({
                    studentName: studentName || 'Unknown Student',
                    time: data.time,
                    entryType: data.entry_type || data.entryType || 'Unknown',
                    status: data.status || 'unknown'
                });
            }
        } catch (error) {
            console.error('Error loading recent scans:', error);
        }
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

    getCurrentSession() {
        return this.attendanceLogic.getCurrentSession();
    }

    getStatusColor(status) {
        const colors = {
            'present': 'status-present',
            'absent': 'status-absent',
            'late': 'status-late',
            'excused': 'status-excused',
            'in_clinic': 'status-clinic',
            'in_school': 'status-present',
            'out_school': 'status-absent',
            'ontime': 'status-ontime',
            'half_day': 'status-half_day',
            'half-day': 'status-half_day',
            'unknown': 'status-absent'
        };
        return colors[status] || 'status-absent';
    }

    getStatusText(status) {
        const texts = {
            'present': 'Present',
            'absent': 'Absent',
            'late': 'Late',
            'excused': 'Excused',
            'in_clinic': 'In Clinic',
            'in_school': 'Present',
            'out_school': 'Absent',
            'ontime': 'On Time',
            'half_day': 'Half Day',
            'half-day': 'Half Day',
            'unknown': 'Unknown'
        };
        return texts[status] || 'Unknown';
    }

    destroy() {
        this.stopWebcamScanner();
    }
}

// Global functions for HTML button onclick events
function loadAbsentStudents() {
    if (window.qrScanner) {
        window.qrScanner.loadAbsentStudents();
    }
}

// Initialize scanner when page loads
document.addEventListener('DOMContentLoaded', function() {
    window.qrScanner = new QRScanner();
});
