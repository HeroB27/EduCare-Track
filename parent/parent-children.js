class ParentChildren {
    constructor() {
        this.currentUser = null;
        this.children = [];
        this.currentTab = 'overview';
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
            await this.loadChildrenData();
            this.initEventListeners();
            this.initTabs();
            
            this.hideLoading();
        } catch (error) {
            console.error('Parent children initialization failed:', error);
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

    async loadChildrenData() {
        try {
            this.children = await EducareTrack.getStudentsByParent(this.currentUser.id);
            this.updateOverviewTab();
            this.updateDetailsTab();
            this.updateAcademicTab();
            
            // Load notification count
            await this.loadNotificationCount();

        } catch (error) {
            console.error('Error loading children data:', error);
        }
    }

    updateOverviewTab() {
        const container = document.getElementById('overviewContent');
        
        if (this.children.length === 0) {
            container.innerHTML = `
                <div class="col-span-3 text-center py-12 bg-white rounded-lg shadow-md">
                    <i class="fas fa-user-graduate text-5xl text-gray-300 mb-4"></i>
                    <h3 class="text-xl font-medium text-gray-600 mb-2">No Children Registered</h3>
                    <p class="text-gray-500 mb-4">Contact school administration to register your children.</p>
                    <button class="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors">
                        <i class="fas fa-plus mr-2"></i>Contact School
                    </button>
                </div>
            `;
            return;
        }

        container.innerHTML = this.children.map(child => `
            <div class="bg-white rounded-lg shadow-md p-6 card-hover">
                <div class="flex items-center justify-between mb-4">
                    <div class="flex items-center">
                        <div class="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mr-4">
                            <span class="text-green-600 font-bold text-lg">${child.name.split(' ').map(n => n[0]).join('').substring(0, 2)}</span>
                        </div>
                        <div>
                            <h3 class="font-semibold text-lg text-gray-800">${child.name}</h3>
                            <p class="text-sm text-gray-600">${child.grade} • ${child.level}</p>
                            <p class="text-xs text-gray-500">Student ID: ${child.studentId || 'N/A'}</p>
                        </div>
                    </div>
                    <span class="px-3 py-1 rounded-full text-sm font-medium ${EducareTrack.getStatusColor(child.currentStatus)}">
                        ${EducareTrack.getStatusText(child.currentStatus)}
                    </span>
                </div>
                
                <div class="space-y-3 mb-4">
                    <div class="flex justify-between items-center text-sm">
                        <span class="text-gray-600">Class:</span>
                        <span class="font-medium">${child.classId || 'Not assigned'}</span>
                    </div>
                    <div class="flex justify-between items-center text-sm">
                        <span class="text-gray-600">LRN:</span>
                        <span class="font-medium">${child.lrn || 'N/A'}</span>
                    </div>
                    <div class="flex justify-between items-center text-sm">
                        <span class="text-gray-600">Last Update:</span>
                        <span class="font-medium">${EducareTrack.formatTime(child.lastAttendance)}</span>
                    </div>
                </div>
                
                <div class="flex space-x-2">
                    <button onclick="parentChildren.viewChildDetails('${child.id}')" 
                            class="flex-1 bg-green-600 text-white py-2 px-3 rounded-md text-sm hover:bg-green-700 transition-colors">
                        <i class="fas fa-eye mr-1"></i> View Details
                    </button>
                    <button onclick="parentChildren.viewChildAttendance('${child.id}')" 
                            class="flex-1 bg-blue-600 text-white py-2 px-3 rounded-md text-sm hover:bg-blue-700 transition-colors">
                        <i class="fas fa-clipboard-check mr-1"></i> Attendance
                    </button>
                </div>
            </div>
        `).join('');
    }

    updateDetailsTab() {
        const container = document.getElementById('childrenTableBody');
        
        if (this.children.length === 0) {
            container.innerHTML = `
                <tr>
                    <td colspan="6" class="px-6 py-8 text-center text-gray-500">
                        <i class="fas fa-user-graduate text-3xl mb-2"></i>
                        <p>No children registered</p>
                    </td>
                </tr>
            `;
            return;
        }

        container.innerHTML = this.children.map(child => `
            <tr>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex items-center">
                        <div class="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center mr-3">
                            <span class="text-green-600 font-semibold text-sm">${child.name.split(' ').map(n => n[0]).join('').substring(0, 2)}</span>
                        </div>
                        <div>
                            <div class="font-medium text-gray-900">${child.name}</div>
                            <div class="text-sm text-gray-500">${child.studentId || 'N/A'}</div>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm text-gray-900">${child.grade}</div>
                    <div class="text-sm text-gray-500">${child.level}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${child.classId || 'Not assigned'}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 py-1 rounded-full text-xs font-medium ${EducareTrack.getStatusColor(child.currentStatus)}">
                        ${EducareTrack.getStatusText(child.currentStatus)}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    ${EducareTrack.formatTime(child.lastAttendance)}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button onclick="parentChildren.viewChildDetails('${child.id}')" 
                            class="text-green-600 hover:text-green-900 mr-3">
                        <i class="fas fa-eye mr-1"></i>View
                    </button>
                    <button onclick="parentChildren.viewChildAttendance('${child.id}')" 
                            class="text-blue-600 hover:text-blue-900">
                        <i class="fas fa-clipboard-check mr-1"></i>Attendance
                    </button>
                </td>
            </tr>
        `).join('');
    }

    async updateAcademicTab() {
        const container = document.getElementById('academicContent');
        
        if (this.children.length === 0) {
            container.innerHTML = `
                <div class="text-center py-12 bg-white rounded-lg shadow-md">
                    <i class="fas fa-graduation-cap text-5xl text-gray-300 mb-4"></i>
                    <h3 class="text-xl font-medium text-gray-600 mb-2">No Academic Data</h3>
                    <p class="text-gray-500">Academic progress will be available once children are registered.</p>
                </div>
            `;
            return;
        }

        // For each child, get academic progress
        let academicContent = '';
        
        for (const child of this.children) {
            // Get child's class info
            const classInfo = child.classId ? await EducareTrack.getClassById(child.classId) : null;
            
            // Get recent attendance rate (last 30 days)
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            
            const attendanceSnapshot = await EducareTrack.db.collection('attendance')
                .where('studentId', '==', child.id)
                .where('timestamp', '>=', thirtyDaysAgo)
                .where('entryType', '==', 'entry')
                .get();

            const uniqueDays = new Set();
            attendanceSnapshot.forEach(doc => {
                const ts = doc.data().timestamp;
                if (ts && ts.toDate) {
                    uniqueDays.add(ts.toDate().toDateString());
                }
            });

            // Calculate total school days in last 30 days
            let totalSchoolDays = 0;
            const endDate = new Date();
            const startDate = new Date(thirtyDaysAgo);
            
            // Normalize dates
            startDate.setHours(0,0,0,0);
            endDate.setHours(23,59,59,999);
            
            const curDate = new Date(startDate);
            while (curDate <= endDate) {
                if (window.EducareTrack.isSchoolDay(curDate, child.level)) {
                    totalSchoolDays++;
                }
                curDate.setDate(curDate.getDate() + 1);
            }

            const presentDays = uniqueDays.size;
            const attendanceRate = totalSchoolDays > 0 ? Math.round((presentDays / totalSchoolDays) * 100) : 0;

            academicContent += `
                <div class="bg-white rounded-lg shadow-md p-6">
                    <div class="flex items-center justify-between mb-4">
                        <div class="flex items-center">
                            <div class="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mr-4">
                                <span class="text-green-600 font-bold">${child.name.split(' ').map(n => n[0]).join('').substring(0, 2)}</span>
                            </div>
                            <div>
                                <h3 class="font-semibold text-lg text-gray-800">${child.name}</h3>
                                <p class="text-sm text-gray-600">${child.grade} • ${child.level}</p>
                            </div>
                        </div>
                        <div class="text-right">
                            <div class="text-2xl font-bold text-green-600">${attendanceRate}%</div>
                            <div class="text-sm text-gray-500">Attendance Rate</div>
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-2 gap-4 mb-4">
                        <div class="text-center p-3 bg-blue-50 rounded-lg">
                            <div class="text-lg font-bold text-blue-600">${presentDays}</div>
                            <div class="text-sm text-blue-800">Days Present</div>
                        </div>
                        <div class="text-center p-3 bg-green-50 rounded-lg">
                            <div class="text-lg font-bold text-green-600">${child.subjects ? child.subjects.length : 0}</div>
                            <div class="text-sm text-green-800">Subjects</div>
                        </div>
                    </div>
                    
                    <div class="mb-4">
                        <h4 class="font-semibold text-gray-700 mb-2">Current Subjects</h4>
                        <div class="flex flex-wrap gap-2">
                            ${child.subjects && child.subjects.length > 0 ? 
                                child.subjects.slice(0, 5).map(subject => `
                                    <span class="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">${subject}</span>
                                `).join('') : 
                                '<span class="text-gray-500 text-sm">No subjects assigned</span>'
                            }
                            ${child.subjects && child.subjects.length > 5 ? 
                                `<span class="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">+${child.subjects.length - 5} more</span>` : 
                                ''
                            }
                        </div>
                    </div>
                    
                    <div class="text-center">
                        <button onclick="parentChildren.viewChildAcademicDetails('${child.id}')" 
                                class="bg-green-600 text-white px-4 py-2 rounded-md text-sm hover:bg-green-700 transition-colors">
                            <i class="fas fa-chart-line mr-1"></i> View Detailed Progress
                        </button>
                    </div>
                </div>
            `;
        }

        container.innerHTML = academicContent;
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

    initTabs() {
        const tabs = ['overview', 'details', 'academic'];
        
        tabs.forEach(tab => {
            document.getElementById(`${tab}Tab`).addEventListener('click', () => {
                this.switchTab(tab);
            });
        });
    }

    switchTab(tabName) {
        // Update tab buttons
        document.getElementById('overviewTab').classList.remove('tab-active');
        document.getElementById('detailsTab').classList.remove('tab-active');
        document.getElementById('academicTab').classList.remove('tab-active');
        document.getElementById('overviewTab').classList.add('text-gray-500', 'hover:text-gray-700');
        document.getElementById('detailsTab').classList.add('text-gray-500', 'hover:text-gray-700');
        document.getElementById('academicTab').classList.add('text-gray-500', 'hover:text-gray-700');
        
        document.getElementById(`${tabName}Tab`).classList.add('tab-active');
        document.getElementById(`${tabName}Tab`).classList.remove('text-gray-500', 'hover:text-gray-700');

        // Update tab content
        document.getElementById('overviewContent').classList.add('hidden');
        document.getElementById('detailsContent').classList.add('hidden');
        document.getElementById('academicContent').classList.add('hidden');
        document.getElementById(`${tabName}Content`).classList.remove('hidden');

        this.currentTab = tabName;
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
    }

    async viewChildDetails(childId) {
        try {
            const child = this.children.find(c => c.id === childId);
            if (!child) return;

            const modal = document.getElementById('childDetailsModal');
            const content = document.getElementById('childDetailsContent');

            // Get child's class info
            const classInfo = child.classId ? await EducareTrack.getClassById(child.classId) : null;

            // Get today's attendance
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const attendanceSnapshot = await EducareTrack.db.collection('attendance')
                .where('studentId', '==', childId)
                .where('timestamp', '>=', today)
                .orderBy('timestamp', 'desc')
                .get();

            const todayRecords = attendanceSnapshot.docs.map(doc => doc.data());

            // Get recent clinic visits (last 7 days)
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            const clinicSnapshot = await EducareTrack.db.collection('clinic_visits')
                .where('studentId', '==', childId)
                .where('timestamp', '>=', sevenDaysAgo)
                .orderBy('timestamp', 'desc')
                .limit(5)
                .get();

            const clinicVisits = clinicSnapshot.docs.map(doc => doc.data());

            content.innerHTML = `
                <div class="space-y-6">
                    <!-- Header -->
                    <div class="flex items-center justify-between">
                        <div class="flex items-center">
                            <div class="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mr-4">
                                <span class="text-green-600 font-bold text-2xl">${child.name.split(' ').map(n => n[0]).join('').substring(0, 2)}</span>
                            </div>
                            <div>
                                <h3 class="text-2xl font-bold text-gray-800">${child.name}</h3>
                                <p class="text-gray-600">${child.grade} • ${child.level} ${child.strand ? `• ${child.strand}` : ''}</p>
                                <div class="mt-1">
                                    <span class="px-3 py-1 rounded-full text-sm font-medium ${EducareTrack.getStatusColor(child.currentStatus)}">
                                        ${EducareTrack.getStatusText(child.currentStatus)}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div class="text-right">
                            <p class="text-sm text-gray-500">Student ID</p>
                            <p class="font-mono font-bold text-gray-700">${child.studentId || 'N/A'}</p>
                        </div>
                    </div>

                    <!-- Basic Information -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div class="bg-gray-50 rounded-lg p-4">
                            <h4 class="font-semibold text-gray-700 mb-3">Academic Information</h4>
                            <div class="space-y-2 text-sm">
                                <div class="flex justify-between">
                                    <span class="text-gray-600">Class:</span>
                                    <span class="font-medium">${classInfo ? classInfo.name : 'Not assigned'}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-600">Grade Level:</span>
                                    <span class="font-medium">${child.grade}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-600">Education Level:</span>
                                    <span class="font-medium">${child.level}</span>
                                </div>
                                ${child.strand ? `
                                <div class="flex justify-between">
                                    <span class="text-gray-600">Strand:</span>
                                    <span class="font-medium">${child.strand}</span>
                                </div>
                                ` : ''}
                                <div class="flex justify-between">
                                    <span class="text-gray-600">LRN:</span>
                                    <span class="font-medium">${child.lrn || 'N/A'}</span>
                                </div>
                            </div>
                        </div>

                        <div class="bg-gray-50 rounded-lg p-4">
                            <h4 class="font-semibold text-gray-700 mb-3">Today's Activity</h4>
                            ${todayRecords.length > 0 ? todayRecords.map(record => `
                                <div class="mb-2 p-2 bg-white rounded border">
                                    <div class="flex justify-between items-center">
                                        <span class="font-medium">${record.entryType === 'entry' ? 'Arrival' : 'Departure'}</span>
                                        <span class="px-2 py-1 rounded text-xs ${EducareTrack.getStatusColor(record.status)}">
                                            ${record.status}
                                        </span>
                                    </div>
                                    <div class="text-xs text-gray-600">
                                        Time: ${record.time} • Session: ${record.session}
                                    </div>
                                </div>
                            `).join('') : `
                                <div class="text-center text-gray-500 py-2">
                                    No activity recorded today
                                </div>
                            `}
                        </div>
                    </div>

                    <!-- Subjects -->
                    <div class="bg-gray-50 rounded-lg p-4">
                        <h4 class="font-semibold text-gray-700 mb-3">Subjects</h4>
                        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                            ${child.subjects && child.subjects.length > 0 ? 
                                child.subjects.map(subject => `
                                    <div class="bg-white p-2 rounded border text-center text-sm">
                                        ${subject}
                                    </div>
                                `).join('') : 
                                '<div class="col-span-full text-center text-gray-500 py-4">No subjects assigned</div>'
                            }
                        </div>
                    </div>

                    <!-- Recent Clinic Visits -->
                    ${clinicVisits.length > 0 ? `
                    <div class="bg-gray-50 rounded-lg p-4">
                        <h4 class="font-semibold text-gray-700 mb-3">Recent Clinic Visits (Last 7 Days)</h4>
                        <div class="space-y-2">
                            ${clinicVisits.map(visit => `
                                <div class="bg-white p-3 rounded border">
                                    <div class="flex justify-between items-center mb-1">
                                        <span class="font-medium">${EducareTrack.formatDate(visit.timestamp?.toDate())}</span>
                                        <span class="px-2 py-1 rounded text-xs ${visit.checkIn ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}">
                                            ${visit.checkIn ? 'Check-in' : 'Check-out'}
                                        </span>
                                    </div>
                                    <div class="text-sm text-gray-600">
                                        ${visit.reason ? `Reason: ${visit.reason}` : 'No reason provided'}
                                        ${visit.notes ? `<br>Notes: ${visit.notes}` : ''}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}
                </div>
            `;

            modal.classList.remove('hidden');
        } catch (error) {
            console.error('Error loading child details:', error);
            this.showNotification('Error loading child details', 'error');
        }
    }

    viewChildAttendance(childId) {
        window.location.href = `parent-attendance.html?child=${childId}`;
    }

    viewChildAcademicDetails(childId) {
        // This would typically open a detailed academic progress modal
        this.showNotification('Detailed academic view would open here', 'info');
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

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    window.parentChildren = new ParentChildren();
});
