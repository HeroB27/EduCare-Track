// core.js - EducareTrack Central System Core
// OPTIMIZED VERSION for Fast Performance
// COMPLETE K-12 CURRICULUM SUPPORT WITH REPORTS & ANALYTICS

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
let storage = null;
if (typeof window !== 'undefined' && window.supabaseClient && typeof window.USE_SUPABASE === 'undefined') {
    window.USE_SUPABASE = true;
}

// Cache for frequently accessed data
const dataCache = {
    users: null,
    students: null,
    classes: null,
    stats: null,
    notifications: null,
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
        if (!this.currentUser) return;

        // Only notifications for now - other data loaded on demand
        if (window.USE_SUPABASE && window.supabaseClient) {
            // Supabase real-time subscription for notifications
            try {
                const channel = window.supabaseClient
                    .channel('notifications')
                    .on('postgres_changes', 
                        { 
                            event: '*', 
                            schema: 'public', 
                            table: 'notifications',
                            filter: `target_users=cs.{${this.currentUser.id}}`
                        }, 
                        (payload) => {
                            console.log('Notification change:', payload);
                            this.updateNotificationBadge();
                        }
                    )
                    .subscribe();
                this.notificationsListener = channel;
            } catch (error) {
                console.error('Error setting up Supabase notifications listener:', error);
            }
        } else {
            // Firebase fallback
            this.notificationsListener = db.collection('notifications')
                .where('target_users', 'array-contains', this.currentUser.id)
                .where('is_active', '==', true)
                .orderBy('created_at', 'desc')
                .limit(10)
                .onSnapshot(snapshot => {
                    if (!this.notificationsInitialized) {
                        this.notificationsInitialized = true;
                        this.updateNotificationBadge();
                        return;
                    }
                    const changes = snapshot.docChanges();
                    const newNotifications = [];
                    for (const change of changes) {
                        if (change.type === 'added') {
                            newNotifications.push({ id: change.doc.id, ...change.doc.data() });
                        }
                    }
                    if (newNotifications.length > 0) {
                        this.handleNewNotifications(newNotifications);
                    }
                });
        }
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
            if (window.USE_SUPABASE && window.supabaseClient) {
                const { data, error } = await window.supabaseClient
                    .from('profiles')
                    .select('id,username,full_name,role,phone,is_active,assigned_classes,assigned_subjects,class_id,is_homeroom')
                    .eq('role', this.USER_TYPES.TEACHER)
                    .contains('assigned_subjects', [subject])
                    .contains('assigned_classes', [classId])
                    .eq('is_active', true);
                if (error || !data) return [];
                return data.map(u => ({ id: u.id, ...u }));
            } else {
                const snapshot = await db.collection('users')
                    .where('role', '==', this.USER_TYPES.TEACHER)
                    .where('assigned_subjects', 'array-contains', subject)
                    .where('assigned_classes', 'array-contains', classId)
                    .where('is_active', '==', true)
                    .get();
                return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            }
        } catch (error) {
            console.error('Error getting subject teachers:', error);
            return [];
        }
    },

    // ==================== USER MANAGEMENT ====================

    async login(userId, role = null) {
        try {
            if (window.USE_SUPABASE && window.supabaseClient) {
                const { data, error } = await window.supabaseClient.from('profiles').select('*').eq('id', userId).single();
                if (error || !data) {
                    throw new Error('User not found');
                }
                if (role && data.role !== role) {
                    throw new Error(`User is not a ${role}`);
                }
                this.currentUser = { id: data.id, ...data };
                this.currentUserRole = data.role;
            } else {
                const userDoc = await db.collection('users').doc(userId).get();
                if (!userDoc.exists) {
                    throw new Error('User not found');
                }
                const userData = userDoc.data();
                if (role && userData.role !== role) {
                    throw new Error(`User is not a ${role}`);
                }
                this.currentUser = { id: userId, ...userData };
                this.currentUserRole = userData.role;
            }

            localStorage.setItem('educareTrack_user', JSON.stringify(this.currentUser));
            sessionStorage.setItem('educareTrack_user', JSON.stringify(this.currentUser));
            
            // Initialize notification permissions and listeners for new user
            if (this.config.enableNotificationPermissionPrompt) { await this.initializeNotificationPermissions(); }
            this.initEssentialListeners();

            console.log(`User logged in: ${this.currentUser.name || this.currentUser.email || this.currentUser.id}`);
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
        
        // Unsubscribe listeners - check if it exists and is a function
        if (this.notificationsListener && typeof this.notificationsListener === 'function') {
            try {
                this.notificationsListener();
            } catch (error) {
                console.warn('Error unsubscribing notifications listener:', error);
            }
        } else if (this.notificationsListener && typeof this.notificationsListener.unsubscribe === 'function') {
            // Handle Supabase subscription
            try {
                this.notificationsListener.unsubscribe();
            } catch (error) {
                console.warn('Error unsubscribing Supabase notifications listener:', error);
            }
        }
        
        // Reset notificationsListener
        this.notificationsListener = null;
        
        // Reset page title
        document.title = `${this.config.schoolName} - EducareTrack`;
        
        console.log('User logged out');
    },

    // ==================== DASHBOARD STATS ====================

    // Get dashboard statistics
    async getDashboardStats() {
        try {
            // Use Promise.all for parallel queries
            const [studentsCount, teachersCount, parentsCount, classesCount, todayCount] = await Promise.all([
                this.getCollectionCount('students'),
                this.getCollectionCount('users', [['role', '==', 'teacher'], ['is_active', '==', true]]),
                this.getCollectionCount('users', [['role', '==', 'parent'], ['is_active', '==', true]]),
                this.getCollectionCount('classes'),
                this.getTodayAttendanceCount()
            ]);

            const stats = {
                totalStudents: studentsCount,
                totalTeachers: teachersCount,
                totalParents: parentsCount,
                totalClasses: classesCount,
                presentToday: todayCount,
                attendanceRate: studentsCount > 0 ? Math.round((todayCount / studentsCount) * 100) : 0
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
            if (window.USE_SUPABASE && window.supabaseClient) {
                let builder = window.supabaseClient.from(collectionName).select('id', { count: 'exact', head: true });
                const apply = (field, op, val) => {
                    if (op === '==' || op === 'eq') {
                        builder = builder.eq(field, val);
                    }
                };
                const conds = Array.isArray(conditions) ? conditions : [];
                const effectiveConds = collectionName === 'students' ? conds.filter(c => c[0] !== 'is_active') : conds;
                effectiveConds.forEach(c => apply(c[0], c[1], c[2]));
                const { count, error } = await builder;
                if (error) return 0;
                return count || 0;
            } else {
                let query = db.collection(collectionName);
                conditions.forEach(condition => {
                    query = query.where(...condition);
                });
                const snapshot = await query.get();
                return snapshot.size;
            }
        } catch (error) {
            console.error(`Error counting ${collectionName}:`, error);
            return 0;
        }
    },

    // Fast: Get today's attendance count
    async getTodayAttendanceCount() {
        try {
            if (window.USE_SUPABASE && window.supabaseClient) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const { count, error } = await window.supabaseClient
                    .from('attendance')
                    .select('id', { count: 'exact', head: true })
                    .gte('timestamp', today.toISOString())
                    .eq('entry_type', 'entry');
                if (error) return 0;
                return count || 0;
            } else {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const snapshot = await db.collection('attendance')
                    .where('timestamp', '>=', today)
                    .where('entry_type', '==', 'entry')
                    .get();
                return snapshot.size;
            }
        } catch (error) {
            console.error('Error getting today attendance count:', error);
            return 0;
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
            const parentId = this.generateUserId('parent');
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
                console.warn('Photo upload skipped: Firebase Storage not available');
            }

            if (window.USE_SUPABASE && window.supabaseClient) {
                // Supabase implementation using sequential writes (manual transaction)
                
                // 1. Create Parent Profile
                const parentProfile = {
                    id: parentId,
                    role: 'parent',
                    full_name: parentData.name,
                    username: parentData.username,
                    password: parentData.password,
                    phone: parentData.phone,
                    photo_url: null,
                    is_active: true,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };

                const { error: profileError } = await window.supabaseClient
                    .from('profiles')
                    .insert([parentProfile]);

                if (profileError) throw new Error('Failed to create parent profile: ' + profileError.message);

                // 2. Create Parent record with additional details
                const parentRecord = {
                    id: parentId,
                    address: parentData.address,
                    occupation: parentData.occupation || '',
                    created_at: new Date().toISOString()
                };

                const { error: parentError } = await window.supabaseClient
                    .from('parents')
                    .insert([parentRecord]);

                if (parentError) throw new Error('Failed to create parent record: ' + parentError.message);

                // 2. Resolve/Create Class
                let resolvedClassId = studentData.classId || '';
                if (!resolvedClassId) {
                    try {
                        let className = studentData.grade;
                        if (studentData.level !== this.STUDENT_LEVELS.KINDERGARTEN && studentData.strand) {
                            className = `${studentData.grade} ${studentData.strand}`;
                        }
                        
                        // Check if class exists
                        const { data: existingClasses } = await window.supabaseClient
                            .from('classes')
                            .select('id')
                            .eq('name', className)
                            .limit(1);

                        if (existingClasses && existingClasses.length > 0) {
                            resolvedClassId = existingClasses[0].id;
                        } else {
                            // Create class
                            const clsSubjects = studentData.level === this.STUDENT_LEVELS.Senior_High_School && studentData.strand
                                ? this.getSubjectsForLevel(studentData.level, studentData.strand, studentData.grade)
                                : this.getSubjectsForLevel(studentData.level, null, studentData.grade);
                            
                            const newClass = {
                                name: className,
                                grade: studentData.grade,
                                level: studentData.level,
                                strand: studentData.strand || null,
                                subjects: clsSubjects,
                                is_active: true,
                                created_at: new Date().toISOString()
                                // created_by: this.currentUser.id
                            };
                            
                            const { data: createdClass, error: classError } = await window.supabaseClient
                                .from('classes')
                                .insert([newClass])
                                .select();
                                
                            if (!classError && createdClass && createdClass.length > 0) {
                                resolvedClassId = createdClass[0].id;
                            }
                        }
                    } catch (e) {
                        console.error('Error resolving class:', e);
                        resolvedClassId = '';
                    }
                }

                // 3. Create Student
                const studentDoc = {
                    id: studentId,
                    student_id: studentId, // snake_case
                    name: studentData.name,
                    lrn: studentData.lrn,
                    grade: studentData.grade,
                    level: studentData.level,
                    class_id: resolvedClassId, // snake_case
                    parent_id: parentId, // snake_case
                    photo_url: photoUrl, // snake_case
                    qr_code: studentId, // snake_case
                    address: parentData.address, // Inherit from parent
                    emergency_contact: parentData.emergencyContact || parentData.phone, // Inherit from parent
                    current_status: 'out_school',
                    is_active: true,
                    created_at: new Date().toISOString()
                    // created_by: this.currentUser.id // snake_case
                };

                // Add strand/subjects
                if (studentData.level === this.STUDENT_LEVELS.Senior_High_School) {
                    studentDoc.strand = studentData.strand;
                    studentDoc.subjects = this.getSubjectsForLevel(studentData.level, studentData.strand, studentData.grade);
                } else {
                    studentDoc.subjects = this.getSubjectsForLevel(studentData.level, null, studentData.grade);
                }

                const { error: studentError } = await window.supabaseClient
                    .from('students')
                    .insert([studentDoc]);

                if (studentError) {
                    // Rollback parent creation
                    await window.supabaseClient.from('profiles').delete().eq('id', parentId);
                    await window.supabaseClient.from('parents').delete().eq('id', parentId);
                    throw new Error('Failed to create student: ' + studentError.message);
                }

                // 4. Create parent-student relationship
                const { error: relationshipError } = await window.supabaseClient
                    .from('parent_students')
                    .insert([{
                        parent_id: parentId,
                        student_id: studentId,
                        relationship: parentData.relationship || 'parent'
                    }]);

                if (relationshipError) {
                    // Rollback on relationship error
                    await window.supabaseClient.from('profiles').delete().eq('id', parentId);
                    await window.supabaseClient.from('parents').delete().eq('id', parentId);
                    await window.supabaseClient.from('students').delete().eq('id', studentId);
                    throw new Error('Failed to create parent-student relationship: ' + relationshipError.message);
                }

                this.clearCache();
                console.log(`Student enrolled (Supabase): ${studentData.name}`);
                return { parentId, studentId };

            } else {
                // Firebase implementation
                // Batch write for atomic operations
                const batch = db.batch();

                // Parent document
                const parentRef = db.collection('users').doc(parentId);
                batch.set(parentRef, {
                    id: parentId,
                    name: parentData.name,
                    phone: parentData.phone,
                    address: parentData.address,
                    email: parentData.email || '',
                    role: 'parent',
                    relationship: parentData.relationship || 'parent',
                    emergencyContact: parentData.emergencyContact || parentData.phone,
                    children: [studentId],
                    username: parentData.username,
                    password: parentData.password,
                    is_active: true,
                    created_at: SupabaseFieldValue.serverTimestamp(),
                    createdBy: this.currentUser.id
                });

                let resolvedClassId = studentData.classId || '';
                if (!resolvedClassId) {
                    try {
                        let className = studentData.grade;
                        if (studentData.level !== this.STUDENT_LEVELS.KINDERGARTEN && studentData.strand) {
                            className = `${studentData.grade} ${studentData.strand}`;
                        }
                        let q = db.collection('classes').where('name', '==', className);
                        const snap = await q.get();
                        if (!snap.empty) {
                            resolvedClassId = snap.docs[0].id;
                        } else {
                            const base = studentData.grade.toLowerCase().replace(/\s+/g, '');
                            const slug = studentData.strand ? `${base}-${studentData.strand.toLowerCase()}` : base;
                            const doc = await db.collection('classes').doc(slug).get();
                            if (doc.exists) {
                                resolvedClassId = doc.id;
                            } else {
                                const clsSubjects = studentData.level === this.STUDENT_LEVELS.Senior_High_School && studentData.strand
                                    ? this.getSubjectsForLevel(studentData.level, studentData.strand, studentData.grade)
                                    : this.getSubjectsForLevel(studentData.level, null, studentData.grade);
                                const ref = await db.collection('classes').add({
                                    name: className,
                                    grade: studentData.grade,
                                    level: studentData.level,
                                    strand: studentData.strand || null,
                                    subjects: clsSubjects,
                                    is_active: true,
                                    created_at: SupabaseFieldValue.serverTimestamp(),
                                    createdBy: this.currentUser.id
                                });
                                resolvedClassId = ref.id;
                            }
                        }
                    } catch (e) {
                        resolvedClassId = '';
                    }
                }

                // Student document with curriculum data
                const studentRef = db.collection('students').doc(studentId);
                const studentDoc = {
                    id: studentId,
                    studentId: studentId,
                    name: studentData.name,
                    lrn: studentData.lrn,
                    grade: studentData.grade,
                    level: studentData.level,
                    class_id: resolvedClassId,
                    parent_id: parentId,
                    photo_url: photoUrl,
                    qrCode: studentId,
                    current_status: 'out_school',
                    is_active: true,
                    created_at: SupabaseFieldValue.serverTimestamp(),
                    createdBy: this.currentUser.id
                };

                // Add strand for Senior High students
                if (studentData.level === this.STUDENT_LEVELS.Senior_High_School) {
                    studentDoc.strand = studentData.strand;
                    studentDoc.subjects = this.getSubjectsForLevel(studentData.level, studentData.strand, studentData.grade);
                } else {
                    studentDoc.subjects = this.getSubjectsForLevel(studentData.level, null, studentData.grade);
                }

                batch.set(studentRef, studentDoc);

                await batch.commit();
                this.clearCache(); // Clear cache since data changed

                console.log(`Student enrolled: ${studentData.name} with ${studentDoc.subjects.length} subjects`);
                return { parentId, studentId };
            }
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

            if (window.USE_SUPABASE && window.supabaseClient) {
                // 1. Resolve/Create Class
                let resolvedClassId = studentData.classId || '';
                if (!resolvedClassId) {
                    try {
                        let className = studentData.grade;
                        if (studentData.level !== this.STUDENT_LEVELS.KINDERGARTEN && studentData.strand) {
                            className = `${studentData.grade} ${studentData.strand}`;
                        }
                        
                        const { data: existingClasses } = await window.supabaseClient
                            .from('classes')
                            .select('id')
                            .eq('name', className)
                            .limit(1);

                        if (existingClasses && existingClasses.length > 0) {
                            resolvedClassId = existingClasses[0].id;
                        } else {
                            const clsSubjects = studentData.level === this.STUDENT_LEVELS.Senior_High_School && studentData.strand
                                ? this.getSubjectsForLevel(studentData.level, studentData.strand, studentData.grade)
                                : this.getSubjectsForLevel(studentData.level, null, studentData.grade);
                            
                            const newClass = {
                                name: className,
                                grade: studentData.grade,
                                level: studentData.level,
                                strand: studentData.strand || null,
                                subjects: clsSubjects,
                                is_active: true,
                                created_at: new Date().toISOString()
                                // created_by: this.currentUser.id
                            };
                            
                            const { data: createdClass, error: classError } = await window.supabaseClient
                                .from('classes')
                                .insert([newClass])
                                .select();
                                
                            if (!classError && createdClass && createdClass.length > 0) {
                                resolvedClassId = createdClass[0].id;
                            }
                        }
                    } catch (e) {
                        console.error('Error resolving class:', e);
                        resolvedClassId = '';
                    }
                }

                // 2. Create Student
                const studentDoc = {
                    id: studentId,
                    student_id: studentId,
                    name: studentData.name,
                    lrn: studentData.lrn,
                    grade: studentData.grade,
                    level: studentData.level,
                    class_id: resolvedClassId,
                    parent_id: parentId,
                    photo_url: photoUrl,
                    qr_code: studentId,
                    address: studentData.address, // Inherit from parent (passed in studentData)
                    emergency_contact: studentData.emergencyContact, // Inherit from parent
                    current_status: 'out_school',
                    is_active: true,
                    created_at: new Date().toISOString()
                    // created_by: this.currentUser.id
                };

                // Add strand/subjects
                if (studentData.level === this.STUDENT_LEVELS.Senior_High_School) {
                    studentDoc.strand = studentData.strand;
                    studentDoc.subjects = this.getSubjectsForLevel(studentData.level, studentData.strand, studentData.grade);
                } else {
                    studentDoc.subjects = this.getSubjectsForLevel(studentData.level, null, studentData.grade);
                }

                const { error: studentError } = await window.supabaseClient
                    .from('students')
                    .insert([studentDoc]);

                if (studentError) throw new Error('Failed to create student: ' + studentError.message);

                // 3. Update Parent's children array (append)
                const { data: parentData, error: parentFetchError } = await window.supabaseClient
                    .from('profiles')
                    .select('children')
                    .eq('id', parentId)
                    .single();

                if (!parentFetchError && parentData) {
                    const currentChildren = parentData.children || [];
                    if (!currentChildren.includes(studentId)) {
                        await window.supabaseClient
                            .from('profiles')
                            .update({ children: [...currentChildren, studentId] })
                            .eq('id', parentId);
                    }
                }

                this.clearCache();
                return studentId;

            } else {
                // Firebase implementation
                const batch = db.batch();

                // Resolve Class (Simplified for brevity, similar to Supabase logic or use existing classId)
                let resolvedClassId = studentData.classId || '';
                // ... (Class resolution logic omitted for brevity, assume passed or handled)

                const studentRef = db.collection('students').doc(studentId);
                const studentDoc = {
                    id: studentId,
                    studentId: studentId,
                    name: studentData.name,
                    lrn: studentData.lrn,
                    grade: studentData.grade,
                    level: studentData.level,
                    class_id: resolvedClassId,
                    parent_id: parentId,
                    photo_url: photoUrl,
                    qrCode: studentId,
                    current_status: 'out_school',
                    is_active: true,
                    created_at: SupabaseFieldValue.serverTimestamp(),
                    createdBy: this.currentUser.id
                };
                 if (studentData.level === this.STUDENT_LEVELS.Senior_High_School) {
                    studentDoc.strand = studentData.strand;
                    studentDoc.subjects = this.getSubjectsForLevel(studentData.level, studentData.strand, studentData.grade);
                } else {
                    studentDoc.subjects = this.getSubjectsForLevel(studentData.level, null, studentData.grade);
                }

                batch.set(studentRef, studentDoc);

                // Update Parent
                const { error: updateError } = await window.supabaseClient
                    .from('profiles')
                    .update({
                        children: [...(existingParent.children || []), studentId]
                    })
                    .eq('id', parentId);
                if (updateError) throw updateError;
                this.clearCache();
                return studentId;
            }
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

    // Upload student photo to Supabase Storage (only if storage is available)
    async uploadStudentPhoto(photoFile, studentId) {
        try {
            // Check if storage is available
            if (!this.storage) {
                throw new Error('Storage is not available.');
            }

            const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
            if (!validTypes.includes(photoFile.type)) {
                throw new Error('Invalid file type');
            }

            if (photoFile.size > 5 * 1024 * 1024) {
                throw new Error('File size too large');
            }

            const fileExtension = photoFile.name.split('.').pop();
            const fileName = `students/${studentId}/photo.${fileExtension}`;
            const storageRef = this.storage.ref().child(fileName);
            
            const snapshot = await storageRef.put(photoFile);
            return await snapshot.ref.getDownloadURL();
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

            if (window.USE_SUPABASE && window.supabaseClient) {
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
            } else {
                const classDoc = {
                    ...classData,
                    subjects: this.getSubjectsForLevel(classData.level, classData.strand, classData.grade),
                    is_active: true,
                    created_at: SupabaseFieldValue.serverTimestamp(),
                    createdBy: this.currentUser.id
                };

                const classRef = await db.collection('classes').add(classDoc);
                this.clearCache(); // Clear cache
                
                console.log(`Class created: ${classData.name} with ${classDoc.subjects.length} subjects`);
                return classRef.id;
            }
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
            if (window.USE_SUPABASE && window.supabaseClient) {
                const { data, error } = await window.supabaseClient
                    .from('profiles')
                    .select('id,username,full_name,role,phone,is_active,assigned_classes,assigned_subjects,capabilities,class_id,is_homeroom')
                    .eq('is_active', true)
                    .limit(100);
                if (error) throw error;
                dataCache.users = (data || []).map(u => ({
                    ...u,
                    assignedClasses: u.assigned_classes,
                    assignedSubjects: u.assigned_subjects,
                    capabilities: u.capabilities || [],
                    classId: u.class_id,
                    isHomeroom: u.is_homeroom
                }));
                dataCache.lastUpdated = Date.now();
                return dataCache.users;
            } else {
                const snapshot = await db.collection('users')
                    .where('is_active', '==', true)
                    .limit(100)
                    .get();
                dataCache.users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                dataCache.lastUpdated = Date.now();
                return dataCache.users;
            }
        } catch (error) {
            console.error('Error getting users:', error);
            return [];
        }
    },

    async getStudents(forceRefresh = false) {
        if (dataCache.students && !forceRefresh && (Date.now() - dataCache.lastUpdated < CACHE_DURATION)) {
            return dataCache.students;
        }

        try {
            if (window.USE_SUPABASE && window.supabaseClient) {
                const { data, error } = await window.supabaseClient
                    .from('students')
                    .select('*')
                    .limit(200);

                if (error) throw error;

                dataCache.students = (data || []).map(s => ({
                    ...s,
                    classId: s.class_id,
                    parentId: s.parent_id,
                    emergencyContact: s.emergency_contact,
                    grade: s.level
                }));
                dataCache.lastUpdated = Date.now();
                return dataCache.students;
            } else {
                const snapshot = await db.collection('students')
                    .limit(200) // Limit results
                    .get();
                    
                dataCache.students = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                dataCache.lastUpdated = Date.now();
                return dataCache.students;
            }
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
            if (window.USE_SUPABASE && window.supabaseClient) {
                const { data, error } = await window.supabaseClient
                    .from('classes')
                    .select('*')
                    .eq('is_active', true)
                    .limit(50);
                if (error) throw error;
                dataCache.classes = (data || []).map(c => ({ ...c }));
                dataCache.lastUpdated = Date.now();
                return dataCache.classes;
            } else {
                const snapshot = await db.collection('classes').limit(50).get();
                dataCache.classes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                dataCache.lastUpdated = Date.now();
                return dataCache.classes;
            }
        } catch (error) {
            console.error('Error getting classes:', error);
            return [];
        }
    },

    // Get students by level and strand
    async getStudentsByLevel(level, strand = null) {
        try {
            if (window.USE_SUPABASE && window.supabaseClient) {
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
                
                return (data || []).map(s => ({
                    ...s,
                    classId: s.class_id,
                    parentId: s.parent_id,
                    emergencyContact: s.emergency_contact,
                    grade: s.level
                }));
            }

            let query = db.collection('students')
                .where('level', '==', level)
                .where('is_active', '==', true);

            if (strand) {
                query = query.where('strand', '==', strand);
            }

            const snapshot = await query.get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error('Error getting students by level:', error);
            return [];
        }
    },

    // Get recent student enrollments
    async getRecentEnrollments(limit = 5) {
        try {
            if (window.USE_SUPABASE && window.supabaseClient) {
                const { data, error } = await window.supabaseClient
                    .from('students')
                    .select('*')
                    .eq('is_active', true)
                    .order('created_at', { ascending: false })
                    .limit(limit);
                
                if (error) throw error;
                return data || [];
            }

            const snapshot = await db.collection('students')
                .where('is_active', '==', true)
                .orderBy('created_at', 'desc')
                .limit(limit)
                .get();

            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error('Error getting recent enrollments:', error);
            return [];
        }
    },

    // Fast: Get recent activity with limit
    async getRecentActivity(limit = 10) {
        try {
            if (window.USE_SUPABASE && window.supabaseClient) {
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
                        .select('id,first_name,last_name,class_id')
                        .in('id', ids);
                    (students || []).forEach(s => {
                        namesById[s.id] = [s.first_name, s.last_name].filter(Boolean).join(' ');
                    });
                }
                return data.map(row => ({
                    id: row.id,
                    ...row,
                    studentName: namesById[row.student_id] || 'Unknown Student'
                }));
            } else {
                const snapshot = await db.collection('attendance')
                    .orderBy('timestamp', 'desc')
                    .limit(limit)
                    .get();
                
                const attendanceData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                
                // Fetch student names for Firestore
                const studentIds = Array.from(new Set(attendanceData.map(r => r.student_id).filter(Boolean)));
                let namesById = {};
                
                if (studentIds.length > 0) {
                    const studentsSnapshot = await db.collection('students')
                        .where('id', 'in', studentIds)
                        .get();
                    
                    studentsSnapshot.docs.forEach(doc => {
                        const student = doc.data();
                        namesById[doc.id] = [student.first_name, student.last_name].filter(Boolean).join(' ') || 'Unknown Student';
                    });
                }
                
                return attendanceData.map(row => ({
                    ...row,
                    studentName: namesById[row.student_id] || 'Unknown Student'
                }));
            }
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
            if (window.USE_SUPABASE && window.supabaseClient) {
                const { data, error } = await window.supabaseClient
                    .from('students')
                    .select('id,first_name,last_name,lrn,class_id,parent_id,strand,current_status,created_at,level,grade')
                    .eq('class_id', classId);
                if (error || !data) return [];
                return data.map(s => ({
                    id: s.id,
                    name: [s.first_name, s.last_name].filter(Boolean).join(' '),
                    lrn: s.lrn,
                    class_id: s.class_id,
                    parent_id: s.parent_id,
                    strand: s.strand,
                    current_status: s.current_status,
                    created_at: s.created_at,
                    level: s.level,
                    grade: s.grade
                }));
            } else {
                const snapshot = await this.db.collection('students')
                    .where('class_id', '==', classId)
                    .where('is_active', '==', true)
                    .get();
                return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            }
        } catch (error) {
            console.error('Error getting students by class:', error);
            return [];
        }
    },

    // ==================== PARENT-SPECIFIC METHODS ====================

    // Get students by parent ID
    async getStudentsByParent(parentId) {
        try {
            if (window.USE_SUPABASE && window.supabaseClient) {
                // Get students by parent_students relationship table
                const { data: relationships, error: relError } = await window.supabaseClient
                    .from('parent_students')
                    .select('student_id')
                    .eq('parent_id', parentId);
                
                if (relError) throw relError;
                
                if (relationships && relationships.length > 0) {
                    const studentIds = relationships.map(r => r.student_id);
                    const { data: students, error: studentsError } = await window.supabaseClient
                        .from('students')
                        .select('*')
                        .in('id', studentIds);
                    
                    if (studentsError) throw studentsError;
                    return students || [];
                }
                
                return [];

            } else {
                const variants = new Set([parentId]);
                const mParent = parentId.match(/^parent(\d{3})$/i);
                if (mParent) variants.add(`PAR-${mParent[1]}`);
                const mPar = parentId.match(/^PAR-(\d{3})$/i);
                if (mPar) variants.add(`parent${mPar[1]}`);

                let byParent = [];
                const candidateIds = Array.from(variants);
                if (candidateIds.length > 1) {
                    const chunks = [];
                    for (let i = 0; i < candidateIds.length; i += 10) {
                        chunks.push(candidateIds.slice(i, i + 10));
                    }
                    const results = await Promise.all(chunks.map(chunk =>
                        db.collection('students')
                            .where('parent_id', 'in', chunk)
                            .get()
                    ));
                    byParent = results.flatMap(snap => snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
                } else {
                    const byParentSnapshot = await db.collection('students')
                        .where('parent_id', '==', parentId)
                        .get();
                    byParent = byParentSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                }

                let fromParentChildren = [];
                const parentDocs = await Promise.all(candidateIds.map(id => db.collection('users').doc(id).get()));
                const childrenIds = parentDocs
                    .filter(doc => doc.exists)
                    .flatMap(doc => {
                        const arr = doc.data().children;
                        return Array.isArray(arr) ? arr.filter(Boolean) : [];
                    });
                if (childrenIds.length > 0) {
                    const chunks2 = [];
                    for (let i = 0; i < childrenIds.length; i += 10) {
                        chunks2.push(childrenIds.slice(i, i + 10));
                    }
                    const results2 = await Promise.all(chunks2.map(chunk =>
                        db.collection('students')
                            .where('id', 'in', chunk)
                            .get()
                    ));
                    fromParentChildren = results2.flatMap(snap => snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
                }

                // Merge unique
                const unique = new Map();
                (byParent || []).forEach(s => unique.set(s.id, s));
                (fromParentChildren || []).forEach(s => unique.set(s.id, s));
                
                return Array.from(unique.values()).map(s => ({
                     id: s.id,
                     ...s,
                     classId: s.class_id,
                     parentId: s.parent_id
                }));
            }
        } catch (error) {
            console.error('Error getting students by parent:', error);
            return [];
        }
    },

    // Get recent activity for parent (notifications and attendance for their children)
    async getRecentActivityForParent(parentId) {
        try {
            if (window.USE_SUPABASE && window.supabaseClient) {
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
                        .contains('target_users', [this.currentUser.id]) // Check if parent ID is in targetUsers array
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
                    title: n.title,
                    message: n.message,
                    timestamp: new Date(n.created_at),
                    isRead: n.read_by && n.read_by.includes(this.currentUser.id)
                }));

                const attendance = (attendanceRes.data || []).map(a => ({
                    type: 'attendance',
                    id: a.id,
                    status: a.status,
                    timestamp: new Date(a.timestamp || a.created_at),
                    studentId: a.student_id,
                    entryType: a.entry_type
                }));

                // Combine and sort
                const combined = [...notifications, ...attendance].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
                
                // Add student names
                const studentMap = new Map(children.map(c => [c.id, c.name || [c.first_name, c.last_name].filter(Boolean).join(' ')]));
                
                return combined.map(item => ({
                    ...item,
                    studentName: studentMap.get(item.studentId) || 'Unknown Student'
                }));
            }

            // Get parent's children first
            const children = await this.getStudentsByParent(parentId);
            if (children.length === 0) {
                return [];
            }

            const childIds = children.map(child => child.id);

            const chunks = [];
            for (let i = 0; i < childIds.length; i += 10) {
                chunks.push(childIds.slice(i, i + 10));
            }

            const notificationsPromises = chunks.map(chunk =>
                db.collection('notifications')
                    .where('student_id', 'in', chunk)
                    .get()
            );

            const attendancePromises = chunks.map(chunk =>
                db.collection('attendance')
                    .where('student_id', 'in', chunk)
                    .get()
            );

            const [notificationsResults, attendanceResults] = await Promise.all([
                Promise.all(notificationsPromises),
                Promise.all(attendancePromises)
            ]);

            const notificationsDocs = notificationsResults.flatMap(snapshot => snapshot.docs);
            const attendanceDocs = attendanceResults.flatMap(snapshot => snapshot.docs);

            const activity = [];

            notificationsDocs.forEach(doc => {
                const data = doc.data();
                activity.push({
                    type: 'notification',
                    id: doc.id,
                    title: data.title,
                    message: data.message,
                    timestamp: data.createdAt,
                    isUrgent: data.isUrgent || false
                });
            });

            attendanceDocs.forEach(doc => {
                const data = doc.data();
                const child = children.find(c => c.id === data.studentId);
                activity.push({
                    type: 'attendance',
                    id: doc.id,
                    title: `${child ? child.name : 'Student'} ${data.entry_type === 'entry' ? 'entered' : 'left'} school`,
                    message: `Session: ${data.session}, Status: ${data.status}`,
                    timestamp: data.timestamp,
                    entry_type: data.entry_type,
                    studentName: child ? child.name : 'Unknown'
                });
            });

            return activity
                .sort((a, b) => {
                    const bt = b.timestamp && b.timestamp.toDate ? b.timestamp.toDate() : b.timestamp;
                    const at = a.timestamp && a.timestamp.toDate ? a.timestamp.toDate() : a.timestamp;
                    return new Date(bt) - new Date(at);
                })
                .slice(0, 10);
        } catch (error) {
            console.error('Error getting recent activity for parent:', error);
            return [];
        }
    },

    // Get attendance records for a specific student
    async getAttendanceByStudent(studentId) {
        try {
            if (window.USE_SUPABASE && window.supabaseClient) {
                const { data, error } = await window.supabaseClient
                    .from('attendance')
                    .select('id,student_id,class_id,entry_type,timestamp,time,session,status,remarks,recorded_by,recorded_by_name,manual_entry')
                    .eq('student_id', studentId)
                    .order('timestamp', { ascending: false })
                    .limit(50);
                if (error || !data) return [];
                const { data: s } = await window.supabaseClient
                    .from('students')
                    .select('id,first_name,last_name')
                    .eq('id', studentId)
                    .single();
                const name = s ? [s.first_name, s.last_name].filter(Boolean).join(' ') : '';
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
            } else {
                const snapshot = await db.collection('attendance')
                    .where('student_id', '==', studentId)
                    .orderBy('timestamp', 'desc')
                    .limit(50)
                    .get();
                return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            }
        } catch (error) {
            console.error('Error getting attendance by student:', error);
            return [];
        }
    },

    // Get clinic visits for a specific student
    async getClinicVisitsByStudent(studentId) {
        try {
            if (window.USE_SUPABASE && window.supabaseClient) {
                const { data, error } = await window.supabaseClient
                    .from('clinic_visits')
                    .select('id,student_id,reason,visit_time,notes,treated_by,outcome')
                    .eq('student_id', studentId)
                    .order('visit_time', { ascending: false })
                    .limit(50);
                if (error) throw error;
                return (data || []).map(r => ({
                    id: r.id,
                    studentId: r.student_id,
                    reason: r.reason,
                    checkIn: r.outcome !== 'checked_out', // Assume check-in unless explicitly checked out
                    timestamp: r.visit_time ? new Date(r.visit_time) : new Date(),
                    notes: r.notes,
                    treatedBy: r.treated_by,
                    outcome: r.outcome
                }));
            } else {
                const snapshot = await db.collection('clinic_visits')
                    .where('student_id', '==', studentId)
                    .orderBy('visit_time', 'desc')
                    .limit(50)
                    .get();
                return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            }
        } catch (error) {
            console.error('Error getting clinic visits by student:', error);
            return [];
        }
    },

    // ==================== ENHANCED NOTIFICATION SYSTEM ====================

    // Notification System - ENHANCED VERSION
    async createNotification(notificationData) {
        try {
            if (window.USE_SUPABASE && window.supabaseClient) {
                if (!notificationData.target_users || notificationData.target_users.length === 0) {
                    throw new Error('Notification must have target users');
                }
                const row = {
                    target_users: notificationData.target_users,
                    title: notificationData.title,
                    message: notificationData.message,
                    type: notificationData.type,
                    read_by: [], // Initialize as empty array
                    created_at: new Date()
                };
                const { data, error } = await window.supabaseClient.from('notifications').insert(row).select('id').single();
                if (error) {
                    throw error;
                }
                this.handleNewNotifications([{ id: data.id, ...row }]);
                return data.id;
            } else {
                const notification = {
                    ...notificationData,
                    created_at: SupabaseFieldValue.serverTimestamp(),
                    readBy: [],
                    isUrgent: notificationData.isUrgent || false,
                    is_active: true
                };
                if (!notification.target_users || notification.target_users.length === 0) {
                    throw new Error('Notification must have target users');
                }
                const notificationRef = await db.collection('notifications').add(notification);
                this.handleNewNotifications([{ id: notificationRef.id, ...notification }]);
                return notificationRef.id;
            }
        } catch (error) {
            console.error('Error creating notification:', error);
            throw error;
        }
    },

    async markNotificationAsRead(notificationId) {
        try {
            if (!this.currentUser) throw new Error('No user logged in');
            if (window.USE_SUPABASE && window.supabaseClient) {
                const { data, error } = await window.supabaseClient.from('notifications').select('id,read_by').eq('id', notificationId).single();
                if (error || !data) throw new Error('Notification not found');
                const existing = Array.isArray(data.read_by) ? data.read_by : [];
                const updated = Array.from(new Set([...existing, this.currentUser.id]));
                const { error: upErr } = await window.supabaseClient.from('notifications').update({ read_by: updated }).eq('id', notificationId);
                if (upErr) throw upErr;
            } else {
                await db.collection('notifications').doc(notificationId).update({
                    readBy: firebase.firestore.FieldValue.arrayUnion(this.currentUser.id)
                });
            }
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
            if (window.USE_SUPABASE && window.supabaseClient) {
                for (const id of notificationIds) {
                    await this.markNotificationAsRead(id);
                }
            } else {
                const batch = db.batch();
                notificationIds.forEach(notificationId => {
                    const notificationRef = db.collection('notifications').doc(notificationId);
                    batch.update(notificationRef, {
                    read_by: window.supabaseClient.raw('array_append(read_by, ?)', [this.currentUser.id])
                    });
                });
                await batch.commit();
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
    async getUnreadNotificationCount(userId) {
        try {
            if (dataCache.notifications && dataCache.notifications.userId === userId) {
                const unreadCount = dataCache.notifications.data.filter(n => !n.read_by || !n.read_by.includes(userId)).length;
                return unreadCount;
            }
            if (window.USE_SUPABASE && window.supabaseClient) {
                const { data, error } = await window.supabaseClient
                    .from('notifications')
                    .select('id,read_by,target_users,created_at,title,message,type')
                    .contains('target_users', [userId]);
                if (error || !data) return 0;
                
                const mappedData = data.map(n => ({
                    ...n,
                    readBy: n.read_by,
                    createdAt: n.created_at
                }));
                
                dataCache.notifications = { userId, data: mappedData, lastUpdated: Date.now() };
                const unreadCount = mappedData.filter(n => !n.readBy || !n.readBy.includes(userId)).length;
                return unreadCount;
            } else {
                const snapshot = await db.collection('notifications')
                    .where('target_users', 'array-contains', userId)
                    .where('is_active', '==', true)
                    .get();
                const notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                dataCache.notifications = { userId, data: notifications, lastUpdated: Date.now() };
                const unreadCount = notifications.filter(notification => !notification.readBy || !notification.readBy.includes(userId)).length;
                return unreadCount;
            }
        } catch (error) {
            console.error('Error getting unread notification count:', error);
            return 0;
        }
    },

    // Get notifications for user - ENHANCED VERSION
    async getNotificationsForUser(userId, unreadOnly = false, limit = 20) {
        try {
            if (window.USE_SUPABASE && window.supabaseClient) {
                const { data, error } = await window.supabaseClient
                    .from('notifications')
                    .select('id,target_users,title,message,type,created_at,read_by')
                    .contains('target_users', [userId])
                    .order('created_at', { ascending: false })
                    .limit(limit);
                if (error || !data) throw error || new Error('Failed to load notifications');
                let notifications = data.map(n => ({
                    ...n,
                    readBy: n.read_by,
                    createdAt: n.created_at,
                    formattedDate: this.formatDate(n.created_at),
                    formattedTime: this.formatTime(n.created_at)
                }));
                if (unreadOnly) {
                    notifications = notifications.filter(n => !n.readBy || !n.readBy.includes(userId));
                }
                return notifications;
            } else {
                let query = db.collection('notifications')
                    .where('target_users', 'array-contains', userId)
                    .where('is_active', '==', true)
                    .orderBy('createdAt', 'desc')
                    .limit(limit);
                const snapshot = await query.get();
                let notifications = snapshot.docs.map(doc => ({ 
                    id: doc.id, 
                    ...doc.data(),
                    formattedDate: this.formatDate(doc.data().createdAt),
                    formattedTime: this.formatTime(doc.data().createdAt)
                }));
                if (unreadOnly) {
                    notifications = notifications.filter(notification => 
                        !notification.readBy || !notification.readBy.includes(userId)
                    );
                }
                return notifications;
            }
        } catch (error) {
            console.error('Error getting notifications for user:', error);
            throw error;
        }
    },

    // Get notifications by type
    async getNotificationsByType(userId, type, limit = 20) {
        try {
            if (window.USE_SUPABASE && window.supabaseClient) {
                const { data, error } = await window.supabaseClient
                    .from('notifications')
                    .select('id,target_users,title,message,type,created_at,read_by')
                    .contains('target_users', [userId])
                    .eq('type', type)
                    .order('created_at', { ascending: false })
                    .limit(limit);
                if (error || !data) return [];
                return data.map(n => ({
                    ...n,
                    readBy: n.read_by,
                    createdAt: n.created_at,
                    formattedDate: this.formatDate(n.created_at),
                    formattedTime: this.formatTime(n.created_at)
                }));
            } else {
                const snapshot = await db.collection('notifications')
                    .where('target_users', 'array-contains', userId)
                    .where('type', '==', type)
                    .where('is_active', '==', true)
                    .orderBy('createdAt', 'desc')
                    .limit(limit)
                    .get();
                return snapshot.docs.map(doc => ({ 
                    id: doc.id, 
                    ...doc.data(),
                    formattedDate: this.formatDate(doc.data().createdAt),
                    formattedTime: this.formatTime(doc.data().createdAt)
                }));
            }
        } catch (error) {
            console.error('Error getting notifications by type:', error);
            return [];
        }
    },

    // Get urgent notifications
    async getUrgentNotifications(userId, limit = 10) {
        try {
            if (window.USE_SUPABASE && window.supabaseClient) {
                // Supabase notifications table does not have isUrgent column; return latest notifications
                const { data, error } = await window.supabaseClient
                    .from('notifications')
                    .select('id,target_users,title,message,type,created_at,read_by')
                    .contains('target_users', [userId])
                    .order('created_at', { ascending: false })
                    .limit(limit);
                if (error || !data) return [];
                return data.map(n => ({
                    ...n,
                    readBy: n.read_by,
                    createdAt: n.created_at,
                    formattedDate: this.formatDate(n.created_at),
                    formattedTime: this.formatTime(n.created_at)
                }));
            } else {
                const snapshot = await db.collection('notifications')
                    .where('target_users', 'array-contains', userId)
                    .where('is_urgent', '==', true)
                    .where('is_active', '==', true)
                    .orderBy('createdAt', 'desc')
                    .limit(limit)
                    .get();
                return snapshot.docs.map(doc => ({ 
                    id: doc.id, 
                    ...doc.data(),
                    formattedDate: this.formatDate(doc.data().createdAt),
                    formattedTime: this.formatTime(doc.data().createdAt)
                }));
            }
        } catch (error) {
            console.error('Error getting urgent notifications:', error);
            return [];
        }
    },

    // Delete notification (soft delete)
    async deleteNotification(notificationId) {
        try {
            if (!this.currentUser) throw new Error('No user logged in');

            await db.collection('notifications').doc(notificationId).update({
                is_active: false,
                deletedAt: SupabaseFieldValue.serverTimestamp(),
                deletedBy: this.currentUser.id
            });

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
            const batch = db.batch();
            const notificationsCollection = db.collection('notifications');
            const createdNotifications = [];

            notificationDataArray.forEach(notificationData => {
                const notificationRef = notificationsCollection.doc();
                const notification = {
                    ...notificationData,
                    id: notificationRef.id,
                    created_at: SupabaseFieldValue.serverTimestamp(),
                    readBy: [],
                    isUrgent: notificationData.isUrgent || false,
                    is_active: true
                };

                batch.set(notificationRef, notification);
                createdNotifications.push(notification);
            });

            await batch.commit();
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
            if (window.USE_SUPABASE && window.supabaseClient) {
                const { error } = await window.supabaseClient
                    .from('profiles')
                    .update({ notification_preferences: preferences, updated_at: new Date().toISOString() })
                    .eq('id', userId);
                if (error) throw error;
            } else {
                await db.collection('users').doc(userId).update({
                    notificationPreferences: preferences,
                    updatedAt: SupabaseFieldValue.serverTimestamp()
                });
            }

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
            if (window.USE_SUPABASE && window.supabaseClient) {
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
            } else {
                const userDoc = await db.collection('users').doc(userId).get();
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    return userData.notificationPreferences || {
                        attendance: true,
                        clinic: true,
                        announcements: true,
                        excuses: true,
                        system: true,
                        email: false,
                        push: true
                    };
                }
            }
            return null;
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

            const snapshot = await db.collection('notifications')
                .where('createdAt', '<', cutoffDate)
                .where('isUrgent', '==', false)
                .limit(100) // Process in batches
                .get();

            if (snapshot.empty) {
                console.log('No old notifications to cleanup');
                return 0;
            }

            const batch = db.batch();
            let deletedCount = 0;

            snapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
                deletedCount++;
            });

            await batch.commit();
            console.log(`Cleaned up ${deletedCount} old notifications`);
            
            this.clearCache(); // Clear cache since data changed
            
            return deletedCount;
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

            if (window.USE_SUPABASE && window.supabaseClient) {
                const timeString = timestamp.toTimeString().split(' ')[0].substring(0, 5);
                const session = this.getCurrentSession();
                
                // If status not provided, calculate it
                if (!status) {
                    const isLate = entry_type === 'entry' && this.isLate(timeString);
                    status = isLate ? this.ATTENDANCE_STATUS.LATE : this.ATTENDANCE_STATUS.PRESENT;
                }

                const { data: student, error: studentErr } = await window.supabaseClient
                    .from('students')
                    .select('id,first_name,last_name,class_id,parent_id')
                    .eq('id', studentId)
                    .single();
                
                if (studentErr || !student) {
                    throw new Error('Student not found');
                }

                const insertData = {
                    studentId: studentId,
                    class_id: student.class_id || '',
                    entry_type: entry_type,
                    timestamp: timestamp,
                    time: timeString,
                    session: session,
                    status: status,
                    remarks: notes || '',
                    recordedBy: recordedBy || this.currentUser.id,
                    recordedByName: recordedByName || this.currentUser.name,
                    manualEntry: isObjectArg // Assume object arg implies manual/admin entry
                };

                const { data: inserted, error } = await window.supabaseClient.from('attendance').insert(insertData).select('id').single();
                
                if (error) {
                    throw error;
                }

                const newStatus = entry_type === 'entry' ? 'in_school' : 'out_school';
                await window.supabaseClient.from('students').update({ current_status: newStatus }).eq('id', studentId);

                // Only notify if not manually suppressed (optional future enhancement)
                // For now, keep existing notification logic
                await this.createNotification({
                    type: this.NOTIFICATION_TYPES.ATTENDANCE,
                    title: `Student ${entry_type === 'entry' ? 'Arrival' : 'Departure'}`,
                    message: `${(student.first_name || '')} ${(student.last_name || '')} has ${entry_type === 'entry' ? 'entered' : 'left'} the school at ${timeString}`,
                    target_users: [student.parent_id].filter(Boolean)
                });

                await this.syncAttendanceToReports();
                return inserted.id;
            } else {
                // Firebase fallback
                const studentDoc = await db.collection('students').doc(studentId).get();
                if (!studentDoc.exists) {
                    throw new Error('Student not found');
                }
                const student = studentDoc.data();
                const timeString = timestamp.toTimeString().split(' ')[0].substring(0, 5);
                const session = this.getCurrentSession();
                
                if (!status) {
                    const isLate = entry_type === 'entry' && this.isLate(timeString);
                    status = isLate ? this.ATTENDANCE_STATUS.LATE : this.ATTENDANCE_STATUS.PRESENT;
                }

                const attendanceData = {
                    studentId: studentId,
                    studentName: student.name,
                    class_id: student.class_id,
                    entry_type: entry_type,
                    timestamp: new Date().toISOString(),
                    time: timeString,
                    session: session,
                    status: status,
                    remarks: notes || '',
                    recordedBy: recordedBy || this.currentUser.id,
                    recordedByName: recordedByName || this.currentUser.name
                };

                const attendanceRef = await db.collection('attendance').add(attendanceData);
                await db.collection('students').doc(studentId).update({
                    current_status: entry_type === 'entry' ? 'in_school' : 'out_school',
                    lastAttendance: timestamp
                });

                await this.createNotification({
                    type: this.NOTIFICATION_TYPES.ATTENDANCE,
                    title: `Student ${entry_type === 'entry' ? 'Arrival' : 'Departure'}`,
                    message: `${student.name} has ${entry_type === 'entry' ? 'entered' : 'left'} the school at ${timeString}`,
                    target_users: [student.parent_id],
                    studentId: studentId,
                    studentName: student.name,
                    relatedRecord: attendanceRef.id
                });

                await this.syncAttendanceToReports();
                return attendanceRef.id;
            }
        } catch (error) {
            console.error('Error recording attendance:', error);
            throw error;
        }
    },

    // Enhanced guard attendance recording
    async recordGuardAttendance(studentId, student, entry_type, customTimestamp = null) {
        try {
            const timestamp = customTimestamp || new Date();
            const timeString = timestamp.toTimeString().split(' ')[0].substring(0, 5);
            const session = this.getCurrentSession();
            
            // Use existing attendance logic for status calculation
            let status;
            if (entry_type === 'entry') {
                const isLate = this.isLate(timeString);
                status = isLate ? this.ATTENDANCE_STATUS.LATE : this.ATTENDANCE_STATUS.PRESENT;
            } else {
                // For exit entries, use present status (they were present and now leaving)
                status = this.ATTENDANCE_STATUS.PRESENT;
            }

            const attendanceData = {
                student_id: studentId,
                class_id: student.class_id || '',
                entry_type: entry_type,
                timestamp: timestamp,
                time: timeString,
                session: session,
                status: status,
                remarks: '', // Empty remarks for manual entry
                method: 'manual',
                recorded_by: this.currentUser.id,
                recorded_by_name: this.currentUser.name,
                manual_entry: true
            };

            const attendanceRef = await this.db.collection('attendance').add(attendanceData);

            // Update student status
            await this.db.collection('students').doc(studentId).update({
                current_status: entry_type === 'entry' ? 'in_school' : 'out_school',
                lastAttendance: new Date().toISOString()
            });

            const teacherIds = await this.getRelevantTeachersForStudent(student);
            await this.createNotification({
                type: this.NOTIFICATION_TYPES.ATTENDANCE,
                title: `Student ${entry_type === 'entry' ? 'Arrival' : 'Departure'}`,
                message: `${student.first_name || ''} ${student.last_name || ''}`.trim() + ` has ${entry_type === 'entry' ? 'entered' : 'left'} the school at ${timeString}`,
                target_users: [student.parent_id, ...teacherIds].filter(Boolean)
            });

            return {
                success: true,
                attendanceId: attendanceRef.id,
                status: status,
                time: timeString
            };
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
            if (window.USE_SUPABASE && window.supabaseClient) {
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
            } else {
                const db = firebase.firestore();
                const snapshot = await db.collection('attendance')
                    .where('timestamp', '>=', startOfDay)
                    .where('timestamp', '<=', endOfDay)
                    .get();
                snapshot.forEach(doc => {
                    const data = doc.data();
                    if (stats.hasOwnProperty(data.status)) {
                        stats[data.status]++;
                    }
                });
                return stats;
            }
        } catch (error) {
            console.error('Error getting attendance stats:', error);
            throw error;
        }
    },

    // Get attendance records with filters
    async getAttendanceRecords(filters = {}) {
        try {
            if (window.USE_SUPABASE && window.supabaseClient) {
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
            } else {
                const db = firebase.firestore();
                let query = db.collection('attendance');
                if (filters.startDate && filters.endDate) {
                    const startDate = new Date(filters.startDate + 'T00:00:00');
                    const endDate = new Date(filters.endDate + 'T23:59:59');
                    query = query.where('timestamp', '>=', startDate).where('timestamp', '<=', endDate);
                }
                if (filters.classId) {
                    query = query.where('classId', '==', filters.classId);
                }
                if (filters.status) {
                    query = query.where('status', '==', filters.status);
                }
                const snapshot = await query.orderBy('timestamp', 'desc').get();
                const records = [];
                snapshot.forEach(doc => {
                    records.push({ id: doc.id, ...doc.data() });
                });
                return records;
            }
        } catch (error) {
            console.error('Error getting attendance records:', error);
            throw error;
        }
    },

    // Record manual attendance (for teachers/admins)
    async recordManualAttendance(attendanceData) {
        try {
            if (window.USE_SUPABASE && window.supabaseClient) {
                const timestamp = new Date(attendanceData.date + 'T' + (attendanceData.time || '08:00:00'));
                const timeString = (attendanceData.time || '08:00').substring(0, 5);
                const session = this.getCurrentSession();
                const { data: student, error: studentErr } = await window.supabaseClient
                    .from('students')
                    .select('id,first_name,last_name,class_id,parent_id')
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
                const teacherIds = await this.getRelevantTeachersForStudent({ id: student.id, name: `${student.firstName || ''} ${student.lastName || ''}`.trim(), classId: student.classId });
                await this.createNotification({
                    type: this.NOTIFICATION_TYPES.ATTENDANCE,
                    title: 'Manual Attendance Update',
                    message: `${(student.firstName || '')} ${(student.lastName || '')} marked as ${attendanceData.status} (${attendanceData.notes || 'No notes'})`,
                    target_users: [student.parent_id, ...teacherIds].filter(Boolean),
                    studentId: student.id,
                    studentName: `${student.firstName || ''} ${student.lastName || ''}`.trim(),
                    relatedRecord: inserted.id
                });
                return true;
            } else {
                const db = firebase.firestore();
                const timestamp = new Date(attendanceData.date + 'T' + (attendanceData.time || '08:00:00'));
                const attendanceRecord = {
                    studentId: attendanceData.studentId,
                    status: attendanceData.status,
                    timestamp: timestamp,
                    recordedBy: attendanceData.recordedBy,
                    notes: attendanceData.notes || '',
                    manualEntry: true
                };
                const added = await db.collection('attendance').add(attendanceRecord);
                const studentDoc = await db.collection('students').doc(attendanceData.studentId).get();
                if (studentDoc.exists) {
                    const student = { id: studentDoc.id, ...studentDoc.data() };
                    const teacherIds = await this.getRelevantTeachersForStudent(student);
                    await this.createNotification({
                        type: this.NOTIFICATION_TYPES.ATTENDANCE,
                        title: 'Manual Attendance Update',
                        message: `${student.name} marked as ${attendanceData.status} (${attendanceData.notes || 'No notes'})`,
                        target_users: [student.parent_id, ...teacherIds].filter(Boolean),
                        studentId: student.id,
                        studentName: student.name,
                        relatedRecord: added.id
                    });
                }
                return true;
            }
        } catch (error) {
            console.error('Error recording attendance:', error);
            throw error;
        }
    },

    async overrideAttendanceStatus(studentId, status = 'present', notes = '') {
        try {
            if (window.USE_SUPABASE && window.supabaseClient) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const { data: student, error: studentErr } = await window.supabaseClient
                    .from('students')
                    .select('id,first_name,last_name,class_id,parent_id')
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
                        studentId: studentId,
                        class_id: student.class_id || '',
                        entry_type: 'entry',
                        timestamp: now,
                        time: timeString,
                        session: session,
                        status: status,
                        recordedBy: this.currentUser?.id || 'system',
                        recordedByName: this.currentUser?.name || 'System',
                        manualEntry: true,
                        remarks: notes || ''
                    };
                    const { data: inserted, error } = await window.supabaseClient.from('attendance').insert(row).select('id').single();
                    if (error) {
                        throw error;
                    }
                    recordId = inserted.id;
                }
                const newStatus = status === 'absent' ? 'out_school' : 'in_school';
                const { error: stuErr } = await window.supabaseClient.from('students').update({ currentStatus: newStatus }).eq('id', studentId);
                if (stuErr) {
                    throw stuErr;
                }
                const teacherIds = await this.getRelevantTeachersForStudent({ id: student.id, name: `${student.firstName || ''} ${student.lastName || ''}`.trim(), classId: student.classId });
                await this.createNotification({
                    type: this.NOTIFICATION_TYPES.ATTENDANCE,
                    title: 'Manual Attendance Update',
                    message: `${(student.firstName || '')} ${(student.lastName || '')} marked as ${status}${notes ? ` (${notes})` : ''}`,
                    target_users: [student.parent_id, ...teacherIds].filter(Boolean),
                    studentId: student.id,
                    studentName: `${student.firstName || ''} ${student.lastName || ''}`.trim(),
                    relatedRecord: recordId
                });
                return true;
            } else {
                const db = firebase.firestore();
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const studentDoc = await db.collection('students').doc(studentId).get();
                if (!studentDoc.exists) throw new Error('Student not found');
                const student = { id: studentDoc.id, ...studentDoc.data() };
                const snapshot = await db.collection('attendance')
                    .where('studentId', '==', studentId)
                    .where('timestamp', '>=', today)
                    .where('entry_type', '==', 'entry')
                    .orderBy('timestamp', 'asc')
                    .limit(1)
                    .get();
                let recordId = null;
                if (!snapshot.empty) {
                    const doc = snapshot.docs[0];
                    recordId = doc.id;
                    await db.collection('attendance').doc(recordId).update({
                        status: status,
                        manualOverride: {
                            by: this.currentUser?.id || 'system',
                            byName: this.currentUser?.name || 'System',
                            notes: notes,
                            at: SupabaseFieldValue.serverTimestamp()
                        }
                    });
                } else {
                    const now = new Date();
                    const timeString = now.toTimeString().split(' ')[0].substring(0, 5);
                    const session = this.getCurrentSession();
                    const attendanceData = {
                        studentId: studentId,
                        studentName: student.name,
                        class_id: student.class_id,
                        entry_type: 'entry',
                        timestamp: SupabaseFieldValue.serverTimestamp(),
                        time: timeString,
                        session: session,
                        status: status,
                        recordedBy: this.currentUser?.id || 'system',
                        recordedByName: this.currentUser?.name || 'System',
                        manualEntry: true,
                        manualOverride: {
                            by: this.currentUser?.id || 'system',
                            byName: this.currentUser?.name || 'System',
                            notes: notes,
                            at: SupabaseFieldValue.serverTimestamp()
                        }
                    };
                    const ref = await db.collection('attendance').add(attendanceData);
                    recordId = ref.id;
                }
                await db.collection('students').doc(studentId).update({
                    current_status: status === 'absent' ? 'out_school' : 'in_school',
                    lastAttendance: SupabaseFieldValue.serverTimestamp()
                });
                const teacherIds = await this.getRelevantTeachersForStudent(student);
                await this.createNotification({
                    type: this.NOTIFICATION_TYPES.ATTENDANCE,
                    title: 'Manual Attendance Update',
                    message: `${student.name} marked as ${status}${notes ? ` (${notes})` : ''}`,
                    target_users: [student.parent_id, ...teacherIds].filter(Boolean),
                    studentId: student.id,
                    studentName: student.name,
                    relatedRecord: recordId
                });
                try {
                    const end = new Date();
                    const start = new Date(end.getTime() - 14 * 24 * 60 * 60 * 1000);
                    const risk = await this.computeAttendanceRisk(student.id, start, end);
                    if (risk.severity === 'critical') {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const dupCheck = await db.collection('notifications')
                            .where('studentId', '==', student.id)
                            .where('type', '==', this.NOTIFICATION_TYPES.ATTENDANCE)
                            .where('createdAt', '>=', today)
                            .get();
                        const hasCriticalToday = dupCheck.docs.some(doc => (doc.data().title || '').includes('Critical Attendance Alert'));
                        if (!hasCriticalToday) {
                            const adminsSnap = await db.collection('users')
                                .where('role', '==', this.USER_TYPES.ADMIN)
                                .where('is_active', '==', true)
                                .limit(10)
                                .get();
                            const adminIds = adminsSnap.docs.map(d => d.id);
                            const reasonText = risk.reasons.length ? `Reasons: ${risk.reasons.join(', ')}` : '';
                            await this.createNotification({
                                type: this.NOTIFICATION_TYPES.ATTENDANCE,
                                title: 'Critical Attendance Alert',
                                message: `${student.name} flagged as at-risk. ${reasonText}`,
                                isUrgent: true,
                                target_users: [student.parentId, ...teacherIds, ...adminIds].filter(Boolean),
                                studentId: student.id,
                                studentName: student.name,
                                relatedRecord: recordId
                            });
                        }
                    }
                } catch (e) {
                    console.error('Risk evaluation failed:', e);
                }
                return true;
            }
        } catch (error) {
            console.error('Error overriding attendance status:', error);
            throw error;
        }
    },

    // Delete attendance record
    async deleteAttendanceRecord(recordId) {
        try {
            if (window.USE_SUPABASE && window.supabaseClient) {
                const { error } = await window.supabaseClient.from('attendance').delete().eq('id', recordId);
                if (error) {
                    throw error;
                }
                return true;
            } else {
                const db = firebase.firestore();
                await db.collection('attendance').doc(recordId).delete();
                return true;
            }
        } catch (error) {
            console.error('Error deleting attendance record:', error);
            throw error;
        }
    },

    // Get class students (alias for getStudentsByClass for backward compatibility)
    async getClassStudents(classId) {
        try {
            if (window.USE_SUPABASE && window.supabaseClient) {
                const { data, error } = await window.supabaseClient
                    .from('students')
                    .select('*')
                    .eq('class_id', classId);
                if (error) throw error;
                return (data || []).map(s => ({ ...s }));
            } else {
                const db = firebase.firestore();
                const snapshot = await db.collection('students')
                    .where('classId', '==', classId)
                    .get();
                    
                const students = [];
                snapshot.forEach(doc => {
                    students.push({
                        id: doc.id,
                        ...doc.data()
                    });
                });
                
                return students;
            }
        } catch (error) {
            console.error('Error getting class students:', error);
            throw error;
        }
    },

    // ==================== CLINIC MANAGEMENT ====================

    // Clinic Check-in/Check-out
    async recordClinicVisit(studentId, reason = '', notes = '', check_in = true) {
        try {
            if (window.USE_SUPABASE && window.supabaseClient) {
                const { data: student, error: studentErr } = await window.supabaseClient
                    .from('students')
                    .select('id,full_name,class_id')
                    .eq('id', studentId)
                    .single();
                if (studentErr || !student) {
                    throw new Error('Student not found');
                }
                const row = {
                    student_id: studentId,
                    reason: reason,
                    visit_time: new Date(),
                    notes: notes || '',
                    treated_by: this.currentUser.name || this.currentUser.id,
                    outcome: check_in ? 'checked_in' : 'checked_out'
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
                let teacherId = null;
                const { data: homeroom, error: hrErr } = await window.supabaseClient
                    .from('teachers')
                    .select('id')
                    .eq('class_id', student.class_id || '')
                    .eq('is_homeroom', true)
                    .limit(1);
                if (!hrErr && Array.isArray(homeroom) && homeroom.length > 0) {
                    teacherId = homeroom[0].id;
                }
                await this.createNotification({
                    type: this.NOTIFICATION_TYPES.CLINIC,
                    title: `Clinic ${check_in ? 'Visit' : 'Check-out'}`,
                    message: `${student.full_name || ''} has ${check_in ? 'checked into' : 'checked out from'} the clinic.${reason ? ' Reason: ' + reason : ''}`,
                    target_users: [student.parent_id, teacherId].filter(Boolean),
                    studentId: student.id,
                    studentName: student.full_name || '',
                    relatedRecord: inserted.id
                });
                return inserted.id;
            } else {
                const studentDoc = await db.collection('students').doc(studentId).get();
                if (!studentDoc.exists) {
                    throw new Error('Student not found');
                }
                const student = studentDoc.data();
                const clinicData = {
                    studentId: studentId,
                    studentName: student.name,
                    class_id: student.class_id,
                    check_in: check_in,
                    timestamp: SupabaseFieldValue.serverTimestamp(),
                    reason: reason,
                    notes: notes,
                    staffId: this.currentUser.id,
                    staffName: this.currentUser.name
                };
                const clinicRef = await db.collection('clinicVisits').add(clinicData);
                await db.collection('students').doc(studentId).update({
                    currentStatus: check_in ? 'in_clinic' : 'in_school',
                    lastClinicVisit: SupabaseFieldValue.serverTimestamp()
                });
                const teacherQuery = await db.collection('users')
                    .where('role', '==', this.USER_TYPES.TEACHER)
                    .where('class_id', '==', student.class_id)
                    .where('is_homeroom', '==', true)
                    .get();
                let teacherId = null;
                if (!teacherQuery.empty) {
                    teacherId = teacherQuery.docs[0].id;
                }
                await this.createNotification({
                    type: this.NOTIFICATION_TYPES.CLINIC,
                    title: `Clinic ${check_in ? 'Visit' : 'Check-out'}`,
                    message: `${student.name} has ${check_in ? 'checked into' : 'checked out from'} the clinic. ${reason ? `Reason: ${reason}` : ''}`,
                    target_users: [student.parentId, teacherId].filter(id => id),
                    studentId: studentId,
                    studentName: student.name,
                    relatedRecord: clinicRef.id
                });
                return clinicRef.id;
            }
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

            const announcement = {
                ...announcementData,
                createdBy: this.currentUser.id,
                createdByName: this.currentUser.name,
                created_at: new Date().toISOString(),
                is_active: true
            };

            const announcementRef = await db.collection('announcements').add(announcement);

            // Get target users based on audience
            let target_users = [];
            if (announcementData.audience === 'all') {
                const usersSnapshot = await db.collection('users').where('is_active', '==', true).get();
                target_users = usersSnapshot.docs.map(doc => doc.id);
            } else if (announcementData.audience === 'parents') {
                const parentsSnapshot = await db.collection('users').where('role', '==', 'parent').where('is_active', '==', true).get();
                target_users = parentsSnapshot.docs.map(doc => doc.id);
            } else if (announcementData.audience === 'teachers') {
                const teachersSnapshot = await db.collection('users').where('role', '==', 'teacher').where('is_active', '==', true).get();
                target_users = teachersSnapshot.docs.map(doc => doc.id);
            }

            // Create notifications for target users
            if (target_users.length > 0) {
                await this.createNotification({
                    type: this.NOTIFICATION_TYPES.ANNOUNCEMENT,
                    title: announcementData.title,
                    message: announcementData.message,
                    target_users: target_users,
                    relatedRecord: announcementRef.id,
                    isUrgent: announcementData.isUrgent || false
                });
            }

            console.log('Announcement created:', announcementRef.id);
            return announcementRef.id;
        } catch (error) {
            console.error('Error creating announcement:', error);
            throw error;
        }
    },

    // Get announcements
    async getAnnouncements(limit = 20) {
        try {
            const snapshot = await db.collection('announcements')
                .where('is_active', '==', true)
                .get();

            // Sort in memory
            const announcements = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            return announcements.sort((a, b) => 
                new Date(b.createdAt?.toDate()) - new Date(a.createdAt?.toDate())
            ).slice(0, limit);
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

            await db.collection('announcements').doc(announcementId).delete();
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
            let query = this.db.collection('attendance')
                .where('timestamp', '>=', startDate)
                .where('timestamp', '<=', endDate)
                .orderBy('timestamp', 'desc')
                .limit(limit);

            const snapshot = await query.get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error('Error getting attendance report:', error);
            return [];
        }
    },

    async getClinicReport(startDate, endDate, limit = 100) {
        try {
            let query = this.db.collection('clinicVisits')
                .where('timestamp', '>=', startDate)
                .where('timestamp', '<=', endDate)
                .orderBy('timestamp', 'desc')
                .limit(limit);

            const snapshot = await query.get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error('Error getting clinic report:', error);
            return [];
        }
    },

    async getStudentActivityReport(startDate, endDate, limit = 100) {
        try {
            // Combine attendance and clinic visits for comprehensive activity report
            const [attendanceSnapshot, clinicSnapshot] = await Promise.all([
                this.db.collection('attendance')
                    .where('timestamp', '>=', startDate)
                    .where('timestamp', '<=', endDate)
                    .orderBy('timestamp', 'desc')
                    .limit(limit / 2)
                    .get(),
                this.db.collection('clinicVisits')
                    .where('timestamp', '>=', startDate)
                    .where('timestamp', '<=', endDate)
                    .orderBy('timestamp', 'desc')
                    .limit(limit / 2)
                    .get()
            ]);

            const activities = [
                ...attendanceSnapshot.docs.map(doc => ({ 
                    id: doc.id, 
                    ...doc.data(),
                    type: 'attendance'
                })),
                ...clinicSnapshot.docs.map(doc => ({ 
                    id: doc.id, 
                    ...doc.data(),
                    type: 'clinic'
                }))
            ];

            // Sort by timestamp (newest first)
            return activities.sort((a, b) => 
                new Date(b.timestamp?.toDate()) - new Date(a.timestamp?.toDate())
            ).slice(0, limit);
        } catch (error) {
            console.error('Error getting student activity report:', error);
            throw error;
        }
    },

    async getLateArrivalsReport(startDate, endDate, limit = 100) {
        try {
            let query = this.db.collection('attendance')
                .where('timestamp', '>=', startDate)
                .where('timestamp', '<=', endDate)
                .where('status', '==', 'late')
                .orderBy('timestamp', 'desc')
                .limit(limit);

            const snapshot = await query.get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
            const snapshot = await this.db.collection('clinicVisits')
                .where('timestamp', '>=', startDate)
                .where('timestamp', '<=', endDate)
                .get();

            const visits = snapshot.docs.map(doc => doc.data());
            
            // Calculate common reasons
            const reasons = {};
            visits.forEach(visit => {
                const reason = visit.reason || 'Unknown';
                reasons[reason] = (reasons[reason] || 0) + 1;
            });

            // Get top reasons
            const topReasons = Object.entries(reasons)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([reason, count]) => ({ reason, count }));

            return {
                totalVisits: visits.length,
                uniqueStudents: new Set(visits.map(v => v.studentId)).size,
                topReasons,
                averageVisitDuration: this.calculateAverageVisitDuration(visits)
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
                checkOut.studentId === check_in.studentId && 
                this.isSameDay(check_in.timestamp, checkOut.timestamp)
            );

            if (correspondingCheckOut && check_in.timestamp && correspondingCheckOut.timestamp) {
                const duration = correspondingCheckOut.timestamp.toDate() - check_in.timestamp.toDate();
                totalDuration += duration;
                pairCount++;
            }
        });

        return pairCount > 0 ? Math.round(totalDuration / pairCount / (1000 * 60)) : 0; // Return in minutes
    },

    // Check if two timestamps are on the same day
    isSameDay(timestamp1, timestamp2) {
        if (!timestamp1 || !timestamp2) return false;
        
        const date1 = timestamp1.toDate().toDateString();
        const date2 = timestamp2.toDate().toDateString();
        return date1 === date2;
    },

    // Get late arrival statistics
    async getLateArrivalsStats(startDate, endDate) {
        try {
            const snapshot = await this.db.collection('attendance')
                .where('timestamp', '>=', startDate)
                .where('timestamp', '<=', endDate)
                .where('status', '==', 'late')
                .get();

            const lateArrivals = snapshot.docs.map(doc => doc.data());
            
            // Group by student
            const studentLateCounts = {};
            lateArrivals.forEach(arrival => {
                studentLateCounts[arrival.studentId] = (studentLateCounts[arrival.studentId] || 0) + 1;
            });

            // Get frequent late comers
            const frequentLateComers = Object.entries(studentLateCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10);

            // Get late arrival pattern by day of week
            const dayPattern = {
                'Monday': 0, 'Tuesday': 0, 'Wednesday': 0, 'Thursday': 0, 'Friday': 0, 'Saturday': 0, 'Sunday': 0
            };

            lateArrivals.forEach(arrival => {
                if (arrival.timestamp) {
                    const day = arrival.timestamp.toDate().toLocaleDateString('en-US', { weekday: 'long' });
                    dayPattern[day]++;
                }
            });

            return {
                totalLateArrivals: lateArrivals.length,
                frequentLateComers,
                dayPattern,
                averageLatePerStudent: lateArrivals.length / Object.keys(studentLateCounts).length || 0
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
            const attendanceData = await this.getAttendanceReport(startDate, endDate, 1000);
            
            // Group by date
            const dateGroups = {};
            const allStudents = await this.getStudents();
            const totalStudents = allStudents.length;

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

            while (currentDate <= end) {
                const dateString = currentDate.toDateString();
                const group = dateGroups[dateString] || {
                    present: new Set(),
                    absent: new Set(),
                    late: new Set(),
                    clinic: new Set()
                };

                const isSchoolDay = this.isSchoolDay(currentDate);
                const presentCount = isSchoolDay ? (group.present.size + group.late.size) : 0;
                const absentCount = isSchoolDay ? Math.max(0, totalStudents - presentCount - group.clinic.size) : 0;
                const labelBase = currentDate.toLocaleDateString('en-US', { 
                    weekday: 'short', 
                    month: 'short', 
                    day: 'numeric' 
                });
                labels.push(isSchoolDay ? labelBase : `${labelBase} (No School)`);
                
                presentData.push(presentCount);
                absentData.push(absentCount);
                lateData.push(isSchoolDay ? group.late.size : 0);
                clinicData.push(isSchoolDay ? group.clinic.size : 0);

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
                totalStudents
            };
        } catch (error) {
            console.error('Error getting attendance trend:', error);
            throw error;
        }
    },

    // Enhanced status distribution with real data
    async getStatusDistribution(startDate, endDate) {
        try {
            if (window.USE_SUPABASE && window.supabaseClient) {
                const [{ data: attendanceData }, { data: clinicData }, studentCountRes] = await Promise.all([
                    window.supabaseClient
                        .from('attendance')
                        .select('studentId,status,timestamp,entry_type')
                        .gte('timestamp', startDate instanceof Date ? startDate.toISOString() : new Date(startDate).toISOString())
                        .lte('timestamp', endDate instanceof Date ? endDate.toISOString() : new Date(endDate).toISOString()),
                    window.supabaseClient
                        .from('clinicVisits')
                        .select('studentId,timestamp,check_in')
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
                    if (record.status === 'present') {
                        presentStudents.add(record.studentId);
                    } else if (record.status === 'late') {
                        lateStudents.add(record.studentId);
                        presentStudents.add(record.studentId);
                    }
                });
                (clinicData || []).forEach(visit => {
                    clinicStudents.add(visit.studentId);
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
            }
            const [attendanceSnapshot, clinicSnapshot, studentSnapshot] = await Promise.all([
                this.db.collection('attendance')
                    .where('timestamp', '>=', startDate)
                    .where('timestamp', '<=', endDate)
                    .get(),
                this.db.collection('clinicVisits')
                    .where('timestamp', '>=', startDate)
                    .where('timestamp', '<=', endDate)
                    .where('check_in', '==', true)
                    .get(),
                this.db.collection('students').get()
            ]);

            const totalStudents = studentSnapshot.size;
            const attendanceData = attendanceSnapshot.docs.map(doc => doc.data());
            const clinicVisits = clinicSnapshot.docs.map(doc => doc.data());

            // Calculate unique students for each status
            const presentStudents = new Set();
            const lateStudents = new Set();
            const clinicStudents = new Set();

            attendanceData.forEach(record => {
                if (record.status === 'present') {
                    presentStudents.add(record.studentId);
                } else if (record.status === 'late') {
                    lateStudents.add(record.studentId);
                }
            });

            clinicVisits.forEach(visit => {
                clinicStudents.add(visit.studentId);
            });

            const presentCount = presentStudents.size;
            const lateCount = lateStudents.size;
            const clinicCount = clinicStudents.size;
            const absentCount = Math.max(0, totalStudents - presentCount - lateCount - clinicCount);

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
            if (window.USE_SUPABASE && window.supabaseClient) {
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
                        .from('clinicVisits')
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
                while (current <= end) {
                    const key = current.toDateString();
                    const group = dateGroups[key] || { present: new Set(), late: new Set(), clinic: new Set() };
                    const isSchoolDay = this.isSchoolDay(current);
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
            }
            const db = firebase.firestore();

            const [attendanceSnapshot, clinicSnapshot, studentsSnapshot] = await Promise.all([
                db.collection('attendance')
                    .where('classId', '==', classId)
                    .where('timestamp', '>=', startDate)
                    .where('timestamp', '<=', endDate)
                    .get(),
                db.collection('clinicVisits')
                    .where('classId', '==', classId)
                    .where('timestamp', '>=', startDate)
                    .where('timestamp', '<=', endDate)
                    .where('check_in', '==', true)
                    .get(),
                db.collection('students')
                    .where('classId', '==', classId)
                    .where('is_active', '==', true)
                    .get()
            ]);

            const totalStudents = studentsSnapshot.size;

            const dateGroups = {};
            attendanceSnapshot.forEach(doc => {
                const data = doc.data();
                if (!data.timestamp) return;
                const dateKey = data.timestamp.toDate().toDateString();
                if (!dateGroups[dateKey]) {
                    dateGroups[dateKey] = {
                        present: new Set(),
                        late: new Set(),
                        clinic: new Set()
                    };
                }
                if (data.entry_type === 'entry') {
                    if (data.status === 'late') {
                        dateGroups[dateKey].late.add(data.studentId);
                    } else if (data.status === 'present') {
                        dateGroups[dateKey].present.add(data.studentId);
                    }
                }
            });

            clinicSnapshot.forEach(doc => {
                const data = doc.data();
                if (!data.timestamp) return;
                const dateKey = data.timestamp.toDate().toDateString();
                if (!dateGroups[dateKey]) {
                    dateGroups[dateKey] = {
                        present: new Set(),
                        late: new Set(),
                        clinic: new Set()
                    };
                }
                dateGroups[dateKey].clinic.add(data.studentId);
            });

            const labels = [];
            const presentData = [];
            const absentData = [];
            const lateData = [];
            const clinicData = [];

            const current = new Date(startDate);
            const end = new Date(endDate);
            while (current <= end) {
                const key = current.toDateString();
                const group = dateGroups[key] || { present: new Set(), late: new Set(), clinic: new Set() };
                const isSchoolDay = this.isSchoolDay(current);
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
            if (window.USE_SUPABASE && window.supabaseClient) {
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
                    const studentId = r.student_id || r.studentId;
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
                        .select('id,first_name,last_name,name')
                        .in('id', ids);
                    if (studentErr) {
                        throw studentErr;
                    }
                    (students || []).forEach(s => {
                        const name = [s.first_name, s.last_name].filter(Boolean).join(' ') || s.name || s.id;
                        namesById[s.id] = name;
                    });
                }

                const result = [];
                for (const [studentId, lateCount] of counts.entries()) {
                    result.push({ studentId, studentName: namesById[studentId] || studentId, lateCount });
                }
                result.sort((a, b) => b.lateCount - a.lateCount);
                return result.slice(0, limit);
            }
            const db = firebase.firestore();
            const snapshot = await db.collection('attendance')
                .where('classId', '==', classId)
                .where('timestamp', '>=', startDate)
                .where('timestamp', '<=', endDate)
                .where('entry_type', '==', 'entry')
                .get();

            const counts = new Map();
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.status === 'late') {
                    counts.set(data.studentId, (counts.get(data.studentId) || 0) + 1);
                }
            });

            // Attach names
            const result = [];
            for (const [studentId, lateCount] of counts.entries()) {
                const studentDoc = await db.collection('students').doc(studentId).get();
                const name = studentDoc.exists ? studentDoc.data().name : studentId;
                result.push({ studentId, studentName: name, lateCount });
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
            if (window.USE_SUPABASE && window.supabaseClient) {
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
                        .from('clinicVisits')
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
                        const studentId = r.student_id || r.studentId;
                        if (!studentId) return;
                        if (r.status === 'late') lateSet.add(studentId);
                        if (r.status === 'present') presentSet.add(studentId);
                    }
                });
                (clinicRes.data || []).forEach(v => {
                    const studentId = v.student_id || v.studentId;
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
            }
            const db = firebase.firestore();
            const [attendanceSnapshot, clinicSnapshot, studentsSnapshot] = await Promise.all([
                db.collection('attendance')
                    .where('classId', '==', classId)
                    .where('timestamp', '>=', startDate)
                    .where('timestamp', '<=', endDate)
                    .get(),
                db.collection('clinicVisits')
                    .where('classId', '==', classId)
                    .where('timestamp', '>=', startDate)
                    .where('timestamp', '<=', endDate)
                    .where('check_in', '==', true)
                    .get(),
                db.collection('students')
                    .where('classId', '==', classId)
                    .where('is_active', '==', true)
                    .get()
            ]);

            const totalStudents = studentsSnapshot.size;
            const presentSet = new Set();
            const lateSet = new Set();
            const clinicSet = new Set();

            attendanceSnapshot.forEach(doc => {
                const r = doc.data();
                if (r.entry_type === 'entry') {
                    if (r.status === 'late') lateSet.add(r.student_id);
                    if (r.status === 'present') presentSet.add(r.student_id);
                }
            });
            clinicSnapshot.forEach(doc => {
                const v = doc.data();
                clinicSet.add(v.student_id);
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
            if (window.USE_SUPABASE && window.supabaseClient) {
                const start = startDate instanceof Date ? new Date(startDate) : new Date(startDate);
                const endDate = new Date(start);
                endDate.setDate(endDate.getDate() + 6);
                const startIso = start.toISOString();
                const endIso = endDate.toISOString();

                const [studentsRes, attendanceRes] = await Promise.all([
                    window.supabaseClient
                        .from('students')
                        .select('id,first_name,last_name,name')
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
                    name: [s.first_name, s.last_name].filter(Boolean).join(' ') || s.name || s.id
                }));

                const grid = new Map();
                (attendanceRes.data || []).forEach(r => {
                    if (!r.timestamp || r.entry_type !== 'entry') return;
                    const ts = r.timestamp && r.timestamp.toDate ? r.timestamp.toDate() : r.timestamp;
                    const dayKey = new Date(ts).toDateString();
                    const studentId = r.student_id || r.studentId;
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
            }
            const db = firebase.firestore();
            const endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 6);

            const [studentsSnapshot, attendanceSnapshot] = await Promise.all([
                db.collection('students')
                    .where('classId', '==', classId)
                    .where('is_active', '==', true)
                    .get(),
                db.collection('attendance')
                    .where('classId', '==', classId)
                    .where('timestamp', '>=', startDate)
                    .where('timestamp', '<=', endDate)
                    .get()
            ]);

            const students = studentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const grid = new Map(); // studentId -> dayKey -> status
            attendanceSnapshot.forEach(doc => {
                const r = doc.data();
                if (!r.timestamp || r.entry_type !== 'entry') return;
                const dayKey = r.timestamp.toDate().toDateString();
                const cur = grid.get(r.student_id) || {};
                cur[dayKey] = r.status;
                grid.set(r.student_id, cur);
            });

            const days = [];
            const cursor = new Date(startDate);
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
            const db = firebase.firestore();
            const snapshot = await db.collection('attendance')
                .where('studentId', '==', studentId)
                .where('timestamp', '>=', startDate)
                .where('timestamp', '<=', endDate)
                .get();

            const days = new Map(); // dateKey -> {present:boolean, late:boolean, clinic:boolean}
            snapshot.forEach(doc => {
                const r = doc.data();
                if (!r.timestamp || r.entry_type !== 'entry') return;
                const key = r.timestamp.toDate().toDateString();
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
            if (window.USE_SUPABASE && window.supabaseClient) {
                const [{ data: students }, { data: attendance }] = await Promise.all([
                    window.supabaseClient
                        .from('students')
                        .select('id,first_name,last_name,class_id'),
                    window.supabaseClient
                        .from('attendance')
                        .select('student_id,class_id,status,entry_type,timestamp')
                        .gte('timestamp', startDate instanceof Date ? startDate.toISOString() : new Date(startDate).toISOString())
                        .lte('timestamp', endDate instanceof Date ? endDate.toISOString() : new Date(endDate).toISOString())
                ]);
                const filteredStudents = (students || []).filter(s => !classId || s.class_id === classId);
                const perStudentDays = new Map();
                (attendance || []).forEach(r => {
                    if (!r.timestamp || r.entry_type !== 'entry') return;
                    const ts = r.timestamp && r.timestamp.toDate ? r.timestamp.toDate() : r.timestamp;
                    const key = new Date(ts).toDateString();
                    const map = perStudentDays.get(r.student_id) || new Map();
                    const info = map.get(key) || { present: false, late: false };
                    if (r.status === 'late') info.late = true;
                    if (r.status === 'present' || r.status === 'late') info.present = true;
                    map.set(key, info);
                    perStudentDays.set(r.student_id, map);
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
                            if (!info || !info.present) absentDays++; else { presentDays++; if (info.late) lateDays++; }
                        }
                        cursor.setDate(cursor.getDate() + 1);
                    }
                    const riskScore = absentDays * 2 + lateDays;
                    const severity = riskScore >= 4 || absentDays >= 2 ? 'critical' : (riskScore >= 2 ? 'warning' : 'normal');
                    const reasons = [];
                    if (absentDays >= 2) reasons.push(`${absentDays} absences`);
                    if (lateDays >= 3) reasons.push(`${lateDays} lates`);
                    if (severity !== 'normal') {
                        const name = [s.first_name, s.last_name].filter(Boolean).join(' ');
                        risks.push({ studentId: s.id, studentName: name, class_id: s.class_id, absentDays, lateDays, riskScore, severity, reasons });
                    }
                }
                risks.sort((a, b) => b.riskScore - a.riskScore);
                return risks.slice(0, limit);
            }
            const db = firebase.firestore();
            let studentsQuery = db.collection('students');
            if (classId) studentsQuery = studentsQuery.where('classId', '==', classId);
            const studentsSnapshot = await studentsQuery.get();
            const students = studentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            let attendanceQuery = db.collection('attendance')
                .where('timestamp', '>=', startDate)
                .where('timestamp', '<=', endDate);
            if (classId) attendanceQuery = attendanceQuery.where('classId', '==', classId);
            const attendanceSnapshot = await attendanceQuery.get();

            const perStudentDays = new Map();
            attendanceSnapshot.forEach(doc => {
                const r = doc.data();
                if (!r.timestamp || r.entry_type !== 'entry') return;
                const timestamp = r.timestamp instanceof Date ? r.timestamp : r.timestamp.toDate();
                const key = timestamp.toDateString();
                const map = perStudentDays.get(r.student_id) || new Map();
                const info = map.get(key) || { present: false, late: false };
                if (r.status === 'late') info.late = true;
                if (r.status === 'present' || r.status === 'late') info.present = true;
                map.set(key, info);
                perStudentDays.set(r.student_id, map);
            });

            const start = new Date(startDate);
            const end = new Date(endDate);
            const risks = [];
            for (const s of students) {
                let lateDays = 0, presentDays = 0, absentDays = 0;
                const map = perStudentDays.get(s.id) || new Map();
                const cursor = new Date(start);
                while (cursor <= end) {
                    if (this.isSchoolDay(cursor)) {
                        const info = map.get(cursor.toDateString());
                        if (!info || !info.present) absentDays++; else { presentDays++; if (info.late) lateDays++; }
                    }
                    cursor.setDate(cursor.getDate() + 1);
                }
                const riskScore = absentDays * 2 + lateDays;
                const severity = riskScore >= 4 || absentDays >= 2 ? 'critical' : (riskScore >= 2 ? 'warning' : 'normal');
                const reasons = [];
                if (absentDays >= 2) reasons.push(`${absentDays} absences`);
                if (lateDays >= 3) reasons.push(`${lateDays} lates`);
                if (severity !== 'normal') {
                    const name = s.name || [s.first_name, s.last_name].filter(Boolean).join(' ');
                    risks.push({ studentId: s.id, studentName: name, class_id: s.classId || s.class_id, absentDays, lateDays, riskScore, severity, reasons });
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
                validatedAt: SupabaseFieldValue.serverTimestamp()
            };

            if (window.USE_SUPABASE && window.supabaseClient) {
                const { data: visit, error: vErr } = await window.supabaseClient
                    .from('clinicVisits')
                    .select('studentId, studentName')
                    .eq('id', visitId)
                    .single();
                
                if (vErr || !visit) throw new Error('Visit not found');

                const { error: upErr } = await window.supabaseClient
                    .from('clinicVisits')
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
            } else {
                const db = firebase.firestore();
                const visitRef = db.collection('clinicVisits').doc(visitId);
                const visitDoc = await visitRef.get();
                if (!visitDoc.exists) throw new Error('Visit not found');
                const visit = visitDoc.data();
                
                await visitRef.update(updateData);

                const target_users = [];
                if (visit.studentId) {
                    const studentDoc = await db.collection('students').doc(visit.studentId).get();
                    if (studentDoc.exists) {
                        const student = studentDoc.data();
                        if (student.parentId) target_users.push(student.parentId);
                    }
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
            }
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

            if (window.USE_SUPABASE && window.supabaseClient) {
                const { data, error } = await window.supabaseClient
                    .from('clinicVisits')
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
            } else {
                const db = firebase.firestore();
                const snapshot = await db.collection('clinicVisits')
                    .where('timestamp', '>=', startDate)
                    .where('timestamp', '<=', endDate)
                    .where('check_in', '==', true)
                    .get();
                
                snapshot.forEach(doc => {
                    const r = doc.data();
                    const label = normalize(r.reason);
                    if (!label) return;
                    counts.set(label, (counts.get(label) || 0) + 1);
                });
            }

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

            if (window.USE_SUPABASE && window.supabaseClient) {
                const { data, error } = await window.supabaseClient
                    .from('clinicVisits')
                    .select('reason')
                    .eq('class_id', classId) // Supabase usually uses class_id
                    .gte('timestamp', startDate.toISOString())
                    .lte('timestamp', endDate.toISOString())
                    .eq('check_in', true);
                
                if (error) throw error;
                
                (data || []).forEach(r => {
                    const label = normalize(r.reason);
                    if (!label) return;
                    counts.set(label, (counts.get(label) || 0) + 1);
                });
            } else {
                const db = firebase.firestore();
                const snapshot = await db.collection('clinicVisits')
                    .where('classId', '==', classId)
                    .where('timestamp', '>=', startDate)
                    .where('timestamp', '<=', endDate)
                    .where('check_in', '==', true)
                    .get();
                
                snapshot.forEach(doc => {
                    const r = doc.data();
                    const label = normalize(r.reason);
                    if (!label) return;
                    counts.set(label, (counts.get(label) || 0) + 1);
                });
            }

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
            
            if (window.USE_SUPABASE && window.supabaseClient) {
                const { data, error } = await window.supabaseClient
                    .from('excuseLetters')
                    .select('reason')
                    .gte('submitted_at', startDate.toISOString())
                    .lte('submitted_at', endDate.toISOString())
                    .eq('type', 'absence');
                
                if (error) throw error;
                
                (data || []).forEach(r => {
                    if (r.reason) counts.set(r.reason, (counts.get(r.reason) || 0) + 1);
                });
            } else {
                const db = firebase.firestore();
                const snapshot = await db.collection('excuseLetters')
                    .where('submitted_at', '>=', startDate)
                    .where('submitted_at', '<=', endDate)
                    .where('type', '==', 'absence')
                    .get();
                snapshot.forEach(doc => {
                    const r = doc.data();
                    if (r.reason) counts.set(r.reason, (counts.get(r.reason) || 0) + 1);
                });
            }

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

            if (window.USE_SUPABASE && window.supabaseClient) {
                const { data, error } = await window.supabaseClient
                    .from('excuseLetters')
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
            } else {
                const db = firebase.firestore();
                const snapshot = await db.collection('excuseLetters')
                    .where('submitted_at', '>=', startDate)
                    .where('submitted_at', '<=', endDate)
                    .where('type', '==', 'absence')
                    .get();
                snapshot.forEach(doc => {
                    const s = doc.data().status;
                    if (s === 'approved') approved++;
                    else if (s === 'rejected') rejected++;
                    else pending++;
                });
            }
            return { approved, rejected, pending };
        } catch (error) {
            console.error('Error getting excused vs unexcused:', error);
            return { approved: 0, rejected: 0, pending: 0 };
        }
    },

    async getClinicReasonDetails({ startDate, endDate, reason, classId = null, limit = 100 }) {
        try {
            if (window.USE_SUPABASE && window.supabaseClient) {
                let query = window.supabaseClient
                    .from('clinicVisits')
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
                
                const studentIds = Array.from(new Set(visits.map(v => v.studentId).filter(Boolean)));
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
                
                return visits.map(v => ({
                    id: v.id,
                    studentId: v.studentId,
                    studentName: v.studentName,
                    classId: v.class_id || (students[v.studentId]?.class_id || null),
                    grade: students[v.studentId]?.grade || null,
                    reason: v.reason || '',
                    notes: v.notes || '',
                    teacherValidationStatus: v.teacherValidationStatus || 'pending',
                    validatedByName: v.validatedByName || '',
                    timestamp: v.timestamp ? new Date(v.timestamp) : null
                }));
            } else {
                const db = firebase.firestore();
                let query = db.collection('clinicVisits')
                    .where('timestamp', '>=', startDate)
                    .where('timestamp', '<=', endDate)
                    .where('reason', '==', reason);
                if (classId) {
                    query = query.where('classId', '==', classId);
                }
                const snapshot = await query.orderBy('timestamp', 'desc').limit(limit).get();
                const visits = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                const studentIds = Array.from(new Set(visits.map(v => v.studentId).filter(Boolean)));
                const students = {};
                await Promise.all(studentIds.map(async sid => {
                    const sdoc = await db.collection('students').doc(sid).get();
                    if (sdoc.exists) {
                        students[sid] = { id: sdoc.id, ...sdoc.data() };
                    }
                }));
                return visits.map(v => ({
                    id: v.id,
                    studentId: v.studentId,
                    studentName: v.studentName,
                    classId: v.classId || (students[v.studentId]?.classId || null),
                    grade: students[v.studentId]?.grade || null,
                    reason: v.reason || '',
                    notes: v.notes || '',
                    teacherValidationStatus: v.teacherValidationStatus || 'pending',
                    validatedByName: v.validatedByName || '',
                    timestamp: v.timestamp || null
                }));
            }
        } catch (error) {
            console.error('Error getting clinic reason details:', error);
            return [];
        }
    },

    async getAbsenceReasonDetails({ startDate, endDate, reason, status = null, limit = 100 }) {
        try {
            if (window.USE_SUPABASE && window.supabaseClient) {
                let query = window.supabaseClient
                    .from('excuseLetters')
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
            } else {
                const db = firebase.firestore();
                let query = db.collection('excuseLetters')
                    .where('submitted_at', '>=', startDate)
                    .where('submitted_at', '<=', endDate)
                    .where('type', '==', 'absence')
                    .where('reason', '==', reason);
                if (status) {
                    query = query.where('status', '==', status);
                }
                const snapshot = await query.orderBy('submitted_at', 'desc').limit(limit).get();
                const letters = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                const studentIds = Array.from(new Set(letters.map(l => l.studentId).filter(Boolean)));
                const students = {};
                await Promise.all(studentIds.map(async sid => {
                    const sdoc = await db.collection('students').doc(sid).get();
                    if (sdoc.exists) {
                        students[sid] = { id: sdoc.id, ...sdoc.data() };
                    }
                }));
                return letters.map(l => ({
                    id: l.id,
                    studentId: l.studentId,
                    studentName: l.studentName,
                    classId: students[l.studentId]?.classId || null,
                    grade: students[l.studentId]?.grade || null,
                    reason: l.reason || '',
                    status: l.status || 'pending',
                    submitted_at: l.submitted_at || null
                }));
            }
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
                if (window.USE_SUPABASE && window.supabaseClient) {
                    // Get homeroom teachers
                    const { data: homeroom, error: hrError } = await window.supabaseClient
                        .from('teachers')
                        .select('id')
                        .eq('class_id', studentClassId)
                        .eq('is_homeroom', true);
                    
                    if (!hrError && homeroom) {
                        homeroom.forEach(t => ids.push(t.id));
                    }

                    // Get subject teachers
                    const { data: classData } = await window.supabaseClient
                        .from('classes')
                        .select('subjects')
                        .eq('id', studentClassId)
                        .single();
                        
                    const subjects = classData?.subjects || [];
                    if (subjects.length > 0) {
                        const { data: subjectTeachers, error: stError } = await window.supabaseClient
                        .from('profiles')
                        .select('id')
                        .eq('role', this.USER_TYPES.TEACHER)
                        .contains('assigned_classes', [studentClassId]);
                            
                        if (!stError && subjectTeachers) {
                            subjectTeachers.forEach(t => ids.push(t.id));
                        }
                    }

                } else {
                    const homeroomSnap = await db.collection('users')
                        .where('role', '==', this.USER_TYPES.TEACHER)
                        .where('class_id', '==', studentClassId)
                        .where('is_homeroom', '==', true)
                        .get();
                    homeroomSnap.forEach(doc => ids.push(doc.id));

                    const classDoc = await db.collection('classes').doc(studentClassId).get();
                    const subjects = classDoc.exists ? (classDoc.data().subjects || []) : [];
                    if (subjects.length > 0) {
                        const subjectsSnap = await db.collection('users')
                            .where('role', '==', this.USER_TYPES.TEACHER)
                            .where('assigned_classes', 'array-contains', studentClassId)
                            .get();
                        subjectsSnap.forEach(doc => ids.push(doc.id));
                    }
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
                this.getCollectionCount('clinicVisits', [
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
    async getUserById(userId) {
        try {
            if (window.USE_SUPABASE && window.supabaseClient) {
                const { data, error } = await window.supabaseClient
                    .from('profiles')
                    .select('*')
                    .eq('id', userId)
                    .single();
                if (error || !data) return null;
                return { id: data.id, ...data };
            } else {
                const userDoc = await db.collection('users').doc(userId).get();
                return userDoc.exists ? { id: userDoc.id, ...userDoc.data() } : null;
            }
        } catch (error) {
            console.error('Error getting user:', error);
            return null;
        }
    },

    async getClassById(classId) {
        try {
            if (window.USE_SUPABASE && window.supabaseClient) {
                const { data, error } = await window.supabaseClient
                    .from('classes')
                    .select('*')
                    .eq('id', classId)
                    .single();
                if (error || !data) return null;
                return { id: data.id, ...data };
            } else {
                const classDoc = await db.collection('classes').doc(classId).get();
                return classDoc.exists ? { id: classDoc.id, ...classDoc.data() } : null;
            }
        } catch (error) {
            console.error('Error getting class:', error);
            return null;
        }
    },

    // Get student by ID
    async getStudentById(studentId) {
        try {
            if (window.USE_SUPABASE && window.supabaseClient) {
                const { data, error } = await window.supabaseClient
                    .from('students')
                    .select('*')
                    .eq('id', studentId)
                    .single();
                if (error || !data) return null;
                return { id: data.id, ...data };
            } else {
                const studentDoc = await this.db.collection('students').doc(studentId).get();
                return studentDoc.exists ? { id: studentDoc.id, ...studentDoc.data() } : null;
            }
        } catch (error) {
            console.error('Error getting student:', error);
            return null;
        }
    },

    // Cleanup
    destroy() {
        // Unsubscribe from real-time listeners
        if (this.notificationsListener && typeof this.notificationsListener === 'function') {
            try {
                this.notificationsListener();
            } catch (error) {
                console.warn('Error unsubscribing notifications listener:', error);
            }
        } else if (this.notificationsListener && typeof this.notificationsListener.unsubscribe === 'function') {
            // Handle Supabase subscription
            try {
                this.notificationsListener.unsubscribe();
            } catch (error) {
                console.warn('Error unsubscribing Supabase notifications listener:', error);
            }
        }
        
        // Reset notificationsListener
        this.notificationsListener = null;
        
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
