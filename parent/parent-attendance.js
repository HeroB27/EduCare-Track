class ParentAttendance {
    constructor() {
        this.currentUser = null;
        this.children = [];
        this.attendanceRecords = [];
        this.filteredRecords = [];
        this.currentTab = 'records';
        this.attendanceChart = null;
        this.currentCalendarDate = new Date();
        this.calendarRecords = [];
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

            // Wait for Supabase client to be ready
            if (!window.supabaseClient) {
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
            
            // Verify user is a parent
            if (this.currentUser.role !== 'parent') {
                if (window.EducareTrack && typeof window.EducareTrack.showNormalNotification === 'function') {
                    window.EducareTrack.showNormalNotification({ title: 'Access Denied', message: 'Parent role required.', type: 'error' });
                }
                window.location.href = '../index.html';
                return;
            }

            this.updateUI();
            await this.loadChildren();
            await this.loadAttendanceData();
            this.initEventListeners();
            this.initTabs();
            this.initRealtimeSubscription();
            
            this.hideLoading();
        } catch (error) {
            console.error('Parent attendance initialization failed:', error);
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

    async loadChildren() {
        try {
            this.children = await EducareTrack.getStudentsByParent(this.currentUser.id);
            this.populateChildFilter();
            
            // Load notification count
            await this.loadNotificationCount();

        } catch (error) {
            console.error('Error loading children:', error);
        }
    }

    populateChildFilter() {
        const filter = document.getElementById('childFilter');
        
        // Clear existing options except "All Children"
        while (filter.children.length > 1) {
            filter.removeChild(filter.lastChild);
        }
        
        // Add children options
        this.children.forEach(child => {
            const option = document.createElement('option');
            option.value = child.id;
            option.textContent = child.name;
            filter.appendChild(option);
        });

        // Check if there's a child parameter in URL
        const urlParams = new URLSearchParams(window.location.search);
        const childId = urlParams.get('child');
        if (childId) {
            filter.value = childId;
        }
    }

    async loadAttendanceData() {
        try {
            // Pre-fetch calendar data
            if (window.EducareTrack && window.EducareTrack.fetchCalendarData) {
                await window.EducareTrack.fetchCalendarData();
            }

            // Set default date range (last 30 days)
            const defaultDateTo = new Date();
            const defaultDateFrom = new Date();
            defaultDateFrom.setDate(defaultDateFrom.getDate() - 30);
            
            document.getElementById('dateFrom').value = defaultDateFrom.toISOString().split('T')[0];
            document.getElementById('dateTo').value = defaultDateTo.toISOString().split('T')[0];
            
            await this.applyFilters();

        } catch (error) {
            console.error('Error loading attendance data:', error);
        }
    }

    async exportAttendance() {
        try {
            if (!this.filteredRecords || this.filteredRecords.length === 0) {
                this.showNotification('No records to export for selected filters', 'info');
                return;
            }

            this.showLoading();
            const csvContent = this.generateAttendanceCSV();
            const filename = `attendance_${new Date().toISOString().split('T')[0]}`;
            this.downloadCSV(csvContent, filename);
            this.hideLoading();
            this.showNotification('Attendance exported successfully', 'success');
        } catch (error) {
            console.error('Error exporting attendance:', error);
            this.hideLoading();
            this.showNotification('Error exporting attendance', 'error');
        }
    }

    generateAttendanceCSV() {
        const headers = ['Date', 'Child', 'LRN', 'Time', 'Session', 'Status', 'Entry Type', 'Recorded By'];
        const rows = this.filteredRecords.map(record => {
            const child = this.children.find(c => c.id === record.student_id);
            const date = record.timestamp ? new Date(record.timestamp).toISOString().split('T')[0] : 'N/A';
            const name = child ? child.full_name || child.name : 'Unknown';
            const lrn = child && child.lrn ? child.lrn : 'N/A';
            const time = record.timestamp ? new Date(record.timestamp).toLocaleTimeString() : 'N/A';
            const session = record.session || 'N/A';
            const status = record.status || 'N/A';
            const entryType = record.session || 'N/A';
            const recordedBy = record.recordedByName || 'System';
            return [date, name, lrn, time, session, status, entryType, recordedBy];
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

    async applyFilters() {
        try {
            this.showLoading();
            
            const childId = document.getElementById('childFilter').value;
            const dateFrom = document.getElementById('dateFrom').value;
            const dateTo = document.getElementById('dateTo').value;
            const statusFilter = document.getElementById('statusFilter').value;

            // Convert dates to Date objects
            const startDate = new Date(dateFrom);
            const endDate = new Date(dateTo);
            endDate.setHours(23, 59, 59, 999); // End of day

            let attendanceData = [];

            // Get attendance records for selected children
            if (childId === 'all') {
                // Get all children's attendance
                for (const child of this.children) {
                    const childAttendance = await this.getChildAttendance(child.id, startDate, endDate);
                    attendanceData = attendanceData.concat(childAttendance);
                }
            } else {
                // Get specific child's attendance
                attendanceData = await this.getChildAttendance(childId, startDate, endDate);
            }

            // Filter by status if needed
            if (statusFilter !== 'all') {
                attendanceData = attendanceData.filter(record => record.status === statusFilter);
            }

            this.attendanceRecords = attendanceData;
            this.filteredRecords = attendanceData;
            
            this.updateStatistics();
            this.updateRecordsTab();
            this.updateChartTab();
            this.updateSummaryTab();
            
            this.hideLoading();

        } catch (error) {
            console.error('Error applying filters:', error);
            this.hideLoading();
        }
    }

    async getChildAttendance(childId, startDate, endDate) {
        try {
            let records = [];
            
            try {
                // Fetch attendance and clinic visits in parallel
                const [attendanceRes, clinicRes] = await Promise.all([
                    window.supabaseClient
                        .from('attendance')
                        .select('*')
                        .eq('student_id', childId)
                        .gte('timestamp', startDate.toISOString())
                        .lte('timestamp', endDate.toISOString())
                        .order('timestamp', { ascending: false }),
                    
                    window.supabaseClient
                        .from('clinic_visits')
                        .select('*')
                        .eq('student_id', childId)
                        .gte('visit_time', startDate.toISOString())
                        .lte('visit_time', endDate.toISOString())
                        .order('visit_time', { ascending: false })
                ]);

                const attendanceRecords = attendanceRes.data || [];
                
                const clinicRecords = (clinicRes.data || []).map(visit => ({
                    id: visit.id,
                    student_id: visit.student_id,
                    timestamp: visit.visit_time,
                    status: 'in_clinic',
                    session: new Date(visit.visit_time).getHours() < 12 ? 'AM' : 'PM',
                    remarks: visit.reason + (visit.notes ? `: ${visit.notes}` : ''),
                    recordedByName: 'Clinic'
                }));

                records = [...attendanceRecords, ...clinicRecords];
                
                // Sort by timestamp descending
                records.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            } catch (err) {
                console.warn('Attendance/Clinic query failed:', err);
            }

            return records;
        } catch (error) {
            console.error(`Error getting attendance for child ${childId}:`, error);
            return [];
        }
    }

    updateStatistics() {
        const presentCount = this.filteredRecords.filter(record => 
            record.status === 'present'
        ).length;

        const lateCount = this.filteredRecords.filter(record => 
            record.status === 'late'
        ).length;

        const absentCount = this.filteredRecords.filter(record => 
            record.status === 'absent'
        ).length;

        // Calculate expected attendance based on school days and student levels
        let expectedAttendance = 0;
        const dateFromVal = document.getElementById('dateFrom').value;
        const dateToVal = document.getElementById('dateTo').value;
        
        if (dateFromVal && dateToVal && window.EducareTrack && window.EducareTrack.isSchoolDay) {
            const startDate = new Date(dateFromVal);
            const endDate = new Date(dateToVal);
            startDate.setHours(0,0,0,0);
            endDate.setHours(23,59,59,999);
            
            // Get selected children
            const childFilter = document.getElementById('childFilter').value;
            const targetChildren = childFilter === 'all' 
                ? this.children 
                : this.children.filter(c => c.id === childFilter);
                
            // Loop dates
            const curDate = new Date(startDate);
            while (curDate <= endDate) {
                targetChildren.forEach(child => {
                    // Use level-specific school day check
                    if (window.EducareTrack.isSchoolDay(curDate, child.level)) {
                        expectedAttendance++;
                    }
                });
                curDate.setDate(curDate.getDate() + 1);
            }
        } else {
            // Fallback if dates not set or helper not available
            expectedAttendance = presentCount + lateCount + absentCount;
        }

        // Avoid division by zero
        const denominator = expectedAttendance > 0 ? expectedAttendance : (presentCount + lateCount + absentCount);
        const attendanceRate = denominator > 0 ? Math.round((presentCount / denominator) * 100) : 0;

        document.getElementById('totalPresent').textContent = presentCount;
        document.getElementById('totalLate').textContent = lateCount;
        document.getElementById('totalAbsent').textContent = absentCount;
        document.getElementById('attendanceRate').textContent = `${attendanceRate}%`;
    }

    updateRecordsTab() {
        const container = document.getElementById('attendanceTableBody');
        
        if (this.filteredRecords.length === 0) {
            container.innerHTML = `
                <tr>
                    <td colspan="6" class="px-6 py-8 text-center text-gray-500">
                        <i class="fas fa-clipboard-check text-3xl mb-2"></i>
                        <p>No attendance records found</p>
                        <p class="text-sm">Try adjusting your filters</p>
                    </td>
                </tr>
            `;
            return;
        }

        container.innerHTML = this.filteredRecords.map(record => {
            const child = this.children.find(c => c.id === record.student_id);
            const recordDate = record.timestamp ? new Date(record.timestamp) : new Date();
            
            return `
                <tr class="hover:bg-gray-50">
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${EducareTrack.formatDate(recordDate)}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="flex items-center">
                            <div class="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center mr-3">
                                <span class="text-green-600 font-semibold text-xs">${child ? (child.full_name || child.name || 'Unknown').split(' ').map(n => n[0]).join('').substring(0, 2) : '??'}</span>
                            </div>
                            <div class="text-sm font-medium text-gray-900">${child ? child.full_name || child.name : 'Unknown'}</div>
                        </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        ${record.timestamp ? new Date(record.timestamp).toLocaleTimeString() : 'N/A'}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">
                        ${record.session || 'N/A'}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <span class="px-2 py-1 rounded-full text-xs font-medium ${EducareTrack.getStatusColor(record.status)}">
                            ${record.status ? record.status.charAt(0).toUpperCase() + record.status.slice(1) : 'Unknown'}
                        </span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        ${record.recordedByName || 'System'}
                    </td>
                </tr>
            `;
        }).join('');
    }

    updateChartTab() {
        if (this.currentTab !== 'chart') return;

        const ctx = document.getElementById('attendanceChart').getContext('2d');
        
        // Destroy existing chart if it exists
        if (this.attendanceChart) {
            this.attendanceChart.destroy();
        }

        // Group records by date
        const dateGroups = {};
        this.attendanceRecords.forEach(record => {
            if (record.timestamp && record.session === 'AM') {
                const date = new Date(record.timestamp).toDateString();
                if (!dateGroups[date]) {
                    dateGroups[date] = { present: 0, late: 0, absent: 0 };
                }
                
                if (record.status === 'present') dateGroups[date].present++;
                if (record.status === 'late') dateGroups[date].late++;
                if (record.status === 'absent') dateGroups[date].absent++;
            }
        });

        const dates = Object.keys(dateGroups).slice(-15); // Last 15 days
        const presentData = dates.map(date => dateGroups[date].present);
        const lateData = dates.map(date => dateGroups[date].late);
        const absentData = dates.map(date => dateGroups[date].absent);

        this.attendanceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates.map(date => new Date(date).toLocaleDateString()),
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
                        label: 'Late',
                        data: lateData,
                        borderColor: '#F59E0B',
                        backgroundColor: 'rgba(245, 158, 11, 0.1)',
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
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Attendance Trend (Last 15 Days)'
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

    updateSummaryTab() {
        if (this.currentTab !== 'summary') return;

        const container = document.getElementById('monthlySummary');
        
        // Group records by month and child
        const monthlyData = {};
        
        this.attendanceRecords.forEach(record => {
            if (record.timestamp && record.session === 'AM') {
                const date = new Date(record.timestamp);
                const monthYear = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
                const monthName = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                
                if (!monthlyData[monthYear]) {
                    monthlyData[monthYear] = {
                        month: monthName,
                        present: 0,
                        late: 0,
                        absent: 0,
                        children: {}
                    };
                }
                
                const childId = record.student_id;
                if (!monthlyData[monthYear].children[childId]) {
                    const child = this.children.find(c => c.id === childId);
                    monthlyData[monthYear].children[childId] = {
                        name: child ? child.name : 'Unknown',
                        present: 0,
                        late: 0,
                        absent: 0
                    };
                }
                
                if (record.status === 'present') monthlyData[monthYear].children[childId].present++;
                if (record.status === 'late') monthlyData[monthYear].children[childId].late++;
                if (record.status === 'absent') monthlyData[monthYear].children[childId].absent++;
            }
        });

        if (Object.keys(monthlyData).length === 0) {
            container.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <i class="fas fa-chart-bar text-3xl mb-2"></i>
                    <p>No data available for monthly summary</p>
                </div>
            `;
            return;
        }

        let summaryHTML = '';
        
        Object.values(monthlyData).forEach(month => {
            summaryHTML += `
                <div class="border border-gray-200 rounded-lg">
                    <div class="bg-gray-50 px-4 py-3 border-b border-gray-200">
                        <h4 class="font-semibold text-gray-800">${month.name}</h4>
                    </div>
                    <div class="divide-y divide-gray-200">
            `;
            
            Object.values(month.children).forEach(childData => {
                summaryHTML += `
                    <div class="px-4 py-3 flex justify-between items-center">
                        <span class="font-medium text-gray-700">${childData.name}</span>
                        <div class="flex space-x-4 text-sm">
                            <span class="text-green-600"><span class="font-bold">${childData.present}</span> Present</span>
                            <span class="text-yellow-600"><span class="font-bold">${childData.late}</span> Late</span>
                            <span class="text-red-600"><span class="font-bold">${childData.absent}</span> Absent</span>
                        </div>
                    </div>
                `;
            });
            
            summaryHTML += `
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = summaryHTML;
    }

    async updateCalendarTab() {
        if (this.currentTab !== 'calendar') return;

        const year = this.currentCalendarDate.getFullYear();
        const month = this.currentCalendarDate.getMonth();
        
        // Update header
        const monthNames = ["January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
        ];
        document.getElementById('calendarMonthYear').textContent = `${monthNames[month]} ${year}`;

        await this.fetchCalendarData(year, month);
        this.renderCalendar(year, month);
    }

    async fetchCalendarData(year, month) {
        try {
            this.showLoading();
            const startDate = new Date(year, month, 1);
            const endDate = new Date(year, month + 1, 0); // Last day of month
            endDate.setHours(23, 59, 59, 999);

            const childId = document.getElementById('childFilter').value;
            let records = [];

            if (childId === 'all') {
                for (const child of this.children) {
                    const childRecords = await this.getChildAttendance(child.id, startDate, endDate);
                    records = records.concat(childRecords);
                }
            } else {
                records = await this.getChildAttendance(childId, startDate, endDate);
            }

            this.calendarRecords = records;
            this.hideLoading();
        } catch (error) {
            console.error('Error fetching calendar data:', error);
            this.hideLoading();
        }
    }

    changeMonth(delta) {
        this.currentCalendarDate.setMonth(this.currentCalendarDate.getMonth() + delta);
        this.updateCalendarTab();
    }

    renderCalendar(year, month) {
        const grid = document.getElementById('calendarGrid');
        grid.innerHTML = '';

        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const today = new Date();

        // Empty cells for days before start of month
        for (let i = 0; i < firstDay; i++) {
            const cell = document.createElement('div');
            cell.className = 'bg-gray-50 h-24 rounded-lg border border-gray-100';
            grid.appendChild(cell);
        }

        // Day cells
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const cellDate = new Date(year, month, day);
            
            const cell = document.createElement('div');
            cell.className = 'bg-white h-24 rounded-lg border border-gray-200 p-2 relative hover:shadow-md transition-shadow cursor-pointer overflow-hidden';
            
            // Highlight today
            if (cellDate.toDateString() === today.toDateString()) {
                cell.classList.add('ring-2', 'ring-green-500');
            }

            const dayNumber = document.createElement('div');
            dayNumber.className = 'font-semibold text-gray-700 mb-1';
            dayNumber.textContent = day;
            cell.appendChild(dayNumber);

            // Find records for this day
            const dayRecords = this.calendarRecords.filter(record => {
                const recordDate = new Date(record.timestamp);
                return recordDate.getDate() === day && 
                       recordDate.getMonth() === month && 
                       recordDate.getFullYear() === year;
            });

            // Add click listener
            cell.addEventListener('click', () => this.showDayDetails(dayRecords, cellDate));

            const recordsContainer = document.createElement('div');
            recordsContainer.className = 'space-y-1 overflow-y-auto max-h-[calc(100%-24px)] text-xs'; // scrollable if too many

            dayRecords.forEach(record => {
                const child = this.children.find(c => c.id === record.student_id);
                const childName = child ? (child.full_name || child.name || 'Unknown').split(' ')[0] : '??'; // First name only for space
                
                const statusColors = {
                    'present': 'bg-green-100 text-green-800',
                    'late': 'bg-yellow-100 text-yellow-800',
                    'absent': 'bg-red-100 text-red-800',
                    'in_clinic': 'bg-blue-100 text-blue-800'
                };
                
                const colorClass = statusColors[record.status] || 'bg-gray-100 text-gray-800';
                
                const badge = document.createElement('div');
                badge.className = `px-1.5 py-0.5 rounded ${colorClass} truncate flex justify-between items-center`;
                badge.innerHTML = `<span>${childName}</span>`;
                badge.title = `${childName}: ${record.status}`;
                
                recordsContainer.appendChild(badge);
            });

            cell.appendChild(recordsContainer);
            grid.appendChild(cell);
        }
    }

    showDayDetails(records, date) {
        const modal = document.getElementById('dayDetailsModal');
        const title = document.getElementById('dayDetailsTitle');
        const content = document.getElementById('dayDetailsContent');
        
        if (!modal || !title || !content) return;

        title.textContent = `Attendance for ${date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
        
        if (records.length === 0) {
            content.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <i class="fas fa-calendar-day text-3xl mb-2"></i>
                    <p>No attendance records for this day.</p>
                </div>
            `;
        } else {
            content.innerHTML = `
                <div class="space-y-4">
                    ${records.map(record => {
                        const child = this.children.find(c => c.id === record.student_id);
                        const childName = child ? (child.full_name || child.name) : 'Unknown Child';
                        const time = record.timestamp ? new Date(record.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'N/A';
                        
                        const statusColors = {
                            'present': 'bg-green-100 text-green-800 border-green-200',
                            'late': 'bg-yellow-100 text-yellow-800 border-yellow-200',
                            'absent': 'bg-red-100 text-red-800 border-red-200',
                            'in_clinic': 'bg-blue-100 text-blue-800 border-blue-200'
                        };
                        const statusClass = statusColors[record.status] || 'bg-gray-100 text-gray-800 border-gray-200';
                        
                        return `
                            <div class="border rounded-lg p-3 ${statusClass.split(' ')[0]} bg-opacity-30">
                                <div class="flex justify-between items-start mb-2">
                                    <h4 class="font-semibold text-gray-900">${childName}</h4>
                                    <span class="px-2 py-0.5 rounded text-xs font-semibold uppercase ${statusClass}">${record.status}</span>
                                </div>
                                <div class="text-sm text-gray-600 space-y-1">
                                    <div class="flex items-center">
                                        <i class="fas fa-clock w-5 text-center mr-2"></i>
                                        <span>${time} (${record.session || 'AM'})</span>
                                    </div>
                                    ${record.remarks ? `
                                    <div class="flex items-start">
                                        <i class="fas fa-comment w-5 text-center mr-2 mt-0.5"></i>
                                        <span>${record.remarks}</span>
                                    </div>` : ''}
                                    ${record.recordedByName ? `
                                    <div class="flex items-center text-xs text-gray-500 mt-2">
                                        <i class="fas fa-user-edit w-5 text-center mr-2"></i>
                                        <span>Recorded by: ${record.recordedByName}</span>
                                    </div>` : ''}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }

        modal.classList.remove('hidden');
    }

    async loadNotificationCount() {
        try {
            const count = await EducareTrack.getUnreadNotificationCount(this.currentUser.id);
            const badge = document.getElementById('notificationBadge');
            
            if (count > 0) {
                badge.textContent = count;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        } catch (error) {
            console.error('Error loading notification count:', error);
        }
    }

    initTabs() {
        const tabs = ['records', 'calendar', 'chart', 'summary'];
        
        tabs.forEach(tab => {
            document.getElementById(`${tab}Tab`).addEventListener('click', () => {
                // Update active tab
                this.currentTab = tab;
                
                // Update tab styles
                tabs.forEach(t => {
                    const el = document.getElementById(`${t}Tab`);
                    if (t === tab) {
                        el.classList.add('tab-active');
                        el.classList.remove('text-gray-500', 'hover:text-gray-700');
                    } else {
                        el.classList.remove('tab-active');
                        el.classList.add('text-gray-500', 'hover:text-gray-700');
                    }
                });

                // Show/hide content
                tabs.forEach(t => {
                    const content = document.getElementById(`${t}Content`);
                    if (t === tab) {
                        content.classList.remove('hidden');
                    } else {
                        content.classList.add('hidden');
                    }
                });

                // Update content based on tab
                if (tab === 'chart') {
                    this.updateChartTab();
                } else if (tab === 'summary') {
                    this.updateSummaryTab();
                } else if (tab === 'calendar') {
                    this.updateCalendarTab();
                }
            });
        });
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
                EducareTrack.logout();
                window.location.href = '../index.html';
            }
        });

        // Apply filters
        document.getElementById('applyFilters').addEventListener('click', () => {
            this.applyFilters();
        });

        // Reset filters
        document.getElementById('resetFilters').addEventListener('click', () => {
            this.resetFilters();
        });

        const exportBtn = document.getElementById('exportAttendance');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this.exportAttendance();
            });
        }

        // Calendar listeners
        document.getElementById('prevMonth').addEventListener('click', () => this.changeMonth(-1));
        document.getElementById('nextMonth').addEventListener('click', () => this.changeMonth(1));
        
        // Listen for child filter change to update calendar if active
        document.getElementById('childFilter').addEventListener('change', () => {
            if (this.currentTab === 'calendar') {
                this.updateCalendarTab();
            }
        });

        // Listen for new notifications
        window.addEventListener('educareTrack:newNotifications', () => {
            this.loadNotificationCount();
        });
    }

    initRealtimeSubscription() {
        if (!window.supabaseClient) return;

        // Clean up existing subscription if any
        if (this.subscription) {
            window.supabaseClient.removeChannel(this.subscription);
        }

        // Subscribe to changes in students table (for status updates) and attendance/clinic_visits
        this.subscription = window.supabaseClient
            .channel('parent-attendance-changes')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'students' }, payload => {
                // Check if the updated student is one of our children
                const isMyChild = this.children.some(child => child.id === payload.new.id);
                if (isMyChild) {
                    // Check if status changed
                    if (payload.old && payload.old.current_status !== payload.new.current_status) {
                         // Refresh data
                         this.applyFilters(); // This refreshes records list
                         if (this.currentTab === 'calendar') {
                             this.updateCalendarTab();
                         }
                    } else if (!payload.old) {
                        // Fallback if no old data (e.g. if not full replica), just refresh
                        this.applyFilters();
                        if (this.currentTab === 'calendar') {
                             this.updateCalendarTab();
                        }
                    }
                }
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, payload => {
                 const record = payload.new || payload.old;
                 const isMyChild = this.children.some(child => child.id === record.student_id);
                 if (isMyChild) {
                     this.applyFilters();
                     if (this.currentTab === 'calendar') {
                         this.updateCalendarTab();
                     }
                 }
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'clinic_visits' }, payload => {
                const record = payload.new || payload.old;
                const isMyChild = this.children.some(child => child.id === record.student_id);
                if (isMyChild) {
                    this.applyFilters();
                    if (this.currentTab === 'calendar') {
                        this.updateCalendarTab();
                    }
                }
           })
            .subscribe();
            
        console.log('Parent attendance realtime subscription initialized');
    }

    resetFilters() {
        document.getElementById('childFilter').value = 'all';
        
        const defaultDateTo = new Date();
        const defaultDateFrom = new Date();
        defaultDateFrom.setDate(defaultDateFrom.getDate() - 30);
        
        document.getElementById('dateFrom').value = defaultDateFrom.toISOString().split('T')[0];
        document.getElementById('dateTo').value = defaultDateTo.toISOString().split('T')[0];
        document.getElementById('statusFilter').value = 'all';
        
        this.applyFilters();
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
    window.parentAttendance = new ParentAttendance();
});
