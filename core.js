// core.js - EducareTrack Central System Core
// OPTIMIZED VERSION for Fast Performance
// COMPLETE K-12 CURRICULUM SUPPORT WITH REPORTS & ANALYTICS

// NEW Firebase configuration - Updated with your new project
const firebaseConfig = {
    apiKey: "AIzaSyDdinBZ5X7CbjVHYlE63qWPasSdCOxdBrc",
    authDomain: "final-educare-track.firebaseapp.com",
    projectId: "final-educare-track",
    storageBucket: "final-educare-track.firebasestorage.app",
    messagingSenderId: "845023655182",
    appId: "1:845023655182:web:d3a30337295ba200d1935f"
};

// Initialize Firebase with error handling
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Safe storage initialization - check if storage is available
let storage = null;
try {
    if (firebase.storage) {
        storage = firebase.storage();
    } else {
        console.warn('Firebase Storage not available - photo uploads disabled');
    }
} catch (error) {
    console.warn('Firebase Storage initialization failed:', error);
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
        Senior_High_School: 'Senior High'
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
        const sidebar = document.createElement('div');
        sidebar.id = 'notificationSidebar';
        sidebar.className = 'fixed top-0 right-0 h-full w-96 max-w-full bg-white shadow-2xl border-l border-gray-200 z-50 hidden';
        sidebar.innerHTML = `
            <div class="flex items-center justify-between px-4 py-3 border-b">
                <div class="flex items-center space-x-3">
                    <i class="fas fa-bell text-gray-700"></i>
                    <span class="text-sm font-semibold">Notifications</span>
                </div>
                <div class="flex items-center space-x-2">
                    <button id="markAllReadBtn" class="text-xs text-blue-600">Mark all read</button>
                    <a id="viewAllBtn" href="#" class="text-xs text-gray-600">View page</a>
                    <button id="closeSidebarBtn" class="text-xs text-gray-500">Close</button>
                </div>
            </div>
            <div id="notificationItems" class="overflow-y-auto h-full divide-y"></div>
        `;
        document.body.appendChild(sidebar);
        const panel = sidebar;
        const viewAllBtn = sidebar.querySelector('#viewAllBtn');
        const markAllReadBtn = sidebar.querySelector('#markAllReadBtn');
        const closeBtn = sidebar.querySelector('#closeSidebarBtn');
        const itemsEl = sidebar.querySelector('#notificationItems');

        const refresh = async () => {
            try {
                if (!this.currentUser) return;
                const list = await this.getNotificationsForUser(this.currentUser.id, false, 50);
                itemsEl.innerHTML = '';
                list.forEach(n => {
                    const item = document.createElement('div');
                    const unread = !n.readBy || !n.readBy.includes(this.currentUser.id);
                    const bg = unread ? 'bg-gray-50' : 'bg-white';
                    item.className = `px-4 py-3 ${bg}`;
                    const t = n.title || 'Notification';
                    const m = n.message || '';
                    const dt = `${n.formattedDate || ''} ${n.formattedTime || ''}`.trim();
                    item.innerHTML = `
                        <div class="text-sm font-medium text-gray-800">${t}</div>
                        <div class="text-xs text-gray-600">${m}</div>
                        <div class="text-[10px] text-gray-400 mt-1">${dt}</div>
                    `;
                    itemsEl.appendChild(item);
                });
                this.updateNotificationBadge();
            } catch (_) {}
        };

        viewAllBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const role = this.currentUserRole || (this.currentUser && this.currentUser.role);
            let url = 'notifications.html';
            if (role === 'teacher') url = 'teacher/teacher-notifications.html';
            else if (role === 'parent') url = 'parent/parent-notifications.html';
            else if (role === 'admin') url = 'admin/admin-notifications.html';
            window.location.href = url;
        });
        markAllReadBtn.addEventListener('click', async () => {
            try { await this.markAllNotificationsAsRead(); await refresh(); } catch (_) {}
        });
        closeBtn.addEventListener('click', () => { panel.classList.add('hidden'); });
        window.addEventListener('educareTrack:openNotifications', async () => {
            panel.classList.remove('hidden');
            await refresh();
        });
        window.addEventListener('educareTrack:newNotifications', async () => { await refresh(); });
        this.notificationBoxInitialized = true;
    },

    appendToNotificationBox(notification) {
        if (!notification || !document.getElementById('notificationItems')) return;
        const key = `${notification.title || ''}|${notification.message || ''}|${notification.type || ''}|${notification.studentId || ''}`;
        const now = Date.now();
        const last = this.recentNotificationKeys[key] || 0;
        if (now - last < this.popupThrottleMs) return;
        this.recentNotificationKeys[key] = now;
        const items = document.getElementById('notificationItems');
        const item = document.createElement('div');
        const t = notification.title || 'Notification';
        const m = notification.message || '';
        const time = new Date().toLocaleTimeString();
        const color = notification.type === 'urgent' ? 'bg-red-50' : 'bg-white';
        item.className = `px-3 py-2 ${color}`;
        item.innerHTML = `
            <div class="text-sm font-medium text-gray-800">${t}</div>
            <div class="text-xs text-gray-600">${m}</div>
            <div class="text-[10px] text-gray-400 mt-1">${time}</div>
        `;
        items.prepend(item);
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
        this.notificationsListener = db.collection('notifications')
            .where('targetUsers', 'array-contains', this.currentUser.id)
            .where('isActive', '==', true)
            .orderBy('createdAt', 'desc')
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
                        const notification = { id: change.doc.id, ...change.doc.data() };
                        if (!notification.readBy || !notification.readBy.includes(this.currentUser.id)) {
                            newNotifications.push(notification);
                        }
                    }
                }
                if (newNotifications.length > 0) {
                    this.handleNewNotifications(newNotifications);
                }
            }, error => {
                console.error('Notifications listener error:', error);
            });
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
        if (studentData.level === this.STUDENT_LEVELS.SENIOR_HIGH && !studentData.strand) {
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
            const snapshot = await db.collection('users')
                .where('role', '==', this.USER_TYPES.TEACHER)
                .where('assignedSubjects', 'array-contains', subject)
                .where('assignedClasses', 'array-contains', classId)
                .where('isActive', '==', true)
                .get();

            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error('Error getting subject teachers:', error);
            return [];
        }
    },

    // ==================== USER MANAGEMENT ====================

    async login(userId, role = null) {
        try {
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

            localStorage.setItem('educareTrack_user', JSON.stringify(this.currentUser));
            sessionStorage.setItem('educareTrack_user', JSON.stringify(this.currentUser));
            
            // Initialize notification permissions and listeners for new user
            if (this.config.enableNotificationPermissionPrompt) { await this.initializeNotificationPermissions(); }
            this.initEssentialListeners();

            console.log(`User logged in: ${userData.name}`);
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
            // Use Promise.all for parallel queries
            const [studentsCount, teachersCount, parentsCount, classesCount, todayCount] = await Promise.all([
                this.getCollectionCount('students', [['isActive', '==', true]]),
                this.getCollectionCount('users', [['role', '==', 'teacher'], ['isActive', '==', true]]),
                this.getCollectionCount('users', [['role', '==', 'parent'], ['isActive', '==', true]]),
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
            let query = db.collection(collectionName);
            conditions.forEach(condition => {
                query = query.where(...condition);
            });
            
            const snapshot = await query.get();
            return snapshot.size;
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
            
            const snapshot = await db.collection('attendance')
                .where('timestamp', '>=', today)
                .where('entryType', '==', 'entry')
                .get();
                
            return snapshot.size;
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
                isActive: true,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
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
                                isActive: true,
                                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
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
                classId: resolvedClassId,
                parentId: parentId,
                photoUrl: photoUrl,
                qrCode: studentId,
                currentStatus: 'out_school',
                isActive: true,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
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
        } catch (error) {
            console.error('Error enrolling student:', error);
            throw error;
        }
    },

    // Generate unique user ID based on role
    generateUserId(role) {
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

    // Upload student photo to Firebase Storage (only if storage is available)
    async uploadStudentPhoto(photoFile, studentId) {
        try {
            // Check if storage is available
            if (!this.storage) {
                throw new Error('Firebase Storage is not available. Please include the Firebase Storage script.');
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

            const classDoc = {
                ...classData,
                subjects: this.getSubjectsForLevel(classData.level, classData.strand, classData.grade),
                isActive: true,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: this.currentUser.id
            };

            const classRef = await db.collection('classes').add(classDoc);
            this.clearCache(); // Clear cache
            
            console.log(`Class created: ${classData.name} with ${classDoc.subjects.length} subjects`);
            return classRef.id;
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
            const snapshot = await db.collection('users')
                .where('isActive', '==', true)
                .limit(100) // Limit results
                .get();
                
            dataCache.users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            dataCache.lastUpdated = Date.now();
            return dataCache.users;
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
            const snapshot = await db.collection('students')
                .where('isActive', '==', true)
                .limit(200) // Limit results
                .get();
                
            dataCache.students = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
            const snapshot = await db.collection('classes').limit(50).get();
            dataCache.classes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
            let query = db.collection('students')
                .where('level', '==', level)
                .where('isActive', '==', true);

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
            const snapshot = await db.collection('students')
                .where('isActive', '==', true)
                .orderBy('createdAt', 'desc')
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
            const snapshot = await db.collection('attendance')
                .orderBy('timestamp', 'desc')
                .limit(limit)
                .get();
                
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
            
            const snapshot = await this.db.collection('students')
                .where('classId', '==', classId)
                .where('isActive', '==', true)
                .get();

            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error('Error getting students by class:', error);
            return [];
        }
    },

    // ==================== PARENT-SPECIFIC METHODS ====================

    // Get students by parent ID
    async getStudentsByParent(parentId) {
        try {
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
                        .where('parentId', 'in', chunk)
                        .get()
                ));
                byParent = results.flatMap(snap => snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            } else {
                const byParentSnapshot = await db.collection('students')
                    .where('parentId', '==', parentId)
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
                        .where(firebase.firestore.FieldPath.documentId(), 'in', chunk)
                        .get()
                ));
                fromParentChildren = results2.flatMap(snap => snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            }

            const unique = new Map();
            byParent.forEach(s => { if (s.isActive !== false) unique.set(s.id, s); });
            fromParentChildren.forEach(s => { if (s.isActive !== false) unique.set(s.id, s); });

            return Array.from(unique.values());
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

            const chunks = [];
            for (let i = 0; i < childIds.length; i += 10) {
                chunks.push(childIds.slice(i, i + 10));
            }

            const notificationsPromises = chunks.map(chunk =>
                db.collection('notifications')
                    .where('studentId', 'in', chunk)
                    .get()
            );

            const attendancePromises = chunks.map(chunk =>
                db.collection('attendance')
                    .where('studentId', 'in', chunk)
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
                    title: `${child ? child.name : 'Student'} ${data.entryType === 'entry' ? 'entered' : 'left'} school`,
                    message: `Session: ${data.session}, Status: ${data.status}`,
                    timestamp: data.timestamp,
                    entryType: data.entryType,
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
            const snapshot = await db.collection('attendance')
                .where('studentId', '==', studentId)
                .orderBy('timestamp', 'desc')
                .limit(50)
                .get();

            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error('Error getting attendance by student:', error);
            return [];
        }
    },

    // Get clinic visits for a specific student
    async getClinicVisitsByStudent(studentId) {
        try {
            const snapshot = await db.collection('clinicVisits')
                .where('studentId', '==', studentId)
                .orderBy('timestamp', 'desc')
                .limit(50)
                .get();

            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error('Error getting clinic visits by student:', error);
            return [];
        }
    },

    // ==================== ENHANCED NOTIFICATION SYSTEM ====================

    // Notification System - ENHANCED VERSION
    async createNotification(notificationData) {
        try {
            const notification = {
                ...notificationData,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                readBy: [],
                isUrgent: notificationData.isUrgent || false,
                isActive: true
            };

            // Validate required fields
            if (!notification.targetUsers || notification.targetUsers.length === 0) {
                throw new Error('Notification must have target users');
            }

            const notificationRef = await db.collection('notifications').add(notification);
            console.log('Notification created:', notificationRef.id);
            
            // Trigger real-time update for connected clients
            this.handleNewNotifications([{ id: notificationRef.id, ...notification }]);
            
            return notificationRef.id;
        } catch (error) {
            console.error('Error creating notification:', error);
            throw error;
        }
    },

    async markNotificationAsRead(notificationId) {
        try {
            if (!this.currentUser) throw new Error('No user logged in');

            await db.collection('notifications').doc(notificationId).update({
                readBy: firebase.firestore.FieldValue.arrayUnion(this.currentUser.id)
            });

            console.log('Notification marked as read:', notificationId);
            
            // Update UI in real-time
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

            const batch = db.batch();
            
            notificationIds.forEach(notificationId => {
                const notificationRef = db.collection('notifications').doc(notificationId);
                batch.update(notificationRef, {
                    readBy: firebase.firestore.FieldValue.arrayUnion(this.currentUser.id)
                });
            });

            await batch.commit();
            console.log(`Marked ${notificationIds.length} notifications as read`);
            
            // Update UI
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
            // Use cached data if available to reduce database reads
            if (dataCache.notifications && dataCache.notifications.userId === userId) {
                const unreadCount = dataCache.notifications.data.filter(notification => 
                    !notification.readBy || !notification.readBy.includes(userId)
                ).length;
                return unreadCount;
            }

            // Get all notifications for the user
            const snapshot = await db.collection('notifications')
                .where('targetUsers', 'array-contains', userId)
                .where('isActive', '==', true)
                .get();

            const notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // Cache the results
            dataCache.notifications = {
                userId: userId,
                data: notifications,
                timestamp: Date.now()
            };

            // Filter unread notifications on the client side
            const unreadNotifications = notifications.filter(notification => 
                !notification.readBy || !notification.readBy.includes(userId)
            );

            return unreadNotifications.length;
        } catch (error) {
            console.error('Error getting unread notification count:', error);
            return 0;
        }
    },

    // Get notifications for user - ENHANCED VERSION
    async getNotificationsForUser(userId, unreadOnly = false, limit = 20) {
        try {
            let query = db.collection('notifications')
                .where('targetUsers', 'array-contains', userId)
                .where('isActive', '==', true)
                .orderBy('createdAt', 'desc')
                .limit(limit);

            const snapshot = await query.get();
            let notifications = snapshot.docs.map(doc => ({ 
                id: doc.id, 
                ...doc.data(),
                // Add formatted dates for easier display
                formattedDate: this.formatDate(doc.data().createdAt),
                formattedTime: this.formatTime(doc.data().createdAt)
            }));

            // Client-side filtering for unread notifications
            if (unreadOnly) {
                notifications = notifications.filter(notification => 
                    !notification.readBy || !notification.readBy.includes(userId)
                );
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
            const snapshot = await db.collection('notifications')
                .where('targetUsers', 'array-contains', userId)
                .where('type', '==', type)
                .where('isActive', '==', true)
                .orderBy('createdAt', 'desc')
                .limit(limit)
                .get();

            return snapshot.docs.map(doc => ({ 
                id: doc.id, 
                ...doc.data(),
                formattedDate: this.formatDate(doc.data().createdAt),
                formattedTime: this.formatTime(doc.data().createdAt)
            }));
        } catch (error) {
            console.error('Error getting notifications by type:', error);
            return [];
        }
    },

    // Get urgent notifications
    async getUrgentNotifications(userId, limit = 10) {
        try {
            const snapshot = await db.collection('notifications')
                .where('targetUsers', 'array-contains', userId)
                .where('isUrgent', '==', true)
                .where('isActive', '==', true)
                .orderBy('createdAt', 'desc')
                .limit(limit)
                .get();

            return snapshot.docs.map(doc => ({ 
                id: doc.id, 
                ...doc.data(),
                formattedDate: this.formatDate(doc.data().createdAt),
                formattedTime: this.formatTime(doc.data().createdAt)
            }));
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
                isActive: false,
                deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
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
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    readBy: [],
                    isUrgent: notificationData.isUrgent || false,
                    isActive: true
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
            await db.collection('users').doc(userId).update({
                notificationPreferences: preferences,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

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
    },

    // Show normal notification
    showNormalNotification(notification) {
        this.updateNotificationBadge();
    },

    // Show batch notification for multiple notifications
    showBatchNotification(count) {
        this.updateNotificationBadge();
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
        // Dispatch event to open notifications panel in UI
        if (window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('educareTrack:openNotifications'));
        }
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
    async recordAttendance(studentId, entryType = 'entry', timestamp = new Date()) {
        try {
            const studentDoc = await db.collection('students').doc(studentId).get();
            
            if (!studentDoc.exists) {
                throw new Error('Student not found');
            }

            const student = studentDoc.data();
            const timeString = timestamp.toTimeString().split(' ')[0].substring(0, 5);
            const session = this.getCurrentSession();
            const isLate = entryType === 'entry' && this.isLate(timeString);

            // Create attendance record
            const attendanceData = {
                studentId: studentId,
                studentName: student.name,
                classId: student.classId,
                entryType: entryType,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                time: timeString,
                session: session,
                status: isLate ? this.ATTENDANCE_STATUS.LATE : this.ATTENDANCE_STATUS.PRESENT,
                recordedBy: this.currentUser.id,
                recordedByName: this.currentUser.name
            };

            const attendanceRef = await db.collection('attendance').add(attendanceData);

            // Update student's current status
            await db.collection('students').doc(studentId).update({
                currentStatus: entryType === 'entry' ? 'in_school' : 'out_school',
                lastAttendance: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Create notification for parents
            await this.createNotification({
                type: this.NOTIFICATION_TYPES.ATTENDANCE,
                title: `Student ${entryType === 'entry' ? 'Arrival' : 'Departure'}`,
                message: `${student.name} has ${entryType === 'entry' ? 'entered' : 'left'} the school at ${timeString}`,
                targetUsers: [student.parentId],
                studentId: studentId,
                studentName: student.name,
                relatedRecord: attendanceRef.id
            });

            console.log(`Attendance recorded: ${student.name} - ${entryType} at ${timeString}`);

            // Sync with reports system
            await this.syncAttendanceToReports();

            return attendanceRef.id;
        } catch (error) {
            console.error('Error recording attendance:', error);
            throw error;
        }
    },

    // Enhanced guard attendance recording
    async recordGuardAttendance(studentId, student, entryType) {
        try {
            const timestamp = new Date();
            const timeString = timestamp.toTimeString().split(' ')[0].substring(0, 5);
            const session = this.getCurrentSession();
            
            // Use existing attendance logic for status calculation
            const isLate = entryType === 'entry' && this.isLate(timeString);
            const status = isLate ? this.ATTENDANCE_STATUS.LATE : this.ATTENDANCE_STATUS.PRESENT;

            const attendanceData = {
                studentId: studentId,
                studentName: student.name,
                classId: student.classId || '',
                entryType: entryType,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                time: timeString,
                session: session,
                status: status,
                recordedBy: this.currentUser.id,
                recordedByName: this.currentUser.name,
                manualEntry: false
            };

            const attendanceRef = await this.db.collection('attendance').add(attendanceData);

            // Update student status
            await this.db.collection('students').doc(studentId).update({
                currentStatus: entryType === 'entry' ? 'in_school' : 'out_school',
                lastAttendance: firebase.firestore.FieldValue.serverTimestamp()
            });

            const teacherIds = await this.getRelevantTeachersForStudent(student);
            await this.createNotification({
                type: this.NOTIFICATION_TYPES.ATTENDANCE,
                title: `Student ${entryType === 'entry' ? 'Arrival' : 'Departure'}`,
                message: `${student.name} has ${entryType === 'entry' ? 'entered' : 'left'} the school at ${timeString}`,
                targetUsers: [student.parentId, ...teacherIds].filter(Boolean),
                studentId: studentId,
                studentName: student.name,
                relatedRecord: attendanceRef.id
            });

            console.log(`Guard attendance recorded: ${student.name} - ${entryType} at ${timeString}`);

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
            const db = firebase.firestore();
            const startOfDay = new Date(date + 'T00:00:00');
            const endOfDay = new Date(date + 'T23:59:59');
            
            const snapshot = await db.collection('attendance')
                .where('timestamp', '>=', startOfDay)
                .where('timestamp', '<=', endOfDay)
                .get();
                
            const stats = {
                present: 0,
                absent: 0,
                late: 0,
                clinic: 0,
                excused: 0
            };
            
            snapshot.forEach(doc => {
                const data = doc.data();
                if (stats.hasOwnProperty(data.status)) {
                    stats[data.status]++;
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
            const db = firebase.firestore();
            let query = db.collection('attendance');
            
            // Apply filters if provided
            if (filters.startDate && filters.endDate) {
                const startDate = new Date(filters.startDate + 'T00:00:00');
                const endDate = new Date(filters.endDate + 'T23:59:59');
                query = query.where('timestamp', '>=', startDate)
                             .where('timestamp', '<=', endDate);
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
                records.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            
            return records;
        } catch (error) {
            console.error('Error getting attendance records:', error);
            throw error;
        }
    },

    // Record manual attendance (for teachers/admins)
    async recordManualAttendance(attendanceData) {
        try {
            const db = firebase.firestore();
            const timestamp = new Date(attendanceData.date + 'T' + (attendanceData.time || '08:00:00'));
            
            const attendanceRecord = {
                studentId: attendanceData.studentId,
                status: attendanceData.status,
                timestamp: timestamp,
                recordedBy: attendanceData.recordedBy,
                notes: attendanceData.notes || '',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
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
                    targetUsers: [student.parentId, ...teacherIds].filter(Boolean),
                    studentId: student.id,
                    studentName: student.name,
                    relatedRecord: added.id
                });
            }
            return true;
        } catch (error) {
            console.error('Error recording attendance:', error);
            throw error;
        }
    },

    async overrideAttendanceStatus(studentId, status = 'present', notes = '') {
        try {
            const db = firebase.firestore();
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const studentDoc = await db.collection('students').doc(studentId).get();
            if (!studentDoc.exists) throw new Error('Student not found');
            const student = { id: studentDoc.id, ...studentDoc.data() };

            const snapshot = await db.collection('attendance')
                .where('studentId', '==', studentId)
                .where('timestamp', '>=', today)
                .where('entryType', '==', 'entry')
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
                        at: firebase.firestore.FieldValue.serverTimestamp()
                    }
                });
            } else {
                const now = new Date();
                const timeString = now.toTimeString().split(' ')[0].substring(0, 5);
                const session = this.getCurrentSession();
                const attendanceData = {
                    studentId: studentId,
                    studentName: student.name,
                    classId: student.classId,
                    entryType: 'entry',
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
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
                        at: firebase.firestore.FieldValue.serverTimestamp()
                    }
                };
                const ref = await db.collection('attendance').add(attendanceData);
                recordId = ref.id;
            }

            await db.collection('students').doc(studentId).update({
                currentStatus: status === 'absent' ? 'out_school' : 'in_school',
                lastAttendance: firebase.firestore.FieldValue.serverTimestamp()
            });

            const teacherIds = await this.getRelevantTeachersForStudent(student);
            await this.createNotification({
                type: this.NOTIFICATION_TYPES.ATTENDANCE,
                title: 'Manual Attendance Update',
                message: `${student.name} marked as ${status}${notes ? ` (${notes})` : ''}`,
                targetUsers: [student.parentId, ...teacherIds].filter(Boolean),
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
                            .where('isActive', '==', true)
                            .limit(10)
                            .get();
                        const adminIds = adminsSnap.docs.map(d => d.id);
                        const reasonText = risk.reasons.length ? `Reasons: ${risk.reasons.join(', ')}` : '';
                        await this.createNotification({
                            type: this.NOTIFICATION_TYPES.ATTENDANCE,
                            title: 'Critical Attendance Alert',
                            message: `${student.name} flagged as at-risk. ${reasonText}`,
                            isUrgent: true,
                            targetUsers: [student.parentId, ...teacherIds, ...adminIds].filter(Boolean),
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
        } catch (error) {
            console.error('Error overriding attendance status:', error);
            throw error;
        }
    },

    // Delete attendance record
    async deleteAttendanceRecord(recordId) {
        try {
            const db = firebase.firestore();
            await db.collection('attendance').doc(recordId).delete();
            return true;
        } catch (error) {
            console.error('Error deleting attendance record:', error);
            throw error;
        }
    },

    // Get class students (alias for getStudentsByClass for backward compatibility)
    async getClassStudents(classId) {
        try {
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
        } catch (error) {
            console.error('Error getting class students:', error);
            throw error;
        }
    },

    // ==================== CLINIC MANAGEMENT ====================

    // Clinic Check-in/Check-out
    async recordClinicVisit(studentId, reason = '', notes = '', checkIn = true) {
        try {
            const studentDoc = await db.collection('students').doc(studentId).get();
            
            if (!studentDoc.exists) {
                throw new Error('Student not found');
            }

            const student = studentDoc.data();
            const timestamp = new Date();

            const clinicData = {
                studentId: studentId,
                studentName: student.name,
                classId: student.classId,
                checkIn: checkIn,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                reason: reason,
                notes: notes,
                staffId: this.currentUser.id,
                staffName: this.currentUser.name
            };

            const clinicRef = await db.collection('clinicVisits').add(clinicData);

            // Update student status
            await db.collection('students').doc(studentId).update({
                currentStatus: checkIn ? 'in_clinic' : 'in_school',
                lastClinicVisit: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Get homeroom teacher for the student's class
            const teacherQuery = await db.collection('users')
                .where('role', '==', this.USER_TYPES.TEACHER)
                .where('classId', '==', student.classId)
                .where('isHomeroom', '==', true)
                .get();

            let teacherId = null;
            if (!teacherQuery.empty) {
                teacherId = teacherQuery.docs[0].id;
            }

            // Create notification
            await this.createNotification({
                type: this.NOTIFICATION_TYPES.CLINIC,
                title: `Clinic ${checkIn ? 'Visit' : 'Check-out'}`,
                message: `${student.name} has ${checkIn ? 'checked into' : 'checked out from'} the clinic. ${reason ? `Reason: ${reason}` : ''}`,
                targetUsers: [student.parentId, teacherId].filter(id => id),
                studentId: studentId,
                studentName: student.name,
                relatedRecord: clinicRef.id
            });

            console.log(`Clinic visit recorded: ${student.name} - ${checkIn ? 'Check-in' : 'Check-out'}`);
            return clinicRef.id;
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
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                isActive: true
            };

            const announcementRef = await db.collection('announcements').add(announcement);

            // Get target users based on audience
            let targetUsers = [];
            if (announcementData.audience === 'all') {
                const usersSnapshot = await db.collection('users').where('isActive', '==', true).get();
                targetUsers = usersSnapshot.docs.map(doc => doc.id);
            } else if (announcementData.audience === 'parents') {
                const parentsSnapshot = await db.collection('users').where('role', '==', 'parent').where('isActive', '==', true).get();
                targetUsers = parentsSnapshot.docs.map(doc => doc.id);
            } else if (announcementData.audience === 'teachers') {
                const teachersSnapshot = await db.collection('users').where('role', '==', 'teacher').where('isActive', '==', true).get();
                targetUsers = teachersSnapshot.docs.map(doc => doc.id);
            }

            // Create notifications for target users
            if (targetUsers.length > 0) {
                await this.createNotification({
                    type: this.NOTIFICATION_TYPES.ANNOUNCEMENT,
                    title: announcementData.title,
                    message: announcementData.message,
                    targetUsers: targetUsers,
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
                .where('isActive', '==', true)
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
        const checkIns = visits.filter(v => v.checkIn);
        const checkOuts = visits.filter(v => !v.checkIn);
        
        let totalDuration = 0;
        let pairCount = 0;

        checkIns.forEach(checkIn => {
            const correspondingCheckOut = checkOuts.find(checkOut => 
                checkOut.studentId === checkIn.studentId && 
                this.isSameDay(checkIn.timestamp, checkOut.timestamp)
            );

            if (correspondingCheckOut && checkIn.timestamp && correspondingCheckOut.timestamp) {
                const duration = correspondingCheckOut.timestamp.toDate() - checkIn.timestamp.toDate();
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
                    const date = record.timestamp.toDate().toDateString();
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
            const [attendanceSnapshot, clinicSnapshot, studentSnapshot] = await Promise.all([
                this.db.collection('attendance')
                    .where('timestamp', '>=', startDate)
                    .where('timestamp', '<=', endDate)
                    .get(),
                this.db.collection('clinicVisits')
                    .where('timestamp', '>=', startDate)
                    .where('timestamp', '<=', endDate)
                    .where('checkIn', '==', true)
                    .get(),
                this.db.collection('students').where('isActive', '==', true).get()
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
                    .where('checkIn', '==', true)
                    .get(),
                db.collection('students')
                    .where('classId', '==', classId)
                    .where('isActive', '==', true)
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
                if (data.entryType === 'entry') {
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
            const db = firebase.firestore();
            const snapshot = await db.collection('attendance')
                .where('classId', '==', classId)
                .where('timestamp', '>=', startDate)
                .where('timestamp', '<=', endDate)
                .where('entryType', '==', 'entry')
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
                    .where('checkIn', '==', true)
                    .get(),
                db.collection('students')
                    .where('classId', '==', classId)
                    .where('isActive', '==', true)
                    .get()
            ]);

            const totalStudents = studentsSnapshot.size;
            const presentSet = new Set();
            const lateSet = new Set();
            const clinicSet = new Set();

            attendanceSnapshot.forEach(doc => {
                const r = doc.data();
                if (r.entryType === 'entry') {
                    if (r.status === 'late') lateSet.add(r.studentId);
                    if (r.status === 'present') presentSet.add(r.studentId);
                }
            });
            clinicSnapshot.forEach(doc => {
                const v = doc.data();
                clinicSet.add(v.studentId);
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
            const db = firebase.firestore();
            const endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 6);

            const [studentsSnapshot, attendanceSnapshot] = await Promise.all([
                db.collection('students')
                    .where('classId', '==', classId)
                    .where('isActive', '==', true)
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
                if (!r.timestamp || r.entryType !== 'entry') return;
                const dayKey = r.timestamp.toDate().toDateString();
                const cur = grid.get(r.studentId) || {};
                cur[dayKey] = r.status;
                grid.set(r.studentId, cur);
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
                if (!r.timestamp || r.entryType !== 'entry') return;
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
            const db = firebase.firestore();
            let studentsQuery = db.collection('students').where('isActive', '==', true);
            if (classId) studentsQuery = studentsQuery.where('classId', '==', classId);
            const studentsSnapshot = await studentsQuery.get();
            const students = studentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Fetch attendance for period (scope by class if provided)
            let attendanceQuery = db.collection('attendance')
                .where('timestamp', '>=', startDate)
                .where('timestamp', '<=', endDate);
            if (classId) attendanceQuery = attendanceQuery.where('classId', '==', classId);
            const attendanceSnapshot = await attendanceQuery.get();

            // Build per-student per-day presence
            const perStudentDays = new Map(); // studentId -> map(dateKey -> {present, late})
            attendanceSnapshot.forEach(doc => {
                const r = doc.data();
                if (!r.timestamp || r.entryType !== 'entry') return;
                const key = r.timestamp.toDate().toDateString();
                const map = perStudentDays.get(r.studentId) || new Map();
                const info = map.get(key) || { present: false, late: false };
                if (r.status === 'late') info.late = true;
                if (r.status === 'present' || r.status === 'late') info.present = true;
                map.set(key, info);
                perStudentDays.set(r.studentId, map);
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
                    risks.push({ studentId: s.id, studentName: s.name, classId: s.classId, absentDays, lateDays, riskScore, severity, reasons });
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
            const db = firebase.firestore();
            const visitRef = db.collection('clinicVisits').doc(visitId);
            const visitDoc = await visitRef.get();
            if (!visitDoc.exists) throw new Error('Visit not found');
            const visit = visitDoc.data();
            const teacher = this.currentUser || {};
            await visitRef.update({
                teacherValidationStatus: status,
                validatedBy: teacher.id || 'teacher',
                validatedByName: teacher.name || 'Teacher',
                validationNotes: teacherNotes || '',
                validatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            const targetUsers = [];
            if (visit.studentId) {
                const studentDoc = await db.collection('students').doc(visit.studentId).get();
                if (studentDoc.exists) {
                    const student = studentDoc.data();
                    if (student.parentId) targetUsers.push(student.parentId);
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
                targetUsers,
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
            const db = firebase.firestore();
            const snapshot = await db.collection('clinicVisits')
                .where('timestamp', '>=', startDate)
                .where('timestamp', '<=', endDate)
                .where('checkIn', '==', true)
                .get();
            const counts = new Map();
            const ignore = new Set([
                'checkin','check-in','qr code check-in','quick checkout','checkout','check-out','return to class','validation','teacher validation','approved','rejected'
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
            snapshot.forEach(doc => {
                const r = doc.data();
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
            const db = firebase.firestore();
            const snapshot = await db.collection('clinicVisits')
                .where('classId', '==', classId)
                .where('timestamp', '>=', startDate)
                .where('timestamp', '<=', endDate)
                .where('checkIn', '==', true)
                .get();
            const counts = new Map();
            const ignore = new Set([
                'checkin','check-in','qr code check-in','quick checkout','checkout','check-out','return to class','validation','teacher validation','approved','rejected'
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
            snapshot.forEach(doc => {
                const r = doc.data();
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
            const db = firebase.firestore();
            const snapshot = await db.collection('excuseLetters')
                .where('submittedAt', '>=', startDate)
                .where('submittedAt', '<=', endDate)
                .where('type', '==', 'absence')
                .get();
            const counts = new Map();
            snapshot.forEach(doc => {
                const r = doc.data();
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
            const db = firebase.firestore();
            const snapshot = await db.collection('excuseLetters')
                .where('submittedAt', '>=', startDate)
                .where('submittedAt', '<=', endDate)
                .where('type', '==', 'absence')
                .get();
            let approved = 0, rejected = 0, pending = 0;
            snapshot.forEach(doc => {
                const s = doc.data().status;
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
        } catch (error) {
            console.error('Error getting clinic reason details:', error);
            return [];
        }
    },

    async getAbsenceReasonDetails({ startDate, endDate, reason, status = null, limit = 100 }) {
        try {
            const db = firebase.firestore();
            let query = db.collection('excuseLetters')
                .where('submittedAt', '>=', startDate)
                .where('submittedAt', '<=', endDate)
                .where('type', '==', 'absence')
                .where('reason', '==', reason);
            if (status) {
                query = query.where('status', '==', status);
            }
            const snapshot = await query.orderBy('submittedAt', 'desc').limit(limit).get();
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
                submittedAt: l.submittedAt || null
            }));
        } catch (error) {
            console.error('Error getting absence reason details:', error);
            return [];
        }
    },

    async getRelevantTeachersForStudent(student) {
        try {
            const ids = [];
            if (student.classId) {
                const homeroomSnap = await db.collection('users')
                    .where('role', '==', this.USER_TYPES.TEACHER)
                    .where('classId', '==', student.classId)
                    .where('isHomeroom', '==', true)
                    .get();
                homeroomSnap.forEach(doc => ids.push(doc.id));

                const classDoc = await db.collection('classes').doc(student.classId).get();
                const subjects = classDoc.exists ? (classDoc.data().subjects || []) : [];
                if (subjects.length > 0) {
                    const subjectsSnap = await db.collection('users')
                        .where('role', '==', this.USER_TYPES.TEACHER)
                        .where('assignedClasses', 'array-contains', student.classId)
                        .get();
                    subjectsSnap.forEach(doc => ids.push(doc.id));
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
                        if (record.entryType === 'entry') {
                            hourGroups[hourLabel].entries++;
                        } else if (record.entryType === 'exit') {
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
                    ['checkIn', '==', true]
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
                        if (record.entryType === 'entry') {
                            hourGroups[hourLabel].entries++;
                        } else if (record.entryType === 'exit') {
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
            const userDoc = await db.collection('users').doc(userId).get();
            return userDoc.exists ? { id: userDoc.id, ...userDoc.data() } : null;
        } catch (error) {
            console.error('Error getting user:', error);
            return null;
        }
    },

    async getClassById(classId) {
        try {
            const classDoc = await db.collection('classes').doc(classId).get();
            return classDoc.exists ? { id: classDoc.id, ...classDoc.data() } : null;
        } catch (error) {
            console.error('Error getting class:', error);
            return null;
        }
    },

    // Get student by ID
    async getStudentById(studentId) {
        try {
            const studentDoc = await this.db.collection('students').doc(studentId).get();
            return studentDoc.exists ? { id: studentDoc.id, ...studentDoc.data() } : null;
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
