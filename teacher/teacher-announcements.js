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
            // Build query to fetch announcements that:
            // 1. Target this class specifically
            // 2. Target 'all'
            // 3. Were created by this teacher (so they can see their own posts even if for parents)
            
            const { data, error } = await window.supabaseClient
                .from('announcements')
                .select('id,title,message,audience,priority,created_by,created_at,is_active')
                .or(`audience.cs.{${this.currentUser.classId}},audience.cs.{all},created_by.eq.${this.currentUser.id}`)
                .eq('is_active', true)
                .order('created_at', { ascending: false })
                .limit(20);

            if (error) throw error;

            // Fetch creator names
            const creatorIds = [...new Set((data || []).map(a => a.created_by))];
            let creators = {};
            if (creatorIds.length > 0) {
                const { data: profiles } = await window.supabaseClient
                    .from('profiles')
                    .select('id, full_name')
                    .in('id', creatorIds);
                if (profiles) {
                    profiles.forEach(p => creators[p.id] = p.full_name);
                }
            }

            this.announcements = (data || []).map(a => ({
                id: a.id,
                ...a,
                createdBy: a.created_by,
                createdByName: creators[a.created_by] || 'Unknown',
                createdAt: a.created_at,
                isActive: a.is_active
            }));
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

    attachAnnouncementEventListeners() {
        // View Announcement
        document.querySelectorAll('.view-announcement, .announcement-item').forEach(el => {
            el.addEventListener('click', (e) => {
                const id = el.dataset.announcementId;
                // Prevent double triggering if clicking button inside item
                if (e.target.closest('.view-announcement') && el.classList.contains('announcement-item')) return;
                this.viewAnnouncement(id);
            });
        });
    }

    initEventListeners() {
        // Create Announcement Modal
        const createBtn = document.getElementById('createAnnouncementBtn');
        const closeBtn = document.getElementById('closeCreateModal');
        const modal = document.getElementById('createAnnouncementModal');
        const form = document.getElementById('announcementForm');

        if (createBtn) {
            createBtn.addEventListener('click', () => {
                modal.classList.remove('hidden');
                modal.classList.add('flex');
            });
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
                form.reset();
            });
        }

        // Close on outside click
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.add('hidden');
                    modal.classList.remove('flex');
                    form.reset();
                }
            });
        }

        // Submit Announcement
        const saveBtn = document.getElementById('saveAnnouncementBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.createAnnouncement());
        }
    }

    async createAnnouncement() {
        try {
            const title = document.getElementById('announcementTitle').value;
            const message = document.getElementById('announcementMessage').value;
            const audienceType = document.getElementById('announcementAudience').value;
            const priority = document.getElementById('announcementPriority').value;
            const sendNotification = document.getElementById('sendNotification').checked;

            if (!title || !message) {
                this.showNotification('Please fill in all required fields', 'error');
                return;
            }

            this.showLoading();

            // Determine audience array based on selection
            let audience = [];
            if (audienceType === 'class') {
                audience = [this.currentUser.classId];
            } else if (audienceType === 'parents') {
                audience = ['parents_' + this.currentUser.classId];
            } else if (audienceType === 'both') {
                audience = [this.currentUser.classId, 'parents_' + this.currentUser.classId];
            }

            const newAnnouncement = {
                title,
                message,
                audience,
                priority,
                created_by: this.currentUser.id,
                created_by_name: this.currentUser.name,
                is_active: true,
                class_id: this.currentUser.classId // Helper for simpler queries if needed
            };

            const { data, error } = await window.supabaseClient
                .from('announcements')
                .insert([newAnnouncement])
                .select()
                .single();

            if (error) throw error;

            // Send notification if requested
            if (sendNotification) {
                await this.sendAnnouncementNotification(newAnnouncement, data.id);
            }

            this.showNotification('Announcement created successfully', 'success');
            
            // Close modal and refresh
            document.getElementById('createAnnouncementModal').classList.add('hidden');
            document.getElementById('createAnnouncementModal').classList.remove('flex');
            document.getElementById('announcementForm').reset();
            
            await this.loadAnnouncements();

        } catch (error) {
            console.error('Error creating announcement:', error);
            this.showNotification('Error creating announcement', 'error');
        } finally {
            this.hideLoading();
        }
    }

    async sendAnnouncementNotification(announcement, announcementId) {
        try {
            // Get target users based on audience
            let targetUsers = [];
            
            if (announcement.audience.includes('parents_' + this.currentUser.classId)) {
                // Fetch parents of the class
                // First get students of the class
                const { data: students } = await window.supabaseClient
                    .from('students')
                    .select('id')
                    .eq('class_id', this.currentUser.classId);
                
                if (students && students.length > 0) {
                    const studentIds = students.map(s => s.id);
                    // Get parents
                    const { data: relations } = await window.supabaseClient
                        .from('parent_students')
                        .select('parent_id')
                        .in('student_id', studentIds);
                    
                    if (relations) {
                        targetUsers = [...new Set(relations.map(r => r.parent_id))];
                    }
                }
            }

            if (targetUsers.length === 0) return;

            const { error } = await window.supabaseClient
                .from('notifications')
                .insert({
                    target_users: targetUsers,
                    title: 'New Class Announcement: ' + announcement.title,
                    message: announcement.message.substring(0, 100) + (announcement.message.length > 100 ? '...' : ''),
                    type: 'announcement',
                    related_record: announcementId,
                    is_urgent: announcement.priority === 'urgent'
                });

            if (error) console.error('Error sending notification:', error);

        } catch (error) {
            console.error('Error processing notification:', error);
        }
    }

    viewAnnouncement(id) {
        const announcement = this.announcements.find(a => a.id === id);
        if (!announcement) return;
        
        // Simple alert for now, could be a modal
        alert(`Title: ${announcement.title}\n\n${announcement.message}`);
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
        if (Array.isArray(audience)) {
            if (audience.includes('all')) return 'All Users';
            if (audience.some(a => a === this.currentUser.classId)) return 'My Class';
            return 'Custom Group';
        }
        const texts = {
            'class': 'Class Only',
            'parents': 'Parents Only',
            'both': 'Class & Parents'
        };
        return texts[audience] || 'Unknown';
    }

    formatDateTime(date) {
        if (!date) return 'N/A';
        return new Date(date).toLocaleString('en-US', {
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

            const announcementRow = {
                title,
                message,
                audience: [this.currentUser.classId],
                priority,
                created_by: this.currentUser.id,
                created_at: new Date().toISOString(),
                is_active: true
            };

            const { data, error } = await window.supabaseClient
                .from('announcements')
                .insert(announcementRow)
                .select('id')
                .single();
            if (error) throw error;

            if (sendNotification) {
                await this.sendAnnouncementNotifications(announcementRow, data.id, audience);
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

    async sendAnnouncementNotifications(announcementData, announcementId, audienceType) {
        try {
            let targetUsers = [];

            // Get target users based on audience
            // audienceType from dropdown: 'class', 'parents', 'both'
            // announcementData.audience is always [classId]
            
            if (audienceType === 'class' || audienceType === 'both') {
                // Notify parents about class announcements (effectively notifying students)
                const parentIds = await this.getClassParentIds();
                targetUsers = [...targetUsers, ...parentIds];
            }

            if (audienceType === 'parents' || audienceType === 'both') {
                const parentIds = await this.getClassParentIds();
                targetUsers = [...targetUsers, ...parentIds];
            }

            // Remove duplicates
            targetUsers = [...new Set(targetUsers)];

            if (targetUsers.length > 0) {
                await window.supabaseClient.from('notifications').insert({
                    type: 'announcement',
                    title: `New Announcement: ${announcementData.title}`,
                    message: announcementData.message.substring(0, 100) + (announcementData.message.length > 100 ? '...' : ''),
                    target_users: targetUsers,
                    related_record: announcementId,
                    created_at: new Date().toISOString()
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
