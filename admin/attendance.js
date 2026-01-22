class AttendanceManager {
    constructor() {
        this.currentUser = null;
        this.attendanceRecords = [];
        this.filteredRecords = [];
        this.classes = [];
        this.currentPage = 1;
        this.recordsPerPage = 10;
        this.trendChart = null;
        this.distributionChart = null;
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
            this.updateUI();
            await this.loadInitialData();
            this.initEventListeners();
            
            this.hideLoading();
        } catch (error) {
            console.error('Attendance manager initialization failed:', error);
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

    async loadInitialData() {
        try {
            // Load classes for filters
            this.classes = await EducareTrack.getClasses();
            this.populateClassFilters();
            
            // Load today's attendance stats
            await this.loadTodayStats();
            
            // Load attendance records
            await this.loadAttendanceRecords();
            
            // Initialize charts
            this.initializeCharts();
            
        } catch (error) {
            console.error('Error loading initial data:', error);
        }
    }

    populateClassFilters() {
        const classFilter = document.getElementById('classFilter');
        const bulkClassSelect = document.getElementById('bulkClassSelect');
        
        // Clear existing options
        classFilter.innerHTML = '<option value="">All Classes</option>';
        bulkClassSelect.innerHTML = '<option value="">Select Class</option>';
        
        this.classes.forEach(classItem => {
            const option = document.createElement('option');
            option.value = classItem.id;
            option.textContent = classItem.name;
            
            classFilter.appendChild(option.cloneNode(true));
            bulkClassSelect.appendChild(option);
        });
    }

    async loadTodayStats() {
        try {
            const today = new Date();
            const startDate = new Date(today);
            startDate.setDate(startDate.getDate() - 7); // Get last 7 days for trend data
            
            const attendanceData = await EducareTrack.getAttendanceTrend(startDate, today, 'day');
            
            if (attendanceData && attendanceData.datasets) {
                // Get today's data (last entry in the datasets)
                const todayIndex = attendanceData.datasets.present.length - 1;
                
                document.getElementById('totalPresent').textContent = attendanceData.datasets.present[todayIndex] || 0;
                document.getElementById('totalAbsent').textContent = attendanceData.datasets.absent[todayIndex] || 0;
                document.getElementById('totalLate').textContent = attendanceData.datasets.late[todayIndex] || 0;
                document.getElementById('totalClinic').textContent = attendanceData.datasets.clinic[todayIndex] || 0;
                
                // Store the trend data for charts
                this.attendanceTrendData = attendanceData;
            } else {
                // Fallback to individual stats call
                const todayStr = today.toISOString().split('T')[0];
                const stats = await EducareTrack.getAttendanceStats(todayStr);
                
                document.getElementById('totalPresent').textContent = stats.present || 0;
                document.getElementById('totalAbsent').textContent = stats.absent || 0;
                document.getElementById('totalLate').textContent = stats.late || 0;
                document.getElementById('totalClinic').textContent = stats.clinic || 0;
            }
            
        } catch (error) {
            console.error('Error loading today stats:', error);
            // Set default values if function doesn't exist
            document.getElementById('totalPresent').textContent = '0';
            document.getElementById('totalAbsent').textContent = '0';
            document.getElementById('totalLate').textContent = '0';
            document.getElementById('totalClinic').textContent = '0';
        }
    }

    async loadAttendanceRecords(filters = {}) {
        try {
            this.showLoading();
            
            this.attendanceRecords = await EducareTrack.getAttendanceRecords(filters);
            this.applyFilters();
            
            this.hideLoading();
        } catch (error) {
            console.error('Error loading attendance records:', error);
            // Show empty state instead of sample data
            this.attendanceRecords = [];
            this.applyFilters();
            this.showErrorMessage('Failed to load attendance records');
            this.hideLoading();
        }
    }

    showErrorMessage(message) {
        const container = document.getElementById('attendanceRecords');
        if (container) {
            container.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <i class="fas fa-exclamation-triangle text-3xl mb-3"></i>
                    <p>${message}</p>
                </div>
            `;
        }
    }

    applyFilters() {
        const classFilter = document.getElementById('classFilter').value;
        const statusFilter = document.getElementById('statusFilter').value;
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;

        this.filteredRecords = this.attendanceRecords.filter(record => {
            // Class filter
            if (classFilter && record.class_id !== classFilter) return false;
            
            // Status filter
            if (statusFilter && record.status !== statusFilter) return false;
            
            // Date range filter
            const recordDate = new Date(record.timestamp).toISOString().split('T')[0];
            if (startDate && recordDate < startDate) return false;
            if (endDate && recordDate > endDate) return false;
            
            return true;
        });

        this.renderAttendanceTable();
        this.updateCharts();
    }

    resetFilters() {
        // Clear all filter inputs
        document.getElementById('classFilter').value = '';
        document.getElementById('statusFilter').value = '';
        document.getElementById('startDate').value = '';
        document.getElementById('endDate').value = '';
        
        // Reset to show all records
        this.filteredRecords = [...this.attendanceRecords];
        this.currentPage = 1;
        
        // Update UI
        this.renderAttendanceTable();
        this.updateCharts();
    }

    renderAttendanceTable() {
        const tableBody = document.getElementById('attendanceTableBody');
        const totalRecords = this.filteredRecords.length;
        const startIndex = (this.currentPage - 1) * this.recordsPerPage;
        const endIndex = Math.min(startIndex + this.recordsPerPage, totalRecords);
        const pageRecords = this.filteredRecords.slice(startIndex, endIndex);

        // Update pagination info
        document.getElementById('showingStart').textContent = startIndex + 1;
        document.getElementById('showingEnd').textContent = endIndex;
        document.getElementById('totalRecords').textContent = totalRecords;

        // Update pagination buttons
        document.getElementById('prevPage').disabled = this.currentPage === 1;
        document.getElementById('nextPage').disabled = endIndex >= totalRecords;

        if (pageRecords.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="px-6 py-4 text-center text-gray-500">
                        No attendance records found
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = pageRecords.map(record => `
            <tr>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex items-center">
                        <div class="flex-shrink-0 h-10 w-10 bg-gray-200 rounded-full flex items-center justify-center">
                            <span class="text-gray-600 font-medium">${this.getInitials(record.studentName)}</span>
                        </div>
                        <div class="ml-4">
                            <div class="text-sm font-medium text-gray-900">${record.studentName}</div>
                            <div class="text-sm text-gray-500">${record.student_id}</div>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm text-gray-900">${this.formatDate(record.timestamp)}</div>
                    <div class="text-sm text-gray-500">${this.formatTime(record.timestamp)}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    ${record.className || 'N/A'}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    ${record.entry_type === 'entry' ? 'Entry' : 'Exit'}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${this.getStatusClass(record.status)}">
                        ${this.getStatusText(record.status)}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    ${record.recorded_by || 'System'}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button onclick="attendanceManager.editRecord('${record.id}')" class="text-blue-600 hover:text-blue-900 mr-3">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="attendanceManager.deleteRecord('${record.id}')" class="text-red-600 hover:text-red-900">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    getInitials(name) {
        if (!name || typeof name !== 'string') {
            return '??';
        }
        return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    }

    getStatusClass(status) {
        const classes = {
            'present': 'status-present',
            'absent': 'status-absent',
            'late': 'status-late',
            'in_clinic': 'status-clinic',
            'excused': 'status-excused'
        };
        return classes[status] || 'status-absent';
    }

    getStatusText(status) {
        const texts = {
            'present': 'Present',
            'absent': 'Absent',
            'late': 'Late',
            'in_clinic': 'In Clinic',
            'excused': 'Excused'
        };
        return texts[status] || 'Unknown';
    }

    formatDate(timestamp) {
        if (!timestamp) return 'N/A';
        try {
            return new Date(timestamp).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch (error) {
            return 'Invalid Date';
        }
    }

    formatTime(timestamp) {
        if (!timestamp) return 'N/A';
        try {
            return new Date(timestamp).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            return 'Invalid Time';
        }
    }

    initializeCharts() {
        this.createTrendChart();
        this.createDistributionChart();
    }

    createTrendChart() {
        const ctx = document.getElementById('attendanceTrendChart').getContext('2d');
        
        if (this.trendChart) {
            this.trendChart.destroy();
        }

        // Use the same data as admin dashboard if available
        if (this.attendanceTrendData && this.attendanceTrendData.datasets) {
            this.trendChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: this.attendanceTrendData.labels,
                    datasets: [
                        {
                            label: 'Present',
                            data: this.attendanceTrendData.datasets.present,
                            borderColor: '#10B981',
                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            tension: 0.4,
                            fill: true
                        },
                        {
                            label: 'Absent',
                            data: this.attendanceTrendData.datasets.absent,
                            borderColor: '#EF4444',
                            backgroundColor: 'rgba(239, 68, 68, 0.1)',
                            tension: 0.4,
                            fill: true
                        },
                        {
                            label: 'Late',
                            data: this.attendanceTrendData.datasets.late,
                            borderColor: '#F59E0B',
                            backgroundColor: 'rgba(245, 158, 11, 0.1)',
                            tension: 0.4,
                            fill: true
                        },
                        {
                            label: 'Clinic',
                            data: this.attendanceTrendData.datasets.clinic,
                            borderColor: '#3B82F6',
                            backgroundColor: 'rgba(59, 130, 246, 0.1)',
                            tension: 0.4,
                            fill: true
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'top',
                        },
                        title: {
                            display: true,
                            text: 'Weekly Attendance Trend'
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Number of Students'
                            }
                        }
                    }
                }
            });
        } else {
            // Fallback to sample data if no trend data available
            const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
            const presentData = [120, 118, 122, 119, 121];
            const absentData = [5, 7, 3, 6, 4];
            const lateData = [8, 10, 6, 9, 7];
            const clinicData = [2, 1, 3, 2, 1];

            this.trendChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Present',
                            data: presentData,
                            borderColor: '#10B981',
                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            tension: 0.4,
                            fill: true
                        },
                        {
                            label: 'Absent',
                            data: absentData,
                            borderColor: '#EF4444',
                            backgroundColor: 'rgba(239, 68, 68, 0.1)',
                            tension: 0.4,
                            fill: true
                        },
                        {
                            label: 'Late',
                            data: lateData,
                            borderColor: '#F59E0B',
                            backgroundColor: 'rgba(245, 158, 11, 0.1)',
                            tension: 0.4,
                            fill: true
                        },
                        {
                            label: 'Clinic',
                            data: clinicData,
                            borderColor: '#3B82F6',
                            backgroundColor: 'rgba(59, 130, 246, 0.1)',
                            tension: 0.4,
                            fill: true
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'top',
                        },
                        title: {
                            display: true,
                            text: 'Weekly Attendance Trend (Sample Data)'
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Number of Students'
                            }
                        }
                    }
                }
            });
        }
    }

    createDistributionChart() {
        const ctx = document.getElementById('statusDistributionChart').getContext('2d');
        
        if (this.distributionChart) {
            this.distributionChart.destroy();
        }

        // Use real data from trend data if available
        let data;
        if (this.attendanceTrendData && this.attendanceTrendData.datasets) {
            // Get today's data (last entry in the datasets)
            const todayIndex = this.attendanceTrendData.datasets.present.length - 1;
            data = {
                present: this.attendanceTrendData.datasets.present[todayIndex] || 0,
                absent: this.attendanceTrendData.datasets.absent[todayIndex] || 0,
                late: this.attendanceTrendData.datasets.late[todayIndex] || 0,
                clinic: this.attendanceTrendData.datasets.clinic[todayIndex] || 0,
                excused: 0 // Excused data not available in trend data, default to 0
            };
        } else {
            // Fallback to sample data
            data = {
                present: 121,
                absent: 4,
                late: 7,
                clinic: 2,
                excused: 1
            };
        }

        this.distributionChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Present', 'Absent', 'Late', 'In Clinic', 'Excused'],
                datasets: [{
                    data: [data.present, data.absent, data.late, data.clinic, data.excused],
                    backgroundColor: [
                        '#10B981',
                        '#EF4444',
                        '#F59E0B',
                        '#3B82F6',
                        '#8B5CF6'
                    ],
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                    },
                    title: {
                        display: true,
                        text: 'Today\'s Status Distribution'
                    }
                }
            }
        });
    }

    updateCharts() {
        // Update charts with filtered data for proper filtering functionality
        this.updateTrendChart();
        this.updateDistributionChart();
    }

    updateTrendChart() {
        if (!this.trendChart || this.filteredRecords.length === 0) {
            // If no filtered records, show empty chart
            if (this.trendChart) {
                this.trendChart.data.labels = [];
                this.trendChart.data.datasets.forEach(dataset => {
                    dataset.data = [];
                });
                this.trendChart.update();
            }
            return;
        }
        
        // Group filtered records by date for trend chart
        const dateGroups = {};
        this.filteredRecords.forEach(record => {
            const date = new Date(record.timestamp).toDateString();
            if (!dateGroups[date]) {
                dateGroups[date] = { present: 0, absent: 0, late: 0, clinic: 0 };
            }
            
            if (record.status === 'present') dateGroups[date].present++;
            else if (record.status === 'absent') dateGroups[date].absent++;
            else if (record.status === 'late') dateGroups[date].late++;
            else if (record.status === 'in_clinic') dateGroups[date].clinic++;
        });

        const sortedDates = Object.keys(dateGroups).sort();
        const labels = sortedDates.map(date => new Date(date).toLocaleDateString('en-US', { 
            weekday: 'short', month: 'short', day: 'numeric' 
        }));
        
        this.trendChart.data.labels = labels;
        this.trendChart.data.datasets[0].data = sortedDates.map(date => dateGroups[date].present);
        this.trendChart.data.datasets[1].data = sortedDates.map(date => dateGroups[date].absent);
        this.trendChart.data.datasets[2].data = sortedDates.map(date => dateGroups[date].late);
        this.trendChart.data.datasets[3].data = sortedDates.map(date => dateGroups[date].clinic);
        this.trendChart.update();
    }

    updateDistributionChart() {
        if (!this.distributionChart) return;
        
        // Count status distribution from filtered records
        const statusCounts = { present: 0, absent: 0, late: 0, clinic: 0, excused: 0 };
        this.filteredRecords.forEach(record => {
            if (record.status === 'present') statusCounts.present++;
            else if (record.status === 'absent') statusCounts.absent++;
            else if (record.status === 'late') statusCounts.late++;
            else if (record.status === 'in_clinic') statusCounts.clinic++;
            else if (record.status === 'excused') statusCounts.excused++;
        });

        this.distributionChart.data.datasets[0].data = [
            statusCounts.present,
            statusCounts.absent,
            statusCounts.late,
            statusCounts.clinic,
            statusCounts.excused
        ];
        this.distributionChart.update();
    }

    async loadClassStudents(classId) {
        try {
            this.showLoading();
            
            const students = await EducareTrack.getClassStudents(classId);
            this.renderStudentsList(students);
            
            this.hideLoading();
        } catch (error) {
            console.error('Error loading class students:', error);
            // Show empty state instead of sample data
            this.renderStudentsList([]);
            this.showNotification('Failed to load students for this class', 'error');
            this.hideLoading();
        }
    }

    renderStudentsList(students) {
        const studentsList = document.getElementById('studentsList');
        
        if (students.length === 0) {
            studentsList.innerHTML = '<p class="p-4 text-gray-500 text-center">No students found in this class</p>';
            return;
        }

        studentsList.innerHTML = students.map(student => `
            <div class="flex items-center p-3 border-b border-gray-200 last:border-b-0">
                <input type="checkbox" id="student-${student.id}" value="${student.id}" class="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded">
                <label for="student-${student.id}" class="flex-1 cursor-pointer">
                    <div class="font-medium text-gray-900">${student.name}</div>
                    <div class="text-sm text-gray-500">${student.id}</div>
                </label>
            </div>
        `).join('');

        studentsList.classList.remove('hidden');
    }

    async submitBulkAttendance() {
        try {
            const selectedStudents = Array.from(document.querySelectorAll('#studentsList input:checked'))
                .map(input => input.value);
            const status = document.getElementById('bulkStatus').value;
            const date = document.getElementById('attendanceDate').value;
            const notes = document.getElementById('attendanceNotes').value;

            if (selectedStudents.length === 0) {
                this.showNotification('Please select at least one student', 'error');
                return;
            }

            if (!date) {
                this.showNotification('Please select a date', 'error');
                return;
            }

            this.showLoading();

            // Submit attendance for each selected student
            for (const studentId of selectedStudents) {
                await EducareTrack.recordAttendance({
                    studentId: studentId,
                    status: status,
                    date: date,
                    notes: notes,
                    recordedBy: this.currentUser.name
                });
            }

            this.showNotification(`Attendance recorded for ${selectedStudents.length} students`, 'success');
            this.closeMarkAttendanceModal();
            await this.loadTodayStats();
            await this.loadAttendanceRecords();

        } catch (error) {
            console.error('Error submitting bulk attendance:', error);
            this.showNotification('Error recording attendance', 'error');
            this.hideLoading();
        }
    }

    async editRecord(recordId) {
        // Implementation for editing a record
        this.showNotification('Edit functionality coming soon', 'info');
    }

    async deleteRecord(recordId) {
        const ok = window.EducareTrack && typeof window.EducareTrack.confirmAction === 'function'
            ? await window.EducareTrack.confirmAction('Are you sure you want to delete this attendance record?', 'Delete Record', 'Delete', 'Cancel')
            : true;
        if (!ok) return;

        try {
            this.showLoading();
            await EducareTrack.deleteAttendanceRecord(recordId);
            this.showNotification('Attendance record deleted successfully', 'success');
            await this.loadTodayStats();
            await this.loadAttendanceRecords();
        } catch (error) {
            console.error('Error deleting attendance record:', error);
            this.showNotification('Error deleting record', 'error');
            this.hideLoading();
        }
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
                localStorage.removeItem('educareTrack_user');
                window.location.href = '../index.html';
            }
        });

        // View reports
        document.getElementById('viewReportsBtn').addEventListener('click', () => {
            window.location.href = 'admin-records.html';
        });

        // Apply filters
        document.getElementById('applyFilters').addEventListener('click', () => {
            this.applyFilters();
        });

        // Reset filters
        document.getElementById('resetFilters').addEventListener('click', () => {
            this.resetFilters();
        });

        // Auto-filter on change
        document.getElementById('classFilter').addEventListener('change', () => {
            this.applyFilters();
        });
        
        document.getElementById('statusFilter').addEventListener('change', () => {
            this.applyFilters();
        });
        
        document.getElementById('startDate').addEventListener('change', () => {
            this.applyFilters();
        });
        
        document.getElementById('endDate').addEventListener('change', () => {
            this.applyFilters();
        });

        // Export data
        document.getElementById('exportData').addEventListener('click', () => {
            this.exportData();
        });

        // Mark attendance
        document.getElementById('markAttendance').addEventListener('click', () => {
            this.openMarkAttendanceModal();
        });

        // Load class students
        document.getElementById('loadClassStudents').addEventListener('click', () => {
            const classId = document.getElementById('bulkClassSelect').value;
            if (classId) {
                this.loadClassStudents(classId);
            } else {
                this.showNotification('Please select a class first', 'error');
            }
        });

        // Submit bulk attendance
        document.getElementById('submitBulkAttendance').addEventListener('click', () => {
            this.submitBulkAttendance();
        });

        // Close mark attendance modal
        document.getElementById('closeMarkAttendanceModal').addEventListener('click', () => {
            this.closeMarkAttendanceModal();
        });

        document.getElementById('cancelMarkAttendance').addEventListener('click', () => {
            this.closeMarkAttendanceModal();
        });

        // Pagination
        document.getElementById('prevPage').addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.renderAttendanceTable();
            }
        });

        document.getElementById('nextPage').addEventListener('click', () => {
            const totalPages = Math.ceil(this.filteredRecords.length / this.recordsPerPage);
            if (this.currentPage < totalPages) {
                this.currentPage++;
                this.renderAttendanceTable();
            }
        });

        // Set default date to today
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('startDate').value = today;
        document.getElementById('endDate').value = today;
        document.getElementById('attendanceDate').value = today;

        // Close modals on outside click
        document.getElementById('markAttendanceModal').addEventListener('click', (e) => {
            if (e.target.id === 'markAttendanceModal') {
                this.closeMarkAttendanceModal();
            }
        });

        // Escape key to close modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeMarkAttendanceModal();
            }
        });
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

    openMarkAttendanceModal() {
        document.getElementById('markAttendanceModal').classList.remove('hidden');
    }

    closeMarkAttendanceModal() {
        document.getElementById('markAttendanceModal').classList.add('hidden');
        document.getElementById('studentsList').classList.add('hidden');
        document.getElementById('studentsList').innerHTML = '';
    }

    exportData() {
        // Simple CSV export implementation
        const headers = ['Student Name', 'Student ID', 'Date', 'Time', 'Class', 'Type', 'Status', 'Recorded By'];
        const csvData = this.filteredRecords.map(record => [
            record.studentName,
            record.studentId,
            this.formatDate(record.timestamp),
            this.formatTime(record.timestamp),
            record.className || 'N/A',
            record.entryType === 'entry' ? 'Entry' : 'Exit',
            this.getStatusText(record.status),
            record.recordedBy || 'System'
        ]);

        const csvContent = [headers, ...csvData]
            .map(row => row.map(field => `"${field}"`).join(','))
            .join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `attendance-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);

        this.showNotification('Data exported successfully', 'success');
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

// Initialize attendance manager when page loads
document.addEventListener('DOMContentLoaded', function() {
    window.attendanceManager = new AttendanceManager();
});
