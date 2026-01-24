// Teacher Dashboard JavaScript - Standalone file
class TeacherDashboard {
    constructor() {
        this.currentUser = null;
        this.assignedClass = null;
        this.classStudents = [];
        this.attendanceChart = null;
        this.chartDays = 7;
        this.notifications = [];
        this.realTimeListeners = [];
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
    }

    async loadTeacherData() {
        try {
            if (!window.EducareTrack) {
                console.error('EducareTrack not available');
                return;
            }

            // Load assigned class information
            if (this.currentUser.classId) {
                this.assignedClass = await EducareTrack.getClassById(this.currentUser.classId);
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
            this.classStudents = await EducareTrack.getStudentsByClass(this.currentUser.classId);
            this.updateStudentStatus();
        } catch (error) {
            console.error('Error loading class students:', error);
        }
    }

    async loadDashboardStats() {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Get today's attendance
            const { data: attendanceData, error: attendanceError } = await window.supabaseClient
                .from('attendance')
                .select('student_id,status,entry_type')
                .gte('timestamp', today.toISOString())
                .eq('class_id', this.currentUser.classId);

            if (attendanceError) throw attendanceError;

            const presentStudents = new Set();
            const lateStudents = new Set();
            const clinicStudents = new Set();

            (attendanceData || []).forEach(record => {
                if (record.entry_type === 'entry') {
                    if (record.status === 'late') {
                        lateStudents.add(record.student_id);
                    } else if (record.status === 'present') {
                        presentStudents.add(record.student_id);
                    }
                }
            });

            // Get current clinic visits
            const { data: clinicData, error: clinicError } = await window.supabaseClient
                .from('clinic_visits')
                .select('student_id')
                .eq('check_in', true)
                .eq('class_id', this.currentUser.classId);

            if (clinicError) throw clinicError;

            (clinicData || []).forEach(visit => {
                clinicStudents.add(visit.student_id);
            });

            // Cache late count for status card update
            this.lateStudentsCount = lateStudents.size;

            // Update UI
            document.getElementById('totalStudents').textContent = this.classStudents.length;
            document.getElementById('presentStudents').textContent = presentStudents.size;
            document.getElementById('lateStudents').textContent = lateStudents.size;
            document.getElementById('clinicStudents').textContent = clinicStudents.size;

        } catch (error) {
            console.error('Error loading dashboard stats:', error);
        }
    }

    updateStudentStatus() {
        // Check if today is a school day for this class level
        const today = new Date();
        const isSchoolDay = window.EducareTrack.isSchoolDay(today, this.assignedClass?.level);

        const inClassCount = this.classStudents.filter(s => s.currentStatus === 'in_school').length;
        const inClinicCount = this.classStudents.filter(s => s.currentStatus === 'in_clinic').length;
        
        // If not a school day, absent count is 0 (or we could show "No Class")
        // If it is a school day, anyone out_school is absent
        const absentCount = isSchoolDay ? this.classStudents.filter(s => s.currentStatus === 'out_school').length : 0;
        
        // Count late students from today's attendance
        today.setHours(0, 0, 0, 0);
        
        const lateCount = this.lateStudentsCount || 0;

        document.getElementById('inClassCount').textContent = inClassCount;
        document.getElementById('inClinicCount').textContent = inClinicCount;
        document.getElementById('absentCount').textContent = isSchoolDay ? absentCount : '-';
        document.getElementById('lateCount').textContent = lateCount;
        document.getElementById('totalStatusCount').textContent = this.classStudents.length;

        // Optional: Update label if not school day
        const absentLabel = document.getElementById('absentLabel');
        if (absentLabel) {
            absentLabel.textContent = isSchoolDay ? 'Absent' : 'No Class';
        }
    }

    async loadRecentActivity() {
        try {
            let attendanceActivities = [];
            let clinicActivities = [];
            
            const classId = this.currentUser.classId;
            const [{ data: attendance, error: aErr }, { data: clinic, error: cErr }, { data: students, error: sErr }] = await Promise.all([
                window.supabaseClient.from('attendance')
                    .select('id,student_id,class_id,entry_type,timestamp,time,session,status,remarks')
                    .eq('class_id', classId)
                    .order('timestamp', { ascending: false })
                    .limit(10),
                window.supabaseClient.from('clinic_visits')
                    .select('id,student_id,class_id,check_in,timestamp,reason,notes')
                    .eq('class_id', classId)
                    .order('timestamp', { ascending: false })
                    .limit(10),
                window.supabaseClient.from('students')
                    .select('id,full_name')
                    .eq('class_id', classId)
            ]);
            
            if (aErr) throw aErr;
            if (cErr) throw cErr;
            if (sErr) throw sErr;
            
            const nameById = new Map((students || []).map(s => [s.id, s.full_name || s.name]));
            
            attendanceActivities = (attendance || []).map(r => ({
                id: r.id,
                type: 'attendance',
                studentId: r.student_id,
                classId: r.class_id,
                entryType: r.entry_type,
                timestamp: r.timestamp ? new Date(r.timestamp) : new Date(),
                time: r.time,
                session: r.session,
                status: r.status,
                remarks: r.remarks,
                studentName: nameById.get(r.student_id) || 'Student'
            }));
            
            clinicActivities = (clinic || []).map(r => ({
                id: r.id,
                type: 'clinic',
                studentId: r.student_id,
                classId: r.class_id,
                checkIn: r.check_in,
                timestamp: r.timestamp ? new Date(r.timestamp) : new Date(),
                reason: r.reason,
                notes: r.notes,
                studentName: nameById.get(r.student_id) || 'Student'
            }));

            // Combine and sort by timestamp
            const allActivities = [...attendanceActivities, ...clinicActivities]
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, 10);

            const container = document.getElementById('recentActivity');
            
            if (allActivities.length === 0) {
                container.innerHTML = `
                    <div class="text-center py-4 text-gray-500">
                        <i class="fas fa-inbox text-2xl mb-2"></i>
                        <p>No recent activity in your class</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = allActivities.map(item => {
                if (item.type === 'attendance') {
                    return `
                        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div class="flex items-center">
                                <div class="w-8 h-8 ${this.getActivityColor(item.entryType, item.status)} rounded-full flex items-center justify-center mr-3">
                                    <i class="${this.getActivityIcon(item.entryType, item.status)} text-sm"></i>
                                </div>
                                <div>
                                    <p class="text-sm font-medium">${item.studentName}</p>
                                    <p class="text-xs text-gray-500">${this.getActivityText(item)}</p>
                                </div>
                            </div>
                            <span class="text-xs text-gray-500">${this.formatTime(item.timestamp)}</span>
                        </div>
                    `;
                } else {
                    // Clinic activity
                    return `
                        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div class="flex items-center">
                                <div class="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mr-3">
                                    <i class="fas fa-clinic-medical text-sm"></i>
                                </div>
                                <div>
                                    <p class="text-sm font-medium">${item.studentName}</p>
                                    <p class="text-xs text-gray-500">${item.checkIn ? 'Checked into clinic' : 'Checked out of clinic'}</p>
                                    ${item.reason ? `<p class="text-xs text-gray-400">Reason: ${item.reason}</p>` : ''}
                                </div>
                            </div>
                            <span class="text-xs text-gray-500">${this.formatTime(item.timestamp)}</span>
                        </div>
                    `;
                }
            }).join('');
        } catch (error) {
            console.error('Error loading recent activity:', error);
            const container = document.getElementById('recentActivity');
            container.innerHTML = `
                <div class="text-center py-4 text-gray-500">
                    <i class="fas fa-exclamation-triangle text-2xl mb-2"></i>
                    <p>Error loading recent activity</p>
                </div>
            `;
        }
    }

    async loadNotifications() {
        try {
            if (!this.currentUser) return;

            const notifications = await EducareTrack.getNotificationsForUser(this.currentUser.id, true, 10);
            const unreadCount = notifications.filter(n => 
                !n.readBy || !n.readBy.includes(this.currentUser.id)
            ).length;

            // Update notification badge
            const badge = document.getElementById('notificationCount');
            if (unreadCount > 0) {
                badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }

            // Store notifications for modal
            this.notifications = notifications;

        } catch (error) {
            console.error('Error loading notifications:', error);
        }
    }

    setupRealTimeListeners() {
        this.realTimeListeners = [];
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
        }
        this.pollTimer = setInterval(async () => {
            try {
                await this.loadRecentActivity();
                await this.loadNotifications();
                await this.refreshDashboardStats();
            } catch (e) {
                console.error('Polling error:', e);
            }
        }, 15000);
    }

    handleNewActivity(activity) {
        // Show toast notification for significant activities
        if (activity.entryType === 'entry' && activity.status === 'late') {
            this.showNotification(`${activity.studentName} arrived late at ${activity.time}`, 'warning');
        } else if (activity.status === 'in_clinic') {
            this.showNotification(`${activity.studentName} checked into clinic`, 'info');
        }

        // Refresh recent activity
        this.loadRecentActivity();
        this.refreshDashboardStats();
    }

    handleNewNotification(notification) {
        // Show toast for new notifications
        if (!notification.readBy || !notification.readBy.includes(this.currentUser.id)) {
            this.showNotification(notification.message, 'info');
            
            // Update notification count
            this.loadNotifications();
        }
    }

    async refreshDashboardStats() {
        await this.loadDashboardStats();
        await this.loadClassStudents(); // This will update student status
    }

    getActivityColor(entryType, status) {
        if (status === 'late') return 'bg-yellow-100 text-yellow-600';
        if (status === 'in_clinic') return 'bg-blue-100 text-blue-600';
        if (status === 'absent') return 'bg-red-100 text-red-600';
        return entryType === 'entry' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600';
    }

    getActivityIcon(entryType, status) {
        if (status === 'late') return 'fas fa-clock';
        if (status === 'in_clinic') return 'fas fa-clinic-medical';
        if (status === 'absent') return 'fas fa-user-times';
        return entryType === 'entry' ? 'fas fa-sign-in-alt' : 'fas fa-sign-out-alt';
    }

    getActivityText(activity) {
        if (activity.status === 'late') {
            return `Late arrival at ${activity.time}`;
        } else if (activity.status === 'in_clinic') {
            return `Checked into clinic`;
        } else if (activity.status === 'absent') {
            return `Absent`;
        } else {
            return `${activity.entryType === 'entry' ? 'Arrived' : 'Left'} at ${activity.time}`;
        }
    }

    formatTime(date) {
        if (!date) return 'N/A';
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        
        return date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    initEventListeners() {
        // Sidebar toggle
        document.getElementById('sidebarToggle').addEventListener('click', () => {
            this.toggleSidebar();
        });

        // Logout
        document.getElementById('logoutBtn').addEventListener('click', () => {
            const existing = document.getElementById('confirmLogoutModal');
            if (!existing) {
                const overlay = document.createElement('div');
                overlay.id = 'confirmLogoutModal';
                overlay.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
                overlay.innerHTML = `
                    <div class=\"bg-white rounded-lg shadow-xl max-w-md w-full\">\n
                        <div class=\"px-6 py-4 border-b\">\n
                            <h3 class=\"text-lg font-semibold text-gray-800\">Confirm Logout</h3>\n
                        </div>\n
                        <div class=\"px-6 py-4\">\n
                            <p class=\"text-sm text-gray-700\">Are you sure you want to logout?</p>\n
                        </div>\n
                        <div class=\"px-6 py-4 border-t flex justify-end space-x-2\">\n
                            <button id=\"logoutConfirmBtn\" class=\"px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700\">Logout</button>\n
                            <button id=\"logoutCancelBtn\" class=\"px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200\">Cancel</button>\n
                        </div>\n
                    </div>`;
                document.body.appendChild(overlay);
                document.getElementById('logoutCancelBtn').addEventListener('click', () => {
                    overlay.remove();
                });
                document.getElementById('logoutConfirmBtn').addEventListener('click', () => {
                    overlay.remove();
                    this.cleanup();
                    localStorage.removeItem('educareTrack_user');
                    window.location.href = '../index.html';
                });
            }
        });

        // Notifications
        document.getElementById('notificationsBtn').addEventListener('click', () => {
            this.showNotifications();
        });

        const closeBtn = document.getElementById('closeNotifications');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                const sidebar = document.getElementById('notificationSidebar');
                if (sidebar) sidebar.classList.add('hidden');
            });
        }

        const markAllReadEl = document.getElementById('markAllRead');
        if (markAllReadEl && window.EducareTrack) {
            markAllReadEl.addEventListener('click', () => {
                window.EducareTrack.markAllNotificationsAsRead();
            });
        }

        

        // Quick action links
        this.setupQuickActions();

        // Core navigation events
        
        window.addEventListener('educareTrack:navigateToAnnouncements', () => {
            window.location.href = 'teacher-announcements.html';
        });
        window.addEventListener('educareTrack:navigateToStudent', (e) => {
            const studentId = e.detail && e.detail.studentId;
            if (studentId) {
                window.location.href = `teacher-students.html?studentId=${studentId}`;
            }
        });
        window.addEventListener('educareTrack:navigateToClinic', (e) => {
            const studentId = e.detail && e.detail.studentId;
            if (studentId) {
                window.location.href = `clinic-visits.html?studentId=${studentId}`;
            }
        });
        window.addEventListener('educareTrack:newNotifications', () => {
            this.loadNotifications();
        });
        window.addEventListener('educareTrack:clinicNotification', () => {
            this.loadDashboardStats();
            this.loadRecentActivity();
        });
    }

    setupQuickActions() {
        // Add click handlers for quick action cards if needed
        const quickActionLinks = document.querySelectorAll('a[href*="teacher-"]');
        quickActionLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                // You can add tracking or analytics here
                console.log('Quick action clicked:', link.href);
            });
        });
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
        this.loadStatusDistribution(this.chartDays);
        this.loadWeeklyHeatmap(7);
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
            const clinicRange = document.getElementById('teacherClinicTrendRange');
            if (clinicRange) {
                clinicRange.addEventListener('change', (e) => {
                    const days = parseInt(e.target.value);
                    this.loadClinicReasonsTrend(days);
                });
            }
        }
        const rangeEl = document.getElementById('chartTimeRange');
        if (rangeEl) {
            rangeEl.addEventListener('change', (e) => {
                this.chartDays = parseInt(e.target.value);
                this.loadAttendanceTrend(this.chartDays);
                this.loadTopLateStudents(this.chartDays);
                this.loadStatusDistribution(this.chartDays);
                this.loadWeeklyHeatmap(7);
            });
        }
        // Initial top late students
        this.loadTopLateStudents(14);
        this.loadClinicValidations();
    }

    async loadClinicReasonsTrend(days) {
        try {
            if (!this.currentUser?.classId || !this.teacherClinicChart) return;
            const end = new Date();
            const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
            const trend = await EducareTrack.getClassClinicReasonTrend(this.currentUser.classId, start, end, 6);
            this.teacherClinicChart.data.labels = trend.labels;
            this.teacherClinicChart.data.datasets[0].data = trend.counts;
            this.teacherClinicChart.update();
        } catch (error) {
            console.error('Error loading clinic reasons trend:', error);
        }
    }

    async loadAttendanceTrend(days = 7) {
        try {
            if (!this.currentUser?.classId) return;
            const end = new Date();
            const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
            const trend = await EducareTrack.getClassAttendanceTrend(this.currentUser.classId, start, end);
            const datasets = [
                { label: 'Present', data: trend.datasets.present, borderColor: '#10B981', backgroundColor: 'rgba(16, 185, 129, 0.15)', fill: true, tension: 0.4 },
                { label: 'Late', data: trend.datasets.late, borderColor: '#F59E0B', backgroundColor: 'rgba(245, 158, 11, 0.15)', fill: true, tension: 0.4 },
                { label: 'Absent', data: trend.datasets.absent, borderColor: '#EF4444', backgroundColor: 'rgba(239, 68, 68, 0.15)', fill: true, tension: 0.4 }
            ];
            this.attendanceChart.data.labels = trend.labels;
            this.attendanceChart.data.datasets = datasets;
            this.attendanceChart.update();
        } catch (error) {
            console.error('Error loading attendance trend:', error);
        }
    }

    async loadTopLateStudents(days = 14) {
        try {
            if (!this.currentUser?.classId) return;
            const end = new Date();
            const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
            const leaders = await EducareTrack.getClassLateLeaders(this.currentUser.classId, start, end, 5);
            const container = document.getElementById('topLateList');
            if (!container) return;
            if (!leaders || leaders.length === 0) {
                container.innerHTML = '<div class="text-gray-500 text-sm">No late arrivals in selected period</div>';
                return;
            }
            container.innerHTML = leaders.map((l, idx) => `
                <div class=\"flex items-center justify-between\">\n
                    <div class=\"flex items-center\">\n
                        <div class=\"w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center mr-3\">\n
                            <span class=\"text-yellow-700 text-xs font-semibold\">${idx + 1}</span>\n
                        </div>\n
                        <div>\n
                            <div class=\"text-sm font-medium text-gray-800\">${l.studentName}</div>\n
                            <div class=\"text-xs text-gray-500\">${l.studentId}</div>\n
                        </div>\n
                    </div>\n
                    <span class=\"px-2 py-1 text-xs rounded bg-yellow-100 text-yellow-700\">${l.lateCount} late</span>\n
                </div>
            `).join('');
        } catch (error) {
            console.error('Error loading top late students:', error);
        }
    }

    async loadClinicValidations() {
        try {
            const container = document.getElementById('clinicValidations');
            if (!container || !this.currentUser?.classId) return;

            const { data: itemsData, error } = await window.supabaseClient
                .from('clinic_visits')
                .select('*')
                .eq('class_id', this.currentUser.classId)
                .eq('check_in', true)
                .eq('teacherValidationStatus', 'pending')
                .order('timestamp', { ascending: false })
                .limit(10);

            if (error) throw error;

            const items = (itemsData || []).map(doc => ({
                id: doc.id,
                ...doc,
                studentName: doc.student_name || doc.studentName,
                medicalFindings: doc.medical_findings || doc.medicalFindings,
                timestamp: doc.timestamp ? new Date(doc.timestamp) : new Date()
            }));

            if (items.length === 0) {
                container.innerHTML = '<div class="text-gray-500 text-sm">No pending validations</div>';
                return;
            }
            container.innerHTML = items.map(v => `
                <div class="flex items-center justify-between border border-gray-200 rounded-md p-3">
                    <div>
                        <div class="text-sm font-medium text-gray-800">${v.studentName}</div>
                        <div class="text-xs text-gray-500">${v.reason || ''}</div>
                        <div class="text-xs text-gray-400">${v.medicalFindings ? v.medicalFindings.substring(0, 60) + '…' : ''}</div>
                    </div>
                    <div class="flex items-center space-x-2">
                        <button class="px-2 py-1 text-xs rounded bg-green-100 text-green-700" data-visit-id="${v.id}" data-action="approve">Approve</button>
                        <button class="px-2 py-1 text-xs rounded bg-red-100 text-red-700" data-visit-id="${v.id}" data-action="reject">Reject</button>
                    </div>
                </div>
            `).join('');
            container.querySelectorAll('button[data-visit-id]').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const action = e.currentTarget.getAttribute('data-action');
                    const visitId = e.currentTarget.getAttribute('data-visit-id');
                    await this.validateClinicVisit(visitId, action === 'approve' ? 'approved' : 'rejected');
                });
            });
        } catch (error) {
            console.error('Error loading clinic validations:', error);
        }
    }

    async validateClinicVisit(visitId, status) {
        try {
            await EducareTrack.validateClinicVisit(visitId, status);
            await this.loadClinicValidations();
            this.showNotification(`Clinic visit ${status}`, status === 'approved' ? 'success' : 'warning');
        } catch (error) {
            console.error('Error validating clinic visit:', error);
            this.showNotification('Error validating clinic visit', 'error');
        }
    }

    async loadStatusDistribution(days = 7) {
        try {
            if (!this.currentUser?.classId) return;
            const end = new Date();
            const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
            const dist = await EducareTrack.getClassStatusDistribution(this.currentUser.classId, start, end);
            const el = document.getElementById('statusDonut');
            if (!el) return;
            const ctx = el.getContext('2d');
            new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Present', 'Late', 'Absent', 'Clinic'],
                    datasets: [{
                        data: [dist.present, dist.late, dist.absent, dist.clinic],
                        backgroundColor: ['#10B981', '#F59E0B', '#EF4444', '#3B82F6']
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
            });
        } catch (error) {
            console.error('Error loading status distribution:', error);
        }
    }

    async loadWeeklyHeatmap(weeksDays = 7) {
        try {
            if (!this.currentUser?.classId) return;
            const end = new Date();
            const start = new Date(end.getTime() - weeksDays * 24 * 60 * 60 * 1000);
            const heat = await EducareTrack.getClassWeeklyHeatmap(this.currentUser.classId, start);
            const container = document.getElementById('weeklyHeatmap');
            if (!container) return;
            const statusClass = (s) => s === 'present' ? 'bg-green-100 text-green-700' : s === 'late' ? 'bg-yellow-100 text-yellow-700' : s === 'absent' ? 'bg-red-100 text-red-700' : 'bg-gray-50 text-gray-400';
            const header = `<div class=\"grid grid-cols-8 gap-2 text-xs font-semibold mb-2\">` +
                `<div></div>` + heat.days.map(d => `<div class="text-gray-700 text-center">${d.label}</div>`).join('') + `</div>`;
            const rows = heat.rows.slice(0, 20).map(r => `
                <div class=\"grid grid-cols-8 gap-2 items-center mb-1\">\n
                    <div class="text-xs text-gray-800 truncate">${r.studentName}</div>
                    ${r.cells.map(c => `<div class="text-center px-2 py-1 rounded ${statusClass(c)}">${c === 'none' ? '-' : c}</div>`).join('')}
                </div>
            `).join('');
            container.innerHTML = header + rows;
        } catch (error) {
            console.error('Error loading weekly heatmap:', error);
        }
    }

    calculateWeeklyAttendance() {
        return [85, 92, 78, 88, 95];
    }

    async showNotifications() {
        const modal = document.getElementById('notificationsModal');
        const list = document.getElementById('notificationsList');

        if (this.notifications && this.notifications.length > 0) {
            list.innerHTML = this.notifications.map(notification => `
                <div class="p-3 border-b border-gray-200 last:border-b-0 ${!notification.readBy || !notification.readBy.includes(this.currentUser.id) ? 'bg-blue-50' : ''}">
                    <div class="flex justify-between items-start">
                        <div class="flex-1">
                            <div class="flex items-center mb-1">
                                <h4 class="font-semibold text-gray-800">${notification.title}</h4>
                                ${notification.isUrgent ? '<span class="ml-2 px-2 py-1 bg-red-100 text-red-800 text-xs rounded">Urgent</span>' : ''}
                            </div>
                            <p class="text-sm text-gray-600 mt-1">${notification.message}</p>
                            <p class="text-xs text-gray-500 mt-2">${this.formatTime(notification.createdAt?.toDate())}</p>
                        </div>
                        ${!notification.readBy || !notification.readBy.includes(this.currentUser.id) ? 
                            '<span class="w-2 h-2 bg-blue-500 rounded-full ml-2 mt-1 flex-shrink-0"></span>' : ''}
                    </div>
                </div>
            `).join('');
        } else {
            list.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <i class="fas fa-bell-slash text-2xl mb-2"></i>
                    <p>No notifications</p>
                </div>
            `;
        }

        modal.classList.remove('hidden');
    }

    hideNotifications() {
        document.getElementById('notificationsModal').classList.add('hidden');
    }

    async markAllNotificationsRead() {
        try {
            if (!this.notifications || !this.currentUser) return;

            const unreadNotifications = this.notifications.filter(n => 
                !n.readBy || !n.readBy.includes(this.currentUser.id)
            );

            const promises = unreadNotifications.map(notification => 
                EducareTrack.markNotificationAsRead(notification.id)
            );

            await Promise.all(promises);
            
            // Reload notifications
            await this.loadNotifications();
            this.hideNotifications();
            
            this.showNotification('All notifications marked as read', 'success');
        } catch (error) {
            console.error('Error marking notifications as read:', error);
            this.showNotification('Error updating notifications', 'error');
        }
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

    showLoading() {
        document.getElementById('loadingSpinner').classList.remove('hidden');
    }

    hideLoading() {
        document.getElementById('loadingSpinner').classList.add('hidden');
    }

    showNotification(message, type = 'info') {
        let overlay = document.getElementById('inlineNotificationOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'inlineNotificationOverlay';
            overlay.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
            const container = document.createElement('div');
            container.className = 'bg-white rounded-lg shadow-xl max-w-md w-full';
            const header = document.createElement('div');
            header.className = 'px-6 py-4 border-b';
            const titleEl = document.createElement('h3');
            titleEl.id = 'inlineNotificationTitleJS';
            titleEl.className = 'text-lg font-semibold text-gray-800';
            header.appendChild(titleEl);
            const body = document.createElement('div');
            body.className = 'px-6 py-4';
            const msgEl = document.createElement('p');
            msgEl.id = 'inlineNotificationMessageJS';
            msgEl.className = 'text-sm text-gray-700';
            body.appendChild(msgEl);
            const footer = document.createElement('div');
            footer.className = 'px-6 py-4 border-t flex justify-end';
            const okBtn = document.createElement('button');
            okBtn.className = 'px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700';
            okBtn.textContent = 'OK';
            okBtn.addEventListener('click', () => overlay.remove());
            footer.appendChild(okBtn);
            container.appendChild(header);
            container.appendChild(body);
            container.appendChild(footer);
            overlay.appendChild(container);
            document.body.appendChild(overlay);
        }
        const titleEl = document.getElementById('inlineNotificationTitleJS');
        const msgEl = document.getElementById('inlineNotificationMessageJS');
        titleEl.textContent = type === 'error' ? 'Error' : (type === 'warning' ? 'Warning' : 'Info');
        msgEl.textContent = message;
    }

    cleanup() {
        // Unsubscribe from real-time listeners
        this.realTimeListeners.forEach(unsubscribe => {
            if (unsubscribe && typeof unsubscribe === 'function') {
                unsubscribe();
            }
        });
    }
}

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', function() {
    window.teacherDashboard = new TeacherDashboard();
});

// Handle page unload
window.addEventListener('beforeunload', function() {
    if (window.teacherDashboard) {
        window.teacherDashboard.cleanup();
    }
});
