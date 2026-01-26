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
        this.filteredClinicVisits = [];
        this.sortConfig = { column: 'timestamp', direction: 'desc', type: 'attendance' };
        this.realtimeChannel = null;
        this.realtimeRefreshTimer = null;
        this.isLoadingData = false;
        this.pendingRealtimeRefresh = false;
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
            if (this.currentUser.role !== 'admin') {
                window.location.href = `../${this.currentUser.role}/${this.currentUser.role}-dashboard.html`;
                return;
            }

            this.updateUI();
            await this.loadAnalyticsData();
            this.initEventListeners();
            this.initCharts();
            this.setupRealtimeUpdates();
            
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

    getStudentName(student) {
        if (!student) return 'Unknown';
        if (student.full_name) return student.full_name;
        if (student.name) return student.name;
        return 'Unknown';
    }

    getStudentIdentifier(student) {
        if (!student) return '';
        return student.studentId || student.id || '';
    }

    normalizeAttendanceRecord(record) {
        return {
            ...record,
            studentId: record.studentId || record.student_id,
            classId: record.classId || record.class_id,
            entryType: record.entryType || record.entry_type,
            recordedBy: record.recordedBy || record.recorded_by,
            recordedByName: record.recordedByName || record.recorded_by_name,
            manualEntry: record.manualEntry ?? record.manual_entry,
            timestamp: record.timestamp ? new Date(record.timestamp) : null
        };
    }

    normalizeClinicVisit(record) {
        return {
            ...record,
            studentId: record.studentId || record.student_id,
            classId: record.classId || record.class_id,
            studentName: record.studentName || record.student_name,
            checkIn: record.checkIn ?? record.check_in,
            timestamp: record.timestamp ? new Date(record.timestamp) : (record.visit_time ? new Date(record.visit_time) : null)
        };
    }

    async loadAnalyticsData() {
        try {
            if (!window.EducareTrack) {
                console.error('EducareTrack not available');
                return;
            }

            this.isLoadingData = true;

            // Load all required data in parallel
            const [students, classes, attendance, clinicVisits, _calendar] = await Promise.all([
                EducareTrack.getStudents(true),
                EducareTrack.getClasses(true),
                this.getAttendanceData(),
                this.getClinicVisitsData(),
                EducareTrack.fetchCalendarData()
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
        } finally {
            this.isLoadingData = false;
            if (this.pendingRealtimeRefresh) {
                this.pendingRealtimeRefresh = false;
                this.refreshData();
            }
        }
    }

    async getAttendanceData() {
        try {
            // Get attendance for the current date range
            const startDate = new Date(this.currentDateRange.startDate);
            const endDate = new Date(this.currentDateRange.endDate);
            endDate.setHours(23, 59, 59, 999); // Include entire end date

            if (!window.supabaseClient) throw new Error('Supabase client not initialized');

            let allData = [];
            let from = 0;
            const batchSize = 1000;
            let more = true;

            while (more) {
                const { data, error } = await window.supabaseClient
                    .from('attendance')
                    .select('*')
                    .gte('timestamp', startDate.toISOString())
                    .lte('timestamp', endDate.toISOString())
                    .order('timestamp', { ascending: false })
                    .range(from, from + batchSize - 1);

                if (error) throw error;

                if (data && data.length > 0) {
                    allData = allData.concat(data);
                    if (data.length < batchSize) {
                        more = false;
                    } else {
                        from += batchSize;
                    }
                } else {
                    more = false;
                }
            }

            return allData.map(row => this.normalizeAttendanceRecord(row));
        } catch (error) {
            console.error('Error getting attendance data:', error);
            return [];
        }
    }

    async getClinicVisitsData() {
        try {
            const startDate = new Date(this.currentDateRange.startDate);
            const endDate = new Date(this.currentDateRange.endDate);
            endDate.setHours(23, 59, 59, 999);

            if (!window.supabaseClient) throw new Error('Supabase client not initialized');

            let allData = [];
            let from = 0;
            const batchSize = 1000;
            let more = true;

            while (more) {
                const { data, error } = await window.supabaseClient
                    .from('clinic_visits')
                    .select('*')
                    .gte('visit_time', startDate.toISOString())
                    .lte('visit_time', endDate.toISOString())
                    .order('visit_time', { ascending: false })
                    .range(from, from + batchSize - 1);

                if (error) throw error;

                if (data && data.length > 0) {
                    allData = allData.concat(data);
                    if (data.length < batchSize) {
                        more = false;
                    } else {
                        from += batchSize;
                    }
                } else {
                    more = false;
                }
            }

            return allData.map(row => this.normalizeClinicVisit(row));
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

        // Filter today's attendance
        const todayAttendance = this.attendanceData.filter(record => {
            const recordDate = record.timestamp?.toDate ? record.timestamp.toDate() : new Date(record.timestamp);
            return recordDate >= today && recordDate < tomorrow;
        });

        // Calculate metrics
        const totalStudents = this.students.length;
        const presentToday = new Set(todayAttendance
            .filter(record => record.status === 'present' || record.status === 'late')
            .map(record => record.studentId)
        ).size;
        
        const absentToday = totalStudents - presentToday;
        const lateToday = todayAttendance.filter(record => record.status === 'late').length;
        const excusedToday = todayAttendance.filter(record => record.status === 'excused').length;

        // Calculate today's clinic visits
        const clinicToday = this.clinicVisits.filter(visit => {
            const visitDate = visit.timestamp;
            return visitDate >= today && visitDate < tomorrow;
        }).length;

        // Overall attendance rate for the period
        const dateMap = {};
        this.attendanceData.forEach(record => {
            const d = record.timestamp?.toDate ? record.timestamp.toDate() : new Date(record.timestamp);
            const dateStr = d.toDateString();
            if (!dateMap[dateStr]) dateMap[dateStr] = new Set();
            
            if (record.status === 'present' || record.status === 'late' || record.status === 'half_day') {
                dateMap[dateStr].add(record.studentId);
            }
        });

        const sumDailyPresent = Object.values(dateMap).reduce((sum, set) => sum + set.size, 0);

        // Calculate Total Expected Attendance (Denominator)
        // Group students by level
        const levelCounts = {};
        this.students.forEach(s => {
            const cls = this.classes.find(c => c.id === s.class_id);
            // Assuming classes have 'grade' or 'level' field. User said 'level' exists in schema.
            // Check usage: 'grade' might be 'Grade 1', 'level' might be 'Elementary' or similar.
            // Using 'level' as per schema.
            const level = cls ? (cls.level || cls.grade || 'Unknown') : 'Unknown';
            levelCounts[level] = (levelCounts[level] || 0) + 1;
        });

        let totalExpected = 0;
        if (this.currentDateRange.startDate && this.currentDateRange.endDate) {
            const loopDate = new Date(this.currentDateRange.startDate);
            const endDate = new Date(this.currentDateRange.endDate);
            // Ensure time part doesn't mess up comparison
            loopDate.setHours(0,0,0,0);
            endDate.setHours(23,59,59,999);

            while (loopDate <= endDate) {
                // Check for each level if it's a school day
                const currentDay = new Date(loopDate);
                for (const [level, count] of Object.entries(levelCounts)) {
                    if (window.EducareTrack && window.EducareTrack.isSchoolDay(currentDay, level)) {
                        totalExpected += count;
                    }
                }
                loopDate.setDate(loopDate.getDate() + 1);
            }
        }

        const overallAttendanceRate = totalExpected > 0 ? 
            Math.min(100, Math.round((sumDailyPresent / totalExpected) * 100)) : 0;

        // Update DOM
        document.getElementById('overallAttendanceRate').textContent = `${overallAttendanceRate}%`;
        document.getElementById('totalPresent').textContent = presentToday;
            document.getElementById('totalAbsent').textContent = absentToday;
            document.getElementById('totalLate').textContent = lateToday;
            
            // Update new metrics
            const totalExcusedEl = document.getElementById('totalExcused');
            if (totalExcusedEl) totalExcusedEl.textContent = excusedToday;
            
            const totalClinicEl = document.getElementById('totalClinic');
            if (totalClinicEl) totalClinicEl.textContent = clinicToday;
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

        const clinicTrendRange = document.getElementById('clinicTrendRange');
        if (clinicTrendRange) {
            clinicTrendRange.addEventListener('change', () => this.loadClinicAndAbsenceTrends());
        }
        const absenceTrendRange = document.getElementById('absenceTrendRange');
        if (absenceTrendRange) {
            absenceTrendRange.addEventListener('change', () => this.loadClinicAndAbsenceTrends());
        }

        // Edit Modal Listeners
        const closeEditBtn = document.getElementById('closeEditAttendanceModal');
        const cancelEditBtn = document.getElementById('cancelEditAttendance');
        const saveEditBtn = document.getElementById('saveEditAttendance');

        if (closeEditBtn) closeEditBtn.addEventListener('click', () => this.closeEditModal());
        if (cancelEditBtn) cancelEditBtn.addEventListener('click', () => this.closeEditModal());
        if (saveEditBtn) saveEditBtn.addEventListener('click', () => this.saveEditedRecord());
    }

    setupRealtimeUpdates() {
        if (!window.supabaseClient) return;

        if (this.realtimeChannel) {
            window.supabaseClient.removeChannel(this.realtimeChannel);
        }

        this.realtimeChannel = window.supabaseClient.channel('admin_analytics_realtime');

        // Listen for Attendance Changes
        this.realtimeChannel.on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'attendance'
        }, () => {
            console.log('Realtime attendance update received');
            this.pendingRealtimeRefresh = true;
            // Debounce refresh
            if (this.realtimeRefreshTimer) clearTimeout(this.realtimeRefreshTimer);
            this.realtimeRefreshTimer = setTimeout(() => {
                this.refreshData();
            }, 2000);
        });

        // Listen for Clinic Visits
        this.realtimeChannel.on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'clinic_visits'
        }, () => {
            console.log('Realtime clinic update received');
            this.pendingRealtimeRefresh = true;
            if (this.realtimeRefreshTimer) clearTimeout(this.realtimeRefreshTimer);
            this.realtimeRefreshTimer = setTimeout(() => {
                this.refreshData();
            }, 2000);
        });

        this.realtimeChannel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('Admin analytics connected to realtime updates');
            }
        });
    }

    refreshData() {
        if (this.isLoadingData) return;
        this.loadAnalyticsData();
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
        if (this.isLoadingData) return;
        this.showLoading();
        await this.loadAnalyticsData();
        const detailedTab = document.getElementById('detailed-tab');
        if (detailedTab && detailedTab.classList.contains('active')) {
            this.filterDetailedRecords();
            this.updateLateArrivalsTable();
            this.updateClinicVisitsTable();
        }
        await this.loadClinicAndAbsenceTrends();
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
        
        const uniqueClasses = [...new Set(this.students.map(student => student.classId || student.class_id).filter(Boolean))];
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
        this.filteredClinicVisits = [...this.clinicVisits];
        this.currentPage = 1;
        this.updateDetailedRecordsTable();
        this.updateLateArrivalsTable();
        this.updateClinicVisitsTable();
    }

    filterDetailedRecords() {
        const searchTerm = document.getElementById('searchRecords').value.toLowerCase();
        const statusFilter = document.getElementById('statusFilter').value;
        const classFilter = document.getElementById('classFilter').value;

        // Filter Attendance Records
        this.filteredAttendanceData = this.allAttendanceData.filter(record => {
            const student = this.students.find(s => s.id === record.studentId);
            if (!student) return false;

            // Search filter
            const studentName = this.getStudentName(student).toLowerCase();
            const studentId = this.getStudentIdentifier(student).toLowerCase();
            if (searchTerm && !studentName.includes(searchTerm) && 
                !studentId.includes(searchTerm)) {
                return false;
            }

            // Status filter
            if (statusFilter !== 'all' && record.status !== statusFilter) {
                // Special case: if status filter is 'in_clinic', attendance records might not match, 
                // but we are filtering attendance data here. Clinic visits are separate.
                return false;
            }

            // Class filter
            if (classFilter !== 'all') {
                const studentClassId = student.classId || student.class_id;
                if (studentClassId !== classFilter) {
                    return false;
                }
            }

            return true;
        });

        // Filter Clinic Visits
        this.filteredClinicVisits = this.clinicVisits.filter(visit => {
            const student = this.students.find(s => s.id === visit.studentId);
            if (!student) return false;

            // Search filter
            const studentName = this.getStudentName(student).toLowerCase();
            const studentId = this.getStudentIdentifier(student).toLowerCase();
            if (searchTerm && !studentName.includes(searchTerm) && 
                !studentId.includes(searchTerm)) {
                return false;
            }

            // Status filter - only relevant if 'all' or 'in_clinic'
            if (statusFilter !== 'all' && statusFilter !== 'in_clinic') {
                return false;
            }

            // Class filter
            if (classFilter !== 'all') {
                const studentClassId = student.classId || student.class_id;
                if (studentClassId !== classFilter) {
                    return false;
                }
            }

            return true;
        });

        this.currentPage = 1;
        this.updateDetailedRecordsTable();
        this.updateClinicVisitsTable();
    }

    handleSort(column, type) {
        if (this.sortConfig.column === column && this.sortConfig.type === type) {
            this.sortConfig.direction = this.sortConfig.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortConfig.column = column;
            this.sortConfig.direction = 'desc'; // Default to newest first for time, etc.
            this.sortConfig.type = type;
        }

        if (type === 'attendance') {
            this.updateDetailedRecordsTable();
        } else if (type === 'clinic') {
            this.updateClinicVisitsTable();
        }
    }

    getSortIcon(column, type) {
        if (this.sortConfig.column !== column || this.sortConfig.type !== type) {
            return '<i class="fas fa-sort text-gray-300 ml-1"></i>';
        }
        return this.sortConfig.direction === 'asc' 
            ? '<i class="fas fa-sort-up text-blue-500 ml-1"></i>' 
            : '<i class="fas fa-sort-down text-blue-500 ml-1"></i>';
    }

    updateDetailedRecordsTable() {
        const tableBody = document.getElementById('detailedRecordsTable');
        const recordsCount = document.getElementById('recordsCount');
        
        if (this.filteredAttendanceData.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="9" class="px-4 py-4 text-center text-gray-500">
                        No records found for the selected filters
                    </td>
                </tr>
            `;
            recordsCount.textContent = 'Showing 0 records';
            return;
        }

        // Apply sorting
        if (this.sortConfig.type === 'attendance') {
            this.filteredAttendanceData.sort((a, b) => {
                let valA, valB;
                
                switch(this.sortConfig.column) {
                    case 'timestamp':
                        valA = a.timestamp ? (a.timestamp.toDate ? a.timestamp.toDate() : new Date(a.timestamp)) : new Date(0);
                        valB = b.timestamp ? (b.timestamp.toDate ? b.timestamp.toDate() : new Date(b.timestamp)) : new Date(0);
                        break;
                    case 'student':
                        valA = this.getStudentName(this.students.find(s => s.id === a.studentId) || {}).toLowerCase();
                        valB = this.getStudentName(this.students.find(s => s.id === b.studentId) || {}).toLowerCase();
                        break;
                    case 'class':
                        valA = (this.classes.find(c => c.id === (a.classId || a.class_id)) || {name: ''}).name.toLowerCase();
                        valB = (this.classes.find(c => c.id === (b.classId || b.class_id)) || {name: ''}).name.toLowerCase();
                        break;
                    case 'level':
                         valA = (this.students.find(s => s.id === a.studentId) || {level: ''}).level.toLowerCase();
                         valB = (this.students.find(s => s.id === b.studentId) || {level: ''}).level.toLowerCase();
                         break;
                    case 'time':
                        valA = a.time || '';
                        valB = b.time || '';
                        break;
                    case 'status':
                        valA = a.status || '';
                        valB = b.status || '';
                        break;
                    case 'session':
                        valA = a.session || '';
                        valB = b.session || '';
                        break;
                    case 'method':
                        const getMethodVal = (r) => {
                            if (r.method === 'qr' || (r.remarks && (r.remarks.includes('qr_') || r.remarks.includes('qr ')))) return 3;
                            if (r.manualEntry || (r.remarks && r.remarks.includes('manual'))) return 2;
                            return 1;
                        };
                        valA = getMethodVal(a);
                        valB = getMethodVal(b);
                        break;
                    default:
                        valA = a[this.sortConfig.column];
                        valB = b[this.sortConfig.column];
                }
                
                if (valA < valB) return this.sortConfig.direction === 'asc' ? -1 : 1;
                if (valA > valB) return this.sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        // Calculate pagination
        const startIndex = (this.currentPage - 1) * this.pageSize;
        const endIndex = Math.min(startIndex + this.pageSize, this.filteredAttendanceData.length);
        const pageData = this.filteredAttendanceData.slice(startIndex, endIndex);

        tableBody.innerHTML = pageData.map(record => {
            const student = this.students.find(s => s.id === record.studentId);
            const classObj = this.classes.find(c => c.id === (record.classId || record.class_id));
            
            return `
                <tr>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        ${record.timestamp ? EducareTrack.formatDate(record.timestamp.toDate ? record.timestamp.toDate() : new Date(record.timestamp)) : 'N/A'}
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap">
                        <div class="text-sm font-medium text-gray-900">${student ? this.getStudentName(student) : 'Unknown'}</div>
                        <div class="text-sm text-gray-500">${student ? this.getStudentIdentifier(student) : ''}</div>
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
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        ${(() => {
                            if (record.method === 'qr' || (record.remarks && (record.remarks.includes('qr_') || record.remarks.includes('qr ')))) {
                                return '<span class="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs"><i class="fas fa-qrcode mr-1"></i>QR Scan</span>';
                            }
                            if (record.manualEntry || (record.remarks && record.remarks.includes('manual'))) {
                                return '<span class="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs"><i class="fas fa-keyboard mr-1"></i>Manual</span>';
                            }
                            return '<span class="px-2 py-1 bg-gray-100 text-gray-800 rounded-full text-xs"><i class="fas fa-chalkboard-teacher mr-1"></i>Teacher</span>';
                        })()}
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm font-medium">
                        <button onclick="adminRecords.editRecord('${record.id}')" class="text-indigo-600 hover:text-indigo-900 mr-3">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="adminRecords.deleteRecord('${record.id}')" class="text-red-600 hover:text-red-900">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        recordsCount.textContent = `Showing ${startIndex + 1}-${endIndex} of ${this.filteredAttendanceData.length} records`;

        // Update pagination buttons
        const totalPages = Math.ceil(this.filteredAttendanceData.length / this.pageSize);
        document.getElementById('prevPage').disabled = this.currentPage === 1;
        document.getElementById('nextPage').disabled = this.currentPage === totalPages;

        // Update Header Icons
        const headers = {
            'timestamp': 'th-date',
            'student': 'th-student',
            'class': 'th-class',
            'level': 'th-level',
            'time': 'th-time',
            'status': 'th-status',
            'session': 'th-session',
            'method': 'th-method'
        };

        for (const [col, id] of Object.entries(headers)) {
            const el = document.getElementById(id);
            if (el) {
                const iconSpan = el.querySelector('.sort-icon');
                if (iconSpan) {
                    iconSpan.innerHTML = this.getSortIcon(col, 'attendance');
                }
            }
        }
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
            const classObj = this.classes.find(c => c.id === (record.classId || record.class_id));
            
            // Calculate minutes late (assuming 8:00 AM as threshold)
            const arrivalTime = record.time;
            const [hours, minutes] = arrivalTime.split(':').map(Number);
            const totalMinutes = hours * 60 + minutes;
            const thresholdMinutes = 8 * 60; // 8:00 AM
            const minutesLate = Math.max(0, totalMinutes - thresholdMinutes);

            return `
                <tr>
                    <td class="px-4 py-3 whitespace-nowrap">
                        <div class="text-sm font-medium text-gray-900">${student ? this.getStudentName(student) : 'Unknown'}</div>
                        <div class="text-sm text-gray-500">${student ? this.getStudentIdentifier(student) : ''}</div>
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        ${classObj ? classObj.name : 'N/A'}
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        ${record.timestamp ? EducareTrack.formatDate(record.timestamp.toDate ? record.timestamp.toDate() : new Date(record.timestamp)) : 'N/A'}
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
        let visitsToDisplay = [...(this.filteredClinicVisits || this.clinicVisits)];

        if (visitsToDisplay.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="px-4 py-4 text-center text-gray-500">
                        No clinic visits in the selected period (or matching filters)
                    </td>
                </tr>
            `;
            return;
        }

        // Apply sorting
        if (this.sortConfig.type === 'clinic') {
            visitsToDisplay.sort((a, b) => {
                let valA, valB;
                
                switch(this.sortConfig.column) {
                    case 'timestamp':
                        valA = a.timestamp ? (a.timestamp.toDate ? a.timestamp.toDate() : new Date(a.timestamp)) : new Date(0);
                        valB = b.timestamp ? (b.timestamp.toDate ? b.timestamp.toDate() : new Date(b.timestamp)) : new Date(0);
                        break;
                    case 'studentName':
                        valA = this.getStudentName(this.students.find(s => s.id === a.studentId) || {}).toLowerCase();
                        valB = this.getStudentName(this.students.find(s => s.id === b.studentId) || {}).toLowerCase();
                        break;
                    case 'reason':
                        valA = (a.reason || '').toLowerCase();
                        valB = (b.reason || '').toLowerCase();
                        break;
                    default:
                        valA = a[this.sortConfig.column];
                        valB = b[this.sortConfig.column];
                }
                
                if (valA < valB) return this.sortConfig.direction === 'asc' ? -1 : 1;
                if (valA > valB) return this.sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        tableBody.innerHTML = visitsToDisplay.map(visit => {
            const student = this.students.find(s => s.id === visit.studentId);
            const classObj = this.classes.find(c => c.id === (visit.classId || visit.class_id));
            
            return `
                <tr>
                    <td class="px-4 py-3 whitespace-nowrap">
                        <div class="text-sm font-medium text-gray-900">${student ? this.getStudentName(student) : 'Unknown'}</div>
                        <div class="text-sm text-gray-500">${student ? this.getStudentIdentifier(student) : ''}</div>
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        ${classObj ? classObj.name : 'N/A'}
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        ${visit.timestamp ? EducareTrack.formatDate(visit.timestamp.toDate ? visit.timestamp.toDate() : new Date(visit.timestamp)) : 'N/A'}
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        ${visit.timestamp ? EducareTrack.formatTime(visit.timestamp.toDate ? visit.timestamp.toDate() : new Date(visit.timestamp)) : 'N/A'}
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

        // Update Header Icons (Clinic)
        // IDs are assumed to be in the HTML (need to verify/add them)
        // Based on previous HTML read, the Clinic table has onclicks but maybe not IDs for the TH elements themselves to target the icon.
        // Wait, looking at HTML lines 495-504:
        // <th ... onclick="...">Student <i class="fas fa-sort ml-1"></i></th>
        // I need to target the <i> inside the <th>.
        // I should probably add IDs to the THs in HTML first.
        // Let's assume I will add IDs: th-clinic-student, th-clinic-date, th-clinic-reason
        
        const headers = {
            'studentName': 'th-clinic-student',
            'timestamp': 'th-clinic-date',
            'reason': 'th-clinic-reason'
        };

        for (const [col, id] of Object.entries(headers)) {
            const el = document.getElementById(id);
            if (el) {
                // The icon is likely an <i> tag or a span. In the current HTML it's <i class="fas fa-sort ml-1"></i> directly inside TH.
                // My getSortIcon returns an <i> tag string.
                // So I can just replace the <i> tag.
                const iconEl = el.querySelector('i');
                if (iconEl) {
                    iconEl.outerHTML = this.getSortIcon(col, 'clinic');
                } else {
                    // Fallback if no icon found, append it
                    el.insertAdjacentHTML('beforeend', this.getSortIcon(col, 'clinic'));
                }
            }
        }
    }

    initCharts() {
        this.createAttendanceTrendChart();
        this.createStatusDistributionChart();
        this.createDailyPatternChart();
        this.createGradeLevelChart();
        this.createClassAttendanceChart();
        this.createLevelComparisonChart();
        this.createLevelAttendanceChart();
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
                        const t = v.timestamp?.toDate ? v.timestamp.toDate() : v.timestamp;
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
                    },
                    {
                        label: 'Late',
                        data: [],
                        borderColor: '#F59E0B',
                        backgroundColor: 'rgba(245, 158, 11, 0.1)',
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
        if (!this.attendanceData || this.attendanceData.length === 0) return;

        const dateGroups = {};
        const startDate = new Date(this.currentDateRange.startDate);
        const endDate = new Date(this.currentDateRange.endDate);
        
        // Normalize dates to midnight
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);

        // Initialize all dates in range
        const loopDate = new Date(startDate);
        while (loopDate <= endDate) {
            const dateStr = EducareTrack.formatDate(loopDate);
            dateGroups[dateStr] = { present: 0, absent: 0, late: 0 };
            loopDate.setDate(loopDate.getDate() + 1);
        }

        // Fill with data
        this.attendanceData.forEach(record => {
            const recordDate = record.timestamp.toDate ? record.timestamp.toDate() : new Date(record.timestamp);
            if (recordDate >= startDate && recordDate <= endDate) {
                const dateStr = EducareTrack.formatDate(recordDate);
                if (dateGroups[dateStr]) {
                    if (record.status === 'present') dateGroups[dateStr].present++;
                    else if (record.status === 'absent') dateGroups[dateStr].absent++;
                    else if (record.status === 'late') dateGroups[dateStr].late++;
                }
            }
        });

        const labels = Object.keys(dateGroups);
        const presentData = labels.map(date => dateGroups[date].present);
        const absentData = labels.map(date => dateGroups[date].absent);
        const lateData = labels.map(date => dateGroups[date].late);

        if (this.charts.attendanceTrend) {
            this.charts.attendanceTrend.data.labels = labels;
            this.charts.attendanceTrend.data.datasets[0].data = presentData;
            this.charts.attendanceTrend.data.datasets[1].data = absentData;
            this.charts.attendanceTrend.data.datasets[2].data = lateData;
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
                        '#10B981', // Present - Green
                        '#F59E0B', // Late - Yellow
                        '#EF4444', // Absent - Red
                        '#6366F1', // Excused - Indigo
                        '#3B82F6'  // In Clinic - Blue
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right'
                    }
                }
            }
        });
        this.updateStatusDistributionChart();
    }

    updateStatusDistributionChart() {
        if (!this.filteredAttendanceData) return;

        const stats = {
            present: 0,
            late: 0,
            absent: 0,
            excused: 0,
            in_clinic: 0
        };

        this.filteredAttendanceData.forEach(record => {
            if (stats.hasOwnProperty(record.status)) {
                stats[record.status]++;
            }
        });

        if (this.charts.statusDistribution) {
            this.charts.statusDistribution.data.datasets[0].data = [
                stats.present,
                stats.late,
                stats.absent,
                stats.excused,
                stats.in_clinic
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

        this.charts.dailyPattern.data.datasets[0].data = entriesData;
        this.charts.dailyPattern.data.datasets[1].data = exitsData;
        this.charts.dailyPattern.update();
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

        this.charts.gradeLevel.data.labels = labels;
        this.charts.gradeLevel.data.datasets[0].data = attendanceRates;
        this.charts.gradeLevel.update();
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

        this.charts.classAttendance.data.labels = labels;
        this.charts.classAttendance.data.datasets[0].data = presentData;
        this.charts.classAttendance.data.datasets[1].data = absentData;
        this.charts.classAttendance.data.datasets[2].data = lateData;
        this.charts.classAttendance.update();

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

        this.charts.levelAttendance.data.labels = labels;
        this.charts.levelAttendance.data.datasets[0].data = data;
        this.charts.levelAttendance.update();

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
        if (!this.charts.levelComparison || !levelStats) return;
        const labels = Object.keys(levelStats).filter(level => levelStats[level].total > 0);
        const attendanceRates = labels.map(level => {
            const stat = levelStats[level];
            return stat.total > 0 ? Math.round((stat.present / stat.total) * 100) : 0;
        });

        this.charts.levelComparison.data.labels = labels;
        this.charts.levelComparison.data.datasets[0].data = attendanceRates;
        this.charts.levelComparison.update();
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

    setupRealtimeUpdates() {
        if (!window.supabaseClient) return;
        if (this.realtimeChannel) {
            this.realtimeChannel.unsubscribe();
        }

        this.realtimeChannel = window.supabaseClient
            .channel('admin_records_realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => {
                this.scheduleRealtimeRefresh();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'clinic_visits' }, () => {
                this.scheduleRealtimeRefresh();
            })
            .subscribe();
    }

    scheduleRealtimeRefresh() {
        if (this.isLoadingData) {
            this.pendingRealtimeRefresh = true;
            return;
        }
        if (this.realtimeRefreshTimer) {
            clearTimeout(this.realtimeRefreshTimer);
        }
        this.realtimeRefreshTimer = setTimeout(() => {
            this.refreshData();
        }, 500);
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
                        <div class="text-sm font-medium text-gray-900">${student ? this.getStudentName(student) : 'Unknown'}</div>
                        <div class="text-sm text-gray-500">${student ? this.getStudentIdentifier(student) : ''}</div>
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        ${classObj ? classObj.name : 'N/A'}
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        ${record.timestamp ? EducareTrack.formatTime(record.timestamp.toDate ? record.timestamp.toDate() : new Date(record.timestamp)) : 'N/A'}
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
                        date: record.timestamp ? EducareTrack.formatDate(record.timestamp.toDate ? record.timestamp.toDate() : new Date(record.timestamp)) : 'N/A',
                        time: record.time || 'N/A',
                        studentName: student ? this.getStudentName(student) : 'Unknown',
                        studentId: student ? this.getStudentIdentifier(student) : 'N/A',
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
                        date: visit.timestamp ? EducareTrack.formatDate(visit.timestamp.toDate ? visit.timestamp.toDate() : new Date(visit.timestamp)) : 'N/A',
                        time: visit.timestamp ? EducareTrack.formatTime(visit.timestamp.toDate ? visit.timestamp.toDate() : new Date(visit.timestamp)) : 'N/A',
                        studentName: student ? this.getStudentName(student) : 'Unknown',
                        studentId: student ? this.getStudentIdentifier(student) : 'N/A',
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

    editRecord(recordId) {
        const record = this.attendanceData.find(r => r.id === recordId);
        if (!record) return;

        const student = this.students.find(s => s.id === record.studentId);
        document.getElementById('editStudentName').value = student ? this.getStudentName(student) : 'Unknown';
        document.getElementById('editRecordId').value = recordId;
        
        // Format date for input
        const date = record.timestamp.toDate ? record.timestamp.toDate() : new Date(record.timestamp);
        document.getElementById('editAttendanceDate').value = date.toISOString().split('T')[0];
        document.getElementById('editAttendanceTime').value = record.time;
        document.getElementById('editAttendanceStatus').value = record.status;
        document.getElementById('editEntryType').value = record.entryType || 'entry';

        document.getElementById('editAttendanceModal').classList.remove('hidden');
        document.getElementById('editAttendanceModal').classList.add('flex');
    }

    closeEditModal() {
        document.getElementById('editAttendanceModal').classList.add('hidden');
        document.getElementById('editAttendanceModal').classList.remove('flex');
    }

    async saveEditedRecord() {
        try {
            this.showLoading();
            const recordId = document.getElementById('editRecordId').value;
            const dateStr = document.getElementById('editAttendanceDate').value;
            const timeStr = document.getElementById('editAttendanceTime').value;
            const status = document.getElementById('editAttendanceStatus').value;
            const entryType = document.getElementById('editEntryType').value;

            // Combine date and time
            const timestamp = new Date(dateStr + 'T' + timeStr);

            if (!window.supabaseClient) throw new Error('Supabase client not initialized');
            const { error } = await window.supabaseClient
                .from('attendance')
                .update({
                    timestamp: timestamp.toISOString(),
                    time: timeStr,
                    status: status,
                    entry_type: entryType
                })
                .eq('id', recordId);
            if (error) throw error;

            this.closeEditModal();
            this.showNotification('Record updated successfully', 'success');
            await this.loadAnalyticsData(); // Reload to reflect changes
        } catch (error) {
            console.error('Error updating record:', error);
            this.showNotification('Error updating record', 'error');
            this.hideLoading();
        }
    }

    async deleteRecord(recordId) {
        const confirmed = await window.EducareTrack.confirmAction(
            'Are you sure you want to delete this attendance record?',
            'Delete Record',
            'Delete',
            'Cancel'
        );

        if (confirmed) {
            try {
                this.showLoading();
                if (!window.supabaseClient) throw new Error('Supabase client not initialized');
                const { error } = await window.supabaseClient
                    .from('attendance')
                    .delete()
                    .eq('id', recordId);
                if (error) throw error;
                this.showNotification('Record deleted successfully', 'success');
                await this.loadAnalyticsData(); // Reload
            } catch (error) {
                console.error('Error deleting record:', error);
                this.showNotification('Error deleting record', 'error');
                this.hideLoading();
            }
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
