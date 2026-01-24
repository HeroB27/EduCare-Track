// guard-reports.js
class GuardReports {
    constructor() {
        this.currentUser = null;
        this.currentReport = null;
        this.init();
    }

    async init() {
        await this.checkAuth();
        this.initEventListeners();
        this.setDefaultDates();
    }

    async checkAuth() {
        try {
            if (!EducareTrack.currentUser || EducareTrack.currentUserRole !== 'guard') {
                window.location.href = '../index.html';
                return;
            }
            
            this.currentUser = EducareTrack.currentUser;
            document.getElementById('userName').textContent = this.currentUser.name;
        } catch (error) {
            console.error('Auth check failed:', error);
            window.location.href = '../index.html';
        }
    }

    initEventListeners() {
        // Set default dates to today
        this.setDefaultDates();
    }

    setDefaultDates() {
        const today = new Date();
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(today.getDate() - 7);

        document.getElementById('startDate').value = oneWeekAgo.toISOString().split('T')[0];
        document.getElementById('endDate').value = today.toISOString().split('T')[0];
    }

    async generateReport() {
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;
        const reportType = document.getElementById('reportType').value;

        if (!startDate || !endDate) {
            this.showNotification('Please select both start and end dates', 'error');
            return;
        }

        try {
            this.showNotification('Generating report...', 'info');

            const start = new Date(startDate);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999); // End of day

            let reportData;
            let reportTitle;

            switch (reportType) {
                case 'attendance':
                    reportData = await this.getAttendanceReport(start, end);
                    reportTitle = 'Attendance Report';
                    break;
                case 'late':
                    reportData = await this.getLateArrivalsReport(start, end);
                    reportTitle = 'Late Arrivals Report';
                    break;
                case 'clinic':
                    reportData = await this.getClinicReport(start, end);
                    reportTitle = 'Clinic Visits Report';
                    break;
                case 'summary':
                    reportData = await this.generateSummaryReport(start, end);
                    reportTitle = 'Daily Summary Report';
                    break;
            }

            this.currentReport = {
                data: reportData,
                type: reportType,
                startDate: start,
                endDate: end,
                title: reportTitle
            };

            this.displayReport(reportData, reportType, reportTitle);
            this.updateSummaryStats(reportData, reportType);

        } catch (error) {
            console.error('Error generating report:', error);
            this.showNotification('Failed to generate report: ' + error.message, 'error');
        }
    }

    async generateSummaryReport(startDate, endDate) {
        // Get attendance data for the period
        const attendanceData = await this.getAttendanceReport(startDate, endDate);
        
        // Group by date and calculate statistics
        const dateGroups = {};
        
        attendanceData.forEach(record => {
            if (record.timestamp) {
                const date = new Date(record.timestamp).toDateString();
                if (!dateGroups[date]) {
                    dateGroups[date] = {
                        date: date,
                        present: 0,
                        late: 0,
                        absent: 0,
                        totalStudents: 0,
                        entries: [],
                        exits: [],
                        noSchool: !window.EducareTrack.isSchoolDay(new Date(date))
                    };
                }
                
                if (record.session === 'AM') {
                    dateGroups[date].entries.push(record);
                    if (record.status === 'present') dateGroups[date].present++;
                    if (record.status === 'late') dateGroups[date].late++;
                } else if (record.session === 'PM') {
                    dateGroups[date].exits.push(record);
                }
            }
        });

        // Get total number of enrolled students
        const { data: totalStudentsData, error: totalError } = await window.supabaseClient
            .from('students')
            .select('id')
            .in('current_status', ['enrolled', 'active', 'present']);
        
        if (totalError) throw totalError;
        const totalStudents = totalStudentsData?.length || 0;
        
        // Fill missing dates in range
        const filled = {};
        const cur = new Date(startDate);
        const end = new Date(endDate);
        while (cur <= end) {
            const dStr = cur.toDateString();
            if (!dateGroups[dStr]) {
                filled[dStr] = {
                    date: dStr,
                    present: 0,
                    late: 0,
                    absent: 0,
                    totalStudents,
                    entries: [],
                    exits: [],
                    noSchool: !window.EducareTrack.isSchoolDay(cur)
                };
            } else {
                filled[dStr] = dateGroups[dStr];
            }
            cur.setDate(cur.getDate() + 1);
        }

        return Object.values(filled).map(day => {
            day.totalStudents = totalStudents;
            if (day.noSchool) {
                day.absent = 0;
                day.attendanceRate = 0;
            } else {
                day.absent = totalStudents - day.present - day.late;
                day.attendanceRate = totalStudents > 0 ? Math.round((day.present / totalStudents) * 100) : 0;
            }
            return day;
        });
    }

    displayReport(data, type, title) {
        const container = document.getElementById('reportContent');
        document.getElementById('reportTitle').textContent = title;
        
        if (!data || data.length === 0) {
            container.innerHTML = `
                <div class="text-center py-12 text-gray-500">
                    <svg class="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 0112 20c-4.418 0-8-3.582-8-8s3.582-8 8-8 8 3.582 8 8c0 1.703-.523 3.281-1.416 4.596"></path>
                    </svg>
                    <p class="text-lg">No data found for the selected criteria</p>
                </div>
            `;
            return;
        }

        switch (type) {
            case 'attendance':
                container.innerHTML = this.renderAttendanceTable(data);
                break;
            case 'late':
                container.innerHTML = this.renderLateArrivalsTable(data);
                break;
            case 'clinic':
                container.innerHTML = this.renderClinicTable(data);
                break;
            case 'summary':
                container.innerHTML = this.renderSummaryTable(data);
                break;
        }
    }

    renderAttendanceTable(data) {
        return `
            <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead>
                        <tr>
                            <th class="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
                            <th class="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date & Time</th>
                            <th class="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Session</th>
                            <th class="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th class="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
                        ${data.map(record => {
                            const date = new Date(record.timestamp).toLocaleDateString();
                            const time = new Date(record.timestamp).toTimeString().substring(0, 5);
                            const statusColor = this.getStatusColor(record.status);
                            const statusText = this.getStatusText(record.status);
                            
                            return `
                                <tr>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <div class="text-sm font-medium text-gray-900">${record.studentName || 'Unknown'}</div>
                                        <div class="text-sm text-gray-500">${record.studentId}</div>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <div class="text-sm text-gray-900">${date}</div>
                                        <div class="text-sm text-gray-500">${time}</div>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${record.session || 'N/A'}</td>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusColor}">
                                            ${statusText}
                                        </span>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 capitalize">${record.method || 'qr'}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    renderLateArrivalsTable(data) {
        return this.renderAttendanceTable(data); // Same format as attendance table
    }

    renderClinicTable(data) {
        return `
            <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead>
                        <tr>
                            <th class="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
                            <th class="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date & Time</th>
                            <th class="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                            <th class="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
                            <th class="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Outcome</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
                        ${data.map(record => {
                            const date = new Date(record.visit_time).toLocaleDateString();
                            const time = new Date(record.visit_time).toTimeString().substring(0, 5);
                            
                            return `
                                <tr>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <div class="text-sm font-medium text-gray-900">${record.studentName || 'Unknown'}</div>
                                        <div class="text-sm text-gray-500">${record.studentId}</div>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <div class="text-sm text-gray-900">${date}</div>
                                        <div class="text-sm text-gray-500">${time}</div>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${record.reason || 'Not specified'}</td>
                                    <td class="px-6 py-4 text-sm text-gray-900">${record.notes || 'None'}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${record.outcome || 'Unknown'}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    renderSummaryTable(data) {
        return `
            <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead>
                        <tr>
                            <th class="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                            <th class="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Present</th>
                            <th class="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Late</th>
                            <th class="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Absent</th>
                            <th class="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Attendance Rate</th>
                            <th class="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entries</th>
                            <th class="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Exits</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
                        ${data.map(day => {
                            const attendanceRateColor = day.noSchool ? 'text-gray-500' : (day.attendanceRate >= 90 ? 'text-green-600' : 
                                                     day.attendanceRate >= 80 ? 'text-yellow-600' : 'text-red-600');
                            
                            return `
                                <tr>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${day.date}${day.noSchool ? ' (No School)' : ''}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${day.present}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${day.late}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${day.absent}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium ${attendanceRateColor}">
                                        ${day.noSchool ? 'No School' : `${day.attendanceRate}%`}
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${day.entries.length}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${day.exits.length}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    updateSummaryStats(data, type) {
        const container = document.getElementById('summaryStats');
        const summaryContainer = document.getElementById('reportSummary');
        
        if (!data || data.length === 0) {
            summaryContainer.classList.add('hidden');
            return;
        }

        summaryContainer.classList.remove('hidden');

        let statsHtml = '';

        switch (type) {
            case 'attendance':
                const present = data.filter(r => r.status === 'present').length;
                const late = data.filter(r => r.status === 'late').length;
                const absent = data.length - present - late;
                
                statsHtml = `
                    <div class="text-center p-4 bg-green-50 rounded-lg">
                        <div class="text-2xl font-bold text-green-600">${present}</div>
                        <div class="text-sm text-green-800">Present</div>
                    </div>
                    <div class="text-center p-4 bg-yellow-50 rounded-lg">
                        <div class="text-2xl font-bold text-yellow-600">${late}</div>
                        <div class="text-sm text-yellow-800">Late</div>
                    </div>
                    <div class="text-center p-4 bg-red-50 rounded-lg">
                        <div class="text-2xl font-bold text-red-600">${absent}</div>
                        <div class="text-sm text-red-800">Absent</div>
                    </div>
                    <div class="text-center p-4 bg-blue-50 rounded-lg">
                        <div class="text-2xl font-bold text-blue-600">${data.length}</div>
                        <div class="text-sm text-blue-800">Total Records</div>
                    </div>
                `;
                break;

            case 'late':
                statsHtml = `
                    <div class="text-center p-4 bg-yellow-50 rounded-lg">
                        <div class="text-2xl font-bold text-yellow-600">${data.length}</div>
                        <div class="text-sm text-yellow-800">Late Arrivals</div>
                    </div>
                    <div class="text-center p-4 bg-blue-50 rounded-lg">
                        <div class="text-2xl font-bold text-blue-600">${this.countUniqueStudents(data)}</div>
                        <div class="text-sm text-blue-800">Unique Students</div>
                    </div>
                    <div class="text-center p-4 bg-gray-50 rounded-lg col-span-2">
                        <div class="text-lg font-bold text-gray-600">Most Frequent: ${this.getMostFrequentLateStudent(data)}</div>
                        <div class="text-sm text-gray-800">Student with most late arrivals</div>
                    </div>
                `;
                break;

            case 'clinic':
                const checkIns = data.filter(r => r.checkIn).length;
                const checkOuts = data.filter(r => !r.checkIn).length;
                
                statsHtml = `
                    <div class="text-center p-4 bg-blue-50 rounded-lg">
                        <div class="text-2xl font-bold text-blue-600">${checkIns}</div>
                        <div class="text-sm text-blue-800">Check-ins</div>
                    </div>
                    <div class="text-center p-4 bg-green-50 rounded-lg">
                        <div class="text-2xl font-bold text-green-600">${checkOuts}</div>
                        <div class="text-sm text-green-800">Check-outs</div>
                    </div>
                    <div class="text-center p-4 bg-purple-50 rounded-lg">
                        <div class="text-2xl font-bold text-purple-600">${this.countUniqueStudents(data)}</div>
                        <div class="text-sm text-purple-800">Unique Students</div>
                    </div>
                    <div class="text-center p-4 bg-orange-50 rounded-lg">
                        <div class="text-2xl font-bold text-orange-600">${this.getMostCommonReason(data)}</div>
                        <div class="text-sm text-orange-800">Most Common Reason</div>
                    </div>
                `;
                break;

            case 'summary':
                const totalDays = data.length;
                const avgAttendance = data.reduce((sum, day) => sum + day.attendanceRate, 0) / totalDays;
                const totalEntries = data.reduce((sum, day) => sum + day.entries.length, 0);
                const totalExits = data.reduce((sum, day) => sum + day.exits.length, 0);
                
                statsHtml = `
                    <div class="text-center p-4 bg-blue-50 rounded-lg">
                        <div class="text-2xl font-bold text-blue-600">${totalDays}</div>
                        <div class="text-sm text-blue-800">Days</div>
                    </div>
                    <div class="text-center p-4 bg-green-50 rounded-lg">
                        <div class="text-2xl font-bold text-green-600">${Math.round(avgAttendance)}%</div>
                        <div class="text-sm text-green-800">Avg Attendance</div>
                    </div>
                    <div class="text-center p-4 bg-purple-50 rounded-lg">
                        <div class="text-2xl font-bold text-purple-600">${totalEntries}</div>
                        <div class="text-sm text-purple-800">Total Entries</div>
                    </div>
                    <div class="text-center p-4 bg-orange-50 rounded-lg">
                        <div class="text-2xl font-bold text-orange-600">${totalExits}</div>
                        <div class="text-sm text-orange-800">Total Exits</div>
                    </div>
                `;
                break;
        }

        container.innerHTML = statsHtml;
    }

    countUniqueStudents(data) {
        const uniqueStudents = new Set(data.map(record => record.studentId));
        return uniqueStudents.size;
    }

    getMostFrequentLateStudent(data) {
        const studentCounts = {};
        data.forEach(record => {
            studentCounts[record.studentName] = (studentCounts[record.studentName] || 0) + 1;
        });
        
        const mostFrequent = Object.entries(studentCounts).reduce((max, [name, count]) => 
            count > max.count ? { name, count } : max, { name: 'None', count: 0 }
        );
        
        return mostFrequent.name;
    }

    getMostCommonReason(data) {
        const reasonCounts = {};
        data.forEach(record => {
            if (record.reason) {
                reasonCounts[record.reason] = (reasonCounts[record.reason] || 0) + 1;
            }
        });
        
        const mostCommon = Object.entries(reasonCounts).reduce((max, [reason, count]) => 
            count > max.count ? { reason, count } : max, { reason: 'Not specified', count: 0 }
        );
        
        return mostCommon.reason.substring(0, 15) + (mostCommon.reason.length > 15 ? '...' : '');
    }

    exportReport() {
        if (!this.currentReport || !this.currentReport.data.length) {
            this.showNotification('No report data to export', 'error');
            return;
        }

        try {
            let csvContent = '';
            const headers = this.getCSVHeaders(this.currentReport.type);
            csvContent += headers.join(',') + '\n';

            this.currentReport.data.forEach(record => {
                const row = this.formatCSVRow(record, this.currentReport.type);
                csvContent += row.join(',') + '\n';
            });

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            
            link.setAttribute('href', url);
            link.setAttribute('download', `educaretrack_${this.currentReport.type}_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            this.showNotification('Report exported successfully', 'success');
        } catch (error) {
            console.error('Error exporting report:', error);
            this.showNotification('Failed to export report', 'error');
        }
    }

    getCSVHeaders(type) {
        switch (type) {
            case 'attendance':
            case 'late':
                return ['Student Name', 'Student ID', 'Date', 'Time', 'Session', 'Status', 'Method'];
            case 'clinic':
                return ['Student Name', 'Student ID', 'Date', 'Time', 'Reason', 'Notes', 'Outcome'];
            case 'summary':
                return ['Date', 'Present', 'Late', 'Absent', 'Attendance Rate', 'Entries', 'Exits'];
            default:
                return [];
        }
    }

    formatCSVRow(record, type) {
        switch (type) {
            case 'attendance':
            case 'late':
                const date = new Date(record.timestamp).toLocaleDateString();
                const time = new Date(record.timestamp).toTimeString().substring(0, 5);
                return [
                    `"${record.studentName || 'Unknown'}"`,
                    `"${record.studentId}"`,
                    `"${date}"`,
                    `"${time}"`,
                    `"${record.session || ''}"`,
                    `"${record.status}"`,
                    `"${record.method || 'qr'}"`
                ];
            case 'clinic':
                const clinicDate = new Date(record.visit_time).toLocaleDateString();
                const clinicTime = new Date(record.visit_time).toTimeString().substring(0, 5);
                return [
                    `"${record.studentName || 'Unknown'}"`,
                    `"${record.studentId}"`,
                    `"${clinicDate}"`,
                    `"${clinicTime}"`,
                    `"${record.reason || ''}"`,
                    `"${record.notes || ''}"`,
                    `"${record.outcome || ''}"`
                ];
            case 'summary':
                return [
                    `"${record.date}"`,
                    record.present,
                    record.late,
                    record.absent,
                    record.attendanceRate,
                    record.entries.length,
                    record.exits.length
                ];
            default:
                return [];
        }
    }

    // New helper methods for Supabase data fetching
    async getAttendanceReport(startDate, endDate) {
        try {
            const { data, error } = await window.supabaseClient
                .from('attendance')
                .select(`
                    id,
                    student_id,
                    class_id,
                    session,
                    status,
                    method,
                    timestamp,
                    recorded_by,
                    students!inner(full_name)
                `)
                .gte('timestamp', startDate.toISOString())
                .lte('timestamp', endDate.toISOString())
                .order('timestamp', { ascending: false })
                .limit(1000);
            
            if (error) throw error;
            
            // Transform data to match expected format
            return (data || []).map(record => ({
                id: record.id,
                studentId: record.student_id,
                studentName: record.students?.full_name || 'Unknown',
                classId: record.class_id,
                session: record.session,
                status: record.status,
                method: record.method,
                timestamp: record.timestamp,
                recordedBy: record.recorded_by
            }));
        } catch (error) {
            console.error('Error getting attendance report:', error);
            return [];
        }
    }

    async getLateArrivalsReport(startDate, endDate) {
        try {
            const { data, error } = await window.supabaseClient
                .from('attendance')
                .select(`
                    id,
                    student_id,
                    class_id,
                    session,
                    status,
                    method,
                    timestamp,
                    recorded_by,
                    students!inner(full_name)
                `)
                .eq('status', 'late')
                .gte('timestamp', startDate.toISOString())
                .lte('timestamp', endDate.toISOString())
                .order('timestamp', { ascending: false })
                .limit(1000);
            
            if (error) throw error;
            
            // Transform data to match expected format
            return (data || []).map(record => ({
                id: record.id,
                studentId: record.student_id,
                studentName: record.students?.full_name || 'Unknown',
                classId: record.class_id,
                session: record.session,
                status: record.status,
                method: record.method,
                timestamp: record.timestamp,
                recordedBy: record.recorded_by
            }));
        } catch (error) {
            console.error('Error getting late arrivals report:', error);
            return [];
        }
    }

    async getClinicReport(startDate, endDate) {
        try {
            const { data, error } = await window.supabaseClient
                .from('clinic_visits')
                .select(`
                    id,
                    student_id,
                    reason,
                    notes,
                    outcome,
                    visit_time,
                    treated_by,
                    students!inner(full_name)
                `)
                .gte('visit_time', startDate.toISOString())
                .lte('visit_time', endDate.toISOString())
                .order('visit_time', { ascending: false })
                .limit(1000);
            
            if (error) throw error;
            
            // Transform data to match expected format
            return (data || []).map(record => ({
                id: record.id,
                studentId: record.student_id,
                studentName: record.students?.full_name || 'Unknown',
                reason: record.reason,
                notes: record.notes,
                outcome: record.outcome,
                visit_time: record.visit_time,
                timestamp: record.visit_time, // For compatibility
                treatedBy: record.treated_by
            }));
        } catch (error) {
            console.error('Error getting clinic report:', error);
            return [];
        }
    }

    getStatusColor(status) {
        const colors = {
            'present': 'bg-green-100 text-green-800',
            'late': 'bg-yellow-100 text-yellow-800',
            'absent': 'bg-red-100 text-red-800',
            'excused': 'bg-blue-100 text-blue-800',
            'half_day': 'bg-orange-100 text-orange-800',
            'unknown': 'bg-gray-100 text-gray-800'
        };
        return colors[status] || colors.unknown;
    }

    getStatusText(status) {
        const texts = {
            'present': 'Present',
            'late': 'Late',
            'absent': 'Absent',
            'excused': 'Excused',
            'half_day': 'Half Day',
            'unknown': 'Unknown'
        };
        return texts[status] || texts.unknown;
    }

    showNotification(message, type = 'info') {
        if (window.EducareTrack && typeof window.EducareTrack.showNormalNotification === 'function') {
            window.EducareTrack.showNormalNotification({ title: type === 'error' ? 'Error' : 'Info', message, type });
        }
    }
}

// Global functions
function generateReport() {
    if (window.guardReports) {
        window.guardReports.generateReport();
    }
}

function exportReport() {
    if (window.guardReports) {
        window.guardReports.exportReport();
    }
}

function logout() {
    EducareTrack.logout();
    window.location.href = '../index.html';
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    window.guardReports = new GuardReports();
});
