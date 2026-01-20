class ClassManagement {
    constructor() {
        this.currentUser = null;
        this.classes = [];
        this.filteredClasses = [];
        this.teachers = [];
        this.students = [];
        this.currentPage = 1;
        this.itemsPerPage = 10;
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
            if (this.currentUser.role !== 'admin') {
                window.location.href = `../${this.currentUser.role}/${this.currentUser.role}-dashboard.html`;
                return;
            }

            this.updateUI();
            await this.loadClassData();
            this.initEventListeners();
            
            this.hideLoading();
        } catch (error) {
            console.error('Class management initialization failed:', error);
            this.hideLoading();
        }
    }

    updateUI() {
        document.getElementById('userName').textContent = this.currentUser.name;
        document.getElementById('userRole').textContent = this.currentUser.role;
        document.getElementById('userInitials').textContent = this.currentUser.name
            .split(' ')
            .map(n => n[0])
            .join('')
            .substring(0, 2)
            .toUpperCase();

        this.updateCurrentTime();
        setInterval(() => this.updateCurrentTime(), 60000);
    }

    updateCurrentTime() {
        const now = new Date();
        document.getElementById('currentTime').textContent = now.toLocaleString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    async loadClassData() {
        try {
            if (!window.EducareTrack) {
                console.error('EducareTrack not available');
                return;
            }

            // Load classes, teachers, and students in parallel
            const [classesData, teachersData, studentsData] = await Promise.all([
                EducareTrack.getClasses(true),
                EducareTrack.getUsers(true).then(users => 
                    users.filter(user => user.role === 'teacher' && user.isActive)
                ),
                EducareTrack.getStudents(true)
            ]);

            this.classes = classesData;
            this.teachers = teachersData;
            this.students = studentsData;
            
            // Calculate student counts for each class
            this.calculateClassStatistics();
            
            // Apply initial filters
            this.filterClasses();
            
            // Update statistics
            this.updateStatistics();
            
            // Populate teacher dropdown
            this.populateTeacherDropdown();
            
            // Initialize level-based filters
            this.initLevelFilters();

        } catch (error) {
            console.error('Error loading class data:', error);
            this.showNotification('Error loading class data', 'error');
        }
    }

    calculateClassStatistics() {
        // Calculate student count for each class
        for (const classItem of this.classes) {
            const classStudents = this.students.filter(student => 
                student.classId === classItem.id && student.isActive
            );
            
            classItem.studentCount = classStudents.length;
            
            // Find homeroom teacher
            classItem.homeroomTeacher = this.teachers.find(teacher => 
                teacher.classId === classItem.id
            );
        }
    }

    filterClasses() {
        const levelFilter = document.getElementById('levelFilter').value;
        const gradeFilter = document.getElementById('gradeFilter').value;
        const statusFilter = document.getElementById('statusFilter').value;
        const searchTerm = document.getElementById('searchInput').value.toLowerCase();

        this.filteredClasses = this.classes.filter(classItem => {
            const matchesLevel = !levelFilter || classItem.level === levelFilter;
            const matchesGrade = !gradeFilter || classItem.grade === gradeFilter;
            const matchesStatus = !statusFilter || 
                (statusFilter === 'active' && classItem.isActive !== false) ||
                (statusFilter === 'inactive' && classItem.isActive === false);
            const matchesSearch = !searchTerm || 
                classItem.name.toLowerCase().includes(searchTerm) ||
                (classItem.homeroomTeacher && classItem.homeroomTeacher.name.toLowerCase().includes(searchTerm));

            return matchesLevel && matchesGrade && matchesStatus && matchesSearch;
        });

        this.renderClassesTable();
        this.updatePagination();
    }

    renderClassesTable() {
        const tbody = document.getElementById('classesTableBody');
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const currentClasses = this.filteredClasses.slice(startIndex, endIndex);

        if (currentClasses.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="px-6 py-8 text-center text-gray-500">
                        <i class="fas fa-inbox text-3xl mb-2"></i>
                        <p>No classes found</p>
                        <p class="text-sm mt-2">Try adjusting your filters or create a new class</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = currentClasses.map(classItem => `
            <tr class="hover:bg-gray-50">
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex items-center">
                        <div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                            <i class="fas fa-chalkboard text-blue-600"></i>
                        </div>
                        <div>
                            <div class="text-sm font-medium text-gray-900">${classItem.name}</div>
                            <div class="text-sm text-gray-500">${classItem.id}</div>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium 
                        ${this.getLevelColor(classItem.level)}">
                        ${classItem.level}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${classItem.grade || 'N/A'}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${classItem.strand || 'N/A'}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                    ${classItem.homeroomTeacher ? `
                        <div class="flex items-center">
                            <div class="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center mr-2">
                                <i class="fas fa-user text-green-600 text-xs"></i>
                            </div>
                            <span class="text-sm text-gray-900">${classItem.homeroomTeacher.name}</span>
                        </div>
                    ` : '<span class="text-sm text-gray-500">Not assigned</span>'}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <span class="font-medium">${classItem.studentCount || 0}</span>
                    <span class="text-gray-500">/ ${classItem.capacity || 30}</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium 
                        ${classItem.isActive !== false ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
                        ${classItem.isActive !== false ? 'Active' : 'Inactive'}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button onclick="classManagement.viewClassDetails('${classItem.id}')" 
                            class="text-blue-600 hover:text-blue-900 mr-3" title="View Details">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button onclick="classManagement.editClass('${classItem.id}')" 
                            class="text-green-600 hover:text-green-900 mr-3" title="Edit Class">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="classManagement.manageStudents('${classItem.id}')" 
                            class="text-purple-600 hover:text-purple-900 mr-3" title="Manage Students">
                        <i class="fas fa-user-graduate"></i>
                    </button>
                    <button onclick="classManagement.toggleClassStatus('${classItem.id}')" 
                            class="${classItem.isActive !== false ? 'text-yellow-600 hover:text-yellow-900' : 'text-green-600 hover:text-green-900'}" 
                            title="${classItem.isActive !== false ? 'Deactivate' : 'Activate'}">
                        <i class="fas ${classItem.isActive !== false ? 'fa-pause' : 'fa-play'}"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    getLevelColor(level) {
        const colors = {
            'Kindergarten': 'bg-purple-100 text-purple-800',
            'Elementary': 'bg-blue-100 text-blue-800',
            'Highschool': 'bg-green-100 text-green-800',
            'Senior High': 'bg-yellow-100 text-yellow-800'
        };
        return colors[level] || 'bg-gray-100 text-gray-800';
    }

    updateStatistics() {
        const totalClasses = this.classes.length;
        const totalStudents = this.classes.reduce((sum, classItem) => sum + (classItem.studentCount || 0), 0);
        const totalTeachers = this.teachers.length;

        document.getElementById('totalClasses').textContent = totalClasses;
        document.getElementById('totalStudents').textContent = totalStudents;
        document.getElementById('totalTeachers').textContent = totalTeachers;
    }

    updatePagination() {
        const totalItems = this.filteredClasses.length;
        const startIndex = (this.currentPage - 1) * this.itemsPerPage + 1;
        const endIndex = Math.min(startIndex + this.itemsPerPage - 1, totalItems);

        document.getElementById('paginationStart').textContent = totalItems > 0 ? startIndex : 0;
        document.getElementById('paginationEnd').textContent = endIndex;
        document.getElementById('paginationTotal').textContent = totalItems;

        document.getElementById('prevPage').disabled = this.currentPage === 1;
        document.getElementById('nextPage').disabled = endIndex >= totalItems;
    }

    initEventListeners() {
        // Sidebar toggle
        document.getElementById('sidebarToggle').addEventListener('click', () => {
            this.toggleSidebar();
        });

        // Logout
        document.getElementById('logoutBtn').addEventListener('click', () => {
            if (confirm('Are you sure you want to logout?')) {
                localStorage.removeItem('educareTrack_user');
                window.location.href = '../index.html';
            }
        });

        // Filters
        document.getElementById('levelFilter').addEventListener('change', () => {
            this.updateGradeFilter();
            this.filterClasses();
        });

        document.getElementById('gradeFilter').addEventListener('change', () => {
            this.filterClasses();
        });

        document.getElementById('statusFilter').addEventListener('change', () => {
            this.filterClasses();
        });

        document.getElementById('searchInput').addEventListener('input', () => {
            this.currentPage = 1;
            this.filterClasses();
        });

        // Pagination
        document.getElementById('prevPage').addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.renderClassesTable();
                this.updatePagination();
            }
        });

        document.getElementById('nextPage').addEventListener('click', () => {
            const totalPages = Math.ceil(this.filteredClasses.length / this.itemsPerPage);
            if (this.currentPage < totalPages) {
                this.currentPage++;
                this.renderClassesTable();
                this.updatePagination();
            }
        });

        // Create class button
        document.getElementById('createClassBtn').addEventListener('click', () => {
            this.openCreateClassModal();
        });

        // Export classes
        document.getElementById('exportClassesBtn').addEventListener('click', () => {
            this.exportClasses();
        });

        // Refresh classes
        document.getElementById('refreshClassesBtn').addEventListener('click', () => {
            this.loadClassData();
        });

        // Level change in create modal
        document.getElementById('classLevel').addEventListener('change', (e) => {
            this.updateCreateModalGrades(e.target.value);
            this.updateCreateModalStrands(e.target.value);
            this.updateCreateModalSubjects(e.target.value, document.getElementById('classStrand').value);
        });

        document.getElementById('classStrand').addEventListener('change', (e) => {
            this.updateCreateModalSubjects(document.getElementById('classLevel').value, e.target.value);
        });

        // Close modals on outside click
        document.getElementById('createClassModal').addEventListener('click', (e) => {
            if (e.target.id === 'createClassModal') {
                this.closeCreateClassModal();
            }
        });

        // Escape key to close modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeCreateClassModal();
            }
        });
    }

    initLevelFilters() {
        const levels = [...new Set(this.classes.map(c => c.level).filter(Boolean))];
        const levelFilter = document.getElementById('levelFilter');
        
        levels.forEach(level => {
            const option = document.createElement('option');
            option.value = level;
            option.textContent = level;
            levelFilter.appendChild(option);
        });
    }

    updateGradeFilter() {
        const level = document.getElementById('levelFilter').value;
        const gradeFilter = document.getElementById('gradeFilter');
        
        // Clear existing options except "All Grades"
        gradeFilter.innerHTML = '<option value="">All Grades</option>';
        
        if (!level) return;

        const grades = [...new Set(this.classes
            .filter(c => c.level === level && c.grade)
            .map(c => c.grade)
        )].sort();

        grades.forEach(grade => {
            const option = document.createElement('option');
            option.value = grade;
            option.textContent = grade;
            gradeFilter.appendChild(option);
        });
    }

    populateTeacherDropdown() {
        const teacherSelect = document.getElementById('classTeacher');
        teacherSelect.innerHTML = '<option value="">Select Homeroom Teacher</option>';
        
        // Show only teachers without class assignments
        const availableTeachers = this.teachers.filter(teacher => !teacher.classId);
        
        availableTeachers.forEach(teacher => {
            const option = document.createElement('option');
            option.value = teacher.id;
            option.textContent = teacher.name;
            teacherSelect.appendChild(option);
        });

        // Show message if no teachers available
        if (availableTeachers.length === 0) {
            const option = document.createElement('option');
            option.value = "";
            option.textContent = "No available teachers";
            option.disabled = true;
            teacherSelect.appendChild(option);
        }
    }

    updateCreateModalGrades(level) {
        const gradeSelect = document.getElementById('classGrade');
        gradeSelect.innerHTML = '<option value="">Select Grade</option>';
        
        if (!level) return;

        const grades = EducareTrack.getGradeLevels(level);
        grades.forEach(grade => {
            const option = document.createElement('option');
            option.value = grade;
            option.textContent = grade;
            gradeSelect.appendChild(option);
        });
    }

    updateCreateModalStrands(level) {
        const strandSelect = document.getElementById('classStrand');
        strandSelect.innerHTML = '<option value="">Select Strand (for Senior High)</option>';
        
        if (level === 'Senior High') {
            const strands = EducareTrack.getSeniorHighStrands();
            strands.forEach(strand => {
                const option = document.createElement('option');
                option.value = strand;
                option.textContent = strand;
                strandSelect.appendChild(option);
            });
        }
    }

    updateCreateModalSubjects(level, strand) {
        const subjectsContainer = document.getElementById('subjectsContainer');
        
        if (!level) {
            subjectsContainer.innerHTML = '<p class="text-sm text-gray-600">Select a level to see subjects</p>';
            return;
        }

        const subjects = EducareTrack.getSubjectsForLevel(level, strand);
        
        if (subjects.length === 0) {
            subjectsContainer.innerHTML = '<p class="text-sm text-gray-600">No subjects available for this level/strand</p>';
            return;
        }

        subjectsContainer.innerHTML = `
            <div class="grid grid-cols-2 gap-2">
                ${subjects.map(subject => `
                    <div class="flex items-center p-2 bg-white rounded border">
                        <i class="fas fa-book text-blue-500 mr-2 text-sm"></i>
                        <span class="text-sm">${subject}</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    openCreateClassModal() {
        document.getElementById('createClassModal').classList.remove('hidden');
        document.getElementById('createClassForm').reset();
        document.getElementById('subjectsContainer').innerHTML = '<p class="text-sm text-gray-600">Select a level to see subjects</p>';
    }

    closeCreateClassModal() {
        document.getElementById('createClassModal').classList.add('hidden');
    }

    async createNewClass() {
        try {
            const className = document.getElementById('className').value;
            const classLevel = document.getElementById('classLevel').value;
            const classGrade = document.getElementById('classGrade').value;
            const classStrand = document.getElementById('classStrand').value;
            const classTeacher = document.getElementById('classTeacher').value;
            const classCapacity = document.getElementById('classCapacity').value;

            if (!className || !classLevel || !classGrade) {
                this.showNotification('Please fill in all required fields', 'error');
                return;
            }

            if (!window.EducareTrack) {
                this.showNotification('System not ready. Please try again.', 'error');
                return;
            }

            // Show loading
            const createBtn = document.querySelector('#createClassModal button[onclick="createNewClass()"]');
            const originalText = createBtn.innerHTML;
            createBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Creating...';
            createBtn.disabled = true;

            // Prepare class data
            const classData = {
                name: className,
                level: classLevel,
                grade: classGrade,
                strand: classStrand || '',
                capacity: parseInt(classCapacity) || 30,
                subjects: EducareTrack.getSubjectsForLevel(classLevel, classStrand, classGrade),
                isActive: true,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: this.currentUser.id
            };

            // Create class using EducareTrack
            const classId = await EducareTrack.createClass(classData);

            // Assign teacher if selected
            if (classTeacher) {
                await EducareTrack.db.collection('users').doc(classTeacher).update({
                    classId: classId,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }

            // Success
            this.showNotification('Class created successfully!', 'success');
            this.closeCreateClassModal();
            
            // Refresh data
            await this.loadClassData();

        } catch (error) {
            console.error('Error creating class:', error);
            this.showNotification('Error creating class: ' + error.message, 'error');
            
            // Reset button
            const createBtn = document.querySelector('#createClassModal button[onclick="createNewClass()"]');
            createBtn.innerHTML = '<i class="fas fa-plus mr-2"></i>Create Class';
            createBtn.disabled = false;
        }
    }

    async viewClassDetails(classId) {
        try {
            const classDoc = await EducareTrack.db.collection('classes').doc(classId).get();
            if (!classDoc.exists) {
                this.showNotification('Class not found', 'error');
                return;
            }
            
            const classData = classDoc.data();
            const classStudents = this.students.filter(s => s.classId === classId && s.isActive);
            const homeroomTeacher = this.teachers.find(t => t.classId === classId);
            
            const details = `
Class Details:

Name: ${classData.name}
Level: ${classData.level}
Grade: ${classData.grade}
Strand: ${classData.strand || 'N/A'}
Capacity: ${classStudents.length}/${classData.capacity || 30}
Homeroom Teacher: ${homeroomTeacher ? homeroomTeacher.name : 'Not assigned'}
Status: ${classData.isActive !== false ? 'Active' : 'Inactive'}
Subjects: ${(classData.subjects || []).join(', ') || 'N/A'}
Created: ${classData.createdAt ? classData.createdAt.toDate().toLocaleDateString() : 'Unknown'}
            `.trim();

            alert(details);
        } catch (error) {
            console.error('Error loading class details:', error);
            this.showNotification('Failed to load class details', 'error');
        }
    }

    async editClass(classId) {
        try {
            const classDoc = await EducareTrack.db.collection('classes').doc(classId).get();
            if (!classDoc.exists) {
                this.showNotification('Class not found', 'error');
                return;
            }
            
            const classData = classDoc.data();
            const newName = prompt('Update class name', classData.name || '');
            if (newName === null) return;
            
            const newCapacity = prompt('Update class capacity', classData.capacity || 30);
            if (newCapacity === null) return;

            await EducareTrack.db.collection('classes').doc(classId).update({
                name: newName,
                capacity: parseInt(newCapacity) || 30,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            this.showNotification('Class updated successfully!', 'success');
            await this.loadClassData();
        } catch (error) {
            console.error('Error updating class:', error);
            this.showNotification('Failed to update class', 'error');
        }
    }

    async manageStudents(classId) {
        this.showNotification('Student management feature coming soon!', 'info');
        // This would open a modal to manage student assignments
    }

    async toggleClassStatus(classId) {
        try {
            const classDoc = await EducareTrack.db.collection('classes').doc(classId).get();
            if (!classDoc.exists) {
                this.showNotification('Class not found', 'error');
                return;
            }
            
            const classData = classDoc.data();
            const classStudents = this.students.filter(s => s.classId === classId && s.isActive);
            const newStatus = classData.isActive === false;
            
            if (newStatus === false && classStudents.length > 0) {
                this.showNotification('Cannot deactivate class with assigned students', 'error');
                return;
            }

            await EducareTrack.db.collection('classes').doc(classId).update({
                isActive: newStatus,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            this.showNotification(`Class ${newStatus ? 'activated' : 'deactivated'} successfully!`, 'success');
            await this.loadClassData();
        } catch (error) {
            console.error('Error toggling class status:', error);
            this.showNotification('Failed to update class status', 'error');
        }
    }

    exportClasses() {
        const data = this.filteredClasses.map(classItem => ({
            'Class Name': classItem.name,
            'Class ID': classItem.id,
            'Level': classItem.level,
            'Grade': classItem.grade,
            'Strand': classItem.strand || 'N/A',
            'Homeroom Teacher': classItem.homeroomTeacher ? classItem.homeroomTeacher.name : 'Not assigned',
            'Students': classItem.studentCount || 0,
            'Capacity': classItem.capacity || 30,
            'Status': classItem.isActive !== false ? 'Active' : 'Inactive'
        }));

        if (data.length === 0) {
            this.showNotification('No data to export', 'warning');
            return;
        }

        const csv = this.convertToCSV(data);
        this.downloadCSV(csv, `classes-export-${new Date().toISOString().split('T')[0]}.csv`);
        this.showNotification('Classes exported successfully!', 'success');
    }

    convertToCSV(data) {
        const headers = Object.keys(data[0]);
        const csv = [
            headers.join(','),
            ...data.map(row => headers.map(header => `"${row[header]}"`).join(','))
        ].join('\n');
        
        return csv;
    }

    downloadCSV(csvContent, fileName) {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', fileName);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }

    toggleSidebar() {
        const sidebar = document.querySelector('.sidebar');
        const mainContent = document.querySelector('.main-content');
        
        if (sidebar.classList.contains('collapsed')) {
            sidebar.classList.remove('collapsed');
            mainContent.classList.remove('ml-16');
            mainContent.classList.add('ml-64');
        } else {
            sidebar.classList.add('collapsed');
            mainContent.classList.remove('ml-64');
            mainContent.classList.add('ml-16');
        }
    }

    showLoading() {
        document.getElementById('loadingSpinner').classList.remove('hidden');
    }

    hideLoading() {
        document.getElementById('loadingSpinner').classList.add('hidden');
    }

    showNotification(message, type = 'info') {
        if (window.EducareTrack && typeof window.EducareTrack.showNormalNotification === 'function') {
            window.EducareTrack.showNormalNotification({ title: type === 'error' ? 'Error' : 'Info', message, type });
        }
    }
}

// Global functions for modal handling
function openCreateClassModal() {
    window.classManagement.openCreateClassModal();
}

function closeCreateClassModal() {
    window.classManagement.closeCreateClassModal();
}

function createNewClass() {
    window.classManagement.createNewClass();
}

// Initialize class management when page loads
document.addEventListener('DOMContentLoaded', function() {
    window.classManagement = new ClassManagement();
});
