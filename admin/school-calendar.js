class CalendarManager {
    constructor() {
        this.currentDate = new Date();
        this.events = [];
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.updateCurrentTime();
        setInterval(() => this.updateCurrentTime(), 60000);
        await this.loadSettings();
        await this.loadEvents();
        this.renderCalendar();
        this.setupRealtimeSubscription();
    }

    async loadSettings() {
        try {
            this.settings = { enableSaturdayClasses: false, enableSundayClasses: false };
            
            if (!window.supabaseClient) {
                throw new Error('Supabase client not initialized');
            }
            const { data } = await window.supabaseClient
                .from('system_settings')
                .select('value')
                .eq('key', 'calendar_settings')
                .single();
            if (data) this.settings = { ...this.settings, ...data.value };
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }

    setupRealtimeSubscription() {
        if (!window.supabaseClient) {
            console.error('Supabase client not initialized');
            return;
        }
        window.supabaseClient
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

    setupEventListeners() {
        // Sidebar
        document.getElementById('sidebarToggle').addEventListener('click', () => this.toggleSidebar());
        document.getElementById('logoutBtn').addEventListener('click', () => this.logout());

        // Calendar Controls
        document.getElementById('prevMonth').addEventListener('click', () => {
            this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() - 1, 1);
            this.renderCalendar();
        });

        document.getElementById('nextMonth').addEventListener('click', () => {
            this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 1);
            this.renderCalendar();
        });

        document.getElementById('todayBtn').addEventListener('click', () => {
            this.currentDate = new Date();
            this.renderCalendar();
        });

        // Form
        document.getElementById('eventForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveEvent();
        });

        // Level Checkboxes
        document.querySelectorAll('.level-checkbox').forEach(cb => {
            cb.addEventListener('change', () => {
                const all = document.getElementById('level_all');
                const checkboxes = document.querySelectorAll('.level-checkbox');
                const allChecked = Array.from(checkboxes).every(c => c.checked);
                all.checked = allChecked;
            });
        });
    }

    toggleLevelSelection() {
        const type = document.getElementById('eventType').value;
        const container = document.getElementById('affectedLevelsContainer');
        if (type === 'suspension' || type === 'holiday') {
            container.classList.remove('hidden');
        } else {
            container.classList.add('hidden');
        }
    }

    toggleAllLevels(source) {
        const checkboxes = document.querySelectorAll('.level-checkbox');
        checkboxes.forEach(cb => {
            cb.checked = source.checked;
        });
    }

    async syncHolidays() {
        if (!confirm('This will import standard Philippine holidays for 2026. Continue?')) return;
        
        this.showLoading();
        try {
            const holidays = [
                { date: '2026-01-01', title: "New Year's Day", type: 'holiday', notes: 'Regular Holiday' },
                { date: '2026-02-25', title: 'EDSA Revolution Anniversary', type: 'holiday', notes: 'Special Non-Working Holiday' },
                { date: '2026-04-02', title: 'Maundy Thursday', type: 'holiday', notes: 'Regular Holiday' },
                { date: '2026-04-03', title: 'Good Friday', type: 'holiday', notes: 'Regular Holiday' },
                { date: '2026-04-09', title: 'Araw ng Kagitingan', type: 'holiday', notes: 'Regular Holiday' },
                { date: '2026-05-01', title: 'Labor Day', type: 'holiday', notes: 'Regular Holiday' },
                { date: '2026-06-12', title: 'Independence Day', type: 'holiday', notes: 'Regular Holiday' },
                { date: '2026-08-31', title: 'National Heroes Day', type: 'holiday', notes: 'Regular Holiday' },
                { date: '2026-11-01', title: "All Saints' Day", type: 'holiday', notes: 'Special Non-Working Holiday' },
                { date: '2026-11-02', title: "All Souls' Day", type: 'holiday', notes: 'Special Working Holiday' },
                { date: '2026-11-30', title: 'Bonifacio Day', type: 'holiday', notes: 'Regular Holiday' },
                { date: '2026-12-08', title: 'Feast of the Immaculate Conception', type: 'holiday', notes: 'Special Non-Working Holiday' },
                { date: '2026-12-25', title: 'Christmas Day', type: 'holiday', notes: 'Regular Holiday' },
                { date: '2026-12-30', title: 'Rizal Day', type: 'holiday', notes: 'Regular Holiday' }
            ];

            const newEvents = [];
            
            for (const h of holidays) {
                // Check if exists
                const exists = this.events.some(e => e.date === h.date && (e.type === 'holiday' || e.title === h.title));
                if (!exists) {
                    newEvents.push({
                        title: h.title,
                        start_date: new Date(h.date).toISOString(),
                        end_date: new Date(h.date + 'T23:59:59').toISOString(),
                        type: h.type,
                        notes: h.notes,
                        created_at: new Date().toISOString()
                    });
                }
            }

            if (newEvents.length > 0) {
                const { error } = await window.supabaseClient
                    .from('school_calendar')
                    .insert(newEvents);
                
                if (error) throw error;
                alert(`Successfully added ${newEvents.length} holidays.`);
                await this.loadEvents();
            } else {
                alert('All holidays are already synced.');
            }

        } catch (error) {
            console.error('Error syncing holidays:', error);
            alert('Error syncing holidays: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    declareEmergency() {
        this.openAddEventModal(new Date().toISOString().split('T')[0]);
        document.getElementById('eventType').value = 'suspension';
        document.getElementById('eventTitle').value = 'Emergency Suspension';
        this.toggleLevelSelection();
        // Default to All Levels
        document.getElementById('level_all').checked = true;
        this.toggleAllLevels(document.getElementById('level_all'));
    }

    toggleSidebar() {
        const sidebar = document.querySelector('.sidebar');
        const mainContent = document.querySelector('.main-content');
        sidebar.classList.toggle('collapsed');
        if (sidebar.classList.contains('collapsed')) {
            mainContent.classList.remove('ml-64');
            mainContent.classList.add('ml-16');
        } else {
            mainContent.classList.remove('ml-16');
            mainContent.classList.add('ml-64');
        }
    }

    updateCurrentTime() {
        const el = document.getElementById('currentTime');
        if (el) el.textContent = new Date().toLocaleString();
    }

    async logout() {
        if (confirm('Are you sure you want to logout?')) {
            localStorage.removeItem('educareTrack_user');
            window.location.href = '../index.html';
        }
    }

    async loadEvents(showSpinner = true) {
        if (showSpinner) this.showLoading();
        try {
            if (!window.supabaseClient) {
                throw new Error('Supabase client not initialized');
            }
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
        } catch (error) {
            console.error('Error loading events:', error);
            // Fallback for demo if no table exists yet
            this.events = [];
        }
        if (showSpinner) this.hideLoading();
        this.renderCalendar();
    }

    renderCalendar() {
        const grid = document.getElementById('calendarGrid');
        const monthYear = document.getElementById('currentMonthYear');
        
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
            const isWeekend = currentDayOfWeek === 0 || currentDayOfWeek === 6;
            const isSaturday = currentDayOfWeek === 6;
            const isSunday = currentDayOfWeek === 0;

            if (isSaturday && !this.settings.enableSaturdayClasses) {
                dayDiv.classList.add('bg-gray-100'); // Visual cue for non-school Saturday
            } else if (isSunday) {
                dayDiv.classList.add('bg-gray-100'); // Visual cue for non-school Sunday (always)
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
        document.getElementById('modalTitle').textContent = 'Add Event';
        document.getElementById('eventForm').reset();
        document.getElementById('eventId').value = '';
        if (date) document.getElementById('eventDate').value = date;
        
        // Reset levels
        document.getElementById('level_all').checked = true;
        this.toggleAllLevels(document.getElementById('level_all'));
        this.toggleLevelSelection();

        const modal = document.getElementById('eventModal');
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    editEvent(event) {
        document.getElementById('modalTitle').textContent = 'Edit Event';
        document.getElementById('eventId').value = event.id;
        document.getElementById('eventDate').value = event.date;
        document.getElementById('eventTitle').value = event.title;
        document.getElementById('eventType').value = event.type;
        
        // Parse description and levels
        let description = event.description || '';
        const levelMatch = description.match(/{{LEVELS:(.*?)}}/);
        
        if (levelMatch) {
            // Specific levels
            const levels = levelMatch[1].split(',');
            document.getElementById('level_all').checked = false;
            document.querySelectorAll('.level-checkbox').forEach(cb => {
                cb.checked = levels.includes(cb.value);
            });
            // Remove the tag from description for display
            description = description.replace(/{{LEVELS:.*?}}/, '').trim();
        } else {
            // All levels (default)
            document.getElementById('level_all').checked = true;
            this.toggleAllLevels(document.getElementById('level_all'));
        }
        
        document.getElementById('eventDescription').value = description;
        this.toggleLevelSelection();
        
        const modal = document.getElementById('eventModal');
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    closeModal() {
        const modal = document.getElementById('eventModal');
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    async saveEvent() {
        const id = document.getElementById('eventId').value;
        const dateStr = document.getElementById('eventDate').value;
        // Construct ISO string for start_date (assuming all day event for now, or use specific time if available)
        // If we want to support multi-day, we need end date input. For now, defaulting end_date to same day.
        const startDate = new Date(dateStr);
        const endDate = new Date(dateStr);
        endDate.setHours(23, 59, 59, 999); // End of day

        let notes = document.getElementById('eventDescription').value;
        const type = document.getElementById('eventType').value;
        
        // Handle Levels for Suspension/Holiday
        if (type === 'suspension' || type === 'holiday') {
            const allChecked = document.getElementById('level_all').checked;
            if (!allChecked) {
                const checkedLevels = Array.from(document.querySelectorAll('.level-checkbox:checked'))
                    .map(cb => cb.value);
                notes = `${notes} {{LEVELS:${checkedLevels.join(',')}}}`;
            }
        }

        const eventData = {
            start_date: startDate.toISOString(),
            end_date: endDate.toISOString(),
            title: document.getElementById('eventTitle').value,
            type: type,
            notes: notes,
            // updated_at is handled by trigger usually, but we can set it if needed, or rely on default
        };

        this.showLoading();
        try {
            if (!window.supabaseClient) {
                throw new Error('Supabase client not initialized');
            }
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
    window.calendarManager = new CalendarManager();
});
