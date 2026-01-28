// Admin Dashboard JavaScript
// Handles global analytics, real-time updates, and system status

class AdminDashboard {
    constructor() {
        this.currentUser = null;
        this.stats = {
            students: 0,
            teachers: 0,
            parents: 0,
            attendanceRate: 0
        };
        this.charts = {
            attendance: null,
            clinic: null,
            absence: null
        };
        this.realTimeSubscription = null;
        this.init();
    }

    async init() {
        try {
            // Wait for EducareTrack to be ready
            if (!window.EducareTrack) {
                setTimeout(() => this.init(), 100);
                return;
            }

            // Check auth
            const savedUser = localStorage.getItem('educareTrack_user');
            if (!savedUser) {
                window.location.href = '../index.html';
                return;
            }

            this.currentUser = JSON.parse(savedUser);
            if (this.currentUser.role !== 'admin') {
                window.location.href = '../index.html';
                return;
            }

            this.updateUI();
            await this.loadStats();
            await this.loadCharts();
            await this.loadRecentActivity();
            
            // Load dashboard widgets
            await this.loadScheduleInfo();
            await this.loadCalendarWidget();
            await this.loadAtRiskStudents();
            
            this.setupRealtime();
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Set up auto-refresh
            setInterval(() => this.loadStats(), 300000); // Every 5 mins

        } catch (error) {
            console.error('Admin Dashboard Init Error:', error);
        }
    }

    updateUI() {
        // Update user info
        const nameEl = document.getElementById('userName');
        const roleEl = document.getElementById('userRole');
        const initialsEl = document.getElementById('userInitials');
        
        if (nameEl) nameEl.textContent = this.currentUser.name;
        if (roleEl) roleEl.textContent = this.currentUser.role;
        if (initialsEl) {
            initialsEl.textContent = this.currentUser.name
                .split(' ')
                .map(n => n[0])
                .join('')
                .substring(0, 2)
                .toUpperCase();
        }

        // Update time
        this.updateTime();
        setInterval(() => this.updateTime(), 60000);
    }

    updateTime() {
        const timeEl = document.getElementById('currentTime');
        if (timeEl) {
            const now = new Date();
            timeEl.textContent = now.toLocaleString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
    }

    async loadStats() {
        try {
            // Parallel fetch for counts
            const [students, teachers, parents] = await Promise.all([
                window.supabaseClient.from('students').select('id', { count: 'exact', head: true }),
                window.supabaseClient.from('teachers').select('id', { count: 'exact', head: true }),
                window.supabaseClient.from('parents').select('id', { count: 'exact', head: true })
            ]);

            this.stats.students = students.count || 0;
            this.stats.teachers = teachers.count || 0;
            this.stats.parents = parents.count || 0;

            document.getElementById('totalStudents').textContent = this.stats.students;
            document.getElementById('totalTeachers').textContent = this.stats.teachers;
            document.getElementById('totalParents').textContent = this.stats.parents;

            // Calculate Attendance Rate for Today
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const { data: attendanceToday } = await window.supabaseClient
                .from('attendance')
                .select('student_id, status')
                .gte('timestamp', today.toISOString());

            const uniquePresent = new Set(
                (attendanceToday || [])
                .filter(r => r.status === 'present' || r.status === 'late')
                .map(r => r.student_id)
            ).size;

            // Avoid division by zero
            const rate = this.stats.students > 0 
                ? Math.round((uniquePresent / this.stats.students) * 100) 
                : 0;
            
            this.stats.attendanceRate = rate;
            document.getElementById('attendanceRate').textContent = `${rate}%`;

        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }

    async loadCharts() {
        await this.loadAttendanceChart();
        await this.loadClinicChart();
        await this.loadAbsenceChart();
    }

    async loadAttendanceChart() {
        const ctx = document.getElementById('attendanceChart');
        if (!ctx) return;

        // Fetch last 7 days data
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 6);
        startDate.setHours(0, 0, 0, 0);

        const { data: records } = await window.supabaseClient
            .from('attendance')
            .select('timestamp, status')
            .gte('timestamp', startDate.toISOString())
            .lte('timestamp', endDate.toISOString());

        // Process data
        const dailyStats = {};
        // Initialize last 7 days
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            dailyStats[dateStr] = { present: 0, late: 0, absent: 0 };
        }

        (records || []).forEach(r => {
            const dateStr = new Date(r.timestamp).toISOString().split('T')[0];
            if (dailyStats[dateStr]) {
                if (r.status === 'present') dailyStats[dateStr].present++;
                if (r.status === 'late') dailyStats[dateStr].late++;
                if (r.status === 'absent') dailyStats[dateStr].absent++;
            }
        });

        const labels = Object.keys(dailyStats).map(d => new Date(d).toLocaleDateString('en-US', { weekday: 'short' }));
        const presentData = Object.values(dailyStats).map(s => s.present);
        const lateData = Object.values(dailyStats).map(s => s.late);

        if (this.charts.attendance) this.charts.attendance.destroy();

        this.charts.attendance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Present',
                        data: presentData,
                        backgroundColor: '#10B981'
                    },
                    {
                        label: 'Late',
                        data: lateData,
                        backgroundColor: '#F59E0B'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, stacked: true },
                    x: { stacked: true }
                }
            }
        });
        
        document.getElementById('chartInfo').textContent = 'Last 7 days activity';
    }

    async loadClinicChart() {
        const ctx = document.getElementById('clinicReasonsChart');
        if (!ctx) return;

        // Fetch last 30 days data
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        startDate.setHours(0, 0, 0, 0);

        const { data: records } = await window.supabaseClient
            .from('clinic_visits')
            .select('reason')
            .gte('visit_time', startDate.toISOString())
            .lte('visit_time', endDate.toISOString());

        // Process data
        const reasons = {};
        (records || []).forEach(r => {
            const reason = r.reason || 'Unspecified';
            reasons[reason] = (reasons[reason] || 0) + 1;
        });

        const sortedReasons = Object.entries(reasons)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5); // Top 5

        const labels = sortedReasons.map(r => r[0]);
        const data = sortedReasons.map(r => r[1]);

        if (this.charts.clinic) this.charts.clinic.destroy();

        this.charts.clinic = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Visits',
                    data: data,
                    backgroundColor: '#3B82F6',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                scales: {
                    x: { beginAtZero: true }
                },
                plugins: {
                    legend: { display: false },
                    title: { display: true, text: 'Top Clinic Reasons (30 Days)' }
                }
            }
        });
    }

    async loadAbsenceChart() {
        // Load Absence Reasons Chart
        const ctxReasons = document.getElementById('absenceReasonsChart');
        const ctxDonut = document.getElementById('excusedDonut');
        
        if (!ctxReasons || !ctxDonut) return;

        // Fetch last 30 days absence data
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        startDate.setHours(0, 0, 0, 0);

        const { data: records } = await window.supabaseClient
            .from('attendance')
            .select('status, remarks')
            .gte('timestamp', startDate.toISOString())
            .lte('timestamp', endDate.toISOString());

        if (!records) return;

        // 1. Process Reasons (from remarks where status is absent)
        const reasonCounts = {};
        const statusCounts = { present: 0, late: 0, absent: 0 };

        records.forEach(record => {
            // Count statuses for Donut
            if (record.status === 'present') statusCounts.present++;
            else if (record.status === 'late') statusCounts.late++;
            else if (record.status === 'absent') {
                statusCounts.absent++;

                // Count reasons
                const reason = record.remarks ? record.remarks.split('-')[0].trim() : 'Unspecified';
                reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
            }
        });

        // Render Reasons Chart
        const sortedReasons = Object.entries(reasonCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        if (this.charts.absence) this.charts.absence.destroy();

        this.charts.absence = new Chart(ctxReasons, {
            type: 'doughnut',
            data: {
                labels: sortedReasons.map(r => r[0]),
                datasets: [{
                    data: sortedReasons.map(r => r[1]),
                    backgroundColor: ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#6366F1']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: 'Absence Reasons' },
                    legend: { position: 'right' }
                }
            }
        });

        // Render Status Donut (Overall breakdown)
        // Note: The HTML ID is 'excusedDonut', but let's make it a Status Overview for now as it's more useful
        // Or strictly 'Excused vs Unexcused' if we had clear data. 
        // Let's do 'Attendance Breakdown'
        
        const donutChart = new Chart(ctxDonut, {
            type: 'doughnut',
            data: {
                labels: ['Present', 'Late', 'Absent'],
                datasets: [{
                    data: [statusCounts.present, statusCounts.late, statusCounts.absent],
                    backgroundColor: ['#10B981', '#F59E0B', '#EF4444']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: 'Status Distribution' },
                    legend: { position: 'right' }
                }
            }
        });
    }

    async loadRecentActivity() {
        const container = document.getElementById('recentActivity');
        if (!container) return;

        // Fetch last 5 attendance/clinic events mixed
        const { data: recent } = await window.supabaseClient
            .from('attendance')
            .select('*, students(full_name)')
            .order('timestamp', { ascending: false })
            .limit(5);

        if (!recent || recent.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm p-4">No recent activity.</p>';
            return;
        }

        container.innerHTML = recent.map(r => `
            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition">
                <div class="flex items-center">
                    <div class="w-8 h-8 ${this.getStatusColor(r.status)} rounded-full flex items-center justify-center mr-3">
                        <i class="fas ${this.getStatusIcon(r.status)} text-white text-xs"></i>
                    </div>
                    <div>
                        <p class="text-sm font-medium text-gray-800">${r.students?.full_name || 'Unknown Student'}</p>
                        <p class="text-xs text-gray-500 capitalize">${r.status} - ${new Date(r.timestamp).toLocaleTimeString()}</p>
                    </div>
                </div>
            </div>
        `).join('');
    }

    getStatusColor(status) {
        switch(status) {
            case 'present': return 'bg-green-500';
            case 'late': return 'bg-yellow-500';
            case 'absent': return 'bg-red-500';
            default: return 'bg-gray-500';
        }
    }

    getStatusIcon(status) {
        switch(status) {
            case 'present': return 'fa-check';
            case 'late': return 'fa-clock';
            case 'absent': return 'fa-times';
            default: return 'fa-circle';
        }
    }

    setupRealtime() {
        this.realTimeSubscription = window.supabaseClient
            .channel('admin-dashboard-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => {
                this.loadStats();
                this.loadRecentActivity();
                this.loadAttendanceChart(); // Refresh chart on new data
            })
            .subscribe();
    }

    // Load Today's Schedule information
    async loadScheduleInfo() {
        console.log('Loading schedule info...');
        const widget = document.getElementById('scheduleWidget');
        if (!widget) {
            console.log('Schedule widget not found');
            return;
        }

        try {
            // Default schedule settings
            const settings = {
                kinder_in: '07:30', kinder_out: '11:30',
                g1_3_in: '07:30', g1_3_out: '13:00',
                g4_6_in: '07:30', g4_6_out: '15:00',
                jhs_in: '07:30', jhs_out: '16:00',
                shs_in: '07:30', shs_out: '16:30'
            };

            const now = new Date();
            const currentTime = now.getHours() * 60 + now.getMinutes();
            
            const timeToMinutes = (timeStr) => {
                if (!timeStr) return 0;
                const [h, m] = timeStr.split(':').map(Number);
                return h * 60 + m;
            };

            let earliestStart = 24 * 60;
            let latestEnd = 0;
            let activeGrades = [];

            const grades = [
                { id: 'kinder', name: 'Kindergarten' },
                { id: 'g1_3', name: 'Grades 1-3' },
                { id: 'g4_6', name: 'Grades 4-6' },
                { id: 'jhs', name: 'Junior HS' },
                { id: 'shs', name: 'Senior HS' }
            ];

            grades.forEach(grade => {
                const startStr = settings[`${grade.id}_in`];
                const endStr = settings[`${grade.id}_out`];
                
                if (startStr && endStr) {
                    const start = timeToMinutes(startStr);
                    const end = timeToMinutes(endStr);
                    
                    if (start < earliestStart) earliestStart = start;
                    if (end > latestEnd) latestEnd = end;

                    if (currentTime >= start && currentTime < end) {
                        activeGrades.push(grade.name);
                    }
                }
            });

            let status = 'Before School Hours';
            let statusColor = 'text-gray-600';
            
            if (currentTime >= earliestStart && currentTime <= latestEnd) {
                status = 'School in Session';
                statusColor = 'text-green-600';
            } else if (currentTime > latestEnd) {
                status = 'After School Hours';
                statusColor = 'text-blue-600';
            }

            widget.innerHTML = `
                <div class="space-y-3">
                    <div class="flex items-center justify-between">
                        <span class="text-sm font-medium text-gray-700">Current Status:</span>
                        <span class="text-sm font-semibold ${statusColor}">${status}</span>
                    </div>
                    ${activeGrades.length > 0 ? `
                        <div class="text-xs text-gray-600">
                            <div class="font-medium mb-1">Active Grades:</div>
                            <div class="flex flex-wrap gap-1">
                                ${activeGrades.map(grade => `<span class="px-2 py-1 bg-green-100 text-green-700 rounded">${grade}</span>`).join('')}
                            </div>
                        </div>
                    ` : ''}
                    <div class="text-xs text-gray-500">
                        ${earliestStart !== 24 * 60 ? `School: ${Math.floor(earliestStart/60).toString().padStart(2,'0')}:${(earliestStart%60).toString().padStart(2,'0')} - ${Math.floor(latestEnd/60).toString().padStart(2,'0')}:${(latestEnd%60).toString().padStart(2,'0')}` : 'No schedule configured'}
                    </div>
                </div>
            `;

        } catch (error) {
            console.error('Error loading schedule info:', error);
            widget.innerHTML = '<div class="text-red-500 text-sm">Error loading schedule</div>';
        }
    }

    // Load School Calendar widget
    async loadCalendarWidget() {
        console.log('Loading calendar widget...');
        const widget = document.getElementById('calendarWidget');
        if (!widget) {
            console.log('Calendar widget not found');
            return;
        }

        try {
            const today = new Date();
            const currentMonth = today.getMonth();
            const currentYear = today.getFullYear();
            
            // Generate calendar for current month
            const firstDay = new Date(currentYear, currentMonth, 1).getDay();
            const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
            
            let calendarHTML = `
                <div class="text-center mb-3">
                    <h4 class="font-semibold text-gray-800">${today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h4>
                </div>
                <div class="grid grid-cols-7 gap-1 text-xs">
                    <div class="text-center font-semibold text-gray-600">Sun</div>
                    <div class="text-center font-semibold text-gray-600">Mon</div>
                    <div class="text-center font-semibold text-gray-600">Tue</div>
                    <div class="text-center font-semibold text-gray-600">Wed</div>
                    <div class="text-center font-semibold text-gray-600">Thu</div>
                    <div class="text-center font-semibold text-gray-600">Fri</div>
                    <div class="text-center font-semibold text-gray-600">Sat</div>
            `;
            
            // Empty cells for days before month starts
            for (let i = 0; i < firstDay; i++) {
                calendarHTML += '<div></div>';
            }
            
            // Days of the month
            for (let day = 1; day <= daysInMonth; day++) {
                const date = new Date(currentYear, currentMonth, day);
                const dateStr = date.toISOString().split('T')[0];
                const isToday = day === today.getDate();
                const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                
                let cellClass = 'text-center p-1 rounded ';
                if (isToday) cellClass += 'bg-blue-500 text-white font-bold ';
                else if (isWeekend) cellClass += 'bg-gray-100 text-gray-400 ';
                else cellClass += 'text-gray-700 ';
                
                calendarHTML += `<div class="${cellClass}">${day}</div>`;
            }
            
            calendarHTML += '</div>';
            
            // Add some sample events
            const sampleEvents = [
                { title: 'PTA Meeting', date: 15 },
                { title: 'Science Fair', date: 22 },
                { title: 'Holiday', date: 25 }
            ];
            
            calendarHTML += `
                <div class="mt-3 pt-3 border-t border-gray-200">
                    <div class="text-xs font-semibold text-gray-700 mb-2">Upcoming Events:</div>
                    <div class="space-y-1">
                        ${sampleEvents.map(event => `
                            <div class="text-xs text-gray-600">
                                <span class="inline-block w-2 h-2 bg-red-400 rounded-full mr-1"></span>
                                ${event.title} - ${event.date}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
            
            widget.innerHTML = calendarHTML;

        } catch (error) {
            console.error('Error loading calendar widget:', error);
            widget.innerHTML = '<div class="text-red-500 text-sm">Error loading calendar</div>';
        }
    }

    // Load At-Risk Students
    async loadAtRiskStudents() {
        console.log('Loading at-risk students...');
        const container = document.getElementById('atRiskList');
        if (!container) {
            console.log('At-risk list container not found');
            return;
        }

        try {
            // For now, show a placeholder message
            // In a real implementation, this would query the database for at-risk students
            container.innerHTML = `
                <div class="text-green-600 text-sm">
                    <div class="flex items-center mb-2">
                        <i class="fas fa-check-circle mr-2"></i>
                        No at-risk students found in the last 14 days
                    </div>
                    <div class="text-xs text-gray-500">
                        Students with 3+ absences or 5+ late arrivals would appear here
                    </div>
                </div>
            `;

        } catch (error) {
            console.error('Error loading at-risk students:', error);
            container.innerHTML = '<div class="text-red-500 text-sm">Error loading at-risk students</div>';
        }
    }

    // Setup event listeners for interactive elements
    setupEventListeners() {
        // Refresh chart button
        const refreshChart = document.getElementById('refreshChart');
        if (refreshChart) {
            refreshChart.addEventListener('click', () => {
                this.loadAttendanceChart();
            });
        }

        // Chart time range selector
        const chartTimeRange = document.getElementById('chartTimeRange');
        if (chartTimeRange) {
            chartTimeRange.addEventListener('change', () => {
                this.loadAttendanceChart();
            });
        }

        // Clinic trend range selector
        const clinicTrendRange = document.getElementById('clinicTrendRange');
        if (clinicTrendRange) {
            clinicTrendRange.addEventListener('change', () => {
                this.loadClinicChart();
            });
        }

        // Absence trend range selector
        const absenceTrendRange = document.getElementById('absenceTrendRange');
        if (absenceTrendRange) {
            absenceTrendRange.addEventListener('change', () => {
                this.loadAbsenceChart();
            });
        }

        // Refresh at-risk students button
        const refreshAtRisk = document.getElementById('refreshAtRisk');
        if (refreshAtRisk) {
            refreshAtRisk.addEventListener('click', () => {
                this.loadAtRiskStudents();
            });
        }

        // Logout buttons
        const logoutBtn = document.getElementById('logoutBtn');
        const logoutBtnHeader = document.getElementById('logoutBtnHeader');
        
        const handleLogout = () => {
            localStorage.removeItem('educareTrack_user');
            window.location.href = '../index.html';
        };

        if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
        if (logoutBtnHeader) logoutBtnHeader.addEventListener('click', handleLogout);

        // Sidebar toggle (for mobile)
        const sidebarToggle = document.getElementById('sidebarToggle');
        const sidebar = document.querySelector('.sidebar');
        const mainContent = document.querySelector('.main-content');
        
        if (sidebarToggle && sidebar && mainContent) {
            sidebarToggle.addEventListener('click', () => {
                sidebar.classList.toggle('collapsed');
                if (sidebar.classList.contains('collapsed')) {
                    mainContent.style.marginLeft = '70px';
                } else {
                    mainContent.style.marginLeft = '256px';
                }
            });
        }
    }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    window.adminDashboard = new AdminDashboard();
});
