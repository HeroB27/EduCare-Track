class TeacherReports {
    constructor() {
        this.currentUser = null;
        this.classStudents = [];
        this.attendanceData = [];
        this.charts = {};
        this.init();
    }

    async init() {
        try {
            this.showLoading();
            
            if (!window.EducareTrack || !window.firebase) {
                console.log('Waiting for dependencies...');
                setTimeout(() => this.init(), 100);
                return;
            }

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
            await this.loadClassStudents();
            this.initEventListeners();
            this.initCharts();
            await this.loadInitialData();
            
            this.hideLoading();
        } catch (error) {
            console.error('Teacher reports initialization failed:', error);
            this.hideLoading();
            this.showNotification('Failed to initialize: ' + error.message, 'error');
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

        if (this.currentUser.classId) {
            document.getElementById('assignedClass').textContent = this.currentUser.className || 'Class ' + this.currentUser.classId;
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

    async loadClassStudents() {
        try {
            this.classStudents = await EducareTrack.getStudentsByClass(this.currentUser.classId);
            this.populateStudentFilter();
        } catch (error) {
            console.error('Error loading class students:', error);
            this.showNotification('Error loading students', 'error');
        }
    }

    populateStudentFilter() {
        const filter = document.getElementById('studentFilter');
        if (filter) {
            filter.innerHTML = '<option value="all">All Students</option>' +
                this.classStudents.map(student => 
                    `<option value="${student.id}">${student.name}</option>`
                ).join('');
        }
    }

    async loadInitialData() {
        try {
            // Load last 30 days of attendance data
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 30);

            console.log('Loading attendance data from', startDate, 'to', endDate);
            
            this.attendanceData = await this.getAttendanceReport(startDate, endDate, 1000);
            console.log('Loaded attendance data:', this.attendanceData.length, 'records');
            
            this.updateOverviewTab();
        } catch (error) {
            console.error('Error loading initial data:', error);
            this.showNotification('Error loading report data', 'error');
            this.attendanceData = [];
        }
    }

    async getAttendanceReport(startDate, endDate, limit = 100) {
        try {
            let query = EducareTrack.db.collection('attendance')
                .where('classId', '==', this.currentUser.classId)
                .where('timestamp', '>=', startDate)
                .where('timestamp', '<=', endDate)
                .orderBy('timestamp', 'desc')
                .limit(limit);

            const snapshot = await query.get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error('Error getting attendance report:', error);
            return [];
        }
    }

    initEventListeners() {
        // Tab switching
        document.querySelectorAll('.tab-button').forEach(button => {
            button.addEventListener('click', (e) => {
                this.switchTab(e.target.getAttribute('data-tab'));
            });
        });

        // Attendance report generation
        const generateReportBtn = document.getElementById('generateAttendanceReport');
        if (generateReportBtn) {
            generateReportBtn.addEventListener('click', () => {
                this.generateAttendanceReport();
            });
        }

        // Student analytics
        const studentFilter = document.getElementById('studentFilter');
        if (studentFilter) {
            studentFilter.addEventListener('change', () => {
                this.generateStudentAnalytics();
            });
        }

        // Export generation
        const generateExportBtn = document.getElementById('generateExport');
        if (generateExportBtn) {
            generateExportBtn.addEventListener('click', () => {
                this.generateExport();
            });
        }

        // Set default dates
        const today = new Date();
        const oneMonthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
        
        this.setDateValue('attendanceStartDate', oneMonthAgo);
        this.setDateValue('attendanceEndDate', today);
        this.setDateValue('analyticsStartDate', oneMonthAgo);
        this.setDateValue('analyticsEndDate', today);
        this.setDateValue('exportStartDate', oneMonthAgo);
        this.setDateValue('exportEndDate', today);

        // Export type change
        const exportType = document.getElementById('exportType');
        if (exportType) {
            exportType.addEventListener('change', () => {
                this.updateExportPreview();
            });
        }

        // Sidebar toggle
        document.getElementById('sidebarToggle').addEventListener('click', () => {
            this.toggleSidebar();
        });

        // Logout
        document.getElementById('logoutBtn').addEventListener('click', () => {
            if (confirm('Are you sure you want to logout?')) {
                localStorage.removeItem('educareTrack_user');
                window.location.href = '../index.html';
            }
        });
    }

    setDateValue(elementId, date) {
        const element = document.getElementById(elementId);
        if (element) {
            element.value = date.toISOString().split('T')[0];
        }
    }

    switchTab(tabName) {
        // Update active tab button
        document.querySelectorAll('.tab-button').forEach(button => {
            button.classList.remove('tab-active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('tab-active');

        // Show active tab content
        document.querySelectorAll('.tab-panel').forEach(panel => {
            panel.classList.add('hidden');
        });
        document.getElementById(`${tabName}-tab`).classList.remove('hidden');

        // Load tab-specific data
        switch (tabName) {
            case 'overview':
                this.updateOverviewTab();
                break;
            case 'attendance':
                this.generateAttendanceReport();
                break;
            case 'students':
                this.generateStudentAnalytics();
                break;
            case 'export':
                this.updateExportPreview();
                break;
        }
    }

    initCharts() {
        // Initialize chart containers
        this.charts.attendanceTrend = this.createAttendanceTrendChart();
        this.charts.statusDistribution = this.createStatusDistributionChart();
    }

    createAttendanceTrendChart() {
        const ctx = document.getElementById('attendanceTrendChart').getContext('2d');
        return new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Attendance Rate',
                        data: [],
                        borderColor: '#3B82F6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            callback: function(value) {
                                return value + '%';
                            }
                        }
                    }
                }
            }
        });
    }

    createStatusDistributionChart() {
        const ctx = document.getElementById('statusDistributionChart').getContext('2d');
        return new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Present', 'Late', 'Absent', 'Excused', 'In Clinic'],
                datasets: [{
                    data: [0, 0, 0, 0, 0],
                    backgroundColor: [
                        '#10B981',
                        '#F59E0B',
                        '#EF4444',
                        '#8B5CF6',
                        '#3B82F6'
                    ],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }

    updateOverviewTab() {
        this.updateAttendanceTrendChart();
        this.updateStatusDistributionChart();
        this.updateTopPerformers();
        this.updateFrequentAbsences();
        this.updateQuickStats();
    }

    updateAttendanceTrendChart() {
        try {
            if (!this.charts.attendanceTrend) {
                console.error('Attendance trend chart not initialized');
                return;
            }

            // Group attendance by date and calculate daily rates
            const dailyData = {};
            
            // Only process if we have data
            if (this.attendanceData && this.attendanceData.length > 0) {
                this.attendanceData.forEach(record => {
                    if (record.timestamp && record.entryType === 'entry') {
                        const date = record.timestamp.toDate ? record.timestamp.toDate().toDateString() : new Date(record.timestamp).toDateString();
                        if (!dailyData[date]) {
                            dailyData[date] = { present: 0, total: 0 };
                        }
                        dailyData[date].total++;
                        if (record.status === 'present' || record.status === 'late') {
                            dailyData[date].present++;
                        }
                    }
                });
            }

            const today = new Date();
            today.setHours(0,0,0,0);
            const labels = [];
            const rates = [];

            for (let i = 6; i >= 0; i--) {
                const d = new Date(today);
                d.setDate(today.getDate() - i);
                const key = d.toDateString();
                const data = dailyData[key] || { present: 0, total: 0 };
                const isSchoolDay = window.EducareTrack.isSchoolDay(d);
                const rate = isSchoolDay ? (data.total > 0 ? Math.round((data.present / data.total) * 100) : 0) : 0;
                const label = d.toLocaleDateString('en-US', { weekday: 'short' });
                labels.push(isSchoolDay ? label : `${label} (No School)`);
                rates.push(rate);
            }

            this.charts.attendanceTrend.data.labels = labels;
            this.charts.attendanceTrend.data.datasets[0].data = rates;
            this.charts.attendanceTrend.update();
        } catch (error) {
            console.error('Error updating attendance trend chart:', error);
        }
    }

    updateStatusDistributionChart() {
        try {
            if (!this.charts.statusDistribution) {
                console.error('Status distribution chart not initialized');
                return;
            }

            const statusCounts = {
                'Present': 0,
                'Late': 0,
                'Absent': 0,
                'Excused': 0,
                'In Clinic': 0
            };

            // Only process if we have data
            if (this.attendanceData && this.attendanceData.length > 0) {
                this.attendanceData.forEach(record => {
                    if (record.entryType === 'entry') {
                        if (record.status === 'present') statusCounts.Present++;
                        else if (record.status === 'late') statusCounts.Late++;
                        else if (record.status === 'excused') statusCounts.Excused++;
                        else if (record.status === 'in_clinic') statusCounts['In Clinic']++;
                        else statusCounts.Absent++;
                    }
                });
            }

            this.charts.statusDistribution.data.datasets[0].data = [
                statusCounts.Present,
                statusCounts.Late,
                statusCounts.Absent,
                statusCounts.Excused,
                statusCounts['In Clinic']
            ];
            this.charts.statusDistribution.update();
        } catch (error) {
            console.error('Error updating status distribution chart:', error);
        }
    }

    updateTopPerformers() {
        const studentAttendance = this.calculateStudentAttendance();
        const topPerformers = Object.entries(studentAttendance)
            .sort(([,a], [,b]) => b.attendanceRate - a.attendanceRate)
            .slice(0, 5);

        const container = document.getElementById('topPerformersList');
        if (container) {
            container.innerHTML = topPerformers.map(([studentId, data]) => {
                const student = this.classStudents.find(s => s.id === studentId);
                return `
                    <div class="flex items-center justify-between p-2 bg-green-50 rounded">
                        <div class="flex items-center space-x-3">
                            <div class="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                                <span class="text-green-600 text-xs font-semibold">${student?.name?.split(' ').map(n => n[0]).join('').substring(0, 2) || '??'}</span>
                            </div>
                            <span class="text-sm font-medium">${student?.name || 'Unknown'}</span>
                        </div>
                        <span class="text-sm font-bold text-green-600">${data.attendanceRate}%</span>
                    </div>
                `;
            }).join('') || '<p class="text-gray-500 text-center">No data available</p>';
        }
    }

    updateFrequentAbsences() {
        const studentAttendance = this.calculateStudentAttendance();
        const frequentAbsences = Object.entries(studentAttendance)
            .sort(([,a], [,b]) => b.absences - a.absences)
            .slice(0, 5);

        const container = document.getElementById('frequentAbsencesList');
        if (container) {
            container.innerHTML = frequentAbsences.map(([studentId, data]) => {
                const student = this.classStudents.find(s => s.id === studentId);
                return `
                    <div class="flex items-center justify-between p-2 bg-red-50 rounded">
                        <div class="flex items-center space-x-3">
                            <div class="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                                <span class="text-red-600 text-xs font-semibold">${student?.name?.split(' ').map(n => n[0]).join('').substring(0, 2) || '??'}</span>
                            </div>
                            <span class="text-sm font-medium">${student?.name || 'Unknown'}</span>
                        </div>
                        <span class="text-sm font-bold text-red-600">${data.absences} days</span>
                    </div>
                `;
            }).join('') || '<p class="text-gray-500 text-center">No data available</p>';
        }
    }

    updateQuickStats() {
        const studentAttendance = this.calculateStudentAttendance();
        const totalStudents = this.classStudents.length;
        const avgAttendance = totalStudents > 0 ? 
            Math.round(Object.values(studentAttendance).reduce((sum, data) => sum + data.attendanceRate, 0) / totalStudents) : 0;
        
        const totalLate = this.attendanceData.filter(record => record.status === 'late').length;
        const totalClinic = this.attendanceData.filter(record => record.status === 'in_clinic').length;

        const container = document.getElementById('quickStats');
        if (container) {
            container.innerHTML = `
                <div class="flex justify-between items-center">
                    <span class="text-gray-600">Average Attendance</span>
                    <span class="font-bold text-blue-600">${avgAttendance}%</span>
                </div>
                <div class="flex justify-between items-center">
                    <span class="text-gray-600">Total Students</span>
                    <span class="font-bold text-gray-800">${totalStudents}</span>
                </div>
                <div class="flex justify-between items-center">
                    <span class="text-gray-600">Late Arrivals</span>
                    <span class="font-bold text-yellow-600">${totalLate}</span>
                </div>
                <div class="flex justify-between items-center">
                    <span class="text-gray-600">Clinic Visits</span>
                    <span class="font-bold text-blue-600">${totalClinic}</span>
                </div>
            `;
        }
    }

    calculateStudentAttendance() {
        const studentData = {};
        
        // Initialize student data
        this.classStudents.forEach(student => {
            studentData[student.id] = {
                present: 0,
                total: 0,
                absences: 0,
                attendanceRate: 0
            };
        });

        // Count attendance by student
        this.attendanceData.forEach(record => {
            if (record.entryType === 'entry' && studentData[record.studentId]) {
                studentData[record.studentId].total++;
                if (record.status === 'present' || record.status === 'late') {
                    studentData[record.studentId].present++;
                } else {
                    studentData[record.studentId].absences++;
                }
            }
        });

        // Calculate rates
        Object.keys(studentData).forEach(studentId => {
            const data = studentData[studentId];
            data.attendanceRate = data.total > 0 ? Math.round((data.present / data.total) * 100) : 0;
        });

        return studentData;
    }

    async generateAttendanceReport() {
        try {
            this.showLoading();
            
            const startDate = new Date(document.getElementById('attendanceStartDate').value);
            const endDate = new Date(document.getElementById('attendanceEndDate').value);
            const reportType = document.getElementById('attendanceReportType').value;

            endDate.setHours(23, 59, 59, 999);

            const attendanceData = await this.getAttendanceReport(startDate, endDate, 1000);
            const container = document.getElementById('attendanceReportResults');

            switch (reportType) {
                case 'daily':
                    container.innerHTML = this.generateDailySummary(attendanceData, startDate, endDate);
                    break;
                case 'student':
                    container.innerHTML = this.generateStudentReport(attendanceData);
                    break;
                case 'trend':
                    container.innerHTML = this.generateTrendAnalysis(attendanceData, startDate, endDate);
                    break;
            }

            this.hideLoading();
        } catch (error) {
            console.error('Error generating attendance report:', error);
            this.hideLoading();
            this.showNotification('Error generating report', 'error');
        }
    }

    generateDailySummary(attendanceData, startDate, endDate) {
        const dailySummary = {};
        
        // Initialize dates in range
        const currentDate = new Date(startDate);
        while (currentDate <= endDate) {
            const dateStr = currentDate.toDateString();
            dailySummary[dateStr] = { present: 0, late: 0, absent: 0, clinic: 0, total: this.classStudents.length, noSchool: !window.EducareTrack.isSchoolDay(currentDate) };
            currentDate.setDate(currentDate.getDate() + 1);
        }

        // Count attendance by date
        attendanceData.forEach(record => {
            if (record.timestamp && record.entryType === 'entry') {
                const dateStr = record.timestamp.toDate ? record.timestamp.toDate().toDateString() : new Date(record.timestamp).toDateString();
                if (dailySummary[dateStr] && !dailySummary[dateStr].noSchool) {
                    if (record.status === 'present') dailySummary[dateStr].present++;
                    else if (record.status === 'late') dailySummary[dateStr].late++;
                    else if (record.status === 'in_clinic') dailySummary[dateStr].clinic++;
                    else dailySummary[dateStr].absent++;
                }
            }
        });

        const rows = Object.entries(dailySummary).map(([date, data]) => {
            const attendanceRate = data.total > 0 ? Math.round(((data.present + data.late) / data.total) * 100) : 0;
            return `
                <tr class="hover:bg-gray-50">
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${new Date(date).toLocaleDateString()}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${data.present}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${data.late}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${data.absent}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${data.clinic}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium ${data.noSchool ? 'text-gray-500' : attendanceRate >= 90 ? 'text-green-600' : attendanceRate >= 80 ? 'text-yellow-600' : 'text-red-600'}">
                        ${data.noSchool ? 'No School' : `${attendanceRate}%`}
                    </td>
                </tr>
            `;
        }).join('');

        return `
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead>
                        <tr class="bg-gray-50">
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Present</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Late</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Absent</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Clinic</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rate</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200">
                        ${rows}
                    </tbody>
                </table>
            </div>
        `;
    }

    generateStudentReport(attendanceData) {
        const studentAttendance = this.calculateStudentAttendance();
        const rows = this.classStudents.map(student => {
            const data = studentAttendance[student.id] || { attendanceRate: 0, absences: 0 };
            return `
                <tr class="hover:bg-gray-50">
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="flex items-center">
                            <div class="text-sm font-medium text-gray-900">${student.name}</div>
                        </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${student.lrn || 'N/A'}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium ${data.attendanceRate >= 90 ? 'text-green-600' : data.attendanceRate >= 80 ? 'text-yellow-600' : 'text-red-600'}">
                        ${data.attendanceRate}%
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${data.absences}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${data.attendanceRate >= 90 ? 'Excellent' : data.attendanceRate >= 80 ? 'Good' : 'Needs Improvement'}
                    </td>
                </tr>
            `;
        }).join('');

        return `
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead>
                        <tr class="bg-gray-50">
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">LRN</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Attendance Rate</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Absences</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200">
                        ${rows}
                    </tbody>
                </table>
            </div>
        `;
    }

    generateTrendAnalysis(attendanceData, startDate, endDate) {
        // Simple trend analysis - calculate weekly averages
        const weeklyData = {};
        
        attendanceData.forEach(record => {
            if (record.timestamp && record.entryType === 'entry') {
                const date = record.timestamp.toDate ? record.timestamp.toDate() : new Date(record.timestamp);
                const week = this.getWeekNumber(date);
                if (!weeklyData[week]) {
                    weeklyData[week] = { present: 0, total: 0 };
                }
                weeklyData[week].total++;
                if (record.status === 'present' || record.status === 'late') {
                    weeklyData[week].present++;
                }
            }
        });

        const weeks = Object.keys(weeklyData).sort();
        const weeklyRates = weeks.map(week => {
            const data = weeklyData[week];
            return data.total > 0 ? Math.round((data.present / data.total) * 100) : 0;
        });

        return `
            <div class="space-y-4">
                <h4 class="font-semibold text-gray-800">Weekly Attendance Trends</h4>
                <div class="bg-gray-50 rounded-lg p-4">
                    <div class="grid grid-cols-${weeks.length} gap-2 text-center">
                        ${weeks.map((week, index) => `
                            <div class="p-2">
                                <div class="text-sm font-medium">Week ${week}</div>
                                <div class="text-lg font-bold ${weeklyRates[index] >= 90 ? 'text-green-600' : weeklyRates[index] >= 80 ? 'text-yellow-600' : 'text-red-600'}">
                                    ${weeklyRates[index]}%
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ${weeklyRates.length > 1 ? `
                    <div class="text-sm text-gray-600">
                        <strong>Trend:</strong> 
                        ${weeklyRates[weeklyRates.length - 1] > weeklyRates[0] ? 'Improving' : 
                          weeklyRates[weeklyRates.length - 1] < weeklyRates[0] ? 'Declining' : 'Stable'}
                    </div>
                ` : ''}
            </div>
        `;
    }

    getWeekNumber(date) {
        const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
        const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
        return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
    }

    async generateStudentAnalytics() {
        try {
            const studentId = document.getElementById('studentFilter').value;
            const startDate = new Date(document.getElementById('analyticsStartDate').value);
            const endDate = new Date(document.getElementById('analyticsEndDate').value);
            
            endDate.setHours(23, 59, 59, 999);

            const attendanceData = await this.getAttendanceReport(startDate, endDate, 1000);
            const filteredData = studentId === 'all' ? attendanceData : attendanceData.filter(record => record.studentId === studentId);

            const container = document.getElementById('studentAnalyticsResults');
            
            if (studentId === 'all') {
                container.innerHTML = this.generateStudentReport(filteredData);
            } else {
                const student = this.classStudents.find(s => s.id === studentId);
                container.innerHTML = this.generateIndividualStudentAnalytics(student, filteredData);
            }
        } catch (error) {
            console.error('Error generating student analytics:', error);
            this.showNotification('Error generating analytics', 'error');
        }
    }

    generateIndividualStudentAnalytics(student, attendanceData) {
        const studentAttendance = this.calculateIndividualStudentAttendance(attendanceData, student.id);
        const presentCount = attendanceData.filter(a => a.entryType === 'entry' && (a.status === 'present' || a.status === 'late')).length;
        const lateCount = attendanceData.filter(a => a.status === 'late').length;
        const clinicCount = attendanceData.filter(a => a.status === 'in_clinic').length;

        return `
            <div class="space-y-6">
                <div class="bg-blue-50 rounded-lg p-4">
                    <h4 class="font-semibold text-gray-800 mb-2">Student: ${student.name}</h4>
                    <p class="text-gray-600">LRN: ${student.lrn || 'N/A'} | Grade: ${student.grade} | Level: ${student.level}</p>
                </div>

                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div class="bg-white border border-gray-200 rounded-lg p-4 text-center">
                        <div class="text-2xl font-bold text-green-600">${studentAttendance.attendanceRate}%</div>
                        <div class="text-sm text-gray-600">Attendance Rate</div>
                    </div>
                    <div class="bg-white border border-gray-200 rounded-lg p-4 text-center">
                        <div class="text-2xl font-bold text-blue-600">${presentCount}</div>
                        <div class="text-sm text-gray-600">Days Present</div>
                    </div>
                    <div class="bg-white border border-gray-200 rounded-lg p-4 text-center">
                        <div class="text-2xl font-bold text-yellow-600">${lateCount}</div>
                        <div class="text-sm text-gray-600">Late Arrivals</div>
                    </div>
                    <div class="bg-white border border-gray-200 rounded-lg p-4 text-center">
                        <div class="text-2xl font-bold text-purple-600">${clinicCount}</div>
                        <div class="text-sm text-gray-600">Clinic Visits</div>
                    </div>
                </div>

                <div class="bg-gray-50 rounded-lg p-4">
                    <h5 class="font-semibold text-gray-800 mb-3">Attendance Pattern</h5>
                    <div class="text-sm text-gray-600">
                        ${this.getAttendancePattern(attendanceData)}
                    </div>
                </div>
            </div>
        `;
    }

    calculateIndividualStudentAttendance(attendanceData, studentId) {
        const studentRecords = attendanceData.filter(record => record.studentId === studentId && record.entryType === 'entry');
        const presentRecords = studentRecords.filter(record => record.status === 'present' || record.status === 'late');
        
        return {
            attendanceRate: studentRecords.length > 0 ? Math.round((presentRecords.length / studentRecords.length) * 100) : 0,
            totalDays: studentRecords.length,
            presentDays: presentRecords.length,
            absences: studentRecords.length - presentRecords.length
        };
    }

    getAttendancePattern(attendanceData) {
        if (attendanceData.length === 0) return "No attendance data available";
        
        const entryRecords = attendanceData.filter(record => record.entryType === 'entry');
        const averageArrival = this.calculateAverageArrivalTime(entryRecords);
        const mostFrequentStatus = this.getMostFrequentStatus(entryRecords);
        
        return `Average arrival time: ${averageArrival}, Most frequent status: ${mostFrequentStatus}`;
    }

    calculateAverageArrivalTime(entryRecords) {
        if (entryRecords.length === 0) return "N/A";
        
        const totalMinutes = entryRecords.reduce((sum, record) => {
            if (record.time) {
                const [hours, minutes] = record.time.split(':').map(Number);
                return sum + (hours * 60 + minutes);
            }
            return sum;
        }, 0);
        
        const averageMinutes = totalMinutes / entryRecords.length;
        const hours = Math.floor(averageMinutes / 60);
        const minutes = Math.round(averageMinutes % 60);
        
        return `${hours}:${minutes.toString().padStart(2, '0')}`;
    }

    getMostFrequentStatus(entryRecords) {
        if (entryRecords.length === 0) return "N/A";
        
        const statusCounts = {};
        entryRecords.forEach(record => {
            statusCounts[record.status] = (statusCounts[record.status] || 0) + 1;
        });
        
        return Object.keys(statusCounts).reduce((a, b) => statusCounts[a] > statusCounts[b] ? a : b);
    }

    async generateExport() {
        try {
            this.showLoading();
            
            const exportType = document.getElementById('exportType').value;
            const startDate = new Date(document.getElementById('exportStartDate').value);
            const endDate = new Date(document.getElementById('exportEndDate').value);
            const format = document.getElementById('exportFormat').value;

            endDate.setHours(23, 59, 59, 999);

            let data, filename, content;

            switch (exportType) {
                case 'attendance':
                    data = await this.getAttendanceReport(startDate, endDate, 5000);
                    filename = `attendance_${startDate.toISOString().split('T')[0]}_to_${endDate.toISOString().split('T')[0]}`;
                    content = this.generateAttendanceCSV(data);
                    break;
                case 'students':
                    data = this.classStudents;
                    filename = `students_${new Date().toISOString().split('T')[0]}`;
                    content = this.generateStudentsCSV(data);
                    break;
                case 'summary':
                    data = await this.getAttendanceReport(startDate, endDate, 1000);
                    filename = `class_summary_${startDate.toISOString().split('T')[0]}_to_${endDate.toISOString().split('T')[0]}`;
                    content = this.generateSummaryCSV(data);
                    break;
                default:
                    throw new Error('Invalid export type');
            }

            if (format === 'csv') {
                this.downloadCSV(content, filename);
            } else {
                const previewWindow = window.open('', '_blank');
                const title = filename.replace(/_/g, ' ');
                const lines = content.split('\n').map(l => l.split(',').map(s => s.replace(/^"|"$/g, '')));
                const tableRows = lines.map(row => `<tr>${row.map(cell => `<td style="border:1px solid #ddd;padding:8px;font-family:Arial, sans-serif;font-size:12px;">${cell}</td>`).join('')}</tr>`).join('');
                previewWindow.document.write(`
                    <html><head><title>${title}</title>
                    <style>table{border-collapse:collapse;width:100%} thead td{font-weight:bold;background:#f9fafb}</style>
                    </head><body>
                    <h3 style="font-family:Arial, sans-serif">${title}</h3>
                    <table><thead>${tableRows.split('</tr>')[0]}</thead><tbody>${tableRows.substring(tableRows.indexOf('</tr>')+5)}</tbody></table>
                    <script>window.onload = () => window.print();</script>
                    </body></html>
                `);
                previewWindow.document.close();
                this.showNotification('Opened print preview for PDF export', 'success');
            }

            this.hideLoading();
            this.showNotification('Export generated successfully', 'success');
        } catch (error) {
            console.error('Error generating export:', error);
            this.hideLoading();
            this.showNotification('Error generating export', 'error');
        }
    }

    generateAttendanceCSV(attendanceData) {
        const headers = ['Date', 'Student Name', 'LRN', 'Time', 'Session', 'Status', 'Entry Type'];
        const rows = attendanceData.map(record => {
            const student = this.classStudents.find(s => s.id === record.studentId);
            const date = record.timestamp?.toDate ? record.timestamp.toDate() : new Date(record.timestamp);
            return [
                date.toISOString().split('T')[0] || 'N/A',
                student?.name || 'Unknown',
                student?.lrn || 'N/A',
                record.time,
                record.session,
                record.status,
                record.entryType
            ];
        });

        return [headers, ...rows].map(row => row.map(field => `"${field}"`).join(',')).join('\n');
    }

    generateStudentsCSV(students) {
        const headers = ['Name', 'LRN', 'Grade', 'Level', 'Strand', 'Status', 'Student ID', 'Class'];
        const rows = students.map(student => [
            student.name,
            student.lrn || 'N/A',
            student.grade,
            student.level,
            student.strand || 'N/A',
            EducareTrack.getStatusText(student.currentStatus),
            student.studentId,
            this.currentUser.className || 'N/A'
        ]);

        return [headers, ...rows].map(row => row.map(field => `"${field}"`).join(',')).join('\n');
    }

    generateSummaryCSV(attendanceData) {
        const studentAttendance = this.calculateStudentAttendance();
        const headers = ['Student Name', 'LRN', 'Attendance Rate', 'Total Days', 'Present', 'Absent', 'Late', 'In Clinic'];
        const rows = this.classStudents.map(student => {
            const data = studentAttendance[student.id] || { attendanceRate: 0, total: 0, present: 0, absences: 0 };
            return [
                student.name,
                student.lrn || 'N/A',
                data.attendanceRate + '%',
                data.total,
                data.present,
                data.absences,
                attendanceData.filter(r => r.studentId === student.id && r.status === 'late').length,
                attendanceData.filter(r => r.studentId === student.id && r.status === 'in_clinic').length
            ];
        });

        return [headers, ...rows].map(row => row.map(field => `"${field}"`).join(',')).join('\n');
    }

    downloadCSV(content, filename) {
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', `${filename}.csv`);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    updateExportPreview() {
        const container = document.getElementById('exportPreview');
        const exportType = document.getElementById('exportType').value;
        
        const previews = {
            'attendance': 'Attendance records with date, student information, and status details.',
            'students': 'Complete student list with contact information and current status.',
            'summary': 'Class summary with attendance rates and performance metrics.'
        };

        if (container) {
            container.innerHTML = `
                <p class="mb-2">Export will include:</p>
                <ul class="list-disc list-inside space-y-1 text-gray-700">
                    <li>${previews[exportType]}</li>
                    <li>Data for selected date range</li>
                    <li>Formatted for easy analysis</li>
                </ul>
            `;
        }
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
    window.teacherReports = new TeacherReports();
});
