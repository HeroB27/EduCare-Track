// guard-student-lookup.js
class GuardStudentLookup {
    constructor() {
        this.currentUser = null;
        this.allStudents = [];
        this.filteredStudents = [];
        this.init();
    }

    async init() {
        await this.checkAuth();
        await this.loadAllStudents();
        this.initEventListeners();
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

    async loadAllStudents() {
        try {
            // Get all students from Supabase
            const { data: studentsData, error: studentsError } = await window.supabaseClient
                .from('students')
                .select('id, full_name, lrn, class_id, current_status')
                .in('current_status', ['enrolled', 'active', 'present']);
            
            if (studentsError) throw studentsError;
            
            // Transform data to match expected format
            this.allStudents = studentsData.map(student => ({
                id: student.id,
                first_name: student.full_name.split(' ')[0],
                last_name: student.full_name.split(' ').slice(1).join(' '),
                name: student.full_name,
                lrn: student.lrn,
                classId: student.class_id,
                class_id: student.class_id,
                current_status: student.current_status,
                currentStatus: student.current_status
            }));
            
            // Enhance student data with class information and attendance
            this.allStudents = await Promise.all(this.allStudents.map(async (student) => {
                // Get class information to determine grade
                if (student.class_id) {
                    try {
                        const { data: classData, error: classError } = await window.supabaseClient
                        .from('classes')
                        .select('grade, strand')
                        .eq('id', student.class_id)
                        .single();
                        
                        if (!classError && classData) {
                            student.grade = classData.grade;
                            student.strand = classData.strand;
                            student.className = `${classData.grade}${classData.strand ? ` - ${classData.strand}` : ''}`;
                        }
                    } catch (error) {
                        console.warn('Error fetching class info for student:', student.id);
                    }
                }
                
                // Get last attendance record with status
                try {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    
                    const { data: attendanceData, error: attendanceError } = await window.supabaseClient
                        .from('attendance')
                        .select('timestamp, session, status')
                        .eq('student_id', student.id)
                        .gte('timestamp', today.toISOString())
                        .order('timestamp', { ascending: false })
                        .limit(1);
                    
                    if (!attendanceError && attendanceData.length > 0) {
                        const lastAttendance = attendanceData[0];
                        student.lastAttendance = new Date(lastAttendance.timestamp);
                        
                        // Use the actual attendance status from the table
                        student.currentStatus = lastAttendance.status || 'unknown';
                        student.current_status = lastAttendance.status || 'unknown';
                        
                        // Also track session for additional context
                        student.lastSession = lastAttendance.session;
                    } else {
                        // No attendance record today - mark as absent
                        student.currentStatus = 'absent';
                        student.current_status = 'absent';
                    }
                } catch (error) {
                    console.warn('Error fetching last attendance for student:', student.id);
                    student.currentStatus = 'unknown';
                    student.current_status = 'unknown';
                }
                
                return student;
            }));
            
            this.filteredStudents = [...this.allStudents];
            this.populateFilters();
            this.updateResultsCount();
        } catch (error) {
            console.error('Error loading students:', error);
            this.showNotification('Failed to load students', 'error');
        }
    }

    populateFilters() {
        // Populate grade filter
        const gradeFilter = document.getElementById('gradeFilter');
        const grades = [...new Set(this.allStudents.map(s => s.grade || s.level).filter(Boolean))].sort();
        gradeFilter.innerHTML = '<option value="">All Grades</option>';
        grades.forEach(grade => {
            gradeFilter.innerHTML += `<option value="${grade}">${grade}</option>`;
        });

        // Populate status filter
        const statusFilter = document.getElementById('statusFilter');
        const statuses = [...new Set(this.allStudents.map(s => s.current_status || s.currentStatus).filter(Boolean))].sort();
        statusFilter.innerHTML = '<option value="">All Statuses</option>';
        statuses.forEach(status => {
            const displayStatus = this.getStatusText(status);
            statusFilter.innerHTML += `<option value="${status}">${displayStatus}</option>`;
        });
    }

    initEventListeners() {
        // Search on Enter key
        document.getElementById('searchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.searchStudents();
            }
        });

        // Auto-search when filters change
        document.getElementById('gradeFilter').addEventListener('change', () => {
            this.searchStudents();
        });

        document.getElementById('statusFilter').addEventListener('change', () => {
            this.searchStudents();
        });
    }

    async searchStudents() {
        const searchTerm = document.getElementById('searchInput').value.toLowerCase();
        const gradeFilter = document.getElementById('gradeFilter').value;
        const statusFilter = document.getElementById('statusFilter').value;

        this.filteredStudents = this.allStudents.filter(student => {
            // Create student name from first_name and last_name or use name field
            const studentName = student.name || 
                (student.first_name && student.last_name ? `${student.first_name} ${student.last_name}` : '') ||
                'Unknown';
            
            // Search term filter
            const matchesSearch = !searchTerm || 
                studentName.toLowerCase().includes(searchTerm) ||
                (student.id && student.id.toLowerCase().includes(searchTerm)) ||
                (student.lrn && student.lrn.toLowerCase().includes(searchTerm));

            // Grade filter
            const matchesGrade = !gradeFilter || 
                (student.grade === gradeFilter) || 
                (student.className && student.className.includes(gradeFilter)) ||
                (student.strand && student.strand === gradeFilter);

            // Status filter - now using actual attendance status
            const studentStatus = student.current_status || student.currentStatus;
            const matchesStatus = !statusFilter || 
                (studentStatus === statusFilter);

            return matchesSearch && matchesGrade && matchesStatus;
        });

        this.displaySearchResults();
        this.updateResultsCount();
    }

    displaySearchResults() {
        const container = document.getElementById('searchResults');
        
        if (this.filteredStudents.length === 0) {
            container.innerHTML = `
                <div class="text-center py-12 text-gray-500">
                    <svg class="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 0112 20c-4.418 0-8-3.582-8-8s3.582-8 8-8 8 3.582 8 8c0 1.703-.523 3.281-1.416 4.596"></path>
                    </svg>
                    <p class="text-lg">No students found matching your criteria</p>
                    <p class="text-sm">Try adjusting your search terms or filters</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                ${this.filteredStudents.map(student => this.renderStudentCard(student)).join('')}
            </div>
        `;
    }

    renderStudentCard(student) {
        // Create student name from full_name or first_name/last_name
        const studentName = student.name || student.full_name || 
            (student.first_name && student.last_name ? `${student.first_name} ${student.last_name}` : '') ||
            'Unknown';
            
        const statusColor = this.getStatusColor(student.current_status || student.currentStatus || 'absent');
        const statusText = this.getStatusText(student.current_status || student.currentStatus || 'absent');
        const lastAttendance = student.lastAttendance ? 
            (student.lastAttendance.toDate ? 
                student.lastAttendance.toDate().toTimeString().substring(0, 5) : 
                student.lastAttendance.toTimeString().substring(0, 5)) : 'No record';
        
        // Add session info if available
        const sessionInfo = student.lastSession ? ` (${student.lastSession})` : '';

        return `
            <div class="bg-gray-50 rounded-lg p-4 border border-gray-200 hover:border-blue-300 transition duration-200 cursor-pointer student-card"
                 data-student-id="${student.id}">
                <div class="flex items-start justify-between mb-3">
                    <div class="flex items-center space-x-3">
                        <div class="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                            <span class="text-blue-600 font-semibold">${studentName.charAt(0).toUpperCase()}</span>
                        </div>
                        <div>
                            <h3 class="font-semibold text-gray-900">${studentName}</h3>
                            <p class="text-sm text-gray-600">${student.id}</p>
                        </div>
                    </div>
                    <span class="px-2 py-1 text-xs font-semibold rounded-full ${statusColor}">
                        ${statusText}${sessionInfo}
                    </span>
                </div>
                
                <div class="space-y-2 text-sm">
                    <div class="flex justify-between">
                        <span class="text-gray-600">Grade:</span>
                        <span class="font-medium">${student.grade || student.level || 'N/A'}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-600">Class:</span>
                        <span class="font-medium">${student.className || student.classId || student.class_id || 'Not assigned'}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-600">Last Activity:</span>
                        <span class="font-medium">${lastAttendance}</span>
                    </div>
                </div>
                
                <div class="mt-4 flex space-x-2">
                    <button onclick="event.stopPropagation(); viewStudentDetails('${student.id}')" 
                            class="flex-1 bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded text-sm font-medium transition duration-200">
                        View Details
                    </button>
                    <button onclick="event.stopPropagation(); recordQuickAttendance('${student.id}', 'entry')" 
                            class="bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded text-sm font-medium transition duration-200">
                        Time In
                    </button>
                    <button onclick="event.stopPropagation(); recordQuickAttendance('${student.id}', 'exit')" 
                            class="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded text-sm font-medium transition duration-200">
                        Time Out
                    </button>
                </div>
            </div>
        `;
    }

    updateResultsCount() {
        const count = this.filteredStudents.length;
        const total = this.allStudents.length;
        document.getElementById('resultsCount').textContent = 
            `${count} student${count !== 1 ? 's' : ''} found${total !== count ? ` (filtered from ${total})` : ''}`;
    }

    async viewStudentDetails(studentId) {
        try {
            // Get student data from Supabase
            const { data: studentData, error: studentError } = await window.supabaseClient
                .from('students')
                .select('id, full_name, lrn, class_id, current_status')
                .eq('id', studentId)
                .single();
            
            if (studentError || !studentData) {
                this.showNotification('Student not found', 'error');
                return;
            }
            
            // Get current attendance status
            let currentAttendanceStatus = 'absent'; // Default to absent
            let lastAttendanceTime = null;
            let lastSession = null;
            
            try {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                
                const { data: attendanceData, error: attendanceError } = await window.supabaseClient
                    .from('attendance')
                    .select('timestamp, session, status')
                    .eq('student_id', studentId)
                    .gte('timestamp', today.toISOString())
                    .order('timestamp', { ascending: false })
                    .limit(1);
                
                if (!attendanceError && attendanceData.length > 0) {
                    const lastAttendance = attendanceData[0];
                    currentAttendanceStatus = lastAttendance.status || 'unknown';
                    lastAttendanceTime = lastAttendance.timestamp;
                    lastSession = lastAttendance.session;
                }
            } catch (error) {
                console.warn('Error fetching current attendance:', error);
            }
            
            // Transform to expected format
            const student = {
                id: studentData.id,
                first_name: studentData.full_name.split(' ')[0],
                last_name: studentData.full_name.split(' ').slice(1).join(' '),
                name: studentData.full_name,
                lrn: studentData.lrn,
                classId: studentData.class_id,
                class_id: studentData.class_id,
                current_status: currentAttendanceStatus, // Use attendance status
                currentStatus: currentAttendanceStatus,
                lastAttendance: lastAttendanceTime,
                lastSession: lastSession
            };

            await this.loadStudentDetails(student);
        } catch (error) {
            console.error('Error loading student details:', error);
            this.showNotification('Failed to load student details', 'error');
        }
    }

    async loadStudentDetails(student) {
        // Load additional data with proper error handling
        const [attendanceHistory, clinicVisits, parentInfo] = await Promise.all([
            this.getAttendanceByStudent(student.id).catch(() => []),
            this.getClinicVisitsByStudent(student.id).catch(() => []),
            this.getParentInfo(student.id).catch(() => null)
        ]);

        // Create student name from full_name or first_name/last_name
        const studentName = student.name || student.full_name || 
            (student.first_name && student.last_name ? `${student.first_name} ${student.last_name}` : '') ||
            'Unknown';

        document.getElementById('modalStudentName').textContent = studentName;
        document.getElementById('studentDetailsContent').innerHTML = this.renderStudentDetails(
            student, attendanceHistory, clinicVisits, parentInfo
        );
        document.getElementById('studentDetailsModal').classList.remove('hidden');
    }

    renderStudentDetails(student, attendance, clinicVisits, parent) {
        // Create student name from first_name and last_name or use name field
        const studentName = student.name || 
            (student.first_name && student.last_name ? `${student.first_name} ${student.last_name}` : '') ||
            'Unknown';
            
        const statusColor = EducareTrack.getStatusColor(student.current_status || student.currentStatus);
        const statusText = EducareTrack.getStatusText(student.current_status || student.currentStatus);

        return `
            <div class="space-y-6">
                <!-- Basic Info -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="bg-gray-50 p-4 rounded-lg">
                        <h4 class="font-semibold text-gray-800 mb-2">Student Information</h4>
                        <div class="space-y-2 text-sm">
                            <div class="flex justify-between">
                                <span class="text-gray-600">Student ID:</span>
                                <span class="font-medium">${student.id}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-600">LRN:</span>
                                <span class="font-medium">${student.lrn || 'Not provided'}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-600">Grade:</span>
                                <span class="font-medium">${student.grade || student.level || 'N/A'}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-600">Class:</span>
                                <span class="font-medium">${student.classId || student.class_id || 'Not assigned'}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-600">Current Status:</span>
                                <span class="font-medium ${statusColor} px-2 py-1 rounded-full text-xs">${statusText}</span>
                            </div>
                        </div>
                    </div>

                    <div class="bg-gray-50 p-4 rounded-lg">
                        <h4 class="font-semibold text-gray-800 mb-2">Parent Information</h4>
                        ${parent ? `
                            <div class="space-y-2 text-sm">
                                <div class="flex justify-between">
                                    <span class="text-gray-600">Name:</span>
                                    <span class="font-medium">${parent.name}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-600">Phone:</span>
                                    <span class="font-medium">${parent.phone || 'Not provided'}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-600">Emergency Contact:</span>
                                    <span class="font-medium">${parent.emergencyContact || 'Not provided'}</span>
                                </div>
                            </div>
                        ` : '<p class="text-sm text-gray-600">Parent information not available</p>'}
                    </div>
                </div>

                <!-- Quick Actions -->
                <div class="bg-blue-50 p-4 rounded-lg">
                    <h4 class="font-semibold text-gray-800 mb-3">Quick Actions</h4>
                    <div class="flex space-x-3">
                        <button onclick="recordQuickAttendance('${student.id}', 'entry')" 
                                class="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg font-medium transition duration-200">
                            Record Time In
                        </button>
                        <button onclick="recordQuickAttendance('${student.id}', 'exit')" 
                                class="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg font-medium transition duration-200">
                            Record Time Out
                        </button>
                        <button onclick="viewFullAttendanceHistory('${student.id}')" 
                                class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-medium transition duration-200">
                            Full History
                        </button>
                    </div>
                </div>

                <!-- Recent Activity -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <h4 class="font-semibold text-gray-800 mb-3">Recent Attendance (5 records)</h4>
                        <div class="space-y-2 max-h-60 overflow-y-auto">
                            ${attendance.length > 0 ? attendance.slice(0, 5).map(record => {
                                const date = EducareTrack.formatDate(record.timestamp);
                                const time = EducareTrack.formatTime(record.timestamp);
                                const recordStatusColor = EducareTrack.getStatusColor(record.status);
                                
                                return `
                                    <div class="flex items-center justify-between p-2 bg-white rounded border">
                                        <div>
                                            <div class="text-sm font-medium">${date}</div>
                                            <div class="text-xs text-gray-600">${time} • ${record.entryType}</div>
                                        </div>
                                        <span class="px-2 py-1 text-xs font-semibold rounded-full ${recordStatusColor}">
                                            ${record.status}
                                        </span>
                                    </div>
                                `;
                            }).join('') : '<p class="text-sm text-gray-600">No attendance records</p>'}
                        </div>
                    </div>

                    <div>
                        <h4 class="font-semibold text-gray-800 mb-3">Recent Clinic Visits (3 records)</h4>
                        <div class="space-y-2 max-h-60 overflow-y-auto">
                            ${clinicVisits.length > 0 ? clinicVisits.slice(0, 3).map(visit => {
                                const date = EducareTrack.formatDate(visit.timestamp);
                                const time = EducareTrack.formatTime(visit.timestamp);
                                
                                return `
                                    <div class="p-2 bg-white rounded border">
                                        <div class="text-sm font-medium">${date} ${time}</div>
                                        <div class="text-xs text-gray-600">${visit.checkIn ? 'Check-in' : 'Check-out'}</div>
                                        <div class="text-xs text-gray-800 mt-1">${visit.reason || 'No reason provided'}</div>
                                    </div>
                                `;
                            }).join('') : '<p class="text-sm text-gray-600">No clinic visits</p>'}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    closeStudentDetails() {
        document.getElementById('studentDetailsModal').classList.add('hidden');
    }

    async recordQuickAttendance(studentId, entryType) {
        try {
            // Get student data from Supabase
            const { data: studentData, error: studentError } = await window.supabaseClient
                .from('students')
                .select('id, full_name, class_id')
                .eq('id', studentId)
                .single();
            
            if (studentError || !studentData) {
                this.showNotification('Student not found', 'error');
                return;
            }
            
            const student = {
                id: studentData.id,
                name: studentData.full_name,
                classId: studentData.class_id
            };

            // Create timestamp and determine session/status
            const timestamp = new Date();
            const hours = timestamp.getHours();
            const session = hours < 12 ? 'AM' : 'PM';
            const timeString = timestamp.toTimeString().substring(0, 5);
            const status = entryType === 'entry' ? 
                (timeString <= '07:30' ? 'present' : 'late') : 'present';

            // Insert attendance record using Supabase
            const { data, error } = await window.supabaseClient
                .from('attendance')
                .insert({
                    student_id: studentId,
                    class_id: student.classId || null,
                    session: session,
                    status: status,
                    method: 'manual',
                    timestamp: timestamp.toISOString(),
                    recorded_by: this.currentUser.id
                });
            
            if (error) throw error;
            
            this.showNotification(`${student.name} ${entryType} recorded successfully`, 'success');
            
            // Refresh data
            this.loadAllStudents();
            this.closeStudentDetails();
        } catch (error) {
            console.error('Error recording attendance:', error);
            this.showNotification('Failed to record attendance: ' + error.message, 'error');
        }
    }

    viewFullAttendanceHistory(studentId) {
        // In a real implementation, this would open a detailed history page
        this.showNotification('Full history view would open here', 'info');
    }

    clearSearch() {
        document.getElementById('searchInput').value = '';
        document.getElementById('gradeFilter').value = '';
        document.getElementById('statusFilter').value = '';
        this.filteredStudents = [...this.allStudents];
        this.displaySearchResults();
        this.updateResultsCount();
    }

    // New helper methods for Supabase data fetching
    async getAttendanceByStudent(studentId) {
        try {
            const { data, error } = await window.supabaseClient
                .from('attendance')
                .select('timestamp, session, status, method')
                .eq('student_id', studentId)
                .order('timestamp', { ascending: false })
                .limit(5);
            
            if (error) throw error;
            
            // Transform data to match expected format
            return (data || []).map(record => ({
                timestamp: record.timestamp,
                entryType: record.session === 'AM' ? 'entry' : 'exit',
                session: record.session,
                status: record.status,
                method: record.method
            }));
        } catch (error) {
            console.error('Error getting attendance by student:', error);
            return [];
        }
    }

    async getClinicVisitsByStudent(studentId) {
        try {
            const { data, error } = await window.supabaseClient
                .from('clinic_visits')
                .select('visit_time, reason, notes, outcome')
                .eq('student_id', studentId)
                .order('visit_time', { ascending: false })
                .limit(3);
            
            if (error) throw error;
            
            // Transform data to match expected format
            return (data || []).map(record => ({
                timestamp: record.visit_time,
                visit_time: record.visit_time,
                reason: record.reason,
                notes: record.notes,
                outcome: record.outcome,
                checkIn: true // All clinic visits are check-ins in new schema
            }));
        } catch (error) {
            console.error('Error getting clinic visits by student:', error);
            return [];
        }
    }

    async getParentInfo(studentId) {
        try {
            // Get parent-student relationship first
            const { data: relationshipData, error: relationshipError } = await window.supabaseClient
                .from('parent_students')
                .select('parent_id')
                .eq('student_id', studentId)
                .limit(1);
            
            if (relationshipError || !relationshipData || relationshipData.length === 0) {
                return null;
            }
            
            const parentId = relationshipData[0].parent_id;
            
            // Get parent profile info
            const { data: parentData, error: parentError } = await window.supabaseClient
                .from('parents')
                .select(`
                    id,
                    profiles!inner(full_name, phone)
                `)
                .eq('id', parentId)
                .single();
            
            if (parentError || !parentData) {
                return null;
            }
            
            return {
                id: parentData.id,
                name: parentData.profiles?.full_name || 'Unknown',
                phone: parentData.profiles?.phone || 'Not provided',
                emergencyContact: parentData.profiles?.phone || 'Not provided'
            };
        } catch (error) {
            console.error('Error getting parent info:', error);
            return null;
        }
    }

    getStatusColor(status) {
        const colors = {
            'present': 'bg-green-100 text-green-800',
            'late': 'bg-yellow-100 text-yellow-800',
            'absent': 'bg-red-100 text-red-800',
            'excused': 'bg-blue-100 text-blue-800',
            'half_day': 'bg-orange-100 text-orange-800',
            'in_school': 'bg-green-100 text-green-800',
            'out_school': 'bg-red-100 text-red-800',
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
            'in_school': 'In School',
            'out_school': 'Out School',
            'unknown': 'Unknown'
        };
        return texts[status] || texts.unknown;
    }
}

// Global functions
function searchStudents() {
    if (window.studentLookup) {
        window.studentLookup.searchStudents();
    }
}

function clearSearch() {
    if (window.studentLookup) {
        window.studentLookup.clearSearch();
    }
}

function viewStudentDetails(studentId) {
    if (window.studentLookup) {
        window.studentLookup.viewStudentDetails(studentId);
    }
}

function closeStudentDetails() {
    if (window.studentLookup) {
        window.studentLookup.closeStudentDetails();
    }
}

function recordQuickAttendance(studentId, entryType) {
    if (window.studentLookup) {
        window.studentLookup.recordQuickAttendance(studentId, entryType);
    }
}

function viewFullAttendanceHistory(studentId) {
    if (window.studentLookup) {
        window.studentLookup.viewFullAttendanceHistory(studentId);
    }
}

function logout() {
    EducareTrack.logout();
    window.location.href = '../index.html';
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    window.studentLookup = new GuardStudentLookup();
});
