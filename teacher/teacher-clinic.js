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
        // Keep polling as backup (every 60s instead of 15s)
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
        }
        this.pollTimer = setInterval(async () => {
            try {
                await this.loadInitialData();
            } catch (e) {
                console.error('Polling error:', e);
            }
        }, 60000);

        if (!window.supabaseClient) return;

        // Clean up existing subscription
        if (this.realtimeChannel) {
            window.supabaseClient.removeChannel(this.realtimeChannel);
        }

        this.realtimeChannel = window.supabaseClient.channel('teacher_clinic_realtime');
        
        // Listen for Clinic Visit Changes
        this.realtimeChannel.on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'clinic_visits'
        }, (payload) => {
            const record = payload.new;
            // Check if relevant to this teacher's class
            if (this.students.some(s => s.id === record.student_id)) {
                console.log('Realtime clinic update received:', record);
                this.loadInitialData(); // Reload data to reflect changes
                
                if (payload.eventType === 'UPDATE' && record.outcome) {
                    const student = this.students.find(s => s.id === record.student_id);
                    this.showToast(`Decision received for ${student ? student.name : 'student'}: ${record.outcome}`, 'info');
                }
            }
        });

        this.realtimeChannel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('Teacher clinic connected to realtime updates');
            }
        });
        
        // Add cleanup on unload
        window.addEventListener('beforeunload', () => {
            if (this.realtimeChannel) {
                window.supabaseClient.removeChannel(this.realtimeChannel);
            }
        });
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
            teacherNotes: visit.notes || visit.additional_notes, // Mapped to notes/additional_notes
            // isUrgent: visit.is_urgent, // Removed as column doesn't exist
            nurseRecommendation: visit.recommendations,
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
                    related_record: visit.id,
                    created_at: new Date().toISOString()
                }]);

            if (notifyError) throw notifyError;
        } catch (error) {
            console.error('Error notifying clinic staff:', error);
        }
    }

    // --- Create Pass Functionality ---

    openCreatePassModal() {
        let modal = document.getElementById('createPassModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'createPassModal';
            modal.className = 'fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center z-50';
            modal.innerHTML = `
                <div class="bg-white rounded-lg w-full max-w-md p-6">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-lg font-bold text-gray-800">Create Clinic Pass</h3>
                        <button onclick="window.clinicDashboard.closeCreatePassModal()" class="text-gray-500 hover:text-gray-700">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <form id="createPassForm" onsubmit="event.preventDefault(); window.clinicDashboard.createPass();">
                        <div class="mb-4">
                            <label class="block text-sm font-medium text-gray-700 mb-2">Select Student</label>
                            <select id="passStudentId" class="w-full border border-gray-300 rounded px-3 py-2" required>
                                <option value="">-- Select Student --</option>
                                ${this.students.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
                            </select>
                        </div>
                        <div class="mb-4">
                            <label class="block text-sm font-medium text-gray-700 mb-2">Reason for Visit</label>
                            <textarea id="passReason" class="w-full border border-gray-300 rounded px-3 py-2 h-24" required placeholder="e.g. Headache, Stomach ache..."></textarea>
                        </div>
                        <div class="flex justify-end space-x-3">
                            <button type="button" onclick="window.clinicDashboard.closeCreatePassModal()" class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                            <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Create Pass</button>
                        </div>
                    </form>
                </div>
            `;
            document.body.appendChild(modal);
        }
        
        // Refresh student list in case it changed
        const select = modal.querySelector('#passStudentId');
        if (select) {
             select.innerHTML = '<option value="">-- Select Student --</option>' + 
                                this.students.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        }

        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    closeCreatePassModal() {
        const modal = document.getElementById('createPassModal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            document.getElementById('createPassForm').reset();
        }
    }

    async createPass() {
        try {
            const studentId = document.getElementById('passStudentId').value;
            const reason = document.getElementById('passReason').value;
            
            if (!studentId || !reason) {
                this.showToast('Please fill in all fields', 'error');
                return;
            }

            this.showToast('Creating clinic pass...', 'info');
            
            // Insert new clinic visit
            const { data, error } = await window.supabaseClient
                .from('clinic_visits')
                .insert({
                    student_id: studentId,
                    visit_time: new Date().toISOString(),
                    reason: reason,
                    status: 'in_clinic', // Aligned with teacher-dashboard.js
                    notes: 'Referred by teacher' // Mapped remarks to notes
                })
                .select()
                .single();

            if (error) throw error;

            // Notify Clinic Staff (All clinic staff)
            // First get clinic staff IDs
            const { data: clinicStaff } = await window.supabaseClient
                .from('profiles')
                .select('id')
                .eq('role', 'clinic'); // Only 'clinic' role exists in schema
            
            const student = this.students.find(s => s.id === studentId);

            if (clinicStaff && clinicStaff.length > 0) {
                const targetUsers = clinicStaff.map(s => s.id);
                
                await window.supabaseClient
                    .from('notifications')
                    .insert({
                        target_users: targetUsers,
                        title: 'New Clinic Pass',
                        message: `Teacher ${this.teacher.name} created a pass for ${student ? student.name : 'student'}. Reason: ${reason}`,
                        type: 'clinic_new_visit',
                        student_id: studentId,
                        related_record: data.id,
                        created_at: new Date().toISOString()
                    });
            }

            // Notify Parents
            const { data: parentRelations } = await window.supabaseClient
                .from('parent_students')
                .select('parent_id')
                .eq('student_id', studentId);
            
            if (parentRelations && parentRelations.length > 0) {
                const parentIds = parentRelations.map(r => r.parent_id);
                await window.supabaseClient.from('notifications').insert({
                    target_users: parentIds,
                    title: 'Clinic Referral',
                    message: `Teacher ${this.teacher.name} has referred ${student ? student.name : 'your child'} to the clinic. Reason: ${reason}`,
                    type: 'clinic_new_visit',
                    student_id: studentId,
                    related_record: data.id,
                    is_urgent: false,
                    created_at: new Date().toISOString()
                });
            }

            this.showToast('Clinic pass created successfully', 'success');
            this.closeCreatePassModal();
            this.loadInitialData(); // Refresh list

        } catch (error) {
            console.error('Error creating pass:', error);
            this.showToast('Error creating clinic pass: ' + error.message, 'error');
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
            
            if (!confirm('Are you sure you want to submit this decision?')) {
                return;
            }

            this.showToast('Submitting decision...', 'info');
            
            const visit = this.activeVisits.find(v => v.id === visitId);
            if (!visit) throw new Error('Visit not found');

            // Update clinic visit
            const { error: updateError } = await window.supabaseClient
                .from('clinic_visits')
                .update({
                    outcome: disposition,
                    additional_notes: `${notes} (Decision by teacher at ${new Date().toISOString()})`
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
            await this.notifyParents(visit.studentId, disposition, student ? student.name : 'Student', notes, visit.id);

            this.showToast('Decision submitted successfully', 'success');
            this.closeDecisionModal();
            this.loadInitialData(); // Refresh list

        } catch (error) {
            console.error('Error saving decision:', error);
            this.showToast('Error submitting decision', 'error');
        }
    }

    openDecisionModal(visitId) {
        try {
            const visit = this.activeVisits.find(v => v.id === visitId);
            if (!visit) {
                this.showToast('Visit not found', 'error');
                return;
            }

            const student = this.students.find(s => s.id === visit.studentId);
            
            let overlay = document.getElementById('decisionModal');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'decisionModal';
                overlay.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 hidden flex items-center justify-center p-4';
                overlay.innerHTML = `
                    <div class="bg-white rounded-lg shadow-xl max-w-lg w-full">
                        <div class="px-6 py-4 border-b flex justify-between items-center">
                            <h3 class="text-lg font-semibold text-gray-800">Clinic Decision</h3>
                            <button onclick="window.clinicDashboard.closeDecisionModal()" class="text-gray-500 hover:text-gray-700">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                        <div class="px-6 py-4" id="decisionModalBody">
                            <!-- Dynamic Content -->
                        </div>
                        <div class="px-6 py-4 border-t flex justify-end space-x-2">
                            <button onclick="window.clinicDashboard.closeDecisionModal()" class="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200">Cancel</button>
                            <button id="submitDecisionBtn" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Submit Decision</button>
                        </div>
                    </div>
                `;
                document.body.appendChild(overlay);
            }

            const body = document.getElementById('decisionModalBody');
            body.innerHTML = `
                <div class="space-y-4">
                    <div class="bg-blue-50 p-4 rounded-lg">
                        <div class="flex items-center mb-2">
                            <div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center mr-3">
                                <span class="text-blue-600 font-bold">${student ? student.name.charAt(0) : '?'}</span>
                            </div>
                            <div>
                                <h4 class="font-bold text-gray-800">${student ? student.name : 'Unknown Student'}</h4>
                                <p class="text-sm text-gray-600">Arrived: ${new Date(visit.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                            </div>
                        </div>
                        <div class="text-sm text-gray-700">
                            <p><strong>Reason:</strong> ${visit.reason}</p>
                            ${visit.nurseRecommendation ? `<p class="mt-1 text-yellow-800 bg-yellow-100 p-2 rounded"><strong><i class="fas fa-user-nurse mr-1"></i> Recommendation:</strong> ${visit.nurseRecommendation}</p>` : ''}
                        </div>
                    </div>

                    <form id="decisionForm">
                        <label class="block text-sm font-medium text-gray-700 mb-2">Disposition</label>
                        <div class="space-y-2">
                            <label class="flex items-center p-3 border rounded hover:bg-gray-50 cursor-pointer">
                                <input type="radio" name="disposition" value="return_to_class" class="h-4 w-4 text-blue-600 focus:ring-blue-500" checked>
                                <span class="ml-3 block text-sm font-medium text-gray-700">Return to Class</span>
                            </label>
                            <label class="flex items-center p-3 border rounded hover:bg-gray-50 cursor-pointer">
                                <input type="radio" name="disposition" value="send_home" class="h-4 w-4 text-red-600 focus:ring-red-500">
                                <span class="ml-3 block text-sm font-medium text-gray-700">Send Home</span>
                            </label>
                        </div>

                        <div class="mt-4">
                            <label class="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                            <textarea id="teacherNotes" class="w-full border rounded px-3 py-2 h-24 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Optional notes..."></textarea>
                        </div>
                    </form>
                </div>
            `;

            document.getElementById('submitDecisionBtn').onclick = () => this.saveDecision(visitId);
            
            overlay.classList.remove('hidden');
            overlay.classList.add('flex');
        } catch (error) {
            console.error('Error opening decision modal:', error);
            this.showToast('Error opening decision modal', 'error');
        }
    }

    closeDecisionModal() {
        const modal = document.getElementById('decisionModal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
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
                    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div class="flex-1">
                            <h3 class="font-bold text-lg text-blue-800">${student ? student.name : 'Unknown Student'}</h3>
                            <p class="text-sm text-gray-600">
                                <i class="far fa-clock mr-1"></i> Arrived: ${visitTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} (${duration})
                            </p>
                            <p class="text-sm text-gray-600 mt-1">
                                <span class="font-semibold">Reason:</span> ${visit.reason || 'Not specified'}
                            </p>
                            ${visit.medicalFindings ? `
                                <div class="mt-2 p-2 bg-green-50 rounded text-sm text-green-800 border border-green-100">
                                    <div class="flex items-start">
                                        <i class="fas fa-stethoscope mr-2 mt-1"></i>
                                        <div>
                                            <strong>Medical Findings:</strong><br/>
                                            ${visit.medicalFindings}
                                        </div>
                                    </div>
                                </div>
                            ` : ''}
                            ${visit.treatmentGiven ? `
                                <div class="mt-2 p-2 bg-purple-50 rounded text-sm text-purple-800 border border-purple-100">
                                    <div class="flex items-start">
                                        <i class="fas fa-pills mr-2 mt-1"></i>
                                        <div>
                                            <strong>Treatment Given:</strong><br/>
                                            ${visit.treatmentGiven}
                                        </div>
                                    </div>
                                </div>
                            ` : ''}
                            ${visit.nurseRecommendation ? `
                                <div class="mt-2 p-2 bg-yellow-100 rounded text-sm text-yellow-800 border border-yellow-200">
                                    <div class="flex items-start">
                                        <i class="fas fa-user-nurse mr-2 mt-1"></i>
                                        <div>
                                            <strong>Nurse Recommendation:</strong><br/>
                                            ${visit.nurseRecommendation}
                                        </div>
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                        <button onclick="window.clinicDashboard.openDecisionModal('${visit.id}')" 
                                class="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded shadow-sm text-sm font-medium transition flex items-center justify-center">
                            <i class="fas fa-reply mr-2"></i> Respond
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Old modal removed to avoid duplication

    async notifyParents(studentId, decision, studentName, notes, visitId) {
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
                    related_record: visitId,
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
        if (['clinic', 'clinic_findings', 'clinic_new_visit', 'clinic_decision'].includes(notification.type)) {
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
                related_record: visit.id,
                created_at: new Date().toISOString()
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
