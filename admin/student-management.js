class StudentManagement {
    constructor() {
        this.currentEditingStudent = null;
        this.classes = [];
        this.allStudents = [];
        this.filteredStudents = [];
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

            const savedUser = localStorage.getItem('educareTrack_user');
            if (!savedUser) {
                window.location.href = '../index.html';
                return;
            }
            const currentUser = JSON.parse(savedUser);
            if (currentUser.role !== 'admin') {
                window.location.href = `../${currentUser.role}/${currentUser.role}-dashboard.html`;
                return;
            }

            await this.loadClasses();
            await this.loadStudents();
            this.populateClassFilters();
            this.setupEventListeners();
            
            this.hideLoading();
        } catch (error) {
            console.error('Error initializing student management:', error);
            this.hideLoading();
        }
    }

    async loadStudents() {
        try {
            const students = await window.EducareTrack.getStudents(true);
            this.allStudents = students.map(student => ({
                ...student,
                lastActivityFormatted: student.lastAttendance ? 
                    window.EducareTrack.formatDate(student.lastAttendance) : 'No record'
            }));
            
            this.filteredStudents = [...this.allStudents];
            this.renderStudentsTable();
            
            // Update student count
            document.getElementById('studentCount').textContent = 
                `Total Students: ${this.allStudents.length} (${this.filteredStudents.length} filtered)`;
        } catch (error) {
            console.error('Error loading students:', error);
            this.showNotification('Error loading students', 'error');
        }
    }

    renderStudentsTable() {
        const tableBody = document.getElementById('studentsTableBody');
        
        if (this.filteredStudents.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="px-6 py-4 text-center text-gray-500">
                        No students found matching your criteria
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = this.filteredStudents.map(student => `
            <tr class="hover:bg-gray-50 transition-colors">
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm font-mono font-medium text-gray-900">${student.studentId || student.id}</div>
                    ${student.lrn ? `<div class="text-xs text-gray-500">LRN: ${student.lrn}</div>` : ''}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm font-medium text-gray-900">${student.name}</div>
                    <div class="text-xs text-gray-500">${student.level} • ${student.strand || ''}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm text-gray-500">${this.getClassById(student.classId)?.name || 'N/A'}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    ${student.grade}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${this.getStatusColor(student.currentStatus)}">
                        ${this.getStatusText(student.currentStatus)}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    ${student.lastActivityFormatted}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button onclick="studentManagement.viewStudent('${student.id}')" 
                            class="text-blue-600 hover:text-blue-900 mr-3 transition-colors"
                            title="View Student">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button onclick="studentManagement.editStudent('${student.id}')" 
                            class="text-green-600 hover:text-green-900 mr-3 transition-colors"
                            title="Edit Student">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="studentManagement.toggleStudentStatus('${student.id}')" 
                            class="${student.isActive ? 'text-red-600 hover:text-red-900' : 'text-green-600 hover:text-green-900'} transition-colors"
                            title="${student.isActive ? 'Deactivate' : 'Activate'} Student">
                        <i class="fas ${student.isActive ? 'fa-user-slash' : 'fa-user-check'}"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    getClassById(classId) {
        return this.classes.find(cls => cls.id === classId);
    }

    getStatusColor(status) {
        const colors = {
            'in_school': 'bg-green-100 text-green-800',
            'out_school': 'bg-gray-100 text-gray-800',
            'in_clinic': 'bg-yellow-100 text-yellow-800',
            'present': 'bg-green-100 text-green-800',
            'absent': 'bg-red-100 text-red-800',
            'late': 'bg-orange-100 text-orange-800'
        };
        return colors[status] || 'bg-gray-100 text-gray-800';
    }

    getStatusText(status) {
        const texts = {
            'in_school': 'In School',
            'out_school': 'Out of School',
            'in_clinic': 'In Clinic',
            'present': 'Present',
            'absent': 'Absent',
            'late': 'Late'
        };
        return texts[status] || 'Unknown';
    }

    openAddStudentModal() {
        this.currentEditingStudent = null;
        document.getElementById('studentModalTitle').textContent = 'Enroll New Student';
        document.getElementById('studentForm').reset();
        this.populateLevelDependentFields();
        this.openModal();
    }

    openModal() {
        const modal = document.getElementById('addStudentModal');
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    closeModal() {
        const modal = document.getElementById('addStudentModal');
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        this.currentEditingStudent = null;
    }

    // Populate grade levels and strands based on selected level
    populateLevelDependentFields() {
        const levelSelect = document.getElementById('studentLevel');
        const gradeSelect = document.getElementById('studentGrade');
        const strandGroup = document.getElementById('strandGroup');
        const strandInput = document.getElementById('studentStrand');

        levelSelect.addEventListener('change', function() {
            const level = this.value;
            gradeSelect.innerHTML = '<option value="">Select Grade</option>';
            
            if (level) {
                const grades = window.EducareTrack.getGradeLevels(level);
                grades.forEach(grade => {
                    gradeSelect.innerHTML += `<option value="${grade}">${grade}</option>`;
                });
            }

            // Show/hide strand field for Senior High
            if (level === 'Senior High School') {
                strandGroup.classList.remove('hidden');
                // Populate strand options
                strandInput.innerHTML = '<option value="">Select Strand</option>';
                const strands = window.EducareTrack.getSeniorHighStrands();
                strands.forEach(strand => {
                    strandInput.innerHTML += `<option value="${strand}">${strand}</option>`;
                });
            } else {
                strandGroup.classList.add('hidden');
                strandInput.value = '';
            }
        });

        // Trigger initial population
        if (levelSelect.value) {
            const event = new Event('change');
            levelSelect.dispatchEvent(event);
        }
    }

    async saveStudent() {
        try {
            this.showLoading();

            const studentData = {
                name: document.getElementById('studentName').value,
                lrn: document.getElementById('studentLRN').value || '',
                grade: document.getElementById('studentGrade').value,
                level: document.getElementById('studentLevel').value,
                classId: document.getElementById('studentClass').value,
                strand: document.getElementById('studentStrand').value || ''
            };

            // Validate required fields
            if (!studentData.name || !studentData.grade || !studentData.level) {
                this.showNotification('Please fill in all required fields', 'error');
                this.hideLoading();
                return;
            }

            if (this.currentEditingStudent) {
                // Update existing student
                await window.EducareTrack.db.collection('students').doc(this.currentEditingStudent.id).update({
                    ...studentData,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedBy: window.EducareTrack.currentUser.id
                });
                this.showNotification('Student updated successfully', 'success');
            } else {
                // Create new student
                const studentId = window.EducareTrack.generateStudentId(studentData.lrn);
                const newStudentData = {
                    ...studentData,
                    id: studentId,
                    studentId: studentId,
                    parentId: '', // Would normally link to parent
                    qrCode: studentId,
                    currentStatus: 'out_school',
                    isActive: true,
                    subjects: window.EducareTrack.getSubjectsForLevel(studentData.level, studentData.strand, studentData.grade),
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    createdBy: window.EducareTrack.currentUser.id
                };

                await window.EducareTrack.db.collection('students').doc(studentId).set(newStudentData);
                this.showNotification('Student enrolled successfully', 'success');
            }

            this.closeModal();
            await this.loadStudents();
            this.hideLoading();
        } catch (error) {
            console.error('Error saving student:', error);
            this.showNotification('Error saving student: ' + error.message, 'error');
            this.hideLoading();
        }
    }

    async editStudent(studentId) {
        try {
            this.showLoading();
            const student = await window.EducareTrack.getStudentById(studentId);
            if (student) {
                this.currentEditingStudent = student;
                document.getElementById('studentModalTitle').textContent = 'Edit Student';
                this.populateStudentForm(student);
                this.openModal();
            }
            this.hideLoading();
        } catch (error) {
            console.error('Error loading student:', error);
            this.showNotification('Error loading student', 'error');
            this.hideLoading();
        }
    }

    populateStudentForm(student) {
        document.getElementById('studentName').value = student.name || '';
        document.getElementById('studentLRN').value = student.lrn || '';
        document.getElementById('studentClass').value = student.classId || '';
        document.getElementById('studentGrade').value = student.grade || '';
        document.getElementById('studentLevel').value = student.level || 'Elementary';
        document.getElementById('studentStrand').value = student.strand || '';
        
        // Trigger level change to populate grades and show/hide strand
        const levelEvent = new Event('change');
        document.getElementById('studentLevel').dispatchEvent(levelEvent);
        
        // Set grade after level has populated options
        setTimeout(() => {
            document.getElementById('studentGrade').value = student.grade || '';
        }, 100);
    }

    async viewStudent(studentId) {
        try {
            const student = await window.EducareTrack.getStudentById(studentId);
            if (student) {
                this.showNotification(`Viewing student: ${student.name}`, 'info');
                // In a real implementation, you would open a detailed view modal
                console.log('Student details:', student);
            }
        } catch (error) {
            console.error('Error viewing student:', error);
            this.showNotification('Error loading student details', 'error');
        }
    }

    async toggleStudentStatus(studentId) {
        const student = this.allStudents.find(s => s.id === studentId);
        if (student) {
            const newStatus = !student.isActive;
            const confirmMessage = newStatus ? 
                'Are you sure you want to activate this student?' : 
                'Are you sure you want to deactivate this student?';
            
            if (confirm(confirmMessage)) {
                try {
                    this.showLoading();
                    await window.EducareTrack.db.collection('students').doc(studentId).update({
                        isActive: newStatus,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    this.showNotification(`Student ${newStatus ? 'activated' : 'deactivated'} successfully`, 'success');
                    await this.loadStudents();
                    this.hideLoading();
                } catch (error) {
                    console.error('Error updating student status:', error);
                    this.showNotification('Error updating student status', 'error');
                    this.hideLoading();
                }
            }
        }
    }

    async loadClasses() {
        try {
            this.classes = await window.EducareTrack.getClasses();
            this.populateClassSelects();
        } catch (error) {
            console.error('Error loading classes:', error);
        }
    }

    populateClassSelects() {
        const classSelect = document.getElementById('studentClass');
        classSelect.innerHTML = '<option value="">Select Class</option>';
        
        this.classes.forEach(cls => {
            if (cls.isActive !== false) {
                classSelect.innerHTML += `<option value="${cls.id}">${cls.name} - ${cls.grade} (${cls.level})</option>`;
            }
        });
    }

    populateClassFilters() {
        const filterSelect = document.getElementById('classFilter');
        filterSelect.innerHTML = '<option value="">All Classes</option>';
        
        this.classes.forEach(cls => {
            if (cls.isActive !== false) {
                filterSelect.innerHTML += `<option value="${cls.id}">${cls.name}</option>`;
            }
        });
    }

    searchStudents() {
        const searchTerm = document.getElementById('searchStudents').value.toLowerCase();
        this.filterStudents(searchTerm);
    }

    filterStudents(searchTerm = '') {
        const classFilter = document.getElementById('classFilter').value;
        const statusFilter = document.getElementById('statusFilter').value;

        this.filteredStudents = this.allStudents.filter(student => {
            const matchesSearch = student.name.toLowerCase().includes(searchTerm) || 
                                (student.studentId && student.studentId.toLowerCase().includes(searchTerm)) ||
                                (student.lrn && student.lrn.toLowerCase().includes(searchTerm));
            const matchesClass = !classFilter || student.classId === classFilter;
            const matchesStatus = !statusFilter || student.currentStatus === statusFilter;

            return matchesSearch && matchesClass && matchesStatus;
        });

        this.renderStudentsTable();
        
        // Update student count
        document.getElementById('studentCount').textContent = 
            `Total Students: ${this.allStudents.length} (${this.filteredStudents.length} filtered)`;
    }

    showNotification(message, type = 'info') {
        if (window.EducareTrack && typeof window.EducareTrack.showNormalNotification === 'function') {
            window.EducareTrack.showNormalNotification({ title: type === 'error' ? 'Error' : 'Info', message, type });
        }
    }

    showLoading() {
        document.getElementById('loadingSpinner').classList.remove('hidden');
        document.getElementById('loadingSpinner').classList.add('flex');
    }

    hideLoading() {
        document.getElementById('loadingSpinner').classList.add('hidden');
        document.getElementById('loadingSpinner').classList.remove('flex');
    }

    setupEventListeners() {
        // Close modal when clicking outside
        document.getElementById('addStudentModal').addEventListener('click', (e) => {
            if (e.target.id === 'addStudentModal') {
                this.closeModal();
            }
        });

        // Escape key to close modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
            }
        });

        // Refresh button (if you add one)
        const refreshBtn = document.querySelector('[onclick="studentManagement.loadStudents()"]');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.loadStudents());
        }
    }
}

// Initialize student management when the page loads
document.addEventListener('DOMContentLoaded', function() {
    window.studentManagement = new StudentManagement();
});
