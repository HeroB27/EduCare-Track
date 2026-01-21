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
            // Get teacher details from Firestore
            const teacherDoc = await firebase.firestore()
                .collection('users')
                .doc(this.teacher.id)
                .get();
                
            if (teacherDoc.exists) {
                const teacherData = teacherDoc.data();
                this.classId = teacherData.classId;
                
                // Update teacher name in UI
                document.getElementById('teacherName').textContent = teacherData.name;
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
            const snapshot = await firebase.firestore()
                .collection('students')
                .where('classId', '==', this.classId)
                .where('isActive', '==', true)
                .get();
                
            this.students = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error('Error loading students:', error);
            this.showToast('Error loading student information', 'error');
        }
    }

    setupRealTimeListeners() {
        if (window.USE_SUPABASE && window.supabaseClient) {
            if (this.pollTimer) {
                clearInterval(this.pollTimer);
            }
            this.pollTimer = setInterval(async () => {
                try {
                    await this.loadInitialData();
                    await this.loadTeacherData();
                } catch (e) {
                    console.error('Polling error:', e);
                }
            }, 15000);
        } else {
            firebase.firestore()
                .collection('clinicVisits')
                .where('studentId', 'in', this.students.map(s => s.id))
                .where('checkIn', '==', true)
                .onSnapshot(snapshot => {
                    this.handleActiveVisitsUpdate(snapshot);
                }, error => {
                    console.error('Error listening to clinic visits:', error);
                });
            firebase.firestore()
                .collection('notifications')
                .where('targetUsers', 'array-contains', this.teacher.id)
                .where('type', '==', 'clinic')
                .orderBy('createdAt', 'desc')
                .limit(10)
                .onSnapshot(snapshot => {
                    this.handleNotificationsUpdate(snapshot);
                }, error => {
                    console.error('Error listening to notifications:', error);
                });
        }
    }

    async loadInitialData() {
        try {
            // Load active clinic visits
            const activeVisitsSnapshot = await firebase.firestore()
                .collection('clinicVisits')
                .where('studentId', 'in', this.students.map(s => s.id))
                .where('checkIn', '==', true)
                .get();
                
            this.activeVisits = activeVisitsSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Load recent clinic history (last 30 days)
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            
            const historySnapshot = await firebase.firestore()
                .collection('clinicVisits')
                .where('studentId', 'in', this.students.map(s => s.id))
                .where('timestamp', '>=', thirtyDaysAgo)
                .orderBy('timestamp', 'desc')
                .limit(20)
                .get();
                
            this.clinicHistory = historySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Update stats
            this.updateStats();
            
        } catch (error) {
            console.error('Error loading initial data:', error);
            this.showToast('Error loading clinic data', 'error');
        }
    }

    handleActiveVisitsUpdate(snapshot) {
        this.activeVisits = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        this.updateActiveVisitsList();
        this.updateStats();
    }

    handleNotificationsUpdate(snapshot) {
        snapshot.docChanges().forEach(change => {
            if (change.type === 'added') {
                const notification = {
                    id: change.doc.id,
                    ...change.doc.data()
                };
                
                // Show toast for new clinic notifications
                if (!notification.readBy || !notification.readBy.includes(this.teacher.id)) {
                    this.showClinicNotification(notification);
                    
                    // Mark as read
                    this.markNotificationAsRead(notification.id);
                }
            }
        });
    }

    updateStats() {
        // Current in clinic
        document.getElementById('currentInClinic').textContent = this.activeVisits.length;
        
        // Pending decisions (visits without teacher decision)
        const pending = this.activeVisits.filter(visit => !visit.teacherDecision);
        document.getElementById('pendingDecisions').textContent = pending.length;
        
        // Today's visits
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const todaysVisits = this.clinicHistory.filter(visit => {
            const visitDate = visit.timestamp.toDate();
            return visitDate >= today;
        });
        
        document.getElementById('todaysVisits').textContent = todaysVisits.length;
    }

    updateActiveVisitsList() {
        const container = document.getElementById('activeVisitsList');
        
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
            const timeIn = visit.timestamp.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            const duration = this.calculateDuration(visit.timestamp.toDate());
            
            return `
                <div class="border rounded-lg p-4 mb-4 hover:bg-gray-50 cursor-pointer transition" 
                     onclick="clinicDashboard.showDecisionPanel('${visit.id}')">
                    <div class="flex justify-between items-start">
                        <div>
                            <h3 class="font-bold text-lg">${student ? student.name : 'Unknown Student'}</h3>
                            <p class="text-gray-600">${student ? `Grade ${student.grade}` : ''}</p>
                            <div class="flex items-center mt-2">
                                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                    <i class="fas fa-clock mr-1"></i> ${timeIn} (${duration})
                                </span>
                                ${visit.isUrgent ? `
                                    <span class="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                        <i class="fas fa-exclamation-triangle mr-1"></i> Urgent
                                    </span>
                                ` : ''}
                            </div>
                        </div>
                        <div class="text-right">
                            <span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${visit.teacherDecision ? 
                                (visit.teacherDecision === 'send_home' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800') : 
                                'bg-blue-100 text-blue-800'}">
                                ${visit.teacherDecision ? 
                                    (visit.teacherDecision === 'send_home' ? 'Send Home' : 'Stay in Clinic') : 
                                    'Decision Pending'}
                            </span>
                        </div>
                    </div>
                    <div class="mt-3">
                        <p class="text-gray-700"><strong>Reason:</strong> ${visit.reason || 'Not specified'}</p>
                        ${visit.notes ? `<p class="text-gray-700 mt-1"><strong>Notes:</strong> ${visit.notes}</p>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    showDecisionPanel(visitId) {
        const visit = this.activeVisits.find(v => v.id === visitId);
        if (!visit) return;
        
        const student = this.students.find(s => s.id === visit.studentId);
        const timeIn = visit.timestamp.toDate().toLocaleString();
        
        const panel = document.getElementById('decisionPanel');
        panel.innerHTML = `
            <div class="border rounded-lg p-4 bg-gray-50">
                <h3 class="font-bold text-lg mb-2">Student Information</h3>
                <div class="mb-4">
                    <p><strong>Name:</strong> ${student ? student.name : 'Unknown'}</p>
                    <p><strong>Class:</strong> ${student ? `Grade ${student.grade}` : 'Unknown'}</p>
                    <p><strong>Time In:</strong> ${timeIn}</p>
                </div>
                
                <h3 class="font-bold text-lg mb-2">Clinic Report</h3>
                <div class="mb-4">
                    <p><strong>Reason:</strong> ${visit.reason || 'Not specified'}</p>
                    ${visit.notes ? `<p class="mt-2"><strong>Notes:</strong> ${visit.notes}</p>` : ''}
                    ${visit.nurseRecommendation ? `
                        <div class="mt-2 p-2 bg-blue-50 rounded border border-blue-200">
                            <p><strong>Nurse Recommendation:</strong> ${visit.nurseRecommendation}</p>
                        </div>
                    ` : ''}
                </div>
                
                <h3 class="font-bold text-lg mb-2">Authorization</h3>
                <div class="space-y-3">
                    <div class="flex items-center">
                        <input type="radio" id="stayClinic" name="disposition" value="stay_clinic" 
                               ${visit.teacherDecision === 'stay_clinic' ? 'checked' : ''} class="mr-2">
                        <label for="stayClinic" class="flex-1">
                            <span class="font-medium">Stay in Clinic</span>
                            <p class="text-sm text-gray-600">Student will remain in clinic for observation/treatment</p>
                        </label>
                    </div>
                    
                    <div class="flex items-center">
                        <input type="radio" id="sendHome" name="disposition" value="send_home" 
                               ${visit.teacherDecision === 'send_home' ? 'checked' : ''} class="mr-2">
                        <label for="sendHome" class="flex-1">
                            <span class="font-medium">Send Home</span>
                            <p class="text-sm text-gray-600">Student should be sent home for medical reasons</p>
                        </label>
                    </div>
                    
                    <div class="mt-4">
                        <label for="teacherNotes" class="block text-sm font-medium text-gray-700 mb-1">Additional Notes (Optional)</label>
                        <textarea id="teacherNotes" rows="3" class="w-full border rounded-md p-2" 
                                  placeholder="Add any additional instructions or information...">${visit.teacherNotes || ''}</textarea>
                    </div>
                    
                    <div class="flex space-x-2 mt-4">
                        <button onclick="clinicDashboard.saveDecision('${visit.id}')" 
                                class="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md transition">
                            Save Decision
                        </button>
                        <button onclick="clinicDashboard.clearDecisionPanel()" 
                                class="bg-gray-300 hover:bg-gray-400 text-gray-800 py-2 px-4 rounded-md transition">
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    clearDecisionPanel() {
        const panel = document.getElementById('decisionPanel');
        panel.innerHTML = `
            <div class="text-center py-8 text-gray-500">
                <i class="fas fa-hand-pointer text-4xl mb-2"></i>
                <p>Select a student to make a decision</p>
            </div>
        `;
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
            await firebase.firestore()
                .collection('clinicVisits')
                .doc(visitId)
                .update({
                    teacherDecision: decision.value,
                    teacherNotes: teacherNotes,
                    teacherDecisionAt: new Date(),
                    teacherId: this.teacher.id,
                    teacherName: this.teacher.name
                });
            
            // Create notification for clinic staff
            const student = this.students.find(s => s.id === visit.studentId);
            await firebase.firestore()
                .collection('notifications')
                .add({
                    type: 'clinic_decision',
                    title: 'Teacher Authorization Received',
                    message: `${this.teacher.name} has authorized ${student ? student.name : 'student'} to be ${decision.value === 'send_home' ? 'sent home' : 'kept in clinic'}`,
                    targetUsers: [visit.staffId], // Clinic staff who checked in the student
                    studentId: visit.studentId,
                    studentName: student ? student.name : 'Unknown',
                    relatedRecord: visitId,
                    isUrgent: false,
                    createdAt: new Date()
                });
            
            this.showToast('Decision saved successfully', 'success');
            this.clearDecisionPanel();
            
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
            await firebase.firestore()
                .collection('notifications')
                .doc(notificationId)
                .update({
                    readBy: firebase.firestore.FieldValue.arrayUnion(this.teacher.id)
                });
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
            const visitDate = visit.timestamp.toDate();
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
