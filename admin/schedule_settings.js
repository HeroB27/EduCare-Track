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
        this.calendarSettings = {
            enableSaturdayClasses: false,
            enableSundayClasses: false
        };
        this.currentDate = new Date();
        this.events = [];
        this.realtimeChannel = null;
        this.calendarSubscription = null;
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
            this.populateCalendarForm(this.calendarSettings);
            await this.loadSettings();
            await this.loadEvents();
            this.renderCalendar();
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

        // Calendar Controls
        const prevBtn = document.getElementById('prevMonth');
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() - 1, 1);
                this.renderCalendar();
            });
        }

        const nextBtn = document.getElementById('nextMonth');
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 1);
                this.renderCalendar();
            });
        }

        const todayBtn = document.getElementById('todayBtn');
        if (todayBtn) {
            todayBtn.addEventListener('click', () => {
                this.currentDate = new Date();
                this.renderCalendar();
            });
        }

        // Event Form
        const eventForm = document.getElementById('eventForm');
        if (eventForm) {
            eventForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveEvent();
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
            this.calendarSettings = calendarSettings || this.calendarSettings;
            this.populateCalendarForm(this.calendarSettings);
        } catch (error) {
            console.error('Error loading settings:', error);
            this.populateScheduleForm(this.defaultSchedule);
            this.populateCalendarForm(this.calendarSettings);
        }
    }

    setupRealtimeUpdates() {
        if (!window.supabaseClient) return;
        
        // System Settings Subscription
        if (this.realtimeChannel) {
            this.realtimeChannel.unsubscribe();
        }
        this.realtimeChannel = window.supabaseClient
            .channel('schedule_settings_realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'system_settings' }, () => {
                this.loadSettings();
            })
            .subscribe();

        // Calendar Events Subscription
        if (this.calendarSubscription) {
            this.calendarSubscription.unsubscribe();
        }
        this.calendarSubscription = window.supabaseClient
            .channel('calendar_events_changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'calendar_events' },
                (payload) => {
                    console.log('Real-time update received:', payload);
                    this.loadEvents(false);
                }
            )
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
            // Update local settings immediately
            this.calendarSettings = settings;
            this.renderCalendar(); // Re-render to reflect changes
            
            alert('Calendar settings saved successfully!');
        } catch (error) {
            console.error('Error saving calendar settings:', error);
            alert('Error saving calendar settings: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    async loadEvents(showSpinner = true) {
        if (showSpinner) this.showLoading();
        try {
            if (window.USE_SUPABASE && window.supabaseClient) {
                const { data, error } = await window.supabaseClient
                    .from('calendar_events')
                    .select('*');
                if (error) throw error;
                this.events = data || [];
            } else {
                this.events = [];
            }
        } catch (error) {
            console.error('Error loading events:', error);
            this.events = [];
        }
        if (showSpinner) this.hideLoading();
        this.renderCalendar();
    }

    renderCalendar() {
        const grid = document.getElementById('calendarGrid');
        const monthYear = document.getElementById('currentMonthYear');
        
        if (!grid || !monthYear) return;

        grid.innerHTML = '';
        monthYear.textContent = this.currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        
        const startDayIndex = firstDay.getDay(); // 0 (Sun) to 6 (Sat)
        const totalDays = lastDay.getDate();

        // Previous Month Padding
        const prevMonthLastDay = new Date(year, month, 0).getDate();
        for (let i = startDayIndex - 1; i >= 0; i--) {
            const dayDiv = document.createElement('div');
            dayDiv.className = 'calendar-day other-month';
            dayDiv.textContent = prevMonthLastDay - i;
            grid.appendChild(dayDiv);
        }

        // Current Month Days
        const today = new Date();
        for (let day = 1; day <= totalDays; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayDiv = document.createElement('div');
            dayDiv.className = 'calendar-day relative group';
            
            const currentDayOfWeek = (startDayIndex + day - 1) % 7;
            const isSaturday = currentDayOfWeek === 6;
            const isSunday = currentDayOfWeek === 0;

            if (isSaturday && !this.calendarSettings.enableSaturdayClasses) {
                dayDiv.classList.add('bg-gray-100'); // Visual cue for non-school Saturday
            } else if (isSunday && !this.calendarSettings.enableSundayClasses) {
                dayDiv.classList.add('bg-gray-100'); // Visual cue for non-school Sunday
            }

            if (today.getDate() === day && today.getMonth() === month && today.getFullYear() === year) {
                dayDiv.classList.add('today');
            }

            // Date Number
            const dateNum = document.createElement('div');
            dateNum.className = 'font-semibold text-gray-700 mb-1';
            dateNum.textContent = day;
            dayDiv.appendChild(dateNum);

            // Add Event Button (Visible on Hover)
            const addBtn = document.createElement('button');
            addBtn.className = 'absolute top-1 right-1 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity';
            addBtn.innerHTML = '<i class="fas fa-plus-circle"></i>';
            addBtn.onclick = (e) => {
                e.stopPropagation();
                this.openAddEventModal(dateStr);
            };
            dayDiv.appendChild(addBtn);

            // Events for this day
            const dayEvents = this.events.filter(e => e.date === dateStr);
            dayEvents.forEach(event => {
                const chip = document.createElement('div');
                chip.className = `event-chip ${this.getEventClass(event.type)}`;
                chip.textContent = event.title;
                chip.onclick = (e) => {
                    e.stopPropagation();
                    this.editEvent(event);
                };
                dayDiv.appendChild(chip);
            });

            grid.appendChild(dayDiv);
        }

        // Next Month Padding
        const remainingCells = 42 - (startDayIndex + totalDays); // 6 rows * 7 cols = 42
        for (let i = 1; i <= remainingCells; i++) {
            const dayDiv = document.createElement('div');
            dayDiv.className = 'calendar-day other-month';
            dayDiv.textContent = i;
            grid.appendChild(dayDiv);
        }
    }

    getEventClass(type) {
        switch (type) {
            case 'holiday': return 'event-holiday';
            case 'suspension': return 'event-suspension';
            default: return 'event-activity';
        }
    }

    openAddEventModal(date = '') {
        const modalTitle = document.getElementById('modalTitle');
        const eventForm = document.getElementById('eventForm');
        const eventId = document.getElementById('eventId');
        const eventDate = document.getElementById('eventDate');
        
        if (modalTitle) modalTitle.textContent = 'Add Event';
        if (eventForm) eventForm.reset();
        if (eventId) eventId.value = '';
        if (eventDate && date) eventDate.value = date;
        
        const modal = document.getElementById('eventModal');
        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }
    }

    editEvent(event) {
        const modalTitle = document.getElementById('modalTitle');
        const eventId = document.getElementById('eventId');
        const eventDate = document.getElementById('eventDate');
        const eventTitle = document.getElementById('eventTitle');
        const eventType = document.getElementById('eventType');
        const eventDescription = document.getElementById('eventDescription');

        if (modalTitle) modalTitle.textContent = 'Edit Event';
        if (eventId) eventId.value = event.id;
        if (eventDate) eventDate.value = event.date;
        if (eventTitle) eventTitle.value = event.title;
        if (eventType) eventType.value = event.type;
        if (eventDescription) eventDescription.value = event.description || '';
        
        const modal = document.getElementById('eventModal');
        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }
    }

    closeModal() {
        const modal = document.getElementById('eventModal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
    }

    async saveEvent() {
        const id = document.getElementById('eventId').value;
        const eventData = {
            date: document.getElementById('eventDate').value,
            title: document.getElementById('eventTitle').value,
            type: document.getElementById('eventType').value,
            description: document.getElementById('eventDescription').value,
            updated_at: new Date().toISOString()
        };

        this.showLoading();
        try {
            if (window.USE_SUPABASE && window.supabaseClient) {
                if (id) {
                    const { error } = await window.supabaseClient
                        .from('calendar_events')
                        .update(eventData)
                        .eq('id', id);
                    if (error) throw error;
                } else {
                    const { error } = await window.supabaseClient
                        .from('calendar_events')
                        .insert([{ ...eventData, created_at: new Date().toISOString() }]);
                    if (error) throw error;
                }
            }
            this.closeModal();
            this.loadEvents();
        } catch (error) {
            console.error('Error saving event:', error);
            alert('Error saving event: ' + error.message);
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
