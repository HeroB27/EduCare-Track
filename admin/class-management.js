class ClassManagement {
    constructor() {
        this.currentUser = null;
        this.classes = [];
        this.allClasses = []; // Store all classes for filtering
        this.teachers = [];
        this.selectedClassId = null;
        this.realtimeChannel = null;
        this.realtimeRefreshTimer = null;
        this.currentPage = 1;
        this.itemsPerPage = 10;
        this.init();
    }

    async init() {
        try {
            this.showLoading();
            if (!window.EducareTrack) { setTimeout(() => this.init(), 100); return; }

            const savedUser = localStorage.getItem('educareTrack_user');
            if (!savedUser) { window.location.href = '../index.html'; return; }
            this.currentUser = JSON.parse(savedUser);
            if (this.currentUser.role !== 'admin') {
                window.location.href = `../${this.currentUser.role}/${this.currentUser.role}-dashboard.html`;
                return;
            }

            document.getElementById('userName').textContent = this.currentUser.name;
            document.getElementById('userRole').textContent = this.currentUser.role;
            document.getElementById('userInitials').textContent = this.currentUser.name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase();

            this.updateCurrentTime();
            setInterval(() => this.updateCurrentTime(), 60000);

            await this.loadTeachers();
            await this.loadClasses();
            this.setupEventListeners();
            this.populateGradeFilter();
            this.populateStrandSelects();
            this.setupClassFormLogic();
            this.setupRealtimeUpdates();
            this.hideLoading();
        } catch (error) {
            console.error('Class management init failed:', error);
            this.hideLoading();
        }
    }

    setupClassFormLogic() {
        this.setupFormListeners('classLevel', 'classGrade', 'classStrand', 'className');
        this.setupFormListeners('editClassLevel', 'editClassGrade', 'editClassStrand', 'editClassName');
    }

    setupFormListeners(levelId, gradeId, strandId, nameId) {
        const levelSelect = document.getElementById(levelId);
        const gradeSelect = document.getElementById(gradeId);
        const strandSelect = document.getElementById(strandId);
        
        if (levelSelect) {
            levelSelect.addEventListener('change', () => {
                this.populateGradeOptions(gradeSelect, levelSelect.value);
                this.toggleStrandSelect(strandSelect, levelSelect.value);
                this.updateClassNamePreview(levelId, gradeId, strandId, nameId);
            });
        }
        if (gradeSelect) {
            gradeSelect.addEventListener('change', () => this.updateClassNamePreview(levelId, gradeId, strandId, nameId));
        }
        if (strandSelect) {
            strandSelect.addEventListener('change', () => this.updateClassNamePreview(levelId, gradeId, strandId, nameId));
        }
        
        // Initial setup for create form
        if (levelId === 'classLevel') {
            this.populateGradeOptions(gradeSelect, levelSelect ? levelSelect.value : '');
            this.toggleStrandSelect(strandSelect, levelSelect ? levelSelect.value : '');
            this.updateClassNamePreview(levelId, gradeId, strandId, nameId);
        }
    }

    populateStrandSelects() {
        const strands = window.EducareTrack && typeof window.EducareTrack.getSeniorHighStrands === 'function'
            ? window.EducareTrack.getSeniorHighStrands()
            : ['STEM', 'HUMSS', 'ABM', 'ICT', 'TVL'];
        const selectIds = ['classStrand', 'editClassStrand'];
        selectIds.forEach(id => {
            const select = document.getElementById(id);
            if (!select) return;
            select.innerHTML = '<option value="">Select Strand (for Senior High)</option>' +
                strands.map(s => `<option value="${s}">${s}</option>`).join('');
        });
    }

    populateGradeOptions(select, level) {
        if (!select) return;
        const grades = this.getGradesForLevel(level);
        // Keep existing value if possible after repopulating
        const currentValue = select.value;
        select.innerHTML = '<option value="">Select Grade</option>' +
            grades.map(g => `<option value="${g}">${g}</option>`).join('');
        if (currentValue && grades.includes(currentValue)) {
            select.value = currentValue;
        }
    }

    getGradesForLevel(level) {
        if (level === 'Kindergarten') return ['Kinder'];
        if (level === 'Elementary') return ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6'];
        if (level === 'Highschool') return ['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10'];
        if (level === 'Senior High') return ['Grade 11', 'Grade 12'];
        return [];
    }

    toggleStrandSelect(select, level) {
        if (!select) return;
        if (level === 'Senior High') {
            select.disabled = false;
            select.classList.remove('bg-gray-50', 'text-gray-600');
        } else {
            select.value = '';
            select.disabled = true;
            select.classList.add('bg-gray-50', 'text-gray-600');
        }
    }

    updateClassNamePreview(levelId = 'classLevel', gradeId = 'classGrade', strandId = 'classStrand', nameId = 'className') {
        const level = document.getElementById(levelId)?.value || '';
        const grade = document.getElementById(gradeId)?.value || '';
        const strand = document.getElementById(strandId)?.value || '';
        const name = this.composeClassName(grade, strand, level);
        const nameInput = document.getElementById(nameId);
        if (nameInput) nameInput.value = name;
    }

    populateGradeFilter() {
        const gradeFilter = document.getElementById('gradeFilter');
        if (!gradeFilter) return;
        
        // Collect all unique grades
        const grades = new Set();
        this.allClasses.forEach(c => {
            if (c.grade) grades.add(c.grade);
        });

        // Clear existing options except first
        gradeFilter.innerHTML = '<option value="">All Grades</option>';
        
        // Sort and add options
        Array.from(grades).sort().forEach(g => {
            const option = document.createElement('option');
            option.value = g;
            option.textContent = g;
            gradeFilter.appendChild(option);
        });
    }

    updateCurrentTime() {
        const now = new Date();
        const el = document.getElementById('currentTime');
        if (el) el.textContent = now.toLocaleString();
    }

    async loadTeachers() {
        try {
            // Use Supabase client to fetch teachers with profile data
            // Use !inner to perform an inner join, filtering out teachers with inactive profiles
            const { data, error } = await window.supabaseClient
                .from('teachers')
                .select(`
                    *,
                    profiles!inner (
                        full_name,
                        email
                    )
                `)
                .eq('profiles.is_active', true);

            if (error) throw error;

            this.teachers = data.map(t => ({
                id: t.id,
                name: t.profiles?.full_name || 'Unknown',
                email: t.profiles?.email || '',
                ...t
            }));
            
            const teacherSelects = ['classTeacher', 'editClassTeacher', 'scheduleHomeroomTeacher'];
            const options = '<option value="">Select Teacher</option>' +
                this.teachers.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
                
            teacherSelects.forEach(id => {
                const sel = document.getElementById(id);
                if (sel) sel.innerHTML = options;
            });
            
            document.getElementById('totalTeachers').textContent = this.teachers.length;
        } catch (error) {
            console.error('Error loading teachers:', error);
        }
    }

    async loadClasses() {
        try {
            // Use Supabase client
            const { data, error } = await window.supabaseClient
                .from('classes')
                .select('*')
                .order('created_at', { ascending: false });
                
            if (error) throw error;

            this.allClasses = data.map(d => {
                // Map adviser_id to teacher_id for internal consistency if needed
                const row = { 
                    ...d, 
                    teacher_id: d.adviser_id,
                    teacherId: d.adviser_id
                };
                return this.normalizeClassRow(row);
            });
            document.getElementById('totalClasses').textContent = this.allClasses.length;
            await this.updateStudentsCount();
            await this.updatePerformanceRates();
            this.filterClasses(); // Apply filters initially
        } catch (error) {
            console.error('Error loading classes:', error);
        }
    }

    async updatePerformanceRates() {
        try {
            // Fetch all attendance records with timestamp for validation
            const { data, error } = await window.supabaseClient
                .from('attendance')
                .select('class_id, status, timestamp');

            if (error) {
                console.warn('Could not fetch attendance for performance rates:', error);
                return;
            }

            // Map class levels for school day checking
            const classLevels = {};
            this.allClasses.forEach(c => {
                classLevels[c.id] = c.level;
            });

            // Ensure calendar data is loaded
            if (window.EducareTrack && window.EducareTrack.fetchCalendarData) {
                await window.EducareTrack.fetchCalendarData();
            }

            // Group by date and class
            // date -> classId -> { present, total }
            const dateMap = {};

            (data || []).forEach(r => {
                if (!r.class_id || !r.timestamp) return;
                
                const dateKey = new Date(r.timestamp).toDateString(); // Normalize to local date string
                
                if (!dateMap[dateKey]) dateMap[dateKey] = {};
                if (!dateMap[dateKey][r.class_id]) dateMap[dateKey][r.class_id] = { present: 0, total: 0 };
                
                const stats = dateMap[dateKey][r.class_id];
                
                if (r.status === 'present' || r.status === 'late') {
                    stats.present++;
                }
                if (r.status === 'present' || r.status === 'late' || r.status === 'absent') {
                    stats.total++;
                }
            });

            // Aggregate valid school day stats
            const finalStats = {}; // classId -> { present, total }

            Object.keys(dateMap).forEach(dateStr => {
                const date = new Date(dateStr);
                const classesOnDate = dateMap[dateStr];
                
                Object.keys(classesOnDate).forEach(classId => {
                    const level = classLevels[classId];
                    // Check if it was a school day for this class level
                    if (window.EducareTrack && window.EducareTrack.isSchoolDay(date, level)) {
                        if (!finalStats[classId]) finalStats[classId] = { present: 0, total: 0 };
                        
                        finalStats[classId].present += classesOnDate[classId].present;
                        finalStats[classId].total += classesOnDate[classId].total;
                    }
                });
            });

            this.allClasses = this.allClasses.map(c => {
                const s = finalStats[c.id];
                const rate = s && s.total > 0 ? (s.present / s.total) * 100 : null;
                return { 
                    ...c, 
                    attendanceRate: rate 
                };
            });
            
            this.filterClasses(); 

        } catch (error) {
            console.error('Error updating performance rates:', error);
        }
    }

    async updateStudentsCount() {
        try {
            const counts = {};
            if (window.supabaseClient) {
                const { data, error } = await window.supabaseClient
                    .from('students')
                    .select('class_id');
                if (error) throw error;
                (data || []).forEach(row => {
                    if (!row.class_id) return;
                    counts[row.class_id] = (counts[row.class_id] || 0) + 1;
                });
            }
            // Update both lists
            this.allClasses = this.allClasses.map(c => ({...c, studentsCount: counts[c.id] || 0}));
            this.filterClasses(); // Re-filter to update view
            
            const total = Object.values(counts).reduce((a,b)=>a+b,0);
            document.getElementById('totalStudents').textContent = total;
        } catch (error) {
            console.error('Error counting students:', error);
        }
    }

    setupRealtimeUpdates() {
        if (!window.supabaseClient) return;
        if (this.realtimeChannel) {
            this.realtimeChannel.unsubscribe();
        }
        this.realtimeChannel = window.supabaseClient
            .channel('class_management_realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'classes' }, () => {
                this.scheduleRealtimeRefresh();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, () => {
                this.scheduleRealtimeRefresh();
            })
            .subscribe();
    }

    scheduleRealtimeRefresh() {
        if (this.realtimeRefreshTimer) {
            clearTimeout(this.realtimeRefreshTimer);
        }
        this.realtimeRefreshTimer = setTimeout(() => {
            this.loadClasses();
        }, 500);
    }

    getTeacherName(id) {
        const t = this.teachers.find(x => x.id === id);
        return t ? t.name : '—';
    }

    normalizeClassRow(row) {
        const name = row.name || '';
        const level = row.level || '';
        const derivedGrade = row.grade || this.deriveGradeFromName(name, level);
        const derivedStrand = row.strand || this.deriveStrandFromName(name);
        const derivedName = row.name || this.composeClassName(derivedGrade, derivedStrand, level);
        return {
            ...row,
            name: derivedName,
            grade: derivedGrade,
            strand: derivedStrand
        };
    }

    deriveGradeFromName(name, level) {
        const label = (name || '').toLowerCase();
        if (label.includes('kinder')) return 'Kinder';
        const match = label.match(/grade\s*(\d{1,2})/i);
        if (match && match[1]) return `Grade ${parseInt(match[1], 10)}`;
        if (level === 'Kindergarten') return 'Kinder';
        return '';
    }

    deriveStrandFromName(name) {
        const label = (name || '').toUpperCase();
        if (label.includes('STEM')) return 'STEM';
        if (label.includes('HUMSS')) return 'HUMSS';
        if (label.includes('ABM')) return 'ABM';
        if (label.includes('ICT')) return 'ICT';
        if (label.includes('TVL')) return 'TVL';
        return '';
    }

    composeClassName(grade, strand, level) {
        if (!grade) return '';
        if (level === 'Senior High' && strand) return `${grade} - ${strand}`;
        return grade;
    }

    filterClasses() {
        const level = document.getElementById('levelFilter').value;
        const grade = document.getElementById('gradeFilter').value;
        const status = document.getElementById('statusFilter').value;
        const search = document.getElementById('searchInput').value.toLowerCase();

        this.classes = this.allClasses.filter(c => {
            const matchesLevel = !level || c.level === level;
            const matchesGrade = !grade || c.grade === grade;
            const matchesStatus = !status || 
                (status === 'active' && c.is_active === true) || 
                (status === 'inactive' && c.is_active === false);
            
            const teacherName = this.getTeacherName(c.teacher_id || c.teacherId);
            const searchTarget = `${c.name} ${c.grade} ${c.level} ${teacherName}`.toLowerCase();
            const matchesSearch = !search || searchTarget.includes(search);

            return matchesLevel && matchesGrade && matchesStatus && matchesSearch;
        });

        // Reset to first page on filter change
        this.currentPage = 1;
        this.renderClassesTable();
    }

    changePage(delta) {
        const totalPages = Math.ceil(this.classes.length / this.itemsPerPage);
        const newPage = this.currentPage + delta;
        if (newPage >= 1 && newPage <= totalPages) {
            this.currentPage = newPage;
            this.renderClassesTable();
        }
    }

    renderClassesTable() {
        const body = document.getElementById('classesTableBody');
        if (!body) return;

        if (this.classes.length === 0) {
            body.innerHTML = `<tr><td colspan="8" class="px-6 py-8 text-center text-gray-500">No classes found</td></tr>`;
            this.updatePaginationInfo();
            return;
        }

        // Calculate pagination
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const visibleClasses = this.classes.slice(startIndex, endIndex);

        body.innerHTML = visibleClasses.map(c => {
            // Calculate a dummy performance rate for now, or fetch if available
            // In a real app, we would fetch this or calculate it on load.
            // For now, I'll put a placeholder or basic calculation if data exists.
            const perf = c.attendanceRate ? `${Math.round(c.attendanceRate)}%` : '—';
            
            return `
            <tr class="hover:bg-gray-50">
                <td class="px-6 py-3">
                    <div class="font-semibold text-gray-800">${c.name || 'Untitled Class'}</div>
                    <div class="text-xs text-gray-500">${c.id}</div>
                </td>
                <td class="px-6 py-3 text-sm">${c.level || '—'}</td>
                <td class="px-6 py-3 text-sm">${c.grade || '—'}</td>
                <td class="px-6 py-3 text-sm">${c.strand || '—'}</td>
                <td class="px-6 py-3 text-sm">${this.getTeacherName(c.teacher_id || c.teacherId)}</td>
                <td class="px-6 py-3 text-sm">${c.studentsCount || 0}</td>
                <td class="px-6 py-3 text-sm font-semibold ${perf !== '—' && parseInt(perf) < 80 ? 'text-red-600' : 'text-green-600'}">${perf}</td>
                <td class="px-6 py-3">
                    <div class="flex items-center space-x-3">
                        <button class="text-blue-600 hover:text-blue-800" title="Edit Class" onclick="classManagement.openEditModal('${c.id}')">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="text-purple-600 hover:text-purple-800" title="Manage Schedule" onclick="classManagement.openScheduleModal('${c.id}')">
                            <i class="fas fa-calendar-alt"></i>
                        </button>
                        <button class="text-green-600 hover:text-green-800" title="View Students" onclick="classManagement.openViewStudentsModal('${c.id}')">
                            <i class="fas fa-users"></i>
                        </button>
                        <button class="text-indigo-600 hover:text-indigo-800" title="Analytics" onclick="classManagement.openAnalyticsModal('${c.id}')">
                            <i class="fas fa-chart-line"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `}).join('');

        this.updatePaginationInfo();
    }

    updatePaginationInfo() {
        const total = this.classes.length;
        const totalPages = Math.ceil(total / this.itemsPerPage);
        const start = total === 0 ? 0 : (this.currentPage - 1) * this.itemsPerPage + 1;
        const end = Math.min(start + this.itemsPerPage - 1, total);
        
        const startEl = document.getElementById('paginationStart');
        const endEl = document.getElementById('paginationEnd');
        const totalEl = document.getElementById('paginationTotal');
        const prevBtn = document.getElementById('prevPage');
        const nextBtn = document.getElementById('nextPage');
        
        if (startEl) startEl.textContent = start;
        if (endEl) endEl.textContent = end;
        if (totalEl) totalEl.textContent = total;

        if (prevBtn) {
            prevBtn.disabled = this.currentPage <= 1;
            prevBtn.classList.toggle('opacity-50', this.currentPage <= 1);
            prevBtn.classList.toggle('cursor-not-allowed', this.currentPage <= 1);
        }
        if (nextBtn) {
            nextBtn.disabled = this.currentPage >= totalPages;
            nextBtn.classList.toggle('opacity-50', this.currentPage >= totalPages);
            nextBtn.classList.toggle('cursor-not-allowed', this.currentPage >= totalPages);
        }
    }

    setupEventListeners() {
        const createBtn = document.getElementById('createClassBtn');
        if (createBtn) createBtn.addEventListener('click', () => this.openCreateClassModal());
        const refreshBtn = document.getElementById('refreshClassesBtn');
        if (refreshBtn) refreshBtn.addEventListener('click', () => this.loadClasses());
        
        // Filter listeners
        ['levelFilter', 'gradeFilter', 'statusFilter', 'searchInput'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', () => this.filterClasses());
        });

        // Pagination listeners
        const prevBtn = document.getElementById('prevPage');
        const nextBtn = document.getElementById('nextPage');
        if (prevBtn) prevBtn.addEventListener('click', () => this.changePage(-1));
        if (nextBtn) nextBtn.addEventListener('click', () => this.changePage(1));
    }

    openCreateClassModal() {
        const modal = document.getElementById('createClassModal');
        if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
    }
    closeCreateClassModal() {
        const modal = document.getElementById('createClassModal');
        if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
    }

    async createNewClass() {
        try {
            const level = document.getElementById('classLevel').value;
            const grade = document.getElementById('classGrade').value;
            const strand = document.getElementById('classStrand').value;
            const teacher_id = document.getElementById('classTeacher').value || null;
            // capacity is not in schema, ignoring
            
            if (!level || !grade) return;
            if (level === 'Senior High' && !strand) return;
            
            const newId = crypto.randomUUID();
            
            const { error } = await window.supabaseClient
                .from('classes')
                .insert({
                    id: newId,
                    level: level,
                    grade: grade,
                    strand: strand || null,
                    adviser_id: teacher_id,
                    is_active: true,
                    created_at: new Date().toISOString()
                });

            if (error) throw error;
            
            this.closeCreateClassModal();
            await this.loadClasses();
        } catch (error) { console.error('Create class failed:', error); }
    }

    openEditModal(classId) {
        this.selectedClassId = classId;
        const cls = this.classes.find(c => c.id === classId);
        if (!cls) return;
        document.getElementById('editClassLevel').value = cls.level || '';
        const gradeSelect = document.getElementById('editClassGrade');
        this.populateGradeOptions(gradeSelect, cls.level || '');
        gradeSelect.value = cls.grade || '';
        const strandSelect = document.getElementById('editClassStrand');
        this.toggleStrandSelect(strandSelect, cls.level || '');
        strandSelect.value = cls.strand || this.deriveStrandFromName(cls.name || '');
        document.getElementById('editClassName').value = this.composeClassName(gradeSelect.value, strandSelect.value, cls.level || '');
        const teacherSel = document.getElementById('editClassTeacher');
        if (teacherSel) teacherSel.value = cls.teacher_id || cls.teacherId || '';
        
        const modal = document.getElementById('editClassModal');
        if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
    }
    closeEditModal() {
        const modal = document.getElementById('editClassModal');
        if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
        this.selectedClassId = null;
    }
    async saveClassEdits() {
        if (!this.selectedClassId) return;
        try {
            const level = document.getElementById('editClassLevel').value.trim();
            const grade = document.getElementById('editClassGrade').value.trim();
            const strand = document.getElementById('editClassStrand').value || null;
            const teacher_id = document.getElementById('editClassTeacher').value || null;
            if (!grade) return;
            if (level === 'Senior High' && !strand) return;
            
            const updates = {
                grade: grade,
                level: level,
                strand: strand,
                adviser_id: teacher_id
            };
            
            const { error } = await window.supabaseClient
                .from('classes')
                .update(updates)
                .eq('id', this.selectedClassId);

            if (error) throw error;
            
            this.closeEditModal();
            await this.loadClasses();
        } catch (error) { console.error('Save edits failed:', error); }
    }

    // Schedule / Subjects Management
    async openScheduleModal(classId) {
        this.selectedClassId = classId;
        const cls = this.classes.find(c => c.id === classId);
        if (!cls) return;

        // Set Homeroom Teacher
        const hrSelect = document.getElementById('scheduleHomeroomTeacher');
        if (hrSelect) hrSelect.value = cls.teacher_id || cls.teacherId || '';

        // Clear existing rows
        const tbody = document.getElementById('scheduleTableBody');
        tbody.innerHTML = '';

        // Get available subjects for this class level/strand
        this.currentClassSubjects = this.getSubjectsForClass(cls);

        try {
            // Fetch existing schedule from class_schedules table
            const { data: scheduleData, error } = await window.supabaseClient
                .from('class_schedules')
                .select('*')
                .eq('class_id', classId);
            
            if (error) {
                console.warn('Error fetching schedules (might be empty/new table):', error);
                // Fallback to local schedule if any (for migration) or empty
            }

            const schedule = scheduleData || cls.schedule || [];
            
            if (schedule.length === 0) {
                // Pre-populate with all available subjects for the grade level
                this.currentClassSubjects.forEach(subj => {
                    this.addSubjectRow(subj, '', '');
                });
            } else {
                schedule.forEach(item => {
                    this.addSubjectRow(item.subject, item.teacher_id, item.day_of_week ? `${item.day_of_week} ${item.start_time || ''}-${item.end_time || ''}` : (item.time || ''));
                });
            }
        } catch (err) {
            console.error('Error in openScheduleModal:', err);
        }

        const modal = document.getElementById('scheduleClassModal');
        if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
    }

    closeScheduleModal() {
        const modal = document.getElementById('scheduleClassModal');
        if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
        this.selectedClassId = null;
        this.currentClassSubjects = [];
    }

    getSubjectsForClass(cls) {
        // Parse level and strand from class data or name
        // This logic mirrors user-management.js but uses class object properties
        let level = cls.level || 'Elementary';
        let strand = cls.strand || null;
        const className = cls.name || '';

        // Fallback detection if properties are missing
        if (className.includes('Kinder')) level = 'Kindergarten';
        else if (className.includes('Grade 11') || className.includes('Grade 12')) {
            level = 'Senior High';
            if (className.includes('STEM')) strand = 'STEM';
            else if (className.includes('HUMSS')) strand = 'HUMSS';
            else if (className.includes('ABM')) strand = 'ABM';
            else if (className.includes('ICT') || className.includes('TVL')) strand = 'TVL';
        } else if (className.includes('Grade')) {
            const gradeNum = parseInt(className.replace(/\D/g, ''));
            if (gradeNum >= 7 && gradeNum <= 10) level = 'Highschool';
        }

        let subjects = [];

        if (level === 'Kindergarten') {
            subjects = [
                'Makabansa', 'Languages', 'Mathematics', 'GMRC', 
                'Values Education', 'Science', 'Mother Tongue'
            ];
        } else if (level === 'Elementary' || level === 'Highschool') {
            subjects = [
                'Math', 'English', 'Filipino', 'Araling Panlipunan', 
                'Science', 'TLE', 'MAPEH', 'GMRC'
            ];
        } else if (level === 'Senior High') {
            const core = [
                'Oral Communication', 'Reading and Writing', 'Komunikasyon at Pananaliksik',
                'Pagbasa at Pagsusuri', '21st Century Literature (Philippines)', '21st Century Literature (World)',
                'Media and Information Literacy', 'General Mathematics', 'Statistics and Probability',
                'Earth and Life Science', 'Physical Science', 'Personal Development',
                'Understanding Culture, Society and Politics', 'PE and Health'
            ];
            const applied = [
                'English for Academic and Professional Purposes', 'Practical Research 1', 'Practical Research 2',
                'Filipino sa Piling Larang', 'Empowerment Technologies', 'Entrepreneurship', 'Inquiries, Investigations and Immersion'
            ];
            
            let specialized = [];
            if (strand === 'STEM') {
                specialized = ['Pre-Calculus', 'Basic Calculus', 'General Biology 1', 'General Biology 2', 'General Physics 1', 'General Physics 2', 'General Chemistry 1', 'General Chemistry 2'];
            } else if (strand === 'ABM') {
                specialized = ['Business Math', 'Business Finance', 'Organization and Management', 'Principles of Marketing', 'Fundamentals of ABM 1', 'Fundamentals of ABM 2', 'Applied Economics', 'Business Ethics'];
            } else if (strand === 'HUMSS') {
                specialized = ['Creative Writing', 'World Religions', 'Trends and Networks', 'Philippine Politics', 'Community Engagement', 'Discipline in Social Sciences', 'Discipline in Applied Social Sciences', 'Work Immersion'];
            }
            // TVL/ICT would be dynamic based on specialization, keeping it simple for now
            
            subjects = [...core, ...applied, ...specialized];
        }

        return subjects.sort();
    }

    addSubjectRow(subject = '', teacherId = '', time = '') {
        const tbody = document.getElementById('scheduleTableBody');
        const tr = document.createElement('tr');
        
        // Subject Dropdown
        const subjectOptions = '<option value="">Select Subject</option>' +
            this.currentClassSubjects.map(s => `<option value="${s}" ${s === subject ? 'selected' : ''}>${s}</option>`).join('');

        // Initial Teacher Options (Filtered if subject exists, otherwise all or none)
        // We'll populate this dynamically, but for initial render:
        let teacherOptions = '<option value="">Select Teacher</option>';
        const qualifiedTeachers = subject ? this.getQualifiedTeachers(subject) : this.teachers;
        
        teacherOptions += qualifiedTeachers.map(t => 
            `<option value="${t.id}" ${t.id === teacherId ? 'selected' : ''}>${t.name}</option>`
        ).join('');

        tr.innerHTML = `
            <td class="px-3 py-2">
                <select class="w-full border border-gray-300 rounded px-2 py-1 subject-select" onchange="classManagement.onSubjectSelectChange(this)">
                    ${subjectOptions}
                </select>
            </td>
            <td class="px-3 py-2">
                <select class="w-full border border-gray-300 rounded px-2 py-1 teacher-select" onchange="classManagement.checkConflict(this)">
                    ${teacherOptions}
                </select>
            </td>
            <td class="px-3 py-2 relative">
                <input type="text" class="w-full border border-gray-300 rounded px-2 py-1 time-input" 
                       value="${time}" placeholder="e.g. M/W/F 9:00-10:00"
                       onchange="classManagement.checkConflict(this)">
                <div class="conflict-warning hidden absolute right-0 top-0 -mt-2 -mr-2 text-red-600 bg-white rounded-full p-1 shadow-md" title="Schedule Conflict!">
                    <i class="fas fa-exclamation-circle"></i>
                </div>
            </td>
            <td class="px-3 py-2 text-center">
                <button onclick="this.closest('tr').remove()" class="text-red-600 hover:text-red-800">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    }

    getQualifiedTeachers(subject) {
        if (!subject) return [];
        return this.teachers.filter(t => {
            // Check capabilities
            // If capabilities is undefined (old data), assume not qualified or all qualified?
            // User wants strict qualification.
            if (!t.capabilities || !Array.isArray(t.capabilities)) return false;
            return t.capabilities.includes(subject);
        });
    }

    onSubjectSelectChange(selectElem) {
        const row = selectElem.closest('tr');
        const teacherSelect = row.querySelector('.teacher-select');
        const subject = selectElem.value;

        // Reset teacher selection
        teacherSelect.value = '';
        
        if (!subject) {
            teacherSelect.innerHTML = '<option value="">Select Teacher</option>';
            return;
        }

        const qualifiedTeachers = this.getQualifiedTeachers(subject);
        
        let html = '<option value="">Select Teacher</option>';
        if (qualifiedTeachers.length === 0) {
            html += '<option value="" disabled>No qualified teachers found</option>';
        } else {
            html += qualifiedTeachers.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
        }
        
        teacherSelect.innerHTML = html;
        this.checkConflict(teacherSelect); // Re-check conflict (clears it)
    }

    checkConflict(elem) {
        const row = elem.closest('tr');
        const teacherSelect = row.querySelector('.teacher-select');
        const timeInput = row.querySelector('.time-input');
        const warningIcon = row.querySelector('.conflict-warning');
        
        const teacherId = teacherSelect.value;
        const time = timeInput.value.trim();

        if (!teacherId || !time) {
            if (warningIcon) warningIcon.classList.add('hidden');
            return;
        }

        // Check for conflicts across ALL classes
        let hasConflict = false;
        let conflictDetails = '';

        for (const cls of this.allClasses) {
            // Skip current class's current row check (if we are editing existing, 
            // but here we are checking against saved data. 
            // We should also check against other rows in the current modal!)
            
            if (!cls.schedule) continue;

            for (const item of cls.schedule) {
                if (item.teacher_id === teacherId) {
                    // Check if time overlaps
                    // Simple string match for now as parsing time is complex without a strict format
                    // TODO: Implement strict time parsing (e.g., "Mon 9:00-10:00")
                    if (this.isTimeOverlap(time, item.time)) {
                        // If it's the same class and same subject, it might be the same entry (but we are editing it)
                        // Ideally we ignore the entry we are currently editing if it matches exactly.
                        // But since we are editing, we compare against *other* classes or *other* slots.
                        
                        if (cls.id === this.selectedClassId && item.subject === row.querySelector('.subject-select').value) {
                             // Likely the same slot being edited, ignore
                             continue;
                        }

                        hasConflict = true;
                        conflictDetails = `Conflict with ${cls.name} (${item.subject})`;
                        break;
                    }
                }
            }
            if (hasConflict) break;
        }

        if (hasConflict) {
            if (warningIcon) {
                warningIcon.classList.remove('hidden');
                warningIcon.title = conflictDetails;
                // Optional: Show tooltip or alert
                console.warn(conflictDetails);
            }
            timeInput.classList.add('border-red-500');
        } else {
            if (warningIcon) warningIcon.classList.add('hidden');
            timeInput.classList.remove('border-red-500');
        }
    }

    isTimeOverlap(time1, time2) {
        if (!time1 || !time2) return false;
        const t1 = time1.toLowerCase().trim();
        const t2 = time2.toLowerCase().trim();
        if (t1 === t2) return true;

        // Helper to parse "Day Time-Time"
        const parse = (t) => {
            // Check for day patterns: M, T, W, Th, F, S, Su or Mon, Tue...
            // Extract time range: H:MM-H:MM
            const timeMatch = t.match(/(\d{1,2}:\d{2})\s*(?:-|\sto\s)\s*(\d{1,2}:\d{2})/);
            if (!timeMatch) return null;

            const daysPart = t.substring(0, timeMatch.index).trim();
            const startStr = timeMatch[1];
            const endStr = timeMatch[2];

            // Convert time to minutes
            const toMins = (str) => {
                const [h, m] = str.split(':').map(Number);
                return h * 60 + m;
            };

            return {
                days: daysPart, // Keep string for now
                start: toMins(startStr),
                end: toMins(endStr)
            };
        };

        const s1 = parse(t1);
        const s2 = parse(t2);

        if (s1 && s2) {
            // Check day overlap
            // If one has no days specified, assume it applies to the other's days? Or conflict?
            // Assume if days are present in BOTH, we check overlap.
            // If missing in one, maybe it's a specific date or "Everyday"?
            // Let's assume if days are missing, it might conflict with anything on those times.
            
            let daysOverlap = true;
            if (s1.days && s2.days) {
                // Simple day intersection check
                const d1 = s1.days;
                const d2 = s2.days;
                // Check for common tokens
                const tokens = ['m', 't', 'w', 'th', 'f', 's', 'su', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
                // This is still tricky. Let's do a basic substring check.
                // If "Mon" is in "Mon/Wed", it overlaps.
                // If "M" is in "MWF", it overlaps.
                
                // Construct normalized day sets
                const getDaySet = (str) => {
                    const set = new Set();
                    if (/mon|m\b|mw/.test(str)) set.add(1);
                    if (/tue|t\b|tth/.test(str)) set.add(2);
                    if (/wed|w\b|mw/.test(str)) set.add(3);
                    if (/thu|th\b|tth/.test(str)) set.add(4);
                    if (/fri|f\b/.test(str)) set.add(5);
                    if (/sat|s\b/.test(str)) set.add(6);
                    if (/sun|su\b/.test(str)) set.add(0);
                    return set;
                };
                
                const set1 = getDaySet(d1);
                const set2 = getDaySet(d2);
                
                // Intersection
                const intersection = new Set([...set1].filter(x => set2.has(x)));
                daysOverlap = intersection.size > 0;
            }

            if (daysOverlap) {
                // Check time overlap
                // (StartA < EndB) and (EndA > StartB)
                return (s1.start < s2.end && s1.end > s2.start);
            }
            return false;
        }

        // Fallback to string match
        return t1.includes(t2) || t2.includes(t1);
    }

    async saveSchedule() {
        if (!this.selectedClassId) return;
        try {
            const hrTeacherId = document.getElementById('scheduleHomeroomTeacher').value;
            
            // Collect rows
            const rows = document.querySelectorAll('#scheduleTableBody tr');
            const scheduleItems = [];
            
            rows.forEach(row => {
                const subjectSelect = row.querySelector('.subject-select');
                const subjectInput = row.querySelector('.subject-input'); // Fallback
                const subject = subjectSelect ? subjectSelect.value : (subjectInput ? subjectInput.value.trim() : '');
                
                const teacher_id = row.querySelector('.teacher-select').value;
                const time = row.querySelector('.time-input').value.trim();
                
                if (subject && teacher_id) {
                    scheduleItems.push({ 
                        class_id: this.selectedClassId,
                        subject: subject, 
                        teacher_id: teacher_id, 
                        schedule_text: time 
                    });
                }
            });

            // Validate conflicts before saving
            for (const item of scheduleItems) {
                // Check conflicts with other classes
                const { data: existingSchedules, error: conflictError } = await window.supabaseClient
                    .from('class_schedules')
                    .select('*, classes(grade, section, strand)')
                    .eq('teacher_id', item.teacher_id)
                    .neq('class_id', this.selectedClassId);
                
                if (conflictError) {
                    console.error('Error checking conflicts:', conflictError);
                    // Continue cautiously or throw? Let's warn but proceed if just a fetch error, or stop.
                    // Safer to stop.
                    throw new Error('Could not validate teacher availability.');
                }

                if (existingSchedules) {
                    for (const existing of existingSchedules) {
                        if (this.isTimeOverlap(item.schedule_text, existing.schedule_text)) {
                            const teacherName = this.getTeacherName(item.teacher_id);
                            const className = existing.classes ? `${existing.classes.grade} ${existing.classes.strand || ''} ${existing.classes.section || ''}` : 'another class';
                            alert(`Conflict detected!\n\nTeacher: ${teacherName}\nTime: ${item.schedule_text}\n\nConflict with: ${existing.subject} in ${className} (${existing.schedule_text}).\n\nPlease adjust the time or assign a different teacher.`);
                            return; // Stop save
                        }
                    }
                }
            }

            // 1. Update Homeroom Teacher (adviser_id) in classes table
            const { error: classError } = await window.supabaseClient
                .from('classes')
                .update({ adviser_id: hrTeacherId || null })
                .eq('id', this.selectedClassId);

            if (classError) throw classError;

            // 2. Update Schedules in class_schedules table
            // Strategy: Delete all existing for this class, then insert new ones.
            const { error: deleteError } = await window.supabaseClient
                .from('class_schedules')
                .delete()
                .eq('class_id', this.selectedClassId);
            
            if (deleteError) throw deleteError;

            if (scheduleItems.length > 0) {
                const { error: insertError } = await window.supabaseClient
                    .from('class_schedules')
                    .insert(scheduleItems);
                
                if (insertError) throw insertError;
            }
            
            alert('Schedule saved successfully!');

            this.closeScheduleModal();
            await this.loadClasses(); // Reload to show updates
            
        } catch (error) {
            console.error('Save schedule failed:', error);
            alert('Error saving schedule: ' + error.message);
        }
    }

    // Analytics
    async openAnalyticsModal(classId) {
        this.selectedClassId = classId;
        const cls = this.classes.find(c => c.id === classId);
        if (!cls) return;

        // Calculate stats
        try {
            const { data: attendanceDocs, error } = await window.supabaseClient
                .from('attendance')
                .select('*')
                .eq('class_id', classId);
            
            if (error) throw error;
            
            let totalPresent = 0;
            let totalRecords = 0;
            const reasons = {};
            
            (attendanceDocs || []).forEach(data => {
                if (data.status === 'present') totalPresent++;
                if (data.status === 'absent') {
                    const reason = data.remarks || 'Unspecified';
                    reasons[reason] = (reasons[reason] || 0) + 1;
                }
                totalRecords++;
            });

            const rate = totalRecords > 0 ? (totalPresent / totalRecords) * 100 : 0;
            const absentCount = totalRecords - totalPresent;

            document.getElementById('analyticsAttendanceRate').textContent = `${Math.round(rate)}%`;
            document.getElementById('analyticsAttendanceRate').className = `text-3xl font-bold mb-1 ${rate < 80 ? 'text-red-600' : 'text-green-600'}`;
            document.getElementById('analyticsAbsentCount').textContent = absentCount;

            // Render Reasons
            const sortedReasons = Object.entries(reasons)
                .sort((a,b) => b[1] - a[1])
                .slice(0, 5); // Top 5
            
            const tbody = document.getElementById('analyticsReasonsBody');
            if (sortedReasons.length === 0) {
                tbody.innerHTML = '<tr><td colspan="3" class="px-4 py-2 text-center text-gray-500">No absence data available</td></tr>';
            } else {
                tbody.innerHTML = sortedReasons.map(([r, count]) => `
                    <tr>
                        <td class="px-4 py-2 text-sm text-gray-900">${r}</td>
                        <td class="px-4 py-2 text-sm text-gray-500 text-right">${count}</td>
                        <td class="px-4 py-2 text-sm text-gray-500 text-right">${Math.round((count/absentCount)*100)}%</td>
                    </tr>
                `).join('');
            }

        } catch (e) {
            console.error('Error fetching analytics:', e);
            document.getElementById('analyticsAttendanceRate').textContent = '—';
            document.getElementById('analyticsAbsentCount').textContent = '—';
        }

        const modal = document.getElementById('analyticsModal');
        if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
    }

    closeAnalyticsModal() {
        const modal = document.getElementById('analyticsModal');
        if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
        this.selectedClassId = null;
    }

    async openViewStudentsModal(classId) {
        this.selectedClassId = classId;
        const modal = document.getElementById('viewStudentsModal');
        if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
        await this.loadStudentsForClass(classId);
    }
    closeViewStudentsModal() {
        const modal = document.getElementById('viewStudentsModal');
        if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
        this.selectedClassId = null;
        const list = document.getElementById('studentsList'); if (list) list.innerHTML = '';
        const info = document.getElementById('studentPersonalInfo'); if (info) info.textContent = 'Select a student to view details';
    }

    async loadStudentsForClass(classId) {
        try {
            const { data: students, error } = await window.supabaseClient
                .from('students')
                .select('*')
                .eq('class_id', classId);

            if (error) throw error;
            
            const list = document.getElementById('studentsList');
            if (!list) return;
            if (students.length === 0) {
                list.innerHTML = '<div class="p-3 text-gray-500">No students in this class</div>';
                return;
            }
            list.innerHTML = students.map(s => {
                const displayName = s.full_name || s.name || 'Unnamed Student';
                return `
                <div class="py-2 cursor-pointer hover:bg-gray-50" onclick="classManagement.showStudentInfo('${s.id}','${classId}')">
                    <div class="font-medium">${displayName}</div>
                    <div class="text-xs text-gray-500">${s.id}</div>
                </div>
            `}).join('');
        } catch (error) { console.error('Load students failed:', error); }
    }

    async showStudentInfo(studentId, classId) {
        try {
            const { data: student, error } = await window.supabaseClient
                .from('students')
                .select('*')
                .eq('id', studentId)
                .single();
            
            if (error || !student) return;
            
            let parentName = '—';
            let parentPhone = '—';

            // Fetch parent via parent_students -> parents -> profiles
            try {
                const { data: links } = await window.supabaseClient
                    .from('parent_students')
                    .select(`
                        parent:parent_id (
                            profiles:id (
                                full_name,
                                phone
                            )
                        )
                    `)
                    .eq('student_id', studentId)
                    .limit(1);
                
                if (links && links.length > 0 && links[0].parent) {
                    parentName = links[0].parent.profiles?.full_name || '—';
                    parentPhone = links[0].parent.profiles?.phone || '—';
                }
            } catch (e) {
                console.error('Error fetching parent info:', e);
            }

            const displayName = student.full_name || student.name || 'Unnamed Student';
            const info = document.getElementById('studentPersonalInfo');
            if (info) {
                info.innerHTML = `
                <div class="space-y-2">
                    <div class="text-lg font-semibold text-gray-800">${displayName}</div>
                    <div class="grid grid-cols-2 gap-2 text-sm">
                        <div><span class="text-gray-500">LRN:</span> ${student.lrn || '—'}</div>
                        <div><span class="text-gray-500">Grade:</span> ${student.grade || '—'}</div>
                        <div><span class="text-gray-500">Level:</span> ${student.level || '—'}</div>
                        <div><span class="text-gray-500">Strand:</span> ${student.strand || '—'}</div>
                        <div><span class="text-gray-500">Status:</span> ${student.current_status || student.status || '—'}</div>
                        <div><span class="text-gray-500">Parent:</span> ${parentName}</div>
                        <div><span class="text-gray-500">Phone:</span> ${parentPhone}</div>
                        <div><span class="text-gray-500">Address:</span> ${student.address || '—'}</div>
                    </div>
                </div>
                `;
            }
        } catch (e) { console.error('Error showing student info:', e); }
    }

    showLoading() { const s = document.getElementById('loadingSpinner'); if (s) s.classList.remove('hidden'); }
    hideLoading() { const s = document.getElementById('loadingSpinner'); if (s) s.classList.add('hidden'); }
}

// Expose instance and helpers for HTML handlers
document.addEventListener('DOMContentLoaded', () => { window.classManagement = new ClassManagement(); });
function closeCreateClassModal() { if (window.classManagement) window.classManagement.closeCreateClassModal(); }
function createNewClass() { if (window.classManagement) window.classManagement.createNewClass(); }
