// clinic-dashboard.js - ENHANCED VERSION
class ClinicDashboard {
    constructor() {
        this.currentUser = null;
        this.currentPage = 'dashboard';
        this.recentVisits = [];
        this.currentPatients = [];
        this.incomingReferrals = [];
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
            this.setupRealTimeListeners(); // Ensure realtime listeners are set up
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
                const [{ data: visits, error: vErr }, { data: patients, error: pErr }, { data: referrals, error: rErr }, statsSnapshot] = await Promise.all([
                    window.supabaseClient.from('clinic_visits')
                        .select('id,student_id,reason,visit_time,notes,treated_by,outcome, students(full_name, class_id)')
                        .gte('visit_time', today.toISOString())
                        .lt('visit_time', tomorrow.toISOString())
                        .order('visit_time', { ascending: false })
                        .limit(20),
                    window.supabaseClient.from('students')
                        .select('id,full_name,class_id,current_status')
                        .eq('current_status', 'in_clinic'),
                    window.supabaseClient.from('clinic_visits')
                        .select('id,student_id,reason,visit_time,notes,treated_by,outcome, students(full_name, class_id)')
                        .is('outcome', null) // Fetch pending referrals
                        .gte('visit_time', today.toISOString()), 
                    this.getClinicStats()
                ]);

                if (vErr) throw vErr;
                if (pErr) throw pErr;
                if (rErr) throw rErr;

                this.recentVisits = (visits || []).map(v => ({
                    id: v.id,
                    studentId: v.student_id,
                    studentName: v.students?.full_name || 'Unknown',
                    classId: v.students?.class_id || '',
                    checkIn: v.outcome === 'checked_in',
                    outcome: v.outcome,
                    ...v,
                    timestamp: v.visit_time ? new Date(v.visit_time) : new Date()
                }));

                this.currentPatients = (patients || []).map(s => ({
                    id: s.id,
                    name: s.full_name || '',
                    classId: s.class_id,
                    currentStatus: s.current_status,
                    grade: '' 
                }));

                this.incomingReferrals = (referrals || []).map(r => ({
                    id: r.id,
                    studentId: r.student_id,
                    studentName: r.students?.full_name || 'Unknown',
                    classId: r.students?.class_id || '',
                    reason: r.reason,
                    timestamp: r.visit_time ? new Date(r.visit_time) : new Date()
                }));

                this.stats = statsSnapshot;
            } else {
                // ... fallback for non-supabase (omitted for brevity as we are using supabase)
                 const db = window.EducareTrack ? window.EducareTrack.db : null;
                 // ... existing logic ...
            }

        } catch (error) {
            console.error('Error loading dashboard data:', error);
        }
    }

    setupRealTimeListeners() {
        if (!window.supabaseClient) return;

        // Clean up existing subscription if any
        if (this.realtimeChannel) {
            window.supabaseClient.removeChannel(this.realtimeChannel);
        }

        this.realtimeChannel = window.supabaseClient.channel('clinic_dashboard_realtime');

        // Listen for Clinic Visits (New check-ins or updates)
        this.realtimeChannel.on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'clinic_visits'
        }, () => {
            console.log('Clinic visit update received');
            this.loadDashboardData();
        });

        // Listen for Student Status Changes (e.g. status changed to/from 'in_clinic')
        this.realtimeChannel.on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'students'
        }, (payload) => {
            // Only reload if the status changed to or from 'in_clinic'
            const oldStatus = payload.old.current_status;
            const newStatus = payload.new.current_status;
            if (oldStatus === 'in_clinic' || newStatus === 'in_clinic') {
                console.log('Student clinic status update received');
                this.loadDashboardData();
            }
        });

        this.realtimeChannel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('Clinic dashboard connected to realtime updates');
            }
        });
    }

    async getClinicStats() {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            if (window.USE_SUPABASE && window.supabaseClient) {
                const [{ data: visits, error: vErr }, { data: patients, error: pErr }, { count, error: cErr }] = await Promise.all([
                    window.supabaseClient.from('clinic_visits')
                        .select('id,reason,visit_time,outcome', { count: 'exact' })
                        .gte('visit_time', today.toISOString())
                        .lt('visit_time', tomorrow.toISOString()),
                    window.supabaseClient.from('students')
                        .select('id', { count: 'exact' })
                        .eq('current_status', 'in_clinic'),
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
                // Count only actual check-ins (outcome = 'checked_in')
                const checkInCount = (visits || []).filter(v => v.outcome === 'checked_in').length;
                return {
                    todayVisits: checkInCount,
                    currentPatients: patients ? (patients.length ?? patients.count ?? 0) : 0,
                    totalStudents: count ?? 0,
                    topReason: this.capitalizeFirstLetter(topReason)
                };
            } else {
                const db = window.EducareTrack ? window.EducareTrack.db : null;
                if (!db) {
                    throw new Error('Database not available');
                }
                const [todayVisits, currentPatients, totalStudents] = await Promise.all([
                    db.collection('clinicVisits')
                        .where('timestamp', '>=', today)
                        .where('timestamp', '<', tomorrow)
                        .where('check_in', '==', true)
                        .get(),
                    
                    db.collection('students')
                        .where('currentStatus', '==', 'in_clinic')
                        .get(),
                    
                    db.collection('students')
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
                     <!-- Incoming Referrals -->
                    <div class="bg-white rounded-lg shadow-md p-6 lg:col-span-2">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="text-xl font-semibold text-gray-800">Incoming Referrals</h3>
                            <span class="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-semibold">
                                ${this.incomingReferrals.length} pending
                            </span>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            ${this.generateIncomingReferrals()}
                        </div>
                    </div>

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
                            
                            <button onclick="clinicDashboard.quickCheckoutAll()" class="p-4 border border-gray-300 rounded-lg text-center hover:bg-red-50 hover:border-red-500 transition duration-200 group">
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

    generateIncomingReferrals() {
        if (this.incomingReferrals.length === 0) {
            return `
                <div class="col-span-full text-center py-4 text-gray-500 bg-gray-50 rounded-lg">
                    <p>No incoming referrals</p>
                </div>
            `;
        }

        return this.incomingReferrals.map(ref => {
            const time = ref.timestamp.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
            return `
                <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex flex-col justify-between">
                    <div>
                        <div class="flex justify-between items-start mb-2">
                            <h4 class="font-bold text-gray-900">${ref.studentName}</h4>
                            <span class="text-xs text-gray-500">${time}</span>
                        </div>
                        <p class="text-sm text-gray-700 mb-1">Reason: ${ref.reason}</p>
                        <p class="text-xs text-gray-600 mb-3">Class: ${ref.classId}</p>
                    </div>
                    <button onclick="clinicDashboard.admitPatient('${ref.id}', '${ref.studentId}')" 
                        class="w-full bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition duration-200 flex items-center justify-center">
                        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                        </svg>
                        Admit Student
                    </button>
                </div>
            `;
        }).join('');
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
            return `
                <div class="flex items-center justify-between p-4 bg-red-50 border border-red-200 rounded-lg">
                    <div class="flex items-center space-x-3">
                        <div class="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                            <span class="text-red-600 font-semibold">${patient.name.charAt(0)}</span>
                        </div>
                        <div>
                            <h4 class="text-sm font-medium text-gray-900">${patient.name}</h4>
                            <p class="text-xs text-gray-600">ID: ${patient.id} • Class: ${patient.classId || 'No class'}</p>
                            ${patient.nurseRecommendation ? `<p class="text-xs text-yellow-700 mt-1"><strong>Findings:</strong> ${patient.nurseRecommendation}</p>` : ''}
                        </div>
                    </div>
                    <div class="flex space-x-2">
                        <button onclick="clinicDashboard.openFindingsModal('${patient.visitId}', '${patient.id}')" 
                                class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-lg text-sm font-medium transition duration-200">
                            Add Findings
                        </button>
                        <button onclick="clinicDashboard.quickCheckout('${patient.id}')" 
                                class="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-lg text-sm font-medium transition duration-200">
                            Check-out
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    openFindingsModal(visitId, studentId) {
        const patient = this.currentPatients.find(p => p.visitId === visitId);
        if (!patient) return;

        let modal = document.getElementById('findingsModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'findingsModal';
            modal.className = 'fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center z-50';
            modal.innerHTML = `
                <div class="bg-white rounded-lg w-full max-w-md p-6">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-lg font-bold text-gray-800">Nurse Findings & Recommendation</h3>
                        <button onclick="document.getElementById('findingsModal').classList.add('hidden')" class="text-gray-500 hover:text-gray-700">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <form id="findingsForm" onsubmit="event.preventDefault(); window.clinicDashboard.submitFindings('${visitId}');">
                        <div class="mb-4">
                            <label class="block text-sm font-medium text-gray-700 mb-2">Findings / Recommendation</label>
                            <textarea id="nurseRecommendation" class="w-full border border-gray-300 rounded px-3 py-2 h-24" required placeholder="e.g. Needs to rest, Needs to be sent home, Return to class..."></textarea>
                        </div>
                        <div class="mb-4">
                            <label class="block text-sm font-medium text-gray-700 mb-2">Additional Notes</label>
                            <textarea id="nurseNotes" class="w-full border border-gray-300 rounded px-3 py-2 h-16" placeholder="Internal notes..."></textarea>
                        </div>
                        <div class="flex justify-end space-x-3">
                            <button type="button" onclick="document.getElementById('findingsModal').classList.add('hidden')" class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                            <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Submit & Notify Teacher</button>
                        </div>
                    </form>
                </div>
            `;
            document.body.appendChild(modal);
        } else {
             const form = modal.querySelector('form');
             form.setAttribute('onsubmit', `event.preventDefault(); window.clinicDashboard.submitFindings('${visitId}');`);
        }

        modal.querySelector('#nurseRecommendation').value = patient.nurseRecommendation || '';
        modal.querySelector('#nurseNotes').value = patient.notes || '';
        
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    async submitFindings(visitId) {
        try {
            const recommendation = document.getElementById('nurseRecommendation').value;
            const notes = document.getElementById('nurseNotes').value;

            if (!recommendation) {
                this.showNotification('Please enter findings/recommendation', 'error');
                return;
            }

            this.showNotification('Submitting findings...', 'info');

            const { error } = await window.supabaseClient
                .from('clinic_visits')
                .update({
                    nurse_recommendation: recommendation,
                    notes: notes,
                    updated_at: new Date().toISOString()
                })
                .eq('id', visitId);

            if (error) throw error;

            // Notify Teacher
            await this.notifyTeacher(visitId, recommendation);

            this.showNotification('Findings submitted and teacher notified', 'success');
            document.getElementById('findingsModal').classList.add('hidden');
            await this.loadDashboardData();
            await this.loadPage(this.currentPage);

        } catch (error) {
            console.error('Error submitting findings:', error);
            this.showNotification('Error submitting findings', 'error');
        }
    }

    async notifyTeacher(visitId, recommendation) {
        try {
            const patient = this.currentPatients.find(p => p.visitId === visitId);
            if (!patient || !patient.classId) return;

            // Find homeroom teacher
            const { data: teacher, error } = await window.supabaseClient
                .from('classes')
                .select('adviser_id')
                .eq('id', patient.classId)
                .single();

            if (error || !teacher || !teacher.adviser_id) {
                console.warn('No adviser found for class', patient.classId);
                return;
            }

            await window.supabaseClient.from('notifications').insert({
                target_users: [teacher.adviser_id],
                title: 'Clinic Findings Update',
                message: `Nurse has updated findings for ${patient.name}: ${recommendation}. Please review.`,
                type: 'clinic_findings',
                student_id: patient.id,
                student_name: patient.name,
                related_record: visitId
            });

        } catch (error) {
            console.error('Error notifying teacher:', error);
        }
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
            
            let type = 'Check-out';
            let typeColor = 'bg-green-100 text-green-800';
            let icon = '↪️';

            if (visit.outcome === 'checked_in') {
                type = 'Check-in';
                typeColor = 'bg-blue-100 text-blue-800';
                icon = '↩️';
            } else if (!visit.outcome) {
                type = 'Referral';
                typeColor = 'bg-yellow-100 text-yellow-800';
                icon = '⏳';
            }

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

    async admitPatient(visitId, studentId) {
        try {
            if (!confirm('Admit this student to the clinic?')) return;

            // Update visit status
            const { error: visitError } = await window.supabaseClient
                .from('clinic_visits')
                .update({ 
                    outcome: 'checked_in',
                    treated_by: this.currentUser.id,
                    visit_time: new Date().toISOString() // Update time to actual arrival? Or keep referral time? Let's keep referral time but maybe add arrival_time field? For now, update visit_time to reflect arrival seems okay or just rely on outcome change.
                    // Actually, let's NOT change visit_time, as it tracks when the issue occurred/referral made.
                })
                .eq('id', visitId);

            if (visitError) throw visitError;

            // Update student status
            const { error: studentError } = await window.supabaseClient
                .from('students')
                .update({ current_status: 'in_clinic' })
                .eq('id', studentId);

            if (studentError) throw studentError;

            // Notify Parent
            // Get student details for notification
            const { data: student } = await window.supabaseClient
                .from('students')
                .select('full_name, parent_id')
                .eq('id', studentId)
                .single();

            if (student && student.parent_id) {
                await window.supabaseClient
                    .from('notifications')
                    .insert({
                        target_users: [student.parent_id],
                        title: 'Clinic Visit',
                        message: `Your child ${student.full_name} has been admitted to the school clinic.`,
                        type: 'clinic_admission',
                        student_id: studentId,
                        student_name: student.full_name
                    });
            }

            this.showNotification('Student admitted successfully', 'success');
            await this.loadDashboardData();
            await this.loadPage(this.currentPage);

        } catch (error) {
            console.error('Error admitting patient:', error);
            this.showNotification('Failed to admit patient: ' + error.message, 'error');
        }
    }

    async quickCheckout(studentId) {
        const ok = confirm('Are you sure you want to check out this student?');
        if (!ok) return;

        try {
            // Find active visit for this student
            const { data: visits } = await window.supabaseClient
                .from('clinic_visits')
                .select('id')
                .eq('student_id', studentId)
                .eq('outcome', 'checked_in')
                .order('visit_time', { ascending: false })
                .limit(1);

            const visitId = visits && visits.length > 0 ? visits[0].id : null;

            if (visitId) {
                // Update visit
                await window.supabaseClient
                    .from('clinic_visits')
                    .update({ 
                        outcome: 'discharged', // Generic discharge
                        notes: 'Quick checkout from dashboard'
                    })
                    .eq('id', visitId);
            } else {
                // Create a new visit record for this checkout if none exists (e.g. manual entry missing)
                // Actually, if no active visit, just log it? 
                // Let's just create a closed visit log.
                await window.supabaseClient
                    .from('clinic_visits')
                    .insert({
                        student_id: studentId,
                        visit_time: new Date().toISOString(),
                        reason: 'Quick Checkout',
                        outcome: 'discharged',
                        treated_by: this.currentUser.id,
                        notes: 'Quick checkout (no prior active visit found)'
                    });
            }

            // Update student status back to present
            await window.supabaseClient
                .from('students')
                .update({ current_status: 'present' })
                .eq('id', studentId);

            this.showNotification('Student checked out successfully', 'success');
            await this.loadDashboardData();
            await this.loadPage(this.currentPage);
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
            const checkoutPromises = this.currentPatients.map(patient => {
                if (window.EducareTrack) {
                    return window.EducareTrack.recordClinicVisit(patient.id, 'Batch Checkout', 'Checked out all patients', false);
                } else {
                    return this.recordClinicVisit(patient.id, 'Batch Checkout', 'Checked out all patients', false);
                }
            });
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
            let student;
            if (window.USE_SUPABASE && window.supabaseClient) {
                    const { data: studentData, error: sErr } = await window.supabaseClient
                        .from('students')
                        .select(`
                            id,
                            full_name,
                            class_id,
                            parent_students (
                                parent_id
                            )
                        `)
                        .eq('id', studentId)
                        .single();
                    if (sErr || !studentData) throw new Error('Student not found');
                    student = studentData;
                    
                    // Extract parent_id from relationship
                    const parentId = (student.parent_students && student.parent_students.length > 0) 
                        ? student.parent_students[0].parent_id 
                        : null;
                    
                    const timestamp = new Date();
                    const insertData = {
                        student_id: studentId,
                        reason: reason,
                        visit_time: timestamp,
                        notes: notes || '',
                        treated_by: this.currentUser.name || this.currentUser.id,
                        outcome: checkIn ? 'checked_in' : 'checked_out',
                        status: checkIn ? 'in_clinic' : 'discharged'
                    };
                    
                    const { data: inserted, error } = await window.supabaseClient
                        .from('clinic_visits')
                        .insert(insertData)
                        .select('id')
                        .single();
                    if (error) throw error;
                    
                    const newStatus = checkIn ? 'in_clinic' : 'in_school';
                    await window.supabaseClient.from('students').update({ current_status: newStatus }).eq('id', studentId);
                    
                    // Send notifications to parents and teachers
                    await this.sendClinicNotifications(
                        { 
                            id: studentId, 
                            classId: student.class_id, 
                            name: student.full_name,
                            parentId: parentId
                        },
                        checkIn,
                        reason,
                        notes
                    );
                
                return inserted.id;
            } else {
                // Firebase fallback
                let studentDoc;
                if (window.EducareTrack && window.EducareTrack.db) {
                    studentDoc = await window.EducareTrack.db.collection('students').doc(studentId).get();
                } else {
                    throw new Error('Database not available');
                }
                if (!studentDoc.exists) throw new Error('Student not found');
                student = studentDoc.data();
                
                const clinicData = {
                    studentId: studentId,
                    studentName: student.name,
                    classId: student.classId || student.class_id || '',
                    checkIn: checkIn,
                    timestamp: new Date(),
                    reason: reason,
                    notes: notes,
                    staffId: this.currentUser.id,
                    staffName: this.currentUser.name
                };

                if (window.EducareTrack && window.EducareTrack.db) {
                    await window.EducareTrack.db.collection('clinicVisits').add(clinicData);
                    await window.EducareTrack.db.collection('students').doc(studentId).update({
                        currentStatus: checkIn ? 'in_clinic' : 'in_school',
                        lastClinicVisit: new Date()
                    });
                } else {
                    throw new Error('Database not available');
                }
                
                // Send notifications to parents and teachers
                await this.sendClinicNotifications(
                    { id: studentId, parentId: student.parentId || student.parent_id, classId: student.classId || student.class_id, name: student.name },
                    checkIn,
                    reason,
                    notes
                );
            }

            return true;
        } catch (error) {
            console.error('Error recording clinic visit:', error);
            throw error;
        }
    }

    async sendClinicNotifications(student, checkIn, reason, notes) {
        try {
            const parentId = student.parentId || student.parent_id;
            let teacherId = null;
            
            // Validate parent ID
            if (!parentId) {
                console.warn('No parent ID found for student:', student.id);
            }
            
            // Find homeroom teacher
            const classId = student.classId || student.class_id;
            if (classId) {
                if (window.USE_SUPABASE && window.supabaseClient) {
                    const { data: homeroom, error: hrErr } = await window.supabaseClient
                        .from('teachers')
                        .select('id')
                        .eq('class_id', classId)
                        .eq('is_homeroom', true)
                        .limit(1);
                    if (!hrErr && Array.isArray(homeroom) && homeroom.length > 0) {
                        teacherId = homeroom[0].id;
                    }
                } else if (window.EducareTrack && window.EducareTrack.db) {
                    const teacherQuery = await window.EducareTrack.db
                        .collection('users')
                        .where('role', '==', 'teacher')
                        .where('class_id', '==', classId)
                        .where('is_homeroom', '==', true)
                        .limit(1)
                        .get();
                    if (!teacherQuery.empty) {
                        teacherId = teacherQuery.docs[0].id;
                    }
                } else {
                    throw new Error('Database not available');
                }
            }

            // Build target users array, ensuring no null/undefined values
            const targetUsers = [];
            if (parentId) targetUsers.push(parentId);
            if (teacherId) targetUsers.push(teacherId);

            // Check if we have any valid recipients
            if (targetUsers.length === 0) {
                console.warn('No valid recipients for clinic notification:', {
                    studentId: student.id,
                    parentId: parentId,
                    teacherId: teacherId,
                    classId: classId
                });
                // Don't send notification if no recipients
                return;
            }

            const action = checkIn ? 'checked into' : 'checked out from';
            const notificationTitle = checkIn ? 'Clinic Check-in' : 'Clinic Check-out';
            
            let message = `${student.name} has ${action} the clinic.`;
            if (reason) message += `\nReason: ${reason}`;
            if (notes) message += `\nNotes: ${notes}`;

            const notificationData = {
                type: 'clinic',
                title: notificationTitle,
                message: message,
                target_users: targetUsers,
                student_id: student.id,
                student_name: student.name
            };
            
            console.log('Sending clinic notification to:', targetUsers);
            
            if (window.EducareTrack && typeof window.EducareTrack.createNotification === 'function') {
                await window.EducareTrack.createNotification(notificationData);
            } else if (window.USE_SUPABASE && window.supabaseClient) {
                // Supabase notification
                await window.supabaseClient.from('notifications').insert({
                    target_users: targetUsers,
                    title: notificationTitle,
                    message: message,
                    type: 'clinic',
                    student_id: student.id,
                    student_name: student.name,
                    read_by: [], // Initialize as empty array
                    created_at: new Date().toISOString()
                });
            } else {
                // Firebase notification using db object
                const db = window.EducareTrack ? window.EducareTrack.db : null;
                if (db) {
                    await db.collection('notifications').add({
                        ...notificationData,
                        createdAt: new Date().toISOString()
                    });
                } else {
                    throw new Error('Database not available');
                }
            }
            
            console.log(`Clinic notification sent for ${student.name}'s ${checkIn ? 'check-in' : 'check-out'}`);
            
        } catch (error) {
            console.error('Error sending clinic notifications:', error);
        }
    }

    async quickCheckIn(reason) {
        // Redirect to check-in page with reason parameter
        window.location.href = `clinic-checkin.html?reason=${encodeURIComponent(reason)}`;
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
