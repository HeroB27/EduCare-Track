class TeacherAnnouncements {
    constructor() {
        this.currentUser = null;
        this.announcements = [];
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
            await this.loadClassStudents();
            await this.loadAnnouncements();
            this.initEventListeners();
            
            this.hideLoading();
        } catch (error) {
            console.error('Teacher announcements initialization failed:', error);
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

    async loadClassStudents() {
        try {
            this.classStudents = await EducareTrack.getStudentsByClass(this.currentUser.classId);
        } catch (error) {
            console.error('Error loading class students:', error);
            this.showNotification('Error loading students', 'error');
        }
    }

    async loadAnnouncements() {
        try {
            const snapshot = await EducareTrack.db.collection('announcements')
                .where('classId', '==', this.currentUser.classId)
                .orderBy('createdAt', 'desc')
                .limit(20)
                .get();

            this.announcements = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            this.renderAnnouncements();
        } catch (error) {
            console.error('Error loading announcements:', error);
            this.showNotification('Error loading announcements', 'error');
        }
    }

    renderAnnouncements() {
        const container = document.getElementById('announcementsContainer');
        
        if (this.announcements.length === 0) {
            container.innerHTML = `
                <div class="text-center py-12">
                    <i class="fas fa-bullhorn text-4xl text-gray-300 mb-4"></i>
                    <h3 class="text-lg font-semibold text-gray-600">No announcements yet</h3>
                    <p class="text-gray-500">Create your first announcement to get started</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.announcements.map(announcement => {
            const priorityClass = this.getPriorityClass(announcement.priority);
            const audienceText = this.getAudienceText(announcement.audience);
            
            return `
                <div class="p-6 hover:bg-gray-50 cursor-pointer announcement-item" data-announcement-id="${announcement.id}">
                    <div class="flex items-start justify-between">
                        <div class="flex-1">
                            <div class="flex items-center space-x-2 mb-2">
                                <h4 class="text-lg font-semibold text-gray-800">${announcement.title}</h4>
                                <span class="px-2 py-1 rounded-full text-xs font-medium ${priorityClass}">
                                    ${announcement.priority || 'normal'}
                                </span>
                            </div>
                            <p class="text-gray-600 mb-3 line-clamp-2">${announcement.message}</p>
                            <div class="flex items-center space-x-4 text-sm text-gray-500">
                                <span><i class="fas fa-user mr-1"></i> ${announcement.createdByName}</span>
                                <span><i class="fas fa-clock mr-1"></i> ${this.formatDateTime(announcement.createdAt)}</span>
                                <span><i class="fas fa-users mr-1"></i> ${audienceText}</span>
                            </div>
                        </div>
                        <div class="flex space-x-2 ml-4">
                            <button class="text-blue-600 hover:text-blue-900 view-announcement" data-announcement-id="${announcement.id}">
                                <i class="fas fa-eye"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        this.attachAnnouncementEventListeners();
    }

    getPriorityClass(priority) {
        const classes = {
            'urgent': 'bg-red-100 text-red-800',
            'important': 'bg-yellow-100 text-yellow-800',
            'normal': 'bg-blue-100 text-blue-800'
        };
        return classes[priority] || 'bg-gray-100 text-gray-800';
    }

    getAudienceText(audience) {
        const texts = {
            'class': 'Class Only',
            'parents': 'Parents Only',
            'both': 'Class & Parents'
        };
        return texts[audience] || 'Unknown';
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

    attachAnnouncementEventListeners() {
        // View announcement buttons
        document.querySelectorAll('.view-announcement').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                const announcementId = e.target.closest('button').getAttribute('data-announcement-id');
                this.showAnnouncementDetails(announcementId);
            });
        });

        // Announcement item click
        document.querySelectorAll('.announcement-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (!e.target.closest('button')) {
                    const announcementId = item.getAttribute('data-announcement-id');
                    this.showAnnouncementDetails(announcementId);
                }
            });
        });
    }

    async showAnnouncementDetails(announcementId) {
        try {
            this.showLoading();
            
            const announcement = this.announcements.find(a => a.id === announcementId);
            if (!announcement) {
                throw new Error('Announcement not found');
            }

            const modalContent = document.getElementById('announcementDetailContent');
            modalContent.innerHTML = `
                <div class="space-y-6">
                    <!-- Header -->
                    <div class="border-b border-gray-200 pb-4">
                        <div class="flex items-center space-x-2 mb-2">
                            <h3 class="text-xl font-bold text-gray-800">${announcement.title}</h3>
                            <span class="px-2 py-1 rounded-full text-xs font-medium ${this.getPriorityClass(announcement.priority)}">
                                ${announcement.priority || 'normal'}
                            </span>
                        </div>
                        <div class="flex items-center space-x-4 text-sm text-gray-600">
                            <span><i class="fas fa-user mr-1"></i> ${announcement.createdByName}</span>
                            <span><i class="fas fa-clock mr-1"></i> ${this.formatDateTime(announcement.createdAt)}</span>
                            <span><i class="fas fa-users mr-1"></i> ${this.getAudienceText(announcement.audience)}</span>
                        </div>
                    </div>

                    <!-- Message -->
                    <div>
                        <h4 class="font-semibold text-gray-800 mb-2">Message</h4>
                        <div class="bg-gray-50 rounded-lg p-4">
                            <p class="text-gray-800 whitespace-pre-wrap">${announcement.message}</p>
                        </div>
                    </div>

                    <!-- Statistics -->
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div class="bg-blue-50 rounded-lg p-4 text-center">
                            <div class="text-2xl font-bold text-blue-600">${this.classStudents.length}</div>
                            <div class="text-sm text-gray-600">Total Students</div>
                        </div>
                        <div class="bg-green-50 rounded-lg p-4 text-center">
                            <div class="text-2xl font-bold text-green-600">${this.getParentCount()}</div>
                            <div class="text-sm text-gray-600">Total Parents</div>
                        </div>
                        <div class="bg-purple-50 rounded-lg p-4 text-center">
                            <div class="text-2xl font-bold text-purple-600">${this.getTotalRecipients(announcement.audience)}</div>
                            <div class="text-sm text-gray-600">Recipients</div>
                        </div>
                        <div class="bg-yellow-50 rounded-lg p-4 text-center">
                            <div class="text-2xl font-bold text-yellow-600">100%</div>
                            <div class="text-sm text-gray-600">Delivery Rate</div>
                        </div>
                    </div>
                </div>
            `;

            this.hideLoading();
            document.getElementById('announcementDetailModal').classList.remove('hidden');
        } catch (error) {
            console.error('Error loading announcement details:', error);
            this.hideLoading();
            this.showNotification('Error loading announcement details', 'error');
        }
    }

    getParentCount() {
        // This would normally be calculated from actual parent data
        return this.classStudents.length; // Assuming one parent per student
    }

    getTotalRecipients(audience) {
        switch (audience) {
            case 'class':
                return this.classStudents.length;
            case 'parents':
                return this.getParentCount();
            case 'both':
                return this.classStudents.length + this.getParentCount();
            default:
                return this.classStudents.length;
        }
    }

    showCreateAnnouncementModal() {
        document.getElementById('createAnnouncementModal').classList.remove('hidden');
        document.getElementById('announcementForm').reset();
    }

    hideCreateAnnouncementModal() {
        document.getElementById('createAnnouncementModal').classList.add('hidden');
    }

    hideAnnouncementDetails() {
        document.getElementById('announcementDetailModal').classList.add('hidden');
    }

    async createAnnouncement() {
        try {
            this.showLoading();
            
            const title = document.getElementById('announcementTitle').value.trim();
            const message = document.getElementById('announcementMessage').value.trim();
            const audience = document.getElementById('announcementAudience').value;
            const priority = document.getElementById('announcementPriority').value;
            const sendNotification = document.getElementById('sendNotification').checked;

            if (!title || !message) {
                throw new Error('Please fill in all required fields');
            }

            const announcementData = {
                title,
                message,
                audience,
                priority,
                classId: this.currentUser.classId,
                className: this.currentUser.className,
                createdBy: this.currentUser.id,
                createdByName: this.currentUser.name,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                isActive: true
            };

            // Create announcement
            const announcementRef = await EducareTrack.db.collection('announcements').add(announcementData);

            if (sendNotification) {
                await this.sendAnnouncementNotifications(announcementData, announcementRef.id);
            }

            await this.loadAnnouncements();
            this.hideCreateAnnouncementModal();
            this.hideLoading();
            this.showNotification('Announcement published successfully', 'success');
        } catch (error) {
            console.error('Error creating announcement:', error);
            this.hideLoading();
            this.showNotification(error.message || 'Error creating announcement', 'error');
        }
    }

    async sendAnnouncementNotifications(announcementData, announcementId) {
        try {
            let targetUsers = [];

            // Get target users based on audience
            if (announcementData.audience === 'class' || announcementData.audience === 'both') {
                // For class announcements, we'd typically notify students
                // Since we don't have student user accounts, we'll notify parents instead
                const parentIds = await this.getClassParentIds();
                targetUsers = [...targetUsers, ...parentIds];
            }

            if (announcementData.audience === 'parents' || announcementData.audience === 'both') {
                const parentIds = await this.getClassParentIds();
                targetUsers = [...targetUsers, ...parentIds];
            }

            // Remove duplicates
            targetUsers = [...new Set(targetUsers)];

            if (targetUsers.length > 0) {
                await EducareTrack.createNotification({
                    type: 'announcement',
                    title: `New Announcement: ${announcementData.title}`,
                    message: announcementData.message.substring(0, 100) + (announcementData.message.length > 100 ? '...' : ''),
                    targetUsers: targetUsers,
                    relatedRecord: announcementId,
                    isUrgent: announcementData.priority === 'urgent'
                });
            }
        } catch (error) {
            console.error('Error sending notifications:', error);
            // Don't throw error here - announcement was created successfully
        }
    }

    async getClassParentIds() {
        try {
            // Get parent IDs from students in the class
            const parentIds = this.classStudents
                .map(student => student.parentId)
                .filter(id => id);
            
            return [...new Set(parentIds)]; // Remove duplicates
        } catch (error) {
            console.error('Error getting parent IDs:', error);
            return [];
        }
    }

    initEventListeners() {
        // Create announcement button
        document.getElementById('createAnnouncementBtn').addEventListener('click', () => {
            this.showCreateAnnouncementModal();
        });

        // Create announcement modal
        document.getElementById('closeCreateModal').addEventListener('click', () => {
            this.hideCreateAnnouncementModal();
        });

        document.getElementById('cancelAnnouncement').addEventListener('click', () => {
            this.hideCreateAnnouncementModal();
        });

        document.getElementById('submitAnnouncement').addEventListener('click', () => {
            this.createAnnouncement();
        });

        // Announcement form submit
        document.getElementById('announcementForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.createAnnouncement();
        });

        // Detail modal
        document.getElementById('closeDetailModal').addEventListener('click', () => {
            this.hideAnnouncementDetails();
        });

        document.getElementById('closeDetailBtn').addEventListener('click', () => {
            this.hideAnnouncementDetails();
        });

        // Close modals on outside click
        document.getElementById('createAnnouncementModal').addEventListener('click', (e) => {
            if (e.target.id === 'createAnnouncementModal') {
                this.hideCreateAnnouncementModal();
            }
        });

        document.getElementById('announcementDetailModal').addEventListener('click', (e) => {
            if (e.target.id === 'announcementDetailModal') {
                this.hideAnnouncementDetails();
            }
        });

        // Escape key to close modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideCreateAnnouncementModal();
                this.hideAnnouncementDetails();
            }
        });

        // Sidebar toggle
        document.getElementById('sidebarToggle').addEventListener('click', () => {
            this.toggleSidebar();
        });

        // Logout
        document.getElementById('logoutBtn').addEventListener('click', () => {
            if (confirm('Are you sure you want to logout?')) {
                localStorage.removeItem('educareTrack_user');
                window.location.href = '../index.html';
            }
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
    window.teacherAnnouncements = new TeacherAnnouncements();
});
