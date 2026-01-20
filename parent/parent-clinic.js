class ParentClinic {
    constructor() {
        this.currentUser = null;
        this.children = [];
        this.clinicVisits = [];
        this.filteredVisits = [];
        this.init();
    }

    async init() {
        try {
            this.showLoading();
            
            // Wait for EducareTrack to be ready
            if (!window.EducareTrack) {
                setTimeout(() => this.init(), 100);
                return;
            }

            // Check if user is logged in
            const savedUser = localStorage.getItem('educareTrack_user');
            if (!savedUser) {
                window.location.href = '../index.html';
                return;
            }

            this.currentUser = JSON.parse(savedUser);
            
            // Verify user is a parent
            if (this.currentUser.role !== 'parent') {
                alert('Access denied. Parent role required.');
                window.location.href = '../index.html';
                return;
            }

            this.updateUI();
            await this.loadChildren();
            await this.loadClinicData();
            this.initEventListeners();
            this.initRealTimeListeners();
            
            this.hideLoading();
        } catch (error) {
            console.error('Parent clinic initialization failed:', error);
            this.hideLoading();
        }
    }

    updateUI() {
        document.getElementById('userName').textContent = this.currentUser.name;
        document.getElementById('userRole').textContent = this.currentUser.role;
        document.getElementById('userInitials').textContent = this.currentUser.name
            .split(' ')
            .map(n => n[0])
            .join('')
            .substring(0, 2)
            .toUpperCase();

        this.updateCurrentTime();
        setInterval(() => this.updateCurrentTime(), 60000);
    }

    updateCurrentTime() {
        const now = new Date();
        document.getElementById('currentTime').textContent = now.toLocaleString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    async loadChildren() {
        try {
            this.children = await EducareTrack.getStudentsByParent(this.currentUser.id);
            this.populateChildFilter();
            
            // Load notification count
            await this.loadNotificationCount();

        } catch (error) {
            console.error('Error loading children:', error);
        }
    }

    populateChildFilter() {
        const filter = document.getElementById('childFilter');
        
        // Clear existing options except "All Children"
        while (filter.children.length > 1) {
            filter.removeChild(filter.lastChild);
        }
        
        // Add children options
        this.children.forEach(child => {
            const option = document.createElement('option');
            option.value = child.id;
            option.textContent = child.name;
            filter.appendChild(option);
        });
    }

    async loadClinicData() {
        try {
            // Set default date range (last 30 days)
            const defaultDateTo = new Date();
            const defaultDateFrom = new Date();
            defaultDateFrom.setDate(defaultDateFrom.getDate() - 30);
            
            document.getElementById('dateFrom').value = defaultDateFrom.toISOString().split('T')[0];
            document.getElementById('dateTo').value = defaultDateTo.toISOString().split('T')[0];
            
            await this.applyFilters();

        } catch (error) {
            console.error('Error loading clinic data:', error);
        }
    }

    async applyFilters() {
        try {
            this.showLoading();
            
            const childId = document.getElementById('childFilter').value;
            const dateFrom = document.getElementById('dateFrom').value;
            const dateTo = document.getElementById('dateTo').value;
            const visitType = document.getElementById('visitTypeFilter').value;

            // Convert dates to Date objects
            const startDate = new Date(dateFrom);
            const endDate = new Date(dateTo);
            endDate.setHours(23, 59, 59, 999); // End of day

            let clinicData = [];

            // Get clinic visits for selected children
            if (childId === 'all') {
                // Get all children's clinic visits
                for (const child of this.children) {
                    const childVisits = await this.getChildClinicVisits(child.id, startDate, endDate);
                    clinicData = clinicData.concat(childVisits);
                }
            } else {
                // Get specific child's clinic visits
                clinicData = await this.getChildClinicVisits(childId, startDate, endDate);
            }

            // Apply visit type filter
            if (visitType === 'checkin') {
                clinicData = clinicData.filter(visit => visit.checkIn);
            } else if (visitType === 'checkout') {
                clinicData = clinicData.filter(visit => !visit.checkIn);
            } else if (visitType === 'urgent') {
                clinicData = clinicData.filter(visit => 
                    visit.recommendations && 
                    (visit.recommendations === 'fetch_child' || 
                     visit.recommendations === 'immediate_pickup' || 
                     visit.recommendations === 'medical_attention')
                );
            }

            // Sort by timestamp (newest first)
            clinicData.sort((a, b) => new Date(b.timestamp?.toDate()) - new Date(a.timestamp?.toDate()));

            this.clinicVisits = clinicData;
            this.filteredVisits = clinicData;
            
            this.updateStatistics();
            this.updateClinicTable();
            
            this.hideLoading();

        } catch (error) {
            console.error('Error applying filters:', error);
            this.hideLoading();
        }
    }

    async getChildClinicVisits(childId, startDate, endDate) {
        try {
            const snapshot = await firebase.firestore()
                .collection('clinicVisits')
                .where('studentId', '==', childId)
                .where('timestamp', '>=', startDate)
                .where('timestamp', '<=', endDate)
                .orderBy('timestamp', 'desc')
                .get();

            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error(`Error getting clinic visits for child ${childId}:`, error);
            return [];
        }
    }

    updateStatistics() {
        const totalVisits = this.filteredVisits.length;
        
        // Count active cases (check-ins without check-outs in the same day)
        const activeCases = this.filteredVisits.filter(visit => {
            if (!visit.checkIn) return false;
            
            const visitDate = visit.timestamp?.toDate().toDateString();
            const hasCheckout = this.filteredVisits.some(v => 
                v.studentId === visit.studentId &&
                !v.checkIn &&
                v.timestamp?.toDate().toDateString() === visitDate
            );
            
            return !hasCheckout;
        }).length;

        // Find most common reason
        const reasonCounts = {};
        this.filteredVisits.forEach(visit => {
            if (visit.reason) {
                reasonCounts[visit.reason] = (reasonCounts[visit.reason] || 0) + 1;
            }
        });
        
        let commonReason = 'N/A';
        let maxCount = 0;
        Object.entries(reasonCounts).forEach(([reason, count]) => {
            if (count > maxCount) {
                maxCount = count;
                commonReason = reason;
            }
        });

        // Count urgent visits
        const urgentVisits = this.filteredVisits.filter(visit => 
            visit.recommendations && 
            (visit.recommendations === 'fetch_child' || 
             visit.recommendations === 'immediate_pickup' || 
             visit.recommendations === 'medical_attention')
        ).length;

        document.getElementById('totalVisits').textContent = totalVisits;
        document.getElementById('activeCases').textContent = activeCases;
        document.getElementById('commonReason').textContent = commonReason.length > 20 ? 
            commonReason.substring(0, 20) + '...' : commonReason;
        document.getElementById('urgentVisits').textContent = urgentVisits;
        document.getElementById('resultsCount').textContent = `Showing ${totalVisits} visits`;
    }

    updateClinicTable() {
        const container = document.getElementById('clinicTableBody');
        
        if (this.filteredVisits.length === 0) {
            container.innerHTML = `
                <tr>
                    <td colspan="6" class="px-6 py-8 text-center text-gray-500">
                        <i class="fas fa-heartbeat text-3xl mb-2"></i>
                        <p>No clinic visits found</p>
                        <p class="text-sm">Try adjusting your filters</p>
                    </td>
                </tr>
            `;
            return;
        }

        container.innerHTML = this.filteredVisits.map(visit => {
            const child = this.children.find(c => c.id === visit.studentId);
            const visitDate = visit.timestamp?.toDate();
            
            // Check if urgent
            const isUrgent = visit.recommendations && 
                (visit.recommendations === 'fetch_child' || 
                 visit.recommendations === 'immediate_pickup' || 
                 visit.recommendations === 'medical_attention');
            
            const urgentBadge = isUrgent ? 
                '<span class="ml-2 px-2 py-1 bg-red-100 text-red-800 text-xs font-semibold rounded-full">URGENT</span>' : '';
            
            return `
                <tr class="hover:bg-gray-50 ${isUrgent ? 'urgent-case' : ''}">
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="text-sm text-gray-900">${this.formatDate(visitDate)}</div>
                        <div class="text-sm text-gray-500">${this.formatTime(visitDate)}</div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="flex items-center">
                            <div class="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center mr-3">
                                <span class="text-green-600 font-semibold text-xs">${child ? child.name.split(' ').map(n => n[0]).join('').substring(0, 2) : '??'}</span>
                            </div>
                            <div class="text-sm font-medium text-gray-900">${child ? child.name : 'Unknown'} ${urgentBadge}</div>
                        </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <span class="px-2 py-1 rounded-full text-xs font-medium ${
                            visit.checkIn ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                        }">
                            ${visit.checkIn ? 'Check-in' : 'Check-out'}
                        </span>
                    </td>
                    <td class="px-6 py-4">
                        <div class="text-sm text-gray-900">${visit.reason || 'Not specified'}</div>
                        ${visit.medicalFindings ? `
                            <div class="text-xs text-gray-500 mt-1">
                                <strong>Findings:</strong> ${visit.medicalFindings.length > 50 ? visit.medicalFindings.substring(0, 50) + '...' : visit.medicalFindings}
                            </div>
                        ` : ''}
                        ${visit.treatmentGiven ? `
                            <div class="text-xs text-gray-500 mt-1">
                                <strong>Treatment:</strong> ${visit.treatmentGiven.length > 50 ? visit.treatmentGiven.substring(0, 50) + '...' : visit.treatmentGiven}
                            </div>
                        ` : ''}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        ${visit.staffName || 'Unknown'}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button onclick="parentClinic.viewVisitDetails('${visit.id}')" 
                                class="text-green-600 hover:text-green-900 flex items-center">
                            <i class="fas fa-eye mr-1"></i>View Details
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    async viewVisitDetails(visitId) {
        try {
            const visit = this.filteredVisits.find(v => v.id === visitId);
            if (!visit) return;

            const modal = document.getElementById('visitDetailsModal');
            const content = document.getElementById('visitDetailsContent');

            const child = this.children.find(c => c.id === visit.studentId);
            const visitDate = visit.timestamp?.toDate();

            // Check if urgent
            const isUrgent = visit.recommendations && 
                (visit.recommendations === 'fetch_child' || 
                 visit.recommendations === 'immediate_pickup' || 
                 visit.recommendations === 'medical_attention');

            const urgentSection = isUrgent ? `
                <div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                    <div class="flex items-center">
                        <i class="fas fa-exclamation-triangle text-red-600 mr-2"></i>
                        <span class="text-red-800 font-semibold">URGENT CASE</span>
                    </div>
                    <p class="text-red-700 text-sm mt-1">
                        This case requires immediate attention. Please review the recommendations below.
                    </p>
                </div>
            ` : '';

            content.innerHTML = `
                <div class="space-y-4">
                    <!-- Header -->
                    <div class="flex items-center justify-between">
                        <div class="flex items-center">
                            <div class="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mr-4">
                                <i class="fas fa-heartbeat text-red-600"></i>
                            </div>
                            <div>
                                <h3 class="text-xl font-bold text-gray-800">Clinic Visit</h3>
                                <p class="text-gray-600">${this.formatDate(visitDate)} at ${this.formatTime(visitDate)}</p>
                            </div>
                        </div>
                        <span class="px-3 py-1 rounded-full text-sm font-medium ${
                            visit.checkIn ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                        }">
                            ${visit.checkIn ? 'Check-in' : 'Check-out'}
                        </span>
                    </div>

                    ${urgentSection}

                    <!-- Student Information -->
                    <div class="bg-gray-50 rounded-lg p-4">
                        <h4 class="font-semibold text-gray-700 mb-2 flex items-center">
                            <i class="fas fa-user-graduate mr-2"></i>
                            Student Information
                        </h4>
                        <div class="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span class="text-gray-600">Name:</span>
                                <p class="font-medium">${child ? child.name : 'Unknown'}</p>
                            </div>
                            <div>
                                <span class="text-gray-600">Grade & Level:</span>
                                <p class="font-medium">${child ? `${child.grade} • ${child.level}` : 'N/A'}</p>
                            </div>
                            <div>
                                <span class="text-gray-600">Class:</span>
                                <p class="font-medium">${child ? child.classId || 'Not assigned' : 'N/A'}</p>
                            </div>
                            <div>
                                <span class="text-gray-600">Student ID:</span>
                                <p class="font-medium">${child ? child.studentId || 'N/A' : 'N/A'}</p>
                            </div>
                        </div>
                    </div>

                    <!-- Visit Details -->
                    <div class="bg-gray-50 rounded-lg p-4">
                        <h4 class="font-semibold text-gray-700 mb-2 flex items-center">
                            <i class="fas fa-clipboard-list mr-2"></i>
                            Visit Details
                        </h4>
                        <div class="space-y-3">
                            <div>
                                <span class="text-gray-600 block text-sm mb-1">Reason for Visit:</span>
                                <p class="font-medium">${visit.reason || 'Not specified'}</p>
                            </div>
                            ${visit.medicalFindings ? `
                            <div>
                                <span class="text-gray-600 block text-sm mb-1">Medical Findings:</span>
                                <p class="text-gray-700 bg-white p-3 rounded border">${visit.medicalFindings}</p>
                            </div>
                            ` : ''}
                            ${visit.treatmentGiven ? `
                            <div>
                                <span class="text-gray-600 block text-sm mb-1">Treatment Given:</span>
                                <p class="text-gray-700 bg-white p-3 rounded border">${visit.treatmentGiven}</p>
                            </div>
                            ` : ''}
                            ${visit.recommendations ? `
                            <div>
                                <span class="text-gray-600 block text-sm mb-1">Recommendations:</span>
                                <p class="text-gray-700 bg-white p-3 rounded border font-medium ${
                                    isUrgent ? 'text-red-600' : ''
                                }">${this.getRecommendationText(visit.recommendations)}</p>
                            </div>
                            ` : ''}
                            ${visit.additionalNotes ? `
                            <div>
                                <span class="text-gray-600 block text-sm mb-1">Additional Notes:</span>
                                <p class="text-gray-700 bg-white p-3 rounded border">${visit.additionalNotes}</p>
                            </div>
                            ` : ''}
                            <div class="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <span class="text-gray-600">Recorded by:</span>
                                    <p class="font-medium">${visit.staffName || 'Unknown'}</p>
                                </div>
                                <div>
                                    <span class="text-gray-600">Time:</span>
                                    <p class="font-medium">${this.formatTime(visitDate)}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Related Information -->
                    ${visit.checkIn ? `
                    <div class="bg-blue-50 rounded-lg p-4 border border-blue-200">
                        <div class="flex items-center">
                            <i class="fas fa-info-circle text-blue-600 mr-2"></i>
                            <span class="text-blue-800 font-medium">Check-in Record</span>
                        </div>
                        <p class="text-blue-700 text-sm mt-1">
                            Your child was checked into the clinic. You will receive another notification when they check out.
                        </p>
                    </div>
                    ` : `
                    <div class="bg-green-50 rounded-lg p-4 border border-green-200">
                        <div class="flex items-center">
                            <i class="fas fa-check-circle text-green-600 mr-2"></i>
                            <span class="text-green-800 font-medium">Check-out Complete</span>
                        </div>
                        <p class="text-green-700 text-sm mt-1">
                            Your child has been checked out from the clinic and returned to class.
                        </p>
                    </div>
                    `}
                </div>
            `;

            modal.classList.remove('hidden');

        } catch (error) {
            console.error('Error loading visit details:', error);
            this.showNotification('Error loading visit details', 'error');
        }
    }

    getRecommendationText(recommendation) {
        const recommendations = {
            'return_to_class': 'Return to class with monitoring',
            'rest_in_clinic': 'Rest in clinic for observation',
            'fetch_child': 'Recommended to fetch your child',
            'immediate_pickup': 'Immediate pickup required',
            'medical_attention': 'Refer to doctor/hospital',
            'follow_up': 'Follow-up tomorrow'
        };
        
        return recommendations[recommendation] || recommendation;
    }

    // Real-time listeners
    initRealTimeListeners() {
        this.setupClinicVisitsListener();
        this.setupNotificationsListener();
    }

    setupClinicVisitsListener() {
        if (!this.currentUser) return;

        // Get children IDs for this parent
        const childIds = this.children.map(child => child.id);
        
        if (childIds.length === 0) return;

        this.clinicVisitsListener = firebase.firestore()
            .collection('clinicVisits')
            .where('studentId', 'in', childIds)
            .orderBy('timestamp', 'desc')
            .limit(10)
            .onSnapshot(snapshot => {
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'added') {
                        const visit = { id: change.doc.id, ...change.doc.data() };
                        this.handleNewClinicVisit(visit);
                    }
                });
            }, error => {
                console.error('Clinic visits listener error:', error);
            });
    }

    setupNotificationsListener() {
        if (!this.currentUser) return;

        this.notificationsListener = firebase.firestore()
            .collection('notifications')
            .where('targetUsers', 'array-contains', this.currentUser.id)
            .where('type', '==', 'clinic')
            .orderBy('createdAt', 'desc')
            .limit(5)
            .onSnapshot(snapshot => {
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'added') {
                        const notification = { id: change.doc.id, ...change.doc.data() };
                        this.handleNewNotification(notification);
                    }
                });
            }, error => {
                console.error('Notifications listener error:', error);
            });
    }

    handleNewClinicVisit(visit) {
        console.log('New clinic visit:', visit);
        
        // Reload data to include the new visit
        this.applyFilters();
        
        // Show notification for new check-ins
        if (visit.checkIn) {
            const child = this.children.find(c => c.id === visit.studentId);
            if (child) {
                this.showNotification(
                    `🏥 ${child.name} visited clinic`,
                    `Reason: ${visit.reason || 'Not specified'}`,
                    'info'
                );
            }
        }
    }

    handleNewNotification(notification) {
        console.log('New clinic notification:', notification);
        
        // Update notification badge
        this.loadNotificationCount();
        
        // Show urgent notifications immediately
        if (notification.isUrgent) {
            this.showUrgentNotification(notification);
        }
    }

    showUrgentNotification(notification) {
        const alert = document.getElementById('urgentAlert');
        const title = document.getElementById('urgentAlertTitle');
        const message = document.getElementById('urgentAlertMessage');
        
        title.textContent = notification.title;
        message.textContent = notification.message;
        alert.classList.remove('hidden');
        
        // Auto-hide after 10 seconds
        setTimeout(() => {
            alert.classList.add('hidden');
        }, 10000);
    }

    async loadNotificationCount() {
        try {
            const count = await EducareTrack.getUnreadNotificationCount(this.currentUser.id);
            const badge = document.getElementById('notificationBadge');
            
            if (count > 0) {
                badge.textContent = count > 99 ? '99+' : count.toString();
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        } catch (error) {
            console.error('Error loading notification count:', error);
        }
    }

    initEventListeners() {
        // Sidebar toggle
        document.getElementById('sidebarToggle').addEventListener('click', () => {
            this.toggleSidebar();
        });

        // Logout
        document.getElementById('logoutBtn').addEventListener('click', () => {
            if (confirm('Are you sure you want to logout?')) {
                EducareTrack.logout();
                window.location.href = '../index.html';
            }
        });

        // Apply filters
        document.getElementById('applyFilters').addEventListener('click', () => {
            this.applyFilters();
        });

        // Reset filters
        document.getElementById('resetFilters').addEventListener('click', () => {
            this.resetFilters();
        });

        // Close modals on outside click
        document.getElementById('visitDetailsModal').addEventListener('click', (e) => {
            if (e.target.id === 'visitDetailsModal') {
                this.closeVisitDetailsModal();
            }
        });

        // Escape key to close modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeVisitDetailsModal();
            }
        });
    }

    resetFilters() {
        document.getElementById('childFilter').value = 'all';
        document.getElementById('visitTypeFilter').value = 'all';
        
        const defaultDateTo = new Date();
        const defaultDateFrom = new Date();
        defaultDateFrom.setDate(defaultDateFrom.getDate() - 30);
        
        document.getElementById('dateFrom').value = defaultDateFrom.toISOString().split('T')[0];
        document.getElementById('dateTo').value = defaultDateTo.toISOString().split('T')[0];
        
        this.applyFilters();
    }

    closeVisitDetailsModal() {
        document.getElementById('visitDetailsModal').classList.add('hidden');
    }

    toggleSidebar() {
        const sidebar = document.querySelector('.sidebar');
        const mainContent = document.querySelector('.main-content');
        
        if (sidebar.classList.contains('collapsed')) {
            sidebar.classList.remove('collapsed');
            mainContent.classList.remove('ml-16');
            mainContent.classList.add('ml-64');
        } else {
            sidebar.classList.add('collapsed');
            mainContent.classList.remove('ml-64');
            mainContent.classList.add('ml-16');
        }
    }

    showLoading() {
        document.getElementById('loadingSpinner').classList.remove('hidden');
    }

    hideLoading() {
        document.getElementById('loadingSpinner').classList.add('hidden');
    }

    showNotification(message, type = 'info') {
        if (window.EducareTrack && typeof window.EducareTrack.showNormalNotification === 'function') {
            window.EducareTrack.showNormalNotification({ title: type === 'error' ? 'Error' : (type === 'warning' ? 'Warning' : 'Info'), message, type });
        }
    }

    createCustomNotification(message, type = 'info') {
        if (window.EducareTrack && typeof window.EducareTrack.showNormalNotification === 'function') {
            window.EducareTrack.showNormalNotification({ title: type === 'error' ? 'Error' : (type === 'warning' ? 'Warning' : 'Info'), message, type });
        }
    }

    formatDate(date) {
        if (!date) return 'N/A';
        try {
            return new Date(date).toLocaleDateString('en-PH', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch (error) {
            return 'Invalid Date';
        }
    }

    formatTime(date) {
        if (!date) return 'N/A';
        try {
            return new Date(date).toLocaleTimeString('en-PH', {
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            return 'Invalid Time';
        }
    }

    destroy() {
        if (this.clinicVisitsListener) {
            this.clinicVisitsListener();
        }
        if (this.notificationsListener) {
            this.notificationsListener();
        }
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    window.parentClinic = new ParentClinic();
});
