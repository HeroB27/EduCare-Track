class ParentAttendance {
    constructor() {
        this.currentUser = null;
        this.children = [];
        this.attendanceRecords = [];
        this.filteredRecords = [];
        this.currentTab = 'records';
        this.attendanceChart = null;
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
                const { data } = await window.supabaseClient
                    .from('attendance')
                    .select('*')
                    .eq('student_id', childId)
                    .gte('timestamp', startDate.toISOString())
                    .lte('timestamp', endDate.toISOString())
                    .order('timestamp', { ascending: false });
                records = data || [];
            } catch (err) {
                console.warn('Attendance timestamp query failed:', err);
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
            
            Object.values(month.children).forEach(child => {
                const totalDays = child.present + child.late + child.absent;
                const attendanceRate = totalDays > 0 ? Math.round((child.present / totalDays) * 100) : 0;
                
                summaryHTML += `
                    <div class="px-4 py-3">
                        <div class="flex justify-between items-center mb-2">
                            <span class="font-medium text-gray-800">${child.name}</span>
                            <span class="text-sm font-semibold ${attendanceRate >= 90 ? 'text-green-600' : attendanceRate >= 75 ? 'text-yellow-600' : 'text-red-600'}">
                                ${attendanceRate}% Attendance
                            </span>
                        </div>
                        <div class="grid grid-cols-3 gap-4 text-sm">
                            <div class="text-center">
                                <div class="text-green-600 font-bold">${child.present}</div>
                                <div class="text-gray-500">Present</div>
                            </div>
                            <div class="text-center">
                                <div class="text-yellow-600 font-bold">${child.late}</div>
                                <div class="text-gray-500">Late</div>
                            </div>
                            <div class="text-center">
                                <div class="text-red-600 font-bold">${child.absent}</div>
                                <div class="text-gray-500">Absent</div>
                            </div>
                        </div>
                    </div>
                `;
            });
            
            summaryHTML += `</div></div>`;
        });

        container.innerHTML = summaryHTML;
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
        const tabs = ['records', 'chart', 'summary'];
        
        tabs.forEach(tab => {
            document.getElementById(`${tab}Tab`).addEventListener('click', () => {
                this.switchTab(tab);
            });
        });
    }

    switchTab(tabName) {
        // Update tab buttons
        document.getElementById('recordsTab').classList.remove('tab-active');
        document.getElementById('chartTab').classList.remove('tab-active');
        document.getElementById('summaryTab').classList.remove('tab-active');
        document.getElementById('recordsTab').classList.add('text-gray-500', 'hover:text-gray-700');
        document.getElementById('chartTab').classList.add('text-gray-500', 'hover:text-gray-700');
        document.getElementById('summaryTab').classList.add('text-gray-500', 'hover:text-gray-700');
        
        document.getElementById(`${tabName}Tab`).classList.add('tab-active');
        document.getElementById(`${tabName}Tab`).classList.remove('text-gray-500', 'hover:text-gray-700');

        // Update tab content
        document.getElementById('recordsContent').classList.add('hidden');
        document.getElementById('chartContent').classList.add('hidden');
        document.getElementById('summaryContent').classList.add('hidden');
        document.getElementById(`${tabName}Content`).classList.remove('hidden');

        this.currentTab = tabName;

        // Update tab-specific content
        if (tabName === 'chart') {
            this.updateChartTab();
        } else if (tabName === 'summary') {
            this.updateSummaryTab();
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

        // Listen for new notifications
        window.addEventListener('educareTrack:newNotifications', () => {
            this.loadNotificationCount();
        });
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
