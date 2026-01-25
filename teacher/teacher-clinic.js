// Teacher Clinic Dashboard Functionality
class TeacherClinicDashboard {
    constructor() {
        this.teacher = null;
        this.classId = null;
        this.students = [];
        this.activeVisits = [];
        this.clinicHistory = [];
        this.init();
    }

    async init() {
        // Check authentication and role
        await this.checkAuth();
        
        // Load teacher data and class information
        await this.loadTeacherData();
        
        // Set up real-time listeners
        this.setupRealTimeListeners();
        
        // Initial data load
        await this.loadInitialData();
        
        // Update UI
        this.updateUI();
    }

    async checkAuth() {
        const user = JSON.parse(localStorage.getItem('educareTrack_user'));
        if (!user || user.role !== 'teacher') {
            window.location.href = '../index.html';
            return;
        }
        this.teacher = user;
    }

    async loadTeacherData() {
        try {
            // Get teacher details from Supabase (profiles)
            const { data: profile, error } = await window.supabaseClient
                .from('profiles')
                .select('full_name')
                .eq('id', this.teacher.id)
                .single();
                
            if (error) throw error;
            
            // Get class where teacher is adviser
            const { data: classData, error: classErr } = await window.supabaseClient
                .from('classes')
                .select('id')
                .eq('adviser_id', this.teacher.id)
                .single();

            if (profile) {
                if (classData) {
                    this.classId = classData.id;
                }
                
                // Update teacher name in UI
                const name = profile.full_name || 'Unknown Teacher';
                document.getElementById('teacherName').textContent = name;
            }
            
            // Load students for this teacher's class
            await this.loadStudents();
        } catch (error) {
            console.error('Error loading teacher data:', error);
            this.showToast('Error loading teacher information', 'error');
        }
    }

    async loadStudents() {
        try {
            const { data: students, error } = await window.supabaseClient
                .from('students')
                .select('*')
                .eq('class_id', this.classId);
                
            if (error) throw error;
                
            this.students = (students || []).map(doc => ({
                id: doc.id,
                ...doc,
                name: doc.full_name || doc.name,
                grade: doc.grade
            }));
        } catch (error) {
            console.error('Error loading students:', error);
            this.showToast('Error loading student information', 'error');
        }
    }

    setupRealTimeListeners() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
        }
        this.pollTimer = setInterval(async () => {
            try {
                await this.loadInitialData();
            } catch (e) {
                console.error('Polling error:', e);
            }
        }, 15000);
    }

    async loadInitialData() {
        try {
            const studentIds = this.students.map(s => s.id);
            if (studentIds.length === 0) {
                this.activeVisits = [];
                this.clinicHistory = [];
                this.updateStats();
                this.updateUI();
                return;
            }

            // Load active clinic visits (visits in the last 4 hours since there's no check_in/check_out)
            const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
            const { data: activeVisits, error: activeError } = await window.supabaseClient
                .from('clinic_visits')
                .select('*')
                .in('student_id', studentIds)
                .gte('visit_time', fourHoursAgo.toISOString())
                .order('visit_time', { ascending: false });

            if (activeError) throw activeError;
                
            this.activeVisits = (activeVisits || []).map(visit => this.mapVisitData(visit));

            // Load recent clinic history (last 30 days)
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            
            const { data: history, error: historyError } = await window.supabaseClient
                .from('clinic_visits')
                .select('*')
                .in('student_id', studentIds)
                .gte('visit_time', thirtyDaysAgo.toISOString())
                .order('visit_time', { ascending: false })
                .limit(50);
                
            if (historyError) throw historyError;

            this.clinicHistory = (history || []).map(visit => this.mapVisitData(visit));

            // Update stats
            this.updateStats();
            this.updateUI();
            
        } catch (error) {
            console.error('Error loading initial data:', error);
            this.showToast('Error loading clinic data', 'error');
        }
    }

    mapVisitData(visit) {
        return {
            id: visit.id,
            ...visit,
            studentId: visit.student_id,
            checkIn: true, // Default since field doesn't exist
            checkOut: false, // Default since field doesn't exist
            teacherDecision: visit.teacher_decision,
            teacherNotes: visit.teacher_notes,
            isUrgent: visit.is_urgent,
            nurseRecommendation: visit.nurse_recommendation,
            staffId: visit.treated_by,
            timestamp: new Date(visit.visit_time)
        };
    }

    async saveDecision(visitId) {
        const visit = this.activeVisits.find(v => v.id === visitId);
        if (!visit) return;
        
        const decision = document.querySelector('input[name="disposition"]:checked');
        const teacherNotes = document.getElementById('teacherNotes').value;
        
        if (!decision) {
            this.showToast('Please select a disposition', 'warning');
            return;
        }
        
        try {
            // Update the clinic visit with teacher decision
            const { error: updateError } = await window.supabaseClient
                .from('clinic_visits')
                .update({
                    teacher_decision: decision.value,
                    teacher_notes: teacherNotes,
                    teacher_decision_at: new Date().toISOString(),
                    teacher_id: this.teacher.id
                })
                .eq('id', visitId);

            if (updateError) throw updateError;
            
            // Create notification for clinic staff
            const student = this.students.find(s => s.id === visit.studentId);
            
            const { error: notifyError } = await window.supabaseClient
                .from('notifications')
                .insert([{
                    type: 'clinic_decision',
                    title: 'Teacher Authorization Received',
                    message: `${this.teacher.name} has authorized ${student ? student.name : 'student'} to be ${decision.value === 'send_home' ? 'sent home' : 'kept in clinic'}`,
                    target_users: [visit.staffId],
                    student_id: visit.studentId,
                    student_name: student ? student.name : 'Unknown',
                    related_record: visitId,
                    created_at: new Date().toISOString()
                }]);

            if (notifyError) throw notifyError;
            
            this.showToast('Decision saved successfully', 'success');
            this.clearDecisionPanel();
            await this.loadInitialData();
            
        } catch (error) {
            console.error('Error saving decision:', error);
            this.showToast('Error saving decision', 'error');
        }
    }

    showClinicNotification(notification) {
        this.showToast(notification.message, 'info');
        
        // If it's about a student currently in clinic, refresh the active visits
        if (notification.type === 'clinic') {
            this.loadInitialData();
        }
    }

    async markNotificationAsRead(notificationId) {
        try {
            const { data: notif, error: fetchError } = await window.supabaseClient
                .from('notifications')
                .select('read_by')
                .eq('id', notificationId)
                .single();
                
            if (fetchError) return;

            const readBy = notif.read_by || [];
            if (!readBy.includes(this.teacher.id)) {
                readBy.push(this.teacher.id);
                
                await window.supabaseClient
                    .from('notifications')
                    .update({ read_by: readBy })
                    .eq('id', notificationId);
            }
        } catch (error) {
            console.error('Error marking notification as read:', error);
        }
    }

    calculateDuration(startTime) {
        const now = new Date();
        const diffMs = now - startTime;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        
        if (diffHours > 0) {
            return `${diffHours}h ${diffMins % 60}m`;
        } else {
            return `${diffMins}m`;
        }
    }

    showToast(message, type = 'info') {
        if (window.EducareTrack && typeof window.EducareTrack.showNormalNotification === 'function') {
            window.EducareTrack.showNormalNotification({ title: type === 'error' ? 'Error' : 'Info', message, type });
        }
    }

    updateUI() {
        this.updateActiveVisitsList();
        this.updateHistoryTable();
    }

    updateHistoryTable() {
        const tbody = document.getElementById('visitHistoryTable');
        
        if (this.clinicHistory.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="px-4 py-8 text-center text-gray-500">
                        <i class="fas fa-clipboard-list text-3xl mb-2 block"></i>
                        No clinic visit history found
                    </td>
                </tr>
            `;
            return;
        }
        
        tbody.innerHTML = this.clinicHistory.map(visit => {
            const student = this.students.find(s => s.id === visit.studentId);
            const visitDate = visit.timestamp; // Already a Date object from mapVisitData
            const timeString = visitDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            const dateString = visitDate.toLocaleDateString();
            
            let statusBadge = '';
            if (visit.checkIn && !visit.checkOut) {
                statusBadge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">In Clinic</span>';
            } else if (visit.teacherDecision === 'send_home') {
                statusBadge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Sent Home</span>';
            } else {
                statusBadge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Returned to Class</span>';
            }
            
            return `
                <tr class="hover:bg-gray-50">
                    <td class="px-4 py-3 whitespace-nowrap">
                        <div class="font-medium">${student ? student.name : 'Unknown'}</div>
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap">
                        <div>${dateString}</div>
                        <div class="text-sm text-gray-500">${timeString}</div>
                    </td>
                    <td class="px-4 py-3">
                        <div class="text-sm">${visit.reason || 'Not specified'}</div>
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap">
                        ${statusBadge}
                    </td>
                </tr>
            `;
        }).join('');
    }
}

// Initialize the dashboard when the page loads
let clinicDashboard;
document.addEventListener('DOMContentLoaded', () => {
    clinicDashboard = new TeacherClinicDashboard();
});
