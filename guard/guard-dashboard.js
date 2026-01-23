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
            // Load dashboard stats with proper present/late counts
            const stats = await this.getTodayStats();
            this.dashboardData.stats = stats;
            this.updateStatsDisplay(stats);

            // Load recent activity
            await this.loadRecentActivity();

            // Load current school status
            await this.loadSchoolStatus();

        } catch (error) {
            console.error('Error loading dashboard data:', error);
        }
    }

    updateStatsDisplay(stats) {
        document.getElementById('totalStudents').textContent = stats.totalStudents || 0;
        document.getElementById('presentToday').textContent = stats.presentToday || 0;
        document.getElementById('currentlyAbsent').textContent = (stats.totalStudents - stats.presentToday) || 0;
        document.getElementById('lateArrivals').textContent = stats.lateToday || 0;
    }

    async getTodayStats() {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            // Get total students (excluding withdrawn/transferred)
            const totalStudentsSnapshot = await window.EducareTrack.db.collection('students')
                .where('current_status', 'not-in', ['withdrawn', 'transferred', 'graduated'])
                .get();
            const totalStudents = totalStudentsSnapshot.size;
            
            // Get today's attendance entries
            const attendanceSnapshot = await window.EducareTrack.db.collection('attendance')
                .where('timestamp', '>=', today)
                .where('entry_type', '==', 'entry')
                .get();
            
            let presentToday = 0;
            let lateToday = 0;
            const uniqueStudentIds = new Set();
            
            attendanceSnapshot.forEach(doc => {
                const data = doc.data();
                const studentId = data.student_id;
                
                // Count each student only once per day
                if (!uniqueStudentIds.has(studentId)) {
                    uniqueStudentIds.add(studentId);
                    
                    if (data.status === 'present' || data.status === 'ontime') {
                        presentToday++;
                    } else if (data.status === 'late') {
                        presentToday++; // Late students are still present
                        lateToday++;
                    }
                }
            });
            
            return {
                totalStudents,
                presentToday,
                lateToday
            };
        } catch (error) {
            console.error('Error getting today stats:', error);
            return {
                totalStudents: 0,
                presentToday: 0,
                lateToday: 0
            };
        }
    }

    async loadRecentActivity() {
        try {
            const container = document.getElementById('recentActivity');
            container.innerHTML = ''; // Clear existing content
            
            const snapshot = await window.EducareTrack.db.collection('attendance')
                .orderBy('timestamp', 'desc')
                .limit(10)
                .get();
            
            const docs = snapshot.docs;
            // Process in reverse order to show newest first
            for (let i = docs.length - 1; i >= 0; i--) {
                const doc = docs[i];
                const data = doc.data();
                let studentName = data.student_name || data.studentName;
                
                // If no student name in attendance record, fetch from student collection
                if (!studentName && data.student_id) {
                    try {
                        const studentDoc = await window.EducareTrack.db.collection('students').doc(data.student_id).get();
                        if (studentDoc.exists) {
                            const studentData = studentDoc.data();
                            studentName = `${studentData.first_name || ''} ${studentData.last_name || ''}`.trim() || 'Unknown Student';
                        }
                    } catch (error) {
                        console.error('Error fetching student name:', error);
                        studentName = 'Unknown Student';
                    }
                }
                
                this.addRecentActivityItem({
                    studentName: studentName || 'Unknown Student',
                    time: data.time,
                    entryType: data.entry_type || data.entryType || 'Unknown',
                    status: data.status || 'unknown'
                });
            }
        } catch (error) {
            console.error('Error loading recent activity:', error);
            const container = document.getElementById('recentActivity');
            container.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <svg class="w-12 h-12 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    <p>Error loading recent activity</p>
                </div>
            `;
        }
    }

    addRecentActivityItem(scanData) {
        const recentActivityDiv = document.getElementById('recentActivity');
        const statusColor = this.getStatusColor(scanData.status);
        
        const scanElement = document.createElement('div');
        scanElement.className = 'flex items-center justify-between p-3 bg-gray-50 rounded-lg';
        scanElement.innerHTML = `
            <div>
                <h4 class="text-sm font-medium text-gray-900">${scanData.studentName}</h4>
                <p class="text-xs text-gray-600">${scanData.time} • ${scanData.entryType}</p>
            </div>
            <span class="px-2 py-1 text-xs font-semibold rounded-full ${statusColor}">
                ${this.getStatusText(scanData.status)}
            </span>
        `;
        
        if (recentActivityDiv.firstChild) {
            recentActivityDiv.insertBefore(scanElement, recentActivityDiv.firstChild);
        } else {
            recentActivityDiv.appendChild(scanElement);
        }
        
        if (recentActivityDiv.children.length > 10) {
            recentActivityDiv.removeChild(recentActivityDiv.lastChild);
        }
    }

    getStatusColor(status) {
        const colors = {
            'present': 'bg-green-100 text-green-800',
            'late': 'bg-yellow-100 text-yellow-800',
            'absent': 'bg-red-100 text-red-800',
            'excused': 'bg-blue-100 text-blue-800',
            'half_day': 'bg-orange-100 text-orange-800',
            'unknown': 'bg-gray-100 text-gray-800'
        };
        return colors[status] || colors.unknown;
    }

    getStatusText(status) {
        const texts = {
            'present': 'Present',
            'late': 'Late',
            'absent': 'Absent',
            'excused': 'Excused',
            'half_day': 'Half Day',
            'unknown': 'Unknown'
        };
        return texts[status] || texts.unknown;
    }

    async loadSchoolStatus() {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            // Get all active students (excluding withdrawn/transferred)
            const studentsSnapshot = await window.EducareTrack.db.collection('students')
                .where('current_status', 'not-in', ['withdrawn', 'transferred', 'graduated'])
                .get();
            const allStudents = studentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // Get today's attendance records
            const attendanceSnapshot = await window.EducareTrack.db.collection('attendance')
                .where('timestamp', '>=', today)
                .get();
            
            // Get today's clinic visits
            const clinicSnapshot = await window.EducareTrack.db.collection('clinicVisits')
                .where('timestamp', '>=', today)
                .where('check_in', '==', true)
                .get();
            
            const statusCounts = {
                in_school: 0,
                out_school: 0,
                in_clinic: 0
            };
            
            // Track each student's latest status today
            const studentStatuses = new Map();
            
            // Process attendance records to determine in/out status
            attendanceSnapshot.forEach(doc => {
                const data = doc.data();
                const studentId = data.student_id;
                const timestamp = data.timestamp.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
                
                if (!studentStatuses.has(studentId) || timestamp > studentStatuses.get(studentId).timestamp) {
                    studentStatuses.set(studentId, {
                        status: data.entry_type === 'entry' ? 'in_school' : 'out_school',
                        timestamp: timestamp
                    });
                }
            });
            
            // Process clinic visits (clinic visits override attendance status)
            clinicSnapshot.forEach(doc => {
                const data = doc.data();
                const studentId = data.student_id;
                const timestamp = data.timestamp.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
                
                // If student is in clinic, mark them as such
                studentStatuses.set(studentId, {
                    status: 'in_clinic',
                    timestamp: timestamp
                });
            });
            
            // Count statuses for all active students
            allStudents.forEach(student => {
                const status = studentStatuses.get(student.id)?.status || 'out_school'; // Default to out if no record today
                statusCounts[status] = (statusCounts[status] || 0) + 1;
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
                `${student.first_name || ''} ${student.last_name || ''}`.trim().toLowerCase().includes(searchTerm.toLowerCase()) ||
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
                <div class="font-medium">${`${(student.first_name || '')} ${(student.last_name || '')}`.trim()}</div>
                <div class="text-sm text-gray-600">${student.id}${student.classId ? ` • ${student.classId}` : ''}</div>
                <div class="text-xs text-gray-500">${student.classId || 'No class assigned'}</div>
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

        document.getElementById('studentSearch').value = `${(student.first_name || '' + ' ' + student.last_name || '').trim()} (${student.id})`;
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

            // Use core.js to record attendance with custom time
            await EducareTrack.recordGuardAttendance(this.selectedStudent.id, this.selectedStudent, entryType, now);
            
            this.showNotification(`${`${(this.selectedStudent.first_name || '')} ${(this.selectedStudent.last_name || '')}`.trim()} ${entryType === 'entry' ? 'arrival' : 'departure'} recorded successfully`, 'success');
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
        this.unsubscribeAttendance = EducareTrack.db.collection('attendance')
            .orderBy('timestamp', 'desc')
            .limit(1)
            .onSnapshot(snapshot => {
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'added') {
                        // Only update stats and add single new item instead of reloading everything
                        this.updateTodayStats();
                        this.addNewAttendanceItem(change.doc.data());
                    }
                });
            });

        // Listen for student status changes (excluding withdrawn/transferred students)
        this.unsubscribeStudents = EducareTrack.db.collection('students')
            .where('current_status', 'not-in', ['withdrawn', 'transferred', 'graduated'])
            .onSnapshot(snapshot => {
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'modified') {
                        this.loadSchoolStatus(); // Refresh status counts
                    }
                    if (change.type === 'added' || change.type === 'removed') {
                        this.updateTodayStats(); // Only update stats, don't reload recent activity
                    }
                });
            });
    }

    async updateTodayStats() {
        try {
            const stats = await this.getTodayStats();
            this.updateStatsDisplay(stats);
        } catch (error) {
            console.error('Error updating today stats:', error);
        }
    }

    async addNewAttendanceItem(attendanceData) {
        try {
            let studentName = attendanceData.student_name || attendanceData.studentName;
            
            // If no student name in attendance record, fetch from student collection
            if (!studentName && attendanceData.student_id) {
                try {
                    const studentDoc = await window.EducareTrack.db.collection('students').doc(attendanceData.student_id).get();
                    if (studentDoc.exists) {
                        const studentData = studentDoc.data();
                        studentName = `${studentData.first_name || ''} ${studentData.last_name || ''}`.trim() || 'Unknown Student';
                    }
                } catch (error) {
                    console.error('Error fetching student name:', error);
                    studentName = 'Unknown Student';
                }
            }
            
            this.addRecentActivityItem({
                studentName: studentName || 'Unknown Student',
                time: attendanceData.time,
                entryType: attendanceData.entry_type || attendanceData.entryType || 'Unknown',
                status: attendanceData.status || 'unknown'
            });
        } catch (error) {
            console.error('Error adding new attendance item:', error);
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

function loadRecentActivity() {
    if (window.guardDashboard) {
        window.guardDashboard.loadRecentActivity();
    }
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
