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
            teacherDecision: visit.outcome,
            teacherNotes: visit.remarks,
            isUrgent: visit.is_urgent,
            nurseRecommendation: visit.nurse_recommendation,
            staffId: visit.treated_by,
            timestamp: new Date(visit.visit_time)
        };
    }

    async notifyClinicStaff(visit, decisionValue) {
        try {
            const student = this.students.find(s => s.id === visit.studentId);
            
            const { error: notifyError } = await window.supabaseClient
                .from('notifications')
                .insert([{
                    type: 'clinic_decision',
                    title: 'Teacher Authorization Received',
                    message: `${this.teacher.name} has authorized ${student ? student.name : 'student'} to be ${decisionValue === 'send_home' ? 'sent home' : 'returned to class'}`,
                    target_users: [visit.staffId], // Assuming staffId is available from the visit record
                    student_id: visit.studentId,
                    student_name: student ? student.name : 'Unknown',
                    related_record: visit.id,
                    created_at: new Date().toISOString()
                }]);

            if (notifyError) throw notifyError;
        } catch (error) {
            console.error('Error notifying clinic staff:', error);
        }
    }

    async saveDecision(visitId) {
        try {
            const modal = document.getElementById('decisionModal');
            if (!modal) return;
            
            const dispositionInput = modal.querySelector('input[name="disposition"]:checked');
            if (!dispositionInput) {
                this.showToast('Please select a disposition', 'error');
                return;
            }
            const disposition = dispositionInput.value;
            const notes = modal.querySelector('#teacherNotes').value;
            
            this.showToast('Submitting decision...', 'info');
            
            const visit = this.activeVisits.find(v => v.id === visitId);
            if (!visit) throw new Error('Visit not found');

            // Update clinic visit
            const { error: updateError } = await window.supabaseClient
                .from('clinic_visits')
                .update({
                    outcome: disposition,
                    remarks: notes,
                    teacher_decision_time: new Date().toISOString()
                })
                .eq('id', visitId);

            if (updateError) throw updateError;

            // Update student status based on decision
            let newStatus = 'in_clinic'; // Default
            if (disposition === 'return_to_class') {
                newStatus = 'in_school';
            } else if (disposition === 'send_home') {
                newStatus = 'out_school';
            }

            if (newStatus !== 'in_clinic') {
                const { error: statusError } = await window.supabaseClient
                    .from('students')
                    .update({ current_status: newStatus })
                    .eq('id', visit.studentId);
                
                if (statusError) console.error('Error updating student status:', statusError);
            }

            // Notify Clinic Staff
            await this.notifyClinicStaff(visit, disposition);
            
            // Notify Parents
            const student = this.students.find(s => s.id === visit.studentId);
            await this.notifyParents(visit.studentId, disposition, student ? student.name : 'Student', notes);

            this.showToast('Decision submitted successfully', 'success');
            this.closeDecisionModal();
            this.loadInitialData(); // Refresh list

        } catch (error) {
            console.error('Error saving decision:', error);
            this.showToast('Error submitting decision', 'error');
        }
    }

    closeDecisionModal() {
        // Since there is no modal in the HTML provided, we might be using an inline panel or a modal that needs to be created.
        // Looking at the debris, it seems there might have been a 'clearDecisionPanel' or similar.
        // However, looking at the HTML structure, there isn't an obvious modal container.
        // Let's assume we need to implement a modal or check if I missed reading part of the HTML.
        // For now, I'll implement a basic hidden toggle if an element exists, or just log it.
        // Actually, let's look at how active visits are rendered. If they have a "Respond" button, it might open a modal.
        const modal = document.getElementById('decisionModal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
        
        // Also clear form
        const form = document.getElementById('decisionForm');
        if (form) form.reset();
    }

    updateStats() {
        document.getElementById('currentInClinic').textContent = this.activeVisits.length;
        document.getElementById('pendingDecisions').textContent = this.activeVisits.filter(v => !v.teacherDecision).length;
        document.getElementById('todaysVisits').textContent = this.clinicHistory.filter(v => {
            const today = new Date();
            const visitDate = new Date(v.timestamp);
            return visitDate.getDate() === today.getDate() && 
                   visitDate.getMonth() === today.getMonth() && 
                   visitDate.getFullYear() === today.getFullYear();
        }).length;
    }

    updateActiveVisitsList() {
        const container = document.getElementById('activeVisitsList');
        if (!container) return;

        if (this.activeVisits.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <i class="fas fa-user-md text-4xl mb-2"></i>
                    <p>No students currently in the clinic</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.activeVisits.map(visit => {
            const student = this.students.find(s => s.id === visit.studentId);
            const visitTime = new Date(visit.timestamp);
            const duration = this.calculateDuration(visitTime);
            
            return `
                <div class="border rounded-lg p-4 mb-4 bg-blue-50">
                    <div class="flex justify-between items-start">
                        <div>
                            <h3 class="font-bold text-lg text-blue-800">${student ? student.name : 'Unknown Student'}</h3>
                            <p class="text-sm text-gray-600">
                                <i class="far fa-clock mr-1"></i> Arrived: ${visitTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} (${duration})
                            </p>
                            <p class="text-sm text-gray-600 mt-1">
                                <span class="font-semibold">Reason:</span> ${visit.reason || 'Not specified'}
                            </p>
                            ${visit.nurseRecommendation ? `
                                <div class="mt-2 p-2 bg-yellow-100 rounded text-sm text-yellow-800">
                                    <i class="fas fa-user-nurse mr-1"></i>
                                    <strong>Nurse Recommendation:</strong> ${visit.nurseRecommendation}
                                </div>
                            ` : ''}
                        </div>
                        <button onclick="window.clinicDashboard.openDecisionModal('${visit.id}')" 
                                class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded shadow-sm text-sm font-medium transition">
                            Respond
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    openDecisionModal(visitId) {
        const visit = this.activeVisits.find(v => v.id === visitId);
        if (!visit) return;
        
        // We need to inject the modal into the DOM if it doesn't exist, or use an existing one.
        // Let's create the modal dynamically if it doesn't exist to ensure it works with the HTML.
        let modal = document.getElementById('decisionModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'decisionModal';
            modal.className = 'fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center z-50';
            modal.innerHTML = `
                <div class="bg-white rounded-lg w-full max-w-md p-6">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-lg font-bold text-gray-800">Teacher Decision</h3>
                        <button onclick="window.clinicDashboard.closeDecisionModal()" class="text-gray-500 hover:text-gray-700">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="mb-4">
                        <p class="text-sm text-gray-600 mb-2">Student: <span id="modalStudentName" class="font-semibold"></span></p>
                        <p class="text-sm text-gray-600 mb-4">Reason: <span id="modalReason"></span></p>
                        
                        <label class="block text-sm font-medium text-gray-700 mb-2">Disposition</label>
                        <div class="space-y-2 mb-4">
                            <label class="flex items-center space-x-2 p-2 border rounded hover:bg-gray-50 cursor-pointer">
                                <input type="radio" name="disposition" value="return_to_class" class="text-blue-600" checked>
                                <span>Return to Class</span>
                            </label>
                            <label class="flex items-center space-x-2 p-2 border rounded hover:bg-gray-50 cursor-pointer">
                                <input type="radio" name="disposition" value="send_home" class="text-red-600">
                                <span>Send Home (Urgent)</span>
                            </label>
                        </div>
                        
                        <label class="block text-sm font-medium text-gray-700 mb-1">Notes / Instructions</label>
                        <textarea id="teacherNotes" class="w-full border border-gray-300 rounded-lg p-2 h-24" placeholder="Enter notes for the clinic staff and parents..."></textarea>
                    </div>
                    <div class="flex justify-end space-x-3">
                        <button onclick="window.clinicDashboard.closeDecisionModal()" class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                        <button onclick="window.clinicDashboard.saveDecision('${visitId}')" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Submit Decision</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        } else {
             // Update the save button's onclick
             const saveBtn = modal.querySelector('button[onclick^="window.clinicDashboard.saveDecision"]');
             if (saveBtn) saveBtn.setAttribute('onclick', `window.clinicDashboard.saveDecision('${visitId}')`);
        }
        
        const student = this.students.find(s => s.id === visit.studentId);
        modal.querySelector('#modalStudentName').textContent = student ? student.name : 'Unknown';
        modal.querySelector('#modalReason').textContent = visit.reason || 'Not specified';
        
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    async notifyParents(studentId, decision, studentName, notes) {
        try {
            // Get parents
            const { data: relations, error: relError } = await window.supabaseClient
                .from('parent_students')
                .select('parent_id')
                .eq('student_id', studentId);

            if (relError || !relations || relations.length === 0) return;

            const parentIds = relations.map(r => r.parent_id);
            
            let message = '';
            if (decision === 'send_home') {
                message = `Urgent: ${studentName} has been authorized to be sent home from the clinic.`;
            } else {
                message = `${studentName} visited the clinic and has been authorized to return to class.`;
            }
            
            if (notes) {
                message += ` Teacher notes: ${notes}`;
            }

            const { error } = await window.supabaseClient
                .from('notifications')
                .insert({
                    target_users: parentIds,
                    title: 'Clinic Visit Update',
                    message: message,
                    type: 'clinic_update',
                    student_id: studentId,
                    student_name: studentName,
                    is_urgent: decision === 'send_home',
                    created_at: new Date().toISOString()
                });

            if (error) console.error('Error notifying parents:', error);
            else console.log('Parents notified');

        } catch (error) {
            console.error('Error in notifyParents:', error);
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

    async notifyParent(visitId) {
        try {
            const visit = this.clinicHistory.find(v => v.id === visitId);
            if (!visit) return;

            if (!confirm(`Notify parents about ${visit.reason}?`)) return;

            // Get parent-student relationship
            const { data: relationshipData, error: relationshipError } = await window.supabaseClient
                .from('parent_students')
                .select('parent_id')
                .eq('student_id', visit.studentId);
            
            if (relationshipError || !relationshipData || relationshipData.length === 0) {
                alert('No parents found for this student');
                return;
            }

            const targetUsers = relationshipData.map(r => r.parent_id);
            const student = this.students.find(s => s.id === visit.studentId);
            const studentName = student ? student.name : 'Student';

            await window.supabaseClient.from('notifications').insert({
                target_users: targetUsers,
                title: 'Clinic Visit Update',
                message: `Your child ${studentName} visited the clinic for ${visit.reason}. Outcome: ${visit.outcome}. Notes: ${visit.teacherNotes || 'None'}.`,
                type: 'clinic',
                student_id: visit.studentId
            });

            alert('Parents notified successfully');

        } catch (error) {
            console.error('Error notifying parent:', error);
            alert('Error sending notification');
        }
    }

    updateHistoryTable() {
        const tbody = document.getElementById('visitHistoryTable');
        const thead = document.querySelector('#visitHistoryTable').closest('table').querySelector('thead tr');
        
        // Ensure Actions header exists
        if (thead && !thead.innerHTML.includes('Actions')) {
            thead.insertAdjacentHTML('beforeend', '<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>');
        }
        
        if (this.clinicHistory.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="px-4 py-8 text-center text-gray-500">
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
            if (visit.status === 'in_clinic') {
                statusBadge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">In Clinic</span>';
            } else if (visit.outcome === 'sent_home') {
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
                    <td class="px-4 py-3 whitespace-nowrap">
                        <button onclick="window.clinicDashboard.notifyParent('${visit.id}')" class="text-blue-600 hover:text-blue-900 text-sm font-medium">
                            Notify Parent
                        </button>
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
