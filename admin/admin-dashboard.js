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
            this.setupRealtime();
            
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
        const absenceReasons = {};
        const statusCounts = { present: 0, late: 0, absent: 0, excused: 0 };

        records.forEach(r => {
            // Count statuses for Donut
            if (r.status === 'present') statusCounts.present++;
            else if (r.status === 'late') statusCounts.late++;
            else if (r.status === 'absent') {
                statusCounts.absent++;
                // Check if excused (simple check for now)
                if (r.remarks && (r.remarks.toLowerCase().includes('excused') || r.remarks.toLowerCase().includes('medical'))) {
                    statusCounts.excused++;
                    statusCounts.absent--; // Move from absent to excused for this viz
                }

                // Count reasons
                const reason = r.remarks ? r.remarks.split('-')[0].trim() : 'Unspecified'; // Simple heuristic
                absenceReasons[reason] = (absenceReasons[reason] || 0) + 1;
            }
        });

        // Render Reasons Chart
        const sortedReasons = Object.entries(absenceReasons)
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
                labels: ['Present', 'Late', 'Absent', 'Excused'],
                datasets: [{
                    data: [statusCounts.present, statusCounts.late, statusCounts.absent, statusCounts.excused],
                    backgroundColor: ['#10B981', '#F59E0B', '#EF4444', '#8B5CF6']
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
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    window.adminDashboard = new AdminDashboard();
});
