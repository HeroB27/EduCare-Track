class AttendanceSettingsManager {
    constructor() {
        this.currentUser = null;
        this.defaultSchedule = {
            kinder_in: '07:30', kinder_out: '11:30',
            g1_3_in: '07:30', g1_3_out: '13:00',
            g4_6_in: '07:30', g4_6_out: '15:00',
            jhs_in: '07:30', jhs_out: '16:00',
            shs_in: '07:30', shs_out: '16:30'
        };
        this.defaultCalendarSettings = {
            enableSaturdayClasses: false,
            enableSundayClasses: false
        };
        this.realtimeChannel = null;
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
            this.updateUI();
            
            this.initEventListeners();
            this.populateScheduleForm(this.defaultSchedule);
            this.populateCalendarForm(this.defaultCalendarSettings);
            await this.loadSettings();
            this.setupRealtimeUpdates();
            
            this.hideLoading();
        } catch (error) {
            console.error('Settings initialization failed:', error);
            this.hideLoading();
        }
    }

    updateUI() {
        if (this.currentUser) {
            const userNameEl = document.getElementById('userName');
            const userRoleEl = document.getElementById('userRole');
            const userInitialsEl = document.getElementById('userInitials');

            if (userNameEl) userNameEl.textContent = this.currentUser.name;
            if (userRoleEl) userRoleEl.textContent = this.currentUser.role;
            if (userInitialsEl) {
                userInitialsEl.textContent = this.currentUser.name
                    .split(' ')
                    .map(n => n[0])
                    .join('')
                    .substring(0, 2)
                    .toUpperCase();
            }
        }

        this.updateCurrentTime();
        setInterval(() => this.updateCurrentTime(), 60000);
    }

    updateCurrentTime() {
        const now = new Date();
        const timeEl = document.getElementById('currentTime');
        if (timeEl) {
            timeEl.textContent = now.toLocaleString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
    }

    initEventListeners() {
        // Sidebar toggle
        const sidebarToggle = document.getElementById('sidebarToggle');
        if (sidebarToggle) {
            sidebarToggle.addEventListener('click', () => {
                document.querySelector('.sidebar').classList.toggle('collapsed');
                const mainContent = document.querySelector('.main-content');
                if (mainContent.classList.contains('ml-64')) {
                    mainContent.classList.remove('ml-64');
                    mainContent.classList.add('ml-16');
                } else {
                    mainContent.classList.remove('ml-16');
                    mainContent.classList.add('ml-64');
                }
            });
        }

        // Logout
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                if (confirm('Are you sure you want to logout?')) {
                    localStorage.removeItem('educareTrack_user');
                    window.location.href = '../index.html';
                }
            });
        }

        // Tap In/Out Form Submit
        const attendanceForm = document.getElementById('attendanceSettingsForm');
        if (attendanceForm) {
            attendanceForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveScheduleSettings();
            });
        }

        // Calendar Settings Form Submit
        const calendarForm = document.getElementById('calendarSettingsForm');
        if (calendarForm) {
            calendarForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveCalendarSettings();
            });
        }
    }

    async loadSettings() {
        try {
            let scheduleSettings = null;
            let calendarSettings = null;
            if (window.USE_SUPABASE && window.supabaseClient) {
                const { data } = await window.supabaseClient
                    .from('system_settings')
                    .select('key,value')
                    .in('key', ['attendance_schedule', 'calendar_settings']);
                (data || []).forEach(row => {
                    if (row.key === 'attendance_schedule') scheduleSettings = row.value;
                    if (row.key === 'calendar_settings') calendarSettings = row.value;
                });
            } else {
                const [scheduleDoc, calendarDoc] = await Promise.all([
                    window.EducareTrack.db.collection('system_settings').doc('attendance_schedule').get(),
                    window.EducareTrack.db.collection('system_settings').doc('calendar_settings').get()
                ]);
                if (scheduleDoc.exists) scheduleSettings = scheduleDoc.data();
                if (calendarDoc.exists) calendarSettings = calendarDoc.data();
            }
            this.populateScheduleForm(scheduleSettings || this.defaultSchedule);
            this.populateCalendarForm(calendarSettings || this.defaultCalendarSettings);
        } catch (error) {
            console.error('Error loading settings:', error);
            this.populateScheduleForm(this.defaultSchedule);
            this.populateCalendarForm(this.defaultCalendarSettings);
        }
    }

    setupRealtimeUpdates() {
        if (!window.supabaseClient) return;
        if (this.realtimeChannel) {
            this.realtimeChannel.unsubscribe();
        }
        this.realtimeChannel = window.supabaseClient
            .channel('schedule_settings_realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'system_settings' }, () => {
                this.loadSettings();
            })
            .subscribe();
    }

    populateScheduleForm(data) {
        const form = document.getElementById('attendanceSettingsForm');
        if (!form) return;
        for (const [key, value] of Object.entries(data)) {
            if (form.elements[key]) {
                form.elements[key].value = value;
            }
        }
    }

    populateCalendarForm(data) {
        const form = document.getElementById('calendarSettingsForm');
        if (!form) return;
        if (form.elements['enableSaturdayClasses']) {
            form.elements['enableSaturdayClasses'].checked = !!data.enableSaturdayClasses;
        }
        if (form.elements['enableSundayClasses']) {
            form.elements['enableSundayClasses'].checked = !!data.enableSundayClasses;
        }
    }

    async saveScheduleSettings() {
        this.showLoading();
        const form = document.getElementById('attendanceSettingsForm');
        const formData = new FormData(form);
        const settings = Object.fromEntries(formData.entries());

        try {
            if (window.USE_SUPABASE && window.supabaseClient) {
                const { error } = await window.supabaseClient
                    .from('system_settings')
                    .upsert({ 
                        key: 'attendance_schedule', 
                        value: settings,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'key' });
                if (error) throw error;
            } else {
                await window.EducareTrack.db.collection('system_settings').doc('attendance_schedule').set(settings);
            }
            alert('Schedule settings saved successfully!');
        } catch (error) {
            console.error('Error saving schedule settings:', error);
            alert('Error saving schedule settings: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    async saveCalendarSettings() {
        this.showLoading();
        const form = document.getElementById('calendarSettingsForm');
        const settings = {
            enableSaturdayClasses: form.elements['enableSaturdayClasses'].checked,
            enableSundayClasses: form.elements['enableSundayClasses'].checked
        };

        try {
            if (window.USE_SUPABASE && window.supabaseClient) {
                const { error } = await window.supabaseClient
                    .from('system_settings')
                    .upsert({ 
                        key: 'calendar_settings', 
                        value: settings,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'key' });
                if (error) throw error;
            } else {
                await window.EducareTrack.db.collection('system_settings').doc('calendar_settings').set(settings);
            }
            alert('Calendar settings saved successfully!');
            
            // Notify School Calendar system if possible (optional, relies on reload mostly)
        } catch (error) {
            console.error('Error saving calendar settings:', error);
            alert('Error saving calendar settings: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    showLoading() {
        const spinner = document.getElementById('loadingSpinner');
        if (spinner) spinner.classList.remove('hidden');
    }

    hideLoading() {
        const spinner = document.getElementById('loadingSpinner');
        if (spinner) spinner.classList.add('hidden');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.attendanceSettingsManager = new AttendanceSettingsManager();
});
