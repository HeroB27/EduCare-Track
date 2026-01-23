class ClassManagement {
    constructor() {
        this.currentUser = null;
        this.classes = [];
        this.allClasses = []; // Store all classes for filtering
        this.teachers = [];
        this.selectedClassId = null;
        this.realtimeChannel = null;
        this.realtimeRefreshTimer = null;
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
        const levelSelect = document.getElementById('classLevel');
        const gradeSelect = document.getElementById('classGrade');
        const strandSelect = document.getElementById('classStrand');
        if (levelSelect) {
            levelSelect.addEventListener('change', () => {
                this.populateGradeOptions(gradeSelect, levelSelect.value);
                this.toggleStrandSelect(strandSelect, levelSelect.value);
                this.updateClassNamePreview();
            });
        }
        if (gradeSelect) {
            gradeSelect.addEventListener('change', () => this.updateClassNamePreview());
        }
        if (strandSelect) {
            strandSelect.addEventListener('change', () => this.updateClassNamePreview());
        }
        this.populateGradeOptions(gradeSelect, levelSelect ? levelSelect.value : '');
        this.toggleStrandSelect(strandSelect, levelSelect ? levelSelect.value : '');
        this.updateClassNamePreview();
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
        select.innerHTML = '<option value="">Select Grade</option>' +
            grades.map(g => `<option value="${g}">${g}</option>`).join('');
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

    updateClassNamePreview() {
        const level = document.getElementById('classLevel')?.value || '';
        const grade = document.getElementById('classGrade')?.value || '';
        const strand = document.getElementById('classStrand')?.value || '';
        const name = this.composeClassName(grade, strand, level);
        const nameInput = document.getElementById('className');
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
            const { data, error } = await window.supabaseClient
                .from('teachers')
                .select(`
                    *,
                    profiles:id (
                        full_name,
                        email: id
                    )
                `)
                .eq('profiles.is_active', true);

            if (error) throw error;

            this.teachers = data.map(t => ({
                id: t.id,
                name: t.profiles?.full_name || 'Unknown',
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
            this.filterClasses(); // Apply filters initially
        } catch (error) {
            console.error('Error loading classes:', error);
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

        this.renderClassesTable();
        
        // Update pagination info (simple version)
        const startEl = document.getElementById('paginationStart');
        const endEl = document.getElementById('paginationEnd');
        const totalEl = document.getElementById('paginationTotal');
        
        if (startEl) startEl.textContent = this.classes.length > 0 ? 1 : 0;
        if (endEl) endEl.textContent = this.classes.length;
        if (totalEl) totalEl.textContent = this.classes.length;
    }

    renderClassesTable() {
        const body = document.getElementById('classesTableBody');
        if (!body) return;
        if (this.classes.length === 0) {
            body.innerHTML = `<tr><td colspan="8" class="px-6 py-8 text-center text-gray-500">No classes found</td></tr>`;
            return;
        }
        body.innerHTML = this.classes.map(c => {
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
        if (gradeSelect) {
            gradeSelect.onchange = () => {
                document.getElementById('editClassName').value = this.composeClassName(gradeSelect.value, strandSelect.value, cls.level || '');
            };
        }
        if (strandSelect) {
            strandSelect.onchange = () => {
                document.getElementById('editClassName').value = this.composeClassName(gradeSelect.value, strandSelect.value, cls.level || '');
            };
        }
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
    openScheduleModal(classId) {
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

        // Populate Subjects
        let schedule = cls.schedule || [];
        
        if (schedule.length === 0) {
            // Pre-populate with all available subjects for the grade level
            this.currentClassSubjects.forEach(subj => {
                this.addSubjectRow(subj, '', '');
            });
        } else {
            schedule.forEach(item => {
                this.addSubjectRow(item.subject, item.teacher_id, item.time || '');
            });
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
        // Very basic overlap check: exact match or substring match
        // "M/W/F 9:00-10:00" vs "M/W/F 9:00-10:00"
        if (!time1 || !time2) return false;
        return time1.toLowerCase() === time2.toLowerCase();
    }

    async saveSchedule() {
        if (!this.selectedClassId) return;
        try {
            const hrTeacherId = document.getElementById('scheduleHomeroomTeacher').value;
            
            // Collect rows
            const rows = document.querySelectorAll('#scheduleTableBody tr');
            const schedule = [];
            
            rows.forEach(row => {
                const subjectSelect = row.querySelector('.subject-select');
                const subjectInput = row.querySelector('.subject-input'); // Fallback
                const subject = subjectSelect ? subjectSelect.value : (subjectInput ? subjectInput.value.trim() : '');
                
                const teacher_id = row.querySelector('.teacher-select').value;
                const time = row.querySelector('.time-input').value.trim();
                
                if (subject && teacher_id) {
                    schedule.push({ subject, teacher_id, time });
                }
            });

            // Note: Schema doesn't support schedule storage in classes table yet.
            // We only update the adviser_id.
            const updates = {
                adviser_id: hrTeacherId || null
            };

            const { error } = await window.supabaseClient
                .from('classes')
                .update(updates)
                .eq('id', this.selectedClassId);

            if (error) throw error;
            
            // Warn user about schedule not persisting
            alert('Homeroom teacher updated. Note: Class schedule details are not yet persisted to database due to schema limitations.');

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
