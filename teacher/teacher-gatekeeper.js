class TeacherGatekeeper {
    constructor() {
        this.currentUser = null;
        this.attendanceLogic = null;
        this.selectedStudent = null;
        this.scanner = null;
        this.adminIds = [];
        this.init();
    }

    async init() {
        if (!await this.checkAuth()) return;
        
        // Load AttendanceLogic if not already loaded
        if (!window.AttendanceLogic) {
            console.warn('AttendanceLogic not found, functionality may be limited');
        } else {
            this.attendanceLogic = new window.AttendanceLogic();
        }

        this.loadAdminIds();
        this.initEventListeners();
        this.startScanner(); // Initialize QR scanner
    }

    async checkAuth() {
        const savedUser = localStorage.getItem('educareTrack_user');
        if (!savedUser) {
            window.location.href = '../index.html';
            return false;
        }
        this.currentUser = JSON.parse(savedUser);
        if (this.currentUser.role !== 'teacher') {
            window.location.href = '../index.html';
            return false;
        }
        return true;
    }

    initEventListeners() {
        document.getElementById('studentSearch').addEventListener('input', (e) => {
            this.searchStudents(e.target.value);
        });

        // Manual Entry Button
        document.getElementById('submitManualEntry').addEventListener('click', () => {
            this.submitManualEntry();
        });
    }

    // Reuse Guard Logic for Search
    async searchStudents(searchTerm) {
        const resultsContainer = document.getElementById('studentResults');
        if (searchTerm.length < 2) {
            resultsContainer.innerHTML = '';
            resultsContainer.classList.add('hidden');
            return;
        }

        try {
            const { data: students, error } = await window.supabaseClient
                .from('students')
                .select('id, full_name, lrn, class_id')
                .or(`full_name.ilike.%${searchTerm}%,id.ilike.%${searchTerm}%`)
                .limit(5);
            
            if (error) throw error;
            this.displayStudentResults(students);
        } catch (error) {
            console.error('Error searching:', error);
        }
    }

    displayStudentResults(students) {
        const resultsContainer = document.getElementById('studentResults');
        if (students.length === 0) {
            resultsContainer.innerHTML = '<div class="p-2 text-gray-500">No students found</div>';
            resultsContainer.classList.remove('hidden');
            return;
        }

        resultsContainer.innerHTML = students.map(s => `
            <div class="p-2 hover:bg-gray-100 cursor-pointer border-b" 
                 onclick="window.teacherGatekeeper.selectStudent('${s.id}', '${s.full_name}', '${s.class_id}')">
                <div class="font-medium">${s.full_name}</div>
                <div class="text-xs text-gray-500">${s.id}</div>
            </div>
        `).join('');
        resultsContainer.classList.remove('hidden');
    }

    selectStudent(id, name, classId) {
        this.selectedStudent = { id, name, classId };
        document.getElementById('studentSearch').value = `${name} (${id})`;
        document.getElementById('studentResults').classList.add('hidden');
    }

    async submitManualEntry() {
        if (!this.selectedStudent) return alert('Select a student');
        
        const type = document.getElementById('entryType').value; // entry/exit
        const time = document.getElementById('manualTime').value;
        
        if (!time) return alert('Please enter a time');

        const now = new Date();
        const [h, m] = time.split(':');
        now.setHours(h, m, 0, 0);

        const session = parseInt(h) < 12 ? 'AM' : 'PM';
        const status = (type === 'entry' && time > '07:30') ? 'late' : 'present';
        const remarks = `manual_${type}_by_teacher`;

        try {
            const { error } = await window.supabaseClient
                .from('attendance')
                .insert({
                    student_id: this.selectedStudent.id,
                    class_id: this.selectedStudent.classId,
                    session: session,
                    status: status,
                    method: 'manual',
                    timestamp: now.toISOString(),
                    recorded_by: this.currentUser.id,
                    remarks: remarks
                });

            if (error) throw error;
            
            // Send Notifications
            const studentForNotif = {
                id: this.selectedStudent.id,
                full_name: this.selectedStudent.name,
                class_id: this.selectedStudent.classId
            };
            await this.sendEnhancedNotifications(studentForNotif, type, time, status, remarks);

            alert('Attendance recorded successfully');
            this.selectedStudent = null;
            document.getElementById('studentSearch').value = '';
            document.getElementById('manualTime').value = '';
        } catch (e) {
            console.error(e);
            alert('Error recording attendance');
        }
    }

    async loadAdminIds() {
        try {
            const { data, error } = await window.supabaseClient
                .from('profiles')
                .select('id')
                .eq('role', 'admin');
            
            if (!error && data) {
                this.adminIds = data.map(admin => admin.id);
            }
        } catch (error) {
            console.error('Error loading admin IDs:', error);
        }
    }

    async getRelevantTeachers(student) {
        const teacherIds = [];
        
        try {
            // Get homeroom teacher for the student's class
            if (student.class_id) {
                const { data: classData, error: classError } = await window.supabaseClient
                    .from('classes')
                    .select('adviser_id')
                    .eq('id', student.class_id)
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

    async sendEnhancedNotifications(student, entryType, timeString, status, remarks) {
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
            
            // Get homeroom teacher (if not the current user, but good to include anyway for completeness)
            const teacherIds = await this.getRelevantTeachers(student);
            targetUsers = [...targetUsers, ...teacherIds];

            // Add admins
            if (this.adminIds && this.adminIds.length > 0) {
                targetUsers = [...targetUsers, ...this.adminIds];
            }
            
            // Deduplicate and filter
            targetUsers = [...new Set(targetUsers)].filter(id => id && id !== '');
            
            if (targetUsers.length === 0) return;

            const actionType = entryType === 'entry' ? 'arrived' : 'left';
            const notificationTitle = entryType === 'entry' ? 'Student Arrival' : 'Student Departure';
            
            let message = `${student.full_name || student.name} has ${actionType} at ${timeString}`;
            if (remarks && !remarks.includes('qr_') && !remarks.includes('manual_')) {
                message += `. ${remarks}`;
            }
            if (status === 'late') message += ' - LATE ARRIVAL';

            await window.supabaseClient.from('notifications').insert({
                target_users: targetUsers,
                title: notificationTitle,
                message: message,
                type: 'attendance',
                student_id: student.id
            });
            
        } catch (error) {
            console.error('Error sending notifications:', error);
        }
    }

    // QR Scanner
    startScanner() {
        if (typeof Html5QrcodeScanner === 'undefined') {
            document.getElementById('reader').innerHTML = `
                <div class="p-4 text-center bg-gray-100 rounded">
                    <p class="text-gray-500">QR Scanner library not loaded.</p>
                    <p class="text-sm">Please ensure internet connection or check script inclusion.</p>
                </div>`;
            return;
        }

        this.scanner = new Html5QrcodeScanner(
            "reader", 
            { fps: 10, qrbox: { width: 250, height: 250 } },
            /* verbose= */ false
        );
        this.scanner.render((decodedText) => this.handleScan(decodedText), (error) => {
            // console.warn(error);
        });
    }

    async handleScan(decodedText) {
        if (this.isScanning) return;
        this.isScanning = true;

        try {
            // 1. Get student ID from hash
            const { data: qrData, error: qrError } = await window.supabaseClient
                .from('qr_codes')
                .select('student_id')
                .eq('qr_hash', decodedText)
                .single();
            
            if (qrError || !qrData) {
                alert('Invalid QR Code');
                this.isScanning = false;
                return;
            }

            const studentId = qrData.student_id;

            // 2. Get Student Details
            const { data: student, error: sError } = await window.supabaseClient
                .from('students')
                .select('full_name, id, class_id')
                .eq('id', studentId)
                .single();

            if (sError) throw sError;

            // 3. Determine Entry/Exit (Auto-logic or prompt)
            // For now, let's just use the manual entry type selector or default to entry if not set
            // Better: Check last attendance record for today
            const today = new Date().toISOString().split('T')[0];
            const { data: lastRecord } = await window.supabaseClient
                .from('attendance')
                .select('*')
                .eq('student_id', studentId)
                .gte('timestamp', today)
                .order('timestamp', { ascending: false })
                .limit(1)
                .single();

            let type = 'entry';
            if (lastRecord) {
                // If last record was entry (or present/late without exit remark), next is exit
                const isExit = lastRecord.remarks && lastRecord.remarks.includes('exit');
                if (!isExit) type = 'exit';
            }

            const confirmMsg = `Student: ${student.full_name}\nType: ${type.toUpperCase()}\n\nProceed?`;
            if (!confirm(confirmMsg)) {
                this.isScanning = false;
                return;
            }

            // 4. Record Attendance
            const now = new Date();
            const session = now.getHours() < 12 ? 'AM' : 'PM';
            let status = 'present';
            const timeStr = now.toTimeString().slice(0, 5);
            
            if (type === 'entry') {
                if (timeStr > '07:30') status = 'late';
            }

            const remarks = `qr_${type}_by_teacher`;

            const { data: inserted, error: insError } = await window.supabaseClient
                .from('attendance')
                .insert({
                    student_id: studentId,
                    class_id: student.class_id, // Ensure class_id is recorded if available in student object (need to select it)
                    session: session,
                    status: status,
                    method: 'qr',
                    timestamp: now.toISOString(),
                    recorded_by: this.currentUser.id,
                    remarks: remarks
                })
                .select();

            if (insError) throw insError;

            // Send Notifications
            await this.sendEnhancedNotifications(student, type, timeStr, status, remarks);

            alert(`Attendance recorded: ${student.full_name} (${type})`);

        } catch (e) {
            console.error('Scan error:', e);
            alert('Error processing scan');
        } finally {
            // Delay before next scan to prevent double scan
            setTimeout(() => {
                this.isScanning = false;
            }, 3000);
        }
    }
}

window.teacherGatekeeper = new TeacherGatekeeper();