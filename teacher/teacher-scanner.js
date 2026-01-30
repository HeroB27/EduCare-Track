// Teacher Scanner JavaScript (Adapted from Guard Scanner)
class TeacherScanner {
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
        // Assuming AttendanceLogic is available globally via script tag
        this.attendanceLogic = new AttendanceLogic();
        
        this.initEventListeners();
        this.loadRecentScans().catch(error => console.error('Error loading recent scans:', error));
        this.checkAuth();
        this.loadAbsentStudents();
        this.setupRealTimeListeners();
        this.updateModeDisplay();
    }

    setupRealTimeListeners() {
        if (!window.supabaseClient) return;

        // Listen for attendance changes
        this.attendanceSubscription = window.supabaseClient
            .channel('teacher_scanner_attendance_changes')
            .on('postgres_changes', 
                { event: '*', schema: 'public', table: 'attendance' },
                (payload) => {
                    console.log('Attendance change detected:', payload);
                    // Reload absent students
                    this.loadAbsentStudents();
                    // Reload recent scans to show updates from other devices/users
                    this.loadRecentScans();
                }
            )
            .subscribe();
            
        console.log('Real-time listeners set up for Teacher Scanner');
    }

    async checkAuth() {
        const savedUser = localStorage.getItem('educareTrack_user');
        if (!savedUser) {
            window.location.href = '../index.html';
            return;
        }

        this.currentUser = JSON.parse(savedUser);
        // Allow teachers to use this scanner
        if (this.currentUser.role !== 'teacher') {
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
        if (physInput) {
            physInput.addEventListener('input', (e) => this.handlePhysicalInput(e.target.value));
            physInput.addEventListener('keydown', (e) => this.handlePhysicalKeydown(e));
            physInput.addEventListener('paste', (e) => {
                const text = (e.clipboardData || window.clipboardData).getData('text');
                e.preventDefault();
                this.processPhysicalData(text);
            });
            physInput.addEventListener('focus', () => { physInput.value = ''; });
        }
        
        // Also capture global keydown so scanner works even without focus
        document.addEventListener('keydown', (e) => {
            if (!this.physicalModeActive) return;
            this.handlePhysicalKeydown(e);
        });

        // Camera settings controls
        const brightnessControl = document.getElementById('brightnessControl');
        if (brightnessControl) {
            brightnessControl.addEventListener('input', (e) => this.updateVideoFilter());
            brightnessControl.addEventListener('input', (e) => {
                document.getElementById('brightnessValue').textContent = Math.round(e.target.value * 100) + '%';
            });
        }
        
        const contrastControl = document.getElementById('contrastControl');
        if (contrastControl) {
            contrastControl.addEventListener('input', (e) => this.updateVideoFilter());
            contrastControl.addEventListener('input', (e) => {
                document.getElementById('contrastValue').textContent = Math.round(e.target.value * 100) + '%';
            });
        }
        
        const saturationControl = document.getElementById('saturationControl');
        if (saturationControl) {
            saturationControl.addEventListener('input', (e) => this.updateVideoFilter());
            saturationControl.addEventListener('input', (e) => {
                document.getElementById('saturationValue').textContent = Math.round(e.target.value * 100) + '%';
            });
        }
        
        // Quick Action Buttons
        const quickTimeInBtn = document.getElementById('quickTimeInBtn');
        if (quickTimeInBtn) {
            quickTimeInBtn.addEventListener('click', () => {
                if (this.currentStudent) {
                    this.recordAttendance(this.currentStudent.id, this.currentStudent, 'entry');
                }
            });
        }

        const quickTimeOutBtn = document.getElementById('quickTimeOutBtn');
        if (quickTimeOutBtn) {
            quickTimeOutBtn.addEventListener('click', () => {
                if (this.currentStudent) {
                    this.recordAttendance(this.currentStudent.id, this.currentStudent, 'exit');
                }
            });
        }
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
        
        // Direct doc lookup (most robust when QR encodes document ID)
        try {
            const { data: student, error } = await window.supabaseClient
                .from('students')
                .select('id, full_name, lrn, class_id, photo_url')
                .eq('id', candidate)
                .single();
            
            if (!error && student) {
                console.log('✅ Found by document ID');
                return {
                    id: student.id,
                    first_name: student.full_name.split(' ')[0],
                    last_name: student.full_name.split(' ').slice(1).join(' '),
                    name: student.full_name,
                    lrn: student.lrn,
                    class_id: student.class_id,
                    classId: student.class_id,
                    photo_url: student.photo_url
                };
            }
        } catch (_) {}

        // Field: LRN (12 digits)
        if (/^\d{12}$/.test(candidate)) {
            try {
                const { data: student, error } = await window.supabaseClient
                    .from('students')
                    .select('id, full_name, lrn, class_id, photo_url')
                    .eq('lrn', candidate)
                    .single();
                
                if (!error && student) {
                    console.log('✅ Found by LRN');
                    return {
                        id: student.id,
                        first_name: student.full_name.split(' ')[0],
                        last_name: student.full_name.split(' ').slice(1).join(' '),
                        name: student.full_name,
                        lrn: student.lrn,
                        class_id: student.class_id,
                        classId: student.class_id,
                        photo_url: student.photo_url
                    };
                }
            } catch (_) {}
        }

        // Field: full_name (exact, last resort)
        try {
            const { data: students, error } = await window.supabaseClient
                .from('students')
                .select('id, full_name, lrn, class_id, photo_url')
                .eq('full_name', candidate)
                .limit(1);
            
            if (!error && students && students.length > 0) {
                const student = students[0];
                console.log('✅ Found by name');
                return {
                    id: student.id,
                    first_name: student.full_name.split(' ')[0],
                    last_name: student.full_name.split(' ').slice(1).join(' '),
                    name: student.full_name,
                    lrn: student.lrn,
                    class_id: student.class_id,
                    classId: student.class_id,
                    photo_url: student.photo_url
                };
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
            let uiStatus = 'present'; // For UI display only
            
            if (entryType === 'entry') {
                // Time In logic
                if (session === 'AM') {
                    if (timeString <= '07:30') {
                        status = 'present';
                        uiStatus = 'present';
                        remarks = 'On time arrival';
                    } else {
                        status = 'late';
                        uiStatus = 'late';
                        remarks = 'Late arrival';
                    }
                } else if (session === 'PM') {
                    if (timeString <= '13:00') {
                        status = 'present';
                        uiStatus = 'present';
                        remarks = 'On time after lunch';
                    } else {
                        status = 'late';
                        uiStatus = 'late';
                        remarks = 'Late after lunch';
                    }
                } else {
                    status = 'present';
                    uiStatus = 'present';
                    remarks = 'Arrival recorded';
                }
            } else {
                // Time Out logic
                // Map 'out' to 'present' for DB constraint, but distinguish in remarks/UI
                status = 'present'; 
                uiStatus = 'out_school'; // Custom status for UI
                
                // Check if student was absent in morning but tapping out in afternoon
                if (session === 'PM') {
                    const morningAttendance = await this.getStudentMorningAttendance(studentId);
                    if (!morningAttendance) {
                        uiStatus = 'half_day';
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
            
            // Create attendance record using Supabase (Schema Aligned)
            const record = {
                student_id: studentId,
                class_id: student.class_id || student.classId || null,
                session: session,
                status: status, // Must be present, late, or absent
                method: 'qr',
                timestamp: timestamp.toISOString(),
                recorded_by: this.currentUser.id,
                remarks: `qr_${entryType} - ${remarks}`
            };
            
            // Insert into Supabase
            const { data, error } = await window.supabaseClient
                .from('attendance')
                .insert([record])
                .select();
                
            if (error) throw error;
            
            // Send enhanced notifications to both parent and teacher
            await this.sendEnhancedNotifications(student, entryType, timeString, uiStatus, remarks, data[0].id);
            
            // Success
            const actionText = entryType === 'entry' ? 'Time In' : 'Time Out';
            const actionVerb = entryType === 'entry' ? 'arrived' : 'departed';
            
            this.showResult('success', 
                `${actionText} Recorded`, 
                `${student.name || `${student.first_name || ''} ${student.last_name || ''}`.trim()} ${actionVerb} at ${timeString} (${remarks})`,
                studentId,
                student.photo_url
            );
            
            this.updateScannerStatus(`Recorded: ${student.name || `${student.first_name || ''} ${student.last_name || ''}`.trim()}`);
            
            // Add to recent scans
            this.updateRecentScansUI({
                name: student.name || `${student.first_name || ''} ${student.last_name || ''}`.trim(),
                time: timeString,
                status: uiStatus, // Use UI status for display
                type: entryType,
                photoUrl: student.photo_url
            });
            
            // Reload absent students list
            if (typeof this.loadAbsentStudents === 'function') {
                this.loadAbsentStudents();
            }

            // Play beep sound if available
            if (typeof this.playBeepSound === 'function') {
                this.playBeepSound();
            }
            
        } catch (error) {
            console.error('Error recording attendance:', error);
            this.showResult('error', 'Database Error', 'Failed to save attendance record: ' + error.message);
        }
    }

    // Enhanced notification system for teachers and parents
    async sendEnhancedNotifications(student, entryType, timeString, status, remarks, attendanceId) {
        try {
            // Get parent-student relationship
            const { data: relationshipData, error: relationshipError } = await window.supabaseClient
                .from('parent_students')
                .select('parent_id')
                .eq('student_id', student.id);
            
            let targetUsers = [];
            if (!relationshipError && relationshipData && relationshipData.length > 0) {
                targetUsers = relationshipData.map(r => r.parent_id);
            }
            
            // Get homeroom teacher and subject teachers
            const teacherIds = await this.getRelevantTeachers(student);
            
            // Combine all target users
            targetUsers = [...targetUsers, ...teacherIds].filter(id => id && id !== '');
            
            if (targetUsers.length === 0) {
                console.warn('No target users found for notifications');
                return;
            }

            const actionType = entryType === 'entry' ? 'arrived' : 'left';
            const notificationTitle = entryType === 'entry' ? 'Student Arrival' : 'Student Departure';
            
            // Create detailed message
            let message = `${student.name || `${student.first_name || ''} ${student.last_name || ''}`.trim()} has ${actionType} at ${timeString}`;
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
                target_users: targetUsers,
                title: notificationTitle,
                message: message,
                type: 'attendance',
                student_id: student.id
            };

            const { error } = await window.supabaseClient
                .from('notifications')
                .insert(notificationData);
            
            if (error) {
                console.error('Error creating notification:', error);
            }

            console.log(`Notification sent to ${targetUsers.length} users`);
            
        } catch (error) {
            console.error('Error sending enhanced notifications:', error);
        }
    }

    // Get relevant teachers for notifications
    async getRelevantTeachers(student) {
        const teacherIds = [];
        
        try {
            // Get homeroom teacher for the student's class
            if (student.classId || student.class_id) {
                const classId = student.class_id || student.classId;
                
                // Get class info to find adviser
                const { data: classData, error: classError } = await window.supabaseClient
                    .from('classes')
                    .select('adviser_id')
                    .eq('id', classId)
                    .single();
                
                if (!classError && classData && classData.adviser_id) {
                    teacherIds.push(classData.adviser_id);
                }
            }

            return teacherIds;
        } catch (error) {
            console.error('Error getting relevant teachers:', error);
            return teacherIds;
        }
    }


    getCurrentSession() {
        return this.attendanceLogic.getCurrentSession();
    }

    async getStudentMorningAttendance(studentId) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const { data, error } = await window.supabaseClient
            .from('attendance')
            .select('id')
            .eq('student_id', studentId)
            .gte('timestamp', today.toISOString())
            .eq('session', 'AM')
            .limit(1);
            
        return !error && data && data.length > 0;
    }

    // Helper to update status text
    updateScannerStatus(message) {
        const statusEl = document.getElementById('scannerStatus');
        if (statusEl) statusEl.textContent = message;
    }

    // Helper to show results
    showResult(type, title, message, studentId = null, photoUrl = null) {
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
        
        const photoHtml = photoUrl ? 
            `<div class="flex-shrink-0 mr-3">
                <img src="${photoUrl}" alt="Student" class="w-12 h-12 rounded-full object-cover border-2 border-white shadow-sm">
             </div>` : '';

        resultContent.innerHTML = `
            <div class="${bgColor} border rounded-lg p-4">
                <div class="flex items-center">
                    ${photoHtml}
                    ${!photoUrl ? icon : ''}
                    <div class="${photoUrl ? '' : 'ml-3'}">
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
        
        const photoHtml = scanData.photoUrl ? 
            `<img src="${scanData.photoUrl}" class="w-8 h-8 rounded-full object-cover mr-3 border border-gray-200">` : 
            `<div class="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center mr-3 text-gray-500 text-xs font-bold">
                ${scanData.studentName.substring(0,2).toUpperCase()}
             </div>`;

        const scanElement = document.createElement('div');
        scanElement.className = 'flex items-center justify-between p-3 bg-gray-50 rounded-lg';
        scanElement.innerHTML = `
            <div class="flex items-center">
                ${photoHtml}
                <div>
                    <h4 class="text-sm font-medium text-gray-900">${scanData.studentName}</h4>
                    <p class="text-xs text-gray-600">${scanData.time} • ${scanData.entryType}</p>
                </div>
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
            const { data: attendanceData, error } = await window.supabaseClient
                .from('attendance')
                .select(`
                    student_id, 
                    timestamp, 
                    session, 
                    status,
                    remarks,
                    students (
                        full_name,
                        photo_url
                    )
                `)
                .order('timestamp', { ascending: false })
                .limit(10);
            
            if (error) throw error;
            
            // Process in reverse order to show newest first
            for (let i = attendanceData.length - 1; i >= 0; i--) {
                const record = attendanceData[i];
                const studentName = record.students ? record.students.full_name : 'Unknown Student';
                const photoUrl = record.students ? record.students.photo_url : null;
                const time = new Date(record.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                
                // Determine entry type from remarks if possible, or session
                let entryType = 'entry';
                if (record.remarks && record.remarks.includes('out')) entryType = 'exit';
                else if (record.remarks && record.remarks.includes('Dismissal')) entryType = 'exit';
                
                this.addRecentScan({
                    studentName: studentName,
                    time: time,
                    entryType: entryType,
                    status: record.status,
                    photoUrl: photoUrl
                });
            }
        } catch (error) {
            console.error('Error loading recent scans:', error);
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
            const endOfDay = new Date(today);
            endOfDay.setHours(23, 59, 59, 999);
            
            // Get all enrolled students (Supabase)
            const { data: allStudents, error: sError } = await window.supabaseClient
                .from('students')
                .select('id, full_name, class_id')
                .in('current_status', ['enrolled', 'active']);

            if (sError) throw sError;
            
            // Get today's attendance entries
            const { data: attendanceData, error: aError } = await window.supabaseClient
                .from('attendance')
                .select('student_id')
                .gte('timestamp', today.toISOString())
                .lte('timestamp', endOfDay.toISOString())
                .eq('session', 'AM'); // Assuming AM entry means present for the day
                
            if (aError) throw aError;
                
            const presentStudentIds = new Set(attendanceData.map(r => r.student_id));
            
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
                        <h4 class="text-sm font-medium text-gray-900">${(student.full_name || student.first_name + ' ' + student.last_name).trim()}</h4>
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

    // Deprecated but kept for compatibility with old calls
    updateRecentScansUI(scan) {
        this.addRecentScan({
            studentName: scan.name,
            time: scan.time,
            entryType: scan.type === 'entry' ? 'entry' : 'exit',
            status: scan.status,
            photoUrl: scan.photoUrl
        });
    }
}

// Global functions for HTML button onclick events
function loadAbsentStudents() {
    if (window.teacherScanner) {
        window.teacherScanner.loadAbsentStudents();
    }
}

// Initialize scanner when page loads
document.addEventListener('DOMContentLoaded', function() {
    window.teacherScanner = new TeacherScanner();
});
