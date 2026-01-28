// Clinic Visits History JavaScript
class ClinicVisits {
    constructor() {
        this.currentUser = null;
        this.visits = [];
        this.filteredVisits = [];
        this.currentPage = 1;
        this.pageSize = 10;
        this.filters = {
            dateFrom: null,
            dateTo: null,
            visitType: 'all',
            reason: 'all'
        };
        
        this.init();
    }

    async init() {
        try {
            await this.checkAuth();
            await this.loadVisits();
            this.setupEventListeners();
            this.setupRealTimeListeners();
            console.log('Clinic Visits initialized');
        } catch (error) {
            console.error('Error initializing clinic visits:', error);
            this.showError('Failed to initialize clinic visits');
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
            // Show loading state
            const tbody = document.getElementById('visitsTableBody');
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="6" class="px-6 py-10 text-center text-gray-500">
                            <div class="flex justify-center items-center">
                                <svg class="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span class="ml-2 text-lg">Loading visits...</span>
                            </div>
                        </td>
                    </tr>
                `;
            }

            if (window.USE_SUPABASE && window.supabaseClient) {
                // Fetch visits and students in parallel
                const [visitsResult, studentsResult] = await Promise.all([
                    window.supabaseClient
                        .from('clinic_visits')
                        .select('id,student_id,reason,visit_time,notes,treated_by,outcome,medical_findings,treatment_given,additional_notes,recommendations')
                        .order('visit_time', { ascending: false }),
                    window.supabaseClient
                        .from('students')
                        .select('id, full_name')
                ]);

                if (visitsResult.error) throw visitsResult.error;
                if (studentsResult.error) throw studentsResult.error;

                const studentMap = new Map(studentsResult.data.map(s => [s.id, s.full_name]));

                this.visits = (visitsResult.data || []).map(v => ({
                    id: v.id,
                    studentId: v.student_id,
                    studentName: studentMap.get(v.student_id) || 'Unknown Student',
                    classId: '', // Will be loaded separately if needed
                    reason: v.reason || '',
                    checkIn: v.outcome !== 'checked_out', // Assume check-in unless explicitly checked out
                    timestamp: v.visit_time ? new Date(v.visit_time) : new Date(),
                    notes: v.notes || '',
                    staffName: v.treated_by || '',
                    recommendations: v.recommendations || v.outcome || '',
                    medicalFindings: v.medical_findings || '',
                    treatmentGiven: v.treatment_given || '',
                    additionalNotes: v.additional_notes || v.notes || ''
                }));
                this.applyFilters();
            } else {
                const db = window.EducareTrack ? window.EducareTrack.db : null;
                if (!db) {
                    throw new Error('Database not available');
                }
                const snapshot = await db.collection('clinicVisits')
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
                this.applyFilters();
            }
        } catch (error) {
            console.error('Error loading visits:', error);
            this.showError('Failed to load clinic visits');
        }
    }

    setupRealTimeListeners() {
        if (!window.supabaseClient) return;

        if (this.realtimeChannel) {
            window.supabaseClient.removeChannel(this.realtimeChannel);
        }

        this.realtimeChannel = window.supabaseClient.channel('clinic_visits_list_realtime');
        
        this.realtimeChannel.on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'clinic_visits' 
        }, () => {
            console.log('Clinic visits update received');
            this.loadVisits();
        });

        this.realtimeChannel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('Clinic visits list connected to realtime updates');
            }
        });
    }

    setupEventListeners() {
        // Set default dates
        const today = new Date();
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(today.getDate() - 7);
        
        document.getElementById('dateFrom').value = oneWeekAgo.toISOString().split('T')[0];
        document.getElementById('dateTo').value = today.toISOString().split('T')[0];
        
        this.filters.dateFrom = oneWeekAgo;
        this.filters.dateTo = today;
    }

    applyFilters() {
        const dateFrom = document.getElementById('dateFrom').value ? new Date(document.getElementById('dateFrom').value) : null;
        const dateTo = document.getElementById('dateTo').value ? new Date(document.getElementById('dateTo').value) : null;
        const visitType = document.getElementById('visitType').value;
        const reason = document.getElementById('reasonFilter').value;

        this.filters = { dateFrom, dateTo, visitType, reason };

        this.filteredVisits = this.visits.filter(visit => {
            // Date filter
            if (dateFrom && visit.timestamp < dateFrom) return false;
            if (dateTo) {
                const visitDate = new Date(visit.timestamp);
                visitDate.setHours(23, 59, 59, 999);
                if (visitDate > dateTo) return false;
            }

            // Visit type filter
            if (visitType !== 'all') {
                if (visitType === 'checkin' && !visit.checkIn) return false;
                if (visitType === 'checkout' && visit.checkIn) return false;
            }

            // Reason filter
            if (reason !== 'all' && visit.reason !== reason) return false;

            return true;
        });

        this.updateStatistics();
        this.updateTable();
    }

    clearFilters() {
        document.getElementById('dateFrom').value = '';
        document.getElementById('dateTo').value = '';
        document.getElementById('visitType').value = 'all';
        document.getElementById('reasonFilter').value = 'all';
        
        this.filters = {
            dateFrom: null,
            dateTo: null,
            visitType: 'all',
            reason: 'all'
        };

        this.applyFilters();
    }

    updateStatistics() {
        const totalVisits = this.filteredVisits.length;
        const checkinsCount = this.filteredVisits.filter(v => v.checkIn).length;
        const checkoutsCount = this.filteredVisits.filter(v => !v.checkIn).length;
        
        const uniqueStudents = new Set(this.filteredVisits.map(v => v.studentId)).size;

        document.getElementById('totalVisits').textContent = totalVisits;
        document.getElementById('checkinsCount').textContent = checkinsCount;
        document.getElementById('checkoutsCount').textContent = checkoutsCount;
        document.getElementById('uniqueStudents').textContent = uniqueStudents;
    }

    updateTable() {
        const tbody = document.getElementById('visitsTableBody');
        const startIndex = (this.currentPage - 1) * this.pageSize;
        const endIndex = startIndex + this.pageSize;
        const paginatedVisits = this.filteredVisits.slice(startIndex, endIndex);

        if (paginatedVisits.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="px-6 py-4 text-center text-gray-500">
                        No visits found matching the current filters.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = paginatedVisits.map(visit => {
            const time = new Date(visit.timestamp).toLocaleTimeString('en-PH', {
                hour: '2-digit',
                minute: '2-digit'
            });
            const date = new Date(visit.timestamp).toLocaleDateString('en-PH');
            const type = visit.checkIn ? 'Check-in' : 'Check-out';
            const typeColor = visit.checkIn ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800';

            return `
                <tr>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="text-sm font-medium text-gray-900">${visit.studentName}</div>
                        <div class="text-sm text-gray-500">${date} ${time}</div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${this.capitalizeFirstLetter(visit.reason)}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${typeColor}">
                            ${type}
                        </span>
                    </td>
                    <td class="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                        ${visit.notes || 'No notes'}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        ${visit.staffName || 'N/A'}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button onclick="clinicVisits.viewVisitDetails('${visit.id}')" class="text-blue-600 hover:text-blue-900 mr-3">
                            View
                        </button>
                        <button onclick="clinicVisits.editVisit('${visit.id}')" class="text-green-600 hover:text-green-900">
                            Edit
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        this.updatePaginationInfo();
    }

    updatePaginationInfo() {
        const totalRecords = this.filteredVisits.length;
        const totalPages = Math.ceil(totalRecords / this.pageSize);
        const startItem = ((this.currentPage - 1) * this.pageSize) + 1;
        const endItem = Math.min(this.currentPage * this.pageSize, totalRecords);

        document.getElementById('showingFrom').textContent = startItem;
        document.getElementById('showingTo').textContent = endItem;
        document.getElementById('totalRecords').textContent = totalRecords;
    }

    nextPage() {
        const totalPages = Math.ceil(this.filteredVisits.length / this.pageSize);
        if (this.currentPage < totalPages) {
            this.currentPage++;
            this.updateTable();
        }
    }

    previousPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.updateTable();
        }
    }

    viewVisitDetails(visitId) {
        const visit = this.visits.find(v => v.id === visitId);
        if (!visit) return;
        const time = new Date(visit.timestamp).toLocaleTimeString('en-PH', {
            hour: '2-digit',
            minute: '2-digit'
        });
        const date = new Date(visit.timestamp).toLocaleDateString('en-PH', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        let overlay = document.getElementById('clinicVisitDetailsModal');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'clinicVisitDetailsModal';
            overlay.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 hidden flex items-center justify-center p-4';
            const container = document.createElement('div');
            container.className = 'bg-white rounded-lg shadow-xl max-w-lg w-full overflow-hidden';
            const header = document.createElement('div');
            header.className = 'px-6 py-4 border-b flex justify-between items-center bg-gray-50';
            const titleEl = document.createElement('h3');
            titleEl.className = 'text-lg font-bold text-gray-800 flex items-center';
            titleEl.innerHTML = '<i class="fas fa-clipboard-list text-blue-600 mr-2"></i> Visit Details';
            const closeBtn = document.createElement('button');
            closeBtn.className = 'text-gray-400 hover:text-gray-600 focus:outline-none';
            closeBtn.innerHTML = '<i class="fas fa-times text-xl"></i>';
            closeBtn.onclick = () => overlay.classList.add('hidden');
            header.appendChild(titleEl);
            header.appendChild(closeBtn);
            
            const body = document.createElement('div');
            body.id = 'clinicVisitDetailsBody';
            body.className = 'px-6 py-4 text-sm text-gray-700 max-h-[70vh] overflow-y-auto';
            
            container.appendChild(header);
            container.appendChild(body);
            overlay.appendChild(container);
            document.body.appendChild(overlay);
        }
        const body = document.getElementById('clinicVisitDetailsBody');
        body.innerHTML = `
            <div class="space-y-4">
                <div class="bg-blue-50 p-4 rounded-lg border border-blue-100">
                    <div class="grid grid-cols-2 gap-y-3 gap-x-6">
                        <div class="flex flex-col">
                            <span class="text-xs font-bold text-blue-500 uppercase tracking-wider">Student</span>
                            <span class="font-bold text-gray-900 text-lg">${visit.studentName}</span>
                        </div>
                        <div class="flex flex-col">
                            <span class="text-xs font-bold text-blue-500 uppercase tracking-wider">Date & Time</span>
                            <span class="font-medium text-gray-900">${date} at ${time}</span>
                        </div>
                        <div class="flex flex-col">
                            <span class="text-xs font-bold text-blue-500 uppercase tracking-wider">Type</span>
                            <span class="font-medium ${visit.checkIn ? 'text-blue-600' : 'text-green-600'} flex items-center">
                                <i class="fas ${visit.checkIn ? 'fa-sign-in-alt' : 'fa-sign-out-alt'} mr-1"></i>
                                ${visit.checkIn ? 'Check-in' : 'Check-out'}
                            </span>
                        </div>
                        <div class="flex flex-col">
                            <span class="text-xs font-bold text-blue-500 uppercase tracking-wider">Attending Staff</span>
                            <span class="font-medium text-gray-900">${visit.staffName || 'N/A'}</span>
                        </div>
                        <div class="flex flex-col">
                            <span class="text-xs font-bold text-blue-500 uppercase tracking-wider">Urgency</span>
                            <span class="font-medium ${visit.urgency === 'urgent' ? 'text-red-600 font-bold' : 'text-gray-900'} capitalize">
                                ${visit.urgency === 'urgent' ? '<i class="fas fa-exclamation-circle mr-1"></i>' : ''}
                                ${visit.urgency}
                            </span>
                        </div>
                    </div>
                </div>

                <div>
                    <h4 class="flex items-center text-xs font-bold text-gray-500 uppercase mb-1">
                        Reason for Visit
                    </h4>
                    <div class="bg-gray-50 p-3 rounded-md border border-gray-200 text-gray-800 font-medium">${visit.reason}</div>
                </div>

                ${visit.medicalFindings ? `
                <div>
                    <h4 class="flex items-center text-xs font-bold text-green-600 uppercase mb-1">
                        <i class="fas fa-stethoscope mr-1"></i> Medical Findings
                    </h4>
                    <div class="bg-green-50 p-3 rounded-md border border-green-200 text-green-900">${visit.medicalFindings}</div>
                </div>` : ''}

                ${visit.treatmentGiven ? `
                <div>
                    <h4 class="flex items-center text-xs font-bold text-purple-600 uppercase mb-1">
                        <i class="fas fa-pills mr-1"></i> Treatment Given
                    </h4>
                    <div class="bg-purple-50 p-3 rounded-md border border-purple-200 text-purple-900">${visit.treatmentGiven}</div>
                </div>` : ''}

                ${visit.recommendations ? `
                <div>
                    <h4 class="flex items-center text-xs font-bold text-orange-600 uppercase mb-1">
                        <i class="fas fa-clipboard-list mr-1"></i> Recommendations
                    </h4>
                    <div class="bg-orange-50 p-3 rounded-md border border-orange-200 text-orange-900">${visit.recommendations}</div>
                </div>` : ''}

                ${visit.additionalNotes ? `
                <div>
                    <h4 class="flex items-center text-xs font-bold text-gray-500 uppercase mb-1">
                        <i class="fas fa-sticky-note mr-1"></i> Additional Notes
                    </h4>
                    <div class="bg-gray-50 p-3 rounded-md border border-gray-200 text-gray-600 text-sm italic">${visit.additionalNotes}</div>
                </div>` : ''}
            </div>`;
        overlay.classList.remove('hidden');
    }

    async editVisit(visitId) {
        try {
            const visit = this.visits.find(v => v.id === visitId);
            if (!visit) {
                this.showError('Visit not found');
                return;
            }
            let overlay = document.getElementById('clinicVisitEditModal');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'clinicVisitEditModal';
                overlay.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 hidden flex items-center justify-center p-4';
                const container = document.createElement('div');
                container.className = 'bg-white rounded-lg shadow-xl max-w-lg w-full';
                const header = document.createElement('div');
                header.className = 'px-6 py-4 border-b';
                const titleEl = document.createElement('h3');
                titleEl.className = 'text-lg font-semibold text-gray-800';
                titleEl.textContent = 'Edit Visit';
                header.appendChild(titleEl);
                const body = document.createElement('div');
                body.id = 'clinicVisitEditBody';
                body.className = 'px-6 py-4';
                const footer = document.createElement('div');
                footer.className = 'px-6 py-4 border-t flex justify-end space-x-2';
                const saveBtn = document.createElement('button');
                saveBtn.id = 'clinicVisitEditSave';
                saveBtn.className = 'px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700';
                saveBtn.textContent = 'Save';
                const cancelBtn = document.createElement('button');
                cancelBtn.id = 'clinicVisitEditCancel';
                cancelBtn.className = 'px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200';
                cancelBtn.textContent = 'Cancel';
                footer.appendChild(saveBtn);
                footer.appendChild(cancelBtn);
                container.appendChild(header);
                container.appendChild(body);
                container.appendChild(footer);
                overlay.appendChild(container);
                document.body.appendChild(overlay);
            }
            const body = document.getElementById('clinicVisitEditBody');
            body.innerHTML = `
                <div class="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                        <input id="clinicVisitEditReason" type="text" class="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" value="${visit.reason || ''}">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Medical Findings</label>
                        <textarea id="clinicVisitEditFindings" class="w-full border rounded px-3 py-2 h-20 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Observations, vitals...">${visit.medicalFindings || ''}</textarea>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Treatment Given</label>
                        <textarea id="clinicVisitEditTreatment" class="w-full border rounded px-3 py-2 h-20 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Medication, first aid...">${visit.treatmentGiven || ''}</textarea>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Recommendations</label>
                        <textarea id="clinicVisitEditRecommendations" class="w-full border rounded px-3 py-2 h-20 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Rest, send home, return to class...">${visit.recommendations || ''}</textarea>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Additional Notes</label>
                        <textarea id="clinicVisitEditAdditionalNotes" class="w-full border rounded px-3 py-2 h-20 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Internal notes...">${visit.additionalNotes || ''}</textarea>
                    </div>
                </div>`;
            const saveBtnEl = document.getElementById('clinicVisitEditSave');
            const cancelBtnEl = document.getElementById('clinicVisitEditCancel');
            cancelBtnEl.onclick = () => overlay.classList.add('hidden');
            saveBtnEl.onclick = async () => {
                const newReason = document.getElementById('clinicVisitEditReason').value.trim();
                const newFindings = document.getElementById('clinicVisitEditFindings').value.trim();
                const newTreatment = document.getElementById('clinicVisitEditTreatment').value.trim();
                const newRecommendations = document.getElementById('clinicVisitEditRecommendations').value.trim();
                const newAdditionalNotes = document.getElementById('clinicVisitEditAdditionalNotes').value.trim();

                if (!newReason) {
                    this.showError('Reason is required');
                    return;
                }
                try {
                    saveBtnEl.disabled = true;
                    saveBtnEl.textContent = 'Saving...';

                    if (window.USE_SUPABASE && window.supabaseClient) {
                        const { error } = await window.supabaseClient
                            .from('clinic_visits')
                            .update({
                                reason: newReason,
                                medical_findings: newFindings,
                                treatment_given: newTreatment,
                                recommendations: newRecommendations,
                                additional_notes: newAdditionalNotes,
                                updated_at: new Date().toISOString(),
                                updated_by: this.currentUser.id
                            })
                            .eq('id', visitId);
                        if (error) throw error;
                    } else {
                        const db = window.EducareTrack ? window.EducareTrack.db : null;
                        if (db) {
                            await db.collection('clinicVisits').doc(visitId).update({
                                reason: newReason,
                                medicalFindings: newFindings,
                                treatmentGiven: newTreatment,
                                recommendations: newRecommendations,
                                additionalNotes: newAdditionalNotes,
                                updatedAt: new Date().toISOString(),
                                updatedBy: this.currentUser.id,
                                updatedByName: this.currentUser.name
                            });
                        } else {
                            throw new Error('Database not available');
                        }
                    }
                    
                    // Update local data
                    visit.reason = newReason;
                    visit.medicalFindings = newFindings;
                    visit.treatmentGiven = newTreatment;
                    visit.recommendations = newRecommendations;
                    visit.additionalNotes = newAdditionalNotes;
                    
                    this.applyFilters();
                    this.showNotification('Clinic visit updated', 'success');
                    overlay.classList.add('hidden');
                } catch (error) {
                    console.error('Error updating clinic visit:', error);
                    this.showError('Failed to update clinic visit');
                } finally {
                    saveBtnEl.disabled = false;
                    saveBtnEl.textContent = 'Save';
                }
            };
            overlay.classList.remove('hidden');
        } catch (error) {
            console.error('Error initializing edit modal:', error);
            this.showError('Failed to open edit modal');
        }
    }

    exportToCSV() {
        if (this.filteredVisits.length === 0) {
            this.showNotification('No data to export', 'error');
            return;
        }

        const headers = ['Date', 'Time', 'Student Name', 'Type', 'Reason', 'Notes', 'Staff'];
        const csvData = this.filteredVisits.map(visit => {
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
        a.download = `clinic-visits-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);

        this.showNotification('CSV exported successfully', 'success');
    }

    // Utility Methods
    capitalizeFirstLetter(string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    }

    showNotification(message, type = 'info') {
        if (window.EducareTrack && typeof window.EducareTrack.showNormalNotification === 'function') {
            window.EducareTrack.showNormalNotification({ title: type === 'error' ? 'Error' : 'Info', message, type });
        }
    }

    showError(message) {
        this.showNotification(message, 'error');
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    window.clinicVisits = new ClinicVisits();
});
