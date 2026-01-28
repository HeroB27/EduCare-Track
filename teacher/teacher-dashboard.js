// Teacher Dashboard JavaScript
// Handles all dashboard functionality including real-time status, charts, and manual overrides

class TeacherDashboard {
    constructor() {
        this.currentUser = null;
        this.assignedClass = null;
        this.classStudents = [];
        this.attendanceChart = null;
        this.teacherClinicChart = null;
        this.chartDays = 7;
        this.notifications = [];
        this.realTimeListeners = [];
        this.pollTimer = null;
        this.init();
    }

    async init() {
        try {
            this.showLoading();
            
            // Wait for EducareTrack to be ready
            if (!window.EducareTrack) {
                setTimeout(() => this.init(), 100);
                return;
            }

            // Check if user is logged in
            const savedUser = localStorage.getItem('educareTrack_user');
            if (!savedUser) {
                window.location.href = '../index.html';
                return;
            }

            this.currentUser = JSON.parse(savedUser);
            
            if (this.currentUser.role !== 'teacher') {
                window.location.href = `../${this.currentUser.role}/${this.currentUser.role}-dashboard.html`;
                return;
            }

            // Hide Gatekeeper Link if not authorized
            const gatekeeperLink = document.getElementById('navGatekeeperLink');
            if (gatekeeperLink && !this.currentUser.is_gatekeeper) {
                gatekeeperLink.style.display = 'none';
            }

            this.updateUI();
            await this.loadTeacherData();
            this.initEventListeners();
            this.initCharts();
            this.setupRealTimeListeners();
            
            this.hideLoading();
        } catch (error) {
            console.error('Teacher dashboard initialization failed:', error);
            this.hideLoading();
        }
    }

    updateUI() {
        const userNameEl = document.getElementById('userName');
        if (userNameEl) userNameEl.textContent = this.currentUser.name;
        
        const userRoleEl = document.getElementById('userRole');
        if (userRoleEl) userRoleEl.textContent = this.currentUser.role;
        
        const userInitialsEl = document.getElementById('userInitials');
        if (userInitialsEl) {
            userInitialsEl.textContent = this.currentUser.name
                .split(' ')
                .map(n => n[0])
                .join('')
                .substring(0, 2)
                .toUpperCase();
        }

        const assignedClassEl = document.getElementById('assignedClass');
        if (assignedClassEl) {
            if (this.currentUser.classId) {
                assignedClassEl.textContent = this.currentUser.className || 'Class ' + this.currentUser.classId;
            } else {
                assignedClassEl.textContent = 'No assigned class';
            }
        }

        this.updateCurrentTime();
        setInterval(() => this.updateCurrentTime(), 60000);
    }

    updateCurrentTime() {
        const timeEl = document.getElementById('currentTime');
        if (timeEl) {
            const now = new Date();
            timeEl.textContent = now.toLocaleString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
    }

    async loadTeacherData() {
        try {
            if (!window.EducareTrack) {
                console.error('EducareTrack not available');
                return;
            }

            // Load assigned class information from classes table where adviser_id = teacher id
            // Only if classId is not already set or we want to refresh it
            const { data: classData, error: classError } = await window.supabaseClient
                .from('classes')
                .select('*')
                .eq('adviser_id', this.currentUser.id)
                .eq('is_active', true)
                .single();
            
            if (!classError && classData) {
                this.assignedClass = classData;
                this.currentUser.classId = classData.id;
                this.currentUser.className = `${classData.grade} - ${classData.level || classData.strand || 'Class'}`;
                // Update local storage with new class info
                localStorage.setItem('educareTrack_user', JSON.stringify(this.currentUser));
                this.updateUI(); // Refresh UI with class name
            }

            // Load class students
            await this.loadClassStudents();

            // Load dashboard stats
            await this.loadDashboardStats();

            // Load recent activity
            await this.loadRecentActivity();

            // Load notifications
            await this.loadNotifications();

        } catch (error) {
            console.error('Error loading teacher data:', error);
        }
    }

    async loadClassStudents() {
        try {
            if (!this.currentUser.classId) {
                console.warn('Teacher has no assigned class');
                this.classStudents = [];
                return;
            }
            this.classStudents = await EducareTrack.getStudentsByClass(this.currentUser.classId);
            // Initial status update (will be refined by loadDashboardStats)
            this.updateStudentStatus();
        } catch (error) {
            console.error('Error loading class students:', error);
            this.classStudents = [];
        }
    }

    async loadDashboardStats() {
        try {
            if (!this.currentUser.classId) {
                return;
            }
            
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Get today's attendance
            const { data: attendanceData, error: attendanceError } = await window.supabaseClient
                .from('attendance')
                .select('*')
                .eq('class_id', this.currentUser.classId)
                .gte('timestamp', today.toISOString());

            if (attendanceError) throw attendanceError;

            const presentStudents = new Set();
            const lateStudents = new Set();
            const clinicStudents = new Set();

            (attendanceData || []).forEach(record => {
                if (record.status === 'late') {
                    lateStudents.add(record.student_id);
                } else if (record.status === 'present') {
                    presentStudents.add(record.student_id);
                }
            });

            // Get current clinic visits (active)
            const classStudentIds = this.classStudents.map(s => s.id);
            if (classStudentIds.length > 0) {
                const { data: clinicData, error: clinicError } = await window.supabaseClient
                    .from('clinic_visits')
                    .select('student_id')
                    .in('student_id', classStudentIds)
                    .eq('status', 'in_clinic');

                if (!clinicError) {
                    (clinicData || []).forEach(visit => {
                        clinicStudents.add(visit.student_id);
                    });
                }
            }

            // Update Stats UI
            const totalEl = document.getElementById('totalStudents');
            const presentEl = document.getElementById('presentStudents');
            const lateEl = document.getElementById('lateStudents');
            const clinicEl = document.getElementById('clinicStudents');

            if (totalEl) totalEl.textContent = this.classStudents.length;
            if (presentEl) presentEl.textContent = presentStudents.size;
            if (lateEl) lateEl.textContent = lateStudents.size;
            if (clinicEl) clinicEl.textContent = clinicStudents.size;

            // Load real-time status table which also updates the summary counts
            await this.loadRealTimeStudentStatus(attendanceData, clinicStudents);

        } catch (error) {
            console.error('Error loading dashboard stats:', error);
        }
    }

    updateStudentStatus() {
        // This is now largely handled by loadRealTimeStudentStatus
        // But we keep this for initial render if needed
        const inClassCount = this.classStudents.filter(s => s.currentStatus === 'in_school').length;
        const inClinicCount = this.classStudents.filter(s => s.currentStatus === 'in_clinic').length;
        const absentCount = this.classStudents.filter(s => s.currentStatus === 'out_school').length; // Default
        
        const inClassEl = document.getElementById('inClassCount');
        const inClinicEl = document.getElementById('inClinicCount');
        const absentEl = document.getElementById('absentCount');
        const totalStatusEl = document.getElementById('totalStatusCount');

        if (inClassEl) inClassEl.textContent = inClassCount;
        if (inClinicEl) inClinicEl.textContent = inClinicCount;
        if (absentEl) absentEl.textContent = absentCount;
        if (totalStatusEl) totalStatusEl.textContent = this.classStudents.length;
    }

    async loadRealTimeStudentStatus(preloadedAttendance = null, preloadedClinicSet = null) {
        try {
            const tbody = document.getElementById('studentStatusTableBody');
            if (!tbody) return;

            if (!this.classStudents || this.classStudents.length === 0) {
                await this.loadClassStudents();
            }

            if (!this.classStudents || this.classStudents.length === 0) {
                 tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-sm text-gray-500">No students found</td></tr>';
                 return;
            }

            let attendanceData = preloadedAttendance;
            let clinicSet = preloadedClinicSet;

            if (!attendanceData || !clinicSet) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                
                const { data: att } = await window.supabaseClient
                    .from('attendance')
                    .select('*')
                    .gte('timestamp', today.toISOString())
                    .eq('class_id', this.currentUser.classId);
                attendanceData = att;

                const { data: clin } = await window.supabaseClient
                    .from('clinic_visits')
                    .select('student_id')
                    .eq('status', 'in_clinic');
                
                clinicSet = new Set((clin || []).map(v => v.student_id));
            }

            const attendanceMap = new Map();
            (attendanceData || []).forEach(r => {
                if (!attendanceMap.has(r.student_id) || new Date(r.timestamp) > new Date(attendanceMap.get(r.student_id).timestamp)) {
                    attendanceMap.set(r.student_id, r);
                }
            });

            // Counters for the summary box
            let inClass = 0;
            let inClinic = 0;
            let late = 0;
            let absent = 0;

            const tableContent = this.classStudents.map(student => {
                const att = attendanceMap.get(student.id);
                const isClinic = clinicSet.has(student.id);
                
                let status = 'absent';
                let statusClass = 'status-absent';
                let timeIn = '-';
                let timeOut = '-';

                if (isClinic) {
                    status = 'in_clinic';
                    statusClass = 'status-clinic';
                    inClinic++;
                } else if (att) {
                    status = att.status; // present, late
                    
                    if (status === 'present') {
                        statusClass = 'status-present';
                        inClass++;
                    } else if (status === 'late') {
                        statusClass = 'status-late';
                        late++;
                        inClass++; // Late students are still in class
                    }
                    
                    // Check for exit
                    const isExit = att.remarks && att.remarks.includes('exit');
                    
                    if (att.status === 'present' || att.status === 'late') {
                         timeIn = new Date(att.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    }
                    
                    if (isExit) {
                         timeOut = new Date(att.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                         status = 'out_school';
                         // Adjust counters: remove from inClass
                         inClass--; 
                         // Note: they are not "absent", they are "out". But for summary we might group them.
                    }
                } else {
                    absent++;
                }

                student.currentStatus = status;

                return `
                    <tr class="hover:bg-gray-50 student-row" data-student-name="${(student.full_name || student.name).toLowerCase()}" data-status="${status}">
                        <td class="px-6 py-4 whitespace-nowrap">
                            <div class="flex items-center">
                                <div class="h-10 w-10 flex-shrink-0">
                                    <div class="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-bold">
                                        ${(student.full_name || student.name || '?').charAt(0)}
                                    </div>
                                </div>
                                <div class="ml-4">
                                    <div class="text-sm font-medium text-gray-900">${student.full_name || student.name}</div>
                                    <div class="text-sm text-gray-500">${student.id}</div>
                                </div>
                            </div>
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap">
                            <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusClass}">
                                ${status.replace('_', ' ').toUpperCase()}
                            </span>
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${timeIn}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${timeOut}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <button onclick="window.teacherDashboard.openManualOverrideModal('${student.id}', '${student.full_name || student.name}')" class="text-blue-600 hover:text-blue-900 mr-3">Override</button>
                            <button onclick="window.teacherDashboard.openClinicPassModal('${student.id}')" class="text-red-600 hover:text-red-900">Clinic Pass</button>
                        </td>
                    </tr>
                `;
            }).join('');
            
            tbody.innerHTML = tableContent;
            this.filterStudentStatus();

            // Update Summary Counts
            const inClassEl = document.getElementById('inClassCount');
            const inClinicEl = document.getElementById('inClinicCount');
            const absentEl = document.getElementById('absentCount');
            const lateEl = document.getElementById('lateCount');
            const totalStatusEl = document.getElementById('totalStatusCount');

            if (inClassEl) inClassEl.textContent = inClass;
            if (inClinicEl) inClinicEl.textContent = inClinic;
            if (absentEl) absentEl.textContent = absent;
            if (lateEl) lateEl.textContent = late;
            if (totalStatusEl) totalStatusEl.textContent = this.classStudents.length;

        } catch (error) {
            console.error('Error loading real-time student status:', error);
        }
    }

    filterStudentStatus() {
        const searchText = document.getElementById('statusSearch')?.value.toLowerCase() || '';
        const statusFilter = document.getElementById('statusFilter')?.value || 'all';
        
        const rows = document.querySelectorAll('.student-row');
        rows.forEach(row => {
            const name = row.getAttribute('data-student-name');
            const status = row.getAttribute('data-status');
            
            const matchesSearch = name.includes(searchText);
            const matchesStatus = statusFilter === 'all' || status === statusFilter;
            
            if (matchesSearch && matchesStatus) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    }

    openManualOverrideModal(studentId, studentName) {
        document.getElementById('overrideStudentId').value = studentId;
        document.getElementById('overrideStudentName').value = studentName;
        const modal = document.getElementById('manualOverrideModal');
        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }
    }

    closeManualOverrideModal() {
        const modal = document.getElementById('manualOverrideModal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
        const form = document.getElementById('manualOverrideForm');
        if (form) form.reset();
    }

    async handleManualOverrideSubmit(e) {
        e.preventDefault();
        try {
            this.showLoading();
            
            const studentId = document.getElementById('overrideStudentId').value;
            const status = document.getElementById('overrideStatus').value;
            const timeIn = document.getElementById('overrideTimeIn').value;
            const timeOut = document.getElementById('overrideTimeOut').value;
            const remarks = document.getElementById('overrideRemarks').value;
            
            const now = new Date();
            const dateStr = now.toISOString().split('T')[0];
            
            // If Time In provided, insert entry record
            if (timeIn) {
                const dateTimeIn = new Date(`${dateStr}T${timeIn}:00`);
                await window.supabaseClient.from('attendance').insert({
                    student_id: studentId,
                    class_id: this.currentUser.classId,
                    timestamp: dateTimeIn.toISOString(),
                    status: status === 'late' ? 'late' : 'present',
                    session: dateTimeIn.getHours() < 12 ? 'AM' : 'PM',
                    remarks: remarks || 'Manual Override Entry',
                    recorded_by: this.currentUser.id
                });
            }
            
            // If Time Out provided, insert exit record
            if (timeOut) {
                const dateTimeOut = new Date(`${dateStr}T${timeOut}:00`);
                await window.supabaseClient.from('attendance').insert({
                    student_id: studentId,
                    class_id: this.currentUser.classId,
                    timestamp: dateTimeOut.toISOString(),
                    status: 'present',
                    session: dateTimeOut.getHours() < 12 ? 'AM' : 'PM',
                    remarks: (remarks ? remarks + ' ' : '') + 'exit',
                    recorded_by: this.currentUser.id
                });
            }
            
            // If only status change (no time), just insert a record with current time
            if (!timeIn && !timeOut) {
                 await window.supabaseClient.from('attendance').insert({
                    student_id: studentId,
                    class_id: this.currentUser.classId,
                    timestamp: now.toISOString(),
                    status: status,
                    session: now.getHours() < 12 ? 'AM' : 'PM',
                    remarks: remarks || 'Manual Override Status Update',
                    recorded_by: this.currentUser.id
                });
            }

            this.hideLoading();
            this.closeManualOverrideModal();
            this.showNotification('Attendance updated successfully', 'success');
            
            await this.refreshDashboardStats();

        } catch (error) {
            console.error('Error submitting manual override:', error);
            this.hideLoading();
            this.showNotification('Error updating attendance', 'error');
        }
    }

    // Clinic Pass Methods
    openClinicPassModal(studentId = null) {
        const modal = document.getElementById('clinicPassModal');
        const select = document.getElementById('clinicStudentId');
        
        // Populate student select
        select.innerHTML = '<option value="">Select Student</option>' + 
            this.classStudents.map(s => 
                `<option value="${s.id}" ${s.id === studentId ? 'selected' : ''}>${s.full_name || s.name}</option>`
            ).join('');

        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }
    }

    closeClinicPassModal() {
        const modal = document.getElementById('clinicPassModal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
        document.getElementById('clinicPassForm').reset();
    }

    async submitClinicPass() {
        try {
            const studentId = document.getElementById('clinicStudentId').value;
            const reason = document.getElementById('clinicReason').value;
            const notes = document.getElementById('clinicNotes').value;

            if (!studentId || !reason) {
                this.showNotification('Please select student and reason', 'error');
                return;
            }

            this.showLoading();

            const { error } = await window.supabaseClient.from('clinic_visits').insert({
                    student_id: studentId,
                    teacher_id: this.currentUser.id,
                    reason: reason,
                    notes: notes,
                    outcome: 'referred', // Initial status
                    visit_time: new Date().toISOString()
                });

                if (error) throw error;

                // Update student status
                await window.supabaseClient.from('students')
                    .update({ current_status: 'sent_to_clinic' })
                    .eq('id', studentId);

            // Notify Nurse
            const studentName = this.getStudentName(studentId);
            const { data: nurses } = await window.supabaseClient
                .from('profiles')
                .select('id')
                .eq('role', 'nurse');
            
            if (nurses && nurses.length > 0) {
                await window.supabaseClient.from('notifications').insert({
                    target_users: nurses.map(n => n.id),
                    title: 'New Clinic Pass',
                    message: `${studentName} sent to clinic for ${reason}. Notes: ${notes}`,
                    type: 'clinic',
                    student_id: studentId
                });
            }

            this.hideLoading();
            this.closeClinicPassModal();
            this.showNotification('Clinic pass created and nurse notified', 'success');
            this.refreshDashboardStats();

        } catch (error) {
            console.error('Error creating clinic pass:', error);
            this.hideLoading();
            this.showNotification('Error creating clinic pass', 'error');
        }
    }

    // Notifications
    async loadNotifications() {
        try {
            if (!this.currentUser) return;

            const notifications = await EducareTrack.getNotificationsForUser(this.currentUser.id, true, 10);
            const unreadCount = notifications.filter(n => 
                !n.readBy || !n.readBy.includes(this.currentUser.id)
            ).length;

            const badge = document.getElementById('notificationCount');
            if (badge) {
                if (unreadCount > 0) {
                    badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
                    badge.classList.remove('hidden');
                } else {
                    badge.classList.add('hidden');
                }
            }

            this.notifications = notifications;
        } catch (error) {
            console.error('Error loading notifications:', error);
        }
    }

    showNotifications() {
        const modal = document.getElementById('notificationsModal');
        const list = document.getElementById('notificationsList');
        if (!modal || !list) return;

        if (this.notifications.length === 0) {
            list.innerHTML = '<div class="p-4 text-center text-gray-500">No notifications</div>';
        } else {
            list.innerHTML = this.notifications.map(n => `
                <div class="p-4 border-b hover:bg-gray-50 ${(!n.readBy || !n.readBy.includes(this.currentUser.id)) ? 'bg-blue-50' : ''}">
                    <div class="flex justify-between items-start">
                        <h4 class="font-semibold text-gray-800">${n.title}</h4>
                        <span class="text-xs text-gray-500">${new Date(n.timestamp).toLocaleDateString()}</span>
                    </div>
                    <p class="text-sm text-gray-600 mt-1">${n.message}</p>
                </div>
            `).join('');
        }

        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    hideNotifications() {
        const modal = document.getElementById('notificationsModal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
    }

    async markAllNotificationsRead() {
        try {
            await EducareTrack.markAllNotificationsAsRead(this.currentUser.id);
            this.loadNotifications();
            this.hideNotifications();
            this.showNotification('All notifications marked as read', 'success');
        } catch (error) {
            console.error('Error marking notifications:', error);
        }
    }

    // Recent Activity
    async loadRecentActivity() {
        try {
            if (!this.currentUser.classId) return;
            
            let attendanceActivities = [];
            let clinicActivities = [];
            
            const classId = this.currentUser.classId;
            
            // Parallel fetch
            const [attRes, clinRes] = await Promise.all([
                window.supabaseClient.from('attendance')
                    .select('id,student_id,status,remarks,timestamp,session')
                    .eq('class_id', classId)
                    .order('timestamp', { ascending: false })
                    .limit(10),
                window.supabaseClient.from('clinic_visits')
                    .select('id,student_id,reason,outcome,visit_time')
                    .order('visit_time', { ascending: false })
                    .limit(10)
            ]);

            const nameById = new Map(this.classStudents.map(s => [s.id, s.full_name || s.name]));
            const classStudentIds = new Set(this.classStudents.map(s => s.id));

            if (attRes.data) {
                attendanceActivities = attRes.data.map(r => ({
                    id: r.id,
                    type: 'attendance',
                    studentId: r.student_id,
                    entryType: (r.remarks && r.remarks.includes('exit')) ? 'exit' : 'entry',
                    timestamp: new Date(r.timestamp),
                    time: new Date(r.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
                    status: r.status,
                    studentName: nameById.get(r.student_id) || 'Student'
                }));
            }

            if (clinRes.data) {
                clinicActivities = clinRes.data
                    .filter(r => classStudentIds.has(r.student_id)) // Only show students from this class
                    .map(r => ({
                    id: r.id,
                    type: 'clinic',
                    studentId: r.student_id,
                    timestamp: new Date(r.visit_time),
                    reason: r.reason,
                    outcome: r.outcome,
                    studentName: nameById.get(r.student_id) || 'Student'
                }));
            }

            const allActivities = [...attendanceActivities, ...clinicActivities]
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, 10);

            const container = document.getElementById('recentActivity');
            if (!container) return;

            if (allActivities.length === 0) {
                container.innerHTML = `
                    <div class="text-center py-4 text-gray-500">
                        <i class="fas fa-inbox text-2xl mb-2"></i>
                        <p>No recent activity</p>
                    </div>`;
                return;
            }

            container.innerHTML = allActivities.map(item => {
                if (item.type === 'attendance') {
                    const icon = item.entryType === 'entry' ? 'fa-sign-in-alt' : 'fa-sign-out-alt';
                    const color = item.status === 'late' ? 'text-yellow-600 bg-yellow-100' : 
                                  item.status === 'absent' ? 'text-red-600 bg-red-100' : 'text-green-600 bg-green-100';
                    return `
                        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div class="flex items-center">
                                <div class="w-8 h-8 ${color} rounded-full flex items-center justify-center mr-3">
                                    <i class="fas ${icon} text-sm"></i>
                                </div>
                                <div>
                                    <p class="text-sm font-medium">${item.studentName}</p>
                                    <p class="text-xs text-gray-500">${item.status === 'late' ? 'Late Arrival' : (item.entryType === 'entry' ? 'Arrived' : 'Left')}</p>
                                </div>
                            </div>
                            <span class="text-xs text-gray-500">${this.formatTime(item.timestamp)}</span>
                        </div>`;
                } else {
                    return `
                        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div class="flex items-center">
                                <div class="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mr-3">
                                    <i class="fas fa-clinic-medical text-sm"></i>
                                </div>
                                <div>
                                    <p class="text-sm font-medium">${item.studentName}</p>
                                    <p class="text-xs text-gray-500">Clinic: ${item.reason}</p>
                                </div>
                            </div>
                            <span class="text-xs text-gray-500">${this.formatTime(item.timestamp)}</span>
                        </div>`;
                }
            }).join('');

        } catch (error) {
            console.error('Error loading recent activity:', error);
        }
    }

    formatTime(date) {
        if (!date) return 'N/A';
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffMins < 1440) return `${Math.floor(diffMins/60)}h ago`;
        return date.toLocaleDateString();
    }

    setupRealTimeListeners() {
        // Keep polling as a backup and for clock updates
        if (this.pollTimer) clearInterval(this.pollTimer);
        this.pollTimer = setInterval(() => {
            this.updateCurrentTime();
            // Occasional consistency check
            this.refreshDashboardStats();
        }, 60000); // 1 minute poll

        // Setup Realtime Subscription
        if (window.supabaseClient) {
            // Clean up existing subscription if any
            if (this.realtimeChannel) {
                window.supabaseClient.removeChannel(this.realtimeChannel);
            }

            this.realtimeChannel = window.supabaseClient.channel('teacher_dashboard_realtime');
            
            // Listen for Attendance Changes (INSERT and UPDATE)
            this.realtimeChannel.on('postgres_changes', {
                event: '*', 
                schema: 'public',
                table: 'attendance'
            }, (payload) => {
                if (!this.currentUser.classId) return;
                
                const record = payload.new;
                // Check if the record belongs to this class
                // Note: payload.new.class_id might be string or number, compare loosely
                if (record && record.class_id == this.currentUser.classId) {
                    console.log('Realtime attendance update received:', record);
                    
                    // Refresh stats and table immediately
                    this.refreshDashboardStats();
                    this.loadRecentActivity();
                    
                    // Show notification if it's a new entry
                    if (payload.eventType === 'INSERT') {
                        const studentName = this.getStudentName(record.student_id);
                        const status = record.status;
                        const type = (record.remarks && record.remarks.includes('exit')) ? 'Departure' : 'Arrival';
                        this.showNotification(`${type}: ${studentName} (${status})`, 'info');
                    }
                }
            });

            // Listen for Notifications
            this.realtimeChannel.on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'notifications'
            }, (payload) => {
                const notif = payload.new;
                // Check if notification targets this user
                if (notif && notif.target_users && notif.target_users.includes(this.currentUser.id)) {
                    console.log('Realtime notification received:', notif);
                    this.loadNotifications();
                    this.showNotification(notif.title, 'info');
                }
            });

            // Listen for Clinic Visit Changes (INSERT and UPDATE)
            this.realtimeChannel.on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'clinic_visits'
            }, (payload) => {
                const record = payload.new;
                // Check if this clinic visit is for a student in this class
                if (record && this.classStudents && this.classStudents.some(s => s.id === record.student_id)) {
                    console.log('Realtime clinic update received:', record);
                    this.refreshDashboardStats();
                    this.loadRecentActivity();
                    
                    if (payload.eventType === 'INSERT') {
                         const studentName = this.getStudentName(record.student_id);
                         this.showNotification(`New Clinic Visit: ${studentName} - ${record.reason}`, 'info');
                    } else if (payload.eventType === 'UPDATE' && record.status !== 'in_clinic') {
                         const studentName = this.getStudentName(record.student_id);
                         this.showNotification(`Clinic Update: ${studentName} - ${record.outcome}`, 'info');
                    }
                }
            });

            this.realtimeChannel.subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('Teacher dashboard connected to realtime updates');
                }
            });
        }
    }

    getStudentName(id) {
        if (!this.classStudents) return 'Student';
        const student = this.classStudents.find(s => s.id == id);
        return student ? (student.full_name || student.name) : 'Student';
    }

    async refreshDashboardStats() {
        await this.loadDashboardStats();
    }

    showNotification(message, type = 'info') {
        const modal = document.getElementById('inlineNotificationModal');
        const titleEl = document.getElementById('inlineNotificationTitle');
        const msgEl = document.getElementById('inlineNotificationMessage');
        
        if (modal && titleEl && msgEl) {
            titleEl.textContent = type === 'error' ? 'Error' : (type === 'success' ? 'Success' : 'Info');
            msgEl.textContent = message;
            modal.classList.remove('hidden');
            setTimeout(() => {
                modal.classList.add('hidden');
            }, 3000);
        } else {
            alert(message);
        }
    }

    showLoading() {
        const spinner = document.getElementById('loadingSpinner');
        if (spinner) spinner.classList.remove('hidden');
    }

    hideLoading() {
        const spinner = document.getElementById('loadingSpinner');
        if (spinner) spinner.classList.add('hidden');
    }

    initEventListeners() {
        // Status Search and Filter
        const searchInput = document.getElementById('statusSearch');
        if (searchInput) {
            searchInput.addEventListener('input', () => this.filterStudentStatus());
        }
        
        const filterInput = document.getElementById('statusFilter');
        if (filterInput) {
            filterInput.addEventListener('change', () => this.filterStudentStatus());
        }

        // Manual Override Form
        const overrideForm = document.getElementById('manualOverrideForm');
        if (overrideForm) {
            overrideForm.addEventListener('submit', (e) => this.handleManualOverrideSubmit(e));
        }

        // Clinic Pass Form
        const clinicForm = document.getElementById('clinicPassForm');
        if (clinicForm) {
            clinicForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.submitClinicPass();
            });
        }
        
        // Clinic Reason Toggle
        const clinicReason = document.getElementById('clinicReason');
        if (clinicReason) {
            clinicReason.addEventListener('change', (e) => {
                const otherDiv = document.getElementById('clinicOtherReasonDiv');
                if (otherDiv) {
                    if (e.target.value === 'other') {
                        otherDiv.classList.remove('hidden');
                    } else {
                        otherDiv.classList.add('hidden');
                    }
                }
            });
        }

        // Sidebar toggle
        const toggle = document.getElementById('sidebarToggle');
        if (toggle) {
            toggle.addEventListener('click', () => {
                const sidebar = document.querySelector('.sidebar');
                if (sidebar) sidebar.classList.toggle('collapsed');
                const main = document.querySelector('.main-content');
                if (main) main.classList.toggle('ml-64');
                if (main) main.classList.toggle('ml-20');
            });
        }

        // Logout
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                if (confirm('Are you sure you want to logout?')) {
                    localStorage.removeItem('educareTrack_user');
                    window.location.href = '../index.html';
                }
            });
        }

        // Notifications
        const notifBtn = document.getElementById('notificationsBtn');
        if (notifBtn) {
            notifBtn.addEventListener('click', () => this.showNotifications());
        }
    }

    initCharts() {
        const el = document.getElementById('attendanceChart');
        if (!el) return;
        const ctx = el.getContext('2d');
        this.attendanceChart = new Chart(ctx, {
            type: 'line',
            data: { labels: [], datasets: [] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true } },
                plugins: { legend: { display: true } }
            }
        });
        this.loadAttendanceTrend(this.chartDays);
        
        // Clinic reasons chart
        const clinicEl = document.getElementById('teacherClinicReasonsChart');
        if (clinicEl) {
            const cctx = clinicEl.getContext('2d');
            this.teacherClinicChart = new Chart(cctx, {
                type: 'bar',
                data: { labels: [], datasets: [{ label: 'Visits', data: [], backgroundColor: '#3B82F6' }] },
                options: { responsive: true, maintainAspectRatio: false }
            });
            this.loadClinicReasonsTrend(7);
        }
        
        const rangeEl = document.getElementById('chartTimeRange');
        if (rangeEl) {
            rangeEl.addEventListener('change', (e) => {
                this.chartDays = parseInt(e.target.value);
                this.loadAttendanceTrend(this.chartDays);
            });
        }
        
        this.loadTopLateStudents(14);
    }

    async loadAttendanceTrend(days) {
        if (!this.currentUser?.classId || !this.attendanceChart) return;
        const end = new Date();
        const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
        const trend = await EducareTrack.getClassAttendanceTrend(this.currentUser.classId, start, end);
        
        this.attendanceChart.data.labels = trend.labels;
        this.attendanceChart.data.datasets = [
            { label: 'Present', data: trend.datasets.present, borderColor: '#10B981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true },
            { label: 'Late', data: trend.datasets.late, borderColor: '#F59E0B', backgroundColor: 'rgba(245, 158, 11, 0.1)', fill: true },
            { label: 'Absent', data: trend.datasets.absent, borderColor: '#EF4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', fill: true }
        ];
        this.attendanceChart.update();
    }

    async loadClinicReasonsTrend(days) {
        if (!this.currentUser?.classId || !this.teacherClinicChart) return;
        const end = new Date();
        const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
        const trend = await EducareTrack.getClassClinicReasonTrend(this.currentUser.classId, start, end);
        
        this.teacherClinicChart.data.labels = trend.labels;
        this.teacherClinicChart.data.datasets[0].data = trend.counts;
        this.teacherClinicChart.update();
    }

    async loadTopLateStudents(days) {
        if (!this.currentUser?.classId) return;
        const end = new Date();
        const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
        const leaders = await EducareTrack.getClassLateLeaders(this.currentUser.classId, start, end, 5);
        
        const container = document.getElementById('topLateList');
        if (!container) return;
        
        if (leaders.length === 0) {
            container.innerHTML = '<div class="text-gray-500 text-sm">No late arrivals</div>';
            return;
        }

        container.innerHTML = leaders.map((l, idx) => `
            <div class="flex items-center justify-between">
                <div class="flex items-center">
                    <div class="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center mr-3">
                        <span class="text-yellow-700 text-xs font-semibold">${idx + 1}</span>
                    </div>
                    <div>
                        <div class="text-sm font-medium text-gray-800">${l.studentName}</div>
                        <div class="text-xs text-gray-500">${l.studentId}</div>
                    </div>
                </div>
                <span class="px-2 py-1 text-xs rounded bg-yellow-100 text-yellow-700">${l.lateCount} late</span>
            </div>
        `).join('');
    }
}

// Initialize
window.teacherDashboard = new TeacherDashboard();
