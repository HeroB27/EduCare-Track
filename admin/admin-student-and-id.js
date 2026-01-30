
class StudentAndIDManagement {
    constructor() {
        this.currentEditingStudent = null;
        this.currentViewStudent = null;
        this.classes = [];
        this.parents = [];
        this.allStudents = [];
        this.filteredStudents = [];
        this.currentUser = null;
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
            this.currentUser = JSON.parse(savedUser);
            if (this.currentUser.role !== 'admin') {
                window.location.href = `../${this.currentUser.role}/${this.currentUser.role}-dashboard.html`;
                return;
            }

            this.updateSidebarUserInfo();
            this.updateCurrentTime();
            setInterval(() => this.updateCurrentTime(), 60000);

            await this.loadClasses();
            await this.loadParents();
            await this.loadStudents();
            
            this.populateClassFilters();
            this.setupEventListeners();
            this.populateLevelDependentFields();
            this.populateParentDropdown();
            this.populateClassDropdown();
            
            this.hideLoading();
        } catch (error) {
            console.error('Error initializing student management:', error);
            this.hideLoading();
        }
    }

    updateSidebarUserInfo() {
        if (this.currentUser) {
            document.getElementById('userName').textContent = this.currentUser.name;
            document.getElementById('userRole').textContent = this.currentUser.role;
            document.getElementById('userInitials').textContent = this.currentUser.name
                .split(' ')
                .map(n => n[0])
                .join('')
                .substring(0, 2)
                .toUpperCase();
        }
        
        // Sidebar toggle
        const sidebarToggle = document.getElementById('sidebarToggle');
        if (sidebarToggle) {
            sidebarToggle.addEventListener('click', () => {
                document.querySelector('.sidebar').classList.toggle('-translate-x-full');
            });
        }
        
        // Logout
        document.getElementById('logoutBtn').addEventListener('click', async () => {
             if (confirm('Are you sure you want to logout?')) {
                localStorage.removeItem('educareTrack_user');
                window.location.href = '../index.html';
            }
        });
    }

    updateCurrentTime() {
        const now = new Date();
        const timeElement = document.getElementById('currentTime');
        if (timeElement) {
            timeElement.textContent = now.toLocaleString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
    }

    async loadClasses() {
        try {
            this.classes = await window.EducareTrack.getClasses();
        } catch (error) {
            console.error('Error loading classes:', error);
            this.classes = [];
        }
    }

    async loadParents() {
        try {
            let parents = [];
            if (window.supabaseClient) {
                const { data, error } = await window.supabaseClient
                    .from('profiles')
                    .select('*')
                    .eq('role', 'parent');
                if (!error && data) parents = data;
            }
            if (parents.length === 0 && window.EducareTrack.getUsersByRole) {
                parents = await window.EducareTrack.getUsersByRole('parent');
            }
            this.parents = parents.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
        } catch (error) {
            console.error('Error loading parents:', error);
            this.parents = [];
        }
    }

    populateParentDropdown() {
        const parentSelect = document.getElementById('studentParent');
        if (!parentSelect) return;
        parentSelect.innerHTML = '<option value="">Select Parent</option>';
        this.parents.forEach(parent => {
            parentSelect.innerHTML += `<option value="${parent.id}">${parent.full_name} (${parent.phone || 'No Phone'})</option>`;
        });
    }

    populateClassDropdown() {
        const classSelect = document.getElementById('studentClass');
        if (!classSelect) return;
        const currentVal = classSelect.value;
        classSelect.innerHTML = '<option value="">Select Class</option>';
        this.classes.forEach(cls => {
            const displayName = cls.name || cls.id;
            const levelInfo = cls.level ? ` - ${cls.level}` : '';
            classSelect.innerHTML += `<option value="${cls.id}">${displayName} (${cls.grade}${levelInfo})</option>`;
        });
        if (currentVal) classSelect.value = currentVal;
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
                    <td colspan="5" class="px-6 py-4 text-center text-gray-500">
                        No students found matching your criteria
                    </td>
                </tr>`;
            return;
        }

        tableBody.innerHTML = this.filteredStudents.map(student => `
            <tr class="hover:bg-gray-50 transition-colors">
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm font-mono font-medium text-gray-900">${student.id}</div>
                    ${student.lrn ? `<div class="text-xs text-gray-500">LRN: ${student.lrn}</div>` : ''}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex items-center">
                        <div class="h-8 w-8 rounded-full bg-gray-200 flex-shrink-0 overflow-hidden mr-3">
                            ${student.photo_url ? `<img src="${student.photo_url}" class="h-full w-full object-cover">` : '<i class="fas fa-user text-gray-400 p-2"></i>'}
                        </div>
                        <div>
                            <div class="text-sm font-medium text-gray-900">${student.full_name || 'Unknown'}</div>
                            <div class="text-xs text-gray-500">${student.strand ? student.strand : ''}</div>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm text-gray-900">${this.getClassById(student.class_id || student.classId)?.name || this.getClassById(student.class_id || student.classId)?.id || 'N/A'}</div>
                    <div class="text-xs text-gray-500">${this.getClassById(student.class_id || student.classId)?.grade || 'N/A'}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${this.getStatusColor(student.current_status)}">
                        ${this.getStatusText(student.current_status)}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button onclick="studentManagement.viewStudent('${student.id}')" 
                            class="text-blue-600 hover:text-blue-900 mr-3 transition-colors" title="View Details">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button onclick="studentManagement.editStudent('${student.id}')" 
                            class="text-green-600 hover:text-green-900 mr-3 transition-colors" title="Edit Student">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="studentManagement.toggleStudentStatus('${student.id}')" 
                            class="${student.is_active ? 'text-red-600 hover:text-red-900' : 'text-green-600 hover:text-green-900'} transition-colors"
                            title="${student.is_active ? 'Deactivate' : 'Activate'} Student">
                        <i class="fas ${student.is_active ? 'fa-user-slash' : 'fa-user-check'}"></i>
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

    searchStudents() {
        const searchTerm = document.getElementById('searchStudents').value.toLowerCase();
        this.filterStudents(searchTerm);
    }

    filterStudents(searchTerm = '') {
        const classFilter = document.getElementById('classFilter').value;
        const gradeFilter = document.getElementById('gradeFilter').value;
        const statusFilter = document.getElementById('statusFilter').value;
        
        if (!searchTerm) {
            searchTerm = document.getElementById('searchStudents').value.toLowerCase();
        }

        this.filteredStudents = this.allStudents.filter(student => {
            const matchesSearch = (student.full_name || '').toLowerCase().includes(searchTerm) ||
                                (student.lrn || '').toLowerCase().includes(searchTerm) ||
                                (student.id || '').toLowerCase().includes(searchTerm);
            
            const studentClass = this.getClassById(student.class_id || student.classId);
            
            const matchesClass = !classFilter || (student.class_id || student.classId) === classFilter;
            const matchesGrade = !gradeFilter || (studentClass && studentClass.grade === gradeFilter);
            const matchesStatus = !statusFilter || student.current_status === statusFilter;
            
            return matchesSearch && matchesClass && matchesGrade && matchesStatus;
        });
        
        this.renderStudentsTable();
        document.getElementById('studentCount').textContent = 
            `Total Students: ${this.allStudents.length} (${this.filteredStudents.length} filtered)`;
    }

    populateClassFilters() {
        const filterSelect = document.getElementById('classFilter');
        this.classes.forEach(cls => {
             const displayName = cls.name || cls.id;
             filterSelect.innerHTML += `<option value="${cls.id}">${displayName}</option>`;
        });
    }

    setupEventListeners() {
        // Parent dropdown change listener
        const parentSelect = document.getElementById('studentParent');
        if (parentSelect) {
            parentSelect.addEventListener('change', (e) => {
                const parentId = e.target.value;
                const parent = this.parents.find(p => p.id === parentId);
                if (parent) {
                    document.getElementById('parentPhone').value = parent.phone || '';
                    document.getElementById('parentAddress').value = parent.address || '';
                } else {
                    document.getElementById('parentPhone').value = '';
                    document.getElementById('parentAddress').value = '';
                }
            });
        }
    }

    openAddStudentModal() {
        this.currentEditingStudent = null;
        document.getElementById('studentModalTitle').textContent = 'Enroll New Student';
        document.getElementById('studentForm').reset();
        
        // Reset Photo Preview
        document.getElementById('editStudentPhotoPreview').classList.add('hidden');
        document.getElementById('editStudentPhotoPlaceholder').classList.remove('hidden');
        document.getElementById('studentIdInput').value = ''; 

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
                    const gradeValue = grade.replace('Grade ', '');
                    gradeSelect.innerHTML += `<option value="${gradeValue}">${gradeValue}</option>`;
                });
            }

            if (level === 'Senior High School') {
                strandGroup.classList.remove('hidden');
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
    }

    // Handle photo preview in edit modal
    handleEditPhotoPreview(event) {
        const file = event.target.files[0];
        if (file) {
            if (file.size > 2 * 1024 * 1024) {
                this.showNotification('File size must be less than 2MB', 'error');
                event.target.value = '';
                return;
            }
            if (!file.type.startsWith('image/')) {
                this.showNotification('Please select an image file', 'error');
                event.target.value = '';
                return;
            }
            const reader = new FileReader();
            reader.onload = (e) => {
                const preview = document.getElementById('editStudentPhotoPreview');
                const placeholder = document.getElementById('editStudentPhotoPlaceholder');
                preview.src = e.target.result;
                preview.classList.remove('hidden');
                placeholder.classList.add('hidden');
            };
            reader.readAsDataURL(file);
        }
    }

    async saveStudent() {
        try {
            this.showLoading();
            const fullName = document.getElementById('studentName').value.trim();
            const parentId = document.getElementById('studentParent').value || null;
            const parentPhone = document.getElementById('parentPhone').value;
            const parentAddress = document.getElementById('parentAddress').value;
            const inputId = document.getElementById('studentIdInput').value.trim();
            
            const studentData = {
                full_name: fullName,
                name: fullName,
                lrn: document.getElementById('studentLRN').value || '',
                class_id: document.getElementById('studentClass').value,
                strand: document.getElementById('studentStrand').value || '',
            };

            // Handle Photo Upload first if new file selected
            const photoInput = document.getElementById('editStudentPhotoInput');
            if (photoInput.files[0]) {
                 const file = photoInput.files[0];
                 const reader = new FileReader();
                 const photoPromise = new Promise((resolve, reject) => {
                     reader.onload = e => resolve(e.target.result);
                     reader.onerror = reject;
                 });
                 reader.readAsDataURL(file);
                 const photoDataUrl = await photoPromise;
                 studentData.photo_url = photoDataUrl;
            }

            if (!studentData.full_name || !studentData.class_id) {
                this.showNotification('Please fill in all required fields', 'error');
                this.hideLoading();
                return;
            }

            let studentId;
            if (this.currentEditingStudent) {
                studentId = this.currentEditingStudent.id;
                
                if (inputId && inputId !== studentId) {
                    studentData.id = inputId;
                }

                const { error } = await window.supabaseClient
                    .from('students')
                    .update({ ...studentData, updated_at: new Date() })
                    .eq('id', studentId);

                if (error) throw error;
                this.showNotification('Student updated successfully', 'success');
            } else {
                if (inputId) {
                    studentData.id = inputId;
                } else {
                     // Generate ID if not provided: EDU-YEAR-LLLL-XXXX
                     const year = new Date().getFullYear();
                     const lrn = studentData.lrn || '0000';
                     const last4LRN = lrn.length >= 4 ? lrn.slice(-4) : lrn.padStart(4, '0');
                     const random = Math.floor(1000 + Math.random() * 9000);
                     studentData.id = `EDU-${year}-${last4LRN}-${random}`;
                }

                const { data, error } = await window.supabaseClient
                    .from('students')
                    .insert([{ ...studentData, created_at: new Date(), is_active: true }])
                    .select();

                if (error) throw error;
                studentId = data[0].id;
                this.showNotification('Student enrolled successfully', 'success');
            }

            // Update parent info if needed (skipping for now as it's complex to update profile from here)

            this.closeModal();
            this.loadStudents();
        } catch (error) {
            console.error('Error saving student:', error);
            this.showNotification('Error saving student: ' + error.message, 'error');
            this.hideLoading();
        }
    }

    async viewStudent(studentId) {
        try {
            this.showLoading();
            const student = await window.EducareTrack.getStudentById(studentId);
            if (!student) throw new Error('Student not found');
            
            this.currentViewStudent = student;

            // Load additional data
            let parentInfo = null;
            if (student.parent_id) {
                parentInfo = this.parents.find(p => p.id === student.parent_id);
                if (!parentInfo && window.EducareTrack.getUserById) {
                    parentInfo = await window.EducareTrack.getUserById(student.parent_id);
                }
            }
            
            // Store parent info for ID card generation
            this.currentViewStudent.parentInfo = parentInfo;

            const modalContent = document.getElementById('studentDetailContent');
            const photoUrl = student.photo_url || student.photoUrl;
            
            // Use the layout from admin-student-and-id.html which expects injected content
            // We'll adapt the admin-student-management.js viewStudent layout to fit the modal structure
            modalContent.innerHTML = `
                <div class="space-y-6">
                    <!-- Basic Info -->
                    <div class="text-center bg-gray-50 p-6 rounded-lg">
                        <div class="w-32 h-32 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4 overflow-hidden relative group">
                            ${photoUrl ? 
                                `<img src="${photoUrl}" alt="${student.full_name}" class="w-full h-full object-cover">` :
                                `<span class="text-blue-600 font-semibold text-3xl">${(student.full_name || 'ST').split(' ').map(n => n[0]).join('').substring(0, 2)}</span>`
                            }
                        </div>
                        <h3 class="text-2xl font-bold text-gray-800">${student.full_name || 'Unknown'}</h3>
                        <p class="text-gray-600 font-medium">${this.getClassById(student.class_id || student.classId)?.grade || 'N/A'} • ${this.getClassById(student.class_id || student.classId)?.name || 'N/A'}</p>
                        ${student.strand ? `<p class="text-blue-600 mt-1 font-medium">${student.strand}</p>` : ''}
                        <div class="mt-4 flex justify-center space-x-2">
                            <span class="px-3 py-1 rounded-full text-sm font-medium ${this.getStatusColor(student.current_status)}">
                                ${this.getStatusText(student.current_status)}
                            </span>
                            <span class="px-3 py-1 rounded-full text-sm font-medium bg-gray-200 text-gray-700">
                                ID: ${student.id}
                            </span>
                        </div>
                    </div>
                </div>

                <div class="space-y-6">
                    <!-- Academic Info -->
                    <div class="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                        <h4 class="font-semibold text-gray-800 mb-4 border-b pb-2">Academic Information</h4>
                        <div class="space-y-3">
                            <div class="flex justify-between">
                                <span class="text-gray-600">LRN</span>
                                <span class="font-medium">${student.lrn || 'Not Assigned'}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-600">Level</span>
                                <span class="font-medium">${this.getClassById(student.class_id || student.classId)?.level || 'N/A'}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-600">Section</span>
                                <span class="font-medium">${this.getClassById(student.class_id || student.classId)?.section || 'N/A'}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Parent Info -->
                    <div class="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                        <h4 class="font-semibold text-gray-800 mb-4 border-b pb-2">Guardian Information</h4>
                        ${parentInfo ? `
                            <div class="space-y-3">
                                <div class="flex items-start">
                                    <i class="fas fa-user mt-1 w-6 text-gray-400"></i>
                                    <div>
                                        <p class="font-medium text-gray-800">${parentInfo.full_name || parentInfo.name}</p>
                                        <p class="text-xs text-gray-500">Parent/Guardian</p>
                                    </div>
                                </div>
                                <div class="flex items-start">
                                    <i class="fas fa-phone mt-1 w-6 text-gray-400"></i>
                                    <div>
                                        <p class="text-gray-600">${parentInfo.phone || 'No phone'}</p>
                                    </div>
                                </div>
                                <div class="flex items-start">
                                    <i class="fas fa-map-marker-alt mt-1 w-6 text-gray-400"></i>
                                    <div>
                                        <p class="text-gray-600">${parentInfo.address || 'No address'}</p>
                                    </div>
                                </div>
                            </div>
                        ` : `
                            <p class="text-gray-500 italic text-center py-4">No guardian information linked.</p>
                        `}
                    </div>
                </div>
            `;
            
            document.getElementById('studentDetailModal').classList.remove('hidden');
            document.getElementById('studentDetailModal').classList.add('flex');
            this.hideLoading();
        } catch (error) {
            console.error('Error viewing student:', error);
            this.showNotification('Error loading student details', 'error');
            this.hideLoading();
        }
    }

    closeViewModal() {
        document.getElementById('studentDetailModal').classList.add('hidden');
        document.getElementById('studentDetailModal').classList.remove('flex');
        this.currentViewStudent = null;
    }

    editStudent(studentId) {
        const student = this.allStudents.find(s => s.id === studentId);
        if (!student) return;

        this.currentEditingStudent = student;
        document.getElementById('studentModalTitle').textContent = 'Edit Student';
        
        // Populate form
        document.getElementById('studentName').value = student.full_name || '';
        document.getElementById('studentLRN').value = student.lrn || '';
        document.getElementById('studentIdInput').value = student.id || '';
        
        const studentClass = this.getClassById(student.class_id || student.classId);
        if (studentClass) {
            let level = studentClass.level;
            if (!level) {
                const grade = studentClass.grade;
                if (grade === 'Kindergarten' || /Grade [1-6]$/.test(grade)) {
                    level = 'Elementary';
                } else if (/Grade (7|8|9|10)$/.test(grade)) {
                    level = 'Junior High School';
                } else if (/Grade (11|12)$/.test(grade)) {
                    level = 'Senior High School';
                } else {
                    level = 'Junior High School'; // Default
                }
            }
             
             const levelSelect = document.getElementById('studentLevel');
             levelSelect.value = level;
             levelSelect.dispatchEvent(new Event('change'));
             
             setTimeout(() => {
                 document.getElementById('studentGrade').value = studentClass.grade.replace('Grade ', '');
             }, 100);
             
             if (student.strand) {
                 document.getElementById('studentStrand').value = student.strand;
             }
             
             document.getElementById('studentClass').value = studentClass.id;
        }

        document.getElementById('studentParent').value = student.parent_id || student.parentId || '';
        document.getElementById('studentParent').dispatchEvent(new Event('change'));

        // Handle Photo Preview
        const preview = document.getElementById('editStudentPhotoPreview');
        const placeholder = document.getElementById('editStudentPhotoPlaceholder');
        if (student.photo_url) {
            preview.src = student.photo_url;
            preview.classList.remove('hidden');
            placeholder.classList.add('hidden');
        } else {
            preview.classList.add('hidden');
            placeholder.classList.remove('hidden');
        }

        this.openModal();
    }

    async toggleStudentStatus(studentId) {
        if (!confirm("Are you sure you want to change this student's status?")) return;
        
        try {
            this.showLoading();
            const student = this.allStudents.find(s => s.id === studentId);
            const newStatus = !student.is_active;
            
            const { error } = await window.supabaseClient
                .from('students')
                .update({ is_active: newStatus })
                .eq('id', studentId);

            if (error) throw error;
            
            this.showNotification(`Student ${newStatus ? 'activated' : 'deactivated'} successfully`, 'success');
            this.loadStudents();
        } catch (error) {
            console.error('Error updating status:', error);
            this.showNotification('Error updating status', 'error');
            this.hideLoading();
        }
    }

    // --- ID Card & Reissue Functions ---

    generateNewStudentId() {
        const year = new Date().getFullYear();
        const random = Math.floor(1000 + Math.random() * 9000);
        return `${year}-${random}`;
    }

    async reissueID() {
        if (!this.currentViewStudent) return;
        
        if (!confirm('Are you sure you want to reissue this ID? This will generate a new student ID and invalidate the old one.')) return;

        try {
            this.showLoading();
            const newStudentId = this.generateNewStudentId();
            const oldId = this.currentViewStudent.id;

            // Check if new ID exists
             const { data: existing } = await window.supabaseClient
                .from('students')
                .select('id')
                .eq('id', newStudentId)
                .single();
             if (existing) {
                 this.hideLoading();
                 this.showNotification('Generated ID collision. Please try again.', 'error');
                 return;
             }

            const { error } = await window.supabaseClient
                .from('students')
                .update({ 
                    id: newStudentId,
                    updated_at: new Date()
                })
                .eq('id', oldId);

            if (error) throw error;

            // Update local state
            this.currentViewStudent.id = newStudentId;
            const index = this.allStudents.findIndex(s => s.id === oldId);
            if (index !== -1) {
                this.allStudents[index].id = newStudentId;
            }

            this.showNotification('ID reissued successfully. New ID: ' + newStudentId, 'success');
            
            // Refresh views
            this.renderIDCard(this.currentViewStudent); 
            this.renderStudentsTable();
            
            // Update detail view if open
            // We re-call viewStudent to refresh the modal content
            this.viewStudent(newStudentId);
            
        } catch (error) {
            console.error('Error reissuing ID:', error);
            this.showNotification('Error reissuing ID: ' + error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    openIDPreview() {
        if (!this.currentViewStudent) return;
        this.renderIDCard(this.currentViewStudent);
        document.getElementById('idPreviewModal').classList.remove('hidden');
        document.getElementById('idPreviewModal').classList.add('flex');
    }

    closeIDPreview() {
        document.getElementById('idPreviewModal').classList.add('hidden');
        document.getElementById('idPreviewModal').classList.remove('flex');
    }

    renderIDCard(student) {
        const frontContainer = document.getElementById('idCardFront');
        const backContainer = document.getElementById('idCardBack');
        
        const photoUrl = student.photo_url || student.photoUrl || '';
        const cls = this.getClassById(student.class_id || student.classId);
        const className = cls?.name || cls?.grade || 'No Class';
        
        const parent = student.parentInfo || {};
        const parentName = parent.full_name || parent.name || 'N/A';
        const parentPhone = parent.phone || 'N/A';
        const studentAddress = student.address || parent.address || 'Address not available';
        
        // --- FRONT ---
        frontContainer.innerHTML = `
            <div class="h-full w-full flex flex-col p-4 relative z-10 font-sans select-none bg-white overflow-hidden">
                <!-- Background Decoration -->
                <div class="absolute top-0 left-0 w-full h-24 bg-gradient-to-br from-blue-700 to-blue-900 -z-10" style="border-bottom-left-radius: 50% 20px; border-bottom-right-radius: 50% 20px;"></div>
                <div class="absolute top-2 right-2 opacity-10 text-white">
                    <i class="fas fa-university text-4xl"></i>
                </div>

                <!-- School Header -->
                <div class="text-center text-white mb-4 mt-1">
                    <h2 class="text-[0.8rem] font-bold uppercase tracking-wider leading-tight text-shadow-sm">Educare Colleges Inc</h2>
                    <p class="text-[0.55rem] opacity-90 font-light tracking-wide">Purok 4 Irisan Baguio City</p>
                </div>
                
                <!-- Photo -->
                <div class="mx-auto w-24 h-24 rounded-full border-[3px] border-white shadow-md overflow-hidden mb-3 bg-gray-100 relative group-hover:scale-105 transition-transform duration-300">
                    ${photoUrl 
                        ? `<img src="${photoUrl}" class="w-full h-full object-cover" alt="Student Photo">` 
                        : '<div class="w-full h-full flex items-center justify-center text-gray-300"><i class="fas fa-user text-3xl"></i></div>'}
                </div>
                
                <!-- Student Info -->
                <div class="text-center flex-grow flex flex-col items-center w-full">
                    <h1 class="text-lg font-bold text-gray-900 leading-tight mb-1 line-clamp-2 w-full px-2">${student.full_name || 'STUDENT NAME'}</h1>
                    
                    <div class="inline-block px-3 py-0.5 bg-blue-50 text-blue-800 rounded-full border border-blue-100 text-[0.65rem] font-bold mb-2 uppercase tracking-wide shadow-sm">
                        ${className}
                    </div>
                    
                    <div class="mt-auto mb-1 w-full px-4">
                         <p class="text-[0.6rem] text-gray-500 leading-tight line-clamp-2">${studentAddress}</p>
                    </div>
                </div>
                
                <!-- Footer Stripe -->
                <div class="absolute bottom-0 left-0 w-full h-2.5 bg-yellow-400"></div>
                <div class="absolute bottom-2.5 left-0 w-full h-1 bg-yellow-300 opacity-50"></div>
            </div>
        `;

        // --- BACK ---
        // Generate QR Code
        const typeNumber = 4;
        const errorCorrectionLevel = 'L';
        const qr = qrcode(typeNumber, errorCorrectionLevel);
        qr.addData(student.id);
        qr.make();
        const qrImg = qr.createImgTag(3).match(/src="([^"]*)"/)[1];

        backContainer.innerHTML = `
            <div class="h-full w-full flex flex-col p-5 relative text-center bg-white select-none overflow-hidden">
                 <div class="flex-grow flex flex-col items-center justify-center space-y-3">
                    <div class="qr-container bg-white p-1.5 rounded-lg shadow-sm border border-gray-200">
                        <img src="${qrImg}" class="w-24 h-24 block" alt="QR Code">
                    </div>
                    <div class="text-[0.65rem] font-mono text-gray-400 tracking-[0.2em] uppercase">${student.id}</div>
                </div>

                <div class="border-t border-gray-100 pt-3 mb-2">
                    <div class="text-[0.6rem] text-gray-400 uppercase tracking-widest mb-1 font-semibold">In case of emergency</div>
                    <p class="font-bold text-gray-800 text-sm leading-tight">${parentName}</p>
                    <p class="text-xs text-gray-600 font-medium">${parentPhone}</p>
                </div>

                <div class="bg-gray-50 rounded-md p-2 border border-gray-100 mt-auto">
                    <p class="text-[0.55rem] text-gray-500 italic leading-tight">
                        This card is non-transferable. If found, please return to Educare Colleges Inc. or call the number above.
                    </p>
                </div>
            </div>
        `;
    }

    async printID() {
        const frontEl = document.getElementById('idCardFront');
        const backEl = document.getElementById('idCardBack');
        
        try {
            this.showLoading();
            const canvasFront = await html2canvas(frontEl, { scale: 3 });
            const canvasBack = await html2canvas(backEl, { scale: 3 });
            
            const frontData = canvasFront.toDataURL('image/png');
            const backData = canvasBack.toDataURL('image/png');
            
            const printWindow = window.open('', '', 'width=800,height=600');
            printWindow.document.write(`
                <html>
                <head>
                    <title>Print ID - ${this.currentViewStudent.full_name}</title>
                    <style>
                        body { margin: 0; padding: 20px; display: flex; gap: 20px; justify-content: center; flex-wrap: wrap; }
                        .card { width: 2.125in; height: 3.375in; border: 1px dashed #ccc; }
                        @media print {
                            body { padding: 0; margin: 0; }
                            .card { border: none; margin: 10px; }
                        }
                    </style>
                </head>
                <body>
                    <img src="${frontData}" class="card">
                    <img src="${backData}" class="card">
                    <script>
                        window.onload = function() { window.print(); window.close(); }
                    </script>
                </body>
                </html>
            `);
            printWindow.document.close();
            this.hideLoading();
        } catch (error) {
            console.error('Print error:', error);
            this.showNotification('Error preparing print', 'error');
            this.hideLoading();
        }
    }

    async saveAsPNG() {
        const frontEl = document.getElementById('idCardFront');
        const backEl = document.getElementById('idCardBack');
        try {
            this.showLoading();
            const canvasFront = await html2canvas(frontEl, { scale: 3 });
            const canvasBack = await html2canvas(backEl, { scale: 3 });
            
            // Create a merged canvas
            const mergedCanvas = document.createElement('canvas');
            mergedCanvas.width = canvasFront.width + canvasBack.width + 20;
            mergedCanvas.height = Math.max(canvasFront.height, canvasBack.height);
            const ctx = mergedCanvas.getContext('2d');
            
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, mergedCanvas.width, mergedCanvas.height);
            
            ctx.drawImage(canvasFront, 0, 0);
            ctx.drawImage(canvasBack, canvasFront.width + 20, 0);
            
            const link = document.createElement('a');
            link.download = `ID_${this.currentViewStudent.id}_${this.currentViewStudent.full_name}.png`;
            link.href = mergedCanvas.toDataURL();
            link.click();
            this.hideLoading();
        } catch (error) {
            console.error('Save PNG error:', error);
            this.showNotification('Error saving PNG', 'error');
            this.hideLoading();
        }
    }

    async saveAsPDF() {
        const frontEl = document.getElementById('idCardFront');
        const backEl = document.getElementById('idCardBack');
        try {
            this.showLoading();
            const canvasFront = await html2canvas(frontEl, { scale: 3 });
            const canvasBack = await html2canvas(backEl, { scale: 3 });
            
            const frontData = canvasFront.toDataURL('image/png');
            const backData = canvasBack.toDataURL('image/png');
            
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'in',
                format: [4.5, 3.5] // Custom size to fit both
            });
            
            pdf.text("Student ID Card", 0.2, 0.3);
            pdf.addImage(frontData, 'PNG', 0.2, 0.5, 2, 3);
            pdf.addImage(backData, 'PNG', 2.3, 0.5, 2, 3);
            
            pdf.save(`ID_${this.currentViewStudent.id}.pdf`);
            this.hideLoading();
        } catch (error) {
            console.error('Save PDF error:', error);
            this.showNotification('Error saving PDF', 'error');
            this.hideLoading();
        }
    }

    showLoading() {
        document.getElementById('loadingOverlay').classList.remove('hidden');
        document.getElementById('loadingOverlay').classList.add('flex');
    }

    hideLoading() {
        document.getElementById('loadingOverlay').classList.add('hidden');
        document.getElementById('loadingOverlay').classList.remove('flex');
    }

    showNotification(message, type = 'info') {
        const notification = document.getElementById('notification');
        const title = document.getElementById('notificationTitle');
        const msg = document.getElementById('notificationMessage');
        const icon = document.getElementById('notificationIcon');

        title.textContent = type === 'error' ? 'Error' : 'Success';
        msg.textContent = message;
        
        if (type === 'error') {
            icon.className = 'mr-3 text-red-600';
            icon.innerHTML = '<i class="fas fa-exclamation-circle"></i>';
            notification.querySelector('.border-l-4').className = 'bg-white border-l-4 border-red-600 shadow-lg rounded p-4 flex items-center';
        } else {
            icon.className = 'mr-3 text-green-600';
            icon.innerHTML = '<i class="fas fa-check-circle"></i>';
            notification.querySelector('.border-l-4').className = 'bg-white border-l-4 border-green-600 shadow-lg rounded p-4 flex items-center';
        }

        notification.classList.remove('translate-y-full');
        setTimeout(() => {
            notification.classList.add('translate-y-full');
        }, 3000);
    }
}

// Initialize
window.studentManagement = new StudentAndIDManagement();
