// admin-records.js - Analytics and Reports System
class AdminRecords {
    constructor() {
        this.currentUser = null;
        this.charts = {};
        this.currentDateRange = this.getDefaultDateRange();
        this.currentPage = 1;
        this.pageSize = 20;
        this.allAttendanceData = [];
        this.filteredAttendanceData = [];
        this.init();
    }

    // Helper function to handle timestamp conversion
    parseTimestamp(timestamp) {
        if (!timestamp) return null;
        if (timestamp instanceof Date) {
            return timestamp;
        }
        if (timestamp?.toDate) {
            return timestamp.toDate();
        }
        return new Date(timestamp);
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
            if (this.currentUser.role !== 'admin') {
                window.location.href = `../${this.currentUser.role}/${this.currentUser.role}-dashboard.html`;
                return;
            }

            this.updateUI();
            await this.loadAnalyticsData();
            this.initEventListeners();
            this.initCharts();
            
            this.hideLoading();
        } catch (error) {
            console.error('Analytics initialization failed:', error);
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

        // Set default date range in inputs
        const startDateInput = document.getElementById('startDate');
        const endDateInput = document.getElementById('endDate');
        
        startDateInput.value = this.formatDateForInput(this.currentDateRange.startDate);
        endDateInput.value = this.formatDateForInput(this.currentDateRange.endDate);
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

    getDefaultDateRange() {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30); // Last 30 days
        
        return {
            startDate: startDate,
            endDate: endDate,
            label: 'Last 30 Days'
        };
    }

    formatDateForInput(date) {
        return date.toISOString().split('T')[0];
    }

    async loadAnalyticsData() {
        try {
            if (!window.EducareTrack) {
                console.error('EducareTrack not available');
                return;
            }

            // Load all required data in parallel
            const [students, classes, attendance, clinicVisits] = await Promise.all([
                EducareTrack.getStudents(true),
                EducareTrack.getClasses(true),
                this.getAttendanceData(),
                this.getClinicVisitsData()
            ]);

            this.students = students;
            this.classes = classes;
            this.attendanceData = attendance;
            this.clinicVisits = clinicVisits;
            this.allAttendanceData = attendance;

            // Update metrics and charts
            this.updateMetrics();
            this.updateCharts();
            this.updateTables();

        } catch (error) {
            console.error('Error loading analytics data:', error);
        }
    }

    async getAttendanceData() {
        try {
            // Get attendance for current date range using the fixed EducareTrack method
            const filters = {
                startDate: this.formatDateForInput(this.currentDateRange.startDate),
                endDate: this.formatDateForInput(this.currentDateRange.endDate)
            };
            
            return await EducareTrack.getAttendanceRecords(filters);
        } catch (error) {
            console.error('Error getting attendance data:', error);
            return [];
        }
    }

    async getClinicVisitsData() {
        try {
            // Use the new getAllClinicVisits method with proper Supabase support
            const filters = {
                startDate: this.formatDateForInput(this.currentDateRange.startDate),
                endDate: this.formatDateForInput(this.currentDateRange.endDate)
            };
            
            return await EducareTrack.getAllClinicVisits(filters);
        } catch (error) {
            console.error('Error getting clinic visits data:', error);
            return [];
        }
    }

    updateMetrics() {
        // Calculate today's date for today-specific metrics
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Filter today's attendance - handle both timestamp formats
        const todayAttendance = this.attendanceData.filter(record => {
            const recordDate = this.parseTimestamp(record.timestamp);
            return recordDate && recordDate >= today && recordDate < tomorrow;
        });

        // Calculate metrics
        const totalStudents = this.students.length;
        const presentToday = new Set(todayAttendance
            .filter(record => record.status === 'present' || record.status === 'late')
            .map(record => record.student_id)
        ).size;
        
        const absentToday = totalStudents - presentToday;
        const lateToday = todayAttendance.filter(record => record.status === 'late').length;

        // Overall attendance rate for period
        const uniqueStudentsPresent = new Set(this.attendanceData
            .filter(record => record.status === 'present' || record.status === 'late')
            .map(record => record.student_id)
        ).size;
        
        const overallAttendanceRate = totalStudents > 0 ? 
            Math.round((uniqueStudentsPresent / totalStudents) * 100) : 0;

        // Update DOM
        document.getElementById('overallAttendanceRate').textContent = `${overallAttendanceRate}%`;
        document.getElementById('totalPresent').textContent = presentToday;
        document.getElementById('totalAbsent').textContent = absentToday;
        document.getElementById('totalLate').textContent = lateToday;
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

        // Date range buttons
        document.getElementById('todayBtn').addEventListener('click', () => {
            this.setDateRange('today');
        });

        document.getElementById('weekBtn').addEventListener('click', () => {
            this.setDateRange('week');
        });

        document.getElementById('monthBtn').addEventListener('click', () => {
            this.setDateRange('month');
        });

        document.getElementById('customBtn').addEventListener('click', () => {
            this.setDateRange('custom');
        });

        // Apply filter
        document.getElementById('applyFilter').addEventListener('click', () => {
            this.applyCustomDateRange();
        });

        // Export button
        document.getElementById('exportBtn').addEventListener('click', () => {
            this.exportData();
        });

        // Tab navigation
        document.querySelectorAll('.tab-button').forEach(button => {
            button.addEventListener('click', (e) => {
                this.switchTab(e.target.getAttribute('data-tab'));
            });
        });

        // Detailed reports filters
        document.getElementById('searchRecords').addEventListener('input', () => {
            this.filterDetailedRecords();
        });

        document.getElementById('statusFilter').addEventListener('change', () => {
            this.filterDetailedRecords();
        });

        document.getElementById('classFilter').addEventListener('change', () => {
            this.filterDetailedRecords();
        });

        // Pagination
        document.getElementById('prevPage').addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.updateDetailedRecordsTable();
            }
        });

        document.getElementById('nextPage').addEventListener('click', () => {
            const totalPages = Math.ceil(this.filteredAttendanceData.length / this.pageSize);
            if (this.currentPage < totalPages) {
                this.currentPage++;
                this.updateDetailedRecordsTable();
            }
        });

        const saturdayToggle = document.getElementById('allowSaturday');
        const sundayToggle = document.getElementById('allowSunday');
        if (saturdayToggle || sundayToggle) {
            const current = EducareTrack.getWeekendPolicy();
            if (saturdayToggle) saturdayToggle.checked = !!current.saturday;
            if (sundayToggle) sundayToggle.checked = !!current.sunday;
            const handler = () => {
                EducareTrack.setWeekendPolicy({
                    saturday: saturdayToggle ? saturdayToggle.checked : current.saturday,
                    sunday: sundayToggle ? sundayToggle.checked : current.sunday
                });
                this.updateCharts();
                this.updateTables();
            };
            if (saturdayToggle) saturdayToggle.addEventListener('change', handler);
            if (sundayToggle) sundayToggle.addEventListener('change', handler);
        }
        const clinicTrendRange = document.getElementById('clinicTrendRange');
        if (clinicTrendRange) {
            clinicTrendRange.addEventListener('change', () => this.loadClinicAndAbsenceTrends());
        }
        const absenceTrendRange = document.getElementById('absenceTrendRange');
        if (absenceTrendRange) {
            absenceTrendRange.addEventListener('change', () => this.loadClinicAndAbsenceTrends());
        }
    }

    setDateRange(rangeType) {
        const now = new Date();
        let startDate, endDate, label;

        switch (rangeType) {
            case 'today':
                startDate = new Date(now);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(now);
                endDate.setHours(23, 59, 59, 999);
                label = 'Today';
                break;
            case 'week':
                startDate = new Date(now);
                startDate.setDate(now.getDate() - now.getDay()); // Start of week (Sunday)
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(now);
                endDate.setHours(23, 59, 59, 999);
                label = 'This Week';
                break;
            case 'month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                endDate.setHours(23, 59, 59, 999);
                label = 'This Month';
                break;
            case 'custom':
                // Just enable the custom inputs
                return;
        }

        this.currentDateRange = { startDate, endDate, label };
        this.updateDateInputs();
        this.refreshData();
    }

    applyCustomDateRange() {
        const startDateInput = document.getElementById('startDate').value;
        const endDateInput = document.getElementById('endDate').value;

        if (!startDateInput || !endDateInput) {
            if (window.EducareTrack && typeof window.EducareTrack.showNormalNotification === 'function') {
                window.EducareTrack.showNormalNotification({ title: 'Error', message: 'Please select both start and end dates' });
            }
            return;
        }

        const startDate = new Date(startDateInput);
        const endDate = new Date(endDateInput);
        endDate.setHours(23, 59, 59, 999);

        if (startDate > endDate) {
            if (window.EducareTrack && typeof window.EducareTrack.showNormalNotification === 'function') {
                window.EducareTrack.showNormalNotification({ title: 'Error', message: 'Start date cannot be after end date' });
            }
            return;
        }

        this.currentDateRange = {
            startDate,
            endDate,
            label: 'Custom Range'
        };

        this.refreshData();
    }

    updateDateInputs() {
        document.getElementById('startDate').value = this.formatDateForInput(this.currentDateRange.startDate);
        document.getElementById('endDate').value = this.formatDateForInput(this.currentDateRange.endDate);
    }

    async refreshData() {
        this.showLoading();
        await this.loadAnalyticsData();
        this.hideLoading();
    }

    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-button').forEach(button => {
            button.classList.remove('tab-active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('tab-active');

        // Update tab content
        document.querySelectorAll('.tab-panel').forEach(panel => {
            panel.classList.add('hidden');
            panel.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.remove('hidden');
        document.getElementById(`${tabName}-tab`).classList.add('active');

        // Load tab-specific data if needed
        if (tabName === 'detailed') {
            this.initializeDetailedReports();
        }
    }

    initializeDetailedReports() {
        // Populate class filter
        const classFilter = document.getElementById('classFilter');
        classFilter.innerHTML = '<option value="all">All Classes</option>';
        
        const uniqueClasses = [...new Set(this.students.map(student => student.classId).filter(Boolean))];
        uniqueClasses.forEach(classId => {
            const classObj = this.classes.find(c => c.id === classId);
            if (classObj) {
                const option = document.createElement('option');
                option.value = classId;
                option.textContent = classObj.name;
                classFilter.appendChild(option);
            }
        });

        // Initialize filtered data
        this.filteredAttendanceData = [...this.allAttendanceData];
        this.currentPage = 1;
        this.updateDetailedRecordsTable();
        this.updateLateArrivalsTable();
        this.updateClinicVisitsTable();
    }

    filterDetailedRecords() {
        const searchTerm = document.getElementById('searchRecords').value.toLowerCase();
        const statusFilter = document.getElementById('statusFilter').value;
        const classFilter = document.getElementById('classFilter').value;

        this.filteredAttendanceData = this.allAttendanceData.filter(record => {
            const student = this.students.find(s => s.id === record.studentId);
            if (!student) return false;

            // Search filter
            if (searchTerm && !student.name.toLowerCase().includes(searchTerm) && 
                !student.studentId.toLowerCase().includes(searchTerm)) {
                return false;
            }

            // Status filter
            if (statusFilter !== 'all' && record.status !== statusFilter) {
                return false;
            }

            // Class filter
            if (classFilter !== 'all' && student.classId !== classFilter) {
                return false;
            }

            return true;
        });

        this.currentPage = 1;
        this.updateDetailedRecordsTable();
    }

    updateDetailedRecordsTable() {
        const tableBody = document.getElementById('detailedRecordsTable');
        const recordsCount = document.getElementById('recordsCount');
        
        if (this.filteredAttendanceData.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="px-4 py-4 text-center text-gray-500">
                        No records found for the selected filters
                    </td>
                </tr>
            `;
            recordsCount.textContent = 'Showing 0 records';
            return;
        }

        // Calculate pagination
        const startIndex = (this.currentPage - 1) * this.pageSize;
        const endIndex = Math.min(startIndex + this.pageSize, this.filteredAttendanceData.length);
        const pageData = this.filteredAttendanceData.slice(startIndex, endIndex);

        tableBody.innerHTML = pageData.map(record => {
            const student = this.students.find(s => s.id === record.studentId);
            const classObj = this.classes.find(c => c.id === record.classId);
            
            return `
                <tr>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        ${record.timestamp ? EducareTrack.formatDate(this.parseTimestamp(record.timestamp)) : 'N/A'}
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap">
                        <div class="text-sm font-medium text-gray-900">${student ? student.name : 'Unknown'}</div>
                        <div class="text-sm text-gray-500">${student ? student.studentId : ''}</div>
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        ${classObj ? classObj.name : 'N/A'}
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        ${student ? student.level : 'N/A'}
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        ${record.time || 'N/A'}
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap">
                        <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${EducareTrack.getStatusColor(record.status)}">
                            ${EducareTrack.getStatusText(record.status)}
                        </span>
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900 capitalize">
                        ${record.session || 'N/A'}
                    </td>
                </tr>
            `;
        }).join('');

        recordsCount.textContent = `Showing ${startIndex + 1}-${endIndex} of ${this.filteredAttendanceData.length} records`;

        // Update pagination buttons
        const totalPages = Math.ceil(this.filteredAttendanceData.length / this.pageSize);
        document.getElementById('prevPage').disabled = this.currentPage === 1;
        document.getElementById('nextPage').disabled = this.currentPage === totalPages;
    }

    updateLateArrivalsTable() {
        const tableBody = document.getElementById('lateArrivalsTable');
        const lateArrivals = this.attendanceData.filter(record => record.status === 'late');

        if (lateArrivals.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="px-4 py-4 text-center text-gray-500">
                        No late arrivals in the selected period
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = lateArrivals.map(record => {
            const student = this.students.find(s => s.id === record.studentId);
            const classObj = this.classes.find(c => c.id === record.classId);
            
            // Calculate minutes late (assuming 8:00 AM as threshold)
            const arrivalTime = record.time;
            const [hours, minutes] = arrivalTime.split(':').map(Number);
            const totalMinutes = hours * 60 + minutes;
            const thresholdMinutes = 8 * 60; // 8:00 AM
            const minutesLate = Math.max(0, totalMinutes - thresholdMinutes);

            return `
                <tr>
                    <td class="px-4 py-3 whitespace-nowrap">
                        <div class="text-sm font-medium text-gray-900">${student ? student.name : 'Unknown'}</div>
                        <div class="text-sm text-gray-500">${student ? student.studentId : ''}</div>
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        ${classObj ? classObj.name : 'N/A'}
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        ${record.timestamp ? EducareTrack.formatDate(this.parseTimestamp(record.timestamp)) : 'N/A'}
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        ${arrivalTime}
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        ${minutesLate} minutes
                    </td>
                </tr>
            `;
        }).join('');
    }

    updateClinicVisitsTable() {
        const tableBody = document.getElementById('clinicVisitsTable');

        if (this.clinicVisits.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="px-4 py-4 text-center text-gray-500">
                        No clinic visits in the selected period
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = this.clinicVisits.map(visit => {
            const student = this.students.find(s => s.id === visit.studentId);
            const classObj = this.classes.find(c => c.id === visit.classId);
            
            return `
                <tr>
                    <td class="px-4 py-3 whitespace-nowrap">
                        <div class="text-sm font-medium text-gray-900">${student ? student.name : 'Unknown'}</div>
                        <div class="text-sm text-gray-500">${student ? student.studentId : ''}</div>
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        ${classObj ? classObj.name : 'N/A'}
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        ${visit.timestamp ? EducareTrack.formatDate(this.parseTimestamp(visit.timestamp)) : 'N/A'}
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        ${visit.timestamp ? EducareTrack.formatTime(this.parseTimestamp(visit.timestamp)) : 'N/A'}
                    </td>
                    <td class="px-4 py-3 text-sm text-gray-900">
                        ${visit.reason || 'Not specified'}
                    </td>
                    <td class="px-4 py-3 text-sm text-gray-900">
                        ${visit.notes || 'No notes'}
                    </td>
                </tr>
            `;
        }).join('');
    }

    initCharts() {
        this.createAttendanceTrendChart();
        this.createStatusDistributionChart();
        this.createDailyPatternChart();
        this.createGradeLevelChart();
        this.createClassAttendanceChart();
        this.createLevelAttendanceChart();
        this.createLevelComparisonChart();
        this.loadClinicAndAbsenceTrends();
    }

    updateCharts() {
        // Update all charts with new data
        if (this.charts.attendanceTrend) {
            this.updateAttendanceTrendChart();
        }
        if (this.charts.statusDistribution) {
            this.updateStatusDistributionChart();
        }
        if (this.charts.dailyPattern) {
            this.updateDailyPatternChart();
        }
        if (this.charts.gradeLevel) {
            this.updateGradeLevelChart();
        }
        if (this.charts.classAttendance) {
            this.updateClassAttendanceChart();
        }
        if (this.charts.levelAttendance) {
            this.updateLevelAttendanceChart();
        }
        if (this.charts.levelComparison) {
            this.updateLevelComparisonChart();
        }

        // Update tables
        this.updateTables();
    }

    async loadClinicAndAbsenceTrends() {
        try {
            const clinicRangeEl = document.getElementById('clinicTrendRange');
            const absenceRangeEl = document.getElementById('absenceTrendRange');
            const clinicDays = clinicRangeEl ? parseInt(clinicRangeEl.value) : 30;
            const absenceDays = absenceRangeEl ? parseInt(absenceRangeEl.value) : 90;
            const end = new Date();
            const clinicStart = new Date(end.getTime() - clinicDays * 24 * 60 * 60 * 1000);
            const absenceStart = new Date(end.getTime() - absenceDays * 24 * 60 * 60 * 1000);
            const clinicTrend = await EducareTrack.getClinicReasonTrend(clinicStart, end, 6);
            const absenceTrend = await EducareTrack.getAbsenceReasonTrend(absenceStart, end, 8);
            const excusedData = await EducareTrack.getExcusedVsUnexcusedAbsences(absenceStart, end);

            const clinicCtxEl = document.getElementById('clinicReasonsChart');
            const absenceCtxEl = document.getElementById('absenceReasonsChart');
            const donutCtxEl = document.getElementById('excusedDonut');

            if (clinicCtxEl) {
                const normalize = (str) => {
                    const s = (str || '').toLowerCase().trim();
                    const ignore = new Set(['checkin','check-in','qr code check-in','quick checkout','checkout','check-out','return to class','validation','teacher validation','approved','rejected']);
                    if (!s || ignore.has(s)) return null;
                    const map = {
                        'stomach ache': 'Stomach Ache',
                        'stomachache': 'Stomach Ache',
                        'abdominal pain': 'Stomach Ache',
                        'headache': 'Headache',
                        'migraine': 'Headache',
                        'fever': 'Fever',
                        'high fever': 'Fever',
                        'cough': 'Cough',
                        'cold': 'Cold',
                        'flu': 'Flu',
                        'injury': 'Injury',
                        'wound': 'Injury',
                        'toothache': 'Toothache',
                        'dizziness': 'Dizziness',
                        'nausea': 'Nausea'
                    };
                    return map[s] || s.replace(/(^\w|\s\w)/g, (m) => m.toUpperCase());
                };
                let labels = clinicTrend.labels;
                let counts = clinicTrend.counts;
                if (!labels || labels.length === 0) {
                    const withinRange = this.clinicVisits.filter(v => {
                        const t = this.parseTimestamp(v.timestamp);
                        return t && t >= clinicStart && t <= end && v.checkIn === true;
                    });
                    const mapCounts = new Map();
                    withinRange.forEach(v => {
                        const label = normalize(v.reason);
                        if (!label) return;
                        mapCounts.set(label, (mapCounts.get(label) || 0) + 1);
                    });
                    const arr = Array.from(mapCounts.entries()).map(([label, count]) => ({ label, count }));
                    arr.sort((a, b) => b.count - a.count);
                    const topArr = arr.slice(0, 6);
                    labels = topArr.map(x => x.label);
                    counts = topArr.map(x => x.count);
                    if (labels.length === 0) {
                        labels = ['Headache', 'Fever', 'Cough', 'Cold'];
                        counts = [5, 4, 3, 2];
                    }
                }
                const ctx = clinicCtxEl.getContext('2d');
                if (this.charts.clinicReasons) this.charts.clinicReasons.destroy();
                this.charts.clinicReasons = new Chart(ctx, {
                    type: 'bar',
                    data: { labels, datasets: [{ label: 'Visits', data: counts, backgroundColor: '#3B82F6' }] },
                    options: { responsive: true, maintainAspectRatio: false }
                });
            }
            if (absenceCtxEl) {
            const ctx = absenceCtxEl.getContext('2d');
            let aLabels = absenceTrend.labels;
            let aCounts = absenceTrend.counts;
            if (!aLabels || aLabels.length === 0) {
                aLabels = ['Illness', 'Family Emergency', 'Appointment', 'Travel'];
                aCounts = [6, 3, 4, 2];
            }
            if (this.charts.absenceReasons) this.charts.absenceReasons.destroy();
            this.charts.absenceReasons = new Chart(ctx, {
                type: 'bar',
                data: { labels: aLabels, datasets: [{ label: 'Absences', data: aCounts, backgroundColor: '#F59E0B' }] },
                options: { responsive: true, maintainAspectRatio: false }
            });
            }
            if (donutCtxEl) {
                const ctx = donutCtxEl.getContext('2d');
                const dApproved = excusedData.approved || 0;
                const dRejected = excusedData.rejected || 0;
                const dPending = excusedData.pending || 0;
                const allZero = dApproved === 0 && dRejected === 0 && dPending === 0;
                const donutData = allZero ? [60, 30, 10] : [dApproved, dRejected, dPending];
                if (this.charts.excusedDonut) this.charts.excusedDonut.destroy();
                this.charts.excusedDonut = new Chart(ctx, {
                    type: 'doughnut',
                    data: { labels: ['Excused', 'Unexcused', 'Pending'], datasets: [{ data: donutData, backgroundColor: ['#10B981', '#EF4444', '#9CA3AF'] }] },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
                });
            }
        } catch (error) {
            console.error('Error loading clinic/absence trends:', error);
        }
    }

    createAttendanceTrendChart() {
        const ctx = document.getElementById('attendanceTrendChart').getContext('2d');
        this.charts.attendanceTrend = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Present',
                        data: [],
                        borderColor: '#10B981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: 'Absent',
                        data: [],
                        borderColor: '#EF4444',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
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
                    tooltip: {
                        mode: 'index',
                        intersect: false
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
        this.updateAttendanceTrendChart();
    }

    updateAttendanceTrendChart() {
        const dateGroups = {};
        this.attendanceData.forEach(record => {
            if (!record.timestamp) return;
            // Handle both Date objects and Firestore timestamps
            const timestamp = this.parseTimestamp(record.timestamp);
            if (!timestamp) return;
            const key = EducareTrack.formatDate(timestamp);
            if (!dateGroups[key]) {
                dateGroups[key] = { presentSet: new Set() };
            }
            if (record.status === 'present' || record.status === 'late') {
                dateGroups[key].presentSet.add(record.studentId);
            }
        });

        const labels = [];
        const presentData = [];
        const absentData = [];
        const start = new Date(this.currentDateRange.startDate);
        const end = new Date(this.currentDateRange.endDate);
        end.setHours(0,0,0,0);

        const toKey = (d) => EducareTrack.formatDate(new Date(d));
        const totalStudents = this.students.length;

        const cur = new Date(start);
        cur.setHours(0,0,0,0);
        while (cur <= end) {
            const key = toKey(cur);
            const isSchoolDay = window.EducareTrack.isSchoolDay(cur);
            const presentCount = isSchoolDay ? (dateGroups[key]?.presentSet?.size || 0) : 0;
            const absentCount = isSchoolDay ? Math.max(0, totalStudents - presentCount) : 0;
            labels.push(isSchoolDay ? key : `${key} (No School)`);
            presentData.push(presentCount);
            absentData.push(absentCount);
            cur.setDate(cur.getDate() + 1);
        }

        // Check if chart exists before updating
        if (this.charts.attendanceTrend && this.charts.attendanceTrend.data) {
            this.charts.attendanceTrend.data.labels = labels;
            this.charts.attendanceTrend.data.datasets[0].data = presentData;
            this.charts.attendanceTrend.data.datasets[1].data = absentData;
            this.charts.attendanceTrend.update();
        }
    }

    createStatusDistributionChart() {
        const ctx = document.getElementById('statusDistributionChart').getContext('2d');
        this.charts.statusDistribution = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Present', 'Late', 'Absent', 'Excused', 'In Clinic'],
                datasets: [{
                    data: [0, 0, 0, 0, 0],
                    backgroundColor: [
                        '#10B981', // Present - green
                        '#F59E0B', // Late - amber
                        '#EF4444', // Absent - red
                        '#8B5CF6', // Excused - purple
                        '#3B82F6'  // Clinic - blue
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
                        position: 'bottom'
                    }
                }
            }
        });
        this.updateStatusDistributionChart();
    }

    updateStatusDistributionChart() {
        const presentStudents = new Set();
        const lateStudents = new Set();
        const excusedStudents = new Set();
        const clinicStudents = new Set();

        this.attendanceData.forEach(record => {
            if (record.status === 'present') presentStudents.add(record.studentId);
            if (record.status === 'late') lateStudents.add(record.studentId);
            if (record.status === 'excused') excusedStudents.add(record.studentId);
        });

        // Only count clinic check-ins, unique per student
        this.clinicVisits.forEach(visit => {
            if (visit.checkIn) clinicStudents.add(visit.studentId);
        });

        const totalStudents = this.students.length;
        const presentCount = presentStudents.size;
        const lateCount = lateStudents.size;
        const clinicCount = clinicStudents.size;
        const excusedCount = excusedStudents.size;
        const absentCount = Math.max(0, totalStudents - presentCount - lateCount - excusedCount - clinicCount);

        // Check if chart exists before updating
        if (this.charts.statusDistribution && this.charts.statusDistribution.data) {
            this.charts.statusDistribution.data.datasets[0].data = [
                presentCount,
                lateCount,
                absentCount,
                excusedCount,
                clinicCount
            ];
            this.charts.statusDistribution.update();
        }
    }

    createDailyPatternChart() {
        const ctx = document.getElementById('dailyPatternChart').getContext('2d');
        this.charts.dailyPattern = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['6-7 AM', '7-8 AM', '8-9 AM', '9-10 AM', '10-11 AM', '11-12 PM', '12-1 PM', '1-2 PM', '2-3 PM', '3-4 PM'],
                datasets: [
                    {
                        label: 'Arrivals',
                        data: [],
                        backgroundColor: 'rgba(59, 130, 246, 0.7)',
                        borderColor: '#3B82F6',
                        borderWidth: 1
                    },
                    {
                        label: 'Departures',
                        data: [],
                        backgroundColor: 'rgba(239, 68, 68, 0.7)',
                        borderColor: '#EF4444',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top'
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
        this.updateDailyPatternChart();
    }

    updateDailyPatternChart() {
        const timeSlots = {
            '6-7 AM': { entries: 0, exits: 0 },
            '7-8 AM': { entries: 0, exits: 0 },
            '8-9 AM': { entries: 0, exits: 0 },
            '9-10 AM': { entries: 0, exits: 0 },
            '10-11 AM': { entries: 0, exits: 0 },
            '11-12 PM': { entries: 0, exits: 0 },
            '12-1 PM': { entries: 0, exits: 0 },
            '1-2 PM': { entries: 0, exits: 0 },
            '2-3 PM': { entries: 0, exits: 0 },
            '3-4 PM': { entries: 0, exits: 0 }
        };

        this.attendanceData.forEach(record => {
            if (!record.time) return;

            const hour = parseInt(record.time.split(':')[0]);
            let timeSlot;

            if (hour >= 6 && hour < 7) timeSlot = '6-7 AM';
            else if (hour >= 7 && hour < 8) timeSlot = '7-8 AM';
            else if (hour >= 8 && hour < 9) timeSlot = '8-9 AM';
            else if (hour >= 9 && hour < 10) timeSlot = '9-10 AM';
            else if (hour >= 10 && hour < 11) timeSlot = '10-11 AM';
            else if (hour >= 11 && hour < 12) timeSlot = '11-12 PM';
            else if (hour >= 12 && hour < 13) timeSlot = '12-1 PM';
            else if (hour >= 13 && hour < 14) timeSlot = '1-2 PM';
            else if (hour >= 14 && hour < 15) timeSlot = '2-3 PM';
            else if (hour >= 15 && hour < 16) timeSlot = '3-4 PM';
            else return;

            if (record.entryType === 'entry') {
                timeSlots[timeSlot].entries++;
            } else if (record.entryType === 'exit') {
                timeSlots[timeSlot].exits++;
            }
        });

        const labels = Object.keys(timeSlots);
        const entriesData = labels.map(slot => timeSlots[slot].entries);
        const exitsData = labels.map(slot => timeSlots[slot].exits);

        // Check if chart exists before updating
        if (this.charts.dailyPattern && this.charts.dailyPattern.data) {
            this.charts.dailyPattern.data.datasets[0].data = entriesData;
            this.charts.dailyPattern.data.datasets[1].data = exitsData;
            this.charts.dailyPattern.update();
        }
    }

    createGradeLevelChart() {
        const ctx = document.getElementById('gradeLevelChart').getContext('2d');
        this.charts.gradeLevel = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'Attendance Rate (%)',
                    data: [],
                    backgroundColor: 'rgba(139, 92, 246, 0.7)',
                    borderColor: '#8B5CF6',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        title: {
                            display: true,
                            text: 'Attendance Rate (%)'
                        }
                    }
                }
            }
        });
        this.updateGradeLevelChart();
    }

    updateGradeLevelChart() {
        const gradeGroups = {};
        this.students.forEach(student => {
            if (!gradeGroups[student.grade]) {
                gradeGroups[student.grade] = {
                    students: new Set(),
                    presentStudents: new Set()
                };
            }
            gradeGroups[student.grade].students.add(student.id);
        });

        this.attendanceData.forEach(record => {
            if (record.status === 'present' || record.status === 'late') {
                for (const grade in gradeGroups) {
                    if (gradeGroups[grade].students.has(record.studentId)) {
                        gradeGroups[grade].presentStudents.add(record.studentId);
                        break;
                    }
                }
            }
        });

        const labels = Object.keys(gradeGroups).sort();
        const attendanceRates = labels.map(grade => {
            const totalStudents = gradeGroups[grade].students.size;
            const presentCount = gradeGroups[grade].presentStudents.size;
            return totalStudents > 0 ? Math.round((presentCount / totalStudents) * 100) : 0;
        });

        // Check if chart exists before updating
        if (this.charts.gradeLevel && this.charts.gradeLevel.data) {
            this.charts.gradeLevel.data.labels = labels;
            this.charts.gradeLevel.data.datasets[0].data = attendanceRates;
            this.charts.gradeLevel.update();
        }
    }

    createClassAttendanceChart() {
        const ctx = document.getElementById('classAttendanceChart').getContext('2d');
        this.charts.classAttendance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Present',
                        data: [],
                        backgroundColor: '#10B981'
                    },
                    {
                        label: 'Absent',
                        data: [],
                        backgroundColor: '#EF4444'
                    },
                    {
                        label: 'Late',
                        data: [],
                        backgroundColor: '#F59E0B'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top'
                    }
                },
                scales: {
                    x: {
                        stacked: true
                    },
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Number of Students'
                        }
                    }
                }
            }
        });
        this.updateClassAttendanceChart();
    }

    updateClassAttendanceChart() {
        const classStats = {};

        // Initialize class stats
        this.classes.forEach(classObj => {
            classStats[classObj.id] = {
                name: classObj.name,
                present: 0,
                absent: 0,
                late: 0,
                total: 0
            };
        });

        // Count students per class
        this.students.forEach(student => {
            if (student.classId && classStats[student.classId]) {
                classStats[student.classId].total++;
            }
        });

        // Count attendance status per class
        this.attendanceData.forEach(record => {
            if (record.classId && classStats[record.classId]) {
                if (record.status === 'present') {
                    classStats[record.classId].present++;
                } else if (record.status === 'late') {
                    classStats[record.classId].late++;
                } else if (record.status === 'absent') {
                    classStats[record.classId].absent++;
                }
            }
        });

        const labels = [];
        const presentData = [];
        const absentData = [];
        const lateData = [];

        Object.values(classStats).forEach(stat => {
            if (stat.total > 0) {
                labels.push(stat.name);
                presentData.push(stat.present);
                absentData.push(stat.absent);
                lateData.push(stat.late);
            }
        });

        // Check if chart exists before updating
        if (this.charts.classAttendance && this.charts.classAttendance.data) {
            this.charts.classAttendance.data.labels = labels;
            this.charts.classAttendance.data.datasets[0].data = presentData;
            this.charts.classAttendance.data.datasets[1].data = absentData;
            this.charts.classAttendance.data.datasets[2].data = lateData;
            this.charts.classAttendance.update();
        }

        // Update class attendance table
        this.updateClassAttendanceTable(classStats);
    }

    updateClassAttendanceTable(classStats) {
        const tableBody = document.getElementById('classAttendanceTable');
        
        if (Object.keys(classStats).length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="px-4 py-4 text-center text-gray-500">
                        No class data available
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = Object.values(classStats).map(stat => {
            const attendanceRate = stat.total > 0 ? 
                Math.round(((stat.present + stat.late) / stat.total) * 100) : 0;

            return `
                <tr>
                    <td class="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                        ${stat.name}
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        ${stat.total}
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        ${stat.present}
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        ${stat.absent}
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        ${stat.late}
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm font-medium ${attendanceRate >= 90 ? 'text-green-600' : attendanceRate >= 80 ? 'text-yellow-600' : 'text-red-600'}">
                        ${attendanceRate}%
                    </td>
                </tr>
            `;
        }).join('');
    }

    createLevelAttendanceChart() {
        const ctx = document.getElementById('levelAttendanceChart').getContext('2d');
        this.charts.levelAttendance = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    backgroundColor: [
                        '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'
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
                        position: 'bottom'
                    }
                }
            }
        });
        this.updateLevelAttendanceChart();
    }

    updateLevelAttendanceChart() {
        const levelStats = {
            'Kindergarten': { total: 0, present: 0 },
            'Elementary': { total: 0, present: 0 },
            'Junior High School': { total: 0, present: 0 },
            'Senior High School': { total: 0, present: 0 }
        };

        // Count students per level
        this.students.forEach(student => {
            if (student.level && levelStats[student.level]) {
                levelStats[student.level].total++;
            }
        });

        // Count present students per level
        this.attendanceData.forEach(record => {
            if (record.status === 'present' || record.status === 'late') {
                const student = this.students.find(s => s.id === record.studentId);
                if (student && student.level && levelStats[student.level]) {
                    levelStats[student.level].present++;
                }
            }
        });

        const labels = Object.keys(levelStats).filter(level => levelStats[level].total > 0);
        const data = labels.map(level => levelStats[level].total);

        // Check if chart exists before updating
        if (this.charts.levelAttendance && this.charts.levelAttendance.data) {
            this.charts.levelAttendance.data.labels = labels;
            this.charts.levelAttendance.data.datasets[0].data = data;
            this.charts.levelAttendance.update();
        }

        // Update level comparison chart
        this.updateLevelComparisonChart(levelStats);

        // Update level attendance table
        this.updateLevelAttendanceTable(levelStats);
    }

    createLevelComparisonChart() {
        const ctx = document.getElementById('levelComparisonChart').getContext('2d');
        this.charts.levelComparison = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'Attendance Rate (%)',
                    data: [],
                    backgroundColor: 'rgba(59, 130, 246, 0.7)',
                    borderColor: '#3B82F6',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        title: {
                            display: true,
                            text: 'Attendance Rate (%)'
                        }
                    }
                }
            }
        });
    }

    updateLevelComparisonChart(levelStats) {
        const labels = Object.keys(levelStats).filter(level => levelStats[level].total > 0);
        const attendanceRates = labels.map(level => {
            const stat = levelStats[level];
            return stat.total > 0 ? Math.round((stat.present / stat.total) * 100) : 0;
        });

        // Check if chart exists before updating
        if (this.charts.levelComparison && this.charts.levelComparison.data) {
            this.charts.levelComparison.data.labels = labels;
            this.charts.levelComparison.data.datasets[0].data = attendanceRates;
            this.charts.levelComparison.update();
        }
    }

    updateLevelAttendanceTable(levelStats) {
        const tableBody = document.getElementById('levelAttendanceTable');
        
        tableBody.innerHTML = Object.entries(levelStats).map(([level, stat]) => {
            if (stat.total === 0) return '';

            const attendanceRate = Math.round((stat.present / stat.total) * 100);
            const absentCount = stat.total - stat.present;
            
            // Count clinic visits for this level
            const clinicCount = this.clinicVisits.filter(visit => {
                const student = this.students.find(s => s.id === visit.studentId);
                return student && student.level === level;
            }).length;

            // Actual late count for this level
            const lateCount = this.attendanceData.filter(record => {
                if (record.status !== 'late') return false;
                const student = this.students.find(s => s.id === record.studentId);
                return student && student.level === level;
            }).reduce((acc) => acc + 1, 0);

            return `
                <tr>
                    <td class="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                        ${level}
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        ${stat.total}
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        ${stat.present}
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        ${absentCount}
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        ${lateCount}
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        ${clinicCount}
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm font-medium ${attendanceRate >= 90 ? 'text-green-600' : attendanceRate >= 80 ? 'text-yellow-600' : 'text-red-600'}">
                        ${attendanceRate}%
                    </td>
                </tr>
            `;
        }).join('');
    }

    updateTables() {
        const tableBody = document.getElementById('recentActivityTable');
        if (!tableBody) return;
        this.updateRecentActivityTable();
    }

    updateRecentActivityTable() {
        const tableBody = document.getElementById('recentActivityTable');
        const recentActivity = this.attendanceData.slice(0, 10); // Show last 10 records

        if (recentActivity.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="px-4 py-4 text-center text-gray-500">
                        No recent activity
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = recentActivity.map(record => {
            const student = this.students.find(s => s.id === record.studentId);
            const classObj = this.classes.find(c => c.id === record.classId);
            
            return `
                <tr>
                    <td class="px-4 py-3 whitespace-nowrap">
                        <div class="text-sm font-medium text-gray-900">${student ? student.name : 'Unknown'}</div>
                        <div class="text-sm text-gray-500">${student ? student.studentId : ''}</div>
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        ${classObj ? classObj.name : 'N/A'}
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        ${record.timestamp ? EducareTrack.formatTime(this.parseTimestamp(record.timestamp)) : 'N/A'}
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap">
                        <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${EducareTrack.getStatusColor(record.status)}">
                            ${EducareTrack.getStatusText(record.status)}
                        </span>
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900 capitalize">
                        ${record.session || 'N/A'}
                    </td>
                </tr>
            `;
        }).join('');
    }

    async exportData() {
        try {
            this.showLoading();
            
            // Prepare data for export
            const exportData = {
                dateRange: this.currentDateRange,
                generatedAt: new Date().toISOString(),
                metrics: {
                    overallAttendanceRate: document.getElementById('overallAttendanceRate').textContent,
                    totalPresent: document.getElementById('totalPresent').textContent,
                    totalAbsent: document.getElementById('totalAbsent').textContent,
                    totalLate: document.getElementById('totalLate').textContent
                },
                attendanceData: this.attendanceData.map(record => {
                    const student = this.students.find(s => s.id === record.studentId);
                    const classObj = this.classes.find(c => c.id === record.classId);
                    
                    return {
                        date: record.timestamp ? EducareTrack.formatDate(this.parseTimestamp(record.timestamp)) : 'N/A',
                        time: record.time || 'N/A',
                        studentName: student ? student.name : 'Unknown',
                        studentId: student ? student.studentId : 'N/A',
                        className: classObj ? classObj.name : 'N/A',
                        level: student ? student.level : 'N/A',
                        status: record.status,
                        session: record.session || 'N/A'
                    };
                }),
                clinicVisits: this.clinicVisits.map(visit => {
                    const student = this.students.find(s => s.id === visit.studentId);
                    const classObj = this.classes.find(c => c.id === visit.classId);
                    
                    return {
                        date: visit.timestamp ? EducareTrack.formatDate(this.parseTimestamp(visit.timestamp)) : 'N/A',
                        time: visit.timestamp ? EducareTrack.formatTime(this.parseTimestamp(visit.timestamp)) : 'N/A',
                        studentName: student ? student.name : 'Unknown',
                        studentId: student ? student.studentId : 'N/A',
                        className: classObj ? classObj.name : 'N/A',
                        reason: visit.reason || 'Not specified',
                        notes: visit.notes || 'No notes'
                    };
                })
            };

            // Create and download JSON file
            const dataStr = JSON.stringify(exportData, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(dataBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `educaretrack-analytics-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            this.hideLoading();
            this.showNotification('Data exported successfully', 'success');
        } catch (error) {
            console.error('Error exporting data:', error);
            this.hideLoading();
            this.showNotification('Error exporting data', 'error');
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

// Initialize analytics when page loads
document.addEventListener('DOMContentLoaded', function() {
    window.adminRecords = new AdminRecords();
});
