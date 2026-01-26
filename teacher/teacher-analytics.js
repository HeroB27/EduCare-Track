class TeacherAnalytics {
    constructor() {
        this.currentUser = null;
        this.classId = null;
        this.charts = {};
        this.init();
    }

    async init() {
        if (!await this.checkAuth()) return;
        this.setupUI();
        await this.loadAnalytics();
    }

    async checkAuth() {
        const savedUser = localStorage.getItem('educareTrack_user');
        if (!savedUser) {
            window.location.href = '../index.html';
            return false;
        }
        this.currentUser = JSON.parse(savedUser);
        if (this.currentUser.role !== 'teacher') {
            window.location.href = '../index.html';
            return false;
        }
        this.classId = this.currentUser.classId;
        if (!this.classId) {
            document.getElementById('analyticsContent').innerHTML = '<div class="p-4 text-center text-gray-500">No homeroom class assigned.</div>';
            return false;
        }
        return true;
    }

    setupUI() {
        // Set up date range pickers if needed, default to last 30 days
        const today = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(today.getDate() - 30);
    }

    async loadAnalytics() {
        try {
            this.showLoading();
            
            // Parallel fetch
            const [attendanceStats, studentStats] = await Promise.all([
                this.getAttendanceStats(),
                this.getStudentStats()
            ]);

            this.renderAttendanceChart(attendanceStats);
            this.renderStudentTable(studentStats);
            this.renderSummaryCards(attendanceStats);

            this.hideLoading();
        } catch (error) {
            console.error('Error loading analytics:', error);
            this.hideLoading();
        }
    }

    async getAttendanceStats() {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);

        const { data, error } = await window.supabaseClient
            .from('attendance')
            .select('status, timestamp')
            .eq('class_id', this.classId)
            .gte('timestamp', startDate.toISOString())
            .lte('timestamp', endDate.toISOString());

        if (error) throw error;

        // Group by date
        const dailyStats = {};
        const dateRange = [];
        let currentDate = new Date(startDate);
        while (currentDate <= endDate) {
            dateRange.push(currentDate.toISOString().split('T')[0]);
            currentDate.setDate(currentDate.getDate() + 1);
        }

        dateRange.forEach(date => {
            dailyStats[date] = { present: 0, late: 0, absent: 0 };
        });

        data.forEach(record => {
            const date = record.timestamp.split('T')[0];
            if (dailyStats[date]) {
                if (record.status === 'present') dailyStats[date].present++;
                else if (record.status === 'late') dailyStats[date].late++;
                else if (record.status === 'absent') dailyStats[date].absent++;
            }
        });

        return { dailyStats, dateRange, totalRecords: data.length };
    }

    async getStudentStats() {
        // Get all students in class
        const { data: students, error: sErr } = await window.supabaseClient
            .from('students')
            .select('id, full_name, photo_url')
            .eq('class_id', this.classId)
            .eq('is_active', true);

        if (sErr) throw sErr;

        // Get attendance counts for each student (last 30 days)
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);

        const { data: attendance, error: aErr } = await window.supabaseClient
            .from('attendance')
            .select('student_id, status')
            .eq('class_id', this.classId)
            .gte('timestamp', startDate.toISOString());

        if (aErr) throw aErr;

        const studentMap = {};
        students.forEach(s => {
            studentMap[s.id] = { ...s, present: 0, late: 0, absent: 0, total: 0 };
        });

        attendance.forEach(r => {
            if (studentMap[r.student_id]) {
                if (r.status === 'present') studentMap[r.student_id].present++;
                else if (r.status === 'late') studentMap[r.student_id].late++;
                else if (r.status === 'absent') studentMap[r.student_id].absent++;
                studentMap[r.student_id].total++;
            }
        });

        return Object.values(studentMap);
    }

    renderSummaryCards(stats) {
        let totalPresent = 0, totalLate = 0, totalAbsent = 0;
        Object.values(stats.dailyStats).forEach(day => {
            totalPresent += day.present;
            totalLate += day.late;
            totalAbsent += day.absent;
        });

        const total = totalPresent + totalLate + totalAbsent;
        const rate = total > 0 ? Math.round(((totalPresent + totalLate) / total) * 100) : 0;

        document.getElementById('analyticsAttendanceRate').textContent = `${rate}%`;
        document.getElementById('analyticsTotalPresent').textContent = totalPresent;
        document.getElementById('analyticsTotalLate').textContent = totalLate;
        document.getElementById('analyticsTotalAbsent').textContent = totalAbsent;
    }

    renderAttendanceChart(stats) {
        const ctx = document.getElementById('homeroomAttendanceChart').getContext('2d');
        const labels = stats.dateRange.map(d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        
        const presentData = stats.dateRange.map(d => stats.dailyStats[d].present);
        const lateData = stats.dateRange.map(d => stats.dailyStats[d].late);
        const absentData = stats.dateRange.map(d => stats.dailyStats[d].absent);

        if (this.charts.attendance) {
            this.charts.attendance.destroy();
        }

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
                    },
                    {
                        label: 'Absent',
                        data: absentData,
                        backgroundColor: '#EF4444'
                    }
                ]
            },
            options: {
                responsive: true,
                scales: {
                    x: { stacked: true },
                    y: { stacked: true, beginAtZero: true }
                }
            }
        });
    }

    renderStudentTable(students) {
        const tbody = document.getElementById('studentAnalyticsTable');
        tbody.innerHTML = students.map(s => {
            const rate = s.total > 0 ? Math.round(((s.present + s.late) / s.total) * 100) : 0;
            let statusClass = 'bg-green-100 text-green-800';
            if (rate < 80) statusClass = 'bg-yellow-100 text-yellow-800';
            if (rate < 60) statusClass = 'bg-red-100 text-red-800';

            return `
                <tr>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="flex items-center">
                            <div class="flex-shrink-0 h-10 w-10">
                                <img class="h-10 w-10 rounded-full" src="${s.photo_url || '../assets/default-avatar.png'}" alt="">
                            </div>
                            <div class="ml-4">
                                <div class="text-sm font-medium text-gray-900">${s.full_name}</div>
                                <div class="text-sm text-gray-500">${s.id}</div>
                            </div>
                        </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${s.present}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${s.late}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${s.absent}</td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusClass}">
                            ${rate}%
                        </span>
                    </td>
                </tr>
            `;
        }).join('');
    }

    showLoading() {
        // Implementation depends on UI framework
    }

    hideLoading() {
        // Implementation depends on UI framework
    }
}

// Initialize
window.teacherAnalytics = new TeacherAnalytics();
