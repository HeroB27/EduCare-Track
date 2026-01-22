class SettingsManager {
    constructor() {
        this.defaultSchedule = {
            kinder_in: '07:30', kinder_out: '11:30',
            g1_3_in: '07:30', g1_3_out: '13:00',
            g4_6_in: '07:30', g4_6_out: '15:00',
            jhs_in: '07:30', jhs_out: '16:00',
            shs_in: '07:30', shs_out: '16:30'
        };
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.updateCurrentTime();
        setInterval(() => this.updateCurrentTime(), 60000);
        await this.loadSettings();
    }

    setupEventListeners() {
        // Sidebar
        document.getElementById('sidebarToggle').addEventListener('click', () => this.toggleSidebar());
        document.getElementById('logoutBtn').addEventListener('click', () => this.logout());

        // Form
        document.getElementById('attendanceSettingsForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveSettings();
        });
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

    async loadSettings() {
        this.showLoading();
        try {
            let settings = null;

            if (window.USE_SUPABASE && window.supabaseClient) {
                const { data, error } = await window.supabaseClient
                    .from('system_settings')
                    .select('value')
                    .eq('key', 'attendance_schedule')
                    .single();
                
                if (data) settings = data.value;
                // If error (e.g. not found), we stick to null -> default
            } else {
                // Firestore Fallback
                const doc = await window.EducareTrack.db.collection('system_settings').doc('attendance_schedule').get();
                if (doc.exists) settings = doc.data();
            }

            this.populateForm(settings || this.defaultSchedule);

        } catch (error) {
            console.error('Error loading settings:', error);
            this.populateForm(this.defaultSchedule);
        } finally {
            this.hideLoading();
        }
    }

    populateForm(data) {
        const form = document.getElementById('attendanceSettingsForm');
        for (const [key, value] of Object.entries(data)) {
            if (form.elements[key]) {
                form.elements[key].value = value;
            }
        }
    }

    async saveSettings() {
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
                // Firestore Fallback
                await window.EducareTrack.db.collection('system_settings').doc('attendance_schedule').set(settings);
            }
            alert('Settings saved successfully!');
        } catch (error) {
            console.error('Error saving settings:', error);
            alert('Error saving settings: ' + error.message);
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
    window.settingsManager = new SettingsManager();
});