// Enhanced clinic-reports.js - COMPLETE ANALYTICS
class ClinicReports {
    constructor() {
        this.currentUser = null;
        this.visits = [];
        this.charts = {};
        this.currentReport = null;
        
        this.init();
    }

    async init() {
        try {
            await this.checkAuth();
            await this.loadVisits();
            this.setupEventListeners();
            this.generateReport(); // Generate initial report
            console.log('Clinic Reports initialized');
        } catch (error) {
            console.error('Error initializing clinic reports:', error);
            this.showError('Failed to initialize clinic reports');
        }
    }

    async checkAuth() {
        const savedUser = localStorage.getItem('educareTrack_user');
        if (!savedUser) {
            window.location.href = '../index.html';
            return;
        }

        this.currentUser = JSON.parse(savedUser);
        if (this.currentUser.role !== 'clinic') {
            window.location.href = '../index.html';
            return;
        }

        document.getElementById('userName').textContent = this.currentUser.name;
    }

    async loadVisits() {
        try {
            if (window.USE_SUPABASE && window.supabaseClient) {
                const { data, error } = await window.supabaseClient
                    .from('clinicVisits')
                    .select('id,studentId,classId,checkIn,timestamp,reason,notes')
                    .order('timestamp', { ascending: false });
                if (error) {
                    throw error;
                }
                this.visits = (data || []).map(v => ({
                    id: v.id,
                    ...v,
                    timestamp: v.timestamp ? new Date(v.timestamp) : new Date()
                }));
            } else {
                const snapshot = await firebase.firestore()
                    .collection('clinicVisits')
                    .orderBy('timestamp', 'desc')
                    .get();
                this.visits = snapshot.docs.map(doc => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        ...data,
                        timestamp: data.timestamp?.toDate() || new Date()
                    };
                });
            }
        } catch (error) {
            console.error('Error loading visits:', error);
            this.showError('Failed to load clinic visits');
        }
    }

    setupEventListeners() {
        // Set default dates (last 30 days)
        const today = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(today.getDate() - 30);
        
        document.getElementById('reportDateFrom').value = thirtyDaysAgo.toISOString().split('T')[0];
        document.getElementById('reportDateTo').value = today.toISOString().split('T')[0];
    }

    generateReport() {
        const reportType = document.getElementById('reportType').value;
        const dateFrom = document.getElementById('reportDateFrom').value ? new Date(document.getElementById('reportDateFrom').value) : null;
        const dateTo = document.getElementById('reportDateTo').value ? new Date(document.getElementById('reportDateTo').value) : null;

        // Filter visits by date range
        let filteredVisits = this.visits;
        if (dateFrom && dateTo) {
            filteredVisits = this.visits.filter(visit => {
                const visitDate = new Date(visit.timestamp);
                return visitDate >= dateFrom && visitDate <= dateTo;
            });
        }

        this.currentReport = {
            type: reportType,
            dateFrom,
            dateTo,
            data: filteredVisits
        };

        this.updateStatistics(filteredVisits);
        this.generateCharts(filteredVisits);
        this.generateDetailedReport(filteredVisits, reportType);
    }

    updateStatistics(visits) {
        const totalVisits = visits.length;
        const uniqueStudents = new Set(visits.map(v => v.studentId)).size;
        
        // Calculate average visit time
        const checkInOutPairs = this.calculateVisitDurations(visits);
        const avgVisitTime = this.calculateAverageVisitTime(checkInOutPairs);
        
        // Find top reason
        const reasonCounts = {};
        visits.forEach(visit => {
            reasonCounts[visit.reason] = (reasonCounts[visit.reason] || 0) + 1;
        });
        const topReason = Object.keys(reasonCounts).reduce((a, b) => 
            reasonCounts[a] > reasonCounts[b] ? a : 'N/A'
        );

        document.getElementById('totalVisitsStat').textContent = totalVisits;
        document.getElementById('uniqueStudentsStat').textContent = uniqueStudents;
        document.getElementById('avgVisitTime').textContent = avgVisitTime;
        document.getElementById('topReason').textContent = this.capitalizeFirstLetter(topReason);
    }

    calculateVisitDurations(visits) {
        const studentVisits = {};
        
        // Group visits by student
        visits.forEach(visit => {
            if (!studentVisits[visit.studentId]) {
                studentVisits[visit.studentId] = [];
            }
            studentVisits[visit.studentId].push(visit);
        });

        const pairs = [];
        
        // Find check-in/check-out pairs
        Object.values(studentVisits).forEach(studentVisitList => {
            const sortedVisits = studentVisitList.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            
            for (let i = 0; i < sortedVisits.length - 1; i++) {
                if (sortedVisits[i].checkIn && !sortedVisits[i + 1].checkIn) {
                    const checkInTime = new Date(sortedVisits[i].timestamp);
                    const checkOutTime = new Date(sortedVisits[i + 1].timestamp);
                    const duration = (checkOutTime - checkInTime) / (1000 * 60); // minutes
                    
                    pairs.push({
                        studentId: sortedVisits[i].studentId,
                        studentName: sortedVisits[i].studentName,
                        checkInTime: checkInTime,
                        checkOutTime: checkOutTime,
                        duration: duration,
                        reason: sortedVisits[i].reason
                    });
                    
                    i++; // Skip the next visit since it's paired
                }
            }
        });
        
        return pairs;
    }

    calculateAverageVisitTime(pairs) {
        if (pairs.length === 0) return '0m';
        
        const totalMinutes = pairs.reduce((sum, pair) => sum + pair.duration, 0);
        const averageMinutes = totalMinutes / pairs.length;
        
        if (averageMinutes < 60) {
            return `${Math.round(averageMinutes)}m`;
        } else {
            const hours = Math.floor(averageMinutes / 60);
            const minutes = Math.round(averageMinutes % 60);
            return `${hours}h ${minutes}m`;
        }
    }

    generateCharts(visits) {
        this.generateReasonsChart(visits);
        this.generateDailyTrendChart(visits);
        this.generateTimeDistributionChart(visits);
    }

    generateReasonsChart(visits) {
        const ctx = document.getElementById('reasonsChart').getContext('2d');
        
        // Count visits by reason
        const reasonCounts = {};
        visits.forEach(visit => {
            reasonCounts[visit.reason] = (reasonCounts[visit.reason] || 0) + 1;
        });

        const reasons = Object.keys(reasonCounts);
        const counts = Object.values(reasonCounts);

        // Destroy existing chart
        if (this.charts.reasons) {
            this.charts.reasons.destroy();
        }

        this.charts.reasons = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: reasons.map(r => this.capitalizeFirstLetter(r)),
                datasets: [{
                    data: counts,
                    backgroundColor: [
                        '#3B82F6', '#EF4444', '#10B981', '#F59E0B',
                        '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16',
                        '#F97316', '#6366F1', '#8B5CF6', '#EC4899'
                    ],
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 20,
                            usePointStyle: true
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.raw || 0;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = Math.round((value / total) * 100);
                                return `${label}: ${value} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    generateDailyTrendChart(visits) {
        const ctx = document.getElementById('dailyTrendChart').getContext('2d');
        
        // Group visits by date
        const dailyCounts = {};
        visits.forEach(visit => {
            const date = new Date(visit.timestamp).toLocaleDateString();
            dailyCounts[date] = (dailyCounts[date] || 0) + 1;
        });

        const dates = Object.keys(dailyCounts).sort((a, b) => new Date(a) - new Date(b));
        const counts = dates.map(date => dailyCounts[date]);

        // Destroy existing chart
        if (this.charts.dailyTrend) {
            this.charts.dailyTrend.destroy();
        }

        this.charts.dailyTrend = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates.map(date => new Date(date).toLocaleDateString()),
                datasets: [{
                    label: 'Daily Visits',
                    data: counts,
                    borderColor: '#3B82F6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#3B82F6',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 7
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.1)'
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        }
                    }
                }
            }
        });
    }

    generateTimeDistributionChart(visits) {
        // This would replace one of the existing charts for time analysis
        console.log('Time distribution chart would be implemented here');
    }

    generateDetailedReport(visits, reportType) {
        const reportContent = document.getElementById('reportContent');
        
        switch (reportType) {
            case 'daily':
                reportContent.innerHTML = this.generateDailyReport(visits);
                break;
            case 'weekly':
                reportContent.innerHTML = this.generateWeeklyReport(visits);
                break;
            case 'monthly':
                reportContent.innerHTML = this.generateMonthlyReport(visits);
                break;
            case 'reasons':
                reportContent.innerHTML = this.generateReasonsReport(visits);
                break;
            case 'students':
                reportContent.innerHTML = this.generateStudentsReport(visits);
                break;
            default:
                reportContent.innerHTML = this.generateDailyReport(visits);
        }
    }

    generateDailyReport(visits) {
        const today = new Date().toDateString();
        const todaysVisits = visits.filter(visit => 
            new Date(visit.timestamp).toDateString() === today
        );

        const checkIns = todaysVisits.filter(v => v.checkIn).length;
        const checkOuts = todaysVisits.filter(v => !v.checkIn).length;

        return `
            <div class="space-y-6">
                <div class="flex justify-between items-center">
                    <h4 class="text-lg font-semibold text-gray-800">Daily Summary - ${new Date().toLocaleDateString()}</h4>
                    <span class="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-semibold">
                        ${todaysVisits.length} Total Activities
                    </span>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div class="bg-blue-50 p-4 rounded-lg border border-blue-200">
                        <h5 class="font-semibold text-blue-800">Total Activities</h5>
                        <p class="text-2xl font-bold text-blue-600">${todaysVisits.length}</p>
                    </div>
                    <div class="bg-green-50 p-4 rounded-lg border border-green-200">
                        <h5 class="font-semibold text-green-800">Check-ins</h5>
                        <p class="text-2xl font-bold text-green-600">${checkIns}</p>
                    </div>
                    <div class="bg-red-50 p-4 rounded-lg border border-red-200">
                        <h5 class="font-semibold text-red-800">Check-outs</h5>
                        <p class="text-2xl font-bold text-red-600">${checkOuts}</p>
                    </div>
                </div>

                <div class="bg-white border border-gray-200 rounded-lg p-4">
                    <h5 class="font-semibold text-gray-800 mb-3">Today's Activity Breakdown</h5>
                    <div class="space-y-3">
                        ${this.generateActivityBreakdown(todaysVisits)}
                    </div>
                </div>
            </div>
        `;
    }

    generateActivityBreakdown(visits) {
        if (visits.length === 0) {
            return '<p class="text-gray-500 text-center py-4">No activities today</p>';
        }

        const reasonStats = {};
        visits.forEach(visit => {
            reasonStats[visit.reason] = (reasonStats[visit.reason] || 0) + 1;
        });

        return Object.entries(reasonStats)
            .sort(([,a], [,b]) => b - a)
            .map(([reason, count]) => `
                <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                    <div class="flex items-center space-x-3">
                        <div class="w-3 h-3 bg-blue-500 rounded-full"></div>
                        <span class="font-medium">${this.capitalizeFirstLetter(reason)}</span>
                    </div>
                    <span class="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-semibold">
                        ${count} ${count === 1 ? 'visit' : 'visits'}
                    </span>
                </div>
            `).join('');
    }

    generateWeeklyReport(visits) {
        const weeklyData = this.groupVisitsByWeek(visits);
        const weekLabels = Object.keys(weeklyData).sort();
        
        const weeklyStats = weekLabels.map(week => {
            const weekVisits = weeklyData[week];
            return {
                week: week,
                total: weekVisits.length,
                checkIns: weekVisits.filter(v => v.checkIn).length,
                checkOuts: weekVisits.filter(v => !v.checkIn).length,
                uniqueStudents: new Set(weekVisits.map(v => v.studentId)).size
            };
        });

        return `
            <div class="space-y-6">
                <h4 class="text-lg font-semibold text-gray-800">Weekly Trends Analysis</h4>
                
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    ${weeklyStats.slice(-4).map(stat => `
                        <div class="bg-white border border-gray-200 rounded-lg p-4">
                            <h5 class="font-semibold text-gray-700 text-sm">Week of ${new Date(stat.week).toLocaleDateString()}</h5>
                            <p class="text-2xl font-bold text-blue-600 mt-2">${stat.total}</p>
                            <p class="text-xs text-gray-600">Total Visits</p>
                            <div class="flex justify-between text-xs text-gray-500 mt-2">
                                <span>${stat.checkIns} in</span>
                                <span>${stat.checkOuts} out</span>
                                <span>${stat.uniqueStudents} students</span>
                            </div>
                        </div>
                    `).join('')}
                </div>

                <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div class="flex">
                        <div class="flex-shrink-0">
                            <svg class="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                                <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                            </svg>
                        </div>
                        <div class="ml-3">
                            <h3 class="text-sm font-medium text-yellow-800">Weekly Analysis</h3>
                            <div class="mt-2 text-sm text-yellow-700">
                                <p>This report shows clinic activity patterns across weeks. Look for trends in visit volumes and common reasons.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    generateMonthlyReport(visits) {
        const monthlyData = this.groupVisitsByMonth(visits);
        const monthLabels = Object.keys(monthlyData).sort();
        
        return `
            <div class="space-y-6">
                <h4 class="text-lg font-semibold text-gray-800">Monthly Clinic Analysis</h4>
                
                <div class="bg-white border border-gray-200 rounded-lg p-6">
                    <h5 class="font-semibold text-gray-800 mb-4">Monthly Visit Summary</h5>
                    <div class="space-y-4">
                        ${monthLabels.map(month => {
                            const monthVisits = monthlyData[month];
                            const uniqueStudents = new Set(monthVisits.map(v => v.studentId)).size;
                            const checkIns = monthVisits.filter(v => v.checkIn).length;
                            
                            return `
                                <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                                    <div>
                                        <span class="font-medium">${month}</span>
                                        <p class="text-sm text-gray-600">${uniqueStudents} unique students</p>
                                    </div>
                                    <div class="text-right">
                                        <span class="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-semibold">
                                            ${monthVisits.length} visits
                                        </span>
                                        <p class="text-xs text-gray-600 mt-1">${checkIns} check-ins</p>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>

                <div class="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <p class="text-purple-800 text-sm">
                        <strong>Monthly Insights:</strong> This report provides a comprehensive view of clinic utilization patterns over time. 
                        Use this data to identify seasonal trends and resource planning needs.
                    </p>
                </div>
            </div>
        `;
    }

    generateReasonsReport(visits) {
        const reasonCounts = {};
        visits.forEach(visit => {
            reasonCounts[visit.reason] = (reasonCounts[visit.reason] || 0) + 1;
        });

        const sortedReasons = Object.entries(reasonCounts)
            .sort(([,a], [,b]) => b - a);

        const totalVisits = visits.length;

        return `
            <div class="space-y-6">
                <div class="flex justify-between items-center">
                    <h4 class="text-lg font-semibold text-gray-800">Common Visit Reasons Analysis</h4>
                    <span class="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-semibold">
                        ${totalVisits} Total Visits Analyzed
                    </span>
                </div>
                
                <div class="space-y-4">
                    ${sortedReasons.map(([reason, count]) => {
                        const percentage = ((count / totalVisits) * 100).toFixed(1);
                        const width = Math.max(10, (count / sortedReasons[0][1]) * 100);
                        
                        return `
                            <div class="bg-white border border-gray-200 rounded-lg p-4">
                                <div class="flex justify-between items-center mb-2">
                                    <span class="font-medium">${this.capitalizeFirstLetter(reason)}</span>
                                    <span class="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-semibold">
                                        ${count} visits (${percentage}%)
                                    </span>
                                </div>
                                <div class="w-full bg-gray-200 rounded-full h-2">
                                    <div class="bg-blue-600 h-2 rounded-full" style="width: ${width}%"></div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    generateStudentsReport(visits) {
        const studentCounts = {};
        visits.forEach(visit => {
            studentCounts[visit.studentId] = studentCounts[visit.studentId] || { 
                name: visit.studentName, 
                count: 0,
                lastVisit: visit.timestamp
            };
            studentCounts[visit.studentId].count++;
            
            // Update last visit if this one is more recent
            if (new Date(visit.timestamp) > new Date(studentCounts[visit.studentId].lastVisit)) {
                studentCounts[visit.studentId].lastVisit = visit.timestamp;
            }
        });

        const frequentVisitors = Object.values(studentCounts)
            .sort((a, b) => b.count - a.count)
            .slice(0, 15);

        return `
            <div class="space-y-6">
                <div class="flex justify-between items-center">
                    <h4 class="text-lg font-semibold text-gray-800">Frequent Clinic Visitors</h4>
                    <span class="bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm font-semibold">
                        Top ${frequentVisitors.length} Students
                    </span>
                </div>
                
                <div class="space-y-3">
                    ${frequentVisitors.map((student, index) => {
                        const lastVisit = new Date(student.lastVisit).toLocaleDateString();
                        const rank = index + 1;
                        const rankColor = rank <= 3 ? 'bg-red-500' : rank <= 6 ? 'bg-yellow-500' : 'bg-blue-500';
                        
                        return `
                            <div class="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg">
                                <div class="flex items-center space-x-4">
                                    <div class="${rankColor} text-white w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold">
                                        ${rank}
                                    </div>
                                    <div>
                                        <h4 class="text-sm font-medium text-gray-900">${student.name}</h4>
                                        <p class="text-xs text-gray-600">Last visit: ${lastVisit}</p>
                                    </div>
                                </div>
                                <span class="bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm font-semibold">
                                    ${student.count} visits
                                </span>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    groupVisitsByWeek(visits) {
        const weeklyGroups = {};
        visits.forEach(visit => {
            const date = new Date(visit.timestamp);
            const weekStart = new Date(date);
            weekStart.setDate(date.getDate() - date.getDay());
            weekStart.setHours(0, 0, 0, 0);
            const weekKey = weekStart.toISOString().split('T')[0];
            
            weeklyGroups[weekKey] = weeklyGroups[weekKey] || [];
            weeklyGroups[weekKey].push(visit);
        });
        return weeklyGroups;
    }

    groupVisitsByMonth(visits) {
        const monthlyGroups = {};
        visits.forEach(visit => {
            const date = new Date(visit.timestamp);
            const monthKey = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
            
            monthlyGroups[monthKey] = monthlyGroups[monthKey] || [];
            monthlyGroups[monthKey].push(visit);
        });
        return monthlyGroups;
    }

    exportReport() {
        if (!this.currentReport) {
            this.showNotification('No report to export', 'error');
            return;
        }

        // Create CSV content
        const headers = ['Date', 'Time', 'Student Name', 'Type', 'Reason', 'Notes', 'Staff'];
        const csvData = this.currentReport.data.map(visit => {
            const date = new Date(visit.timestamp).toLocaleDateString();
            const time = new Date(visit.timestamp).toLocaleTimeString();
            return [
                date,
                time,
                visit.studentName,
                visit.checkIn ? 'Check-in' : 'Check-out',
                visit.reason,
                visit.notes || '',
                visit.staffName || ''
            ];
        });

        const csvContent = [headers, ...csvData]
            .map(row => row.map(field => `"${field}"`).join(','))
            .join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `clinic-report-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);

        this.showNotification('Report exported successfully', 'success');
    }

    printReport() {
        window.print();
    }

    // Utility Methods
    capitalizeFirstLetter(string) {
        return string ? string.charAt(0).toUpperCase() + string.slice(1) : 'N/A';
    }

    showNotification(message, type = 'info') {
        if (window.EducareTrack && typeof window.EducareTrack.showNormalNotification === 'function') {
            window.EducareTrack.showNormalNotification({ title: type === 'error' ? 'Error' : 'Info', message, type });
        }
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    destroy() {
        // Clean up charts
        Object.values(this.charts).forEach(chart => {
            if (chart && typeof chart.destroy === 'function') {
                chart.destroy();
            }
        });
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    window.clinicReports = new ClinicReports();
});
