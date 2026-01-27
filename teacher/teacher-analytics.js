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
        this.setupRealTimeListeners();
    }

    setupRealTimeListeners() {
        if (!window.supabaseClient) return;

        if (this.realtimeChannel) {
            window.supabaseClient.removeChannel(this.realtimeChannel);
        }

        this.realtimeChannel = window.supabaseClient.channel('teacher_analytics_realtime');

        // Listen for Attendance Changes
        this.realtimeChannel.on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'attendance',
            filter: `class_id=eq.${this.classId}`
        }, () => {
            console.log('Realtime attendance update received');
            this.loadAnalytics();
        });

        // Listen for Clinic Visits
        this.realtimeChannel.on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'clinic_visits'
        }, (payload) => {
            // Check if relevant to this class if possible, or just reload
            if (payload.new?.class_id == this.classId || payload.old?.class_id == this.classId) {
                console.log('Realtime clinic update received');
                this.loadAnalytics();
            }
        });

        this.realtimeChannel.subscribe();
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
            const [attendanceStats, studentStats, clinicStats] = await Promise.all([
                this.getAttendanceStats(),
                this.getStudentStats(),
                this.getClinicStats()
            ]);

            this.renderAttendanceChart(attendanceStats);
            this.renderStudentTable(studentStats, clinicStats);
            this.renderSummaryCards(attendanceStats, clinicStats);

            this.hideLoading();
        } catch (error) {
            console.error('Error loading analytics:', error);
            this.hideLoading();
        }
    }

    async getClinicStats() {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);

        // Get students in class first to filter clinic visits
        const { data: students, error: sErr } = await window.supabaseClient
            .from('students')
            .select('id')
            .eq('class_id', this.classId);

        if (sErr) throw sErr;
        const studentIds = students.map(s => s.id);

        if (studentIds.length === 0) return { dailyStats: {}, total: 0, byStudent: {} };

        const { data, error } = await window.supabaseClient
            .from('clinic_visits')
            .select('student_id, visit_time, reason, outcome')
            .in('student_id', studentIds)
            .gte('visit_time', startDate.toISOString())
            .lte('visit_time', endDate.toISOString());

        if (error) throw error;

        // Process clinic stats
        const dailyStats = {};
        const byStudent = {};
        
        data.forEach(visit => {
            const date = visit.visit_time.split('T')[0];
            dailyStats[date] = (dailyStats[date] || 0) + 1;
            
            byStudent[visit.student_id] = (byStudent[visit.student_id] || 0) + 1;
        });

        return { dailyStats, total: data.length, byStudent };
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
            dailyStats[date] = { present: 0, late: 0, absent: 0, excused: 0, half_day: 0, clinic: 0 };
        });

        data.forEach(record => {
            const date = record.timestamp.split('T')[0];
            if (dailyStats[date]) {
                if (record.status === 'present') dailyStats[date].present++;
                else if (record.status === 'late') dailyStats[date].late++;
                else if (record.status === 'absent') dailyStats[date].absent++;
                else if (record.status === 'excused') dailyStats[date].excused++;
                else if (record.status === 'half_day') dailyStats[date].half_day++;
                else if (record.status === 'clinic') dailyStats[date].clinic++;
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
        let totalPresent = 0, totalLate = 0, totalAbsent = 0, totalExcused = 0, totalHalfDay = 0;
        Object.values(stats.dailyStats).forEach(day => {
            totalPresent += day.present;
            totalLate += day.late;
            totalAbsent += day.absent;
            totalExcused += day.excused;
            totalHalfDay += day.half_day;
        });

        // Treat Half Day as present for general attendance rate, or partial? 
        // Simple approach: Present + Late + Half Day
        const total = totalPresent + totalLate + totalAbsent + totalExcused + totalHalfDay;
        const rate = total > 0 ? Math.round(((totalPresent + totalLate + totalHalfDay) / total) * 100) : 0;

        document.getElementById('analyticsAttendanceRate').textContent = `${rate}%`;
        document.getElementById('analyticsTotalPresent').textContent = totalPresent + totalHalfDay; // Combine for simplicity in summary card
        document.getElementById('analyticsTotalLate').textContent = totalLate;
        document.getElementById('analyticsTotalAbsent').textContent = totalAbsent + totalExcused; // Combine for simplicity
    }

    renderAttendanceChart(stats, clinicStats) {
        const ctx = document.getElementById('homeroomAttendanceChart').getContext('2d');
        const labels = stats.dateRange.map(d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        
        const presentData = stats.dateRange.map(d => stats.dailyStats[d].present);
        const lateData = stats.dateRange.map(d => stats.dailyStats[d].late);
        const absentData = stats.dateRange.map(d => stats.dailyStats[d].absent);
        const excusedData = stats.dateRange.map(d => stats.dailyStats[d].excused);
        const halfDayData = stats.dateRange.map(d => stats.dailyStats[d].half_day);

        // Use clinic stats if available, otherwise fall back to attendance record status
        const clinicData = stats.dateRange.map(d => {
            const clinicCount = clinicStats && clinicStats.dailyStats ? (clinicStats.dailyStats[d] || 0) : 0;
            return clinicCount > 0 ? clinicCount : stats.dailyStats[d].clinic;
        });

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
                        label: 'Half Day',
                        data: halfDayData,
                        backgroundColor: '#8B5CF6' // Purple for Half Day
                    },
                    {
                        label: 'In Clinic',
                        data: clinicData,
                        backgroundColor: '#3B82F6' // Blue for Clinic
                    },
                    {
                        label: 'Absent',
                        data: absentData,
                        backgroundColor: '#EF4444'
                    },
                    {
                        label: 'Excused',
                        data: excusedData,
                        backgroundColor: '#6B7280' // Gray for Excused (changed from Blue to avoid conflict)
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

    renderStudentTable(students, clinicStats) {
        // Merge clinic stats into students
        students.forEach(s => {
            s.clinic = clinicStats.byStudent[s.id] || 0;
        });

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
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${s.excused}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-blue-500 font-medium">${s.clinic}</td>
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
