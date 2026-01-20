class TeacherStudents {
    constructor() {
        this.currentUser = null;
        this.classStudents = [];
        this.filteredStudents = [];
        this.currentClass = null;
        this.init();
    }

    async init() {
        try {
            this.showLoading();
            
            // Wait for EducareTrack to be ready
            if (!window.EducareTrack || !window.firebase) {
                console.log('Waiting for dependencies...');
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
            console.log('Current user:', this.currentUser);
            
            if (this.currentUser.role !== 'teacher') {
                window.location.href = `../${this.currentUser.role}/${this.currentUser.role}-dashboard.html`;
                return;
            }

            this.updateUI();

            if (!this.currentUser.classId) {
                console.error('No classId assigned to teacher');
                this.classStudents = [];
                this.filteredStudents = [];
                this.renderStudents();
                this.showNotification('No class assigned to your account', 'warning');
            } else {
                await this.loadTeacherClass();
                await this.loadClassStudents();
            }

            await this.loadNotificationCount();
            this.initEventListeners();
            
            this.hideLoading();
        } catch (error) {
            console.error('Teacher students initialization failed:', error);
            this.hideLoading();
            this.showNotification('Failed to initialize: ' + error.message, 'error');
        }
    }

    async loadTeacherClass() {
        try {
            if (this.currentUser.classId) {
                this.currentClass = await EducareTrack.getClassById(this.currentUser.classId);
                console.log('Teacher class:', this.currentClass);
            }
        } catch (error) {
            console.error('Error loading teacher class:', error);
        }
    }

    updateUI() {
        const userNameEl = document.getElementById('userName');
        const userRoleEl = document.getElementById('userRole');
        const userInitialsEl = document.getElementById('userInitials');
        if (userNameEl) userNameEl.textContent = this.currentUser.name;
        if (userRoleEl) userRoleEl.textContent = this.currentUser.role;
        if (userInitialsEl) userInitialsEl.textContent = this.currentUser.name
            .split(' ')
            .map(n => n[0])
            .join('')
            .substring(0, 2)
            .toUpperCase();

        const assignedClassEl = document.getElementById('assignedClass');
        if (this.currentClass && assignedClassEl) {
            assignedClassEl.textContent = this.currentClass.name || 'Class ' + this.currentUser.classId;
        } else if (this.currentUser.classId && assignedClassEl) {
            assignedClassEl.textContent = 'Class ' + this.currentUser.classId;
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

    // ENHANCED: Improved student loading with better error handling
    async loadClassStudents() {
        try {
            console.log('Loading students for class:', this.currentUser.classId);
            
            if (!this.currentUser.classId) {
                console.error('No classId assigned to teacher');
                this.showNotification('No class assigned to your account', 'error');
                return;
            }

            // Try multiple methods to load students
            let students = [];
            
            // Method 1: Use EducareTrack method
            try {
                students = await EducareTrack.getStudentsByClass(this.currentUser.classId);
                console.log('Loaded students via EducareTrack:', students);
            } catch (error) {
                console.log('EducareTrack method failed, trying direct query...');
            }
            
            // Method 2: If no students found, try direct query
            if (students.length === 0) {
                try {
                    const snapshot = await EducareTrack.db.collection('students')
                        .where('classId', '==', this.currentUser.classId)
                        .where('isActive', '==', true)
                        .get();
                        
                    students = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    console.log('Loaded students via direct query:', students);
                } catch (error) {
                    console.log('Direct query failed:', error);
                }
            }
            
            // Method 3: If still no students, check if we're looking at the wrong class
            if (students.length === 0) {
                console.log('No students found in assigned class, checking all students...');
                const allStudents = await EducareTrack.getStudents(true);
                
                // Check if teacher should have Kindergarten students
                if (this.currentClass && this.currentClass.grade === 'Kindergarten') {
                    students = allStudents.filter(student => 
                        student.grade === 'Kindergarten' && student.isActive
                    );
                    console.log('Found Kindergarten students:', students);
                } else {
                    // Filter by class ID as fallback
                    students = allStudents.filter(student => 
                        student.classId === this.currentUser.classId && student.isActive
                    );
                }
            }
            
            this.classStudents = students;
            this.filteredStudents = [...students];
            this.renderStudents();
            
            // Update student count display
            this.updateStudentCount();
            
        } catch (error) {
            console.error('Error loading class students:', error);
            this.showNotification('Error loading students: ' + error.message, 'error');
            this.showEmptyState(error.message);
        }
    }

    updateStudentCount() {
        const studentCountEl = document.getElementById('studentCount');
        if (studentCountEl) {
            studentCountEl.textContent = this.classStudents.length;
        }
    }

    showEmptyState(errorMessage = '') {
        const container = document.getElementById('studentsContainer');
        container.innerHTML = `
            <div class="col-span-full text-center py-12">
                <i class="fas fa-exclamation-triangle text-4xl text-yellow-500 mb-4"></i>
                <h3 class="text-lg font-semibold text-gray-600">Unable to load students</h3>
                <p class="text-gray-500">Please check your connection and try again</p>
                ${errorMessage ? `<p class="text-sm text-gray-500 mt-2">Error: ${errorMessage}</p>` : ''}
                <div class="mt-4 space-x-2">
                    <button onclick="window.location.reload()" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                        Retry
                    </button>
                    <button onclick="teacherStudents.debugStudentData()" class="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700">
                        Debug Data
                    </button>
                </div>
            </div>
        `;
    }

    renderStudents() {
        const container = document.getElementById('studentsContainer');
        
        if (this.filteredStudents.length === 0) {
            container.innerHTML = `
                <div class="col-span-full text-center py-12">
                    <i class="fas fa-user-graduate text-4xl text-gray-300 mb-4"></i>
                    <h3 class="text-lg font-semibold text-gray-600">No students found</h3>
                    <p class="text-gray-500">Try adjusting your search criteria</p>
                    ${this.classStudents.length === 0 ? `
                        <p class="text-sm text-gray-500 mt-2">No students are assigned to your class yet.</p>
                    ` : ''}
                </div>
            `;
            return;
        }

        container.innerHTML = this.filteredStudents.map(student => `
            <div class="bg-white rounded-lg shadow-md overflow-hidden card-hover cursor-pointer student-card" data-student-id="${student.id}">
                <div class="p-6">
                    <div class="flex items-center space-x-4 mb-4">
                        <div class="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
                            ${student.photoUrl ? 
                                `<img src="${student.photoUrl}" alt="${student.name}" class="w-16 h-16 rounded-full object-cover">` :
                                `<span class="text-blue-600 font-semibold text-lg">${student.name.split(' ').map(n => n[0]).join('').substring(0, 2)}</span>`
                            }
                        </div>
                        <div class="flex-1">
                            <h3 class="font-semibold text-gray-800 truncate">${student.name}</h3>
                            <p class="text-sm text-gray-600">${student.grade}</p>
                            <p class="text-xs text-gray-500">LRN: ${student.lrn || 'N/A'}</p>
                        </div>
                    </div>
                    
                    <div class="space-y-2">
                        <div class="flex justify-between items-center">
                            <span class="text-sm text-gray-600">Status:</span>
                            <span class="px-2 py-1 rounded-full text-xs font-medium ${this.getStatusColor(student.currentStatus)}">
                                ${this.getStatusText(student.currentStatus)}
                            </span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-sm text-gray-600">Level:</span>
                            <span class="text-sm font-medium">${student.level || 'N/A'}</span>
                        </div>
                        ${student.strand ? `
                        <div class="flex justify-between items-center">
                            <span class="text-sm text-gray-600">Strand:</span>
                            <span class="text-sm font-medium">${student.strand}</span>
                        </div>
                        ` : ''}
                        <div class="flex justify-between items-center">
                            <span class="text-sm text-gray-600">Student ID:</span>
                            <span class="text-sm font-mono">${student.studentId || 'N/A'}</span>
                        </div>
                    </div>
                </div>
                
                <div class="bg-gray-50 px-6 py-3 border-t border-gray-200">
                    <div class="flex justify-between items-center text-sm">
                        <span class="text-gray-600">Last update:</span>
                        <span class="text-gray-500">${this.formatLastUpdate(student.lastAttendance)}</span>
                    </div>
                </div>
            </div>
        `).join('');

        // Add click event listeners to student cards
        document.querySelectorAll('.student-card').forEach(card => {
            card.addEventListener('click', () => {
                const studentId = card.getAttribute('data-student-id');
                this.showStudentDetails(studentId);
            });
        });
    }

    getStatusColor(status) {
        const colors = {
            'in_school': 'bg-green-100 text-green-800',
            'out_school': 'bg-gray-100 text-gray-800',
            'in_clinic': 'bg-blue-100 text-blue-800',
            'present': 'bg-green-100 text-green-800',
            'absent': 'bg-red-100 text-red-800',
            'late': 'bg-yellow-100 text-yellow-800'
        };
        return colors[status] || 'bg-gray-100 text-gray-800';
    }

    getStatusText(status) {
        const texts = {
            'in_school': 'In School',
            'out_school': 'Not in School',
            'in_clinic': 'In Clinic',
            'present': 'Present',
            'absent': 'Absent',
            'late': 'Late'
        };
        return texts[status] || 'Unknown';
    }

    formatLastUpdate(date) {
        if (!date) return 'Never';
        const now = new Date();
        const lastUpdate = new Date(date.toDate ? date.toDate() : date);
        const diffMs = now - lastUpdate;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        return `${diffDays}d ago`;
    }

    async showStudentDetails(studentId) {
        try {
            this.showLoading();
            
            const student = this.classStudents.find(s => s.id === studentId);
            if (!student) {
                throw new Error('Student not found');
            }

            // Load additional student data
            const [attendanceRecords, clinicVisits, parentInfo] = await Promise.all([
                this.getAttendanceByStudent(studentId),
                this.getClinicVisitsByStudent(studentId),
                EducareTrack.getUserById(student.parentId)
            ]);

            const schoolDays = this.countUniqueEntryDays(attendanceRecords);
            const lateArrivals = this.countUniqueLateDays(attendanceRecords);
            const modalContent = document.getElementById('studentDetailContent');
            modalContent.innerHTML = `
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <!-- Student Info -->
                    <div class="lg:col-span-1">
                        <div class="text-center">
                            <div class="w-24 h-24 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
                                ${student.photoUrl ? 
                                    `<img src="${student.photoUrl}" alt="${student.name}" class="w-24 h-24 rounded-full object-cover">` :
                                    `<span class="text-blue-600 font-semibold text-2xl">${student.name.split(' ').map(n => n[0]).join('').substring(0, 2)}</span>`
                                }
                            </div>
                            <h3 class="text-xl font-bold text-gray-800">${student.name}</h3>
                            <p class="text-gray-600">${student.grade} • ${student.level || 'N/A'}</p>
                            ${student.strand ? `<p class="text-gray-600">${student.strand}</p>` : ''}
                            <div class="mt-2">
                                <span class="px-3 py-1 rounded-full text-sm font-medium ${this.getStatusColor(student.currentStatus)}">
                                    ${this.getStatusText(student.currentStatus)}
                                </span>
                            </div>
                        </div>

                        <div class="mt-6 space-y-3">
                            <div class="flex justify-between">
                                <span class="text-gray-600">LRN:</span>
                                <span class="font-medium">${student.lrn || 'N/A'}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-600">Student ID:</span>
                                <span class="font-medium">${student.studentId || 'N/A'}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-600">Class:</span>
                                <span class="font-medium">${this.currentClass?.name || 'N/A'}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Parent & Contact Info -->
                    <div class="lg:col-span-2">
                        <div class="bg-gray-50 rounded-lg p-4 mb-6">
                            <h4 class="font-semibold text-gray-800 mb-3">Parent/Guardian Information</h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <p class="text-sm text-gray-600">Name</p>
                                    <p class="font-medium">${parentInfo?.name || 'N/A'}</p>
                                </div>
                                <div>
                                    <p class="text-sm text-gray-600">Relationship</p>
                                    <p class="font-medium">${parentInfo?.relationship || 'Parent'}</p>
                                </div>
                                <div>
                                    <p class="text-sm text-gray-600">Phone</p>
                                    <p class="font-medium">${parentInfo?.phone || 'N/A'}</p>
                                </div>
                                <div>
                                    <p class="text-sm text-gray-600">Emergency Contact</p>
                                    <p class="font-medium">${parentInfo?.emergencyContact || parentInfo?.phone || 'N/A'}</p>
                                </div>
                            </div>
                        </div>

                        <!-- Quick Stats -->
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                            <div class="bg-white border border-gray-200 rounded-lg p-4 text-center">
                                <div class="text-2xl font-bold text-blue-600">${schoolDays}</div>
                                <div class="text-sm text-gray-600">School Days</div>
                            </div>
                            <div class="bg-white border border-gray-200 rounded-lg p-4 text-center">
                                <div class="text-2xl font-bold text-yellow-600">${lateArrivals}</div>
                                <div class="text-sm text-gray-600">Late Arrivals</div>
                            </div>
                            <div class="bg-white border border-gray-200 rounded-lg p-4 text-center">
                                <div class="text-2xl font-bold text-blue-600">${clinicVisits.filter(v => v.checkIn).length}</div>
                                <div class="text-sm text-gray-600">Clinic Visits</div>
                            </div>
                            <div class="bg-white border border-gray-200 rounded-lg p-4 text-center">
                                <div class="text-2xl font-bold text-green-600">${this.calculateAttendanceRate(attendanceRecords)}%</div>
                                <div class="text-sm text-gray-600">Attendance Rate</div>
                            </div>
                        </div>

                        <!-- Recent Activity -->
                        <div>
                            <h4 class="font-semibold text-gray-800 mb-3">Recent Activity</h4>
                            <div class="space-y-2 max-h-40 overflow-y-auto">
                                ${this.getRecentActivity(attendanceRecords, clinicVisits)}
                            </div>
                        </div>
                    </div>
                </div>
            `;

            this.hideLoading();
            document.getElementById('studentDetailModal').classList.remove('hidden');
        } catch (error) {
            console.error('Error loading student details:', error);
            this.hideLoading();
            this.showNotification('Error loading student details', 'error');
        }
    }

    calculateAttendanceRate(attendanceRecords) {
        const entryDays = new Set();
        const presentLateDays = new Set();
        attendanceRecords.forEach(a => {
            const ts = a.timestamp;
            if (ts && a.entryType === 'entry') {
                const d = ts.toDate ? ts.toDate() : new Date(ts);
                const key = d.toDateString();
                entryDays.add(key);
                if (a.status === 'present' || a.status === 'late') {
                    presentLateDays.add(key);
                }
            }
        });
        const total = entryDays.size;
        const present = presentLateDays.size;
        return total > 0 ? Math.round((present / total) * 100) : 0;
    }

    countUniqueEntryDays(attendanceRecords) {
        const days = new Set();
        attendanceRecords.forEach(a => {
            const ts = a.timestamp;
            if (ts && a.entryType === 'entry') {
                const d = ts.toDate ? ts.toDate() : new Date(ts);
                days.add(d.toDateString());
            }
        });
        return days.size;
    }

    countUniqueLateDays(attendanceRecords) {
        const days = new Set();
        attendanceRecords.forEach(a => {
            const ts = a.timestamp;
            if (ts && a.entryType === 'entry' && a.status === 'late') {
                const d = ts.toDate ? ts.toDate() : new Date(ts);
                days.add(d.toDateString());
            }
        });
        return days.size;
    }

    getRecentActivity(attendanceRecords, clinicVisits) {
        const allActivities = [
            ...attendanceRecords.map(record => ({
                type: 'attendance',
                timestamp: record.timestamp,
                text: `${record.entryType === 'entry' ? 'Arrived' : 'Left'} at ${record.time}${record.status === 'late' ? ' (Late)' : ''}`,
                icon: record.entryType === 'entry' ? 'fas fa-sign-in-alt' : 'fas fa-sign-out-alt',
                color: record.status === 'late' ? 'text-yellow-600' : 'text-green-600'
            })),
            ...clinicVisits.map(visit => ({
                type: 'clinic',
                timestamp: visit.timestamp,
                text: `${visit.checkIn ? 'Checked into' : 'Checked out from'} clinic${visit.reason ? ` - ${visit.reason}` : ''}`,
                icon: 'fas fa-clinic-medical',
                color: 'text-blue-600'
            }))
        ];

        // Sort by timestamp (newest first) and take top 5
        const recentActivities = allActivities
            .sort((a, b) => {
                const dateA = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp);
                const dateB = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp);
                return dateB - dateA;
            })
            .slice(0, 5);

        if (recentActivities.length === 0) {
            return '<p class="text-gray-500 text-sm">No recent activity</p>';
        }

        return recentActivities.map(activity => `
            <div class="flex items-center space-x-3 p-2 bg-gray-50 rounded">
                <i class="${activity.icon} ${activity.color}"></i>
                <div class="flex-1">
                    <p class="text-sm">${activity.text}</p>
                    <p class="text-xs text-gray-500">${this.formatLastUpdate(activity.timestamp)}</p>
                </div>
            </div>
        `).join('');
    }

    async getAttendanceByStudent(studentId) {
        try {
            const snapshot = await EducareTrack.db.collection('attendance')
                .where('studentId', '==', studentId)
                .orderBy('timestamp', 'desc')
                .limit(20)
                .get();

            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error('Error getting attendance by student:', error);
            return [];
        }
    }

    async getClinicVisitsByStudent(studentId) {
        try {
            const snapshot = await EducareTrack.db.collection('clinicVisits')
                .where('studentId', '==', studentId)
                .orderBy('timestamp', 'desc')
                .limit(20)
                .get();

            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error('Error getting clinic visits by student:', error);
            return [];
        }
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

    // NEW: Debug function to check data
    async debugStudentData() {
        console.log('=== DEBUG STUDENT DATA ===');
        console.log('Current Teacher:', this.currentUser);
        console.log('Teacher Class ID:', this.currentUser.classId);
        
        // Get all students
        const allStudents = await EducareTrack.getStudents(true);
        console.log('All students in system:', allStudents);
        
        // Check students in teacher's class
        const studentsInClass = allStudents.filter(s => s.classId === this.currentUser.classId);
        console.log('Students in teacher class:', studentsInClass);
        
        // Check Kindergarten students specifically
        const kindergartenStudents = allStudents.filter(s => s.grade === 'Kindergarten');
        console.log('All Kindergarten students:', kindergartenStudents);
        
        // Check classes
        const allClasses = await EducareTrack.getClasses(true);
        console.log('All classes:', allClasses);
        
        // Check if teacher's class exists
        const teacherClass = allClasses.find(c => c.id === this.currentUser.classId);
        console.log('Teacher class details:', teacherClass);
        
        // Check if there's a Kindergarten class
        const kindergartenClass = allClasses.find(c => c.grade === 'Kindergarten');
        console.log('Kindergarten class:', kindergartenClass);
        
        console.log('=== END DEBUG ===');
        
        this.showNotification('Debug data logged to console', 'info');
    }

    initEventListeners() {
        // Search functionality
        const searchEl = document.getElementById('searchStudents');
        const statusEl = document.getElementById('statusFilter');
        if (searchEl) {
            searchEl.addEventListener('input', (e) => {
                this.filterStudents(e.target.value, statusEl ? statusEl.value : 'all');
            });
        }

        // Status filter
        if (statusEl) {
            statusEl.addEventListener('change', (e) => {
                const searchVal = searchEl ? searchEl.value : '';
                this.filterStudents(searchVal, e.target.value);
            });
        }

        // Export functionality
        const exportBtn = document.getElementById('exportStudents');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this.exportStudents();
            });
        }

        // Debug functionality
        const debugBtn = document.getElementById('debugBtn');
        if (debugBtn) {
            debugBtn.addEventListener('click', () => {
                this.debugStudentData();
            });
        }

        // Refresh functionality
        const refreshBtn = document.getElementById('refreshStudents');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadClassStudents();
            });
        }

        // Modal close
        const closeModalEl = document.getElementById('closeStudentModal');
        if (closeModalEl) {
            closeModalEl.addEventListener('click', () => {
                this.hideStudentDetails();
            });
        }

        const closeBtnEl = document.getElementById('closeStudentBtn');
        if (closeBtnEl) {
            closeBtnEl.addEventListener('click', () => {
                this.hideStudentDetails();
            });
        }

        // Close modal on outside click
        const detailModalEl = document.getElementById('studentDetailModal');
        if (detailModalEl) {
            detailModalEl.addEventListener('click', (e) => {
                if (e.target.id === 'studentDetailModal') {
                    this.hideStudentDetails();
                }
            });
        }

        // Escape key to close modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideStudentDetails();
            }
        });

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
            logoutBtn.addEventListener('click', () => {
                if (confirm('Are you sure you want to logout?')) {
                    EducareTrack.logout();
                    window.location.href = '../index.html';
                }
            });
        }

        window.addEventListener('educareTrack:newNotifications', () => {
            this.loadNotificationCount();
        });
    }

    filterStudents(searchTerm, statusFilter) {
        this.filteredStudents = this.classStudents.filter(student => {
            const matchesSearch = student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                student.lrn?.includes(searchTerm) ||
                                student.studentId?.includes(searchTerm);
            const matchesStatus = statusFilter === 'all' || student.currentStatus === statusFilter;
            return matchesSearch && matchesStatus;
        });
        this.renderStudents();
    }

    async exportStudents() {
        try {
            this.showLoading();
            
            const csvContent = this.generateCSV();
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            
            link.setAttribute('href', url);
            link.setAttribute('download', `students_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            this.hideLoading();
            this.showNotification('Students exported successfully', 'success');
        } catch (error) {
            console.error('Error exporting students:', error);
            this.hideLoading();
            this.showNotification('Error exporting students', 'error');
        }
    }

    generateCSV() {
        const headers = ['Name', 'LRN', 'Grade', 'Level', 'Strand', 'Status', 'Student ID', 'Class'];
        const rows = this.filteredStudents.map(student => [
            student.name,
            student.lrn || 'N/A',
            student.grade,
            student.level || 'N/A',
            student.strand || 'N/A',
            this.getStatusText(student.currentStatus),
            student.studentId || 'N/A',
            this.currentClass?.name || 'N/A'
        ]);

        return [headers, ...rows].map(row => row.map(field => `"${field}"`).join(',')).join('\n');
    }

    hideStudentDetails() {
        document.getElementById('studentDetailModal').classList.add('hidden');
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
            window.EducareTrack.showNormalNotification({ title: type === 'error' ? 'Error' : (type === 'warning' ? 'Warning' : 'Info'), message, type });
        }
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    window.teacherStudents = new TeacherStudents();
});
