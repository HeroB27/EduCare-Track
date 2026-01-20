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

            this.applyFilters();
        } catch (error) {
            console.error('Error loading visits:', error);
            this.showError('Failed to load clinic visits');
        }
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
            container.className = 'bg-white rounded-lg shadow-xl max-w-lg w-full';
            const header = document.createElement('div');
            header.className = 'px-6 py-4 border-b';
            const titleEl = document.createElement('h3');
            titleEl.className = 'text-lg font-semibold text-gray-800';
            titleEl.textContent = 'Visit Details';
            header.appendChild(titleEl);
            const body = document.createElement('div');
            body.id = 'clinicVisitDetailsBody';
            body.className = 'px-6 py-4 text-sm text-gray-700';
            const footer = document.createElement('div');
            footer.className = 'px-6 py-4 border-t flex justify-end';
            const okBtn = document.createElement('button');
            okBtn.className = 'px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700';
            okBtn.textContent = 'Close';
            okBtn.onclick = () => overlay.classList.add('hidden');
            footer.appendChild(okBtn);
            container.appendChild(header);
            container.appendChild(body);
            container.appendChild(footer);
            overlay.appendChild(container);
            document.body.appendChild(overlay);
        }
        const body = document.getElementById('clinicVisitDetailsBody');
        body.innerHTML = `
            <div class="space-y-2">
                <div><span class="font-semibold">Student:</span> ${visit.studentName}</div>
                <div><span class="font-semibold">Date:</span> ${date}</div>
                <div><span class="font-semibold">Time:</span> ${time}</div>
                <div><span class="font-semibold">Type:</span> ${visit.checkIn ? 'Check-in' : 'Check-out'}</div>
                <div><span class="font-semibold">Reason:</span> ${visit.reason}</div>
                <div><span class="font-semibold">Notes:</span> ${visit.notes || 'None'}</div>
                <div><span class="font-semibold">Staff:</span> ${visit.staffName || 'N/A'}</div>
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
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                        <input id="clinicVisitEditReason" type="text" class="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" value="${visit.reason || ''}">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                        <textarea id="clinicVisitEditNotes" class="w-full border rounded px-3 py-2 h-24 focus:outline-none focus:ring-2 focus:ring-blue-500">${visit.notes || ''}</textarea>
                    </div>
                </div>`;
            const saveBtnEl = document.getElementById('clinicVisitEditSave');
            const cancelBtnEl = document.getElementById('clinicVisitEditCancel');
            cancelBtnEl.onclick = () => overlay.classList.add('hidden');
            saveBtnEl.onclick = async () => {
                const newReason = document.getElementById('clinicVisitEditReason').value.trim();
                const newNotes = document.getElementById('clinicVisitEditNotes').value.trim();
                if (!newReason) {
                    this.showError('Reason is required');
                    return;
                }
                try {
                    await firebase.firestore().collection('clinicVisits').doc(visitId).update({
                        reason: newReason,
                        notes: newNotes,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                        updatedBy: this.currentUser.id,
                        updatedByName: this.currentUser.name
                    });
                    visit.reason = newReason;
                    visit.notes = newNotes;
                    this.applyFilters();
                    this.showNotification('Clinic visit updated', 'success');
                    overlay.classList.add('hidden');
                } catch (error) {
                    console.error('Error updating clinic visit:', error);
                    this.showError('Failed to update clinic visit');
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
