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
            logoutBtn.addEventListener('click', () => {
                this.openConfirmationModal(
                    'Sign Out',
                    'Are you sure you want to sign out?',
                    () => {
                        localStorage.removeItem('educareTrack_user');
                        window.location.href = '../index.html';
                    }
                );
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

        // Semester Break Form Submit
        const semesterBreakForm = document.getElementById('semesterBreakForm');
        if (semesterBreakForm) {
            semesterBreakForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveSemesterBreak();
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

        // Event Type Change
        const eventTypeSelect = document.getElementById('eventType');
        if (eventTypeSelect) {
            eventTypeSelect.addEventListener('change', () => {
                this.toggleLevelSelection();
            });
        }

        // Emergency Form Submit
        const emergencyForm = document.getElementById('emergencyForm');
        if (emergencyForm) {
            emergencyForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.submitEmergency();
            });
        }
    }

    async loadSettings() {
        try {
            let scheduleSettings = null;
            let calendarSettings = null;
            let semesterBreak = null;
            if (window.USE_SUPABASE && window.supabaseClient) {
                const { data } = await window.supabaseClient
                    .from('system_settings')
                    .select('key,value')
                    .in('key', ['attendance_schedule', 'calendar_settings', 'semester_break']);
                (data || []).forEach(row => {
                    if (row.key === 'attendance_schedule') scheduleSettings = row.value;
                    if (row.key === 'calendar_settings') calendarSettings = row.value;
                    if (row.key === 'semester_break') semesterBreak = row.value;
                });
            } else {
                const [scheduleDoc, calendarDoc, semesterDoc] = await Promise.all([
                    window.EducareTrack.db.collection('system_settings').doc('attendance_schedule').get(),
                    window.EducareTrack.db.collection('system_settings').doc('calendar_settings').get(),
                    window.EducareTrack.db.collection('system_settings').doc('semester_break').get()
                ]);
                if (scheduleDoc.exists) scheduleSettings = scheduleDoc.data();
                if (calendarDoc.exists) calendarSettings = calendarDoc.data();
                if (semesterDoc.exists) semesterBreak = semesterDoc.data();
            }
            this.populateScheduleForm(scheduleSettings || this.defaultSchedule);
            this.calendarSettings = calendarSettings || this.calendarSettings;
            this.populateCalendarForm(this.calendarSettings);
            this.populateSemesterBreakForm(semesterBreak);
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
            .channel('school_calendar_changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'school_calendar' },
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
        // Sunday is always disabled/false, no need to populate
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
            this.showNotification('Schedule settings saved successfully!', 'success');
        } catch (error) {
            console.error('Error saving schedule settings:', error);
            this.showNotification('Error saving schedule settings: ' + error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    async saveCalendarSettings() {
        this.showLoading();
        const form = document.getElementById('calendarSettingsForm');
        const settings = {
            enableSaturdayClasses: form.elements['enableSaturdayClasses'].checked,
            enableSundayClasses: false // Enforce no Sunday classes
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
            
            this.showNotification('Calendar settings saved successfully!', 'success');
        } catch (error) {
            console.error('Error saving calendar settings:', error);
            this.showNotification('Error saving calendar settings: ' + error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    populateSemesterBreakForm(data) {
        if (!data) return;
        const form = document.getElementById('semesterBreakForm');
        if (!form) return;

        if (data.start) form.elements['sem_break_start'].value = data.start;
        if (data.end) form.elements['sem_break_end'].value = data.end;
    }

    async saveSemesterBreak() {
        this.showLoading();
        const form = document.getElementById('semesterBreakForm');
        const settings = {
            start: form.elements['sem_break_start'].value,
            end: form.elements['sem_break_end'].value
        };

        try {
            if (window.USE_SUPABASE && window.supabaseClient) {
                const { error } = await window.supabaseClient
                    .from('system_settings')
                    .upsert({ 
                        key: 'semester_break', 
                        value: settings,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'key' });
                if (error) throw error;
            } else {
                await window.EducareTrack.db.collection('system_settings').doc('semester_break').set(settings);
            }
            alert('Semester break saved successfully!');
        } catch (error) {
            console.error('Error saving semester break:', error);
            alert('Error saving semester break: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    async loadEvents(showSpinner = true) {
        if (showSpinner) this.showLoading();
        try {
            if (window.USE_SUPABASE && window.supabaseClient) {
                const { data, error } = await window.supabaseClient
                    .from('school_calendar')
                    .select('*');
                if (error) throw error;
                // Map database columns to app properties
                this.events = (data || []).map(event => ({
                    id: event.id,
                    title: event.title,
                    date: event.start_date.split('T')[0], // Extract date part
                    type: event.type,
                    description: event.notes,
                    start_date: event.start_date,
                    end_date: event.end_date
                }));
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

        // Reset levels
        const allLevelsCb = document.getElementById('level_all');
        if (allLevelsCb) {
            allLevelsCb.checked = true;
            this.toggleAllLevels(allLevelsCb);
        }
        this.toggleLevelSelection();
        
        const modal = document.getElementById('eventModal');
        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }
    }

    toggleLevelSelection() {
        const typeEl = document.getElementById('eventType');
        const container = document.getElementById('affectedLevelsContainer');
        if (!typeEl || !container) return;
        
        const type = typeEl.value;
        if (type === 'suspension' || type === 'holiday') {
            container.classList.remove('hidden');
        } else {
            container.classList.add('hidden');
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
        
        // Handle levels extraction from notes
        let description = event.description || '';
        const levelMatch = description.match(/{{LEVELS:(.*?)}}/);
        const allLevelsCb = document.getElementById('level_all');
        
        if (levelMatch) {
            // Specific levels
            if (allLevelsCb) {
                allLevelsCb.checked = false;
                this.toggleAllLevels(allLevelsCb);
            }
            
            const levels = levelMatch[1].split(',');
            const levelCbs = document.querySelectorAll('input[name="affected_level"]');
            levelCbs.forEach(cb => {
                cb.checked = levels.includes(cb.value);
            });
            
            // Clean description for display
            description = description.replace(levelMatch[0], '').trim();
        } else {
            // All levels
            if (allLevelsCb) {
                allLevelsCb.checked = true;
                this.toggleAllLevels(allLevelsCb);
            }
        }
        
        if (eventDescription) eventDescription.value = description;
        
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

    toggleAllLevels(checkbox) {
        const levelCbs = document.querySelectorAll('input[name="affected_level"]');
        levelCbs.forEach(cb => {
            if (checkbox.checked) cb.checked = true;
            cb.disabled = checkbox.checked;
        });
    }

    async saveEvent() {
        const id = document.getElementById('eventId').value;
        const dateStr = document.getElementById('eventDate').value;
        // Construct ISO string for start_date (assuming all day event for now)
        const startDate = new Date(dateStr);
        const endDate = new Date(dateStr);
        endDate.setHours(23, 59, 59, 999);

        let notes = document.getElementById('eventDescription').value;
        
        // Handle affected levels
        const allLevelsChecked = document.getElementById('level_all').checked;
        if (!allLevelsChecked) {
            const checkboxes = document.querySelectorAll('input[name="affected_level"]:checked');
            const levels = Array.from(checkboxes).map(cb => cb.value);
            if (levels.length > 0) {
                // Append levels tag to notes
                notes = (notes + `\n\n{{LEVELS:${levels.join(',')}}}`).trim();
            }
        }

        const eventData = {
            start_date: startDate.toISOString(),
            end_date: endDate.toISOString(),
            title: document.getElementById('eventTitle').value,
            type: document.getElementById('eventType').value,
            notes: notes,
            created_by: this.currentUser ? this.currentUser.id : null
        };

        this.showLoading();
        try {
            if (window.USE_SUPABASE && window.supabaseClient) {
                if (id) {
                    const { error } = await window.supabaseClient
                        .from('school_calendar')
                        .update(eventData)
                        .eq('id', id);
                    if (error) throw error;
                } else {
                    const { error } = await window.supabaseClient
                        .from('school_calendar')
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

    openConfirmationModal(title, message, onConfirm) {
        const modal = document.getElementById('confirmationModal');
        const titleEl = document.getElementById('confirmationTitle');
        const messageEl = document.getElementById('confirmationMessage');
        const okBtn = document.getElementById('confirmOkBtn');
        const cancelBtn = document.getElementById('confirmCancelBtn');

        if (!modal || !titleEl || !messageEl || !okBtn || !cancelBtn) return;

        titleEl.textContent = title;
        messageEl.textContent = message;

        // Remove old listeners to prevent multiple firings
        const newOkBtn = okBtn.cloneNode(true);
        okBtn.parentNode.replaceChild(newOkBtn, okBtn);
        
        const newCancelBtn = cancelBtn.cloneNode(true);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

        newOkBtn.addEventListener('click', () => {
            this.closeConfirmationModal();
            if (onConfirm) onConfirm();
        });

        newCancelBtn.addEventListener('click', () => {
            this.closeConfirmationModal();
        });

        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    closeConfirmationModal() {
        const modal = document.getElementById('confirmationModal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
    }

    syncHolidays() {
        this.openConfirmationModal(
            'Sync Holidays',
            'This will sync holidays from the national calendar. Continue?',
            async () => {
                this.showLoading();
                try {
                    // In a real app, this would fetch from an API
                    // For now, we'll just add some sample holidays if they don't exist
                    const currentYear = new Date().getFullYear();
                    const holidays = [
                        { title: 'New Year\'s Day', date: `${currentYear}-01-01`, type: 'holiday' },
                        { title: 'Independence Day', date: `${currentYear}-06-12`, type: 'holiday' },
                        { title: 'Christmas Day', date: `${currentYear}-12-25`, type: 'holiday' },
                        { title: 'Rizal Day', date: `${currentYear}-12-30`, type: 'holiday' }
                    ];

                    if (window.USE_SUPABASE && window.supabaseClient) {
                        for (const holiday of holidays) {
                            const { error } = await window.supabaseClient
                                .from('school_calendar')
                                .upsert({
                                    title: holiday.title,
                                    start_date: new Date(holiday.date).toISOString(),
                                    end_date: new Date(holiday.date).toISOString(), // Single day
                                    type: holiday.type,
                                    created_by: this.currentUser ? this.currentUser.id : null, // Ensure created_by is set
                                    created_at: new Date().toISOString()
                                }, { onConflict: 'title,start_date' }); // Assuming unique constraint or just insert
                        }
                    }
                    
                    await this.loadEvents();
                    this.showNotification('Holidays synced successfully!', 'success');
                } catch (error) {
                    console.error('Error syncing holidays:', error);
                    this.showNotification('Error syncing holidays: ' + error.message, 'error');
                } finally {
                    this.hideLoading();
                }
            }
        );
    }

    async declareEmergency() {
        this.openEmergencyModal();
    }

    openEmergencyModal() {
        const modal = document.getElementById('emergencyModal');
        const form = document.getElementById('emergencyForm');
        if (modal) {
            if (form) form.reset();
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            
            // Focus on reason input
            setTimeout(() => {
                const input = document.getElementById('emergencyReason');
                if (input) input.focus();
            }, 100);
        }
    }

    closeEmergencyModal() {
        const modal = document.getElementById('emergencyModal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
    }

    async submitEmergency() {
        const reasonInput = document.getElementById('emergencyReason');
        const createAnnouncementCheckbox = document.getElementById('createEmergencyAnnouncement');
        
        if (!reasonInput || !reasonInput.value.trim()) {
            alert('Please provide a reason for the emergency.');
            return;
        }

        const reason = reasonInput.value.trim();
        const createAnnouncement = createAnnouncementCheckbox ? createAnnouncementCheckbox.checked : true;

        this.showLoading();
        try {
            const today = new Date();
            const eventData = {
                title: 'Emergency Suspension',
                start_date: today.toISOString(),
                end_date: today.toISOString(),
                type: 'suspension',
                notes: reason,
                created_by: this.currentUser ? this.currentUser.id : null,
                created_at: new Date().toISOString()
            };

            if (window.USE_SUPABASE && window.supabaseClient) {
                const { error } = await window.supabaseClient
                    .from('school_calendar')
                    .insert([eventData]);
                if (error) throw error;
            }
            
            await this.loadEvents();
            this.closeEmergencyModal();
            
            if (createAnnouncement) {
                if (window.EducareTrack && window.EducareTrack.createAnnouncement) {
                    await window.EducareTrack.createAnnouncement({
                        title: 'Emergency Suspension',
                        message: `Classes are suspended due to: ${reason}`,
                        audience: ['all'],
                        isUrgent: true,
                        expiryDate: new Date(today.getTime() + 24 * 60 * 60 * 1000) // 1 day expiry
                    });
                    this.showNotification('Emergency declared and announcement sent!', 'success');
                } else {
                    this.showNotification('Emergency declared!', 'success');
                }
            } else {
                this.showNotification('Emergency declared!', 'success');
            }
        } catch (error) {
            console.error('Error declaring emergency:', error);
            alert('Error declaring emergency: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    showNotification(message, type = 'info') {
        const toast = document.getElementById('notificationToast');
        const content = document.getElementById('notificationContent');
        const msgEl = document.getElementById('notificationMessage');
        const iconEl = document.getElementById('notificationIcon');
        
        if (!toast || !content || !msgEl || !iconEl) {
            alert(message);
            return;
        }

        // Set content
        msgEl.textContent = message;
        
        // Set styles based on type
        content.className = 'bg-white rounded-lg shadow-lg border-l-4 p-4 flex items-center min-w-[300px]';
        if (type === 'success') {
            content.classList.add('border-green-500');
            iconEl.innerHTML = '<i class="fas fa-check-circle text-green-500 text-xl"></i>';
        } else if (type === 'error') {
            content.classList.add('border-red-500');
            iconEl.innerHTML = '<i class="fas fa-times-circle text-red-500 text-xl"></i>';
        } else {
            content.classList.add('border-blue-500');
            iconEl.innerHTML = '<i class="fas fa-info-circle text-blue-500 text-xl"></i>';
        }

        // Show
        toast.classList.remove('translate-y-20', 'opacity-0');
        
        // Hide after 3 seconds
        setTimeout(() => {
            this.hideNotification();
        }, 3000);
    }

    hideNotification() {
        const toast = document.getElementById('notificationToast');
        if (toast) {
            toast.classList.add('translate-y-20', 'opacity-0');
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
