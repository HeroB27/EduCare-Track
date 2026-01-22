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
            this.allStudents = await EducareTrack.getStudents(true); // Force refresh
            this.filteredStudents = [...this.allStudents];
            this.updateResultsCount();
        } catch (error) {
            console.error('Error loading students:', error);
            this.showNotification('Failed to load students', 'error');
        }
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
            // Search term filter
            const matchesSearch = !searchTerm || 
                student.name.toLowerCase().includes(searchTerm) ||
                student.id.toLowerCase().includes(searchTerm) ||
                (student.lrn && student.lrn.includes(searchTerm));

            // Grade filter
            const matchesGrade = !gradeFilter || student.grade === gradeFilter;

            // Status filter
            const matchesStatus = !statusFilter || student.current_status === statusFilter;

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
        const statusColor = EducareTrack.getStatusColor(student.current_status);
        const statusText = EducareTrack.getStatusText(student.current_status);
        const lastAttendance = student.last_attendance ? 
            EducareTrack.formatTime(student.last_attendance) : 'No record';

        return `
            <div class="bg-gray-50 rounded-lg p-4 border border-gray-200 hover:border-blue-300 transition duration-200 cursor-pointer student-card"
                 data-student-id="${student.id}">
                <div class="flex items-start justify-between mb-3">
                    <div class="flex items-center space-x-3">
                        <div class="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                            <span class="text-blue-600 font-semibold">${student.name.charAt(0).toUpperCase()}</span>
                        </div>
                        <div>
                            <h3 class="font-semibold text-gray-900">${student.name}</h3>
                            <p class="text-sm text-gray-600">${student.id}</p>
                        </div>
                    </div>
                    <span class="px-2 py-1 text-xs font-semibold rounded-full ${statusColor}">
                        ${statusText}
                    </span>
                </div>
                
                <div class="space-y-2 text-sm">
                    <div class="flex justify-between">
                        <span class="text-gray-600">Grade:</span>
                        <span class="font-medium">${student.grade}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-600">Class:</span>
                        <span class="font-medium">${student.class_id || 'Not assigned'}</span>
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
            const student = await EducareTrack.getStudentById(studentId);
            if (!student) {
                this.showNotification('Student not found', 'error');
                return;
            }

            await this.loadStudentDetails(student);
        } catch (error) {
            console.error('Error loading student details:', error);
            this.showNotification('Failed to load student details', 'error');
        }
    }

    async loadStudentDetails(student) {
        // Load additional data
        const [attendanceHistory, clinicVisits, parentInfo] = await Promise.all([
            EducareTrack.getAttendanceByStudent(student.id),
            EducareTrack.getClinicVisitsByStudent(student.id),
            EducareTrack.getUserById(student.parent_id)
        ]);

        document.getElementById('modalStudentName').textContent = student.name;
        document.getElementById('studentDetailsContent').innerHTML = this.renderStudentDetails(
            student, attendanceHistory, clinicVisits, parentInfo
        );
        document.getElementById('studentDetailsModal').classList.remove('hidden');
    }

    renderStudentDetails(student, attendance, clinicVisits, parent) {
        const statusColor = EducareTrack.getStatusColor(student.currentStatus);
        const statusText = EducareTrack.getStatusText(student.currentStatus);

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
                                <span class="font-medium">${student.grade}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-600">Class:</span>
                                <span class="font-medium">${student.class_id || 'Not assigned'}</span>
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
                                            <div class="text-xs text-gray-600">${time} • ${record.entry_type}</div>
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
                                        <div class="text-xs text-gray-600">${visit.check_in ? 'Check-in' : 'Check-out'}</div>
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
            const student = await EducareTrack.getStudentById(studentId);
            if (!student) {
                this.showNotification('Student not found', 'error');
                return;
            }

            await EducareTrack.recordGuardAttendance(studentId, student, entryType);
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

    showNotification(message, type = 'info') {
        if (window.EducareTrack && typeof window.EducareTrack.showNormalNotification === 'function') {
            window.EducareTrack.showNormalNotification({ title: type === 'error' ? 'Error' : 'Info', message, type });
        }
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
