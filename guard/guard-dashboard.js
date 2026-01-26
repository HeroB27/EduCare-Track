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
            const { data: totalStudentsData, error: totalError } = await window.supabaseClient
                .from('students')
                .select('id')
                .in('current_status', ['enrolled', 'active', 'present']);
            
            if (totalError) throw totalError;
            const totalStudents = totalStudentsData?.length || 0;
            
            // Get today's attendance entries
            const { data: attendanceData, error: attendanceError } = await window.supabaseClient
                .from('attendance')
                .select('student_id, status')
                .gte('timestamp', today.toISOString())
                .eq('method', 'qr'); // Both entry types use QR method
            
            if (attendanceError) throw attendanceError;
            
            let presentToday = 0;
            let lateToday = 0;
            const uniqueStudentIds = new Set();
            
            attendanceData.forEach(record => {
                const studentId = record.student_id;
                
                // Count each student only once per day
                if (!uniqueStudentIds.has(studentId)) {
                    uniqueStudentIds.add(studentId);
                    
                    if (record.status === 'present') {
                        presentToday++;
                    } else if (record.status === 'late') {
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
            
            const { data: attendanceData, error: attendanceError } = await window.supabaseClient
                .from('attendance')
                .select('student_id, timestamp, status, session, remarks, method')
                .order('timestamp', { ascending: false })
                .limit(10);
            
            if (attendanceError) throw attendanceError;
            
            // Process in reverse order to show newest first
            for (let i = attendanceData.length - 1; i >= 0; i--) {
                const record = attendanceData[i];
                let studentName = null;
                
                // Fetch student name from students table
                if (record.student_id) {
                    try {
                        const { data: studentData, error: studentError } = await window.supabaseClient
                            .from('students')
                            .select('full_name')
                            .eq('id', record.student_id)
                            .single();
                        
                        if (!studentError && studentData) {
                            studentName = studentData.full_name;
                        }
                    } catch (error) {
                        console.error('Error fetching student name:', error);
                        studentName = 'Unknown Student';
                    }
                }
                
                // Determine entry type based on remarks (for both manual and QR entries)
                let entryType;
                if (record.remarks && (record.remarks.startsWith('manual_') || record.remarks.startsWith('qr_'))) {
                    entryType = record.remarks.replace(/^(manual|qr)_/, '');
                } else {
                    // Fallback to session-based logic for backward compatibility
                    entryType = record.session === 'AM' ? 'entry' : 'exit';
                }
                
                this.addRecentActivityItem({
                    studentName: studentName || 'Unknown Student',
                    time: new Date(record.timestamp).toTimeString().substring(0, 5),
                    entryType: entryType,
                    status: record.status || 'unknown'
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
            
            // Get all active students
            const { data: studentsData, error: studentsError } = await window.supabaseClient
                .from('students')
                .select('id')
                .in('current_status', ['enrolled', 'active', 'present']);
            
            if (studentsError) throw studentsError;
            
            // Get today's attendance records
            const { data: attendanceData, error: attendanceError } = await window.supabaseClient
                .from('attendance')
                .select('student_id, timestamp, session')
                .gte('timestamp', today.toISOString())
                .order('timestamp', { ascending: false });
            
            if (attendanceError) throw attendanceError;
            
            // Get today's clinic visits
            const { data: clinicData, error: clinicError } = await window.supabaseClient
                .from('clinic_visits')
                .select('student_id, visit_time')
                .gte('visit_time', today.toISOString())
                .order('visit_time', { ascending: false });
            
            if (clinicError) throw clinicError;
            
            const statusCounts = {
                in_school: 0,
                out_school: 0,
                in_clinic: 0
            };
            
            // Track each student's latest status today
            const studentStatuses = new Map();
            
            // Process attendance records to determine in/out status
            attendanceData.forEach(record => {
                const studentId = record.student_id;
                const timestamp = new Date(record.timestamp);
                
                if (!studentStatuses.has(studentId) || timestamp > studentStatuses.get(studentId).timestamp) {
                    studentStatuses.set(studentId, {
                        status: record.session === 'AM' ? 'in_school' : 'out_school',
                        timestamp: timestamp
                    });
                }
            });
            
            // Process clinic visits (clinic visits override attendance status)
            clinicData.forEach(record => {
                const studentId = record.student_id;
                const timestamp = new Date(record.visit_time);
                
                // If student is in clinic, mark them as such
                studentStatuses.set(studentId, {
                    status: 'in_clinic',
                    timestamp: timestamp
                });
            });
            
            // Count statuses for all active students
            studentsData.forEach(student => {
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
            const { data: students, error } = await window.supabaseClient
                .from('students')
                .select('id, full_name, lrn, class_id')
                .or(`full_name.ilike.%${searchTerm}%,id.ilike.%${searchTerm}%,lrn.ilike.%${searchTerm}%`)
                .limit(5);
            
            if (error) throw error;
            
            // Transform data to match expected format
            const transformedStudents = students.map(student => ({
                id: student.id,
                first_name: student.full_name.split(' ')[0],
                last_name: student.full_name.split(' ').slice(1).join(' '),
                name: student.full_name,
                lrn: student.lrn,
                classId: student.class_id
            }));

            this.displayStudentResults(transformedStudents);
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

            // Determine session and status
            const session = parseInt(hours) < 12 ? 'AM' : 'PM';
            const status = entryType === 'entry' ? 
                (timeValue <= '07:30' ? 'present' : 'late') : 'present';

            // Insert attendance record using Supabase
            const { data, error } = await window.supabaseClient
                .from('attendance')
                .insert({
                    student_id: this.selectedStudent.id,
                    class_id: this.selectedStudent.classId || null,
                    session: session,
                    status: status,
                    method: 'manual',
                    timestamp: now.toISOString(),
                    recorded_by: this.currentUser.id,
                    remarks: `manual_${entryType}` // Store entry type in remarks
                });
            
            if (error) throw error;
            
            this.showNotification(`${this.selectedStudent.name || `${this.selectedStudent.first_name || ''} ${this.selectedStudent.last_name || ''}`.trim()} ${entryType === 'entry' ? 'arrival' : 'departure'} recorded successfully`, 'success');
            this.closeManualEntry();
            
            // Reload dashboard data
            this.loadDashboardData();
        } catch (error) {
            console.error('Error recording manual entry:', error);
            this.showNotification('Failed to record attendance: ' + error.message, 'error');
        }
    }

    async sendManualEntryNotification(student, entryType, timeString, status, remarks, attendanceId) {
        try {
            // Get parent-student relationship
            const { data: relationshipData, error: relationshipError } = await window.supabaseClient
                .from('parent_students')
                .select('parent_id')
                .eq('student_id', student.id);
            
            if (relationshipError) {
                console.error('Error fetching parent relationships:', relationshipError);
                return;
            }

            const targetUsers = relationshipData ? relationshipData.map(r => r.parent_id).filter(Boolean) : [];
            
            if (targetUsers.length === 0) {
                console.log('No parents found for notification');
                return;
            }

            const actionType = entryType === 'entry' ? 'arrived' : 'left';
            const notificationTitle = entryType === 'entry' ? 'Student Arrival (Manual Entry)' : 'Student Departure (Manual Entry)';
            
            // Create detailed message
            let message = `${student.name || `${student.first_name || ''} ${student.last_name || ''}`.trim()} has ${actionType} at ${timeString}`;
            if (status === 'late') {
                message += ' - LATE ARRIVAL';
            }

            // Create notification data
            const notificationData = {
                target_users: targetUsers,
                title: notificationTitle,
                message: message,
                type: 'attendance',
                student_id: student.id,
                related_record: attendanceId,
                created_at: new Date().toISOString()
            };

            const { error } = await window.supabaseClient
                .from('notifications')
                .insert(notificationData);
            
            if (error) {
                console.error('Error creating notification:', error);
            } else {
                console.log(`Notification sent to ${targetUsers.length} parents`);
            }
            
        } catch (error) {
            console.error('Error sending manual entry notifications:', error);
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
        // For Supabase, we'll use polling instead of real-time listeners for simplicity
        // In a production environment, you might want to implement Supabase real-time subscriptions
        this.realTimeInterval = setInterval(() => {
            this.updateTodayStats();
            this.loadRecentActivity();
        }, 30000); // Update every 30 seconds
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
            let studentName = null;
            
            // Fetch student name from students table
            if (attendanceData.student_id) {
                try {
                    const { data: studentData, error: studentError } = await window.supabaseClient
                        .from('students')
                        .select('full_name')
                        .eq('id', attendanceData.student_id)
                        .single();
                    
                    if (!studentError && studentData) {
                        studentName = studentData.full_name;
                    }
                } catch (error) {
                    console.error('Error fetching student name:', error);
                    studentName = 'Unknown Student';
                }
            }
            
            // Determine entry type based on remarks (for both manual and QR entries)
            let entryType;
            if (attendanceData.remarks && (attendanceData.remarks.startsWith('manual_') || attendanceData.remarks.startsWith('qr_'))) {
                entryType = attendanceData.remarks.replace(/^(manual|qr)_/, '');
            } else {
                // Fallback to session-based logic for backward compatibility
                entryType = attendanceData.session === 'AM' ? 'entry' : 'exit';
            }
            
            this.addRecentActivityItem({
                studentName: studentName || 'Unknown Student',
                time: new Date(attendanceData.timestamp).toTimeString().substring(0, 5),
                entryType: entryType,
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
        if (this.realTimeInterval) {
            clearInterval(this.realTimeInterval);
        }
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
