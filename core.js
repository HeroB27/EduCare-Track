// core.js - EducareTrack Central System Core
// OPTIMIZED VERSION for Fast Performance
// COMPLETE K-12 CURRICULUM SUPPORT WITH REPORTS & ANALYTICS

if (typeof window !== 'undefined' && typeof window.exports === 'undefined') {
    window.exports = {};
}

const SupabaseFieldValue = {
    serverTimestamp: () => new Date(),
    arrayUnion: (...values) => ({ __op: 'arrayUnion', values }),
    arrayRemove: (...values) => ({ __op: 'arrayRemove', values })
};
const SupabaseTimestamp = { fromDate: (d) => ({ toDate: () => d }) };
class SupabaseDoc {
    constructor(client, table, id, data) {
        this.id = id;
        this._data = data || {};
        this.ref = new SupabaseDocRef(client, table, id);
    }
    data() {
        return this._data || {};
    }
}
class SupabaseSnapshot {
    constructor(client, table, rows) {
        this.docs = rows.map(r => new SupabaseDoc(client, table, r.id, r));
        this.size = this.docs.length;
    }
    forEach(fn) {
        this.docs.forEach(fn);
    }
    docChanges() {
        return this.docs.map(d => ({ type: 'added', doc: d }));
    }
}
class SupabaseDocRef {
    constructor(client, table, id) {
        this.client = client;
        this.table = table;
        this.id = id;
    }
    async _ensureClient() {
        if (!this.client && typeof window !== 'undefined' && window.supabaseClient) {
            this.client = window.supabaseClient;
        }
        if (!this.client) {
            await new Promise(resolve => {
                let tries = 0;
                const t = setInterval(() => {
                    tries++;
                    if (window.supabaseClient) {
                        this.client = window.supabaseClient;
                        clearInterval(t);
                        resolve();
                    } else if (tries >= 30) {
                        clearInterval(t);
                        resolve();
                    }
                }, 100);
            });
        }
        if (!this.client) throw new Error('Supabase client not initialized');
    }
    async get() {
        await this._ensureClient();
        const { data } = await this.client.from(this.table).select('*').eq('id', this.id).single();
        if (!data) return { exists: false, data: () => ({}) };
        return { exists: true, id: this.id, data: () => data };
    }
    async set(data) {
        await this._ensureClient();
        await this.client.from(this.table).upsert({ id: this.id, ...data });
    }
    async update(data) {
        await this._ensureClient();
        const processed = { ...data };
        const sentinelKeys = Object.keys(processed).filter(k => processed[k] && typeof processed[k] === 'object' && processed[k].__op);
        if (sentinelKeys.length > 0) {
            const { data: current } = await this.client.from(this.table).select('*').eq('id', this.id).single();
            sentinelKeys.forEach(key => {
                const op = processed[key].__op;
                const values = Array.isArray(processed[key].values) ? processed[key].values : [];
                const existing = Array.isArray(current?.[key]) ? current[key] : [];
                let next = existing.slice();
                if (op === 'arrayUnion') {
                    values.forEach(v => { if (!next.includes(v)) next.push(v); });
                } else if (op === 'arrayRemove') {
                    next = next.filter(v => !values.includes(v));
                }
                processed[key] = next;
            });
        }
        await this.client.from(this.table).update(processed).eq('id', this.id);
    }
    async delete() {
        await this._ensureClient();
        await this.client.from(this.table).delete().eq('id', this.id);
    }
}
class SupabaseCollection {
    constructor(client, table) {
        this.client = client;
        this.table = table;
        this._filters = [];
        this._order = null;
        this._limit = null;
        this._pollTimer = null;
    }
    async _ensureClient() {
        if (!this.client && typeof window !== 'undefined' && window.supabaseClient) {
            this.client = window.supabaseClient;
        }
        if (!this.client) {
            await new Promise(resolve => {
                let tries = 0;
                const t = setInterval(() => {
                    tries++;
                    if (window.supabaseClient) {
                        this.client = window.supabaseClient;
                        clearInterval(t);
                        resolve();
                    } else if (tries >= 30) {
                        clearInterval(t);
                        resolve();
                    }
                }, 100);
            });
        }
        if (!this.client) throw new Error('Supabase client not initialized');
    }
    where(field, op, value) {
        this._filters.push({ field, op, value });
        return this;
    }
    orderBy(field, direction) {
        this._order = { field, direction };
        return this;
    }
    limit(n) {
        this._limit = n;
        return this;
    }
    doc(id) {
        return new SupabaseDocRef(this.client, this.table, id);
    }
    async add(data) {
        await this._ensureClient();
        const { data: inserted } = await this.client.from(this.table).insert(data).select('id').single();
        return { id: inserted?.id };
    }
    async get() {
        await this._ensureClient();
        let q = this.client.from(this.table).select('*');
        for (const f of this._filters) {
            const v = f.value instanceof Date ? f.value.toISOString() : f.value;
            if (f.op === '==') q = q.eq(f.field, v);
            else if (f.op === '>=') q = q.gte(f.field, v);
            else if (f.op === '<=') q = q.lte(f.field, v);
            else if (f.op === '>') q = q.gt(f.field, v);
            else if (f.op === '<') q = q.lt(f.field, v);
            else if (f.op === 'array-contains') q = q.contains(f.field, [v]);
            else if (f.op === 'in') q = q.in(f.field, v);
        }
        if (this._order) {
            q = q.order(this._order.field, { ascending: this._order.direction !== 'desc' });
        }
        if (this._limit) {
            q = q.limit(this._limit);
        }
        const { data } = await q;
        const rows = (data || []).map(r => {
            Object.keys(r).forEach(k => {
                if (k === 'timestamp' && r[k]) {
                    r[k] = new Date(r[k]);
                }
            });
            return r;
        });
        return new SupabaseSnapshot(this.client, this.table, rows);
    }
    onSnapshot(cb, errCb) {
        if (this._pollTimer) clearInterval(this._pollTimer);
        let lastIds = new Set();
        const poll = async () => {
            try {
                await this._ensureClient();
                const snap = await this.get();
                const currentIds = new Set(snap.docs.map(d => d.id));
                const changes = [];
                snap.docs.forEach(d => {
                    if (!lastIds.has(d.id)) {
                        changes.push({ type: 'added', doc: d });
                    } else {
                        changes.push({ type: 'modified', doc: d });
                    }
                });
                const proxy = {
                    docs: snap.docs,
                    docChanges: () => changes,
                    size: snap.size,
                    forEach: snap.forEach.bind(snap)
                };
                cb(proxy);
                lastIds = currentIds;
            } catch (e) {
                if (errCb) errCb(e);
            }
        };
        poll();
        this._pollTimer = setInterval(poll, 15000);
        return () => {
            if (this._pollTimer) clearInterval(this._pollTimer);
        };
    }
}
class SupabaseBatch {
    constructor(client) {
        this.client = client;
        this._ops = [];
    }
    set(ref, data) {
        this._ops.push({ type: 'set', ref, data });
    }
    update(ref, data) {
        this._ops.push({ type: 'update', ref, data });
    }
    delete(ref) {
        this._ops.push({ type: 'delete', ref });
    }
    async commit() {
        for (const op of this._ops) {
            if (op.type === 'set') {
                await op.ref.set(op.data);
            } else if (op.type === 'update') {
                await op.ref.update(op.data);
            } else if (op.type === 'delete') {
                await op.ref.delete();
            }
        }
        this._ops = [];
    }
}
class SupabaseFirestore {
    constructor(client) {
        this.client = client;
        this.FieldValue = SupabaseFieldValue;
        this.Timestamp = SupabaseTimestamp;
    }
    collection(name) {
        if (!this.client && typeof window !== 'undefined' && window.supabaseClient) {
            this.client = window.supabaseClient;
        }
        return new SupabaseCollection(this.client, name);
    }
    batch() {
        if (!this.client && typeof window !== 'undefined' && window.supabaseClient) {
            this.client = window.supabaseClient;
        }
        return new SupabaseBatch(this.client);
    }
}
const db = new SupabaseFirestore(window.supabaseClient);
// Expose FieldValue on db instance for compatibility
db.FieldValue = SupabaseFieldValue;

let storage = null;
window.USE_SUPABASE = true;

// Cache for frequently accessed data
const dataCache = {
    users: null,
    students: null,
    classes: null,
    stats: null,
    notifications: null,
    calendar: null,
    lastUpdated: null
};

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

// EducareTrack Core System - OPTIMIZED with Complete K-12 Curriculum
const EducareTrack = {
    // System Configuration
    config: {
        morningSessionStart: '7:30',
        morningSessionEnd: '12:00',
        afternoonSessionStart: '12:00',
        afternoonSessionEnd: '16:00',
        lateThreshold: '8:00',
        schoolName: 'EducareTrack Academy',
        schoolAddress: '123 Learning Street, Knowledge City',
        allowSaturdayClasses: false,
        allowSundayClasses: false,
        enableNotificationPermissionPrompt: false
    },

    // Database reference
    db: db,

    // Calendar & Schedule Helper
    async fetchCalendarData() {
        if (dataCache.calendar && dataCache.lastUpdated && (Date.now() - dataCache.lastUpdated < CACHE_DURATION)) {
            return dataCache.calendar;
        }

        try {
            // Fetch System Settings (Break, Weekends)
            let settings = {
                enableSaturdayClasses: false,
                enableSundayClasses: false,
                semesterBreak: null
            };

            const { data: settingsData } = await window.supabaseClient
                .from('system_settings')
                .select('*')
                .in('key', ['calendar_settings', 'semester_break']);

            if (settingsData) {
                settingsData.forEach(item => {
                    if (item.key === 'calendar_settings') {
                        settings.enableSaturdayClasses = !!item.value.enableSaturdayClasses;
                        settings.enableSundayClasses = false; // Always false
                    } else if (item.key === 'semester_break') {
                        settings.semesterBreak = item.value;
                    }
                });
            }

            // Fetch Calendar Events
            const { data: events } = await window.supabaseClient
                .from('school_calendar')
                .select('*');

            dataCache.calendar = { settings, events: events || [] };
            dataCache.lastUpdated = Date.now();
            return dataCache.calendar;
        } catch (error) {
            console.error('Error fetching calendar data:', error);
            return { settings: { enableSaturdayClasses: false, enableSundayClasses: false, semesterBreak: null }, events: [] };
        }
    },

    isSchoolDay(date, studentLevel = null) {
        if (!dataCache.calendar) {
            console.warn('Calendar data not loaded. Call fetchCalendarData() first.');
            const day = date.getDay();
            if (day === 0) return false;
            return true;
        }

        const { settings, events } = dataCache.calendar;
        const day = date.getDay();
        
        // 1. Check Weekends
        if (day === 0) return false;
        if (day === 6 && !settings.enableSaturdayClasses) return false;

        // 2. Check Semester Break
        if (settings.semesterBreak && settings.semesterBreak.start && settings.semesterBreak.end) {
            const start = new Date(settings.semesterBreak.start);
            const end = new Date(settings.semesterBreak.end);
            start.setHours(0,0,0,0);
            end.setHours(23,59,59,999);
            const checkDate = new Date(date);
            checkDate.setHours(12,0,0,0);
            
            if (checkDate >= start && checkDate <= end) return false;
        }

        // 3. Check Events
        const dateStr = date.toISOString().split('T')[0];
        const dayEvents = events.filter(e => {
            const eStart = e.start_date.split('T')[0];
            const eEnd = e.end_date.split('T')[0];
            return dateStr >= eStart && dateStr <= eEnd;
        });

        for (const event of dayEvents) {
            if (event.type === 'holiday' || event.type === 'suspension') {
                const notes = event.notes || '';
                const levelMatch = notes.match(/{{LEVELS:(.*?)}}/);
                
                if (levelMatch) {
                    if (studentLevel) {
                        const affectedLevels = levelMatch[1].split(',');
                        if (affectedLevels.includes(studentLevel)) return false;
                    } else {
                        // Partial suspension implies school is open for others
                        return true; 
                    }
                } else {
                    return false; // All levels suspended
                }
            }
        }

        return true;
    },
    storage: storage,

    // Current user session
    currentUser: null,
    currentUserRole: null,
    notificationsInitialized: false,
    lastPopupAt: 0,
    popupThrottleMs: 15000,
    notificationBoxInitialized: false,
    recentNotificationKeys: {},

    // User types
    USER_TYPES: {
        ADMIN: 'admin',
        TEACHER: 'teacher',
        GUARD: 'guard',
        CLINIC: 'clinic',
        PARENT: 'parent',
        STUDENT: 'student'
    },

    // Attendance status
    ATTENDANCE_STATUS: {
        PRESENT: 'present',
        ABSENT: 'absent',
        LATE: 'late',
        IN_CLINIC: 'in_clinic',
        EXCUSED: 'excused'
    },

    // Session types
    SESSIONS: {
        MORNING: 'morning',
        AFTERNOON: 'afternoon'
    },

    // Notification types
    NOTIFICATION_TYPES: {
        ATTENDANCE: 'attendance',
        CLINIC: 'clinic',
        ANNOUNCEMENT: 'announcement',
        EXCUSE: 'excuse',
        SYSTEM: 'system'
    },

    // Student levels - Updated with Kindergarten
    STUDENT_LEVELS: {
        KINDERGARTEN: 'Kindergarten',
        ELEMENTARY: 'Elementary',
        Junior_High_School: 'Junior High School',
        Senior_High_School: 'Senior High School'
    },

    // Senior High strands
    SENIOR_HIGH_STRANDS: {
        STEM: 'STEM',
        ABM: 'ABM', 
        HUMSS: 'HUMSS',
        ICT: 'ICT',
        GAS: 'GAS',
        TVL_ICT: 'TVL-ICT',
        TVL_HE: 'TVL-HE'
    },

    // Grade levels
    GRADE_LEVELS: {
        KINDERGARTEN: 'Kindergarten',
        GRADE_1: 'Grade 1',
        GRADE_2: 'Grade 2',
        GRADE_3: 'Grade 3', 
        GRADE_4: 'Grade 4',
        GRADE_5: 'Grade 5',
        GRADE_6: 'Grade 6',
        GRADE_7: 'Grade 7',
        GRADE_8: 'Grade 8',
        GRADE_9: 'Grade 9',
        GRADE_10: 'Grade 10',
        GRADE_11: 'Grade 11',
        GRADE_12: 'Grade 12'
    },

    // Complete K-12 Curriculum Subjects
    CURRICULUM_SUBJECTS: {
        KINDERGARTEN: [
            'Makabansa', 
            'Languages', 
            'Mathematics', 
            'GMRC', 
            'Values Education', 
            'Science', 
            'Mother Tongue',
            'Physical Education',
            'Arts and Music'
        ],
        
        ELEMENTARY: [
            'Math',
            'English',
            'Filipino', 
            'Araling Panlipunan',
            'Science',
            'TLE',
            'MAPEH',
            'GMRC',
            'Edukasyon sa Pagpapakatao',
            'Mother Tongue (Grades 1-3)',
            'Filipino (Grades 4-6)',
            'English (Grades 4-6)'
        ],
        
        Junior_High_School: [
            'English',
            'Filipino',
            'Mathematics',
            'Science',
            'Social Sciences',
            'MAPEH',
            'TLE',
            'Edukasyon sa Pagpapakatao',
            'Araling Panlipunan'
        ],
        
        Senior_High_School: {
            CORE_SUBJECTS: [
                'Oral Communication',
                'Reading and Writing',
                'Komunikasyon at Pananaliksik sa Wika at Kulturang Pilipino',
                'Pagbasa at Pagsuri ng Iba\'t Ibang Teksto Tungo sa Pananaliksik',
                '21st Century Literature from the Philippines and the World',
                'Contemporary Philippine Arts from the Region',
                'Media and Information Literacy',
                'General Mathematics',
                'Statistics and Probability',
                'Earth Science',
                'Physical Science',
                'Introduction to Philosophy of the Human Person',
                'Physical Education and Health',
                'Personal Development',
                'Understanding Culture, Society, and Politics'
            ],
            
            APPLIED_SUBJECTS: [
                'English for Academic and Professional Purposes',
                'Practical Research 1 (Qualitative)',
                'Practical Research 2 (Quantitative)',
                'Filipino sa Piling Larang',
                'Empowerment Technologies',
                'Entrepreneurship'
            ],
            
            STRANDS: {
                STEM: [
                    'Pre-Calculus',
                    'Basic Calculus',
                    'General Biology 1',
                    'General Biology 2',
                    'General Chemistry 1',
                    'General Chemistry 2',
                    'General Physics 1',
                    'General Physics 2',
                    'Research in Science, Technology, Engineering, and Mathematics',
                    'Capstone Project'
                ],
                
                ABM: [
                    'Applied Economics',
                    'Business Ethics and Social Responsibility',
                    'Fundamentals of Accounting and Business Management 1',
                    'Fundamentals of Accounting and Business Management 2',
                    'Business Mathematics',
                    'Business Finance',
                    'Organization and Business Management',
                    'Principles of Marketing',
                    'Work Immersion/Research/Career Advocacy/Culminating Activity'
                ],
                
                HUMSS: [
                    'Creative Writing (Fiction)',
                    'Creative Writing (Non-Fiction)',
                    'Introduction to World Religions and Belief Systems',
                    'Trends, Networks, and Critical Thinking in the 21st Century Culture',
                    'Philippine Politics and Governance',
                    'Community Engagement, Solidarity, and Citizenship',
                    'Discipline and Ideas in the Social Sciences',
                    'Discipline and Ideas in the Applied Social Sciences',
                    'Work Immersion/Research Project/Culminating Activity'
                ],

                GAS: [
                    'Humanities',
                    'Social Sciences',
                    'Applied Economics',
                    'Organization and Management',
                    'Disaster Readiness and Risk Reduction',
                    'Electives from any Track/Strand'
                ],

                TVL_ICT: [
                    'Programming 1',
                    'Programming 2',
                    'Animation',
                    'Computer Servicing',
                    'ICT Specialized Subjects'
                ],
                TVL_HE: [
                    'Cookery',
                    'Bread and Pastry Production',
                    'Housekeeping',
                    'Front Office Services',
                    'HE Specialized Subjects'
                ]
            }
        }
    },

    // Initialize with minimal data
    async init() {
        try {
            console.log('EducareTrack System Initializing...');
            
            let savedUser = localStorage.getItem('educareTrack_user');
            if (!savedUser) {
                const sessionUser = sessionStorage.getItem('educareTrack_user');
                if (sessionUser) {
                    localStorage.setItem('educareTrack_user', sessionUser);
                    savedUser = sessionUser;
                }
            }
            if (savedUser) {
                this.currentUser = JSON.parse(savedUser);
                this.currentUserRole = this.currentUser.role;
                console.log(`User session restored: ${this.currentUser.name}`);
            }

            // Auto-login via URL params if storage is unavailable
            if (!this.currentUser) {
                try {
                    const params = new URLSearchParams(window.location.search);
                    const uid = params.get('uid');
                    const role = params.get('role');
                    if (uid && role) {
                        await this.login(uid, role);
                    }
                } catch (_) {}
            }

            this.loadWeekendPolicy();

            // Initialize notification permissions
            if (this.config.enableNotificationPermissionPrompt) { await this.initializeNotificationPermissions(); }

            // Initialize only essential real-time listeners
            this.initEssentialListeners();

            this.registerPWA();

            this.initNotificationBox();

            this.loadSubcores();

            console.log('EducareTrack System Ready');
            return true;
        } catch (error) {
            console.error('System initialization failed:', error);
            return false;
        }
    },

    registerPWA() {
        try {
            if (!/^https?:$/.test(location.protocol)) return;
            const m = document.querySelector('link[rel="manifest"]');
            if (!m) {
                const link = document.createElement('link');
                link.rel = 'manifest';
                link.href = '/manifest.webmanifest';
                document.head.appendChild(link);
            }
            const t = document.querySelector('meta[name="theme-color"]');
            if (!t) {
                const meta = document.createElement('meta');
                meta.name = 'theme-color';
                meta.content = '#3b82f6';
                document.head.appendChild(meta);
            }
            if ('serviceWorker' in navigator) {
                const url = '/sw.js';
                navigator.serviceWorker.register(url).then((reg) => {
                    if (reg.update) reg.update();
                }).catch(() => {});
            }
            window.addEventListener('beforeinstallprompt', (e) => {
                e.preventDefault();
                this.deferredInstallPrompt = e;
                if (window.dispatchEvent) {
                    window.dispatchEvent(new CustomEvent('educareTrack:installAvailable'));
                }
            });
        } catch (_) {}
    },

    initNotificationBox() {
        if (this.notificationBoxInitialized) return;
        window.addEventListener('educareTrack:openNotifications', () => {
            const role = this.currentUserRole || (this.currentUser && this.currentUser.role);
            let url = 'notifications.html';
            if (role === 'teacher') url = 'teacher/teacher-notifications.html';
            else if (role === 'parent') url = 'parent/parent-notifications.html';
            else if (role === 'admin') url = 'admin/admin-notifications.html';
            window.location.href = url;
        });
        window.addEventListener('educareTrack:newNotifications', () => { this.updateNotificationBadge(); });
        this.notificationBoxInitialized = true;
    },

    loadSubcores() {
        try {
            const scripts = Array.from(document.getElementsByTagName('script'));
            const coreScript = scripts.find(sc => typeof sc.src === 'string' && sc.src.endsWith('core.js'));
            const base = coreScript ? coreScript.src.substring(0, coreScript.src.lastIndexOf('/') + 1) : '';
            const s = document.createElement('script');
            s.src = base + 'subcores/router.js';
            s.defer = true;
            document.head.appendChild(s);
        } catch (_) {}
    },

    appendToNotificationBox(notification) {
        this.updateNotificationBadge();
    },

    promptInstall() {
        const p = this.deferredInstallPrompt;
        if (p) {
            p.prompt();
            p.userChoice.finally(() => { this.deferredInstallPrompt = null; });
        }
    },

    // Only initialize essential real-time listeners
    initEssentialListeners() {
        // Only initialize if supabaseClient is available
        if (!window.supabaseClient) {
            console.warn('Supabase client not available, skipping real-time listeners');
            return;
        }

        if (!this.currentUser) return;

        // Notification listener
        if (this.notificationsListener) {
            this.notificationsListener();
        }

        // Only notifications for now - other data loaded on demand
        const subscription = window.supabaseClient
            .channel('public:notifications')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, payload => {
                const newNotification = payload.new;
                if (newNotification.target_users && newNotification.target_users.includes(this.currentUser.id)) {
                    // Check if active
                    if (newNotification.is_active) {
                        this.handleNewNotifications([{ id: newNotification.id, ...newNotification }]);
                    }
                }
            })
            .subscribe();
            
        this.notificationsListener = () => {
            window.supabaseClient.removeChannel(subscription);
        };
    },

    // ==================== CURRICULUM METHODS ====================

    // Get subjects for a specific grade level and strand
    getSubjectsForLevel(level, strand = null, grade = null) {
        try {
            if (level === this.STUDENT_LEVELS.KINDERGARTEN) {
                return this.CURRICULUM_SUBJECTS.KINDERGARTEN;
            }
            
            if (level === this.STUDENT_LEVELS.ELEMENTARY) {
                let subjects = [...this.CURRICULUM_SUBJECTS.ELEMENTARY];
                
                // Adjust subjects based on grade level for Elementary
                if (grade) {
                    const gradeNum = parseInt(grade.replace('Grade ', ''));
                    if (gradeNum >= 1 && gradeNum <= 3) {
                        subjects = subjects.filter(subject => !subject.includes('(Grades 4-6)'));
                    } else if (gradeNum >= 4 && gradeNum <= 6) {
                        subjects = subjects.filter(subject => !subject.includes('(Grades 1-3)'));
                    }
                }
                
                return subjects;
            }
            
            if (level === this.STUDENT_LEVELS.Junior_High_School) {
                return this.CURRICULUM_SUBJECTS.Junior_High_School;
            }
            
            if (level === this.STUDENT_LEVELS.Senior_High_School && strand) {
                const strandKey = strand.toUpperCase();
                const strandSubjects = this.CURRICULUM_SUBJECTS.Senior_High_School.STRANDS[strandKey] || [];
                return [
                    ...this.CURRICULUM_SUBJECTS.Senior_High_School.CORE_SUBJECTS,
                    ...this.CURRICULUM_SUBJECTS.Senior_High_School.APPLIED_SUBJECTS,
                    ...strandSubjects
                ];
            }
            
            return [];
        } catch (error) {
            console.error('Error getting subjects for level:', error);
            return [];
        }
    },

    // Get all strands for Senior High
    getSeniorHighStrands() {
        return Object.values(this.SENIOR_HIGH_STRANDS);
    },

    // Get grade levels for a specific student level
    getGradeLevels(studentLevel) {
        const gradeMap = {
            [this.STUDENT_LEVELS.KINDERGARTEN]: [
                this.GRADE_LEVELS.KINDERGARTEN
            ],
            [this.STUDENT_LEVELS.ELEMENTARY]: [
                this.GRADE_LEVELS.GRADE_1, 
                this.GRADE_LEVELS.GRADE_2, 
                this.GRADE_LEVELS.GRADE_3, 
                this.GRADE_LEVELS.GRADE_4,
                this.GRADE_LEVELS.GRADE_5, 
                this.GRADE_LEVELS.GRADE_6
            ],
            [this.STUDENT_LEVELS.Junior_High_School]: [
                this.GRADE_LEVELS.GRADE_7, 
                this.GRADE_LEVELS.GRADE_8,
                this.GRADE_LEVELS.GRADE_9, 
                this.GRADE_LEVELS.GRADE_10
            ],
            [this.STUDENT_LEVELS.Senior_High_School]: [
                this.GRADE_LEVELS.GRADE_11, 
                this.GRADE_LEVELS.GRADE_12
            ]
        };
        
        return gradeMap[studentLevel] || [];
    },

    // Get complete curriculum structure
    getCurriculumStructure() {
        return {
            levels: this.STUDENT_LEVELS,
            strands: this.SENIOR_HIGH_STRANDS,
            grades: this.GRADE_LEVELS,
            subjects: this.CURRICULUM_SUBJECTS
        };
    },

    // Validate student data against curriculum
    validateStudentData(studentData) {
        const errors = [];

        // Check required fields
        if (!studentData.name) errors.push('Student name is required');
        if (!studentData.level) errors.push('Student level is required');
        if (!studentData.grade) errors.push('Grade level is required');

        // Validate level and grade combination
        const validGrades = this.getGradeLevels(studentData.level);
        if (!validGrades.includes(studentData.grade)) {
            errors.push(`Invalid grade ${studentData.grade} for level ${studentData.level}`);
        }

        // Validate strand for Senior High
        if (studentData.level === this.STUDENT_LEVELS.Senior_High_School && !studentData.strand) {
            errors.push('Strand is required for Senior High students');
        }

        // Validate LRN format (if provided)
        if (studentData.lrn && !this.isValidLRN(studentData.lrn)) {
            errors.push('Invalid LRN format');
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    },

    // Validate LRN format (12 digits)
    isValidLRN(lrn) {
        return /^\d{12}$/.test(lrn);
    },

    // Get subject teachers for a class
    async getSubjectTeachers(classId, subject) {
        try {
            // Updated to use profiles and teachers tables
            // Note: New schema links teachers to classes via adviser_id (homeroom) only
            // or implicitly via assigned_subjects. We fetch teachers who have this subject.
            const { data: teachers, error } = await window.supabaseClient
                .from('teachers')
                .select('id, assigned_subjects')
                .contains('assigned_subjects', [subject]);
            
            if (error || !teachers) return [];

            const teacherIds = teachers.map(t => t.id);
            if (teacherIds.length === 0) return [];

            const { data: profiles, error: profError } = await window.supabaseClient
                .from('profiles')
                .select('id, full_name, email, phone, role, is_active')
                .in('id', teacherIds)
                .eq('is_active', true);
            
            if (profError || !profiles) return [];

            return profiles.map(p => ({
                id: p.id,
                name: p.full_name, // Map for legacy compatibility
                ...p,
                assigned_subjects: [subject] // inferred
            }));
        } catch (error) {
            console.error('Error getting subject teachers:', error);
            return [];
        }
    },

    // ==================== USER MANAGEMENT ====================

    // Check for existing session
    async checkSession() {
        try {
            const stored = localStorage.getItem('educareTrack_user') || sessionStorage.getItem('educareTrack_user');
            if (!stored) return null;
            
            const userData = JSON.parse(stored);
            if (!userData || !userData.id) return null;
            
            // Verify with server
            const user = await this.getUserById(userData.id);
            if (!user || !user.is_active) {
                this.logout();
                return null;
            }
            
            this.currentUser = user;
            this.currentUserRole = user.role;
            this.initEssentialListeners();
            
            return this.currentUser;
        } catch (error) {
            console.error('Session check failed:', error);
            return null;
        }
    },

    async login(userId, role = null) {
        try {
            // Updated to use getUserById for full profile
            const user = await this.getUserById(userId);
            
            if (!user) {
                throw new Error('User not found');
            }
            
            if (role && user.role !== role) {
                throw new Error(`User is not a ${role}`);
            }
            
            this.currentUser = user;
            this.currentUserRole = user.role;

            localStorage.setItem('educareTrack_user', JSON.stringify(this.currentUser));
            sessionStorage.setItem('educareTrack_user', JSON.stringify(this.currentUser));
            
            // Initialize notification permissions and listeners for new user
            if (this.config.enableNotificationPermissionPrompt) { await this.initializeNotificationPermissions(); }
            this.initEssentialListeners();

            console.log(`User logged in: ${this.currentUser.name || this.currentUser.full_name || this.currentUser.id}`);
            return this.currentUser;
        } catch (error) {
            console.error('Login failed:', error);
            throw error;
        }
    },

    logout() {
        this.currentUser = null;
        this.currentUserRole = null;
        localStorage.removeItem('educareTrack_user');
        this.clearCache();
        
        // Unsubscribe listeners
        if (this.notificationsListener) {
            this.notificationsListener();
        }
        
        // Reset page title
        document.title = `${this.config.schoolName} - EducareTrack`;
        
        console.log('User logged out');
    },

    // ==================== DASHBOARD STATS ====================

    // Get dashboard statistics
    async getDashboardStats() {
        try {
            // Ensure calendar data is loaded for accurate calculations
            await this.fetchCalendarData();

            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 30);
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);

            // Use Promise.all for parallel queries
            const [studentsCount, teachersCount, parentsCount, classesCount, todayCount, attendanceSummary] = await Promise.all([
                this.getCollectionCount('students'),
                this.getCollectionCount('profiles', [['role', '==', 'teacher'], ['is_active', '==', true]]),
                this.getCollectionCount('profiles', [['role', '==', 'parent'], ['is_active', '==', true]]),
                this.getCollectionCount('classes'),
                this.getTodayAttendanceCount(),
                this.getAttendanceSummary(startDate, endDate)
            ]);

            // Calculate accurate expected attendance based on level-specific school days
            let expectedAttendance = 0;
            
            // Get student counts by level
            const { data: students } = await window.supabaseClient
                .from('students')
                .select('level')
                .eq('is_active', true);
            
            const levelCounts = (students || []).reduce((acc, s) => {
                if (s.level) {
                    acc[s.level] = (acc[s.level] || 0) + 1;
                }
                return acc;
            }, {});

            // Iterate through last 30 days
            const curDate = new Date(startDate);
            while (curDate <= endDate) {
                // For each level, check if it was a school day
                Object.keys(levelCounts).forEach(level => {
                    if (this.isSchoolDay(curDate, level)) {
                        expectedAttendance += levelCounts[level];
                    }
                });
                curDate.setDate(curDate.getDate() + 1);
            }

            // Fallback if expectedAttendance is 0 (to avoid division by zero)
            // This happens if no students or no school days in range
            const attendanceRate = expectedAttendance > 0
                ? Math.round((attendanceSummary.totalPresent / expectedAttendance) * 100)
                : 0;

            const stats = {
                totalStudents: studentsCount,
                totalTeachers: teachersCount,
                totalParents: parentsCount,
                totalClasses: classesCount,
                presentToday: todayCount,
                attendanceRate: attendanceRate
            };

            // Cache the stats
            dataCache.stats = stats;
            dataCache.lastUpdated = Date.now();

            return stats;
        } catch (error) {
            console.error('Error getting dashboard stats:', error);
            return {
                totalStudents: 0,
                totalTeachers: 0,
                totalParents: 0,
                totalClasses: 0,
                presentToday: 0,
                attendanceRate: 0
            };
        }
    },

    // Get system stats (alias for getDashboardStats for backward compatibility)
    async getSystemStats() {
        return this.getDashboardStats();
    },

    // Optimized: Get count without loading all documents
    async getCollectionCount(collectionName, conditions = []) {
        try {
            let builder = window.supabaseClient.from(collectionName).select('id', { count: 'exact', head: true });
            const apply = (field, op, val) => {
                if (op === '==' || op === 'eq') builder = builder.eq(field, val);
                else if (op === '>') builder = builder.gt(field, val);
                else if (op === '>=') builder = builder.gte(field, val);
                else if (op === '<') builder = builder.lt(field, val);
                else if (op === '<=') builder = builder.lte(field, val);
                else if (op === '!=') builder = builder.neq(field, val);
                else if (op === 'in') builder = builder.in(field, val);
            };
            const conds = Array.isArray(conditions) ? conditions : [];
            const effectiveConds = collectionName === 'students' ? conds.filter(c => c[0] !== 'is_active') : conds;
            effectiveConds.forEach(c => apply(c[0], c[1], c[2]));
            const { count, error } = await builder;
            if (error) return 0;
            return count || 0;
        } catch (error) {
            console.error(`Error counting ${collectionName}:`, error);
            return 0;
        }
    },

    // Fast: Get today's attendance count
    async getTodayAttendanceCount() {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const { count, error } = await window.supabaseClient
                .from('attendance')
                .select('id', { count: 'exact', head: true })
                .gte('timestamp', today.toISOString())
                .eq('entry_type', 'entry');
            if (error) return 0;
            return count || 0;
        } catch (error) {
            console.error('Error getting today attendance count:', error);
            return 0;
        }
    },

    async getAttendanceSummary(startDate, endDate) {
        try {
            const start = new Date(startDate);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            const { data, error } = await window.supabaseClient
                .from('attendance')
                .select('student_id,status,timestamp')
                .gte('timestamp', start.toISOString())
                .lte('timestamp', end.toISOString())
                .eq('entry_type', 'entry');

            if (error) return { uniquePresent: 0, totalPresent: 0, days: 0 };
            
            const presentIds = new Set();
            let totalPresent = 0;
            const uniqueDays = new Set();

            (data || []).forEach(row => {
                if (row.timestamp) {
                    const dateStr = new Date(row.timestamp).toDateString();
                    uniqueDays.add(dateStr);
                }
                if (row.status === 'present' || row.status === 'late') {
                    presentIds.add(row.student_id || row.studentId);
                    totalPresent++;
                }
            });
            return { uniquePresent: presentIds.size, totalPresent, days: uniqueDays.size };
        } catch (error) {
            console.error('Error getting attendance summary:', error);
            return { uniquePresent: 0, totalPresent: 0, days: 0 };
        }
    },

    // ==================== ADMIN FUNCTIONS ====================

    // Fast enrollment with curriculum support
    async enrollStudentWithParent(parentData, studentData, studentPhoto = null) {
        try {
            if (!this.currentUser || this.currentUser.role !== 'admin') {
                throw new Error('Only admins can enroll students');
            }

            // Validate student data against curriculum
            const validation = this.validateStudentData(studentData);
            if (!validation.isValid) {
                throw new Error(`Invalid student data: ${validation.errors.join(', ')}`);
            }

            // Generate IDs
            const studentId = this.generateStudentId(studentData.lrn);

            // Upload photo if provided (non-blocking) - only if storage is available
            let photoUrl = '';
            if (studentPhoto && this.storage) {
                try {
                    photoUrl = await this.uploadStudentPhoto(studentPhoto, studentId);
                } catch (photoError) {
                    console.warn('Photo upload failed, continuing without photo:', photoError);
                }
            } else if (studentPhoto && !this.storage) {
                console.warn('Photo upload skipped: Supabase Storage not available');
            }

            // Supabase implementation using sequential writes (manual transaction)
            
            // 1. Create Parent (Profile + Parent Record)
            const parentId = parentData.id || crypto.randomUUID();
            
            const profileDoc = {
                id: parentId,
                role: 'parent',
                full_name: parentData.name,
                phone: parentData.phone,
                photo_url: null,
                is_active: true,
                created_at: new Date().toISOString()
            };

            const parentRecordDoc = {
                id: parentId,
                address: parentData.address,
                occupation: parentData.occupation || '',
                created_at: new Date().toISOString()
            };

            // Insert into profiles first
            const { error: profileError } = await window.supabaseClient
                .from('profiles')
                .insert([profileDoc]);

            if (profileError) throw new Error('Failed to create parent profile: ' + profileError.message);

            // Insert into parents
            const { error: parentError } = await window.supabaseClient
                .from('parents')
                .insert([parentRecordDoc]);

            if (parentError) {
                // Rollback profile
                await window.supabaseClient.from('profiles').delete().eq('id', parentId);
                throw new Error('Failed to create parent record: ' + parentError.message);
            }

            // 2. Resolve/Create Class
            let resolvedClassId = studentData.classId || '';
            if (!resolvedClassId) {
                try {
                    let className = studentData.grade;
                    if (studentData.level !== this.STUDENT_LEVELS.KINDERGARTEN && studentData.strand) {
                        className = `${studentData.grade} ${studentData.strand}`;
                    }
                    
                    // Check if class exists
                    // Note: Supabase classes table has 'grade' and 'strand', not 'name'
                    // We try to match by grade and strand
                    let query = window.supabaseClient
                        .from('classes')
                        .select('id')
                        .eq('grade', studentData.grade)
                        .limit(1);

                    if (studentData.strand) {
                        query = query.eq('strand', studentData.strand);
                    } else {
                        query = query.is('strand', null);
                    }

                    const { data: existingClasses } = await query;
                        
                    if (existingClasses && existingClasses.length > 0) {
                        resolvedClassId = existingClasses[0].id;
                    }
                } catch (e) {
                    console.error('Error resolving class:', e);
                    resolvedClassId = '';
                }
            }

            // 3. Create Student
            const studentDoc = {
                id: studentId,
                lrn: studentData.lrn,
                full_name: studentData.name,
                // grade: studentData.grade, // Removed: Not in Supabase schema
                strand: studentData.strand || null,
                class_id: resolvedClassId,
                address: parentData.address,
                current_status: 'enrolled',
                photo_url: photoUrl,
                created_at: new Date().toISOString()
            };

            const { error: studentError } = await window.supabaseClient
                .from('students')
                .insert([studentDoc]);

            if (studentError) {
                // Rollback parent
                await window.supabaseClient.from('parents').delete().eq('id', parentId);
                await window.supabaseClient.from('profiles').delete().eq('id', parentId);
                throw new Error('Failed to create student: ' + studentError.message);
            }

            // 4. Create Parent-Student Link
            const linkDoc = {
                parent_id: parentId,
                student_id: studentId,
                relationship: parentData.relationship || 'Parent'
            };
            
            const { error: linkError } = await window.supabaseClient
                .from('parent_students')
                .insert([linkDoc]);

            if (linkError) {
                 // Rollback student
                 await window.supabaseClient.from('students').delete().eq('id', studentId);
                 await window.supabaseClient.from('parents').delete().eq('id', parentId);
                 await window.supabaseClient.from('profiles').delete().eq('id', parentId);
                 throw new Error('Failed to link parent and student: ' + linkError.message);
            }

            this.clearCache();
            console.log(`Student enrolled (Supabase): ${studentData.name}`);
            return { parentId, studentId };
        } catch (error) {
            console.error('Error enrolling student:', error);
            throw error;
        }
    },

    // Enroll student for existing parent
    async enrollStudentOnly(studentData, parentId, studentPhoto = null) {
        try {
            if (!this.currentUser || this.currentUser.role !== 'admin') {
                throw new Error('Only admins can enroll students');
            }

            // Validate student data
            const validation = this.validateStudentData(studentData);
            if (!validation.isValid) {
                throw new Error(`Invalid student data: ${validation.errors.join(', ')}`);
            }

            // Generate Student ID
            const studentId = this.generateStudentId(studentData.lrn);

            // Upload photo if provided
            let photoUrl = '';
            if (studentPhoto && this.storage) {
                try {
                    photoUrl = await this.uploadStudentPhoto(studentPhoto, studentId);
                } catch (photoError) {
                    console.warn('Photo upload failed, continuing without photo:', photoError);
                }
            }

            // 1. Resolve/Create Class
            let resolvedClassId = studentData.classId || '';
            if (!resolvedClassId) {
                try {
                    // Note: Supabase classes table has 'grade' and 'strand', not 'name'
                    // We try to match by grade and strand
                    let query = window.supabaseClient
                        .from('classes')
                        .select('id')
                        .eq('grade', studentData.grade)
                        .limit(1);

                    if (studentData.strand) {
                        query = query.eq('strand', studentData.strand);
                    } else {
                        query = query.is('strand', null);
                    }

                    const { data: existingClasses } = await query;
                    
                    if (existingClasses && existingClasses.length > 0) {
                        resolvedClassId = existingClasses[0].id;
                    }
                } catch (e) {
                    console.error('Error resolving class:', e);
                    resolvedClassId = '';
                }
            }

            // 2. Create Student
            const studentDoc = {
                id: studentId,
                lrn: studentData.lrn,
                full_name: studentData.name,
                // grade: studentData.grade, // Removed: Not in Supabase schema
                strand: studentData.strand || null,
                class_id: resolvedClassId,
                address: studentData.address,
                current_status: 'enrolled',
                photo_url: photoUrl,
                created_at: new Date().toISOString()
            };

            // Add strand/subjects logic if needed, but schema doesn't have subjects in students table
            // skipping subjects array as it's not in new schema for students table

            const { error: studentError } = await window.supabaseClient
                .from('students')
                .insert([studentDoc]);

            if (studentError) throw new Error('Failed to create student: ' + studentError.message);

            // 3. Link Parent and Student
            const linkDoc = {
                parent_id: parentId,
                student_id: studentId,
                relationship: 'Parent'
            };

            const { error: linkError } = await window.supabaseClient
                .from('parent_students')
                .insert([linkDoc]);

            if (linkError) {
                // Rollback student
                await window.supabaseClient.from('students').delete().eq('id', studentId);
                throw new Error('Failed to link parent and student: ' + linkError.message);
            }

            this.clearCache();
            return studentId;
        } catch (error) {
            console.error('Error enrolling student only:', error);
            throw error;
        }
    },

    // Generate unique user ID based on role
    generateUserId(role, phoneNumber = '') {
        // Teacher ID format: TCH-YYYY-Last4Phone-Random4
        if (role === 'teacher') {
            const prefix = 'TCH';
            const year = new Date().getFullYear();
            const phoneDigits = phoneNumber ? phoneNumber.replace(/\D/g, '').slice(-4) : '0000';
            const random = Math.floor(1000 + Math.random() * 9000); // 4 random digits
            return `${prefix}-${year}-${phoneDigits}-${random}`;
        }

        // Default format for other roles
        const prefix = role.substring(0, 3).toUpperCase();
        const timestamp = Date.now().toString().slice(-6);
        const random = Math.random().toString(36).substring(2, 5).toUpperCase();
        return `${prefix}-${timestamp}${random}`;
    },

    // Generate student ID: EDU-YYYY-last4LRN-studentNumber
    generateStudentId(lrn) {
        const year = new Date().getFullYear();
        const last4LRN = lrn ? lrn.slice(-4) : '0000';
        const studentNumber = Math.floor(1000 + Math.random() * 9000).toString();
        return `EDU-${year}-${last4LRN}-${studentNumber}`;
    },

    // Upload student photo to Supabase Storage
    async uploadStudentPhoto(photoFile, studentId) {
        try {
            const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
            if (!validTypes.includes(photoFile.type)) {
                throw new Error('Invalid file type');
            }

            if (photoFile.size > 5 * 1024 * 1024) {
                throw new Error('File size too large');
            }

            const fileExtension = photoFile.name.split('.').pop();
            const fileName = `${studentId}/photo.${fileExtension}`;
            
            // Upload to Supabase Storage bucket 'student-photos'
            const { data, error } = await window.supabaseClient
                .storage
                .from('student-photos')
                .upload(fileName, photoFile, {
                    cacheControl: '3600',
                    upsert: true
                });

            if (error) throw error;

            // Get public URL
            const { data: { publicUrl } } = window.supabaseClient
                .storage
                .from('student-photos')
                .getPublicUrl(fileName);
                
            return publicUrl;
        } catch (error) {
            console.error('Error uploading student photo:', error);
            throw error;
        }
    },

    // Admin: Create class with curriculum support
    async createClass(classData) {
        try {
            if (!this.currentUser || this.currentUser.role !== 'admin') {
                throw new Error('Only admins can create classes');
            }

            const newClass = {
                ...classData,
                subjects: this.getSubjectsForLevel(classData.level, classData.strand, classData.grade),
                is_active: true,
                created_at: new Date().toISOString()
                // created_by: this.currentUser.id
            };

            const { data, error } = await window.supabaseClient
                .from('classes')
                .insert([newClass])
                .select();
            
            if (error) throw error;
            this.clearCache();
            console.log(`Class created (Supabase): ${classData.name}`);
            return data[0].id;
        } catch (error) {
            console.error('Error creating class:', error);
            throw error;
        }
    },

    // ==================== DATA RETRIEVAL METHODS ====================

    // LAZY LOADING: Only load data when needed
    async getUsers(forceRefresh = false) {
        if (dataCache.users && !forceRefresh && (Date.now() - dataCache.lastUpdated < CACHE_DURATION)) {
            return dataCache.users;
        }

        try {
            const { data, error } = await window.supabaseClient
                .from('profiles')
                .select(`
                    id, full_name, role, phone, is_active, photo_url, username, password, email,
                    teachers ( employee_no, is_homeroom, assigned_subjects, classes ( id, grade, strand ) ),
                    parents ( address, occupation ),
                    guards ( shift, assigned_gate ),
                    clinic_staff ( license_no, position ),
                    admin_staff ( position, permissions )
                `)
                .eq('is_active', true)
                .limit(100);
            
            if (error) throw error;
            
            dataCache.users = (data || []).map(u => {
                // Helper to extract single object from join result (which might be array or object)
                const getRoleData = (data) => Array.isArray(data) ? data[0] : data;
                
                let roleData = {};
                if (u.role === 'teacher') roleData = getRoleData(u.teachers) || {};
                else if (u.role === 'parent') roleData = getRoleData(u.parents) || {};
                else if (u.role === 'guard') roleData = getRoleData(u.guards) || {};
                else if (u.role === 'clinic') roleData = getRoleData(u.clinic_staff) || {};
                else if (u.role === 'admin') roleData = getRoleData(u.admin_staff) || {};

                return {
                    ...u,
                    ...roleData, // Flatten role specific fields
                    name: u.full_name, // Map for backward compatibility
                    fullName: u.full_name,
                    // Map role specific fields to camelCase if needed by UI
                    assignedSubjects: roleData.assigned_subjects || [],
                    isHomeroom: roleData.is_homeroom,
                    employeeId: roleData.employee_no,
                    username: u.username || roleData.employee_no || u.id, // Prioritize profile username
                    password: u.password,
                    // Common fields
                    assignedClasses: roleData.classes || [],
                    capabilities: [] // Not available in new schema
                };
            });
            dataCache.lastUpdated = Date.now();
            return dataCache.users;
        } catch (error) {
            console.error('Error getting users:', error.message || error, error.details || '', error.hint || '');
            return [];
        }
    },

    async getUserById(userId) {
        try {
            // Check cache first if available
            if (dataCache.users) {
                const cachedUser = dataCache.users.find(u => u.id === userId);
                // If found in cache, we might still want to fetch fresh details (especially children for parents)
                // But for basic editing, cache might be enough. Let's fetch fresh to be safe for editing.
            }

            const { data, error } = await window.supabaseClient
                .from('profiles')
                .select(`
                    id, full_name, role, phone, is_active, photo_url, username, password, email,
                    teachers ( employee_no, is_homeroom, assigned_subjects, classes ( id, grade, strand ) ),
                    parents ( address, occupation ),
                    guards ( shift, assigned_gate ),
                    clinic_staff ( license_no, position ),
                    admin_staff ( position, permissions )
                `)
                .eq('id', userId)
                .single();
            
            if (error) throw error;
            if (!data) return null;

            // Helper to extract single object from join result
            const getRoleData = (data) => Array.isArray(data) ? data[0] : data;
            
            let roleData = {};
            if (data.role === 'teacher') roleData = getRoleData(data.teachers) || {};
            else if (data.role === 'parent') roleData = getRoleData(data.parents) || {};
            else if (data.role === 'guard') roleData = getRoleData(data.guards) || {};
            else if (data.role === 'clinic') roleData = getRoleData(data.clinic_staff) || {};
            else if (data.role === 'admin') roleData = getRoleData(data.admin_staff) || {};

            // If it's a parent, fetch children
            let children = [];
            if (data.role === 'parent') {
                children = await this.getStudentsByParent(userId);
            }

            return {
                ...data,
                ...roleData, // Flatten role specific fields
                name: data.full_name, // Map for backward compatibility
                fullName: data.full_name,
                // Map role specific fields to camelCase if needed by UI
                assignedSubjects: roleData.assigned_subjects || [],
                isHomeroom: roleData.is_homeroom,
                employeeId: roleData.employee_no,
                username: data.username || roleData.employee_no || data.id,
                password: data.password,
                // Common fields
                assignedClasses: roleData.classes || [],
                children: children,
                capabilities: [] // Not available in new schema
            };
        } catch (error) {
            console.error('Error getting user by ID:', error);
            return null;
        }
    },

    async getStudents(forceRefresh = false) {
        if (dataCache.students && !forceRefresh && (Date.now() - dataCache.lastUpdated < CACHE_DURATION)) {
            return dataCache.students;
        }

        try {
            // Fetch all students with pagination
            let allStudents = [];
            let from = 0;
            const batchSize = 1000;
            let more = true;

            while (more) {
                const { data, error } = await window.supabaseClient
                    .from('students')
                    .select('*')
                    .range(from, from + batchSize - 1);
                
                if (error) throw error;
                
                if (data && data.length > 0) {
                    allStudents = allStudents.concat(data);
                    if (data.length < batchSize) more = false;
                    else from += batchSize;
                } else {
                    more = false;
                }
            }

            const [{ data: relations, error: rErr }, { data: classes, error: cErr }] = await Promise.all([
                window.supabaseClient
                    .from('parent_students')
                    .select('student_id,parent_id'),
                window.supabaseClient
                    .from('classes')
                    .select('id,grade,strand')
            ]);

            if (rErr) throw rErr;
            if (cErr) throw cErr;

            const parentMap = new Map();
            (relations || []).forEach(r => {
                parentMap.set(r.student_id, r.parent_id);
            });
            
            const classMap = new Map();
            (classes || []).forEach(c => {
                classMap.set(c.id, c);
            });

            dataCache.students = (allStudents || []).map(s => {
                const classInfo = classMap.get(s.class_id);
                return {
                    ...s,
                    name: s.full_name, // Map for backward compatibility
                    fullName: s.full_name,
                    classId: s.class_id,
                    parentId: parentMap.get(s.id),
                    parent_id: parentMap.get(s.id), // For backward compatibility
                    emergencyContact: s.emergency_contact,
                    grade: classInfo ? classInfo.grade : (s.level || ''),
                    section: classInfo ? classInfo.section : '',
                    strand: s.strand || (classInfo ? classInfo.strand : '')
                };
            });
            dataCache.lastUpdated = Date.now();
            return dataCache.students;
        } catch (error) {
            console.error('Error getting students:', error);
            return [];
        }
    },

    async getClasses(forceRefresh = false) {
        if (dataCache.classes && !forceRefresh && (Date.now() - dataCache.lastUpdated < CACHE_DURATION)) {
            return dataCache.classes;
        }

        try {
            const { data, error } = await window.supabaseClient
                .from('classes')
                .select('*')
                .eq('is_active', true)
                .limit(50);
            if (error) throw error;
            dataCache.classes = (data || []).map(c => ({ ...c }));
            dataCache.lastUpdated = Date.now();
            return dataCache.classes;
        } catch (error) {
            console.error('Error getting classes:', error);
            return [];
        }
    },

    // Get students by level and strand
    async getStudentsByLevel(level, strand = null) {
        try {
            let query = window.supabaseClient
                .from('students')
                .select('*')
                .eq('level', level)
                .eq('is_active', true);
            
            if (strand) {
                query = query.eq('strand', strand);
            }
            
            const { data, error } = await query;
            if (error) throw error;
            
            // Fetch parent mappings
            const studentIds = (data || []).map(s => s.id);
            let parentMap = new Map();
            
            if (studentIds.length > 0) {
                const { data: relations } = await window.supabaseClient
                    .from('parent_students')
                    .select('student_id, parent_id')
                    .in('student_id', studentIds);
                    
                (relations || []).forEach(r => {
                    parentMap.set(r.student_id, r.parent_id);
                });
            }
            
            return (data || []).map(s => ({
                ...s,
                classId: s.class_id,
                parentId: parentMap.get(s.id),
                parent_id: parentMap.get(s.id),
                emergencyContact: s.emergency_contact,
                grade: s.level
            }));
        } catch (error) {
            console.error('Error getting students by level:', error);
            return [];
        }
    },

    // Get recent student enrollments
    async getRecentEnrollments(limit = 5) {
        try {
            const { data, error } = await window.supabaseClient
                .from('students')
                .select('*')
                .eq('is_active', true)
                .order('created_at', { ascending: false })
                .limit(limit);
            
            if (error) throw error;
            return (data || []).map(s => ({
                ...s,
                name: s.full_name,
                classId: s.class_id,
                grade: s.level
            }));
        } catch (error) {
            console.error('Error getting recent enrollments:', error);
            return [];
        }
    },

    // Fast: Get recent activity with limit
    async getRecentActivity(limit = 10) {
        try {
            const { data, error } = await window.supabaseClient
                .from('attendance')
                .select('id,student_id,class_id,entry_type,timestamp,time,session,status,remarks,recorded_by,recorded_by_name,manual_entry')
                .order('timestamp', { ascending: false })
                .limit(limit);
            if (error || !data) {
                return [];
            }
            const ids = Array.from(new Set(data.map(r => r.student_id).filter(Boolean)));
            let namesById = {};
            if (ids.length > 0) {
                const { data: students } = await window.supabaseClient
                    .from('students')
                    .select('id,full_name,class_id')
                    .in('id', ids);
                (students || []).forEach(s => {
                    namesById[s.id] = s.full_name;
                });
            }
            return data.map(row => ({
                id: row.id,
                ...row,
                studentName: namesById[row.student_id] || 'Unknown Student'
            }));
        } catch (error) {
            console.error('Error getting recent activity:', error);
            return [];
        }
    },

    // ==================== TEACHER-SPECIFIC METHODS ====================

    // Get students by class for teachers
    async getStudentsByClass(classId) {
        try {
            if (!classId) {
                console.warn('No classId provided to getStudentsByClass');
                return [];
            }
            const { data, error } = await window.supabaseClient
                .from('students')
                .select('id,full_name,lrn,class_id,parent_id,strand,current_status,created_at,level,grade')
                .eq('class_id', classId);
            if (error || !data) return [];
            return data.map(s => ({
                id: s.id,
                name: s.full_name,
                lrn: s.lrn,
                class_id: s.class_id,
                parent_id: s.parent_id,
                strand: s.strand,
                current_status: s.current_status,
                created_at: s.created_at,
                level: s.level,
                grade: s.grade
            }));
        } catch (error) {
            console.error('Error getting students by class:', error);
            return [];
        }
    },

    // ==================== PARENT-SPECIFIC METHODS ====================

    // Get students by parent ID
    async getStudentsByParent(parentId) {
        try {
            // 1. Get from parent_students table (junction)
            const { data: relations, error: relError } = await window.supabaseClient
                .from('parent_students')
                .select('student_id')
                .eq('parent_id', parentId);
            
            if (relError) throw relError;

            const studentIds = (relations || []).map(r => r.student_id);
            if (studentIds.length === 0) return [];

            // 2. Fetch student details
            const { data: students, error: studError } = await window.supabaseClient
                .from('students')
                .select('*')
                .in('id', studentIds);

            if (studError) throw studError;

            // 3. Fetch class information separately
            const classIds = (students || []).map(s => s.class_id).filter(Boolean);
            let classesMap = new Map();
            
            if (classIds.length > 0) {
                const { data: classes, error: classError } = await window.supabaseClient
                    .from('classes')
                    .select('*')
                    .in('id', classIds);
                
                if (!classError && classes) {
                    classesMap = new Map(classes.map(c => [c.id, c]));
                }
            }

            // 4. Fetch recent attendance for each student
            const attendanceMap = new Map();
            for (const studentId of studentIds) {
                const { data: attendance } = await window.supabaseClient
                    .from('attendance')
                    .select('*')
                    .eq('student_id', studentId)
                    .order('timestamp', { ascending: false })
                    .limit(1);
                
                if (attendance && attendance.length > 0) {
                    attendanceMap.set(studentId, attendance[0]);
                }
            }

            // 5. Combine all data
            return (students || []).map(s => {
                const classInfo = classesMap.get(s.class_id);
                const recentAttendance = attendanceMap.get(s.id);
                
                return {
                    id: s.id,
                    full_name: s.full_name,
                    lrn: s.lrn,
                    gender: s.gender,
                    birth_date: s.birth_date,
                    address: s.address,
                    class_id: s.class_id,
                    strand: s.strand || classInfo?.strand,
                    current_status: s.current_status || 'active',
                    photo_url: s.photo_url,
                    // Class information
                    grade: classInfo?.grade || 'N/A',
                    level: classInfo?.level || 'N/A',
                    classId: s.class_id,
                    // Attendance info
                    lastAttendance: recentAttendance?.timestamp || null,
                    // Backward compatibility
                    name: s.full_name,
                    currentStatus: s.current_status || 'active'
                };
            });
        } catch (error) {
            console.error('Error getting students by parent:', error);
            return [];
        }
    },

    // Get recent activity for parent (notifications and attendance for their children)
    async getRecentActivityForParent(parentId) {
        try {
            // Get parent's children first
            const children = await this.getStudentsByParent(parentId);
            if (children.length === 0) {
                return [];
            }

            const childIds = children.map(child => child.id);

            const [notificationsRes, attendanceRes] = await Promise.all([
                window.supabaseClient
                    .from('notifications')
                    .select('*')
                    .contains('target_users', [parentId])
                    .order('created_at', { ascending: false })
                    .limit(20),
                window.supabaseClient
                    .from('attendance')
                    .select('*')
                    .in('student_id', childIds)
                    .order('timestamp', { ascending: false })
                    .limit(20)
            ]);

            const notifications = (notificationsRes.data || []).map(n => ({
                type: 'notification',
                id: n.id,
                title: n.title || 'Notification',
                message: n.message || 'No message',
                timestamp: new Date(n.created_at),
                studentId: null, // Notifications don't have student_id in new schema
                isRead: n.read_by && n.read_by.includes(parentId)
            }));

            const attendance = (attendanceRes.data || []).map(a => ({
                type: 'attendance',
                id: a.id,
                status: a.status || 'unknown',
                timestamp: new Date(a.timestamp || a.created_at),
                studentId: a.student_id,
                entryType: a.session || 'AM',
                title: 'Attendance Record',
                message: `Marked as ${a.status || 'unknown'} for ${a.session || 'AM'} session`
            }));

            // Combine and sort
            const combined = [...notifications, ...attendance].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
            
            // Add student names
            const studentMap = new Map(children.map(c => [c.id, c.name || c.full_name]));
            
            return combined.map(item => ({
                ...item,
                studentName: studentMap.get(item.studentId) || 'Unknown Student'
            }));
        } catch (error) {
            console.error('Error getting recent activity for parent:', error);
            return [];
        }
    },

    // Get attendance records for a specific student
    async getAttendanceByStudent(studentId) {
        try {
            const { data, error } = await window.supabaseClient
                .from('attendance')
                .select('id,student_id,class_id,entry_type,timestamp,time,session,status,remarks,recorded_by,recorded_by_name,manual_entry')
                .eq('student_id', studentId)
                .order('timestamp', { ascending: false })
                .limit(50);
            if (error || !data) return [];
            const { data: s } = await window.supabaseClient
                .from('students')
                .select('id,full_name')
                .eq('id', studentId)
                .single();
            const name = s ? s.full_name : '';
            return data.map(r => ({
                id: r.id,
                ...r,
                studentId: r.student_id,
                classId: r.class_id,
                recordedBy: r.recorded_by,
                recordedByName: r.recorded_by_name,
                manualEntry: r.manual_entry,
                studentName: name
            }));
        } catch (error) {
            console.error('Error getting attendance by student:', error);
            return [];
        }
    },

    // Get clinic visits for a specific student
    async getClinicVisitsByStudent(studentId) {
        try {
            const { data, error } = await window.supabaseClient
                .from('clinic_visits')
                .select('id,student_id,student_name,class_id,reason,check_in,timestamp,notes,treated_by,outcome')
                .eq('student_id', studentId)
                .order('timestamp', { ascending: false })
                .limit(50);
            if (error || !data) return [];
            return data.map(r => ({
                id: r.id,
                ...r,
                studentId: r.student_id,
                studentName: r.student_name,
                classId: r.class_id,
                treatedBy: r.treated_by
            }));
        } catch (error) {
            console.error('Error getting clinic visits by student:', error);
            return [];
        }
    },

    // ==================== ENHANCED NOTIFICATION SYSTEM ====================

    // Notification System - ENHANCED VERSION
    async createNotification(notificationData) {
        try {
            const targetUsers = notificationData.target_users || notificationData.targetUsers || [];
            if (!targetUsers || targetUsers.length === 0) {
                throw new Error('Notification must have target users');
            }
            const createdAtValue = notificationData.created_at || notificationData.createdAt || new Date();
            const normalizedCreatedAt = createdAtValue instanceof Date ? createdAtValue.toISOString() : createdAtValue;
            
            // Only use fields that exist in NEW schema
            const row = {
                target_users: targetUsers,
                title: notificationData.title,
                message: notificationData.message,
                type: notificationData.type,
                created_at: normalizedCreatedAt,
                read_by: notificationData.read_by || notificationData.readBy || []
            };
            
            const { data, error } = await window.supabaseClient.from('notifications').insert(row).select('id').single();
            if (error) {
                throw error;
            }
            
            this.handleNewNotifications([{
                id: data.id,
                ...row,
                readBy: row.read_by,
                createdAt: row.created_at,
                targetUsers: row.target_users
            }]);
            
            return data.id;
        } catch (error) {
            console.error('Error creating notification:', error);
            throw error;
        }
    },

    async markNotificationAsRead(notificationId) {
        try {
            if (!this.currentUser) throw new Error('No user logged in');
            const { data, error } = await window.supabaseClient.from('notifications').select('id,read_by').eq('id', notificationId).single();
            if (error || !data) throw new Error('Notification not found');
            const existing = Array.isArray(data.read_by) ? data.read_by : [];
            const updated = Array.from(new Set([...existing, this.currentUser.id]));
            const { error: upErr } = await window.supabaseClient.from('notifications').update({ read_by: updated }).eq('id', notificationId);
            if (upErr) throw upErr;
            this.updateNotificationBadge();
            return true;
        } catch (error) {
            console.error('Error marking notification as read:', error);
            throw error;
        }
    },

    // Mark multiple notifications as read
    async markMultipleNotificationsAsRead(notificationIds) {
        try {
            if (!this.currentUser) throw new Error('No user logged in');
            if (!notificationIds || notificationIds.length === 0) return;
            for (const id of notificationIds) {
                await this.markNotificationAsRead(id);
            }
            this.updateNotificationBadge();
            return true;
        } catch (error) {
            console.error('Error marking multiple notifications as read:', error);
            throw error;
        }
    },

    // Mark all notifications as read for user
    async markAllNotificationsAsRead() {
        try {
            if (!this.currentUser) throw new Error('No user logged in');

            const unreadNotifications = await this.getNotificationsForUser(this.currentUser.id, true);
            
            if (unreadNotifications.length === 0) {
                console.log('No unread notifications to mark');
                return true;
            }

            const notificationIds = unreadNotifications.map(notification => notification.id);
            return await this.markMultipleNotificationsAsRead(notificationIds);
        } catch (error) {
            console.error('Error marking all notifications as read:', error);
            throw error;
        }
    },

    // Get unread notification count - OPTIMIZED VERSION
    async fetchNotificationsSnake(userId, type, limit) {
        let query = window.supabaseClient
            .from('notifications')
            .select('id,target_users,title,message,type,read_by,created_at')
            .contains('target_users', [userId]);
        if (type) query = query.eq('type', type);
        if (limit) query = query.limit(limit);
        return query;
    },

    async fetchNotificationsCamel(userId, type, limit) {
        let query = window.supabaseClient
            .from('notifications')
            .select('id,target_users,title,message,type,read_by,created_at')
            .contains('target_users', [userId]);
        if (type) query = query.eq('type', type);
        if (limit) query = query.limit(limit);
        return query;
    },

    async getUnreadNotificationCount(userId) {
        try {
            if (dataCache.notifications && dataCache.notifications.userId === userId) {
                const unreadCount = dataCache.notifications.data.filter(n => !n.read_by || !n.read_by.includes(userId)).length;
                return unreadCount;
            }
            let { data, error } = await this.fetchNotificationsSnake(userId);
            if (error || !data) {
                const fallback = await this.fetchNotificationsCamel(userId);
                data = fallback.data || [];
                error = fallback.error;
            }
            if (error || !data) return 0;

            const mappedData = data.map(n => ({
                ...n,
                read_by: n.read_by || n.readBy,
                readBy: n.read_by || n.readBy,
                created_at: n.created_at || n.createdAt,
                createdAt: n.created_at || n.createdAt,
                is_urgent: n.is_urgent ?? n.isUrgent,
                isUrgent: n.is_urgent ?? n.isUrgent,
                student_id: n.student_id || n.studentId,
                studentId: n.student_id || n.studentId,
                student_name: n.student_name || n.studentName,
                studentName: n.student_name || n.studentName,
                related_record: n.related_record || n.relatedRecord,
                relatedRecord: n.related_record || n.relatedRecord
            }));
            
            dataCache.notifications = { userId, data: mappedData, lastUpdated: Date.now() };
            const unreadCount = mappedData.filter(n => !n.readBy || !n.readBy.includes(userId)).length;
            return unreadCount;
        } catch (error) {
            console.error('Error getting unread notification count:', error);
            return 0;
        }
    },

    // Get notifications for user - ENHANCED VERSION
    async getNotificationsForUser(userId, unreadOnly = false, limit = 20) {
        try {
            let { data, error } = await this.fetchNotificationsSnake(userId, null, limit);
            if (error || !data) {
                const fallback = await this.fetchNotificationsCamel(userId, null, limit);
                data = fallback.data || [];
                error = fallback.error;
            }
            if (error || !data) throw error || new Error('Failed to load notifications');
            let notifications = data.map(n => {
                const createdAt = n.created_at;
                return {
                    id: n.id,
                    targetUsers: n.target_users,
                    title: n.title,
                    message: n.message,
                    type: n.type,
                    readBy: n.read_by,
                    createdAt: createdAt,
                    formattedDate: this.formatDate(createdAt),
                    formattedTime: this.formatTime(createdAt)
                };
            });
            if (unreadOnly) {
                notifications = notifications.filter(n => !n.readBy || !n.readBy.includes(userId));
            }
            return notifications;
        } catch (error) {
            console.error('Error getting notifications for user:', error);
            throw error;
        }
    },

    // Get notifications by type
    async getNotificationsByType(userId, type, limit = 20) {
        try {
            let { data, error } = await this.fetchNotificationsSnake(userId, type, limit);
            if (error || !data) {
                const fallback = await this.fetchNotificationsCamel(userId, type, limit);
                data = fallback.data || [];
                error = fallback.error;
            }
            if (error || !data) return [];
            return data.map(n => {
                const createdAt = n.created_at;
                return {
                    id: n.id,
                    targetUsers: n.target_users,
                    title: n.title,
                    message: n.message,
                    type: n.type,
                    readBy: n.read_by,
                    createdAt: createdAt,
                    formattedDate: this.formatDate(createdAt),
                    formattedTime: this.formatTime(createdAt)
                };
            });
        } catch (error) {
            console.error('Error getting notifications by type:', error);
            throw error;
        }
    },

    // Get urgent notifications
    async getUrgentNotifications(userId, limit = 10) {
        try {
            // Since NEW schema doesn't have is_urgent column, return latest notifications
            let { data, error } = await this.fetchNotificationsSnake(userId, null, limit);
            if (error || !data) {
                const fallback = await this.fetchNotificationsCamel(userId, null, limit);
                data = fallback.data || [];
                error = fallback.error;
            }
            if (error || !data) return [];
            return data.map(n => {
                const createdAt = n.created_at;
                return {
                    id: n.id,
                    targetUsers: n.target_users,
                    title: n.title,
                    message: n.message,
                    type: n.type,
                    readBy: n.read_by,
                    createdAt: createdAt,
                    formattedDate: this.formatDate(createdAt),
                    formattedTime: this.formatTime(createdAt)
                };
            });
        } catch (error) {
            console.error('Error getting urgent notifications:', error);
            return [];
        }
    },

    // Delete notification (soft delete)
    async deleteNotification(notificationId) {
        try {
            if (!this.currentUser) throw new Error('No user logged in');

            // NEW schema doesn't have is_active column, so we'll actually delete the record
            const { error } = await window.supabaseClient
                .from('notifications')
                .delete()
                .eq('id', notificationId);
            
            if (error) throw error;

            console.log('Notification deleted:', notificationId);
            return true;
        } catch (error) {
            console.error('Error deleting notification:', error);
            throw error;
        }
    },

    // Create bulk notifications for multiple users
    async createBulkNotifications(notificationDataArray) {
        try {
            const notifications = notificationDataArray.map(notificationData => ({
                target_users: notificationData.target_users || notificationData.targetUsers,
                title: notificationData.title,
                message: notificationData.message,
                type: notificationData.type,
                is_active: true,
                created_at: (notificationData.created_at || notificationData.createdAt || new Date()).toISOString?.() || notificationData.created_at || notificationData.createdAt,
                read_by: notificationData.read_by || notificationData.readBy || [],
                student_id: notificationData.student_id || notificationData.studentId || null,
                student_name: notificationData.student_name || notificationData.studentName || null,
                related_record: notificationData.related_record || notificationData.relatedRecord || null,
                is_urgent: notificationData.is_urgent ?? notificationData.isUrgent ?? false
            }));

            const { data, error } = await window.supabaseClient
                .from('notifications')
                .insert(notifications)
                .select('id');

            if (error) throw error;
            
            const createdNotifications = data.map((d, i) => {
                const row = notifications[i];
                return {
                    id: d.id,
                    ...row,
                    readBy: row.read_by,
                    createdAt: row.created_at,
                    studentId: row.student_id,
                    studentName: row.student_name,
                    relatedRecord: row.related_record,
                    isUrgent: row.is_urgent
                };
            });

            console.log(`Created ${createdNotifications.length} bulk notifications`);
            
            // Trigger real-time updates
            if (createdNotifications.length > 0) {
                this.handleNewNotifications(createdNotifications);
            }
            
            return createdNotifications.map(notification => notification.id);
        } catch (error) {
            console.error('Error creating bulk notifications:', error);
            throw error;
        }
    },

    // Notification preferences management
    async updateNotificationPreferences(userId, preferences) {
        try {
            const { error } = await window.supabaseClient
                .from('profiles')
                .update({ notification_preferences: preferences, updated_at: new Date().toISOString() })
                .eq('id', userId);
            if (error) throw error;

            console.log('Notification preferences updated for user:', userId);
            return true;
        } catch (error) {
            console.error('Error updating notification preferences:', error);
            throw error;
        }
    },

    // Get notification preferences
    async getNotificationPreferences(userId) {
        try {
            const { data, error } = await window.supabaseClient
                .from('profiles')
                .select('notification_preferences')
                .eq('id', userId)
                .single();
            if (error) throw error;
            return data?.notification_preferences || {
                attendance: true,
                clinic: true,
                announcements: true,
                excuses: true,
                system: true,
                email: false,
                push: true
            };
        } catch (error) {
            console.error('Error getting notification preferences:', error);
            return null;
        }
    },

    // Enhanced notification handler with different priority levels
    handleNewNotifications(notifications) {
        console.log('New notifications received:', notifications.length);
        
        if (!notifications || notifications.length === 0) return;

        // Separate clinic notifications
        const clinicNotifications = notifications.filter(n => n.type === 'clinic');
        const otherNotifications = notifications.filter(n => n.type !== 'clinic');

        // Handle clinic notifications with special treatment
        if (clinicNotifications.length > 0) {
            clinicNotifications.forEach(notification => {
                this.handleClinicNotification(notification);
            });
        }

        // Handle other notifications normally
        if (otherNotifications.length > 0) {
            this.handleOtherNotifications(otherNotifications);
        }

        // Update notification count
        this.updateNotificationBadge();
    },

    // Handle clinic notification
    handleClinicNotification(notification) {
        if (notification.isUrgent) {
            this.showUrgentNotification(notification);
        } else {
            this.showNormalNotification(notification);
        }
        
        // Dispatch clinic-specific event
        if (window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('educareTrack:clinicNotification', {
                detail: { notification }
            }));
        }
    },

    // Handle other notifications (non-clinic)
    handleOtherNotifications(notifications) {
        // Separate urgent and normal notifications
        const urgentNotifications = notifications.filter(n => n.isUrgent);
        const normalNotifications = notifications.filter(n => !n.isUrgent);

        // Show urgent notifications immediately
        if (urgentNotifications.length > 0) {
            urgentNotifications.forEach(notification => {
                this.showUrgentNotification(notification);
            });
        }

        // Show batch notification for normal notifications
        if (normalNotifications.length > 0 && normalNotifications.length <= 3) {
            normalNotifications.forEach(notification => {
                this.showNormalNotification(notification);
            });
        } else if (normalNotifications.length > 3) {
            this.showBatchNotification(normalNotifications.length);
        }

        // Dispatch custom event for UI to handle
        if (window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('educareTrack:newNotifications', {
                detail: { 
                    notifications,
                    urgentCount: urgentNotifications.length,
                    normalCount: normalNotifications.length
                }
            }));
        }
    },

    // Update notification badge in UI
    updateNotificationBadge() {
        if (!this.currentUser) return;

        // Use cached count if available, otherwise fetch
        setTimeout(async () => {
            try {
                const unreadCount = await this.getUnreadNotificationCount(this.currentUser.id);
                const notificationCount = document.getElementById('notificationCount') || document.getElementById('notificationBoxCount');
                
                if (notificationCount) {
                    if (unreadCount > 0) {
                        notificationCount.textContent = unreadCount > 99 ? '99+' : unreadCount.toString();
                        notificationCount.classList.remove('hidden');
                        notificationCount.classList.add('animate-pulse');
                    } else {
                        notificationCount.classList.add('hidden');
                        notificationCount.classList.remove('animate-pulse');
                    }
                }

                // Update page title if there are unread notifications
                if (unreadCount > 0) {
                    document.title = `(${unreadCount}) ${this.config.schoolName} - EducareTrack`;
                } else {
                    document.title = `${this.config.schoolName} - EducareTrack`;
                }
            } catch (error) {
                console.error('Error updating notification badge:', error);
            }
        }, 100);
    },

    // Show urgent notification (high priority)
    showUrgentNotification(notification) {
        this.updateNotificationBadge();
        try {
            const n = Object.assign({ title: 'Urgent', message: '' }, notification || {});
            this.showNormalNotification(n);
        } catch (_) {}
    },

    // Show normal notification
    showNormalNotification(notification) {
        this.updateNotificationBadge();
        try {
            let overlay = document.getElementById('educareModalNotification');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'educareModalNotification';
                overlay.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
                const container = document.createElement('div');
                container.className = 'bg-white rounded-lg shadow-xl max-w-md w-full';
                const header = document.createElement('div');
                header.className = 'px-6 py-4 border-b';
                const titleEl = document.createElement('h3');
                titleEl.id = 'educareModalNotificationTitle';
                titleEl.className = 'text-lg font-semibold text-gray-800';
                header.appendChild(titleEl);
                const body = document.createElement('div');
                body.className = 'px-6 py-4';
                const msgEl = document.createElement('p');
                msgEl.id = 'educareModalNotificationMessage';
                msgEl.className = 'text-sm text-gray-700';
                body.appendChild(msgEl);
                const footer = document.createElement('div');
                footer.className = 'px-6 py-4 border-t flex justify-end';
                const okBtn = document.createElement('button');
                okBtn.className = 'px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700';
                okBtn.textContent = 'OK';
                okBtn.addEventListener('click', () => overlay.classList.add('hidden'));
                footer.appendChild(okBtn);
                container.appendChild(header);
                container.appendChild(body);
                container.appendChild(footer);
                overlay.appendChild(container);
                document.body.appendChild(overlay);
            }
            const titleEl = document.getElementById('educareModalNotificationTitle');
            const msgEl = document.getElementById('educareModalNotificationMessage');
            const t = notification && notification.title ? notification.title : 'Info';
            const m = notification && notification.message ? notification.message : '';
            titleEl.textContent = t;
            msgEl.textContent = m;
            overlay.classList.remove('hidden');
        } catch (_) {}
    },

    // Show batch notification for multiple notifications
    showBatchNotification(count) {
        this.updateNotificationBadge();
    },

    // Confirm modal
    confirmAction(message, title = 'Confirm', confirmText = 'Confirm', cancelText = 'Cancel') {
        return new Promise((resolve) => {
            try {
                let overlay = document.getElementById('educareConfirmModal');
                if (!overlay) {
                    overlay = document.createElement('div');
                    overlay.id = 'educareConfirmModal';
                    overlay.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
                    const container = document.createElement('div');
                    container.className = 'bg-white rounded-lg shadow-xl max-w-md w-full';
                    const header = document.createElement('div');
                    header.className = 'px-6 py-4 border-b';
                    const titleEl = document.createElement('h3');
                    titleEl.id = 'educareConfirmTitle';
                    titleEl.className = 'text-lg font-semibold text-gray-800';
                    header.appendChild(titleEl);
                    const body = document.createElement('div');
                    body.className = 'px-6 py-4';
                    const msgEl = document.createElement('p');
                    msgEl.id = 'educareConfirmMessage';
                    msgEl.className = 'text-sm text-gray-700';
                    body.appendChild(msgEl);
                    const footer = document.createElement('div');
                    footer.className = 'px-6 py-4 border-t flex justify-end space-x-2';
                    const confirmBtn = document.createElement('button');
                    confirmBtn.id = 'educareConfirmOk';
                    confirmBtn.className = 'px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700';
                    const cancelBtn = document.createElement('button');
                    cancelBtn.id = 'educareConfirmCancel';
                    cancelBtn.className = 'px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200';
                    footer.appendChild(confirmBtn);
                    footer.appendChild(cancelBtn);
                    container.appendChild(header);
                    container.appendChild(body);
                    container.appendChild(footer);
                    overlay.appendChild(container);
                    document.body.appendChild(overlay);
                }
                const titleEl = document.getElementById('educareConfirmTitle');
                const msgEl = document.getElementById('educareConfirmMessage');
                const confirmBtn = document.getElementById('educareConfirmOk');
                const cancelBtn = document.getElementById('educareConfirmCancel');
                titleEl.textContent = title;
                msgEl.textContent = message;
                confirmBtn.textContent = confirmText;
                cancelBtn.textContent = cancelText;
                overlay.classList.remove('hidden');
                const cleanup = () => {
                    overlay.classList.add('hidden');
                    confirmBtn.removeEventListener('click', onConfirm);
                    cancelBtn.removeEventListener('click', onCancel);
                };
                const onConfirm = () => { cleanup(); resolve(true); };
                const onCancel = () => { cleanup(); resolve(false); };
                confirmBtn.addEventListener('click', onConfirm);
                cancelBtn.addEventListener('click', onCancel);
            } catch (e) {
                resolve(true);
            }
        });
    },

    // Handle notification action
    handleNotificationAction(notification) {
        // Mark as read when action is taken
        this.markNotificationAsRead(notification.id);

        // Navigate based on notification type
        switch (notification.type) {
            case this.NOTIFICATION_TYPES.ATTENDANCE:
                // Navigate to attendance page or student profile
                if (notification.studentId) {
                    this.navigateToStudentProfile(notification.studentId);
                }
                break;
            case this.NOTIFICATION_TYPES.CLINIC:
                // Navigate to clinic visits or student profile
                if (notification.studentId) {
                    this.navigateToClinicVisits(notification.studentId);
                }
                break;
            case this.NOTIFICATION_TYPES.ANNOUNCEMENT:
                // Navigate to announcements
                this.navigateToAnnouncements();
                break;
            case this.NOTIFICATION_TYPES.EXCUSE:
                // Navigate to excuses
                this.navigateToExcuses();
                break;
            default:
                // Open notifications panel
                this.openNotificationsPanel();
                break;
        }
    },

    // Utility method to open notifications panel
    openNotificationsPanel() {
        const role = this.currentUserRole || (this.currentUser && this.currentUser.role);
        let url = 'notifications.html';
        if (role === 'teacher') url = 'teacher/teacher-notifications.html';
        else if (role === 'parent') url = 'parent/parent-notifications.html';
        else if (role === 'admin') url = 'admin/admin-notifications.html';
        window.location.href = url;
    },

    // Utility navigation methods (to be implemented in UI)
    navigateToStudentProfile(studentId) {
        if (window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('educareTrack:navigateToStudent', {
                detail: { studentId }
            }));
        }
    },

    navigateToClinicVisits(studentId) {
        if (window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('educareTrack:navigateToClinic', {
                detail: { studentId }
            }));
        }
    },

    navigateToAnnouncements() {
        if (window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('educareTrack:navigateToAnnouncements'));
        }
    },

    navigateToExcuses() {
        if (window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('educareTrack:navigateToExcuses'));
        }
    },

    async initializeNotificationPermissions() {
        if (!('Notification' in window)) return 'unsupported';

        const key = 'educareTrack_notifications_prompted';
        const alreadyPrompted = localStorage.getItem(key);

        if (alreadyPrompted) {
            return Notification.permission;
        }

        if (Notification.permission === 'default') {
            try {
                // Mark as prompted to avoid repeated requests across pages
                localStorage.setItem(key, 'true');
                const permission = await Notification.requestPermission();
                console.log('Notification permission:', permission);
                return permission;
            } catch (error) {
                console.error('Error requesting notification permission:', error);
                return 'denied';
            }
        }
        return Notification.permission;
    },

    // Clean up old notifications (admin function)
    async cleanupOldNotifications(daysOld = 30) {
        try {
            if (!this.currentUser || this.currentUser.role !== 'admin') {
                throw new Error('Only admins can cleanup notifications');
            }

            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysOld);

            const { count, error } = await window.supabaseClient
                .from('notifications')
                .delete({ count: 'exact' })
                .lt('created_at', cutoffDate.toISOString());
            
            if (error) throw error;
            
            console.log(`Cleaned up ${count} old notifications`);
            
            this.clearCache(); // Clear cache since data changed
            
            return count;
        } catch (error) {
            console.error('Error cleaning up old notifications:', error);
            throw error;
        }
    },

    // ==================== ATTENDANCE MANAGEMENT ====================

    // Get current session (morning/afternoon)
    getCurrentSession() {
        const now = new Date();
        const currentTime = now.getHours() + ':' + now.getMinutes().toString().padStart(2, '0');
        
        if (currentTime >= this.config.morningSessionStart && currentTime < this.config.morningSessionEnd) {
            return this.SESSIONS.MORNING;
        } else if (currentTime >= this.config.afternoonSessionStart && currentTime < this.config.afternoonSessionEnd) {
            return this.SESSIONS.AFTERNOON;
        }
        
        return null;
    },

    // Check if current time is late
    isLate(time) {
        return time > this.config.lateThreshold;
    },

    // Enhanced data synchronization
    async syncAttendanceToReports() {
        try {
            // Clear cache when new attendance is recorded
            this.clearCache();
            
            // Trigger real-time updates for reports
            if (window.dispatchEvent) {
                window.dispatchEvent(new CustomEvent('educareTrack:attendanceUpdated', {
                    detail: { timestamp: new Date() }
                }));
            }
            
            console.log('Attendance data synced to reports');
        } catch (error) {
            console.error('Error syncing attendance to reports:', error);
        }
    },

    // Record attendance
    async recordAttendance(arg1, arg2, arg3) {
        try {
            // Handle both signature types:
            // 1. (studentId, entry_type, timestamp)
            // 2. ({ studentId, status, date, notes, recordedBy, entry_type, ... })
            
            let studentId, entry_type, timestamp, status, notes, recordedBy, recordedByName;
            let isObjectArg = false;

            if (typeof arg1 === 'object' && arg1 !== null && arg1.studentId) {
                // Object signature
                isObjectArg = true;
                const opts = arg1;
                studentId = opts.studentId;
                entry_type = opts.entryType || opts.entry_type || 'entry';
                timestamp = opts.date ? new Date(opts.date) : new Date();
                status = opts.status;
                notes = opts.notes || opts.remarks || '';
                recordedBy = opts.recordedBy; // ID or Name depending on caller, but usually ID
                recordedByName = opts.recordedByName || opts.recordedBy; // Fallback
            } else {
                // Positional signature
                studentId = arg1;
                entry_type = arg2 || 'entry';
                timestamp = arg3 || new Date();
            }

            const timeString = timestamp.toTimeString().split(' ')[0].substring(0, 5);
            const session = this.getCurrentSession();
            
            // If status not provided, calculate it
            if (!status) {
                const isLate = entry_type === 'entry' && this.isLate(timeString);
                status = isLate ? this.ATTENDANCE_STATUS.LATE : this.ATTENDANCE_STATUS.PRESENT;
            }

            const { data: student, error: studentErr } = await window.supabaseClient
                .from('students')
                .select('id,full_name,class_id,parent_id')
                .eq('id', studentId)
                .single();
            
            if (studentErr || !student) {
                throw new Error('Student not found');
            }

            const insertData = {
                student_id: studentId,
                class_id: student.class_id || '',
                entry_type: entry_type,
                timestamp: timestamp,
                time: timeString,
                session: session,
                status: status,
                remarks: notes || '',
                recorded_by: recordedBy || this.currentUser.id,
                recorded_by_name: recordedByName || this.currentUser.name,
                manual_entry: isObjectArg // Assume object arg implies manual/admin entry
            };

            const { data: inserted, error } = await window.supabaseClient.from('attendance').insert(insertData).select('id').single();
            
            if (error) {
                throw error;
            }

            const newStatus = entry_type === 'entry' ? 'in_school' : 'out_school';
            await window.supabaseClient.from('students').update({ current_status: newStatus }).eq('id', studentId);

            // Get parent IDs
            const { data: relations } = await window.supabaseClient
                .from('parent_students')
                .select('parent_id')
                .eq('student_id', student.id);
            const parentIds = (relations || []).map(r => r.parent_id);

            // Only notify if not manually suppressed (optional future enhancement)
            // For now, keep existing notification logic
            await this.createNotification({
                type: this.NOTIFICATION_TYPES.ATTENDANCE,
                title: `Student ${entry_type === 'entry' ? 'Arrival' : 'Departure'}`,
                message: `${student.full_name} has ${entry_type === 'entry' ? 'entered' : 'left'} the school at ${timeString}`,
                target_users: [...parentIds].filter(Boolean),
                studentId: studentId,
                studentName: student.full_name,
                relatedRecord: inserted.id
            });

            await this.syncAttendanceToReports();
            return inserted.id;
        } catch (error) {
            console.error('Error recording attendance:', error);
            throw error;
        }
    },

    // Enhanced guard attendance recording
    async recordGuardAttendance(studentId, student, entry_type) {
        try {
            const timestamp = new Date();
            const timeString = timestamp.toTimeString().split(' ')[0].substring(0, 5);
            const session = this.getCurrentSession();
            
            // Use existing attendance logic for status calculation
            const isLate = entry_type === 'entry' && this.isLate(timeString);
            const status = isLate ? this.ATTENDANCE_STATUS.LATE : this.ATTENDANCE_STATUS.PRESENT;

            const attendanceData = {
                student_id: studentId,
                class_id: student.class_id || '',
                entry_type: entry_type,
                timestamp: timestamp,
                time: timeString,
                session: session,
                status: status,
                recorded_by: this.currentUser.id,
                recorded_by_name: this.currentUser.name,
                manual_entry: false
            };

            const { data: attendanceRef, error } = await window.supabaseClient.from('attendance').insert(attendanceData).select('id').single();

            if (error) {
                throw error;
            }

            // Update student status
            await window.supabaseClient.from('students').update({
                current_status: entry_type === 'entry' ? 'in_school' : 'out_school'
            }).eq('id', studentId);

            // Get parent IDs
            const { data: relations } = await window.supabaseClient
                .from('parent_students')
                .select('parent_id')
                .eq('student_id', studentId);
            const parentIds = (relations || []).map(r => r.parent_id);

            const teacherIds = await this.getRelevantTeachersForStudent(student);
            await this.createNotification({
                type: this.NOTIFICATION_TYPES.ATTENDANCE,
                title: `Student ${entry_type === 'entry' ? 'Arrival' : 'Departure'}`,
                message: `${student.name} has ${entry_type === 'entry' ? 'entered' : 'left'} the school at ${timeString}`,
                target_users: [...parentIds, ...teacherIds].filter(Boolean),
                studentId: studentId,
                studentName: student.name,
                relatedRecord: attendanceRef.id
            });

            console.log(`Guard attendance recorded: ${student.name} - ${entry_type} at ${timeString}`);

            // Sync with reports system
            await this.syncAttendanceToReports();

            return attendanceRef.id;
        } catch (error) {
            console.error('Error recording guard attendance:', error);
            throw error;
        }
    },

    // ==================== ADDITIONAL ATTENDANCE FUNCTIONS ====================

    // Get attendance statistics for a specific date
    async getAttendanceStats(date) {
        try {
            const startOfDay = new Date(date + 'T00:00:00');
            const endOfDay = new Date(date + 'T23:59:59');
            const stats = { present: 0, absent: 0, late: 0, clinic: 0, excused: 0 };
            const { data, error } = await window.supabaseClient
                .from('attendance')
                .select('status,timestamp,entry_type')
                .gte('timestamp', startOfDay.toISOString())
                .lte('timestamp', endOfDay.toISOString());
            if (error) {
                throw error;
            }
            (data || []).forEach(row => {
                if (row && row.status && Object.prototype.hasOwnProperty.call(stats, row.status)) {
                    stats[row.status] += 1;
                }
            });
            return stats;
        } catch (error) {
            console.error('Error getting attendance stats:', error);
            throw error;
        }
    },

    // Get attendance records with filters
    async getAttendanceRecords(filters = {}) {
        try {
            let query = window.supabaseClient.from('attendance').select('*');
            if (filters.startDate && filters.endDate) {
                const startDate = new Date(filters.startDate + 'T00:00:00');
                const endDate = new Date(filters.endDate + 'T23:59:59');
                query = query.gte('timestamp', startDate.toISOString()).lte('timestamp', endDate.toISOString());
            }
            if (filters.classId) {
                query = query.eq('class_id', filters.classId);
            }
            if (filters.status) {
                query = query.eq('status', filters.status);
            }
            const { data, error } = await query.order('timestamp', { ascending: false });
            if (error) {
                throw error;
            }
            return Array.isArray(data) ? data.map(r => ({ id: r.id, ...r })) : [];
        } catch (error) {
            console.error('Error getting attendance records:', error);
            throw error;
        }
    },

    // Record manual attendance (for teachers/admins)
    async recordManualAttendance(attendanceData) {
        try {
            const timestamp = new Date(attendanceData.date + 'T' + (attendanceData.time || '08:00:00'));
            const timeString = (attendanceData.time || '08:00').substring(0, 5);
            const session = this.getCurrentSession();
            const { data: student, error: studentErr } = await window.supabaseClient
                .from('students')
                .select('id,full_name,class_id')
                .eq('id', attendanceData.studentId)
                .single();
            if (studentErr || !student) {
                throw new Error('Student not found');
            }
            const row = {
                student_id: attendanceData.studentId,
                class_id: student.class_id || '',
                entry_type: 'entry',
                timestamp: timestamp,
                time: timeString,
                session: session,
                status: attendanceData.status,
                recorded_by: attendanceData.recordedBy,
                recorded_by_name: this.currentUser?.name || '',
                remarks: attendanceData.notes || '',
                manual_entry: true
            };
            const { data: inserted, error } = await window.supabaseClient.from('attendance').insert(row).select('id').single();
            if (error) {
                throw error;
            }

            // Get parent IDs
            const { data: relations } = await window.supabaseClient
                .from('parent_students')
                .select('parent_id')
                .eq('student_id', student.id);
            const parentIds = (relations || []).map(r => r.parent_id);

            const teacherIds = await this.getRelevantTeachersForStudent({ 
                id: student.id, 
                name: student.full_name, 
                classId: student.class_id 
            });
            await this.createNotification({
                type: this.NOTIFICATION_TYPES.ATTENDANCE,
                title: 'Manual Attendance Update',
                message: `${student.full_name} marked as ${attendanceData.status} (${attendanceData.notes || 'No notes'})`,
                target_users: [...parentIds, ...teacherIds].filter(Boolean),
                studentId: student.id,
                studentName: student.full_name,
                relatedRecord: inserted.id
            });
            return true;
        } catch (error) {
            console.error('Error recording attendance:', error);
            throw error;
        }
    },

    async overrideAttendanceStatus(studentId, status = 'present', notes = '') {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const { data: student, error: studentErr } = await window.supabaseClient
                .from('students')
                .select('id,full_name,class_id')
                .eq('id', studentId)
                .single();
            if (studentErr || !student) {
                throw new Error('Student not found');
            }
            const { data: existing, error: qErr } = await window.supabaseClient
                .from('attendance')
                .select('id,timestamp')
                .eq('student_id', studentId)
                .eq('entry_type', 'entry')
                .gte('timestamp', today.toISOString())
                .order('timestamp', { ascending: true })
                .limit(1);
            if (qErr) {
                throw qErr;
            }
            let recordId = null;
            if (Array.isArray(existing) && existing.length > 0) {
                recordId = existing[0].id;
                const { error: upErr } = await window.supabaseClient
                    .from('attendance')
                    .update({ status: status, remarks: notes })
                    .eq('id', recordId);
                if (upErr) {
                    throw upErr;
                }
            } else {
                const now = new Date();
                const timeString = now.toTimeString().split(' ')[0].substring(0, 5);
                const session = this.getCurrentSession();
                const row = {
                    student_id: studentId,
                    class_id: student.class_id || '',
                    entry_type: 'entry',
                    timestamp: now,
                    time: timeString,
                    session: session,
                    status: status,
                    recorded_by: this.currentUser?.id || 'system',
                    recorded_by_name: this.currentUser?.name || 'System',
                    manual_entry: true,
                    remarks: notes || ''
                };
                const { data: inserted, error } = await window.supabaseClient.from('attendance').insert(row).select('id').single();
                if (error) {
                    throw error;
                }
                recordId = inserted.id;
            }
            const newStatus = status === 'absent' ? 'out_school' : 'in_school';
            const { error: stuErr } = await window.supabaseClient.from('students').update({ current_status: newStatus }).eq('id', studentId);
            if (stuErr) {
                throw stuErr;
            }
            // Get parent IDs
            const { data: relations } = await window.supabaseClient
                .from('parent_students')
                .select('parent_id')
                .eq('student_id', student.id);
            const parentIds = (relations || []).map(r => r.parent_id);

            const teacherIds = await this.getRelevantTeachersForStudent({ id: student.id, name: student.full_name, classId: student.class_id });
            await this.createNotification({
                type: this.NOTIFICATION_TYPES.ATTENDANCE,
                title: 'Manual Attendance Update',
                message: `${student.full_name} marked as ${status}${notes ? ` (${notes})` : ''}`,
                target_users: [...parentIds, ...teacherIds].filter(Boolean),
                studentId: student.id,
                studentName: student.full_name,
                relatedRecord: recordId
            });

            try {
                const end = new Date();
                const start = new Date(end.getTime() - 14 * 24 * 60 * 60 * 1000);
                // Ensure computeAttendanceRisk is implemented/updated to use Supabase if needed
                const risk = await this.computeAttendanceRisk(student.id, start, end);
                if (risk.severity === 'critical') {
                    const todayStart = new Date();
                    todayStart.setHours(0, 0, 0, 0);
                    
                    const { data: dupCheck, error: dupErr } = await window.supabaseClient
                        .from('notifications')
                        .select('title')
                        .eq('student_id', student.id)
                        .eq('type', this.NOTIFICATION_TYPES.ATTENDANCE)
                        .gte('created_at', todayStart.toISOString());
                        
                    const hasCriticalToday = !dupErr && (dupCheck || []).some(n => (n.title || '').includes('Critical Attendance Alert'));
                    
                    if (!hasCriticalToday) {
                        const { data: admins, error: adminErr } = await window.supabaseClient
                            .from('profiles')
                            .select('id')
                            .eq('role', this.USER_TYPES.ADMIN)
                            .eq('is_active', true)
                            .limit(10);
                            
                        const adminIds = !adminErr && admins ? admins.map(d => d.id) : [];
                        const reasonText = risk.reasons.length ? `Reasons: ${risk.reasons.join(', ')}` : '';
                        
                        await this.createNotification({
                            type: this.NOTIFICATION_TYPES.ATTENDANCE,
                            title: 'Critical Attendance Alert',
                            message: `${student.full_name} flagged as at-risk. ${reasonText}`,
                            isUrgent: true,
                            target_users: [...parentIds, ...teacherIds, ...adminIds].filter(Boolean),
                            studentId: student.id,
                            studentName: student.full_name,
                            relatedRecord: recordId
                        });
                    }
                }
            } catch (e) {
                console.error('Risk evaluation failed:', e);
            }

            return true;
        } catch (error) {
            console.error('Error overriding attendance status:', error);
            throw error;
        }
    },

    // Delete attendance record
    async deleteAttendanceRecord(recordId) {
        try {
            const { error } = await window.supabaseClient.from('attendance').delete().eq('id', recordId);
            if (error) {
                throw error;
            }
            return true;
        } catch (error) {
            console.error('Error deleting attendance record:', error);
            throw error;
        }
    },

    // Get class students (alias for getStudentsByClass for backward compatibility)
    async getClassStudents(classId) {
        try {
            const { data, error } = await window.supabaseClient
                .from('students')
                .select('*')
                .eq('class_id', classId);
            if (error) throw error;
            return (data || []).map(s => ({ ...s }));
        } catch (error) {
            console.error('Error getting class students:', error);
            throw error;
        }
    },

    // ==================== CLINIC MANAGEMENT ====================

    // Clinic Check-in/Check-out
    async recordClinicVisit(studentId, reason = '', notes = '', check_in = true) {
        try {
            const { data: student, error: studentErr } = await window.supabaseClient
                .from('students')
                .select('id,full_name,class_id')
                .eq('id', studentId)
                .single();
            if (studentErr || !student) {
                throw new Error('Student not found');
            }
            
            // Use NEW schema fields
            const row = {
                student_id: studentId,
                reason: reason || '',
                notes: notes || '',
                treated_by: this.currentUser.id, // UUID as required by NEW schema
                outcome: check_in ? 'checked_in' : 'checked_out',
                visit_time: new Date()
            };
            
            const { data: inserted, error } = await window.supabaseClient.from('clinic_visits').insert(row).select('id').single();
            if (error) {
                throw error;
            }
            
            const newStatus = check_in ? 'in_clinic' : 'in_school';
            const { error: upErr } = await window.supabaseClient.from('students').update({ current_status: newStatus }).eq('id', studentId);
            if (upErr) {
                throw upErr;
            }

            // Get parent IDs
            const { data: relations } = await window.supabaseClient
                .from('parent_students')
                .select('parent_id')
                .eq('student_id', student.id);
            const parentIds = (relations || []).map(r => r.parent_id);

            let teacherId = null;
            if (student.class_id) {
                const { data: classData, error: hrErr } = await window.supabaseClient
                    .from('classes')
                    .select('adviser_id')
                    .eq('id', student.class_id)
                    .single();
                
                if (!hrErr && classData && classData.adviser_id) {
                    teacherId = classData.adviser_id;
                }
            }
            await this.createNotification({
                type: this.NOTIFICATION_TYPES.CLINIC,
                title: `Clinic ${check_in ? 'Visit' : 'Check-out'}`,
                message: `${student.full_name} has ${check_in ? 'checked into' : 'checked out from'} the clinic.${reason ? ' Reason: ' + reason : ''}`,
                target_users: [...parentIds, teacherId].filter(Boolean),
                studentId: student.id,
                studentName: student.full_name,
                relatedRecord: inserted.id
            });
            return inserted.id;
        } catch (error) {
            console.error('Error recording clinic visit:', error);
            throw error;
        }
    },

    // ==================== ANNOUNCEMENTS ====================

    // Create announcements
    async createAnnouncement(announcementData) {
        try {
            if (!this.currentUser || (this.currentUser.role !== 'admin' && this.currentUser.role !== 'teacher')) {
                throw new Error('Only admins and teachers can create announcements');
            }

            const row = {
                title: announcementData.title,
                message: announcementData.message,
                audience: announcementData.audience,
                priority: announcementData.priority,
                class_id: announcementData.class_id || announcementData.classId || null,
                class_name: announcementData.class_name || announcementData.className || null,
                created_by: this.currentUser.id,
                created_by_name: this.currentUser.name,
                created_at: new Date().toISOString(),
                is_active: true,
                is_urgent: announcementData.is_urgent ?? announcementData.isUrgent ?? false,
                expiry_date: announcementData.expiry_date || announcementData.expiryDate || null
            };

            const { data: inserted, error } = await window.supabaseClient.from('announcements').insert(row).select('id').single();
            if (error) throw error;

            // Get target users based on audience
            let target_users = [];
            if (announcementData.audience === 'all') {
                const { data } = await window.supabaseClient.from('profiles').select('id').eq('is_active', true);
                target_users = (data || []).map(u => u.id);
            } else if (announcementData.audience === 'parents') {
                const { data } = await window.supabaseClient.from('profiles').select('id').eq('role', 'parent').eq('is_active', true);
                target_users = (data || []).map(u => u.id);
            } else if (announcementData.audience === 'teachers') {
                const { data } = await window.supabaseClient.from('profiles').select('id').eq('role', 'teacher').eq('is_active', true);
                target_users = (data || []).map(u => u.id);
            }

            // Create notifications for target users
            if (target_users.length > 0) {
                await this.createNotification({
                    type: this.NOTIFICATION_TYPES.ANNOUNCEMENT,
                    title: announcementData.title,
                    message: announcementData.message,
                    target_users: target_users,
                    relatedRecord: inserted.id,
                    isUrgent: announcementData.isUrgent || false
                });
            }

            console.log('Announcement created:', inserted.id);
            return inserted.id;
        } catch (error) {
            console.error('Error creating announcement:', error);
            throw error;
        }
    },

    // Get announcements
    async getAnnouncements(limit = 20) {
        try {
            const { data, error } = await window.supabaseClient
                .from('announcements')
                .select('*')
                .eq('is_active', true)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) {
                const userId = this.currentUser?.id;
                if (!userId) throw error;
                const notifications = await this.getNotificationsByType(userId, this.NOTIFICATION_TYPES.ANNOUNCEMENT, limit);
                return notifications.map(n => ({
                    id: n.relatedRecord || n.id,
                    title: n.title,
                    message: n.message,
                    audience: 'all',
                    priority: n.isUrgent ? 'high' : 'normal',
                    created_by: null,
                    created_by_name: null,
                    created_at: n.createdAt,
                    is_active: true,
                    is_urgent: n.isUrgent,
                    expiry_date: null,
                    createdAt: new Date(n.createdAt),
                    isUrgent: n.isUrgent,
                    expiryDate: null
                }));
            }
            return (data || []).map(a => ({
                id: a.id,
                ...a,
                createdAt: new Date(a.created_at),
                isUrgent: a.is_urgent,
                expiryDate: a.expiry_date
            }));
        } catch (error) {
            console.error('Error getting announcements:', error);
            throw error;
        }
    },

    // Delete announcement
    async deleteAnnouncement(announcementId) {
        try {
            if (!this.currentUser || (this.currentUser.role !== 'admin' && this.currentUser.role !== 'teacher')) {
                throw new Error('Only admins and teachers can delete announcements');
            }

            const { error } = await window.supabaseClient.from('announcements').delete().eq('id', announcementId);
            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error deleting announcement:', error);
            throw error;
        }
    },

    // ==================== REPORTS AND ANALYTICS ====================

    // Get attendance report with date range
    async getAttendanceReport(startDate, endDate, limit = 100) {
        try {
            if (limit === 'all') {
                let allData = [];
                let from = 0;
                const batchSize = 1000;
                let more = true;
                
                while (more) {
                    const { data, error } = await window.supabaseClient
                        .from('attendance')
                        .select('*')
                        .gte('timestamp', startDate instanceof Date ? startDate.toISOString() : new Date(startDate).toISOString())
                        .lte('timestamp', endDate instanceof Date ? endDate.toISOString() : new Date(endDate).toISOString())
                        .order('timestamp', { ascending: false })
                        .range(from, from + batchSize - 1);
                        
                    if (error) throw error;
                    
                    if (data && data.length > 0) {
                        allData = allData.concat(data);
                        if (data.length < batchSize) more = false;
                        else from += batchSize;
                    } else {
                        more = false;
                    }
                }
                return allData.map(doc => ({ id: doc.id, ...doc }));
            }

            const { data, error } = await window.supabaseClient
                .from('attendance')
                .select('*')
                .gte('timestamp', startDate instanceof Date ? startDate.toISOString() : new Date(startDate).toISOString())
                .lte('timestamp', endDate instanceof Date ? endDate.toISOString() : new Date(endDate).toISOString())
                .order('timestamp', { ascending: false })
                .limit(limit);

            if (error) throw error;
            return (data || []).map(doc => ({ id: doc.id, ...doc }));
        } catch (error) {
            console.error('Error getting attendance report:', error);
            return [];
        }
    },

    async getClinicReport(startDate, endDate, limit = 100) {
        try {
            if (limit === 'all') {
                let allData = [];
                let from = 0;
                const batchSize = 1000;
                let more = true;
                
                while (more) {
                    const { data, error } = await window.supabaseClient
                        .from('clinic_visits')
                        .select('*')
                        .gte('timestamp', startDate instanceof Date ? startDate.toISOString() : new Date(startDate).toISOString())
                        .lte('timestamp', endDate instanceof Date ? endDate.toISOString() : new Date(endDate).toISOString())
                        .order('timestamp', { ascending: false })
                        .range(from, from + batchSize - 1);
                        
                    if (error) throw error;
                    
                    if (data && data.length > 0) {
                        allData = allData.concat(data);
                        if (data.length < batchSize) more = false;
                        else from += batchSize;
                    } else {
                        more = false;
                    }
                }
                return allData.map(doc => ({ id: doc.id, ...doc }));
            }

            const { data, error } = await window.supabaseClient
                .from('clinic_visits')
                .select('*')
                .gte('timestamp', startDate instanceof Date ? startDate.toISOString() : new Date(startDate).toISOString())
                .lte('timestamp', endDate instanceof Date ? endDate.toISOString() : new Date(endDate).toISOString())
                .order('timestamp', { ascending: false })
                .limit(limit);

            if (error) throw error;
            return (data || []).map(doc => ({ id: doc.id, ...doc }));
        } catch (error) {
            console.error('Error getting clinic report:', error);
            return [];
        }
    },

    async getStudentActivityReport(startDate, endDate, limit = 100) {
        try {
            // Combine attendance and clinic visits for comprehensive activity report
            const [{ data: attendanceData }, { data: clinicData }] = await Promise.all([
                window.supabaseClient
                    .from('attendance')
                    .select('*')
                    .gte('timestamp', startDate instanceof Date ? startDate.toISOString() : new Date(startDate).toISOString())
                    .lte('timestamp', endDate instanceof Date ? endDate.toISOString() : new Date(endDate).toISOString())
                    .order('timestamp', { ascending: false })
                    .limit(limit / 2),
                window.supabaseClient
                    .from('clinic_visits')
                    .select('*')
                    .gte('timestamp', startDate instanceof Date ? startDate.toISOString() : new Date(startDate).toISOString())
                    .lte('timestamp', endDate instanceof Date ? endDate.toISOString() : new Date(endDate).toISOString())
                    .order('timestamp', { ascending: false })
                    .limit(limit / 2)
            ]);

            const activities = [
                ...(attendanceData || []).map(doc => ({ 
                    id: doc.id, 
                    ...doc,
                    type: 'attendance',
                    timestamp: new Date(doc.timestamp)
                })),
                ...(clinicData || []).map(doc => ({ 
                    id: doc.id, 
                    ...doc,
                    type: 'clinic',
                    timestamp: new Date(doc.timestamp)
                }))
            ];

            // Sort by timestamp (newest first)
            return activities.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
        } catch (error) {
            console.error('Error getting student activity report:', error);
            throw error;
        }
    },

    async getLateArrivalsReport(startDate, endDate, limit = 100) {
        try {
            if (limit === 'all') {
                let allData = [];
                let from = 0;
                const batchSize = 1000;
                let more = true;
                
                while (more) {
                    const { data, error } = await window.supabaseClient
                        .from('attendance')
                        .select('*')
                        .gte('timestamp', startDate instanceof Date ? startDate.toISOString() : new Date(startDate).toISOString())
                        .lte('timestamp', endDate instanceof Date ? endDate.toISOString() : new Date(endDate).toISOString())
                        .eq('status', 'late')
                        .order('timestamp', { ascending: false })
                        .range(from, from + batchSize - 1);
                        
                    if (error) throw error;
                    
                    if (data && data.length > 0) {
                        allData = allData.concat(data);
                        if (data.length < batchSize) more = false;
                        else from += batchSize;
                    } else {
                        more = false;
                    }
                }
                return allData.map(doc => ({ id: doc.id, ...doc }));
            }

            const { data, error } = await window.supabaseClient
                .from('attendance')
                .select('*')
                .gte('timestamp', startDate instanceof Date ? startDate.toISOString() : new Date(startDate).toISOString())
                .lte('timestamp', endDate instanceof Date ? endDate.toISOString() : new Date(endDate).toISOString())
                .eq('status', 'late')
                .order('timestamp', { ascending: false })
                .limit(limit);

            if (error) throw error;
            return (data || []).map(doc => ({ id: doc.id, ...doc }));
        } catch (error) {
            console.error('Error getting late arrivals report:', error);
            throw error;
        }
    },

    // ==================== ENHANCED ANALYTICS METHODS ====================

    // Get comprehensive analytics data
    async getAnalyticsData(startDate, endDate) {
        try {
            this.showLoading();
            
            // Calculate date range if not provided
            if (!startDate) {
                startDate = new Date();
                startDate.setDate(startDate.getDate() - 30); // Default to 30 days
            }
            if (!endDate) {
                endDate = new Date();
            }

            // Execute all analytics queries in parallel for performance
            const [
                attendanceTrend,
                statusDistribution,
                gradeAttendance,
                dailyPattern,
                clinicStats,
                lateStats,
                studentStats
            ] = await Promise.all([
                this.getAttendanceTrend(startDate, endDate),
                this.getStatusDistribution(startDate, endDate),
                this.getGradeLevelAttendance(startDate, endDate),
                this.getDailyPattern(startDate, endDate),
                this.getClinicStats(startDate, endDate),
                this.getLateArrivalsStats(startDate, endDate),
                this.getStudentStats()
            ]);

            const analyticsData = {
                attendanceTrend,
                statusDistribution,
                gradeAttendance,
                dailyPattern,
                clinicStats,
                lateStats,
                studentStats,
                dateRange: {
                    start: startDate,
                    end: endDate
                },
                generatedAt: new Date()
            };

            this.hideLoading();
            return analyticsData;
        } catch (error) {
            console.error('Error getting analytics data:', error);
            this.hideLoading();
            throw error;
        }
    },

    // Get clinic statistics
    async getClinicStats(startDate, endDate) {
        try {
            const { data: visits, error } = await window.supabaseClient
                .from('clinic_visits')
                .select('*')
                .gte('timestamp', startDate instanceof Date ? startDate.toISOString() : new Date(startDate).toISOString())
                .lte('timestamp', endDate instanceof Date ? endDate.toISOString() : new Date(endDate).toISOString());

            if (error) throw error;
            
            // Calculate common reasons
            const reasons = {};
            (visits || []).forEach(visit => {
                const reason = visit.reason || 'Unknown';
                reasons[reason] = (reasons[reason] || 0) + 1;
            });

            // Get top reasons
            const topReasons = Object.entries(reasons)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([reason, count]) => ({ reason, count }));

            return {
                totalVisits: (visits || []).length,
                uniqueStudents: new Set((visits || []).map(v => v.student_id)).size,
                topReasons,
                averageVisitDuration: this.calculateAverageVisitDuration(visits || [])
            };
        } catch (error) {
            console.error('Error getting clinic stats:', error);
            return {
                totalVisits: 0,
                uniqueStudents: 0,
                topReasons: [],
                averageVisitDuration: 0
            };
        }
    },

    // Calculate average clinic visit duration
    calculateAverageVisitDuration(visits) {
        const check_ins = visits.filter(v => v.check_in);
        const checkOuts = visits.filter(v => !v.check_in);
        
        let totalDuration = 0;
        let pairCount = 0;

        check_ins.forEach(check_in => {
            const correspondingCheckOut = checkOuts.find(checkOut => 
                checkOut.student_id === check_in.student_id && 
                this.isSameDay(new Date(check_in.timestamp), new Date(checkOut.timestamp))
            );

            if (correspondingCheckOut && check_in.timestamp && correspondingCheckOut.timestamp) {
                const duration = new Date(correspondingCheckOut.timestamp) - new Date(check_in.timestamp);
                totalDuration += duration;
                pairCount++;
            }
        });

        return pairCount > 0 ? Math.round(totalDuration / pairCount / (1000 * 60)) : 0; // Return in minutes
    },

    // Check if two timestamps are on the same day
    isSameDay(timestamp1, timestamp2) {
        if (!timestamp1 || !timestamp2) return false;
        
        const date1 = timestamp1 instanceof Date ? timestamp1.toDateString() : new Date(timestamp1).toDateString();
        const date2 = timestamp2 instanceof Date ? timestamp2.toDateString() : new Date(timestamp2).toDateString();
        return date1 === date2;
    },

    // Get late arrival statistics
    async getLateArrivalsStats(startDate, endDate) {
        try {
            const { data: lateArrivals, error } = await window.supabaseClient
                .from('attendance')
                .select('*')
                .gte('timestamp', startDate instanceof Date ? startDate.toISOString() : new Date(startDate).toISOString())
                .lte('timestamp', endDate instanceof Date ? endDate.toISOString() : new Date(endDate).toISOString())
                .eq('status', 'late');

            if (error) throw error;
            
            // Group by student
            const studentLateCounts = {};
            (lateArrivals || []).forEach(arrival => {
                const studentId = arrival.student_id;
                studentLateCounts[studentId] = (studentLateCounts[studentId] || 0) + 1;
            });

            // Get frequent late comers
            const frequentLateComers = Object.entries(studentLateCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10);

            // Get late arrival pattern by day of week
            const dayPattern = {
                'Monday': 0, 'Tuesday': 0, 'Wednesday': 0, 'Thursday': 0, 'Friday': 0, 'Saturday': 0, 'Sunday': 0
            };

            (lateArrivals || []).forEach(arrival => {
                if (arrival.timestamp) {
                    const day = new Date(arrival.timestamp).toLocaleDateString('en-US', { weekday: 'long' });
                    dayPattern[day]++;
                }
            });

            return {
                totalLateArrivals: (lateArrivals || []).length,
                frequentLateComers,
                dayPattern,
                averageLatePerStudent: (lateArrivals || []).length / Object.keys(studentLateCounts).length || 0
            };
        } catch (error) {
            console.error('Error getting late arrivals stats:', error);
            return {
                totalLateArrivals: 0,
                frequentLateComers: [],
                dayPattern: {},
                averageLatePerStudent: 0
            };
        }
    },

    // Get comprehensive student statistics
    async getStudentStats() {
        try {
            const students = await this.getStudents();
            
            const stats = {
                total: students.length,
                byLevel: {},
                byGrade: {},
                byStatus: {
                    in_school: 0,
                    out_school: 0,
                    in_clinic: 0
                },
                withRecentActivity: 0
            };

            // Calculate stats
            students.forEach(student => {
                // By level
                stats.byLevel[student.level] = (stats.byLevel[student.level] || 0) + 1;
                
                // By grade
                stats.byGrade[student.grade] = (stats.byGrade[student.grade] || 0) + 1;
                
                // By current status
                if (student.currentStatus) {
                    stats.byStatus[student.currentStatus] = (stats.byStatus[student.currentStatus] || 0) + 1;
                }

                // Check recent activity (last 7 days)
                if (student.lastAttendance) {
                    const lastActivity = student.lastAttendance.toDate();
                    const sevenDaysAgo = new Date();
                    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
                    
                    if (lastActivity >= sevenDaysAgo) {
                        stats.withRecentActivity++;
                    }
                }
            });

            return stats;
        } catch (error) {
            console.error('Error getting student stats:', error);
            return {
                total: 0,
                byLevel: {},
                byGrade: {},
                byStatus: {},
                withRecentActivity: 0
            };
        }
    },

    // Enhanced attendance trend with real data
    async getAttendanceTrend(startDate, endDate, interval = 'day') {
        try {
            // Ensure calendar data is loaded
            await this.fetchCalendarData();

            const attendanceData = await this.getAttendanceReport(startDate, endDate, 'all');
            
            // Group by date
            const dateGroups = {};
            
            // Get student counts by level for accurate daily expected attendance
            const { data: students } = await window.supabaseClient
                .from('students')
                .select('level')
                .eq('is_active', true);
            
            const levelCounts = (students || []).reduce((acc, s) => {
                if (s.level) {
                    acc[s.level] = (acc[s.level] || 0) + 1;
                }
                return acc;
            }, {});

            const totalActiveStudents = (students || []).length;

            attendanceData.forEach(record => {
                if (record.timestamp) {
                    const ts = record.timestamp && record.timestamp.toDate ? record.timestamp.toDate() : record.timestamp;
                    const date = new Date(ts).toDateString();
                    if (!dateGroups[date]) {
                        dateGroups[date] = {
                            present: new Set(),
                            absent: new Set(),
                            late: new Set(),
                            clinic: new Set()
                        };
                    }

                    const group = dateGroups[date];
                    
                    if (record.status === 'present') {
                        group.present.add(record.studentId);
                    } else if (record.status === 'late') {
                        group.late.add(record.studentId);
                    } else if (record.status === 'in_clinic') {
                        group.clinic.add(record.studentId);
                    }
                }
            });

            // Fill in missing dates and calculate percentages
            const labels = [];
            const presentData = [];
            const absentData = [];
            const lateData = [];
            const clinicData = [];

            const currentDate = new Date(startDate);
            const end = new Date(endDate);

            // Normalize dates to midnight for comparison
            currentDate.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);

            while (currentDate <= end) {
                const dateString = currentDate.toDateString();
                const group = dateGroups[dateString] || {
                    present: new Set(),
                    absent: new Set(),
                    late: new Set(),
                    clinic: new Set()
                };

                // Calculate expected attendance for this specific day based on level-specific school status
                let dailyExpectedAttendance = 0;
                let isGlobalSchoolDay = false;

                Object.keys(levelCounts).forEach(level => {
                    if (this.isSchoolDay(currentDate, level)) {
                        dailyExpectedAttendance += levelCounts[level];
                        isGlobalSchoolDay = true;
                    }
                });

                // If no levels have school, treat as non-school day
                const presentCount = isGlobalSchoolDay ? (group.present.size + group.late.size) : 0;
                
                // Absent = Expected - Present - Clinic
                // Ensure we don't get negative numbers
                const absentCount = isGlobalSchoolDay ? Math.max(0, dailyExpectedAttendance - presentCount - group.clinic.size) : 0;
                
                const labelBase = currentDate.toLocaleDateString('en-US', { 
                    weekday: 'short', 
                    month: 'short', 
                    day: 'numeric' 
                });
                labels.push(isGlobalSchoolDay ? labelBase : `${labelBase} (No School)`);
                
                presentData.push(presentCount);
                absentData.push(absentCount);
                lateData.push(isGlobalSchoolDay ? group.late.size : 0);
                clinicData.push(isGlobalSchoolDay ? group.clinic.size : 0);

                currentDate.setDate(currentDate.getDate() + 1);
            }

            return {
                labels,
                datasets: {
                    present: presentData,
                    absent: absentData,
                    late: lateData,
                    clinic: clinicData
                },
                totalStudents: totalActiveStudents
            };
        } catch (error) {
            console.error('Error getting attendance trend:', error);
            throw error;
        }
    },

    // Enhanced status distribution with real data
    async getStatusDistribution(startDate, endDate) {
        try {
            const [{ data: attendanceData }, { data: clinicData }, studentCountRes] = await Promise.all([
                window.supabaseClient
                    .from('attendance')
                    .select('student_id,status,timestamp,entry_type')
                    .gte('timestamp', startDate instanceof Date ? startDate.toISOString() : new Date(startDate).toISOString())
                    .lte('timestamp', endDate instanceof Date ? endDate.toISOString() : new Date(endDate).toISOString()),
                window.supabaseClient
                    .from('clinic_visits')
                    .select('student_id,timestamp,check_in')
                    .gte('timestamp', startDate instanceof Date ? startDate.toISOString() : new Date(startDate).toISOString())
                    .lte('timestamp', endDate instanceof Date ? endDate.toISOString() : new Date(endDate).toISOString())
                    .eq('check_in', true),
                window.supabaseClient
                    .from('students')
                    .select('id', { count: 'exact', head: true })
            ]);
            const totalStudents = studentCountRes.count || 0;
            const presentStudents = new Set();
            const lateStudents = new Set();
            const clinicStudents = new Set();
            (attendanceData || []).forEach(record => {
                const studentId = record.student_id || record.studentId;
                if (record.status === 'present') {
                    presentStudents.add(studentId);
                } else if (record.status === 'late') {
                    lateStudents.add(studentId);
                    presentStudents.add(studentId);
                }
            });
            (clinicData || []).forEach(visit => {
                const studentId = visit.student_id || visit.studentId;
                clinicStudents.add(studentId);
            });
            const presentCount = presentStudents.size;
            const lateCount = lateStudents.size;
            const clinicCount = clinicStudents.size;
            const absentCount = Math.max(0, totalStudents - presentCount - clinicCount);
            return {
                'Present': presentCount,
                'Late': lateCount,
                'Absent': absentCount,
                'In Clinic': clinicCount
            };
        } catch (error) {
            console.error('Error getting status distribution:', error);
            throw error;
        }
    },

    // Class-specific attendance trend (present, absent, late, clinic) per day
    async getClassAttendanceTrend(classId, startDate, endDate) {
        try {
            const startIso = startDate instanceof Date ? startDate.toISOString() : new Date(startDate).toISOString();
            const endIso = endDate instanceof Date ? endDate.toISOString() : new Date(endDate).toISOString();
            
            // Get class level for accurate school day checking
            const { data: classData } = await window.supabaseClient
                .from('classes')
                .select('level')
                .eq('id', classId)
                .single();
            const classLevel = classData?.level;

            // Ensure calendar data is loaded
            await this.fetchCalendarData();

            const [attendanceRes, clinicRes, studentCountRes] = await Promise.all([
                window.supabaseClient
                    .from('attendance')
                    .select('student_id,status,entry_type,timestamp')
                    .eq('class_id', classId)
                    .gte('timestamp', startIso)
                    .lte('timestamp', endIso),
                window.supabaseClient
                    .from('clinic_visits')
                    .select('student_id,timestamp,check_in')
                    .eq('class_id', classId)
                    .eq('check_in', true)
                    .gte('timestamp', startIso)
                    .lte('timestamp', endIso),
                window.supabaseClient
                    .from('students')
                    .select('id', { count: 'exact', head: true })
                    .eq('class_id', classId)
                    .eq('is_active', true)
            ]);
            if (attendanceRes.error) throw attendanceRes.error;
            if (clinicRes.error) throw clinicRes.error;
            if (studentCountRes.error) throw studentCountRes.error;

            const totalStudents = studentCountRes.count || 0;
            const dateGroups = {};
            (attendanceRes.data || []).forEach(row => {
                if (!row.timestamp) return;
                const ts = row.timestamp && row.timestamp.toDate ? row.timestamp.toDate() : row.timestamp;
                const dateKey = new Date(ts).toDateString();
                if (!dateGroups[dateKey]) {
                    dateGroups[dateKey] = {
                        present: new Set(),
                        late: new Set(),
                        clinic: new Set()
                    };
                }
                const studentId = row.student_id || row.studentId;
                if (!studentId) return;
                if (row.entry_type === 'entry') {
                    if (row.status === 'late') {
                        dateGroups[dateKey].late.add(studentId);
                    } else if (row.status === 'present') {
                        dateGroups[dateKey].present.add(studentId);
                    }
                }
            });
            (clinicRes.data || []).forEach(row => {
                if (!row.timestamp) return;
                const ts = row.timestamp && row.timestamp.toDate ? row.timestamp.toDate() : row.timestamp;
                const dateKey = new Date(ts).toDateString();
                if (!dateGroups[dateKey]) {
                    dateGroups[dateKey] = {
                        present: new Set(),
                        late: new Set(),
                        clinic: new Set()
                    };
                }
                const studentId = row.student_id || row.studentId;
                if (!studentId) return;
                dateGroups[dateKey].clinic.add(studentId);
            });

            const labels = [];
            const presentData = [];
            const absentData = [];
            const lateData = [];
            const clinicData = [];

            const current = startDate instanceof Date ? new Date(startDate) : new Date(startDate);
            const end = endDate instanceof Date ? new Date(endDate) : new Date(endDate);
            
            // Normalize dates
            current.setHours(0,0,0,0);
            end.setHours(23,59,59,999);

            while (current <= end) {
                const key = current.toDateString();
                const group = dateGroups[key] || { present: new Set(), late: new Set(), clinic: new Set() };
                
                // Use level-specific school day check
                const isSchoolDay = this.isSchoolDay(current, classLevel);
                
                const presentCount = isSchoolDay ? (group.present.size + group.late.size) : 0;
                const absentCount = isSchoolDay ? Math.max(0, totalStudents - presentCount - group.clinic.size) : 0;
                const labelBase = current.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                labels.push(isSchoolDay ? labelBase : `${labelBase} (No School)`);
                presentData.push(presentCount);
                absentData.push(absentCount);
                lateData.push(isSchoolDay ? group.late.size : 0);
                clinicData.push(isSchoolDay ? group.clinic.size : 0);
                current.setDate(current.getDate() + 1);
            }

            return {
                labels,
                datasets: { present: presentData, absent: absentData, late: lateData, clinic: clinicData },
                totalStudents
            };
        } catch (error) {
            console.error('Error getting class attendance trend:', error);
            throw error;
        }
    },

    // Top late students in class over a period
    async getClassLateLeaders(classId, startDate, endDate, limit = 5) {
        try {
            const startIso = startDate instanceof Date ? startDate.toISOString() : new Date(startDate).toISOString();
            const endIso = endDate instanceof Date ? endDate.toISOString() : new Date(endDate).toISOString();
            const { data: attendance, error } = await window.supabaseClient
                .from('attendance')
                .select('student_id,status,entry_type,timestamp')
                .eq('class_id', classId)
                .gte('timestamp', startIso)
                .lte('timestamp', endIso)
                .eq('entry_type', 'entry');
            if (error) {
                throw error;
            }

            const counts = new Map();
            (attendance || []).forEach(r => {
                const studentId = r.student_id;
                if (!studentId) return;
                if (r.status === 'late') {
                    counts.set(studentId, (counts.get(studentId) || 0) + 1);
                }
            });

            const ids = Array.from(counts.keys());
            let namesById = {};
            if (ids.length > 0) {
                const { data: students, error: studentErr } = await window.supabaseClient
                    .from('students')
                    .select('id,full_name,name')
                    .in('id', ids);
                if (studentErr) {
                    throw studentErr;
                }
                (students || []).forEach(s => {
                    const name = s.full_name || s.name || s.id;
                    namesById[s.id] = name;
                });
            }

            const result = [];
            for (const [studentId, lateCount] of counts.entries()) {
                result.push({ studentId, studentName: namesById[studentId] || studentId, lateCount });
            }
            result.sort((a, b) => b.lateCount - a.lateCount);
            return result.slice(0, limit);
        } catch (error) {
            console.error('Error getting class late leaders:', error);
            return [];
        }
    },

    async getClassStatusDistribution(classId, startDate, endDate) {
        try {
            const startIso = startDate instanceof Date ? startDate.toISOString() : new Date(startDate).toISOString();
            const endIso = endDate instanceof Date ? endDate.toISOString() : new Date(endDate).toISOString();
            const [attendanceRes, clinicRes, studentCountRes] = await Promise.all([
                window.supabaseClient
                    .from('attendance')
                    .select('student_id,status,entry_type,timestamp')
                    .eq('class_id', classId)
                    .gte('timestamp', startIso)
                    .lte('timestamp', endIso),
                window.supabaseClient
                    .from('clinic_visits')
                    .select('student_id,timestamp,check_in')
                    .eq('class_id', classId)
                    .eq('check_in', true)
                    .gte('timestamp', startIso)
                    .lte('timestamp', endIso),
                window.supabaseClient
                    .from('students')
                    .select('id', { count: 'exact', head: true })
                    .eq('class_id', classId)
                    .eq('is_active', true)
            ]);
            if (attendanceRes.error) throw attendanceRes.error;
            if (clinicRes.error) throw clinicRes.error;
            if (studentCountRes.error) throw studentCountRes.error;

            const totalStudents = studentCountRes.count || 0;
            const presentSet = new Set();
            const lateSet = new Set();
            const clinicSet = new Set();

            (attendanceRes.data || []).forEach(r => {
                if (r.entry_type === 'entry') {
                    const studentId = r.student_id;
                    if (!studentId) return;
                    if (r.status === 'late') lateSet.add(studentId);
                    if (r.status === 'present') presentSet.add(studentId);
                }
            });
            (clinicRes.data || []).forEach(v => {
                const studentId = v.student_id;
                if (studentId) clinicSet.add(studentId);
            });

            const presentCount = presentSet.size + lateSet.size;
            const absentCount = Math.max(0, totalStudents - presentCount - clinicSet.size);

            return {
                present: presentCount,
                late: lateSet.size,
                absent: absentCount,
                clinic: clinicSet.size,
                totalStudents
            };
        } catch (error) {
            console.error('Error getting class status distribution:', error);
            throw error;
        }
    },

    async getClassWeeklyHeatmap(classId, startDate) {
        try {
            const start = startDate instanceof Date ? new Date(startDate) : new Date(startDate);
            const endDate = new Date(start);
            endDate.setDate(endDate.getDate() + 6);
            const startIso = start.toISOString();
            const endIso = endDate.toISOString();

            const [studentsRes, attendanceRes] = await Promise.all([
                window.supabaseClient
                    .from('students')
                    .select('id,full_name')
                    .eq('class_id', classId)
                    .eq('is_active', true),
                window.supabaseClient
                    .from('attendance')
                    .select('student_id,status,entry_type,timestamp')
                    .eq('class_id', classId)
                    .gte('timestamp', startIso)
                    .lte('timestamp', endIso)
            ]);
            if (studentsRes.error) throw studentsRes.error;
            if (attendanceRes.error) throw attendanceRes.error;

            const students = (studentsRes.data || []).map(s => ({
                id: s.id,
                name: s.full_name || s.name || s.id
            }));

            const grid = new Map();
            (attendanceRes.data || []).forEach(r => {
                if (!r.timestamp || r.entry_type !== 'entry') return;
                const ts = new Date(r.timestamp);
                const dayKey = ts.toDateString();
                const studentId = r.student_id;
                if (!studentId) return;
                const cur = grid.get(studentId) || {};
                cur[dayKey] = r.status;
                grid.set(studentId, cur);
            });

            const days = [];
            const cursor = new Date(start);
            while (days.length < 7) {
                days.push({ key: cursor.toDateString(), label: cursor.toLocaleDateString('en-US', { weekday: 'short' }) });
                cursor.setDate(cursor.getDate() + 1);
            }

            const rows = students.map(s => {
                const row = { studentId: s.id, studentName: s.name, cells: [] };
                days.forEach(d => {
                    const status = grid.get(s.id)?.[d.key] || (this.isSchoolDay(new Date(d.key)) ? 'absent' : 'none');
                    row.cells.push(status);
                });
                return row;
            });

            return { days, rows };
        } catch (error) {
            console.error('Error getting class weekly heatmap:', error);
            throw error;
        }
    },

    async computeAttendanceRisk(studentId, startDate, endDate) {
        try {
            const startIso = startDate instanceof Date ? startDate.toISOString() : new Date(startDate).toISOString();
            const endIso = endDate instanceof Date ? endDate.toISOString() : new Date(endDate).toISOString();
            
            const { data: attendance, error } = await window.supabaseClient
                .from('attendance')
                .select('student_id,status,entry_type,timestamp')
                .eq('student_id', studentId)
                .gte('timestamp', startIso)
                .lte('timestamp', endIso);

            if (error) throw error;

            const days = new Map(); // dateKey -> {present:boolean, late:boolean, clinic:boolean}
            (attendance || []).forEach(r => {
                if (!r.timestamp || r.entry_type !== 'entry') return;
                const ts = new Date(r.timestamp);
                const key = ts.toDateString();
                const d = days.get(key) || { present: false, late: false, clinic: false };
                if (r.status === 'late') d.late = true;
                if (r.status === 'present' || r.status === 'late') d.present = true;
                days.set(key, d);
            });

            let lateDays = 0;
            let presentDays = 0;
            let absentDays = 0;
            const cursor = new Date(startDate);
            while (cursor <= endDate) {
                if (this.isSchoolDay(cursor)) {
                    const key = cursor.toDateString();
                    const info = days.get(key);
                    if (!info || (!info.present)) {
                        absentDays++;
                    } else {
                        presentDays++;
                        if (info.late) lateDays++;
                    }
                }
                cursor.setDate(cursor.getDate() + 1);
            }

            const riskScore = absentDays * 2 + lateDays;
            const severity = riskScore >= 4 || absentDays >= 2 ? 'critical' : (riskScore >= 2 ? 'warning' : 'normal');
            const reasons = [];
            if (absentDays >= 2) reasons.push(`${absentDays} absences`);
            if (lateDays >= 3) reasons.push(`${lateDays} lates`);

            return { studentId, absentDays, lateDays, presentDays, riskScore, severity, reasons };
        } catch (error) {
            console.error('Error computing attendance risk:', error);
            return { studentId, absentDays: 0, lateDays: 0, presentDays: 0, riskScore: 0, severity: 'normal', reasons: [] };
        }
    },

    async getAtRiskStudentsReport({ classId = null, startDate, endDate, limit = 10 } = {}) {
        try {
            const startIso = startDate instanceof Date ? startDate.toISOString() : new Date(startDate).toISOString();
            const endIso = endDate instanceof Date ? endDate.toISOString() : new Date(endDate).toISOString();
            
            const [{ data: students }, { data: attendance }] = await Promise.all([
                window.supabaseClient
                    .from('students')
                    .select('id,full_name,class_id,name'),
                window.supabaseClient
                    .from('attendance')
                    .select('student_id,class_id,status,entry_type,timestamp')
                    .gte('timestamp', startIso)
                    .lte('timestamp', endIso)
            ]);

            const filteredStudents = (students || []).filter(s => !classId || s.class_id === classId);
            const perStudentDays = new Map();

            (attendance || []).forEach(r => {
                if (!r.timestamp || r.entry_type !== 'entry') return;
                const ts = new Date(r.timestamp);
                const key = ts.toDateString();
                const studentId = r.student_id;
                
                const map = perStudentDays.get(studentId) || new Map();
                const info = map.get(key) || { present: false, late: false };
                if (r.status === 'late') info.late = true;
                if (r.status === 'present' || r.status === 'late') info.present = true;
                map.set(key, info);
                perStudentDays.set(studentId, map);
            });

            const start = startDate instanceof Date ? startDate : new Date(startDate);
            const end = endDate instanceof Date ? endDate : new Date(endDate);
            const risks = [];

            for (const s of filteredStudents) {
                let lateDays = 0, presentDays = 0, absentDays = 0;
                const map = perStudentDays.get(s.id) || new Map();
                const cursor = new Date(start);
                while (cursor <= end) {
                    if (this.isSchoolDay(cursor)) {
                        const info = map.get(cursor.toDateString());
                        if (!info || !info.present) {
                            absentDays++;
                        } else {
                            presentDays++;
                            if (info.late) lateDays++;
                        }
                    }
                    cursor.setDate(cursor.getDate() + 1);
                }

                const riskScore = absentDays * 2 + lateDays;
                const severity = riskScore >= 4 || absentDays >= 2 ? 'critical' : (riskScore >= 2 ? 'warning' : 'normal');
                const reasons = [];
                if (absentDays >= 2) reasons.push(`${absentDays} absences`);
                if (lateDays >= 3) reasons.push(`${lateDays} lates`);

                if (severity !== 'normal') {
                    const name = s.full_name || s.name || s.id;
                    risks.push({ studentId: s.id, studentName: name, class_id: s.class_id, absentDays, lateDays, riskScore, severity, reasons });
                }
            }
            risks.sort((a, b) => b.riskScore - a.riskScore);
            return risks.slice(0, limit);
        } catch (error) {
            console.error('Error building at-risk students report:', error);
            return [];
        }
    },

    async validateClinicVisit(visitId, status = 'approved', teacherNotes = '') {
        try {
            const teacher = this.currentUser || {};
            const updateData = {
                teacherValidationStatus: status,
                validatedBy: teacher.id || 'teacher',
                validatedByName: teacher.name || 'Teacher',
                validationNotes: teacherNotes || '',
                validatedAt: new Date().toISOString()
            };

            const { data: visit, error: vErr } = await window.supabaseClient
                .from('clinic_visits')
                .select('studentId, studentName')
                .eq('id', visitId)
                .single();
            
            if (vErr || !visit) throw new Error('Visit not found');

            const { error: upErr } = await window.supabaseClient
                .from('clinic_visits')
                .update(updateData)
                .eq('id', visitId);
            
            if (upErr) throw upErr;

            const target_users = [];
            if (visit.studentId) {
                const { data: student } = await window.supabaseClient
                    .from('students')
                    .select('parent_id')
                    .eq('id', visit.studentId)
                    .single();
                
                if (student && student.parent_id) target_users.push(student.parent_id);
            }

            const title = status === 'approved' ? 'Clinic Visit Validated' : 'Clinic Visit Validation Rejected';
            const message = status === 'approved'
                ? `${visit.studentName} clinic visit validated by teacher.`
                : `${visit.studentName} clinic visit rejected by teacher.${teacherNotes ? ' Notes: ' + teacherNotes : ''}`;

            await this.createNotification({
                type: 'clinic',
                title,
                message,
                target_users,
                studentId: visit.studentId,
                studentName: visit.studentName,
                relatedRecord: visitId
            });
            return true;
        } catch (error) {
            console.error('Error validating clinic visit:', error);
            throw error;
        }
    },

    async getClinicReasonTrend(startDate, endDate, top = 6) {
        try {
            const ignore = new Set([
                'check_in','check-in','qr code check-in','quick checkout','checkout','check-out','return to class','validation','teacher validation','approved','rejected'
            ]);
            const normalize = (str) => {
                const s = (str || '').toLowerCase().trim();
                if (!s || ignore.has(s)) return null;
                const map = {
                    'stomach ache': 'Stomach Ache',
                    'stomachache': 'Stomach Ache',
                    'abdominal pain': 'Stomach Ache',
                    'headache': 'Headache',
                    'migraine': 'Headache',
                    'fever': 'Fever',
                    'high fever': 'Fever',
                    'cough': 'Cough',
                    'cold': 'Cold',
                    'flu': 'Flu',
                    'injury': 'Injury',
                    'wound': 'Injury',
                    'toothache': 'Toothache',
                    'dizziness': 'Dizziness',
                    'nausea': 'Nausea'
                };
                return map[s] || s.replace(/(^\w|\s\w)/g, (m) => m.toUpperCase());
            };
            
            const counts = new Map();

            const { data, error } = await window.supabaseClient
                .from('clinic_visits')
                .select('reason')
                .gte('timestamp', startDate.toISOString())
                .lte('timestamp', endDate.toISOString())
                .eq('check_in', true);
            
            if (error) throw error;
            
            (data || []).forEach(r => {
                const label = normalize(r.reason);
                if (!label) return;
                counts.set(label, (counts.get(label) || 0) + 1);
            });

            const arr = Array.from(counts.entries()).map(([label, count]) => ({ label, count }));
            arr.sort((a, b) => b.count - a.count);
            const topArr = arr.slice(0, top);
            return { labels: topArr.map(x => x.label), counts: topArr.map(x => x.count) };
        } catch (error) {
            console.error('Error getting clinic reason trend:', error);
            return { labels: [], counts: [] };
        }
    },

    async getClassClinicReasonTrend(classId, startDate, endDate, top = 6) {
        try {
            const ignore = new Set([
                'check_in','check-in','qr code check-in','quick checkout','checkout','check-out','return to class','validation','teacher validation','approved','rejected'
            ]);
            const normalize = (str) => {
                const s = (str || '').toLowerCase().trim();
                if (!s || ignore.has(s)) return null;
                const map = {
                    'stomach ache': 'Stomach Ache',
                    'stomachache': 'Stomach Ache',
                    'abdominal pain': 'Stomach Ache',
                    'headache': 'Headache',
                    'migraine': 'Headache',
                    'fever': 'Fever',
                    'high fever': 'Fever',
                    'cough': 'Cough',
                    'cold': 'Cold',
                    'flu': 'Flu',
                    'injury': 'Injury',
                    'wound': 'Injury',
                    'toothache': 'Toothache',
                    'dizziness': 'Dizziness',
                    'nausea': 'Nausea'
                };
                return map[s] || s.replace(/(^\w|\s\w)/g, (m) => m.toUpperCase());
            };

            const counts = new Map();

            const { data, error } = await window.supabaseClient
                .from('clinic_visits')
                .select('reason')
                .eq('class_id', classId)
                .gte('timestamp', startDate.toISOString())
                .lte('timestamp', endDate.toISOString())
                .eq('check_in', true);
            
            if (error) throw error;
            
            (data || []).forEach(r => {
                const label = normalize(r.reason);
                if (!label) return;
                counts.set(label, (counts.get(label) || 0) + 1);
            });

            const arr = Array.from(counts.entries()).map(([label, count]) => ({ label, count }));
            arr.sort((a, b) => b.count - a.count);
            const topArr = arr.slice(0, top);
            return { labels: topArr.map(x => x.label), counts: topArr.map(x => x.count) };
        } catch (error) {
            console.error('Error getting class clinic reason trend:', error);
            return { labels: [], counts: [] };
        }
    },

    async getAbsenceReasonTrend(startDate, endDate, top = 6) {
        try {
            const counts = new Map();
            
            const { data, error } = await window.supabaseClient
                .from('excuse_letters')
                .select('reason')
                .gte('submitted_at', startDate.toISOString())
                .lte('submitted_at', endDate.toISOString())
                .eq('type', 'absence');
            
            if (error) throw error;
            
            (data || []).forEach(r => {
                if (r.reason) counts.set(r.reason, (counts.get(r.reason) || 0) + 1);
            });

            const arr = Array.from(counts.entries()).map(([label, count]) => ({ label, count }));
            arr.sort((a, b) => b.count - a.count);
            const topArr = arr.slice(0, top);
            return { labels: topArr.map(x => x.label), counts: topArr.map(x => x.count) };
        } catch (error) {
            console.error('Error getting absence reason trend:', error);
            return { labels: [], counts: [] };
        }
    },

    async getExcusedVsUnexcusedAbsences(startDate, endDate) {
        try {
            let approved = 0, rejected = 0, pending = 0;

            const { data, error } = await window.supabaseClient
                .from('excuse_letters')
                .select('status')
                .gte('submitted_at', startDate.toISOString())
                .lte('submitted_at', endDate.toISOString())
                .eq('type', 'absence');
            
            if (error) throw error;
            
            (data || []).forEach(r => {
                const s = r.status;
                if (s === 'approved') approved++;
                else if (s === 'rejected') rejected++;
                else pending++;
            });
            return { approved, rejected, pending };
        } catch (error) {
            console.error('Error getting excused vs unexcused:', error);
            return { approved: 0, rejected: 0, pending: 0 };
        }
    },

    async getClinicReasonDetails({ startDate, endDate, reason, classId = null, limit = 100 }) {
        try {
            let query = window.supabaseClient
                .from('clinic_visits')
                .select('*')
                .gte('timestamp', startDate.toISOString())
                .lte('timestamp', endDate.toISOString())
                .eq('reason', reason);
            
            if (classId) {
                query = query.eq('class_id', classId);
            }
            
            const { data: visits, error } = await query
                .order('timestamp', { ascending: false })
                .limit(limit);
                
            if (error) throw error;
            
            const studentIds = Array.from(new Set(visits.map(v => v.student_id || v.studentId).filter(Boolean)));
            const students = {};
            
            if (studentIds.length > 0) {
                const { data: studentData, error: sErr } = await window.supabaseClient
                    .from('students')
                    .select('id, class_id, grade')
                    .in('id', studentIds);
                    
                if (!sErr && studentData) {
                    studentData.forEach(s => {
                        students[s.id] = s;
                    });
                }
            }
            
            return visits.map(v => {
                const sId = v.student_id || v.studentId;
                return {
                    id: v.id,
                    studentId: sId,
                    studentName: v.student_name || v.studentName,
                    classId: v.class_id || (students[sId]?.class_id || null),
                    grade: students[sId]?.grade || null,
                    reason: v.reason || '',
                    notes: v.notes || '',
                    teacherValidationStatus: v.teacherValidationStatus || 'pending',
                    validatedByName: v.validatedByName || '',
                    timestamp: v.timestamp ? new Date(v.timestamp) : null
                };
            });
        } catch (error) {
            console.error('Error getting clinic reason details:', error);
            return [];
        }
    },

    async getAbsenceReasonDetails({ startDate, endDate, reason, status = null, limit = 100 }) {
        try {
            let query = window.supabaseClient
                .from('excuse_letters')
                .select('*')
                .gte('submitted_at', startDate.toISOString())
                .lte('submitted_at', endDate.toISOString())
                .eq('type', 'absence')
                .eq('reason', reason);
            
            if (status) {
                query = query.eq('status', status);
            }
            
            const { data: letters, error } = await query
                .order('submitted_at', { ascending: false })
                .limit(limit);
                
            if (error) throw error;
            
            const studentIds = Array.from(new Set(letters.map(l => l.studentId).filter(Boolean)));
            const students = {};
            
            if (studentIds.length > 0) {
                const { data: studentData, error: sErr } = await window.supabaseClient
                    .from('students')
                    .select('id, class_id, grade')
                    .in('id', studentIds);
                    
                if (!sErr && studentData) {
                    studentData.forEach(s => {
                        students[s.id] = s;
                    });
                }
            }
            
            return letters.map(l => ({
                id: l.id,
                studentId: l.studentId,
                studentName: l.studentName,
                classId: students[l.studentId]?.class_id || null,
                grade: students[l.studentId]?.grade || null,
                reason: l.reason || '',
                status: l.status || 'pending',
                submitted_at: l.submitted_at ? new Date(l.submitted_at) : null
            }));
        } catch (error) {
            console.error('Error getting absence reason details:', error);
            return [];
        }
    },

    async getRelevantTeachersForStudent(student) {
        try {
            const ids = [];
            const studentClassId = student.classId || student.class_id;

            if (studentClassId) {
                // Get class data (adviser and subjects)
                const { data: classData, error: classError } = await window.supabaseClient
                    .from('classes')
                    .select('adviser_id, subjects')
                    .eq('id', studentClassId)
                    .single();
                
                if (!classError && classData) {
                    if (classData.adviser_id) {
                        ids.push(classData.adviser_id);
                    }
                    
                    const subjects = classData.subjects || [];
                    // Subject teachers lookup temporarily disabled pending schema update
                }
            }
            return Array.from(new Set(ids));
        } catch (error) {
            console.error('Error getting relevant teachers:', error);
            return [];
        }
    },

    // Enhanced grade level attendance with real data
    async getGradeLevelAttendance(startDate, endDate) {
        try {
            const [students, attendanceData] = await Promise.all([
                this.getStudents(),
                this.getAttendanceReport(startDate, endDate, 1000)
            ]);

            const gradeLevels = [...new Set(students.map(student => student.grade))].sort();
            const gradeAttendance = {};

            gradeLevels.forEach(grade => {
                const gradeStudents = students.filter(student => student.grade === grade);
                const gradeStudentIds = new Set(gradeStudents.map(student => student.id));
                
                const gradeAttendanceRecords = attendanceData.filter(record => 
                    gradeStudentIds.has(record.studentId) && 
                    (record.status === 'present' || record.status === 'late')
                );
                
                const uniqueStudentsPresent = new Set(gradeAttendanceRecords.map(record => record.studentId)).size;
                const attendanceRate = gradeStudents.length > 0 ? 
                    Math.round((uniqueStudentsPresent / gradeStudents.length) * 100) : 0;
                
                gradeAttendance[grade] = {
                    rate: attendanceRate,
                    total: gradeStudents.length,
                    present: uniqueStudentsPresent,
                    absent: gradeStudents.length - uniqueStudentsPresent
                };
            });

            return gradeAttendance;
        } catch (error) {
            console.error('Error getting grade level attendance:', error);
            throw error;
        }
    },

    // Enhanced daily pattern with real data
    async getDailyPattern(startDate, endDate) {
        try {
            const attendanceData = await this.getAttendanceReport(startDate, endDate, 2000);
            
            const hourGroups = {};
            
            // Initialize hours from 6 AM to 6 PM
            for (let i = 6; i <= 18; i++) {
                const hourLabel = i <= 11 ? `${i} AM` : i === 12 ? '12 PM' : `${i - 12} PM`;
                hourGroups[hourLabel] = { entries: 0, exits: 0 };
            }
            
            // Count entries and exits by hour
            attendanceData.forEach(record => {
                if (record.timestamp && record.time) {
                    const hour = parseInt(record.time.split(':')[0]);
                    let hourLabel;
                    
                    if (hour < 12) {
                        hourLabel = `${hour} AM`;
                    } else if (hour === 12) {
                        hourLabel = '12 PM';
                    } else {
                        hourLabel = `${hour - 12} PM`;
                    }

                    if (hourGroups[hourLabel]) {
                        if (record.entry_type === 'entry') {
                            hourGroups[hourLabel].entries++;
                        } else if (record.entry_type === 'exit') {
                            hourGroups[hourLabel].exits++;
                        }
                    }
                }
            });

            const hours = Object.keys(hourGroups);
            const entries = hours.map(hour => hourGroups[hour].entries);
            const exits = hours.map(hour => hourGroups[hour].exits);

            return {
                hours,
                entries,
                exits
            };
        } catch (error) {
            console.error('Error getting daily pattern:', error);
            throw error;
        }
    },

    // Analytics functions for charts (legacy - kept for backward compatibility)
    async getAttendanceTrendLegacy(startDate, endDate, interval = 'day') {
        try {
            // Get actual attendance data grouped by date
            const attendanceData = await this.getAttendanceReport(startDate, endDate, 1000);
            
            // Group by date and calculate percentages
            const dateGroups = {};
            attendanceData.forEach(record => {
                if (record.timestamp) {
                    const date = record.timestamp.toDate().toDateString();
                    if (!dateGroups[date]) {
                        dateGroups[date] = { present: 0, total: 0 };
                    }
                    dateGroups[date].total++;
                    if (record.status === 'present' || record.status === 'late') {
                        dateGroups[date].present++;
                    }
                }
            });

            const labels = Object.keys(dateGroups);
            const present = labels.map(date => {
                const group = dateGroups[date];
                return group.total > 0 ? Math.round((group.present / group.total) * 100) : 0;
            });
            const absent = labels.map(date => {
                const group = dateGroups[date];
                return group.total > 0 ? 100 - Math.round((group.present / group.total) * 100) : 0;
            });

            return {
                labels: labels,
                present: present,
                absent: absent
            };
        } catch (error) {
            console.error('Error getting attendance trend:', error);
            throw error;
        }
    },

    async getStatusDistributionLegacy(startDate, endDate) {
        try {
            // Get counts for each status
            const [presentCount, absentCount, lateCount, clinicCount] = await Promise.all([
                this.getCollectionCount('attendance', [
                    ['timestamp', '>=', startDate],
                    ['timestamp', '<=', endDate],
                    ['status', '==', 'present']
                ]),
                this.getCollectionCount('attendance', [
                    ['timestamp', '>=', startDate],
                    ['timestamp', '<=', endDate],
                    ['status', '==', 'absent']
                ]),
                this.getCollectionCount('attendance', [
                    ['timestamp', '>=', startDate],
                    ['timestamp', '<=', endDate],
                    ['status', '==', 'late']
                ]),
                this.getCollectionCount('clinic_visits', [
                    ['timestamp', '>=', startDate],
                    ['timestamp', '<=', endDate],
                    ['check_in', '==', true]
                ])
            ]);

            return {
                'Present': presentCount,
                'Absent': absentCount,
                'Late': lateCount,
                'In Clinic': clinicCount
            };
        } catch (error) {
            console.error('Error getting status distribution:', error);
            throw error;
        }
    },

    async getGradeLevelAttendanceLegacy(startDate, endDate) {
        try {
            // Get all students with their grade levels
            const students = await this.getStudents();
            const gradeLevels = [...new Set(students.map(student => student.grade))];
            
            // Get attendance data for the period
            const attendanceData = await this.getAttendanceReport(startDate, endDate, 1000);
            
            // Calculate attendance rate by grade level
            const gradeAttendance = {};
            
            gradeLevels.forEach(grade => {
                const gradeStudents = students.filter(student => student.grade === grade);
                const gradeStudentIds = gradeStudents.map(student => student.id);
                
                const gradeAttendanceRecords = attendanceData.filter(record => 
                    gradeStudentIds.includes(record.studentId) && 
                    (record.status === 'present' || record.status === 'late')
                );
                
                const uniqueStudentsPresent = new Set(gradeAttendanceRecords.map(record => record.studentId)).size;
                const attendanceRate = gradeStudents.length > 0 ? 
                    Math.round((uniqueStudentsPresent / gradeStudents.length) * 100) : 0;
                
                gradeAttendance[grade] = attendanceRate;
            });

            return gradeAttendance;
        } catch (error) {
            console.error('Error getting grade level attendance:', error);
            throw error;
        }
    },

    async getDailyPatternLegacy(startDate, endDate) {
        try {
            const attendanceData = await this.getAttendanceReport(startDate, endDate, 1000);
            
            const hourGroups = {};
            
            // Initialize hours
            for (let i = 7; i <= 16; i++) {
                const hourLabel = i <= 11 ? `${i} AM` : `${i - 12} PM`;
                hourGroups[hourLabel] = { entries: 0, exits: 0 };
            }
            
            // Count entries and exits by hour
            attendanceData.forEach(record => {
                if (record.timestamp && record.time) {
                    const hour = parseInt(record.time.split(':')[0]);
                    const hourLabel = hour <= 11 ? `${hour} AM` : `${hour - 12} PM`;
                    
                    if (hourGroups[hourLabel]) {
                        if (record.entry_type === 'entry') {
                            hourGroups[hourLabel].entries++;
                        } else if (record.entry_type === 'exit') {
                            hourGroups[hourLabel].exits++;
                        }
                    }
                }
            });

            const hours = Object.keys(hourGroups);
            const entries = hours.map(hour => hourGroups[hour].entries);
            const exits = hours.map(hour => hourGroups[hour].exits);

            return {
                hours: hours,
                entries: entries,
                exits: exits
            };
        } catch (error) {
            console.error('Error getting daily pattern:', error);
            throw error;
        }
    },

    // Export data function
    async exportData(exportType, startDate, endDate) {
        try {
            let data;
            
            switch (exportType) {
                case 'attendance':
                    data = await this.getAttendanceReport(startDate, endDate, 1000);
                    break;
                case 'clinic':
                    data = await this.getClinicReport(startDate, endDate, 1000);
                    break;
                case 'students':
                    data = await this.getStudentActivityReport(startDate, endDate, 1000);
                    break;
                case 'summary':
                    data = await this.getSystemStats();
                    break;
                case 'analytics':
                    data = await this.getAnalyticsData(startDate, endDate);
                    break;
                default:
                    throw new Error('Invalid export type');
            }

            return data;
        } catch (error) {
            console.error('Error exporting data:', error);
            throw error;
        }
    },

    // ==================== EVENT HANDLERS ====================

    // Event Handlers
    handleStudentStatusChange(student) {
        console.log('Student status changed:', student.name, student.currentStatus);
        
        // Dispatch custom event for UI to handle
        if (window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('educareTrack:studentStatusChange', {
                detail: { student }
            }));
        }
    },

    // ==================== CACHE MANAGEMENT ====================

    // Clear cache when needed
    clearCache() {
        dataCache.users = null;
        dataCache.students = null;
        dataCache.classes = null;
        dataCache.stats = null;
        dataCache.notifications = null;
        dataCache.lastUpdated = null;
        console.log('Cache cleared');
    },

    // ==================== UTILITY METHODS ====================

    // Shared date range management
    getSharedDateRange() {
        const savedRange = localStorage.getItem('educareTrack_dateRange');
        if (savedRange) {
            return JSON.parse(savedRange);
        }
        
        // Default: last 30 days
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        
        return {
            startDate: startDate,
            endDate: endDate,
            label: 'Last 30 Days'
        };
    },

    setSharedDateRange(startDate, endDate, label = 'Custom Range') {
        const dateRange = {
            startDate: startDate,
            endDate: endDate,
            label: label
        };
        
        localStorage.setItem('educareTrack_dateRange', JSON.stringify(dateRange));
        
        // Notify all pages about date range change
        if (window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('educareTrack:dateRangeChanged', {
                detail: dateRange
            }));
        }
    },

    // Loading state management
    showLoading() {
        // Dispatch event to show loading
        if (window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('educareTrack:showLoading'));
        }
    },

    hideLoading() {
        // Dispatch event to hide loading
        if (window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('educareTrack:hideLoading'));
        }
    },

    // Utility Methods
    isSchoolDay(date) {
        const d = new Date(date);
        const day = d.getDay();
        if (day === 0) return this.config.allowSundayClasses;
        if (day === 6) return this.config.allowSaturdayClasses;
        return true;
    },

    loadWeekendPolicy() {
        try {
            const saved = localStorage.getItem('educareTrack_weekend_policy');
            if (saved) {
                const p = JSON.parse(saved);
                if (typeof p.saturday === 'boolean') this.config.allowSaturdayClasses = p.saturday;
                if (typeof p.sunday === 'boolean') this.config.allowSundayClasses = p.sunday;
            }
        } catch (_) {}
    },

    setWeekendPolicy(policy) {
        this.config.allowSaturdayClasses = !!(policy && policy.saturday);
        this.config.allowSundayClasses = !!(policy && policy.sunday);
        try {
            localStorage.setItem('educareTrack_weekend_policy', JSON.stringify({
                saturday: this.config.allowSaturdayClasses,
                sunday: this.config.allowSundayClasses
            }));
        } catch (_) {}
        return { saturday: this.config.allowSaturdayClasses, sunday: this.config.allowSundayClasses };
    },

    getWeekendPolicy() {
        return { saturday: this.config.allowSaturdayClasses, sunday: this.config.allowSundayClasses };
    },
    formatDate(date) {
        if (!date) return 'N/A';
        try {
            return new Date(date).toLocaleDateString('en-PH', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch (error) {
            return 'Invalid Date';
        }
    },

    formatTime(date) {
        if (!date) return 'N/A';
        try {
            return new Date(date).toLocaleTimeString('en-PH', {
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            return 'Invalid Time';
        }
    },

    getStatusColor(status) {
        const colors = {
            [this.ATTENDANCE_STATUS.PRESENT]: 'status-present',
            [this.ATTENDANCE_STATUS.ABSENT]: 'status-absent',
            [this.ATTENDANCE_STATUS.LATE]: 'status-late',
            [this.ATTENDANCE_STATUS.IN_CLINIC]: 'status-clinic',
            'in_school': 'status-present',
            'out_school': 'status-absent',
            'in_clinic': 'status-clinic'
        };
        return colors[status] || 'status-absent';
    },

    getStatusText(status) {
        const texts = {
            [this.ATTENDANCE_STATUS.PRESENT]: 'Present',
            [this.ATTENDANCE_STATUS.ABSENT]: 'Absent',
            [this.ATTENDANCE_STATUS.LATE]: 'Late',
            [this.ATTENDANCE_STATUS.IN_CLINIC]: 'In Clinic',
            'in_school': 'Present',
            'out_school': 'Absent',
            'in_clinic': 'In Clinic'
        };
        return texts[status] || 'Unknown';
    },

    // User management helpers
    async getClassById(classId) {
        try {
            const { data, error } = await window.supabaseClient
                .from('classes')
                .select('*')
                .eq('id', classId)
                .single();
            if (error || !data) return null;
            return { id: data.id, ...data };
        } catch (error) {
            console.error('Error getting class:', error);
            return null;
        }
    },

    // Get student by ID
    async getStudentById(studentId) {
        try {
            const { data, error } = await window.supabaseClient
                .from('students')
                .select(`
                    *,
                    parent_students ( parent_id )
                `)
                .eq('id', studentId)
                .single();
            if (error || !data) return null;

            // Extract parent_id from the junction table
            const parentId = data.parent_students && data.parent_students.length > 0 
                ? data.parent_students[0].parent_id 
                : null;

            // Fetch class details if class_id exists
            let classInfo = null;
            if (data.class_id) {
                const { data: classData } = await window.supabaseClient
                    .from('classes')
                    .select('grade, strand')
                    .eq('id', data.class_id)
                    .single();
                classInfo = classData;
            }

            return { 
                ...data,
                id: data.id, 
                name: data.full_name, // Backward compatibility
                fullName: data.full_name,
                parent_id: parentId,
                parentId: parentId,
                grade: classInfo ? classInfo.grade : (data.level || ''),
                section: classInfo ? classInfo.section : '',
                strand: data.strand || (classInfo ? classInfo.strand : ''),
                level: classInfo ? classInfo.level : (data.level || '')
            };
        } catch (error) {
            console.error('Error getting student:', error);
            return null;
        }
    },

    // Cleanup
    destroy() {
        // Unsubscribe from real-time listeners
        if (this.notificationsListener) {
            this.notificationsListener();
        }
        
        // Clear cache
        this.clearCache();
        
        // Reset page title
        document.title = `${this.config.schoolName} - EducareTrack`;
        
        console.log('EducareTrack system destroyed');
    }
};

// Initialize the system when the script loads
document.addEventListener('DOMContentLoaded', function() {
    EducareTrack.init().then(success => {
        if (success) {
            console.log('EducareTrack Core System loaded successfully');
            
            // Dispatch system ready event
            if (window.dispatchEvent) {
                window.dispatchEvent(new CustomEvent('educareTrack:systemReady'));
            }
        } else {
            console.error('EducareTrack Core System failed to initialize');
        }
    });
});

// Make EducareTrack available globally
window.EducareTrack = EducareTrack;

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EducareTrack;
}

// Make EducareTrack available globally
window.EducareTrack = EducareTrack;

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EducareTrack;
}
