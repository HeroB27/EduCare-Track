class ClassManagement {
    constructor() {
        this.currentUser = null;
        this.classes = [];
        this.teachers = [];
        this.selectedClassId = null;
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
            this.hideLoading();
        } catch (error) {
            console.error('Class management init failed:', error);
            this.hideLoading();
        }
    }

    updateCurrentTime() {
        const now = new Date();
        const el = document.getElementById('currentTime');
        if (el) el.textContent = now.toLocaleString();
    }

    async loadTeachers() {
        try {
            const snapshot = await EducareTrack.db.collection('users')
                .where('role', '==', 'teacher')
                .where('is_active', '==', true)
                .get();
            this.teachers = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            const teacherSelects = ['classTeacher','editClassTeacher'];
            teacherSelects.forEach(id => {
                const sel = document.getElementById(id);
                if (!sel) return;
                sel.innerHTML = '<option value="">Select Homeroom Teacher</option>' +
                    this.teachers.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
            });
            document.getElementById('totalTeachers').textContent = this.teachers.length;
        } catch (error) {
            console.error('Error loading teachers:', error);
        }
    }

    async loadClasses() {
        try {
            const snapshot = await EducareTrack.db.collection('classes').orderBy('createdAt','desc').get();
            this.classes = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            document.getElementById('totalClasses').textContent = this.classes.length;
            await this.updateStudentsCount();
            this.renderClassesTable();
        } catch (error) {
            console.error('Error loading classes:', error);
        }
    }

    async updateStudentsCount() {
        try {
            const ids = this.classes.map(c => c.id);
            const counts = {};
            for (const id of ids) {
                const snap = await EducareTrack.db.collection('students').where('classId','==',id).get();
                counts[id] = snap.size;
            }
            this.classes = this.classes.map(c => ({...c, studentsCount: counts[c.id] || 0}));
            const total = Object.values(counts).reduce((a,b)=>a+b,0);
            document.getElementById('totalStudents').textContent = total;
        } catch (error) {
            console.error('Error counting students:', error);
        }
    }

    getTeacherName(id) {
        const t = this.teachers.find(x => x.id === id);
        return t ? t.name : '—';
    }

    renderClassesTable() {
        const body = document.getElementById('classesTableBody');
        if (!body) return;
        if (this.classes.length === 0) {
            body.innerHTML = `<tr><td colspan="7" class="px-6 py-8 text-center text-gray-500">No classes found</td></tr>`;
            return;
        }
        body.innerHTML = this.classes.map(c => `
            <tr class="hover:bg-gray-50">
                <td class="px-6 py-3">
                    <div class="font-semibold text-gray-800">${c.name || 'Untitled Class'}</div>
                    <div class="text-xs text-gray-500">${c.id}</div>
                </td>
                <td class="px-6 py-3 text-sm">${c.level || '—'}</td>
                <td class="px-6 py-3 text-sm">${c.grade || '—'}</td>
                <td class="px-6 py-3 text-sm">${c.strand || '—'}</td>
                <td class="px-6 py-3 text-sm">${this.getTeacherName(c.teacherId)}</td>
                <td class="px-6 py-3 text-sm">${c.studentsCount || 0}</td>
                <td class="px-6 py-3">
                    <div class="flex items-center space-x-3">
                        <button class="text-blue-600 hover:text-blue-800" title="Edit Class" onclick="classManagement.openEditModal('${c.id}')">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="text-green-600 hover:text-green-800" title="View Students" onclick="classManagement.openViewStudentsModal('${c.id}')">
                            <i class="fas fa-users"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    setupEventListeners() {
        const createBtn = document.getElementById('createClassBtn');
        if (createBtn) createBtn.addEventListener('click', () => this.openCreateClassModal());
        const refreshBtn = document.getElementById('refreshClassesBtn');
        if (refreshBtn) refreshBtn.addEventListener('click', () => this.loadClasses());
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
            const name = document.getElementById('className').value.trim();
            const level = document.getElementById('classLevel').value;
            const grade = document.getElementById('classGrade').value;
            const strand = document.getElementById('classStrand').value;
            const teacherId = document.getElementById('classTeacher').value || null;
            const capacity = parseInt(document.getElementById('classCapacity').value || '30', 10);
            if (!name || !level || !grade) return;
            const doc = {
                name, level, grade, strand: strand || null, teacherId, capacity,
                status: 'active', createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            await EducareTrack.db.collection('classes').add(doc);
            this.closeCreateClassModal();
            await this.loadClasses();
        } catch (error) { console.error('Create class failed:', error); }
    }

    openEditModal(classId) {
        this.selectedClassId = classId;
        const cls = this.classes.find(c => c.id === classId);
        if (!cls) return;
        document.getElementById('editClassName').value = cls.name || '';
        document.getElementById('editClassGrade').value = cls.grade || '';
        const teacherSel = document.getElementById('editClassTeacher');
        if (teacherSel) teacherSel.value = cls.teacherId || '';
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
            const name = document.getElementById('editClassName').value.trim();
            const grade = document.getElementById('editClassGrade').value.trim();
            const teacherId = document.getElementById('editClassTeacher').value || null;
            const updates = {};
            if (name) updates.name = name;
            if (grade) updates.grade = grade;
            updates.teacherId = teacherId;
            await EducareTrack.db.collection('classes').doc(this.selectedClassId).update(updates);
            this.closeEditModal();
            await this.loadClasses();
        } catch (error) { console.error('Save edits failed:', error); }
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
            const snap = await EducareTrack.db.collection('students').where('classId','==',classId).get();
            const students = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            const list = document.getElementById('studentsList');
            if (!list) return;
            if (students.length === 0) {
                list.innerHTML = '<div class="p-3 text-gray-500">No students in this class</div>';
                return;
            }
            list.innerHTML = students.map(s => `
                <div class="py-2 cursor-pointer hover:bg-gray-50" onclick="classManagement.showStudentInfo('${s.id}','${classId}')">
                    <div class="font-medium">${s.name || 'Unnamed Student'}</div>
                    <div class="text-xs text-gray-500">${s.id}</div>
                </div>
            `).join('');
        } catch (error) { console.error('Load students failed:', error); }
    }

    async showStudentInfo(studentId, classId) {
        try {
            const doc = await EducareTrack.db.collection('students').doc(studentId).get();
            if (!doc.exists) return;
            const s = { id: doc.id, ...doc.data() };
            const info = document.getElementById('studentPersonalInfo');
            if (!info) return;
            info.innerHTML = `
                <div class="space-y-2">
                    <div class="text-lg font-semibold text-gray-800">${s.name || 'Unnamed Student'}</div>
                    <div class="grid grid-cols-2 gap-2 text-sm">
                        <div><span class="text-gray-500">LRN:</span> ${s.lrn || '—'}</div>
                        <div><span class="text-gray-500">Grade:</span> ${s.grade || '—'}</div>
                        <div><span class="text-gray-500">Level:</span> ${s.level || '—'}</div>
                        <div><span class="text-gray-500">Strand:</span> ${s.strand || '—'}</div>
                        <div><span class="text-gray-500">Status:</span> ${s.status || '—'}</div>
                        <div><span class="text-gray-500">Parent:</span> ${s.parentName || '—'}</div>
                        <div><span class="text-gray-500">Phone:</span> ${s.parentPhone || '—'}</div>
                        <div><span class="text-gray-500">Address:</span> ${s.address || '—'}</div>
                    </div>
                </div>
            `;
        } catch (error) { console.error('Show student info failed:', error); }
    }

    showLoading() { const s = document.getElementById('loadingSpinner'); if (s) s.classList.remove('hidden'); }
    hideLoading() { const s = document.getElementById('loadingSpinner'); if (s) s.classList.add('hidden'); }
}

// Expose instance and helpers for HTML handlers
document.addEventListener('DOMContentLoaded', () => { window.classManagement = new ClassManagement(); });
function closeCreateClassModal() { if (window.classManagement) window.classManagement.closeCreateClassModal(); }
function createNewClass() { if (window.classManagement) window.classManagement.createNewClass(); }

