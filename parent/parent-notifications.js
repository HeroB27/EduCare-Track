class ParentNotifications {
    constructor() {
        this.currentUser = null;
        this.notifications = [];
        this.filteredNotifications = [];
        this.currentFilter = 'all';
        this.settings = {
            attendance: true,
            clinic: true,
            announcement: true,
            excuse: true,
            email: false
        };
        this.page = 0;
        this.pageSize = 20;
        this.hasMore = true;
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
            
            // Load settings
            this.loadSettings();
            
            // Verify user is a parent
            if (this.currentUser.role !== 'parent') {
                if (window.EducareTrack && typeof window.EducareTrack.showNormalNotification === 'function') {
                    window.EducareTrack.showNormalNotification({ title: 'Access Denied', message: 'Parent role required.', type: 'error' });
                }
                window.location.href = '../index.html';
                return;
            }

            this.updateUI();
            await this.loadNotifications();
            this.initEventListeners();
            this.initTabs();
            
            this.hideLoading();
        } catch (error) {
            console.error('Parent notifications initialization failed:', error);
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

    async loadNotifications(loadMore = false) {
        try {
            if (!loadMore) {
                this.page = 0;
                this.hasMore = true;
            } else if (!this.hasMore) {
                return;
            } else {
                this.page += 1;
            }

            const limit = this.pageSize * (this.page + 1);
            const allNotifications = await EducareTrack.getNotificationsForUser(this.currentUser.id, false, limit);
            const normalized = (allNotifications || []).map(n => ({
                ...n,
                isUrgent: typeof n.isUrgent !== 'undefined' ? n.isUrgent : n.is_urgent
            }));

            this.notifications = normalized;

            if (normalized.length === 0) {
                if (!loadMore) {
                    this.showEmptyState();
                }
                this.hasMore = false;
                document.getElementById('loadMore').classList.add('hidden');
                return;
            }

            this.applyFilter();
            this.updateNotificationBadge();

            // Show/hide load more button
            if (normalized.length === limit) {
                document.getElementById('loadMore').classList.remove('hidden');
            } else {
                document.getElementById('loadMore').classList.add('hidden');
                this.hasMore = false;
            }

        } catch (error) {
            console.error('Error loading notifications:', error);
            this.showEmptyState();
        }
    }

    applyFilter() {
        let tempNotifications = this.notifications;

        // First, filter by settings (type)
        tempNotifications = tempNotifications.filter(notification => {
            if (notification.type === 'attendance' && !this.settings.attendance) return false;
            if (notification.type === 'clinic' && !this.settings.clinic) return false;
            if (notification.type === 'announcement' && !this.settings.announcement) return false;
            if (notification.type === 'excuse' && !this.settings.excuse) return false;
            return true;
        });

        // Then apply tab filters
        switch (this.currentFilter) {
            case 'unread':
                this.filteredNotifications = tempNotifications.filter(notification => 
                    !notification.readBy || !notification.readBy.includes(this.currentUser.id)
                );
                break;
            case 'urgent':
                this.filteredNotifications = tempNotifications.filter(notification => 
                    notification.isUrgent === true
                );
                break;
            default:
                this.filteredNotifications = tempNotifications;
        }

        this.renderNotifications();
    }

    renderNotifications() {
        const container = document.getElementById('notificationsList');
        const emptyState = document.getElementById('emptyState');

        if (this.filteredNotifications.length === 0) {
            container.classList.add('hidden');
            emptyState.classList.remove('hidden');
            return;
        }

        container.classList.remove('hidden');
        emptyState.classList.add('hidden');

        container.innerHTML = this.filteredNotifications.map(notification => {
            const isRead = notification.readBy && notification.readBy.includes(this.currentUser.id);
            const isUrgent = notification.isUrgent;
            
            let icon = 'fas fa-bell';
            let iconColor = 'text-blue-500';
            
            switch (notification.type) {
                case 'attendance':
                    icon = 'fas fa-clipboard-check';
                    iconColor = 'text-green-500';
                    break;
                case 'clinic':
                    icon = 'fas fa-heartbeat';
                    iconColor = 'text-red-500';
                    break;
                case 'announcement':
                    icon = 'fas fa-bullhorn';
                    iconColor = 'text-yellow-500';
                    break;
                case 'excuse':
                    icon = 'fas fa-file-medical';
                    iconColor = 'text-purple-500';
                    break;
            }

            return `
                <div class="p-4 hover:bg-gray-50 transition-colors cursor-pointer ${
                    isUrgent ? 'notification-urgent' : (!isRead ? 'notification-unread' : '')
                }" onclick="parentNotifications.viewNotification('${notification.id}')">
                    <div class="flex items-start">
                        <div class="flex-shrink-0">
                            <div class="w-10 h-10 rounded-full ${iconColor} bg-${iconColor.split('-')[1]}-100 flex items-center justify-center">
                                <i class="${icon}"></i>
                            </div>
                        </div>
                        <div class="ml-4 flex-1">
                            <div class="flex items-center justify-between">
                                <h3 class="font-medium text-gray-900">${notification.title}</h3>
                                <div class="flex items-center space-x-2">
                                    ${isUrgent ? `
                                        <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                            <i class="fas fa-exclamation-circle mr-1"></i>Urgent
                                        </span>
                                    ` : ''}
                                    ${!isRead ? `
                                        <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                            New
                                        </span>
                                    ` : ''}
                                    <span class="text-xs text-gray-500">
                                        ${EducareTrack.formatTime(notification.createdAt?.toDate())}
                                    </span>
                                </div>
                            </div>
                            <p class="mt-1 text-sm text-gray-600">${notification.message}</p>
                            ${notification.studentName ? `
                                <div class="mt-2 flex items-center text-xs text-gray-500">
                                    <i class="fas fa-user-graduate mr-1"></i>
                                    ${notification.studentName}
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    showEmptyState() {
        document.getElementById('notificationsList').classList.add('hidden');
        document.getElementById('emptyState').classList.remove('hidden');
        document.getElementById('loadMore').classList.add('hidden');
    }

    async viewNotification(notificationId) {
        try {
            const notification = this.notifications.find(n => n.id === notificationId);
            if (!notification) return;

            if (!notification.readBy || !notification.readBy.includes(this.currentUser.id)) {
                await EducareTrack.markNotificationAsRead(notificationId);
                notification.readBy = notification.readBy || [];
                notification.readBy.push(this.currentUser.id);
                this.applyFilter();
                this.updateNotificationBadge();
            }

            if (window.EducareTrack && typeof window.EducareTrack.handleNotificationAction === 'function') {
                window.EducareTrack.handleNotificationAction(notification);
            }
        } catch (error) {
            console.error('Error viewing notification:', error);
            this.showNotification('Error loading notification details', 'error');
        }
    }

    async markAsUnread() {
        if (!this.currentNotificationId) return;

        try {
            const notification = this.notifications.find(n => n.id === this.currentNotificationId);
            if (notification && notification.readBy) {
                notification.readBy = notification.readBy.filter(id => id !== this.currentUser.id);
                const { error: upErr } = await window.supabaseClient
                    .from('notifications')
                    .update({ read_by: notification.readBy })
                    .eq('id', this.currentNotificationId);
                if (upErr) throw upErr;

                this.applyFilter();
                this.updateNotificationBadge();
                this.closeNotificationModal();
                this.showNotification('Notification marked as unread', 'success');
            }
        } catch (error) {
            console.error('Error marking notification as unread:', error);
            this.showNotification('Error updating notification', 'error');
        }
    }

    async markAllAsRead() {
        try {
            const unreadNotifications = this.notifications.filter(notification => 
                !notification.readBy || !notification.readBy.includes(this.currentUser.id)
            );

            if (unreadNotifications.length === 0) {
                this.showNotification('No unread notifications', 'info');
                return;
            }

            const ids = unreadNotifications.map(n => n.id);
            await EducareTrack.markMultipleNotificationsAsRead(ids);
            await this.loadNotifications();
            this.showNotification(`Marked ${unreadNotifications.length} notifications as read`, 'success');

        } catch (error) {
            console.error('Error marking all as read:', error);
            this.showNotification('Error marking notifications as read', 'error');
        }
    }

    updateNotificationBadge() {
        const unreadCount = this.notifications.filter(notification => 
            !notification.readBy || !notification.readBy.includes(this.currentUser.id)
        ).length;

        const badge = document.getElementById('notificationBadge');
        
        if (unreadCount > 0) {
            badge.textContent = unreadCount;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    initTabs() {
        const tabs = ['all', 'unread', 'urgent'];
        
        tabs.forEach(tab => {
            document.getElementById(`${tab}Tab`).addEventListener('click', () => {
                this.switchTab(tab);
            });
        });
    }

    switchTab(tabName) {
        // Update tab buttons
        document.getElementById('allTab').classList.remove('tab-active');
        document.getElementById('unreadTab').classList.remove('tab-active');
        document.getElementById('urgentTab').classList.remove('tab-active');
        document.getElementById('allTab').classList.add('text-gray-500', 'hover:text-gray-700');
        document.getElementById('unreadTab').classList.add('text-gray-500', 'hover:text-gray-700');
        document.getElementById('urgentTab').classList.add('text-gray-500', 'hover:text-gray-700');
        
        document.getElementById(`${tabName}Tab`).classList.add('tab-active');
        document.getElementById(`${tabName}Tab`).classList.remove('text-gray-500', 'hover:text-gray-700');

        this.currentFilter = tabName;
        this.applyFilter();
    }

    loadSettings() {
        const savedSettings = localStorage.getItem(`educareTrack_notification_settings_${this.currentUser.id}`);
        if (savedSettings) {
            try {
                const parsed = JSON.parse(savedSettings);
                this.settings = { ...this.settings, ...parsed };
            } catch (e) {
                console.error('Error parsing notification settings', e);
            }
        }
    }

    saveSettings() {
        // Get values from checkboxes
        this.settings.attendance = document.getElementById('settingAttendance').checked;
        this.settings.clinic = document.getElementById('settingClinic').checked;
        this.settings.announcement = document.getElementById('settingAnnouncements').checked;
        this.settings.excuse = document.getElementById('settingExcuse').checked;
        this.settings.email = document.getElementById('settingEmail').checked;

        // Save to localStorage
        localStorage.setItem(`educareTrack_notification_settings_${this.currentUser.id}`, JSON.stringify(this.settings));

        // Close modal
        this.closeSettingsModal();

        // Re-apply filters
        this.applyFilter();
        
        this.showNotification('Settings saved successfully', 'success');
    }

    openSettingsModal() {
        // Set checkbox states based on current settings
        document.getElementById('settingAttendance').checked = this.settings.attendance;
        document.getElementById('settingClinic').checked = this.settings.clinic;
        document.getElementById('settingAnnouncements').checked = this.settings.announcement;
        document.getElementById('settingExcuse').checked = this.settings.excuse;
        document.getElementById('settingEmail').checked = this.settings.email;

        const modal = document.getElementById('notificationSettingsModal');
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    closeSettingsModal() {
        const modal = document.getElementById('notificationSettingsModal');
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    initEventListeners() {
        // Settings button
        const settingsBtn = document.getElementById('notificationSettingsBtn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => this.openSettingsModal());
        }

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

        // Mark all as read
        document.getElementById('markAllRead').addEventListener('click', () => {
            this.markAllAsRead();
        });

        // Load more
        document.getElementById('loadMore').addEventListener('click', () => {
            this.loadNotifications(true);
        });

        

        // Listen for new notifications
        window.addEventListener('educareTrack:newNotifications', (event) => {
            if (event.detail && event.detail.notifications) {
                // Add new notifications to the beginning of the list
                this.notifications = [...event.detail.notifications, ...this.notifications];
                this.applyFilter();
                this.updateNotificationBadge();
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
    window.parentNotifications = new ParentNotifications();
});
