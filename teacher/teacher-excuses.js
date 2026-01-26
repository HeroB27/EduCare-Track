class TeacherExcuses {
    constructor() {
        this.currentUser = null;
        this.excuseLetters = [];
        this.filteredExcuses = [];
        this.classStudents = [];
        this.init();
    }

    async init() {
        try {
            this.showLoading();
            
            if (!window.EducareTrack) {
                setTimeout(() => this.init(), 100);
                return;
            }

            const savedUser = localStorage.getItem('educareTrack_user');
            if (!savedUser) {
                window.location.href = '../index.html';
                return;
            }

            this.currentUser = JSON.parse(savedUser);
            
            if (this.currentUser.role !== 'teacher') {
                window.location.href = `../${this.currentUser.role}/${this.currentUser.role}-dashboard.html`;
                return;
            }

            this.updateUI();

            // Load assigned class information from classes table where adviser_id = teacher id
            const { data: classData, error: classError } = await window.supabaseClient
                .from('classes')
                .select('*')
                .eq('adviser_id', this.currentUser.id)
                .eq('is_active', true)
                .single();
            
            if (!classError && classData) {
                // Set classId for backward compatibility
                this.currentUser.classId = classData.id;
                this.currentUser.className = `${classData.grade} - ${classData.level || classData.strand || 'Class'}`;
                console.log('Loaded assigned class:', classData);
            } else {
                console.log('No assigned class found for teacher');
            }

            await this.loadClassStudents();
            await this.loadNotificationCount();
            await this.loadExcuseLetters();
            this.initEventListeners();
            
            this.hideLoading();
        } catch (error) {
            console.error('Teacher excuses initialization failed:', error);
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

        if (this.currentUser.classId) {
            document.getElementById('assignedClass').textContent = this.currentUser.className || 'Class ' + this.currentUser.classId;
        }

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
    // If you have notification functionality in teacher-excuses.js, add this:
async loadNotificationCount() {
    try {
        const count = await EducareTrack.getUnreadNotificationCount(this.currentUser.id);
        const badge = document.getElementById('notificationCount');
        
        if (badge) {
            if (count > 0) {
                badge.textContent = count;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
    } catch (error) {
        console.error('Error loading notification count:', error);
        // Silently fail for notifications
        const badge = document.getElementById('notificationCount');
        if (badge) {
            badge.classList.add('hidden');
        }
    }
}
    async loadClassStudents() {
        try {
            // 1. Get students from advisory class
            let allStudents = [];
            const advisoryStudents = await EducareTrack.getStudentsByClass(this.currentUser.classId);
            if (advisoryStudents && advisoryStudents.length > 0) {
                allStudents = [...advisoryStudents];
            }

            // 2. Get students from subject classes
            // Find all classes where this teacher is a subject teacher
            const { data: schedules, error: scheduleError } = await window.supabaseClient
                .from('class_schedules')
                .select('class_id')
                .eq('teacher_id', this.currentUser.id);

            if (!scheduleError && schedules && schedules.length > 0) {
                // Get unique class IDs excluding the advisory class (already fetched)
                const subjectClassIds = [...new Set(schedules.map(s => s.class_id))]
                    .filter(id => id !== this.currentUser.classId);

                if (subjectClassIds.length > 0) {
                    for (const classId of subjectClassIds) {
                        const classStudents = await EducareTrack.getStudentsByClass(classId);
                        if (classStudents) {
                            allStudents = [...allStudents, ...classStudents];
                        }
                    }
                }
            }

            // Remove duplicates (in case a student is in both advisory and subject class - unlikely but possible if data is messy)
            const uniqueStudents = Array.from(new Map(allStudents.map(s => [s.id, s])).values());
            
            this.classStudents = uniqueStudents;
            console.log('Total students loaded (Advisory + Subject):', this.classStudents.length);

        } catch (error) {
            console.error('Error loading class students:', error);
            this.showNotification('Error loading students', 'error');
        }
    }

    async loadExcuseLetters() {
        try {
            // Get student IDs from class students
            const studentIds = this.classStudents.map(s => s.id);
            if (studentIds.length === 0) {
                this.excuseLetters = [];
                this.filteredExcuses = [];
                this.updateStats();
                this.renderExcuseLetters();
                return;
            }

            const { data, error } = await window.supabaseClient
                .from('excuse_letters')
                .select('*')
                .in('student_id', studentIds)
                .order('created_at', { ascending: false });

            if (error) throw error;

            this.excuseLetters = (data || []).map(excuse => ({
                id: excuse.id,
                ...excuse,
                studentId: excuse.student_id,
                parentId: excuse.parent_id,
                submittedAt: excuse.created_at,
                reviewedAt: excuse.reviewed_at,
                reviewedBy: excuse.reviewed_by,
                reviewedByName: 'Administrator', // Placeholder as schema uses ID
                reviewerNotes: excuse.reviewer_notes
            }));
            this.filteredExcuses = [...this.excuseLetters];
            this.updateStats();
            this.renderExcuseLetters();
        } catch (error) {
            console.error('Error loading excuse letters:', error);
            this.showNotification('Error loading excuse letters', 'error');
        }
    }

    updateStats() {
        const total = this.excuseLetters.length;
        const pending = this.excuseLetters.filter(excuse => excuse.status === 'pending').length;
        const approved = this.excuseLetters.filter(excuse => excuse.status === 'approved').length;
        const rejected = this.excuseLetters.filter(excuse => excuse.status === 'rejected').length;

        document.getElementById('totalExcuses').textContent = total;
        document.getElementById('pendingExcuses').textContent = pending;
        document.getElementById('approvedExcuses').textContent = approved;
        document.getElementById('rejectedExcuses').textContent = rejected;
    }

    renderExcuseLetters() {
        const container = document.getElementById('excusesContainer');
        
        if (this.filteredExcuses.length === 0) {
            container.innerHTML = `
                <div class="text-center py-12">
                    <i class="fas fa-file-alt text-4xl text-gray-300 mb-4"></i>
                    <h3 class="text-lg font-semibold text-gray-600">No excuse letters found</h3>
                    <p class="text-gray-500">No excuse letters match your current filters</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.filteredExcuses.map(excuse => {
            const student = this.classStudents.find(s => s.id === excuse.studentId);
            return `
                <div class="p-6 hover:bg-gray-50 cursor-pointer excuse-item" data-excuse-id="${excuse.id}">
                    <div class="flex items-start justify-between">
                        <div class="flex items-start space-x-4 flex-1">
                            <div class="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                                <span class="text-blue-600 font-semibold">${student?.name?.split(' ').map(n => n[0]).join('').substring(0, 2) || '??'}</span>
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center space-x-2 mb-1">
                                    <h4 class="text-lg font-semibold text-gray-800 truncate">${student?.name || 'Unknown Student'}</h4>
                                    <span class="px-2 py-1 rounded-full text-xs font-medium ${this.getStatusBadgeClass(excuse.status)}">
                                        ${this.getStatusText(excuse.status)}
                                    </span>
                                </div>
                                <p class="text-gray-600 mb-2">${this.getExcuseTypeText(excuse.type)} • ${this.formatExcuseDate(excuse)}</p>
                                <p class="text-gray-700 line-clamp-2">${excuse.reason}</p>
                                <div class="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                                    <span>Submitted: ${this.formatDateTime(excuse.submittedAt)}</span>
                                    ${excuse.reviewedAt ? `<span>Reviewed: ${this.formatDateTime(excuse.reviewedAt)}</span>` : ''}
                                </div>
                            </div>
                        </div>
                        <div class="flex space-x-2 ml-4">
                            ${excuse.status === 'pending' ? `
                                <button class="text-green-600 hover:text-green-900 approve-excuse" data-excuse-id="${excuse.id}">
                                    <i class="fas fa-check-circle"></i>
                                </button>
                                <button class="text-red-600 hover:text-red-900 reject-excuse" data-excuse-id="${excuse.id}">
                                    <i class="fas fa-times-circle"></i>
                                </button>
                            ` : ''}
                            <button class="text-blue-600 hover:text-blue-900 view-excuse" data-excuse-id="${excuse.id}">
                                <i class="fas fa-eye"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        this.attachExcuseEventListeners();
    }

    // Updated method to handle both single date and date array
    formatExcuseDate(excuse) {
        if (excuse.absenceDate) {
            return this.formatDate(excuse.absenceDate);
        } else if (excuse.dates && excuse.dates.length > 0) {
            const primaryDate = new Date(excuse.dates[0]);
            if (excuse.dates.length > 1) {
                return `${this.formatDate(primaryDate)} (+${excuse.dates.length - 1} more)`;
            }
            return this.formatDate(primaryDate);
        }
        return 'N/A';
    }

    getStatusBadgeClass(status) {
        const classes = {
            'pending': 'status-pending',
            'approved': 'status-approved',
            'rejected': 'status-rejected',
            'cancelled': 'bg-gray-100 text-gray-800'
        };
        return classes[status] || 'bg-gray-100 text-gray-800';
    }

    getStatusText(status) {
        const texts = {
            'pending': 'Pending',
            'approved': 'Approved',
            'rejected': 'Rejected',
            'cancelled': 'Cancelled'
        };
        return texts[status] || 'Unknown';
    }

    getExcuseTypeText(type) {
        const texts = {
            'absence': 'Absence',
            'tardy': 'Tardy',
            'early_dismissal': 'Early Dismissal',
            'other': 'Other'
        };
        return texts[type] || 'Unknown';
    }

    formatDate(date) {
        if (!date) return 'N/A';
        return new Date(date.toDate ? date.toDate() : date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    formatDateTime(date) {
        if (!date) return 'N/A';
        return new Date(date.toDate ? date.toDate() : date).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    attachExcuseEventListeners() {
        // View excuse buttons
        document.querySelectorAll('.view-excuse').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                const excuseId = e.target.closest('button').getAttribute('data-excuse-id');
                this.showExcuseDetails(excuseId);
            });
        });

        // Approve excuse buttons
        document.querySelectorAll('.approve-excuse').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                const excuseId = e.target.closest('button').getAttribute('data-excuse-id');
                this.approveExcuse(excuseId);
            });
        });

        // Reject excuse buttons
        document.querySelectorAll('.reject-excuse').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                const excuseId = e.target.closest('button').getAttribute('data-excuse-id');
                this.rejectExcuse(excuseId);
            });
        });

        // Excuse item click
        document.querySelectorAll('.excuse-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (!e.target.closest('button')) {
                    const excuseId = item.getAttribute('data-excuse-id');
                    this.showExcuseDetails(excuseId);
                }
            });
        });
    }

    async showExcuseDetails(excuseId) {
        try {
            this.showLoading();
            
            const excuse = this.excuseLetters.find(e => e.id === excuseId);
            if (!excuse) {
                throw new Error('Excuse letter not found');
            }

            const student = this.classStudents.find(s => s.id === excuse.studentId);
            const parentInfo = await EducareTrack.getUserById(excuse.parentId);

            const modalContent = document.getElementById('excuseDetailContent');
            modalContent.innerHTML = `
                <div class="space-y-6">
                    <!-- Student Information -->
                    <div class="bg-gray-50 rounded-lg p-4">
                        <h4 class="font-semibold text-gray-800 mb-3">Student Information</h4>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div class="flex items-center space-x-3">
                                <div class="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                                    <span class="text-blue-600 font-semibold">${student?.name?.split(' ').map(n => n[0]).join('').substring(0, 2) || '??'}</span>
                                </div>
                                <div>
                                    <p class="font-medium">${student?.name || 'Unknown Student'}</p>
                                    <p class="text-sm text-gray-600">${student?.grade || 'N/A'} • ${student?.level || 'N/A'}</p>
                                </div>
                            </div>
                            <div>
                                <p class="text-sm text-gray-600">LRN</p>
                                <p class="font-medium">${student?.lrn || 'N/A'}</p>
                            </div>
                        </div>
                    </div>

                    <!-- Parent Information -->
                    <div class="bg-gray-50 rounded-lg p-4">
                        <h4 class="font-semibold text-gray-800 mb-3">Parent/Guardian Information</h4>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <p class="text-sm text-gray-600">Name</p>
                                <p class="font-medium">${parentInfo?.name || 'N/A'}</p>
                            </div>
                            <div>
                                <p class="text-sm text-gray-600">Relationship</p>
                                <p class="font-medium">${parentInfo?.relationship || 'Parent'}</p>
                            </div>
                            <div>
                                <p class="text-sm text-gray-600">Phone</p>
                                <p class="font-medium">${parentInfo?.phone || 'N/A'}</p>
                            </div>
                            <div>
                                <p class="text-sm text-gray-600">Submitted</p>
                                <p class="font-medium">${this.formatDateTime(excuse.submittedAt)}</p>
                            </div>
                        </div>
                    </div>

                    <!-- Excuse Details -->
                    <div class="space-y-4">
                        <div>
                            <h4 class="font-semibold text-gray-800 mb-2">Excuse Details</h4>
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                <div>
                                    <p class="text-sm text-gray-600">Type</p>
                                    <p class="font-medium">${this.getExcuseTypeText(excuse.type)}</p>
                                </div>
                                <div>
                                    <p class="text-sm text-gray-600">Absence Date${excuse.dates && excuse.dates.length > 1 ? 's' : ''}</p>
                                    <p class="font-medium">
                                        ${excuse.dates && excuse.dates.length > 0 ? 
                                            excuse.dates.map(date => this.formatDate(new Date(date))).join(', ') : 
                                            this.formatDate(excuse.absenceDate)
                                        }
                                    </p>
                                </div>
                                <div>
                                    <p class="text-sm text-gray-600">Status</p>
                                    <span class="px-2 py-1 rounded-full text-xs font-medium ${this.getStatusBadgeClass(excuse.status)}">
                                        ${this.getStatusText(excuse.status)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div>
                            <p class="text-sm text-gray-600 mb-1">Reason</p>
                            <div class="bg-gray-50 rounded-lg p-4">
                                <p class="text-gray-800 whitespace-pre-wrap">${excuse.reason}</p>
                            </div>
                        </div>

                        ${excuse.notes ? `
                        <div>
                            <p class="text-sm text-gray-600 mb-1">Additional Notes</p>
                            <div class="bg-gray-50 rounded-lg p-4">
                                <p class="text-gray-800 whitespace-pre-wrap">${excuse.notes}</p>
                            </div>
                        </div>
                        ` : ''}

                        ${excuse.reviewerNotes ? `
                        <div>
                            <p class="text-sm text-gray-600 mb-1">Reviewer Notes</p>
                            <div class="bg-blue-50 rounded-lg p-4 border border-blue-200">
                                <p class="text-blue-800 whitespace-pre-wrap">${excuse.reviewerNotes}</p>
                            </div>
                        </div>
                        ` : ''}
                    </div>
                </div>
            `;

            const actionsContainer = document.getElementById('excuseActions');
            if (excuse.status === 'pending') {
                actionsContainer.innerHTML = `
                    <button id="approveExcuseBtn" class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition duration-200" data-excuse-id="${excuse.id}">
                        <i class="fas fa-check-circle mr-2"></i>Approve
                    </button>
                    <button id="rejectExcuseBtn" class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition duration-200" data-excuse-id="${excuse.id}">
                        <i class="fas fa-times-circle mr-2"></i>Reject
                    </button>
                    <button id="closeExcuseBtn" class="px-4 py-2 text-gray-600 hover:text-gray-800">
                        Close
                    </button>
                `;

                document.getElementById('approveExcuseBtn').addEventListener('click', () => {
                    this.approveExcuse(excuse.id);
                });

                document.getElementById('rejectExcuseBtn').addEventListener('click', () => {
                    this.rejectExcuse(excuse.id);
                });
            } else {
                actionsContainer.innerHTML = `
                    <button id="closeExcuseBtn" class="px-4 py-2 text-gray-600 hover:text-gray-800">
                        Close
                    </button>
                `;
            }

            document.getElementById('closeExcuseBtn').addEventListener('click', () => {
                this.hideExcuseDetails();
            });

            this.hideLoading();
            document.getElementById('excuseDetailModal').classList.remove('hidden');
        } catch (error) {
            console.error('Error loading excuse details:', error);
            this.hideLoading();
            this.showNotification('Error loading excuse details', 'error');
        }
    }

    async approveExcuse(excuseId) {
        try {
            this.showLoading();
            
            const excuse = this.excuseLetters.find(e => e.id === excuseId);
            if (!excuse) {
                throw new Error('Excuse letter not found');
            }

            const { error } = await window.supabaseClient
                .from('excuse_letters')
                .update({
                    status: 'approved',
                    reviewed_at: new Date().toISOString(),
                    reviewed_by: this.currentUser.id
                })
                .eq('id', excuseId);

            if (error) throw error;

            // Create notification for parent
            await EducareTrack.createNotification({
                type: 'excuse',
                title: 'Excuse Letter Approved',
                message: `Your excuse letter for ${this.formatExcuseDate(excuse)} has been approved.`,
                targetUsers: [excuse.parentId],
                studentId: excuse.studentId,
                studentName: this.classStudents.find(s => s.id === excuse.studentId)?.name || 'Student',
                relatedRecord: excuseId
            });

            await this.loadExcuseLetters();
            this.hideExcuseDetails();
            this.hideLoading();
            this.showNotification('Excuse letter approved', 'success');
        } catch (error) {
            console.error('Error approving excuse:', error);
            this.hideLoading();
            this.showNotification('Error approving excuse letter', 'error');
        }
    }

    async rejectExcuse(excuseId) {
        try {
            this.showLoading();
            const excuse = this.excuseLetters.find(e => e.id === excuseId);
            if (!excuse) {
                throw new Error('Excuse letter not found');
            }
            this.hideLoading();

            let overlay = document.getElementById('teacherRejectModal');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'teacherRejectModal';
                overlay.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 hidden flex items-center justify-center p-4';
                const container = document.createElement('div');
                container.className = 'bg-white rounded-lg shadow-xl max-w-lg w-full';
                const header = document.createElement('div');
                header.className = 'px-6 py-4 border-b';
                const titleEl = document.createElement('h3');
                titleEl.className = 'text-lg font-semibold text-gray-800';
                titleEl.textContent = 'Reject Excuse Letter';
                header.appendChild(titleEl);
                const body = document.createElement('div');
                body.id = 'teacherRejectBody';
                body.className = 'px-6 py-4';
                const footer = document.createElement('div');
                footer.className = 'px-6 py-4 border-t flex justify-end space-x-2';
                const rejectBtn = document.createElement('button');
                rejectBtn.id = 'teacherRejectSave';
                rejectBtn.className = 'px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700';
                rejectBtn.textContent = 'Reject';
                const cancelBtn = document.createElement('button');
                cancelBtn.id = 'teacherRejectCancel';
                cancelBtn.className = 'px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200';
                cancelBtn.textContent = 'Cancel';
                footer.appendChild(rejectBtn);
                footer.appendChild(cancelBtn);
                container.appendChild(header);
                container.appendChild(body);
                container.appendChild(footer);
                overlay.appendChild(container);
                document.body.appendChild(overlay);
            }

            const body = document.getElementById('teacherRejectBody');
            body.innerHTML = `
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Reason for rejection</label>
                        <textarea id="teacherRejectNotes" class="w-full border rounded px-3 py-2 h-24 focus:outline-none focus:ring-2 focus:ring-red-500"></textarea>
                    </div>
                </div>`;

            const rejectBtnEl = document.getElementById('teacherRejectSave');
            const cancelBtnEl = document.getElementById('teacherRejectCancel');
            cancelBtnEl.onclick = () => overlay.classList.add('hidden');
            rejectBtnEl.onclick = async () => {
                const reviewerNotes = document.getElementById('teacherRejectNotes').value.trim();
                if (!reviewerNotes) {
                    this.showNotification('Please provide a reason for rejection', 'error');
                    return;
                }
                try {
                    this.showLoading();
                    const { error } = await window.supabaseClient
                        .from('excuse_letters')
                        .update({
                            status: 'rejected',
                            reviewed_at: new Date().toISOString(),
                            reviewed_by: this.currentUser.id,
                            reviewer_notes: reviewerNotes
                        })
                        .eq('id', excuseId);

                    if (error) throw error;
                    await EducareTrack.createNotification({
                        type: 'excuse',
                        title: 'Excuse Letter Rejected',
                        message: `Your excuse letter for ${this.formatExcuseDate(excuse)} has been rejected. Reason: ${reviewerNotes}`,
                        targetUsers: [excuse.parentId],
                        studentId: excuse.studentId,
                        studentName: this.classStudents.find(s => s.id === excuse.studentId)?.name || 'Student',
                        relatedRecord: excuseId
                    });
                    await this.loadExcuseLetters();
                    this.hideExcuseDetails();
                    this.hideLoading();
                    this.showNotification('Excuse letter rejected', 'success');
                    overlay.classList.add('hidden');
                } catch (error) {
                    console.error('Error rejecting excuse:', error);
                    this.hideLoading();
                    this.showNotification('Error rejecting excuse letter', 'error');
                }
            };
            overlay.classList.remove('hidden');
        } catch (error) {
            console.error('Error initializing rejection modal:', error);
            this.hideLoading();
            this.showNotification('Failed to open rejection modal', 'error');
        }
    }

    hideExcuseDetails() {
        document.getElementById('excuseDetailModal').classList.add('hidden');
    }

    filterExcuses() {
        const statusFilter = document.getElementById('statusFilter').value;
        const typeFilter = document.getElementById('typeFilter').value;

        this.filteredExcuses = this.excuseLetters.filter(excuse => {
            const matchesStatus = statusFilter === 'all' || excuse.status === statusFilter;
            const matchesType = typeFilter === 'all' || excuse.type === typeFilter;
            return matchesStatus && matchesType;
        });

        this.renderExcuseLetters();
    }

    async exportExcuses() {
        try {
            this.showLoading();
            
            const csvContent = this.generateExcusesCSV();
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            
            link.setAttribute('href', url);
            link.setAttribute('download', `excuse_letters_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            this.hideLoading();
            this.showNotification('Excuse letters exported successfully', 'success');
        } catch (error) {
            console.error('Error exporting excuse letters:', error);
            this.hideLoading();
            this.showNotification('Error exporting excuse letters', 'error');
        }
    }

    generateExcusesCSV() {
        const headers = ['Student Name', 'LRN', 'Type', 'Absence Date', 'Reason', 'Status', 'Submitted Date', 'Reviewed Date'];
        const rows = this.filteredExcuses.map(excuse => {
            const student = this.classStudents.find(s => s.id === excuse.studentId);
            return [
                student?.name || 'Unknown',
                student?.lrn || 'N/A',
                this.getExcuseTypeText(excuse.type),
                this.formatExcuseDate(excuse),
                excuse.reason,
                this.getStatusText(excuse.status),
                this.formatDateTime(excuse.submittedAt),
                excuse.reviewedAt ? this.formatDateTime(excuse.reviewedAt) : 'Not reviewed'
            ];
        });

        return [headers, ...rows].map(row => row.map(field => `"${field}"`).join(',')).join('\n');
    }

    initEventListeners() {
        // Filter changes
        document.getElementById('statusFilter').addEventListener('change', () => {
            this.filterExcuses();
        });

        document.getElementById('typeFilter').addEventListener('change', () => {
            this.filterExcuses();
        });

        // Export button
        document.getElementById('exportExcuses').addEventListener('click', () => {
            this.exportExcuses();
        });

        // Modal close
        document.getElementById('closeExcuseModal').addEventListener('click', () => {
            this.hideExcuseDetails();
        });

        // Close modal on outside click
        document.getElementById('excuseDetailModal').addEventListener('click', (e) => {
            if (e.target.id === 'excuseDetailModal') {
                this.hideExcuseDetails();
            }
        });

        // Escape key to close modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideExcuseDetails();
            }
        });

        // Sidebar toggle
        document.getElementById('sidebarToggle').addEventListener('click', () => {
            this.toggleSidebar();
        });

        // Logout
        document.getElementById('logoutBtn').addEventListener('click', async () => {
            const ok = window.EducareTrack && typeof window.EducareTrack.confirmAction === 'function'
                ? await window.EducareTrack.confirmAction('Are you sure you want to logout?', 'Confirm Logout', 'Logout', 'Cancel')
                : true;
            if (ok) {
                EducareTrack.logout();
                window.location.href = '../index.html';
            }
        });

        window.addEventListener('educareTrack:newNotifications', () => {
            this.loadNotificationCount();
        });
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
            window.EducareTrack.showNormalNotification({ title: type === 'error' ? 'Error' : 'Info', message, type });
        }
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    window.teacherExcuses = new TeacherExcuses();
});
