// guard-dashboard.js
class GuardDashboard {
    constructor() {
        this.currentUser = null;
        this.dashboardData = {
            stats: {},
            recentActivity: [],
            schoolStatus: {}
        };
        this.init();
    }

    async init() {
        await this.checkAuth();
        await this.loadDashboardData();
        this.initEventListeners();
        this.startRealTimeUpdates();
    }

    async checkAuth() {
        try {
            if (!EducareTrack.currentUser || EducareTrack.currentUserRole !== 'guard') {
                window.location.href = '../index.html';
                return;
            }
            
            this.currentUser = EducareTrack.currentUser;
            document.getElementById('userName').textContent = this.currentUser.name;
        } catch (error) {
            console.error('Auth check failed:', error);
            window.location.href = '../index.html';
        }
    }

    async loadDashboardData() {
        try {
            // Load dashboard stats
            const stats = await EducareTrack.getDashboardStats();
            this.dashboardData.stats = stats;
            this.updateStatsDisplay(stats);

            // Load recent activity
            const activity = await EducareTrack.getRecentActivity(10);
            this.dashboardData.recentActivity = activity;
            this.updateRecentActivity(activity);

            // Load current school status
            await this.loadSchoolStatus();

        } catch (error) {
            console.error('Error loading dashboard data:', error);
        }
    }

    updateStatsDisplay(stats) {
        document.getElementById('totalStudents').textContent = stats.totalStudents || 0;
        document.getElementById('presentToday').textContent = stats.presentToday || 0;
        document.getElementById('lateArrivals').textContent = this.dashboardData.recentActivity.filter(
            activity => activity.status === 'late'
        ).length;
        document.getElementById('currentlyAbsent').textContent = (stats.totalStudents - stats.presentToday) || 0;
    }

    updateRecentActivity(activities) {
        const container = document.getElementById('recentActivity');
        
        if (!activities || activities.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <svg class="w-12 h-12 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    <p>No recent activity found</p>
                </div>
            `;
            return;
        }

        container.innerHTML = activities.map(activity => {
            const time = EducareTrack.formatTime(activity.timestamp);
            const statusColor = EducareTrack.getStatusColor(activity.status);
            const statusText = EducareTrack.getStatusText(activity.status);
            
            return `
                <div class="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div class="flex items-center space-x-3">
                        <div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                            <span class="text-blue-600 font-semibold text-sm">${activity.studentName ? activity.studentName.charAt(0).toUpperCase() : 'S'}</span>
                        </div>
                        <div>
                            <h4 class="text-sm font-medium text-gray-900">${activity.studentName || 'Unknown Student'}</h4>
                            <p class="text-xs text-gray-600">${time} • ${activity.entryType === 'entry' ? 'Arrived' : 'Departed'}</p>
                        </div>
                    </div>
                    <span class="px-2 py-1 text-xs font-semibold rounded-full ${statusColor}">
                        ${statusText}
                    </span>
                </div>
            `;
        }).join('');
    }

    async loadSchoolStatus() {
        try {
            const students = await EducareTrack.getStudents();
            
            const statusCounts = {
                in_school: 0,
                out_school: 0,
                in_clinic: 0
            };

            students.forEach(student => {
                statusCounts[student.current_status] = (statusCounts[student.current_status] || 0) + 1;
            });

            this.dashboardData.schoolStatus = statusCounts;
            this.updateSchoolStatusDisplay(statusCounts);
        } catch (error) {
            console.error('Error loading school status:', error);
        }
    }

    updateSchoolStatusDisplay(statusCounts) {
        document.getElementById('inSchoolCount').textContent = statusCounts.in_school || 0;
        document.getElementById('inClinicCount').textContent = statusCounts.in_clinic || 0;
        document.getElementById('outSchoolCount').textContent = statusCounts.out_school || 0;
    }

    initEventListeners() {
        const bell = document.getElementById('notificationBell');
        if (bell) {
            bell.addEventListener('click', () => {
                window.location.href = '../notifications.html';
            });
        }

        // Manual entry modal
        document.getElementById('studentSearch').addEventListener('input', (e) => {
            this.searchStudents(e.target.value);
        });

        // Set current time as default
        const now = new Date();
        document.getElementById('manualTime').value = now.toTimeString().substring(0, 5);

        // Demo controls
        this.initDemoControls();

        window.addEventListener('educareTrack:newNotifications', () => {
            if (window.EducareTrack && typeof window.EducareTrack.updateNotificationBadge === 'function') {
                window.EducareTrack.updateNotificationBadge();
            }
        });
    }

    async searchStudents(searchTerm) {
        const resultsContainer = document.getElementById('studentResults');
        
        if (searchTerm.length < 2) {
            resultsContainer.innerHTML = '';
            resultsContainer.classList.add('hidden');
            return;
        }

        try {
            const students = await EducareTrack.getStudents();
            const filteredStudents = students.filter(student => 
                student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                student.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (student.lrn && student.lrn.includes(searchTerm))
            ).slice(0, 5); // Limit to 5 results

            this.displayStudentResults(filteredStudents);
        } catch (error) {
            console.error('Error searching students:', error);
        }
    }

    displayStudentResults(students) {
        const resultsContainer = document.getElementById('studentResults');
        
        if (students.length === 0) {
            resultsContainer.innerHTML = '<div class="p-2 text-gray-500">No students found</div>';
            resultsContainer.classList.remove('hidden');
            return;
        }

        resultsContainer.innerHTML = students.map(student => `
            <div class="p-2 hover:bg-gray-100 cursor-pointer border-b border-gray-200 student-result" 
                 data-student-id="${student.id}">
                <div class="font-medium">${student.name}</div>
                <div class="text-sm text-gray-600">${student.id} • ${student.grade}</div>
                <div class="text-xs text-gray-500">${student.class_id || 'No class assigned'}</div>
            </div>
        `).join('');

        // Add click event listeners
        resultsContainer.querySelectorAll('.student-result').forEach(element => {
            element.addEventListener('click', (e) => {
                const studentId = element.getAttribute('data-student-id');
                this.selectStudent(studentId, students);
            });
        });

        resultsContainer.classList.remove('hidden');
    }

    async selectStudent(studentId, studentList) {
        const student = studentList.find(s => s.id === studentId);
        if (!student) return;

        document.getElementById('studentSearch').value = `${student.name} (${student.id})`;
        document.getElementById('studentResults').classList.add('hidden');
        
        // Store selected student for submission
        this.selectedStudent = student;
    }

    async submitManualEntry() {
        if (!this.selectedStudent) {
            this.showNotification('Please select a student', 'error');
            return;
        }

        const entryType = document.getElementById('entryType').value;
        const timeValue = document.getElementById('manualTime').value;

        try {
            // Create timestamp with selected time
            const now = new Date();
            const [hours, minutes] = timeValue.split(':');
            now.setHours(parseInt(hours), parseInt(minutes), 0, 0);

            // Use core.js to record attendance
            await EducareTrack.recordGuardAttendance(this.selectedStudent.id, this.selectedStudent, entryType);
            
            this.showNotification(`${this.selectedStudent.name} ${entryType === 'entry' ? 'arrival' : 'departure'} recorded successfully`, 'success');
            this.closeManualEntry();
            
            // Reload dashboard data
            this.loadDashboardData();
        } catch (error) {
            console.error('Error recording manual entry:', error);
            this.showNotification('Failed to record attendance: ' + error.message, 'error');
        }
    }

    openManualEntry() {
        document.getElementById('manualEntryModal').classList.remove('hidden');
        document.getElementById('studentSearch').value = '';
        document.getElementById('studentResults').classList.add('hidden');
        this.selectedStudent = null;
        
        // Set current time
        const now = new Date();
        document.getElementById('manualTime').value = now.toTimeString().substring(0, 5);
    }

    closeManualEntry() {
        document.getElementById('manualEntryModal').classList.add('hidden');
    }

    startRealTimeUpdates() {
        // Listen for new attendance records
        if (window.USE_SUPABASE && window.supabaseClient) {
            // Use Supabase real-time
            window.supabaseClient
                .channel('attendance')
                .on('postgres_changes', 
                    { event: '*', schema: 'public' },
                    (payload) => {
                        if (payload.eventType === 'INSERT') {
                            this.loadDashboardData();
                        }
                    }
                )
                .subscribe();
        } else {
            // Fallback to Firestore
            this.unsubscribeAttendance = EducareTrack.db.collection('attendance')
                .orderBy('timestamp', 'desc')
                .limit(1)
                .onSnapshot(snapshot => {
                    snapshot.docChanges().forEach(change => {
                        if (change.type === 'added') {
                            this.loadDashboardData(); // Refresh data
                        }
                    });
                });
        }

        // Listen for student status changes
        if (window.USE_SUPABASE && window.supabaseClient) {
            // Use Supabase real-time
            window.supabaseClient
                .channel('students')
                .on('postgres_changes', 
                    { event: 'UPDATE', schema: 'public' },
                    (payload) => {
                        if (payload.eventType === 'UPDATE') {
                            this.loadSchoolStatus(); // Refresh status counts
                        }
                    }
                )
                .subscribe();
        } else {
            // Fallback to Firestore
            this.unsubscribeStudents = EducareTrack.db.collection('students')
                .onSnapshot(snapshot => {
                    snapshot.docChanges().forEach(change => {
                        if (change.type === 'modified') {
                            this.loadSchoolStatus(); // Refresh status counts
                        }
                    });
                });
        }
    }

    showNotification(message, type = 'info') {
        if (window.EducareTrack && typeof window.EducareTrack.showNormalNotification === 'function') {
            window.EducareTrack.showNormalNotification({ title: type === 'error' ? 'Error' : 'Info', message, type });
        }
    }

    // Demo controls functionality
    initDemoControls() {
        this.updateTimeDisplay();
        setInterval(() => this.updateTimeDisplay(), 1000);
    }

    updateTimeDisplay() {
        const now = new Date();
        document.getElementById('currentTimeDisplay').textContent = 
            now.toLocaleTimeString('en-PH', { 
                hour: '2-digit', 
                minute: '2-digit',
                second: '2-digit'
            });
    }

    // Demo functions
    async demoFastForwardTime() {
        this.showNotification('Time fast-forwarded by 1 hour (Demo Mode)', 'info');
    }

    demoResetTime() {
        this.showNotification('Time reset to real time (Demo Mode)', 'info');
    }

    async demoGenerateSampleData() {
        try {
            this.showNotification('Generating sample students...', 'info');
            // This would call a function to generate sample data
            // For now, just show a message
            setTimeout(() => {
                this.showNotification('Sample students generated successfully!', 'success');
                this.loadDashboardData();
            }, 2000);
        } catch (error) {
            this.showNotification('Error generating sample data: ' + error.message, 'error');
        }
    }

    demoClearTestData() {
        this.showNotification('Test data cleared (Demo Mode)', 'info');
    }

    demoSetCustomTime() {
        const timeControl = document.getElementById('demoTimeControl');
        this.showNotification(`Custom time set to ${timeControl.value} (Demo Mode)`, 'info');
    }

    demoTestMorningRush() {
        this.showNotification('Morning rush scenario activated (Demo Mode)', 'info');
    }

    demoTestLateArrivals() {
        this.showNotification('Late arrivals scenario activated (Demo Mode)', 'info');
    }

    demoTestLunchExits() {
        this.showNotification('Lunch exits scenario activated (Demo Mode)', 'info');
    }

    demoTestAfternoonArrivals() {
        this.showNotification('Afternoon arrivals scenario activated (Demo Mode)', 'info');
    }

    demoTestSchoolEnd() {
        this.showNotification('School end scenario activated (Demo Mode)', 'info');
    }

    demoTestClinicVisits() {
        this.showNotification('Clinic visits scenario activated (Demo Mode)', 'info');
    }

    openReports() {
        window.location.href = 'guard-reports.html';
    }

    openStudentLookup() {
        window.location.href = 'guard-student-lookup.html';
    }

    destroy() {
        if (this.unsubscribeAttendance) this.unsubscribeAttendance();
        if (this.unsubscribeStudents) this.unsubscribeStudents();
    }
}

// Global functions for HTML onclick handlers
function openManualEntry() {
    if (window.guardDashboard) {
        window.guardDashboard.openManualEntry();
    }
}

function closeManualEntry() {
    if (window.guardDashboard) {
        window.guardDashboard.closeManualEntry();
    }
}

function submitManualEntry() {
    if (window.guardDashboard) {
        window.guardDashboard.submitManualEntry();
    }
}

function openReports() {
    if (window.guardDashboard) {
        window.guardDashboard.openReports();
    }
}

function openStudentLookup() {
    if (window.guardDashboard) {
        window.guardDashboard.openStudentLookup();
    }
}

function logout() {
    EducareTrack.logout();
    window.location.href = '../index.html';
}

// Demo functions
function demoFastForwardTime() {
    if (window.guardDashboard) window.guardDashboard.demoFastForwardTime();
}

function demoResetTime() {
    if (window.guardDashboard) window.guardDashboard.demoResetTime();
}

function demoGenerateSampleData() {
    if (window.guardDashboard) window.guardDashboard.demoGenerateSampleData();
}

function demoClearTestData() {
    if (window.guardDashboard) window.guardDashboard.demoClearTestData();
}

function demoSetCustomTime() {
    if (window.guardDashboard) window.guardDashboard.demoSetCustomTime();
}

function demoTestMorningRush() {
    if (window.guardDashboard) window.guardDashboard.demoTestMorningRush();
}

function demoTestLateArrivals() {
    if (window.guardDashboard) window.guardDashboard.demoTestLateArrivals();
}

function demoTestLunchExits() {
    if (window.guardDashboard) window.guardDashboard.demoTestLunchExits();
}

function demoTestAfternoonArrivals() {
    if (window.guardDashboard) window.guardDashboard.demoTestAfternoonArrivals();
}

function demoTestSchoolEnd() {
    if (window.guardDashboard) window.guardDashboard.demoTestSchoolEnd();
}

function demoTestClinicVisits() {
    if (window.guardDashboard) window.guardDashboard.demoTestClinicVisits();
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    window.guardDashboard = new GuardDashboard();
});
