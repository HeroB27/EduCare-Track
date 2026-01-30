const PERIOD_MAP = {
    '07:30': 1,
    '08:30': 2,
    '09:45': 3,
    '10:45': 4,
    '13:00': 5,
    '14:00': 6,
    '15:00': 7
};

class TeacherAnalytics {
    constructor() {
        this.currentUser = null;
        this.classId = null;
        this.students = [];
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
            // Check if relevant to this class (by student_id)
            const studentId = payload.new?.student_id || payload.old?.student_id;
            const isRelevant = this.students.some(s => s.id === studentId);
            
            if (isRelevant) {
                console.log('Realtime clinic update received for student in class');
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
            
            // Fetch students first
            const { data: students, error: sErr } = await window.supabaseClient
                .from('students')
                .select('id, full_name, photo_url')
                .eq('class_id', this.classId);

            if (sErr) throw sErr;
            this.students = students || [];
            const studentIds = this.students.map(s => s.id);

            // Parallel fetch
            const [attendanceStats, clinicStats, excuseStats] = await Promise.all([
                this.getAttendanceStats(),
                this.getClinicStats(studentIds),
                this.getExcuseStats(studentIds)
            ]);

            this.renderAttendanceChart(attendanceStats, clinicStats, excuseStats);
            this.renderStudentTable(attendanceStats, clinicStats, excuseStats);
            this.renderSummaryCards(attendanceStats, clinicStats, excuseStats);

            this.hideLoading();
        } catch (error) {
            console.error('Error loading analytics:', error);
            this.hideLoading();
        }
    }

    async getClinicStats(studentIds) {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);

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
            const date = new Date(visit.visit_time).toISOString().split('T')[0];
            dailyStats[date] = (dailyStats[date] || 0) + 1;
            byStudent[visit.student_id] = (byStudent[visit.student_id] || 0) + 1;
        });

        return { dailyStats, total: data.length, byStudent };
    }

    async getExcuseStats(studentIds) {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);

        if (studentIds.length === 0) return { dailyStats: {}, total: 0, byStudent: {} };

        const { data, error } = await window.supabaseClient
            .from('excuse_letters')
            .select('*')
            .in('student_id', studentIds)
            .eq('status', 'approved');

        if (error) throw error;

        const dailyStats = {};
        const byStudent = {};
        let total = 0;

        if (data) {
             data.forEach(excuse => {
                const dates = excuse.dates || (excuse.absenceDate ? [excuse.absenceDate] : []);
                dates.forEach(dateStr => {
                    const date = new Date(dateStr);
                    if (date >= startDate && date <= endDate) {
                         const dKey = date.toISOString().split('T')[0];
                         dailyStats[dKey] = (dailyStats[dKey] || 0) + 1;
                         byStudent[excuse.student_id] = (byStudent[excuse.student_id] || 0) + 1;
                         total++;
                    }
                });
             });
        }
        return { dailyStats, total, byStudent };
    }

    async getAttendanceStats() {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);

        // 1. Fetch Homeroom (Period 1) from 'attendance'
        const { data: homeroomData, error: hrError } = await window.supabaseClient
            .from('attendance')
            .select('student_id, status, timestamp')
            .eq('class_id', this.classId)
            .gte('timestamp', startDate.toISOString())
            .lte('timestamp', endDate.toISOString());

        if (hrError) throw hrError;

        // 2. Fetch Subject Attendance (Periods 2-7)
        // First get schedules for this class to map IDs and filter
        const { data: schedules } = await window.supabaseClient
            .from('class_schedules')
            .select('id, period_number, start_time')
            .eq('class_id', this.classId);
            
        const scheduleIds = (schedules || []).map(s => s.id);
        const schedulePeriodMap = {};
        (schedules || []).forEach(s => {
            // Robustness: Use period_number if available, otherwise derive from start_time
            const startTime = s.start_time ? s.start_time.slice(0, 5) : null;
            const derivedPeriod = PERIOD_MAP[startTime];
            schedulePeriodMap[s.id] = s.period_number || derivedPeriod;
        });

        let subjectData = [];
        if (scheduleIds.length > 0) {
             const { data: subjData, error: subjError } = await window.supabaseClient
                .from('subject_attendance')
                .select('student_id, status, date, schedule_id')
                .in('schedule_id', scheduleIds)
                .gte('date', startDate.toISOString().split('T')[0])
                .lte('date', endDate.toISOString().split('T')[0]);
             
             if (subjError) throw subjError;
             subjectData = subjData || [];
        }

        // Group by date
        const dailyStats = {};
        const byStudent = {};
        const dateRange = [];
        let currentDate = new Date(startDate);
        while (currentDate <= endDate) {
            dateRange.push(currentDate.toISOString().split('T')[0]);
            currentDate.setDate(currentDate.getDate() + 1);
        }

        dateRange.forEach(date => {
            dailyStats[date] = { present: 0, late: 0, absent: 0 };
        });

        // Initialize Student Stats
        this.students.forEach(s => {
             byStudent[s.id] = { present: 0, late: 0, absent: 0, total: 0 };
        });

        // Helper to process record
        const processRecord = (studentId, status, dateStr) => {
            if (!dailyStats[dateStr]) return;

            // Daily Stats
            if (status === 'present') dailyStats[dateStr].present++;
            else if (status === 'late') dailyStats[dateStr].late++;
            else if (status === 'absent') dailyStats[dateStr].absent++;

            // Student Stats
            if (!byStudent[studentId]) byStudent[studentId] = { present: 0, late: 0, absent: 0, total: 0 };
            
            if (status === 'present') byStudent[studentId].present++;
            else if (status === 'late') byStudent[studentId].late++;
            else if (status === 'absent') byStudent[studentId].absent++;
            
            byStudent[studentId].total++;
        };

        // Process Homeroom (Period 1)
        homeroomData.forEach(record => {
            const date = new Date(record.timestamp).toISOString().split('T')[0];
            processRecord(record.student_id, record.status, date);
        });

        // Process Subject Attendance
        subjectData.forEach(record => {
            const pNum = schedulePeriodMap[record.schedule_id];
            // Skip Period 1 if it exists in subject_attendance (to avoid double counting with homeroom)
            // Assuming Period 1 is handled by 'attendance' table
            if (pNum === 1) return; 

            processRecord(record.student_id, record.status, record.date);
        });

        return { dailyStats, dateRange, totalRecords: homeroomData.length + subjectData.length, byStudent };
    }

    renderSummaryCards(attendanceStats, clinicStats, excuseStats) {
        let totalPresent = 0, totalLate = 0, totalAbsent = 0;
        
        // Sum from attendanceStats
        Object.values(attendanceStats.dailyStats).forEach(day => {
            totalPresent += day.present;
            totalLate += day.late;
            totalAbsent += day.absent;
        });

        // Use clinic and excuse totals
        const totalClinic = clinicStats.total;
        const totalExcused = excuseStats.total;

        const total = totalPresent + totalLate + totalAbsent; 
        // Note: excused and clinic might overlap with absent/present in attendance table depending on how they are recorded.
        // Assuming they are recorded as 'absent' in attendance table, or not recorded.
        // For rate calculation, we usually do (Present + Late) / Total Days.
        
        const rate = total > 0 ? Math.round(((totalPresent + totalLate) / total) * 100) : 0;

        document.getElementById('analyticsAttendanceRate').textContent = `${rate}%`;
        document.getElementById('analyticsTotalPresent').textContent = totalPresent;
        document.getElementById('analyticsTotalLate').textContent = totalLate;
        document.getElementById('analyticsTotalAbsent').textContent = totalAbsent; // Raw absent
        // We might want to show excused/clinic in UI if there are slots for them, but existing UI only has these IDs.
        // If we want to show "Excused" instead of "Absent", we need to subtract excused from absent?
        // Let's keep it simple and just show raw counts for now, or update if UI allows.
        // The previous code combined them.
        
        // If the user wants to see "Excused" breakdown, they can see the chart.
    }

    renderAttendanceChart(attendanceStats, clinicStats, excuseStats) {
        const ctx = document.getElementById('homeroomAttendanceChart').getContext('2d');
        const labels = attendanceStats.dateRange.map(d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        
        const presentData = attendanceStats.dateRange.map(d => attendanceStats.dailyStats[d].present);
        const lateData = attendanceStats.dateRange.map(d => attendanceStats.dailyStats[d].late);
        const absentData = attendanceStats.dateRange.map(d => attendanceStats.dailyStats[d].absent);
        
        const clinicData = attendanceStats.dateRange.map(d => clinicStats.dailyStats[d] || 0);
        const excusedData = attendanceStats.dateRange.map(d => excuseStats.dailyStats[d] || 0);

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
                        label: 'In Clinic',
                        data: clinicData,
                        backgroundColor: '#3B82F6'
                    },
                    {
                        label: 'Excused',
                        data: excusedData,
                        backgroundColor: '#6B7280'
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

    renderStudentTable(attendanceStats, clinicStats, excuseStats) {
        const tbody = document.getElementById('studentAnalyticsTable');
        
        // Merge stats for each student
        const studentsWithStats = this.students.map(s => {
            const att = attendanceStats.byStudent[s.id] || { present: 0, late: 0, absent: 0, total: 0 };
            const clinic = clinicStats.byStudent[s.id] || 0;
            const excused = excuseStats.byStudent[s.id] || 0;
            
            return {
                ...s,
                present: att.present,
                late: att.late,
                absent: att.absent,
                total: att.total,
                clinic,
                excused
            };
        });

        tbody.innerHTML = studentsWithStats.map(s => {
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
        const spinner = document.getElementById('loadingSpinner');
        if (spinner) spinner.classList.remove('hidden');
    }

    hideLoading() {
        const spinner = document.getElementById('loadingSpinner');
        if (spinner) spinner.classList.add('hidden');
    }
}

// Initialize
window.teacherAnalytics = new TeacherAnalytics();