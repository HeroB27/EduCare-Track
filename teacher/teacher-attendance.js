class TeacherAttendance {
    constructor() {
        this.currentUser = null;
        this.classStudents = [];
        this.todayAttendance = [];
        this.attendanceHistory = [];
        
        // Subject Attendance properties
        this.subjects = [];
        this.subjectStudents = [];
        this.currentSubject = null;
        this.currentSubjectAttendance = [];

        this.init();
    }

    async overrideStatus(studentId, status) {
        try {
            this.showLoading();
            const student = this.classStudents.find(s => s.id === studentId);
            if (!student) throw new Error('Student not found');
            await EducareTrack.overrideAttendanceStatus(studentId, status);
            await this.loadTodayAttendance();
            this.hideLoading();
            this.showNotification(`${student.name} marked ${status}`, 'success');
        } catch (error) {
            console.error('Error overriding status:', error);
            this.hideLoading();
            this.showNotification('Error updating status', 'error');
        }
    }

    async init() {
        try {
            this.showLoading();
            
            if (!window.EducareTrack) {
                setTimeout(() => this.init(), 100);
                return;
            }

            const savedUser = localStorage.getItem('educareTrack_user');
            if (!savedUser) {
                window.location.href = '../index.html';
                return;
            }

            this.currentUser = JSON.parse(savedUser);
            
            // Sync with core EducareTrack
            if (window.EducareTrack) {
                window.EducareTrack.currentUser = this.currentUser;
            }
            
            if (this.currentUser.role !== 'teacher') {
                window.location.href = `../${this.currentUser.role}/${this.currentUser.role}-dashboard.html`;
                return;
            }

            this.updateUI();

            // Load assigned class information from classes table where adviser_id = teacher id
            const { data: classData, error: classError } = await window.supabaseClient
                .from('classes')
                .select('*')
                .eq('adviser_id', this.currentUser.id)
                .eq('is_active', true)
                .single();
            
            if (!classError && classData) {
                // Set classId for backward compatibility
                this.currentUser.classId = classData.id;
                this.currentUser.className = `${classData.grade} - ${classData.level || classData.strand || 'Class'}`;
                console.log('Loaded assigned class:', classData);
            } else {
                console.log('No assigned class found for teacher');
            }

            // Ensure teacher has an assigned class
            if (!this.currentUser.classId) {
                this.classStudents = [];
                this.todayAttendance = [];
                this.renderAttendanceTable();
                this.showNotification('No class assigned to your account', 'warning');
            } else {
                await this.loadClassStudents();
                await this.loadTodayAttendance();
            }

            await this.loadNotificationCount();
            this.initEventListeners();
            this.setupRealTimeListeners();
            
            this.hideLoading();
        } catch (error) {
            console.error('Teacher attendance initialization failed:', error);
            this.hideLoading();
        }
    }

    setupRealTimeListeners() {
        if (!window.supabaseClient || !this.currentUser.classId) return;

        if (this.realtimeChannel) {
            window.supabaseClient.removeChannel(this.realtimeChannel);
        }

        this.realtimeChannel = window.supabaseClient.channel('teacher_attendance_realtime');
        
        // Listen for attendance changes for this class
        this.realtimeChannel.on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'attendance',
            filter: `class_id=eq.${this.currentUser.classId}`
        }, (payload) => {
            console.log('Attendance update received:', payload);
            this.loadTodayAttendance();
        });

        this.realtimeChannel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('Teacher attendance connected to realtime updates');
            }
        });
    }

    updateUI() {
        document.getElementById('userName').textContent = this.currentUser.name;
        document.getElementById('userRole').textContent = this.currentUser.role;
        document.getElementById('userInitials').textContent = this.currentUser.name
            .split(' ')
            .map(n => n[0])
            .join('')
            .substring(0, 2)
            .toUpperCase();

        if (this.currentUser.classId) {
            document.getElementById('assignedClass').textContent = this.currentUser.className || 'Class ' + this.currentUser.classId;
        }

        this.updateCurrentTime();
        setInterval(() => this.updateCurrentTime(), 60000);
    }

    updateCurrentTime() {
        const now = new Date();
        document.getElementById('currentTime').textContent = now.toLocaleString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        // Update attendance date
        document.getElementById('attendanceDate').textContent = now.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    async loadClassStudents() {
        try {
            if (!this.currentUser.classId) return;
            this.classStudents = await EducareTrack.getStudentsByClass(this.currentUser.classId);
            document.getElementById('totalStudents').textContent = this.classStudents.length;
            this.updateAttendanceStats();
        } catch (error) {
            console.error('Error loading class students:', error);
            this.showNotification('Error loading students', 'error');
        }
    }

    async loadTodayAttendance() {
        try {
            if (!this.currentUser.classId) return;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayStr = today.toISOString();
            
            const { data: attendanceData, error: attendanceError } = await window.supabaseClient
                .from('attendance')
                .select('*')
                .eq('class_id', this.currentUser.classId)
                .gte('timestamp', today.toISOString())
                .order('timestamp', { ascending: false });

            if (attendanceError) throw attendanceError;

            this.todayAttendance = (attendanceData || []).map(record => ({
                id: record.id,
                ...record,
                studentId: record.student_id,
                entryType: record.entry_type,
                classId: record.class_id,
                timestamp: new Date(record.timestamp)
            }));
            
            this.renderAttendanceTable();
            this.updateAttendanceStats();
        } catch (error) {
            console.error('Error loading today attendance:', error);
            this.showNotification('Error loading attendance data', 'error');
        }
    }

    updateAttendanceStats() {
        const presentStudents = new Set();
        const lateStudents = new Set();
        const absentStudents = new Set(this.classStudents.map(s => s.id));

        this.todayAttendance.forEach(record => {
            if (record.entryType === 'entry') {
                if (record.status !== 'absent') {
                    absentStudents.delete(record.studentId);
                }
                if (record.status === 'late') {
                    lateStudents.add(record.studentId);
                } else if (record.status === 'present') {
                    presentStudents.add(record.studentId);
                }
            }
        });

        document.getElementById('presentToday').textContent = presentStudents.size;
        document.getElementById('lateToday').textContent = lateStudents.size;
        document.getElementById('absentToday').textContent = absentStudents.size;
    }

    renderAttendanceTable() {
        const tableBody = document.getElementById('attendanceTableBody');
        
        if (this.classStudents.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="px-6 py-4 text-center text-gray-500">
                        No students found in your class
                    </td>
                </tr>
            `;
            return;
        }

        // Group attendance by student for today
        const studentAttendance = {};
        this.todayAttendance.forEach(record => {
            if (!studentAttendance[record.studentId]) {
                studentAttendance[record.studentId] = [];
            }
            studentAttendance[record.studentId].push(record);
        });

        tableBody.innerHTML = this.classStudents.map(student => {
            const studentRecords = studentAttendance[student.id] || [];
            const entryRecord = studentRecords.find(r => r.entryType === 'entry');
            const exitRecord = studentRecords.find(r => r.entryType === 'exit');
            
            return `
                <tr class="hover:bg-gray-50">
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="flex items-center">
                            <div class="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center mr-3">
                                ${student.photoUrl ? 
                                    `<img src="${student.photoUrl}" alt="${student.name}" class="w-8 h-8 rounded-full object-cover">` :
                                    `<span class="text-blue-600 text-xs font-semibold">${student.name.split(' ').map(n => n[0]).join('').substring(0, 2)}</span>`
                                }
                            </div>
                            <div>
                                <div class="text-sm font-medium text-gray-900">${student.name}</div>
                                <div class="text-sm text-gray-500">${student.lrn || 'N/A'}</div>
                            </div>
                        </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <span class="px-2 py-1 rounded-full text-xs font-medium ${this.getStatusBadgeClass(entryRecord?.status || 'absent')}">
                            ${this.getStatusText(entryRecord?.status || 'absent')}
                        </span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${entryRecord ? `${entryRecord.time}${exitRecord ? ` / ${exitRecord.time}` : ''}` : 'Not recorded'}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${entryRecord?.session || 'N/A'}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div class="flex space-x-2">
                            ${!entryRecord ? `
                                <button class="text-green-600 hover:text-green-900 mark-present" data-student-id="${student.id}" data-has-entry="false">
                                    <i class="fas fa-check-circle"></i>
                                </button>
                                <button class="text-yellow-600 hover:text-yellow-900 mark-late" data-student-id="${student.id}" data-has-entry="false">
                                    <i class="fas fa-clock"></i>
                                </button>
                                <button class="text-red-600 hover:text-red-900 mark-absent" data-student-id="${student.id}" data-has-entry="false">
                                    <i class="fas fa-times-circle"></i>
                                </button>
                            ` : `
                                <button class="text-green-600 hover:text-green-900 mark-present" data-student-id="${student.id}" data-has-entry="true">
                                    <i class="fas fa-check-circle"></i>
                                </button>
                                <button class="text-yellow-600 hover:text-yellow-900 mark-late" data-student-id="${student.id}" data-has-entry="true">
                                    <i class="fas fa-clock"></i>
                                </button>
                                <button class="text-red-600 hover:text-red-900 mark-absent" data-student-id="${student.id}" data-has-entry="true">
                                    <i class="fas fa-times-circle"></i>
                                </button>
                                <button class="text-blue-600 hover:text-blue-900 record-exit" data-student-id="${student.id}">
                                    <i class="fas fa-sign-out-alt"></i>
                                </button>
                            `}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // Add event listeners to action buttons
        this.attachAttendanceEventListeners();
    }

    getStatusBadgeClass(status) {
        const classes = {
            'present': 'bg-green-100 text-green-800',
            'late': 'bg-yellow-100 text-yellow-800',
            'absent': 'bg-red-100 text-red-800',
            'in_clinic': 'bg-blue-100 text-blue-800'
        };
        return classes[status] || 'bg-gray-100 text-gray-800';
    }

    getStatusText(status) {
        const texts = {
            'present': 'Present',
            'late': 'Late',
            'absent': 'Absent',
            'in_clinic': 'In Clinic'
        };
        return texts[status] || 'Unknown';
    }

    attachAttendanceEventListeners() {
        // Mark present buttons
        // Note: These selectors might need to be scoped if used in both tabs
        document.querySelectorAll('.mark-present').forEach(button => {
            button.addEventListener('click', (e) => {
                const btn = e.target.closest('button');
                const studentId = btn.getAttribute('data-student-id');
                const hasEntry = btn.getAttribute('data-has-entry') === 'true';
                if (hasEntry) {
                    this.overrideStatus(studentId, 'present');
                } else {
                    this.recordAttendance(studentId, 'present');
                }
            });
        });

        // Mark late buttons
        document.querySelectorAll('.mark-late').forEach(button => {
            button.addEventListener('click', (e) => {
                const btn = e.target.closest('button');
                const studentId = btn.getAttribute('data-student-id');
                const hasEntry = btn.getAttribute('data-has-entry') === 'true';
                if (hasEntry) {
                    this.overrideStatus(studentId, 'late');
                } else {
                    this.recordAttendance(studentId, 'late');
                }
            });
        });

        document.querySelectorAll('.mark-absent').forEach(button => {
            button.addEventListener('click', (e) => {
                const btn = e.target.closest('button');
                const studentId = btn.getAttribute('data-student-id');
                this.overrideStatus(studentId, 'absent');
            });
        });

        // Record exit buttons
        document.querySelectorAll('.record-exit').forEach(button => {
            button.addEventListener('click', (e) => {
                const studentId = e.target.closest('button').getAttribute('data-student-id');
                this.recordExit(studentId);
            });
        });
    }

    async recordAttendance(studentId, status = 'present') {
        try {
            this.showLoading();
            
            const student = this.classStudents.find(s => s.id === studentId);
            if (!student) {
                throw new Error('Student not found');
            }

            await EducareTrack.recordAttendance(studentId, 'entry');
            
            // Update status if late
            if (status === 'late') {
                // Find the attendance record and update it
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                
                const { data: attendanceData, error: attendanceError } = await window.supabaseClient
                    .from('attendance')
                    .select('id')
                    .eq('student_id', studentId)
                    .gte('timestamp', today.toISOString())
                    .limit(1);

                if (attendanceError) throw attendanceError;
                
                if (attendanceData && attendanceData.length > 0) {
                    const { error: updateError } = await window.supabaseClient
                        .from('attendance')
                        .update({ status: 'late' })
                        .eq('id', attendanceData[0].id);
                    
                    if (updateError) throw updateError;
                }
            }

            await this.loadTodayAttendance();
            this.hideLoading();
            this.showNotification(`Attendance recorded for ${student.name}`, 'success');
        } catch (error) {
            console.error('Error recording attendance:', error);
            this.hideLoading();
            this.showNotification('Error recording attendance', 'error');
        }
    }

    async recordExit(studentId) {
        try {
            this.showLoading();
            
            const student = this.classStudents.find(s => s.id === studentId);
            if (!student) {
                throw new Error('Student not found');
            }

            await EducareTrack.recordAttendance(studentId, 'exit');
            await this.loadTodayAttendance();
            this.hideLoading();
            this.showNotification(`Exit recorded for ${student.name}`, 'success');
        } catch (error) {
            console.error('Error recording exit:', error);
            this.hideLoading();
            this.showNotification('Error recording exit', 'error');
        }
    }

    async markAllPresent() {
        try {
            this.showLoading();

            // Check if today is a school day
            const today = new Date();
            const isSchoolDay = window.EducareTrack ? window.EducareTrack.isSchoolDay(today) : true;
            if (!isSchoolDay) {
                if (!confirm('Today is marked as a non-school day (Holiday/Weekend/Break). Are you sure you want to mark all present?')) {
                    this.hideLoading();
                    return;
                }
            }
            
            const absentStudents = this.classStudents.filter(student => {
                const hasEntry = this.todayAttendance.some(record => 
                    record.studentId === student.id && record.entryType === 'entry'
                );
                return !hasEntry;
            });

            for (const student of absentStudents) {
                await EducareTrack.recordAttendance(student.id, 'entry');
            }

            await this.loadTodayAttendance();
            this.hideLoading();
            this.showNotification(`Marked ${absentStudents.length} students as present`, 'success');
        } catch (error) {
            console.error('Error marking all present:', error);
            this.hideLoading();
            this.showNotification('Error marking students as present', 'error');
        }
    }

    async loadAttendanceHistory() {
        try {
            const startDate = document.getElementById('startDate').value;
            const endDate = document.getElementById('endDate').value;

            if (!startDate || !endDate) {
                this.showNotification('Please select both start and end dates', 'error');
                return;
            }

            this.showLoading();

            const start = new Date(startDate);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);

            const { data: attendanceData, error: attendanceError } = await window.supabaseClient
                .from('attendance')
                .select('id,student_id,class_id,timestamp,session,status,remarks,recorded_by,method')
                .eq('class_id', this.currentUser.classId)
                .gte('timestamp', start.toISOString())
                .lte('timestamp', end.toISOString())
                .order('timestamp', { ascending: false });

            if (attendanceError) throw attendanceError;
            
            this.attendanceHistory = (attendanceData || []).map(record => ({
                id: record.id,
                ...record,
                studentId: record.student_id,
                classId: record.class_id,
                entryType: (record.remarks && record.remarks.includes('exit')) ? 'exit' : 'entry',
                timestamp: new Date(record.timestamp),
                time: new Date(record.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
                recordedBy: record.recorded_by,
                recordedByName: null // Field doesn't exist in new schema
            }));
            
            this.renderAttendanceHistory();
            
            this.hideLoading();
        } catch (error) {
            console.error('Error loading attendance history:', error);
            this.hideLoading();
            this.showNotification('Error loading attendance history', 'error');
        }
    }

    renderAttendanceHistory() {
        const container = document.getElementById('attendanceHistory');
        
        if (this.attendanceHistory.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <i class="fas fa-clipboard-list text-2xl mb-2"></i>
                    <p>No attendance records found for the selected period</p>
                </div>
            `;
            return;
        }

        // Group by date
        const groupedByDate = {};
        this.attendanceHistory.forEach(record => {
            if (record.timestamp) {
                const date = record.timestamp.toDateString();
                if (!groupedByDate[date]) {
                    groupedByDate[date] = [];
                }
                groupedByDate[date].push(record);
            }
        });

        container.innerHTML = Object.entries(groupedByDate).map(([date, records]) => `
            <div class="border border-gray-200 rounded-lg">
                <div class="bg-gray-50 px-4 py-3 border-b border-gray-200">
                    <h4 class="font-semibold text-gray-800">${new Date(date).toLocaleDateString('en-US', { 
                        weekday: 'long', 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                    })}</h4>
                </div>
                <div class="p-4 space-y-2">
                    ${records.map(record => `
                        <div class="flex items-center justify-between p-2 hover:bg-gray-50 rounded">
                            <div class="flex items-center space-x-3">
                                <div class="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                                    <i class="fas fa-${record.entryType === 'entry' ? 'sign-in-alt' : 'sign-out-alt'} text-blue-600 text-sm"></i>
                                </div>
                                <div>
                                    <p class="text-sm font-medium">${record.studentName}</p>
                                    <p class="text-xs text-gray-500">${record.time} • ${record.session}</p>
                                </div>
                            </div>
                            <span class="px-2 py-1 rounded-full text-xs font-medium ${this.getStatusBadgeClass(record.status)}">
                                ${this.getStatusText(record.status)}
                            </span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');
    }

    async exportAttendance() {
        try {
            this.showLoading();
            
            const csvContent = this.generateAttendanceCSV();
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            
            link.setAttribute('href', url);
            link.setAttribute('download', `attendance_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            this.hideLoading();
            this.showNotification('Attendance exported successfully', 'success');
        } catch (error) {
            console.error('Error exporting attendance:', error);
            this.hideLoading();
            this.showNotification('Error exporting attendance', 'error');
        }
    }

    generateAttendanceCSV() {
        const headers = ['Date', 'Student Name', 'LRN', 'Time', 'Session', 'Status', 'Entry Type'];
        const rows = this.attendanceHistory.map(record => [
            record.timestamp?.toDate().toISOString().split('T')[0] || 'N/A',
            record.studentName,
            this.classStudents.find(s => s.id === record.studentId)?.lrn || 'N/A',
            record.time,
            record.session,
            record.status,
            record.entryType
        ]);

        return [headers, ...rows].map(row => row.map(field => `"${field}"`).join(',')).join('\n');
    }

    async loadNotificationCount() {
        try {
            const count = await EducareTrack.getUnreadNotificationCount(this.currentUser.id);
            const badge = document.getElementById('notificationCount');
            if (badge) {
                if (count > 0) {
                    badge.textContent = count;
                    badge.classList.remove('hidden');
                } else {
                    badge.classList.add('hidden');
                }
            }
        } catch (error) {
            const badge = document.getElementById('notificationCount');
            if (badge) {
                badge.classList.add('hidden');
            }
        }
    }

    initEventListeners() {
        // Tabs
        const tabDaily = document.getElementById('tabDaily');
        const tabSubject = document.getElementById('tabSubject');
        
        if (tabDaily && tabSubject) {
            tabDaily.addEventListener('click', () => {
                document.getElementById('dailyAttendanceSection').classList.remove('hidden');
                document.getElementById('subjectAttendanceSection').classList.add('hidden');
                tabDaily.classList.add('text-blue-600', 'border-b-2', 'border-blue-600');
                tabDaily.classList.remove('text-gray-500');
                tabSubject.classList.remove('text-blue-600', 'border-b-2', 'border-blue-600');
                tabSubject.classList.add('text-gray-500');
            });

            tabSubject.addEventListener('click', () => {
                document.getElementById('dailyAttendanceSection').classList.add('hidden');
                document.getElementById('subjectAttendanceSection').classList.remove('hidden');
                tabSubject.classList.add('text-blue-600', 'border-b-2', 'border-blue-600');
                tabSubject.classList.remove('text-gray-500');
                tabDaily.classList.remove('text-blue-600', 'border-b-2', 'border-blue-600');
                tabDaily.classList.add('text-gray-500');
                
                if (this.subjects.length === 0) {
                    this.loadTeacherSubjects();
                }
            });
        }

        // Load Subject Button
        const loadSubjectBtn = document.getElementById('loadSubjectBtn');
        if (loadSubjectBtn) {
            loadSubjectBtn.addEventListener('click', () => {
                const subjectSelect = document.getElementById('subjectSelect');
                const scheduleId = subjectSelect.value;
                if (scheduleId) {
                    this.loadSubjectStudents(scheduleId);
                } else {
                    this.showNotification('Please select a subject', 'warning');
                }
            });
        }

        // Save Subject Attendance Button
        const saveSubjectAttendanceBtn = document.getElementById('saveSubjectAttendance');
        if (saveSubjectAttendanceBtn) {
            saveSubjectAttendanceBtn.addEventListener('click', () => {
                this.saveSubjectAttendance();
            });
        }

        // Mark All Subject Present Button
        const subjectMarkAllPresentBtn = document.getElementById('subjectMarkAllPresent');
        if (subjectMarkAllPresentBtn) {
            subjectMarkAllPresentBtn.addEventListener('click', () => {
                this.markAllSubjectPresent();
            });
        }

        // Mark all present
        const markAllPresentBtn = document.getElementById('markAllPresent');
        if (markAllPresentBtn) {
            markAllPresentBtn.addEventListener('click', () => {
                this.markAllPresent();
            });
        }

        // Take attendance (refresh)
        const takeAttendanceBtn = document.getElementById('takeAttendance');
        if (takeAttendanceBtn) {
            takeAttendanceBtn.addEventListener('click', () => {
                this.loadTodayAttendance();
            });
        }

        // Filter history
        const filterHistoryBtn = document.getElementById('filterHistory');
        if (filterHistoryBtn) {
            filterHistoryBtn.addEventListener('click', () => {
                this.loadAttendanceHistory();
            });
        }

        // Export attendance
        const exportBtn = document.getElementById('exportAttendance');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this.exportAttendance();
            });
        }

        // Set default dates for filter
        const today = new Date();
        const oneWeekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        
        const startDateEl = document.getElementById('startDate');
        const endDateEl = document.getElementById('endDate');
        if (startDateEl && endDateEl) {
            startDateEl.value = oneWeekAgo.toISOString().split('T')[0];
            endDateEl.value = today.toISOString().split('T')[0];
        }

        // Sidebar toggle
        const sidebarToggleBtn = document.getElementById('sidebarToggle');
        if (sidebarToggleBtn) {
            sidebarToggleBtn.addEventListener('click', () => {
                this.toggleSidebar();
            });
        }

        // Logout
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                const ok = window.EducareTrack && typeof window.EducareTrack.confirmAction === 'function'
                    ? await window.EducareTrack.confirmAction('Are you sure you want to logout?', 'Confirm Logout', 'Logout', 'Cancel')
                    : true;
                if (ok) {
                    EducareTrack.logout();
                    window.location.href = '../index.html';
                }
            });
        }

        window.addEventListener('educareTrack:newNotifications', () => {
            this.loadNotificationCount();
        });
    }

    toggleSidebar() {
        const sidebar = document.querySelector('.sidebar');
        const mainContent = document.querySelector('.main-content');
        
        if (sidebar.classList.contains('collapsed')) {
            sidebar.classList.remove('collapsed');
            mainContent.classList.remove('ml-16');
            mainContent.classList.add('ml-64');
        } else {
            sidebar.classList.add('collapsed');
            mainContent.classList.remove('ml-64');
            mainContent.classList.add('ml-16');
        }
    }

    async loadTeacherSubjects() {
        try {
            this.showLoading();
            const { data: schedules, error } = await window.supabaseClient
                .from('class_schedules')
                .select('id, class_id, subject, schedule_text, classes(grade, level, strand, section)')
                .eq('teacher_id', this.currentUser.id);

            if (error) throw error;

            this.subjects = schedules || [];
            
            const subjectSelect = document.getElementById('subjectSelect');
            subjectSelect.innerHTML = '<option value="">Select Subject/Class</option>';
            
            this.subjects.forEach(schedule => {
                const className = schedule.classes ? 
                    `${schedule.classes.grade} - ${schedule.classes.level || schedule.classes.strand || schedule.classes.section}` : 
                    'Unknown Class';
                const option = document.createElement('option');
                option.value = schedule.id;
                option.textContent = `${schedule.subject} (${className}) - ${schedule.schedule_text || ''}`;
                subjectSelect.appendChild(option);
            });

            this.hideLoading();
        } catch (error) {
            console.error('Error loading subjects:', error);
            this.hideLoading();
            this.showNotification('Error loading subjects', 'error');
        }
    }

    async loadSubjectStudents(scheduleId) {
        try {
            this.showLoading();
            const schedule = this.subjects.find(s => s.id === scheduleId);
            if (!schedule) throw new Error('Schedule not found');
            
            this.currentSubject = schedule;
            document.getElementById('selectedSubjectTitle').textContent = schedule.subject;
            const className = schedule.classes ? 
                `${schedule.classes.grade} - ${schedule.classes.level || schedule.classes.strand || schedule.classes.section}` : 
                'Unknown Class';
            document.getElementById('selectedSubjectDetails').textContent = `${className} • ${schedule.schedule_text || ''}`;

            // Load students for this class
            this.subjectStudents = await EducareTrack.getStudentsByClass(schedule.class_id);
            
            // Load existing attendance for today if any
            const today = new Date().toISOString().split('T')[0];
            const { data: attendanceData, error } = await window.supabaseClient
                .from('subject_attendance')
                .select('*')
                .eq('schedule_id', scheduleId)
                .eq('date', today);

            if (error) throw error;
            
            this.currentSubjectAttendance = attendanceData || [];
            
            this.renderSubjectAttendanceTable();
            document.getElementById('subjectAttendanceContainer').style.display = 'block';
            
            this.hideLoading();
        } catch (error) {
            console.error('Error loading subject students:', error);
            this.hideLoading();
            this.showNotification('Error loading students', 'error');
        }
    }

    renderSubjectAttendanceTable() {
        const tbody = document.getElementById('subjectAttendanceTableBody');
        
        if (this.subjectStudents.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-4 text-center">No students found in this class</td></tr>';
            return;
        }

        tbody.innerHTML = this.subjectStudents.map(student => {
            const existingRecord = this.currentSubjectAttendance.find(r => r.student_id === student.id);
            const status = existingRecord ? existingRecord.status : '';
            
            return `
                <tr class="hover:bg-gray-50" data-student-id="${student.id}">
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="flex items-center">
                            <div class="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold mr-3">
                                ${(student.name || '?').charAt(0)}
                            </div>
                            <div class="text-sm font-medium text-gray-900">${student.name}</div>
                        </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${student.lrn || 'N/A'}</td>
                    <td class="px-6 py-4 text-center">
                        <input type="radio" name="status_${student.id}" value="present" ${status === 'present' ? 'checked' : ''} class="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300">
                    </td>
                    <td class="px-6 py-4 text-center">
                        <input type="radio" name="status_${student.id}" value="late" ${status === 'late' ? 'checked' : ''} class="h-4 w-4 text-yellow-600 focus:ring-yellow-500 border-gray-300">
                    </td>
                    <td class="px-6 py-4 text-center">
                        <input type="radio" name="status_${student.id}" value="absent" ${status === 'absent' ? 'checked' : ''} class="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300">
                    </td>
                    <td class="px-6 py-4">
                        <input type="text" class="w-full border-gray-300 rounded-md shadow-sm text-sm focus:ring-blue-500 focus:border-blue-500" placeholder="Optional remarks">
                    </td>
                </tr>
            `;
        }).join('');
    }

    markAllSubjectPresent() {
        const radios = document.querySelectorAll('input[type="radio"][value="present"]');
        radios.forEach(radio => radio.checked = true);
    }

    async saveSubjectAttendance() {
        try {
            this.showLoading();
            
            const rows = document.querySelectorAll('#subjectAttendanceTableBody tr');
            const attendanceRecords = [];
            
            rows.forEach(row => {
                const studentId = row.getAttribute('data-student-id');
                const present = row.querySelector(`input[name="status_${studentId}"][value="present"]`).checked;
                const late = row.querySelector(`input[name="status_${studentId}"][value="late"]`).checked;
                const absent = row.querySelector(`input[name="status_${studentId}"][value="absent"]`).checked;
                
                let status = null;
                if (present) status = 'present';
                else if (late) status = 'late';
                else if (absent) status = 'absent';
                
                if (status) {
                    attendanceRecords.push({
                        schedule_id: this.currentSubject.id,
                        student_id: studentId,
                        status: status,
                        date: new Date().toISOString().split('T')[0],
                        recorded_by: this.currentUser.id
                    });
                }
            });

            if (attendanceRecords.length === 0) {
                this.hideLoading();
                this.showNotification('No attendance marked', 'warning');
                return;
            }

            // Upsert records
            const { error } = await window.supabaseClient
                .from('subject_attendance')
                .upsert(attendanceRecords, { onConflict: 'schedule_id, student_id, date' });

            if (error) throw error;

            this.hideLoading();
            this.showNotification('Subject attendance saved successfully', 'success');
            
            // Refresh data
            this.loadSubjectStudents(this.currentSubject.id);

        } catch (error) {
            console.error('Error saving subject attendance:', error);
            this.hideLoading();
            this.showNotification('Error saving attendance', 'error');
        }
    }

    showLoading() {
        document.getElementById('loadingSpinner').classList.remove('hidden');
    }

    hideLoading() {
        document.getElementById('loadingSpinner').classList.add('hidden');
    }

    showNotification(message, type = 'info') {
        if (window.EducareTrack && typeof window.EducareTrack.showNormalNotification === 'function') {
            window.EducareTrack.showNormalNotification({ title: type === 'error' ? 'Error' : 'Info', message, type });
        }
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    window.teacherAttendance = new TeacherAttendance();
});
