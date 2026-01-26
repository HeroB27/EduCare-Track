class ParentDashboard {
    constructor() {
        this.currentUser = null;
        this.children = [];
        this.realtimeChannel = null;
        this.init();
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
            
            if (this.currentUser.role !== 'parent') {
                window.location.href = '../index.html';
                return;
            }

            this.updateUI();
            await this.loadDashboardData();
            this.setupRealtimeSubscription();
            this.initEventListeners();
            
            this.hideLoading();
        } catch (error) {
            console.error('Parent dashboard initialization failed:', error);
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

    async loadDashboardData() {
        try {
            await this.loadChildren();
            await this.loadRecentActivity();
            await this.loadNotificationCount();
        } catch (error) {
            console.error('Error loading dashboard data:', error);
        }
    }

    async loadChildren() {
        try {
            this.children = await EducareTrack.getStudentsByParent(this.currentUser.id);
            document.getElementById('totalChildren').textContent = this.children.length;
            await this.updateChildrenOverview();
            await this.calculateTodayStats();
        } catch (error) {
            console.error('Error loading children:', error);
        }
    }

    async updateChildrenOverview() {
        const container = document.getElementById('childrenOverview');
        if (!container) return;

        if (this.children.length === 0) {
            container.innerHTML = '<div class="col-span-full text-center py-8 text-gray-500">No children linked to your account.</div>';
            return;
        }

        container.innerHTML = '';
        
        for (const child of this.children) {
            const status = await this.getChildStatus(child.id);
            
            const div = document.createElement('div');
            div.className = 'bg-white rounded-lg shadow-md p-6 card-hover';
            
            let statusBadge = '';
            let statusColor = 'bg-gray-100 text-gray-800';
            let statusText = 'Unknown';

            if (status.status === 'in_clinic') {
                statusColor = 'bg-blue-100 text-blue-800';
                statusText = 'In Clinic';
            } else if (status.status === 'out_school') {
                statusColor = 'bg-gray-100 text-gray-800';
                statusText = 'Left School';
            } else if (status.status === 'present') {
                statusColor = 'bg-green-100 text-green-800';
                statusText = 'Present';
            } else if (status.status === 'late') {
                statusColor = 'bg-yellow-100 text-yellow-800';
                statusText = 'Late';
            } else if (status.status === 'absent') {
                statusColor = 'bg-red-100 text-red-800';
                statusText = 'Absent';
            }

            statusBadge = `<span class="px-2 py-1 rounded-full text-xs font-medium ${statusColor}">${statusText}</span>`;

            div.innerHTML = `
                <div class="flex items-center justify-between mb-4">
                    <div class="flex items-center">
                        <div class="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mr-3">
                            <span class="text-green-600 font-semibold">${(child.full_name || '?').charAt(0)}</span>
                        </div>
                        <div>
                            <h3 class="font-semibold text-gray-800">${child.full_name}</h3>
                            <p class="text-sm text-gray-600">${child.grade || 'N/A'} - ${child.section || 'N/A'}</p>
                        </div>
                    </div>
                    ${statusBadge}
                </div>
                
                <div class="space-y-2 text-sm text-gray-600">
                    <div class="flex justify-between">
                        <span>Class:</span>
                        <span class="font-medium">${child.class_id || 'Not assigned'}</span>
                    </div>
                    <div class="flex justify-between">
                        <span>Last Update:</span>
                        <span class="font-medium">${status.time ? new Date(status.time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : 'N/A'}</span>
                    </div>
                </div>
                
                <div class="mt-4 flex space-x-2">
                    <button onclick="window.location.href='parent-attendance.html?studentId=${child.id}'" 
                            class="flex-1 bg-green-600 text-white py-2 px-3 rounded-md text-sm hover:bg-green-700 transition-colors">
                        <i class="fas fa-calendar-alt mr-1"></i> History
                    </button>
                    <button onclick="window.location.href='parent-clinic.html?studentId=${child.id}'" 
                            class="flex-1 bg-blue-600 text-white py-2 px-3 rounded-md text-sm hover:bg-blue-700 transition-colors">
                        <i class="fas fa-notes-medical mr-1"></i> Clinic
                    </button>
                </div>
            `;
            container.appendChild(div);
        }
    }

    async getChildStatus(studentId) {
        // Check authoritative status from students table first
        const { data: student } = await window.supabaseClient
            .from('students')
            .select('current_status')
            .eq('id', studentId)
            .single();
            
        if (student && student.current_status === 'in_clinic') {
            // Fetch latest visit time for display
            const { data: visit } = await window.supabaseClient
                .from('clinic_visits')
                .select('visit_time')
                .eq('student_id', studentId)
                .order('visit_time', { ascending: false })
                .limit(1)
                .maybeSingle();
            return { status: 'in_clinic', time: visit ? visit.visit_time : new Date().toISOString() };
        }

        // Check attendance for today
        const today = new Date().toISOString().split('T')[0];
        const { data, error } = await window.supabaseClient
            .from('attendance')
            .select('*')
            .eq('student_id', studentId)
            .gte('timestamp', today)
            .order('timestamp', { ascending: false })
            .limit(1);

        if (error || !data || data.length === 0) {
            // If no attendance record, fallback to student current_status (e.g. 'absent', 'inactive')
            return { status: student ? student.current_status : 'unknown' };
        }
        
        const lastRecord = data[0];
        // Infer "Left School" from remarks or manual entry
        if (lastRecord.remarks && (lastRecord.remarks.toLowerCase().includes('out') || lastRecord.remarks.toLowerCase().includes('departure'))) {
             return { status: 'out_school', time: lastRecord.timestamp };
        }
        
        return { status: lastRecord.status, time: lastRecord.timestamp };
    }

    async calculateTodayStats() {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            let presentCount = 0;
            let lateCount = 0;
            let clinicCount = 0;

            for (const child of this.children) {
                // Attendance stats
                const { data: attendanceData } = await window.supabaseClient
                    .from('attendance')
                    .select('*')
                    .eq('student_id', child.id)
                    .gte('timestamp', today.toISOString());

                // Check if ANY record is present/late
                if (attendanceData) {
                    const hasPresent = attendanceData.some(r => r.status === 'present');
                    const hasLate = attendanceData.some(r => r.status === 'late');
                    if (hasPresent) presentCount++;
                    if (hasLate) lateCount++;
                }

                // Clinic stats
                const { count } = await window.supabaseClient
                    .from('clinic_visits')
                    .select('*', { count: 'exact', head: true })
                    .eq('student_id', child.id)
                    .gte('visit_time', today.toISOString());
                
                if (count) clinicCount += count;
            }

            document.getElementById('presentToday').textContent = presentCount;
            document.getElementById('lateToday').textContent = lateCount;
            document.getElementById('clinicVisits').textContent = clinicCount;

        } catch (error) {
            console.error('Error calculating today stats:', error);
        }
    }

    async loadRecentActivity() {
         const container = document.getElementById('recentActivity');
         if (!container) return;
         
         const studentIds = this.children.map(c => c.id);
         if (studentIds.length === 0) return;

         const { data: logs, error } = await window.supabaseClient
            .from('attendance')
            .select('*, students(full_name)')
            .in('student_id', studentIds)
            .order('timestamp', { ascending: false })
            .limit(10);

         if (error) {
             console.error('Error fetching logs:', error);
             return;
         }

         container.innerHTML = logs.map(log => {
             const studentName = log.students ? log.students.full_name : 'Unknown Student';
             const time = new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
             const isOut = log.remarks && (log.remarks.includes('out') || log.remarks.includes('departure'));
             const statusText = isOut ? 'Left School' : (log.status === 'late' ? 'Arrived Late' : 'Arrived On Time');
             const icon = isOut ? 'fa-sign-out-alt text-red-500' : 'fa-sign-in-alt text-green-500';

             return `
                <div class="flex items-start pb-4 border-b border-gray-100 last:border-0 last:pb-0 mb-4 last:mb-0">
                    <div class="bg-gray-100 p-2 rounded-lg mr-3">
                        <i class="fas ${icon}"></i>
                    </div>
                    <div>
                        <p class="text-sm font-medium text-gray-800">${studentName} - ${statusText}</p>
                        <p class="text-xs text-gray-500">${time}</p>
                    </div>
                </div>
             `;
         }).join('');
    }

    async loadNotificationCount() {
        const count = await EducareTrack.getUnreadNotificationCount(this.currentUser.id);
        const badge = document.getElementById('notificationBadge');
        if (badge) {
            if (count > 0) {
                badge.textContent = count;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
    }

    setupRealtimeSubscription() {
        if (this.realtimeChannel) return;

        this.realtimeChannel = window.supabaseClient.channel('parent-dashboard')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => {
                this.loadDashboardData();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'clinic_visits' }, () => {
                this.loadDashboardData();
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'students' }, (payload) => {
                // Check if the updated student is one of our children
                const isMyChild = this.children.some(child => child.id === payload.new.id);
                if (isMyChild) {
                    this.loadDashboardData();
                }
            })
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
                if (payload.new.target_users && payload.new.target_users.includes(this.currentUser.id)) {
                    this.loadNotificationCount();
                    // Optionally show toast
                }
            })
            .subscribe();
    }

    initEventListeners() {
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                localStorage.removeItem('educareTrack_user');
                window.location.href = '../index.html';
            });
        }

        // Mobile sidebar toggle
        const toggleBtn = document.getElementById('sidebarToggle');
        const sidebar = document.querySelector('.sidebar');
        if (toggleBtn && sidebar) {
            toggleBtn.addEventListener('click', () => {
                sidebar.classList.toggle('-translate-x-full');
            });
        }
    }

    showLoading() {
        // Implementation dependent on UI
    }

    hideLoading() {
        // Implementation dependent on UI
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.parentDashboard = new ParentDashboard();
});
