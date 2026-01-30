class TeacherNotifications {
    constructor() {
        this.currentUser = null;
        this.notifications = [];
        this.filter = { unreadOnly: false, urgentOnly: false, type: 'all' };
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
            await this.loadNotificationCount();
            await this.loadNotifications();
            this.setupRealtimeSubscription();
            this.initEventListeners();
            this.hideLoading();
        } catch (error) {
            console.error('Teacher notifications initialization failed:', error);
            this.hideLoading();
        }
    }

    setupRealtimeSubscription() {
        if (!window.supabaseClient) return;

        // Subscribe to notifications
        const notifChannel = window.supabaseClient.channel('teacher_notifications_global')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications'
                },
                (payload) => {
                    const notification = payload.new;
                    if (notification.target_users && notification.target_users.includes(this.currentUser.id)) {
                        this.showNotification('New notification: ' + notification.title, 'info');
                        this.loadNotificationCount();
                        this.loadNotifications();
                        // Dispatch event for other components
                        window.dispatchEvent(new CustomEvent('educareTrack:newNotifications'));
                    }
                }
            )
            .subscribe();

        // Subscribe to announcements (for global alerts)
        const announceChannel = window.supabaseClient.channel('teacher_announcements_global')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'announcements'
                },
                (payload) => {
                    const announcement = payload.new;
                    const audience = announcement.audience || [];
                    const isRelevant = 
                        audience.includes('all') || 
                        audience.includes('teachers') || 
                        (this.currentUser.classId && (
                            audience.includes(this.currentUser.classId) || 
                            audience.some(a => typeof a === 'string' && a.includes(this.currentUser.classId))
                        ));

                    if (isRelevant && announcement.created_by !== this.currentUser.id) {
                        this.showNotification('New Announcement: ' + announcement.title, 'info');
                        // We don't reload notifications here because announcements aren't in the notifications table
                        // But we could trigger a refresh if we had a combined view
                    }
                }
            )
            .subscribe();
            
        // Clean up on page unload
        window.addEventListener('beforeunload', () => {
            window.supabaseClient.removeChannel(notifChannel);
            window.supabaseClient.removeChannel(announceChannel);
        });
    }

    updateUI() {
        const userNameEl = document.getElementById('userName');
        const userRoleEl = document.getElementById('userRole');
        const userInitialsEl = document.getElementById('userInitials');
        if (userNameEl) userNameEl.textContent = this.currentUser.name;
        if (userRoleEl) userRoleEl.textContent = this.currentUser.role;
        if (userInitialsEl) userInitialsEl.textContent = this.currentUser.name
            .split(' ')
            .map(n => n[0])
            .join('')
            .substring(0, 2)
            .toUpperCase();

        const assignedClassEl = document.getElementById('assignedClass');
        if (this.currentUser.className && assignedClassEl) {
            assignedClassEl.textContent = this.currentUser.className;
        } else if (this.currentUser.classId && assignedClassEl) {
            assignedClassEl.textContent = 'Class ' + this.currentUser.classId;
        }

        this.updateCurrentTime();
        setInterval(() => this.updateCurrentTime(), 60000);
    }

    updateCurrentTime() {
        const now = new Date();
        const el = document.getElementById('currentTime');
        if (el) {
            el.textContent = now.toLocaleString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
    }

    async loadNotificationCount() {
        try {
            const count = await EducareTrack.getUnreadNotificationCount(this.currentUser.id);
            const badge = document.getElementById('notificationCount');
            const boxBadge = document.getElementById('notificationBoxCount');
            [badge, boxBadge].forEach(b => {
                if (!b) return;
                if (count > 0) {
                    b.textContent = count > 99 ? '99+' : count;
                    b.classList.remove('hidden');
                } else {
                    b.classList.add('hidden');
                }
            });
        } catch (error) {
            const badge = document.getElementById('notificationCount');
            const boxBadge = document.getElementById('notificationBoxCount');
            [badge, boxBadge].forEach(b => b && b.classList.add('hidden'));
        }
    }

    async loadNotifications() {
        try {
            const unreadOnly = this.filter.unreadOnly;
            const type = this.filter.type;
            const urgentOnly = this.filter.urgentOnly;

            let notifications = [];
            if (urgentOnly) {
                notifications = await EducareTrack.getUrgentNotifications(this.currentUser.id, 50);
            } else if (type !== 'all') {
                notifications = await EducareTrack.getNotificationsByType(this.currentUser.id, type, 50);
            } else {
                notifications = await EducareTrack.getNotificationsForUser(this.currentUser.id, unreadOnly, 50);
            }

            this.notifications = notifications;
            this.renderNotifications();
        } catch (error) {
            console.error('Error loading notifications:', error);
            this.showNotification('Error loading notifications', 'error');
        }
    }

    renderNotifications() {
        const container = document.getElementById('notificationsList');
        if (!container) return;

        if (this.notifications.length === 0) {
            container.innerHTML = '<div class="p-4 text-center text-gray-500">No notifications</div>';
        } else {
            container.innerHTML = this.notifications.map(n => `
                <div class="p-4 border-b hover:bg-gray-50 ${(!n.read_by || !n.read_by.includes(this.currentUser.id)) ? 'bg-blue-50' : ''}">
                    <div class="flex justify-between items-start">
                        <h4 class="font-semibold text-gray-800">${n.title}</h4>
                        <span class="text-xs text-gray-500">${new Date(n.created_at || n.createdAt).toLocaleDateString()}</span>
                    </div>
                    <p class="text-sm text-gray-600 mt-1">${n.message}</p>
                </div>
            `).join('');
        }
    }

    attachItemEvents() {
        document.querySelectorAll('.mark-read').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.getAttribute('data-id');
                try { await EducareTrack.markNotificationAsRead(id); await this.loadNotifications(); } catch (_) {}
            });
        });
        document.querySelectorAll('.delete-notification').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.getAttribute('data-id');
                try { await EducareTrack.deleteNotification(id); await this.loadNotifications(); } catch (_) {}
            });
        });
        document.querySelectorAll('.notification-item').forEach(item => {
            item.addEventListener('click', async (e) => {
                const id = item.getAttribute('data-id');
                const n = this.notifications.find(x => x.id === id);
                if (!n) return;
                try {
                    await EducareTrack.markNotificationAsRead(id);
                } catch (_) {}
                if (window.EducareTrack && typeof window.EducareTrack.handleNotificationAction === 'function') {
                    window.EducareTrack.handleNotificationAction(n);
                }
            });
        });
    }

    initEventListeners() {
        const filterAllBtn = document.getElementById('filterAll');
        const filterUnreadBtn = document.getElementById('filterUnread');
        const filterUrgentBtn = document.getElementById('filterUrgent');
        const filterTypeSel = document.getElementById('filterType');
        const markAllReadBtn = document.getElementById('markAllRead');
        const refreshBtn = document.getElementById('refreshNotifications');

        if (filterAllBtn) {
            filterAllBtn.addEventListener('click', async () => {
                this.filter = { unreadOnly: false, urgentOnly: false, type: 'all' };
                this.updateTabs('filterAll');
                await this.loadNotifications();
            });
        }

        if (filterUnreadBtn) {
            filterUnreadBtn.addEventListener('click', async () => {
                this.filter = { unreadOnly: true, urgentOnly: false, type: 'all' };
                this.updateTabs('filterUnread');
                await this.loadNotifications();
            });
        }

        if (filterUrgentBtn) {
            filterUrgentBtn.addEventListener('click', async () => {
                this.filter = { unreadOnly: false, urgentOnly: true, type: 'all' };
                this.updateTabs('filterUrgent');
                await this.loadNotifications();
            });
        }

        if (filterTypeSel) {
            filterTypeSel.addEventListener('change', async (e) => {
                this.filter.type = e.target.value;
                this.filter.unreadOnly = false;
                this.filter.urgentOnly = false;
                this.updateTabs();
                await this.loadNotifications();
            });
        }

        if (markAllReadBtn) {
            markAllReadBtn.addEventListener('click', async () => {
                try { await EducareTrack.markAllNotificationsAsRead(); await this.loadNotifications(); this.showNotification('All notifications marked as read', 'success'); } catch (_) {}
            });
        }

        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => { await this.loadNotifications(); });
        }

        const sidebarToggleBtn = document.getElementById('sidebarToggle');
        if (sidebarToggleBtn) {
            sidebarToggleBtn.addEventListener('click', () => { this.toggleSidebar(); });
        }

        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                const ok = window.EducareTrack && typeof window.EducareTrack.confirmAction === 'function'
                    ? await window.EducareTrack.confirmAction('Are you sure you want to logout?', 'Confirm Logout', 'Logout', 'Cancel')
                    : true;
                if (ok) {
                    EducareTrack.logout();
                    window.location.href = '../index.html';
                }
            });
        }

        window.addEventListener('educareTrack:newNotifications', async () => {
            await this.loadNotificationCount();
            await this.loadNotifications();
        });

        window.addEventListener('educareTrack:navigateToAnnouncements', () => {
            window.location.href = 'teacher-announcements.html';
        });
        window.addEventListener('educareTrack:navigateToStudent', (e) => {
            const studentId = e.detail && e.detail.studentId;
            if (studentId) {
                window.location.href = `teacher-students.html?studentId=${studentId}`;
            }
        });
        window.addEventListener('educareTrack:navigateToClinic', (e) => {
            const studentId = e.detail && e.detail.studentId;
            if (studentId) {
                window.location.href = `teacher-clinic.html?studentId=${studentId}`;
            }
        });
    }

    updateTabs(activeId) {
        ['filterAll', 'filterUnread', 'filterUrgent'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            if (id === activeId) {
                el.classList.add('tab-active');
            } else {
                el.classList.remove('tab-active');
            }
        });
    }

    getTypeIcon(type, urgent) {
        if (urgent) return 'fas fa-exclamation-triangle text-red-600';
        const map = {
            'attendance': 'fas fa-user-check',
            'clinic': 'fas fa-clinic-medical',
            'clinic_findings': 'fas fa-user-md',
            'clinic_decision': 'fas fa-notes-medical',
            'clinic_new_visit': 'fas fa-ambulance',
            'announcement': 'fas fa-bullhorn',
            'excuse': 'fas fa-file-alt',
            'system': 'fas fa-cog'
        };
        return map[type] || 'fas fa-bell';
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
        const el = document.getElementById('loadingSpinner');
        if (el) el.classList.remove('hidden');
    }

    hideLoading() {
        const el = document.getElementById('loadingSpinner');
        if (el) el.classList.add('hidden');
    }

    showNotification(message, type = 'info') {
        if (window.EducareTrack && typeof window.EducareTrack.showNormalNotification === 'function') {
            window.EducareTrack.showNormalNotification({ title: type === 'error' ? 'Error' : 'Info', message, type });
        }
    }
}

document.addEventListener('DOMContentLoaded', function() {
    window.teacherNotifications = new TeacherNotifications();
});
