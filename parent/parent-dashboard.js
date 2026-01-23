class ParentDashboard {
    constructor() {
        this.currentUser = null;
        this.children = [];
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
            
            // Verify user is a parent
            if (this.currentUser.role !== 'parent') {
                if (window.EducareTrack && typeof window.EducareTrack.showNormalNotification === 'function') {
                    window.EducareTrack.showNormalNotification({ title: 'Access Denied', message: 'Parent role required.', type: 'error' });
                }
                window.location.href = '../index.html';
                return;
            }

            this.updateUI();
            await this.loadDashboardData();
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
            // Load children data
            await this.loadChildren();
            
            // Load recent activity
            await this.loadRecentActivity();
            
            // Load notification count
            await this.loadNotificationCount();

        } catch (error) {
            console.error('Error loading dashboard data:', error);
        }
    }

    async loadChildren() {
        try {
            this.children = await EducareTrack.getStudentsByParent(this.currentUser.id);
            
            // Update children count
            document.getElementById('totalChildren').textContent = this.children.length;
            
            // Update children overview (now async)
            await this.updateChildrenOverview();
            
            // Calculate today's stats
            await this.calculateTodayStats();

        } catch (error) {
            console.error('Error loading children:', error);
        }
    }

    async updateChildrenOverview() {
        const container = document.getElementById('childrenOverview');
        
        if (this.children.length === 0) {
            container.innerHTML = `
                <div class="col-span-3 text-center py-8 bg-white rounded-lg shadow-md">
                    <i class="fas fa-user-graduate text-4xl text-gray-300 mb-4"></i>
                    <h3 class="text-lg font-medium text-gray-600 mb-2">No Children Found</h3>
                    <p class="text-gray-500">Contact school administration to add your children.</p>
                </div>
            `;
            return;
        }

        // Fetch class information for all children
        const classIds = [...new Set(this.children.map(child => child.class_id || child.classId).filter(Boolean))];
        const classMap = new Map();
        
        if (classIds.length > 0 && window.USE_SUPABASE && window.supabaseClient) {
            try {
                const { data: classes, error } = await window.supabaseClient
                    .from('classes')
                    .select('*')
                    .in('id', classIds);
                
                if (!error && classes) {
                    classes.forEach(cls => classMap.set(cls.id, cls));
                }
            } catch (error) {
                console.error('Error fetching class information:', error);
            }
        }

        container.innerHTML = this.children.map(child => {
            const childName = child.name || [child.first_name, child.last_name].filter(Boolean).join(' ');
            const className = child.classId || child.class_id;
            const status = child.currentStatus || child.current_status;
            
            // Get class information
            const classInfo = className ? classMap.get(className) : null;
            const grade = classInfo?.grade || child.grade || 'N/A';
            const level = classInfo?.level || child.level || 'N/A';
            
            return `
            <div class="bg-white rounded-lg shadow-md p-6 card-hover">
                <div class="flex items-center justify-between mb-4">
                    <div class="flex items-center">
                        <div class="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mr-3">
                            <span class="text-green-600 font-semibold">${childName ? childName.split(' ').map(n => n[0]).join('').substring(0, 2) : '??'}</span>
                        </div>
                        <div>
                            <h3 class="font-semibold text-gray-800">${childName || 'Unknown'}</h3>
                            <p class="text-sm text-gray-600">${grade} • ${level}</p>
                        </div>
                    </div>
                    <span class="px-2 py-1 rounded-full text-xs font-medium ${EducareTrack.getStatusColor(status)}">
                        ${EducareTrack.getStatusText(status)}
                    </span>
                </div>
                
                <div class="space-y-2 text-sm text-gray-600">
                    <div class="flex justify-between">
                        <span>Class:</span>
                        <span class="font-medium">${classInfo?.name || className || 'Not assigned'}</span>
                    </div>
                    <div class="flex justify-between">
                        <span>Last Update:</span>
                        <span class="font-medium">${EducareTrack.formatTime(child.lastAttendance)}</span>
                    </div>
                </div>
                
                <div class="mt-4 flex space-x-2">
                    <button onclick="parentDashboard.viewChildDetails('${child.id}')" 
                            class="flex-1 bg-green-600 text-white py-2 px-3 rounded-md text-sm hover:bg-green-700 transition-colors">
                        <i class="fas fa-eye mr-1"></i> Details
                    </button>
                    <button onclick="parentDashboard.viewChildAttendance('${child.id}')" 
                            class="flex-1 bg-blue-600 text-white py-2 px-3 rounded-md text-sm hover:bg-blue-700 transition-colors">
                        <i class="fas fa-clipboard-check mr-1"></i> Attendance
                    </button>
                </div>
            </div>
            `;
        }).join('');
    }

    async calculateTodayStats() {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const presentStudents = new Set();
            const lateStudents = new Set();
            let clinicVisits = 0;

            if (window.USE_SUPABASE && window.supabaseClient) {
                // Use Supabase queries
                const childIds = this.children.map(child => child.id);
                
                const [attendanceRes, clinicRes] = await Promise.all([
                    window.supabaseClient
                        .from('attendance')
                        .select('*')
                        .in('student_id', childIds)
                        .gte('timestamp', today.toISOString())
                        .eq('entry_type', 'entry'),
                    window.supabaseClient
                        .from('clinicVisits')
                        .select('*')
                        .in('student_id', childIds)
                        .gte('timestamp', today.toISOString())
                        .eq('check_in', true)
                ]);

                // Process attendance data
                (attendanceRes.data || []).forEach(record => {
                    if (record.status === 'present') presentStudents.add(record.student_id);
                    if (record.status === 'late') lateStudents.add(record.student_id);
                });

                // Count clinic visits
                clinicVisits = (clinicRes.data || []).length;
            } else {
                // Fallback to Firebase (if still needed)
                for (const child of this.children) {
                    const attendanceSnapshot = await EducareTrack.db.collection('attendance')
                        .where('student_id', '==', child.id)
                        .where('timestamp', '>=', today)
                        .where('entry_type', '==', 'entry')
                        .get();

                    attendanceSnapshot.forEach(doc => {
                        const record = doc.data();
                        if (record.status === 'present') presentStudents.add(child.id);
                        if (record.status === 'late') lateStudents.add(child.id);
                    });

                    const clinicSnapshot = await EducareTrack.db.collection('clinicVisits')
                        .where('student_id', '==', child.id)
                        .where('timestamp', '>=', today)
                        .where('check_in', '==', true)
                        .get();

                    clinicVisits += clinicSnapshot.size;
                }
            }

            document.getElementById('presentToday').textContent = presentStudents.size;
            document.getElementById('lateToday').textContent = lateStudents.size;
            document.getElementById('clinicVisits').textContent = clinicVisits;

        } catch (error) {
            console.error('Error calculating today stats:', error);
        }
    }

    async loadRecentActivity() {
        try {
            const activity = await EducareTrack.getRecentActivityForParent(this.currentUser.id);
            const container = document.getElementById('recentActivity');
            
            if (activity.length === 0) {
                container.innerHTML = `
                    <div class="text-center py-4 text-gray-500">
                        <i class="fas fa-inbox text-2xl mb-2"></i>
                        <p>No recent activity</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = activity.map(item => `
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div class="flex items-center">
                        <div class="w-8 h-8 ${this.getActivityColor(item.type)} rounded-full flex items-center justify-center mr-3">
                            <i class="${this.getActivityIcon(item.type)} text-sm"></i>
                        </div>
                        <div>
                            <p class="text-sm font-medium">${item.title}</p>
                            <p class="text-xs text-gray-500">${item.message}</p>
                        </div>
                    </div>
                    <span class="text-xs text-gray-500">${this.formatTime(item.timestamp)}</span>
                </div>
            `).join('');
        } catch (error) {
            console.error('Error loading recent activity:', error);
        }
    }

    async loadNotificationCount() {
        try {
            const count = await EducareTrack.getUnreadNotificationCount(this.currentUser.id);
            const badge = document.getElementById('notificationBadge');
            
            if (count > 0) {
                badge.textContent = count;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        } catch (error) {
            console.error('Error loading notification count:', error);
        }
    }

    getActivityColor(type) {
        const colors = {
            'attendance': 'bg-blue-100 text-blue-600',
            'notification': 'bg-yellow-100 text-yellow-600',
            'clinic': 'bg-red-100 text-red-600'
        };
        return colors[type] || 'bg-gray-100 text-gray-600';
    }

    getActivityIcon(type) {
        const icons = {
            'attendance': 'fas fa-clipboard-check',
            'notification': 'fas fa-bell',
            'clinic': 'fas fa-heartbeat'
        };
        return icons[type] || 'fas fa-info-circle';
    }

    formatTime(date) {
        if (!date) return 'N/A';
        return new Date(date).toLocaleTimeString('en-US', {
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
        document.getElementById('logoutBtn').addEventListener('click', async () => {
            const ok = window.EducareTrack && typeof window.EducareTrack.confirmAction === 'function'
                ? await window.EducareTrack.confirmAction('Are you sure you want to logout?', 'Confirm Logout', 'Logout', 'Cancel')
                : true;
            if (ok) {
                EducareTrack.logout();
                window.location.href = '../index.html';
            }
        });

        // Close modals on outside click
        document.getElementById('childDetailsModal').addEventListener('click', (e) => {
            if (e.target.id === 'childDetailsModal') {
                this.closeChildDetailsModal();
            }
        });

        // Escape key to close modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeChildDetailsModal();
            }
        });

        // Listen for new notifications
        window.addEventListener('educareTrack:newNotifications', () => {
            this.loadNotificationCount();
        });

        window.addEventListener('educareTrack:clinicNotification', () => {
            this.calculateTodayStats();
        });
    }

    async viewChildDetails(childId) {
        try {
            const child = this.children.find(c => c.id === childId);
            if (!child) return;

            const modal = document.getElementById('childDetailsModal');
            const content = document.getElementById('childDetailsContent');

            // Get child's class info
            const className = child.classId || child.class_id;
            let classInfo = null;
            
            if (className && window.USE_SUPABASE && window.supabaseClient) {
                const { data: classData, error } = await window.supabaseClient
                    .from('classes')
                    .select('*')
                    .eq('id', className)
                    .single();
                
                if (!error && classData) {
                    classInfo = classData;
                }
            }

            // Get today's attendance
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            let todayAttendance = null;
            if (window.USE_SUPABASE && window.supabaseClient) {
                const attendanceRes = await window.supabaseClient
                    .from('attendance')
                    .select('*')
                    .eq('student_id', childId)
                    .gte('timestamp', today.toISOString())
                    .order('timestamp', { ascending: false })
                    .limit(1);
                
                if (attendanceRes.data && attendanceRes.data.length > 0) {
                    todayAttendance = attendanceRes.data[0];
                }
            } else {
                const attendanceSnapshot = await EducareTrack.db.collection('attendance')
                    .where('student_id', '==', childId)
                    .where('timestamp', '>=', today)
                    .orderBy('timestamp', 'desc')
                    .limit(1)
                    .get();

                if (!attendanceSnapshot.empty) {
                    todayAttendance = attendanceSnapshot.docs[0].data();
                }
            }

            const childName = child.name || [child.first_name, child.last_name].filter(Boolean).join(' ');
            const status = child.currentStatus || child.current_status;
            const grade = classInfo?.grade || child.grade || 'N/A';
            const level = classInfo?.level || child.level || 'N/A';

            content.innerHTML = `
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div class="md:col-span-1">
                        <div class="bg-gray-100 rounded-lg p-4 text-center">
                            <div class="w-20 h-20 rounded-full bg-green-200 flex items-center justify-center mx-auto mb-3">
                                <span class="text-green-600 font-bold text-xl">${childName ? childName.split(' ').map(n => n[0]).join('').substring(0, 2) : '??'}</span>
                            </div>
                            <h3 class="font-semibold text-lg">${childName || 'Unknown'}</h3>
                            <p class="text-gray-600">${grade} • ${level}</p>
                            <div class="mt-2">
                                <span class="px-3 py-1 rounded-full text-sm font-medium ${EducareTrack.getStatusColor(status)}">
                                    ${EducareTrack.getStatusText(status)}
                                </span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="md:col-span-2">
                        <div class="space-y-4">
                            <div>
                                <h4 class="font-semibold text-gray-700 mb-2">Basic Information</h4>
                                <div class="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <span class="text-gray-600">Student ID:</span>
                                        <p class="font-medium">${child.id || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <span class="text-gray-600">LRN:</span>
                                        <p class="font-medium">${child.lrn || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <span class="text-gray-600">Class:</span>
                                        <p class="font-medium">${classInfo ? classInfo.name : 'Not assigned'}</p>
                                    </div>
                                    <div>
                                        <span class="text-gray-600">Strand:</span>
                                        <p class="font-medium">${child.strand || 'N/A'}</p>
                                    </div>
                                </div>
                            </div>
                            
                            <div>
                                <h4 class="font-semibold text-gray-700 mb-2">Today's Status</h4>
                                ${todayAttendance ? `
                                    <div class="bg-gray-50 rounded-lg p-3">
                                        <div class="flex justify-between items-center">
                                            <span class="font-medium">${todayAttendance.entry_type === 'entry' ? 'Arrival' : 'Departure'}</span>
                                            <span class="px-2 py-1 rounded text-xs ${EducareTrack.getStatusColor(todayAttendance.status)}">
                                                ${todayAttendance.status}
                                            </span>
                                        </div>
                                        <div class="text-sm text-gray-600 mt-1">
                                            Time: ${todayAttendance.time} • Session: ${todayAttendance.session}
                                        </div>
                                    </div>
                                ` : `
                                    <div class="bg-gray-50 rounded-lg p-3 text-center text-gray-500">
                                        No attendance recorded today
                                    </div>
                                `}
                            </div>
                            
                            <div>
                                <h4 class="font-semibold text-gray-700 mb-2">Subjects</h4>
                                <div class="flex flex-wrap gap-2">
                                    ${child.subjects && child.subjects.length > 0 ? 
                                        child.subjects.map(subject => `
                                            <span class="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">${subject}</span>
                                        `).join('') : 
                                        '<span class="text-gray-500 text-sm">No subjects assigned</span>'
                                    }
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            modal.classList.remove('hidden');
        } catch (error) {
            console.error('Error loading child details:', error);
            this.showNotification('Error loading child details', 'error');
        }
    }

    viewChildAttendance(childId) {
        // Redirect to attendance page with child filter
        window.location.href = `parent-attendance.html?child=${childId}`;
    }

    closeChildDetailsModal() {
        document.getElementById('childDetailsModal').classList.add('hidden');
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
        if (window.EducareTrack && typeof window.EducareTrack.showNormalNotification === 'function') {
            window.EducareTrack.showNormalNotification({ title: type === 'error' ? 'Error' : 'Info', message, type });
        }
    }
}

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', function() {
    window.parentDashboard = new ParentDashboard();
});
