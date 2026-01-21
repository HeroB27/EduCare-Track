// clinic-dashboard.js - ENHANCED VERSION
class ClinicDashboard {
    constructor() {
        this.currentUser = null;
        this.currentPage = 'dashboard';
        this.recentVisits = [];
        this.currentPatients = [];
        this.stats = {};
    }

    async init() {
        try {
            const savedUser = localStorage.getItem('educareTrack_user');
            if (!savedUser) {
                window.location.href = '../index.html';
                return;
            }

            this.currentUser = JSON.parse(savedUser);
            
            if (this.currentUser.role !== 'clinic') {
                if (window.EducareTrack && typeof window.EducareTrack.showNormalNotification === 'function') {
                    window.EducareTrack.showNormalNotification({ title: 'Access Denied', message: 'Clinic role required.' });
                }
                window.location.href = '../index.html';
                return;
            }

            this.initEventListeners();
            this.updateUI();
            await this.loadDashboardData();
            await this.loadPage(this.currentPage);
            
        } catch (error) {
            console.error('Dashboard initialization failed:', error);
            this.showError('Failed to initialize dashboard');
        }
    }

    async loadDashboardData() {
        try {
            // Load today's visits
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            if (window.USE_SUPABASE && window.supabaseClient) {
                const [{ data: visits, error: vErr }, { data: patients, error: pErr }, statsSnapshot] = await Promise.all([
                    window.supabaseClient.from('clinicVisits')
                        .select('id,studentId,studentName,classId,checkIn,timestamp,reason,notes')
                        .gte('timestamp', today.toISOString())
                        .lt('timestamp', tomorrow.toISOString())
                        .order('timestamp', { ascending: false })
                        .limit(10),
                    window.supabaseClient.from('students')
                        .select('id,firstName,lastName,classId,currentStatus,parentId')
                        .eq('currentStatus', 'in_clinic'),
                    this.getClinicStats()
                ]);
                if (vErr) throw vErr;
                if (pErr) throw pErr;
                this.recentVisits = (visits || []).map(v => ({
                    id: v.id,
                    ...v,
                    timestamp: v.timestamp ? new Date(v.timestamp) : new Date()
                }));
                this.currentPatients = (patients || []).map(s => ({
                    id: s.id,
                    firstName: s.firstName,
                    lastName: s.lastName,
                    name: `${s.firstName || ''} ${s.lastName || ''}`.trim(),
                    classId: s.classId,
                    currentStatus: s.currentStatus,
                    parentId: s.parentId,
                    grade: s.grade || ''
                }));
                this.stats = statsSnapshot;
            } else {
                const [visitsSnapshot, patientsSnapshot, statsSnapshot] = await Promise.all([
                    firebase.firestore().collection('clinicVisits')
                        .where('timestamp', '>=', today)
                        .where('timestamp', '<', tomorrow)
                        .orderBy('timestamp', 'desc')
                        .limit(10)
                        .get(),
                    
                    firebase.firestore().collection('students')
                        .where('currentStatus', '==', 'in_clinic')
                        .get(),
                    
                    this.getClinicStats()
                ]);
                this.recentVisits = visitsSnapshot.docs.map(doc => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        ...data,
                        timestamp: data.timestamp?.toDate() || new Date()
                    };
                });
                this.currentPatients = patientsSnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                this.stats = statsSnapshot;
            }

        } catch (error) {
            console.error('Error loading dashboard data:', error);
        }
    }

    async getClinicStats() {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            if (window.USE_SUPABASE && window.supabaseClient) {
                const [{ data: visits, error: vErr }, { data: patients, error: pErr }, { count, error: cErr }] = await Promise.all([
                    window.supabaseClient.from('clinicVisits')
                        .select('id,reason,timestamp', { count: 'exact' })
                        .gte('timestamp', today.toISOString())
                        .lt('timestamp', tomorrow.toISOString()),
                    window.supabaseClient.from('students')
                        .select('id', { count: 'exact' })
                        .eq('currentStatus', 'in_clinic'),
                    window.supabaseClient.from('students')
                        .select('id', { count: 'exact', head: true })
                ]);
                if (vErr) throw vErr;
                if (pErr) throw pErr;
                if (cErr) throw cErr;
                const reasonCounts = {};
                (visits || []).forEach(v => {
                    const reason = v.reason;
                    reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
                });
                const topReason = Object.keys(reasonCounts).reduce((a, b) =>
                    (reasonCounts[a] || 0) > (reasonCounts[b] || 0) ? a : b, 'N/A'
                );
                return {
                    todayVisits: (visits || []).length,
                    currentPatients: patients ? (patients.length ?? patients.count ?? 0) : 0,
                    totalStudents: count ?? 0,
                    topReason: this.capitalizeFirstLetter(topReason)
                };
            } else {
                const [todayVisits, currentPatients, totalStudents] = await Promise.all([
                    firebase.firestore().collection('clinicVisits')
                        .where('timestamp', '>=', today)
                        .where('timestamp', '<', tomorrow)
                        .get(),
                    
                    firebase.firestore().collection('students')
                        .where('currentStatus', '==', 'in_clinic')
                        .get(),
                    
                    firebase.firestore().collection('students')
                        .where('isActive', '==', true)
                        .get()
                ]);
                const reasonCounts = {};
                todayVisits.docs.forEach(doc => {
                    const reason = doc.data().reason;
                    reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
                });
                const topReason = Object.keys(reasonCounts).reduce((a, b) => 
                    reasonCounts[a] > reasonCounts[b] ? a : b, 'N/A'
                );
                return {
                    todayVisits: todayVisits.size,
                    currentPatients: currentPatients.size,
                    totalStudents: totalStudents.size,
                    topReason: this.capitalizeFirstLetter(topReason)
                };
            }

        } catch (error) {
            console.error('Error getting clinic stats:', error);
            return {
                todayVisits: 0,
                currentPatients: 0,
                totalStudents: 0,
                topReason: 'N/A'
            };
        }
    }

    async loadPage(page) {
        this.currentPage = page;
        
        // Update navigation
        document.querySelectorAll('.nav-tab').forEach(tab => {
            if (tab.getAttribute('data-page') === page) {
                tab.classList.add('border-blue-500', 'text-blue-600');
                tab.classList.remove('border-transparent', 'text-gray-500');
            } else {
                tab.classList.remove('border-blue-500', 'text-blue-600');
                tab.classList.add('border-transparent', 'text-gray-500');
            }
        });

        const mainContent = document.getElementById('mainContent');
        
        switch(page) {
            case 'dashboard':
                mainContent.innerHTML = await this.loadDashboardPage();
                break;
            case 'checkin':
                window.location.href = 'clinic-checkin.html';
                return;
            case 'visits':
                window.location.href = 'clinic-visits.html';
                return;
            case 'reports':
                window.location.href = 'clinic-reports.html';
                return;
            default:
                mainContent.innerHTML = await this.loadDashboardPage();
        }
    }

    async loadDashboardPage() {
        return `
            <div class="space-y-6">
                <!-- Quick Stats -->
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div class="bg-white rounded-lg shadow-md p-6">
                        <div class="flex items-center">
                            <div class="p-3 rounded-full bg-blue-100 text-blue-600 mr-4">
                                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path>
                                </svg>
                            </div>
                            <div>
                                <h3 class="text-2xl font-bold text-gray-800">${this.stats.todayVisits || 0}</h3>
                                <p class="text-gray-600">Today's Visits</p>
                            </div>
                        </div>
                    </div>
                    
                    <div class="bg-white rounded-lg shadow-md p-6">
                        <div class="flex items-center">
                            <div class="p-3 rounded-full bg-red-100 text-red-600 mr-4">
                                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"></path>
                                </svg>
                            </div>
                            <div>
                                <h3 class="text-2xl font-bold text-gray-800">${this.stats.currentPatients || 0}</h3>
                                <p class="text-gray-600">Current Patients</p>
                            </div>
                        </div>
                    </div>
                    
                    <div class="bg-white rounded-lg shadow-md p-6">
                        <div class="flex items-center">
                            <div class="p-3 rounded-full bg-green-100 text-green-600 mr-4">
                                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                </svg>
                            </div>
                            <div>
                                <h3 class="text-2xl font-bold text-gray-800">${this.stats.totalStudents || 0}</h3>
                                <p class="text-gray-600">Total Students</p>
                            </div>
                        </div>
                    </div>
                    
                    <div class="bg-white rounded-lg shadow-md p-6">
                        <div class="flex items-center">
                            <div class="p-3 rounded-full bg-purple-100 text-purple-600 mr-4">
                                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.618 5.984A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016zM12 9v2m0 4h.01"></path>
                                </svg>
                            </div>
                            <div>
                                <h3 class="text-xl font-bold text-gray-800">${this.stats.topReason || 'N/A'}</h3>
                                <p class="text-gray-600">Top Reason</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Quick Actions & Current Patients -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <!-- Quick Actions -->
                    <div class="bg-white rounded-lg shadow-md p-6">
                        <h3 class="text-xl font-semibold text-gray-800 mb-4">Quick Actions</h3>
                        <div class="grid grid-cols-2 gap-4">
                            <button onclick="clinicDashboard.loadPage('checkin')" class="p-4 border border-gray-300 rounded-lg text-center hover:bg-blue-50 hover:border-blue-500 transition duration-200 group">
                                <svg class="w-8 h-8 text-blue-600 mx-auto mb-2 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"></path>
                                </svg>
                                <span class="text-sm font-medium text-gray-700">Student Check-in</span>
                            </button>
                            
                            <button onclick="clinicDashboard.loadPage('visits')" class="p-4 border border-gray-300 rounded-lg text-center hover:bg-green-50 hover:border-green-500 transition duration-200 group">
                                <svg class="w-8 h-8 text-green-600 mx-auto mb-2 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
                                </svg>
                                <span class="text-sm font-medium text-gray-700">View Visits</span>
                            </button>
                            
                            <button onclick="clinicDashboard.loadPage('reports')" class="p-4 border border-gray-300 rounded-lg text-center hover:bg-purple-50 hover:border-purple-500 transition duration-200 group">
                                <svg class="w-8 h-8 text-purple-600 mx-auto mb-2 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                                </svg>
                                <span class="text-sm font-medium text-gray-700">Health Reports</span>
                            </button>
                            
                            <button onclick="this.quickCheckoutAll()" class="p-4 border border-gray-300 rounded-lg text-center hover:bg-red-50 hover:border-red-500 transition duration-200 group">
                                <svg class="w-8 h-8 text-red-600 mx-auto mb-2 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
                                </svg>
                                <span class="text-sm font-medium text-gray-700">Check-out All</span>
                            </button>
                        </div>
                    </div>
                    
                    <!-- Current Patients -->
                    <div class="bg-white rounded-lg shadow-md p-6">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="text-xl font-semibold text-gray-800">Current Patients</h3>
                            <span class="bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm font-semibold">
                                ${this.currentPatients.length} patients
                            </span>
                        </div>
                        <div class="space-y-3 max-h-96 overflow-y-auto">
                            ${this.generateCurrentPatients()}
                        </div>
                    </div>
                </div>

                <!-- Recent Activity -->
                <div class="bg-white rounded-lg shadow-md p-6">
                    <h3 class="text-xl font-semibold text-gray-800 mb-4">Recent Clinic Activity</h3>
                    <div class="space-y-3">
                        ${this.generateRecentActivity()}
                    </div>
                </div>
            </div>
        `;
    }

    generateCurrentPatients() {
        if (this.currentPatients.length === 0) {
            return `
                <div class="text-center py-8 text-gray-500">
                    <svg class="w-12 h-12 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"></path>
                    </svg>
                    <p>No current patients in clinic</p>
                </div>
            `;
        }

        return this.currentPatients.map(patient => {
            const classInfo = patient.classId || 'Unknown Class';
            const gradeInfo = patient.grade ? ` • ${patient.grade}` : '';
            
            return `
                <div class="flex items-center justify-between p-4 bg-red-50 border border-red-200 rounded-lg">
                    <div class="flex items-center space-x-3">
                        <div class="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                            <span class="text-red-600 font-semibold">${patient.name.charAt(0)}</span>
                        </div>
                        <div>
                            <h4 class="text-sm font-medium text-gray-900">${patient.name}</h4>
                            <p class="text-xs text-gray-600">${classInfo}${gradeInfo}</p>
                        </div>
                    </div>
                    <button onclick="clinicDashboard.quickCheckout('${patient.id}')" 
                            class="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-lg text-sm font-medium transition duration-200">
                        Check-out
                    </button>
                </div>
            `;
        }).join('');
    }

    generateRecentActivity() {
        if (this.recentVisits.length === 0) {
            return `
                <div class="text-center py-8 text-gray-500">
                    <svg class="w-12 h-12 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
                    </svg>
                    <p>No recent clinic activity</p>
                </div>
            `;
        }

        return this.recentVisits.map(visit => {
            const time = new Date(visit.timestamp).toLocaleTimeString('en-PH', {
                hour: '2-digit',
                minute: '2-digit'
            });
            const type = visit.checkIn ? 'Check-in' : 'Check-out';
            const typeColor = visit.checkIn ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800';
            const icon = visit.checkIn ? '↩️' : '↪️';
            
            return `
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div class="flex items-center space-x-3">
                        <span class="text-lg">${icon}</span>
                        <div>
                            <h4 class="text-sm font-medium text-gray-900">${visit.studentName}</h4>
                            <p class="text-xs text-gray-600">${time} • ${visit.reason}</p>
                            ${visit.notes ? `<p class="text-xs text-gray-500 mt-1">${visit.notes}</p>` : ''}
                        </div>
                    </div>
                    <span class="px-2 py-1 text-xs font-semibold rounded-full ${typeColor}">
                        ${type}
                    </span>
                </div>
            `;
        }).join('');
    }

    async quickCheckout(studentId) {
        const ok = window.EducareTrack && typeof window.EducareTrack.confirmAction === 'function'
            ? await window.EducareTrack.confirmAction('Are you sure you want to check out this student?', 'Confirm Checkout', 'Checkout', 'Cancel')
            : true;
        if (!ok) return;
        try {
            if (window.EducareTrack) {
                await window.EducareTrack.recordClinicVisit(studentId, 'Checkout', 'Quick checkout from dashboard', false);
            } else {
                await this.recordClinicVisit(studentId, 'Checkout', 'Quick checkout from dashboard', false);
            }
            await this.loadDashboardData();
            await this.loadPage(this.currentPage);
            this.showNotification('Student checked out successfully', 'success');
        } catch (error) {
            console.error('Error during quick checkout:', error);
            this.showNotification('Failed to check out student', 'error');
        }
    }

    async quickCheckoutAll() {
        if (this.currentPatients.length === 0) {
            this.showNotification('No patients to check out', 'info');
            return;
        }

        const ok = window.EducareTrack && typeof window.EducareTrack.confirmAction === 'function'
            ? await window.EducareTrack.confirmAction(`Are you sure you want to check out all ${this.currentPatients.length} patients?`, 'Confirm Checkout All', 'Checkout All', 'Cancel')
            : true;
        if (!ok) return;
        try {
            const checkoutPromises = this.currentPatients.map(patient => 
                this.recordClinicVisit(patient.id, 'Batch Checkout', 'Checked out all patients', false)
            );
            await Promise.all(checkoutPromises);
            await this.loadDashboardData();
            await this.loadPage(this.currentPage);
            this.showNotification(`All ${this.currentPatients.length} patients checked out successfully`, 'success');
        } catch (error) {
            console.error('Error during batch checkout:', error);
            this.showNotification('Failed to check out all patients', 'error');
        }
    }

    async recordClinicVisit(studentId, reason, notes, checkIn) {
        try {
            const studentDoc = await firebase.firestore().collection('students').doc(studentId).get();
            
            if (!studentDoc.exists) {
                throw new Error('Student not found');
            }

            const student = studentDoc.data();
            
            const clinicData = {
                studentId: studentId,
                studentName: student.name,
                classId: student.classId || '',
                checkIn: checkIn,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                reason: reason,
                notes: notes,
                staffId: this.currentUser.id,
                staffName: this.currentUser.name
            };

            await firebase.firestore().collection('clinicVisits').add(clinicData);

            // Update student status
            await firebase.firestore().collection('students').doc(studentId).update({
                currentStatus: checkIn ? 'in_clinic' : 'in_school',
                lastClinicVisit: firebase.firestore.FieldValue.serverTimestamp()
            });

            return true;
        } catch (error) {
            console.error('Error recording clinic visit:', error);
            throw error;
        }
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

    initEventListeners() {
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const page = e.target.getAttribute('data-page');
                this.loadPage(page);
            });
        });

        document.getElementById('logoutBtn').addEventListener('click', async () => {
            const ok = window.EducareTrack && typeof window.EducareTrack.confirmAction === 'function'
                ? await window.EducareTrack.confirmAction('Are you sure you want to logout?', 'Confirm Logout', 'Logout', 'Cancel')
                : true;
            if (ok) {
                localStorage.removeItem('educareTrack_user');
                window.location.href = '../index.html';
            }
        });
    }

    updateUI() {
        document.getElementById('userName').textContent = this.currentUser.name;
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    window.clinicDashboard = new ClinicDashboard();
    clinicDashboard.init();
});
