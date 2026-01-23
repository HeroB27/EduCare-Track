
class AdminStudentManagement {
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
                    <div class="text-sm font-medium text-gray-900">${student.full_name || 'Unknown'}</div>
                    <div class="text-xs text-gray-500">${student.strand ? student.strand : ''}</div>
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
        const statusFilter = document.getElementById('statusFilter').value;
        
        if (!searchTerm) {
            searchTerm = document.getElementById('searchStudents').value.toLowerCase();
        }

        this.filteredStudents = this.allStudents.filter(student => {
            const matchesSearch = (student.full_name || '').toLowerCase().includes(searchTerm) ||
                                (student.lrn || '').toLowerCase().includes(searchTerm) ||
                                (student.id || '').toLowerCase().includes(searchTerm);
            
            const matchesClass = !classFilter || (student.class_id || student.classId) === classFilter;
            const matchesStatus = !statusFilter || student.current_status === statusFilter;
            
            return matchesSearch && matchesClass && matchesStatus;
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
        // Photo upload preview
        const photoUpload = document.getElementById('photoUpload');
        if (photoUpload) {
            photoUpload.addEventListener('change', (e) => this.handlePhotoUpload(e));
        }
        
        // Save photo button
        const savePhotoBtn = document.getElementById('savePhotoBtn');
        if (savePhotoBtn) {
            savePhotoBtn.addEventListener('click', () => this.savePhoto());
        }
    }

    openAddStudentModal() {
        this.currentEditingStudent = null;
        document.getElementById('studentModalTitle').textContent = 'Enroll New Student';
        document.getElementById('studentForm').reset();
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

    async saveStudent() {
        try {
            this.showLoading();
            const fullName = document.getElementById('studentName').value.trim();
            const parentId = document.getElementById('studentParent').value || null;
            
            const studentData = {
                full_name: fullName,
                name: fullName,
                lrn: document.getElementById('studentLRN').value || '',
                class_id: document.getElementById('studentClass').value,
                strand: document.getElementById('studentStrand').value || '',
            };

            if (!studentData.full_name || !studentData.class_id) {
                this.showNotification('Please fill in all required fields', 'error');
                this.hideLoading();
                return;
            }

            let studentId;
            if (this.currentEditingStudent) {
                studentId = this.currentEditingStudent.id;
                const { error } = await window.supabaseClient
                    .from('students')
                    .update({ ...studentData, updated_at: new Date() })
                    .eq('id', studentId);
                if (error) throw error;
                this.showNotification('Student updated successfully', 'success');
            } else {
                studentId = window.EducareTrack.generateStudentId(studentData.lrn);
                const { error } = await window.supabaseClient
                    .from('students')
                    .insert({
                        id: studentId,
                        ...studentData,
                        current_status: 'out_school',
                        is_active: true,
                        created_at: new Date()
                    });
                if (error) throw error;
                this.showNotification('Student created successfully', 'success');
            }

            if (parentId) {
                await window.supabaseClient.from('parent_students').delete().eq('student_id', studentId);
                await window.supabaseClient.from('parent_students').insert({
                    parent_id: parentId,
                    student_id: studentId,
                    relationship: 'Parent'
                });
            } else if (this.currentEditingStudent) {
                await window.supabaseClient.from('parent_students').delete().eq('student_id', studentId);
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
        const classId = student.class_id || student.classId;
        document.getElementById('studentName').value = student.full_name || '';
        document.getElementById('studentLRN').value = student.lrn || '';
        document.getElementById('studentClass').value = classId || '';
        document.getElementById('studentGrade').value = this.getClassById(classId)?.grade || '';
        document.getElementById('studentLevel').value = this.getClassById(classId)?.level || 'Elementary';
        document.getElementById('studentStrand').value = student.strand || '';
        document.getElementById('studentParent').value = student.parent_id || '';
        
        const levelEvent = new Event('change');
        document.getElementById('studentLevel').dispatchEvent(levelEvent);
        
        setTimeout(() => {
            const grade = this.getClassById(classId)?.grade || '';
            document.getElementById('studentGrade').value = grade.replace('Grade ', '');
        }, 100);
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
            
            modalContent.innerHTML = `
                <div class="lg:col-span-1 space-y-6">
                    <!-- Basic Info -->
                    <div class="text-center bg-gray-50 p-6 rounded-lg">
                        <div class="w-32 h-32 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4 overflow-hidden relative group">
                            ${photoUrl ? 
                                `<img src="${photoUrl}" alt="${student.full_name}" class="w-full h-full object-cover">` :
                                `<span class="text-blue-600 font-semibold text-3xl">${(student.full_name || 'ST').split(' ').map(n => n[0]).join('').substring(0, 2)}</span>`
                            }
                            <button onclick="studentManagement.openPhotoModal()" class="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                <i class="fas fa-camera text-xl"></i>
                            </button>
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
                    
                    <!-- ID Card Actions -->
                    <div class="bg-blue-50 p-6 rounded-lg border border-blue-100">
                        <h4 class="font-semibold text-blue-900 mb-4 flex items-center">
                            <i class="fas fa-id-card mr-2"></i> ID Card Management
                        </h4>
                        <button onclick="studentManagement.openIDPreview()" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center shadow-md hover:shadow-lg transform hover:-translate-y-0.5">
                            <i class="fas fa-print mr-2"></i> Generate / Print ID
                        </button>
                    </div>
                </div>

                <div class="lg:col-span-1 space-y-6">
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
                            <div class="flex justify-between">
                                <span class="text-gray-600">Adviser</span>
                                <span class="font-medium">--</span>
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
                                    <i class="fas fa-envelope mt-1 w-6 text-gray-400"></i>
                                    <div>
                                        <p class="text-gray-600">${parentInfo.email || 'No email'}</p>
                                    </div>
                                </div>
                            </div>
                        ` : `
                            <p class="text-gray-500 italic text-center py-4">No guardian information linked.</p>
                            <button onclick="studentManagement.editStudent('${student.id}')" class="w-full mt-2 text-blue-600 hover:text-blue-800 text-sm font-medium">Link Guardian</button>
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

    // Photo Management
    openPhotoModal() {
        if (!this.currentViewStudent) return;
        document.getElementById('photoModal').classList.remove('hidden');
        document.getElementById('photoModal').classList.add('flex');
    }

    closePhotoModal() {
        document.getElementById('photoModal').classList.add('hidden');
        document.getElementById('photoModal').classList.remove('flex');
        document.getElementById('photoPreview').classList.add('hidden');
        document.getElementById('photoUpload').value = '';
    }

    handlePhotoUpload(event) {
        const file = event.target.files[0];
        if (file) {
            if (file.size > 2 * 1024 * 1024) {
                this.showNotification('File size must be less than 2MB', 'error');
                return;
            }
            if (!file.type.startsWith('image/')) {
                this.showNotification('Please select an image file', 'error');
                return;
            }
            const reader = new FileReader();
            reader.onload = (e) => {
                document.getElementById('previewImage').src = e.target.result;
                document.getElementById('photoPreview').classList.remove('hidden');
            };
            reader.readAsDataURL(file);
        }
    }

    async savePhoto() {
        try {
            const fileInput = document.getElementById('photoUpload');
            if (!fileInput.files[0]) {
                this.showNotification('Please select a photo first', 'error');
                return;
            }
            this.showLoading();
            const reader = new FileReader();
            reader.onload = async (e) => {
                const photoDataUrl = e.target.result;
                try {
                    const { error } = await window.supabaseClient
                        .from('students')
                        .update({ photo_url: photoDataUrl })
                        .eq('id', this.currentViewStudent.id);
                    
                    if (error) throw error;
                    
                    this.showNotification('Photo updated successfully', 'success');
                    this.closePhotoModal();
                    
                    // Refresh view
                    await this.viewStudent(this.currentViewStudent.id);
                    await this.loadStudents(); // Refresh list thumbnails
                } catch (error) {
                    console.error('Error updating photo:', error);
                    this.showNotification('Error updating photo', 'error');
                }
                this.hideLoading();
            };
            reader.readAsDataURL(fileInput.files[0]);
        } catch (error) {
            console.error('Error processing photo:', error);
            this.hideLoading();
        }
    }

    // ID Card Management
    openIDPreview() {
        if (!this.currentViewStudent) return;
        
        // Generate ID Card HTML
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
        const grade = this.getClassById(student.class_id || student.classId)?.grade || '';
        const section = this.getClassById(student.class_id || student.classId)?.name || '';
        const parent = student.parentInfo || {};
        const address = parent.address || 'Address not available';
        
        // --- FRONT ---
        frontContainer.innerHTML = `
            <div class="w-full h-full bg-white relative overflow-hidden flex flex-col items-center text-center border border-gray-200">
                <!-- Header Background -->
                <div class="absolute top-0 w-full h-24 bg-blue-600 z-0"></div>
                <div class="absolute top-16 w-full h-12 bg-yellow-400 transform -skew-y-3 z-0"></div>
                
                <!-- School Logo/Name -->
                <div class="relative z-10 mt-4 text-white">
                    <h1 class="font-bold text-lg tracking-wider">EDUCARE COLLEGES INC</h1>
                    <p class="text-[10px] uppercase tracking-widest">Purok 4 Irisan Baguio City</p>
                </div>
                
                <!-- Photo -->
                <div class="relative z-10 mt-3 w-32 h-32 rounded-full border-4 border-white shadow-lg overflow-hidden bg-gray-200">
                    ${photoUrl ? 
                        `<img src="${photoUrl}" class="w-full h-full object-cover">` : 
                        `<div class="w-full h-full flex items-center justify-center text-gray-400"><i class="fas fa-user text-4xl"></i></div>`
                    }
                </div>
                
                <!-- Student Info -->
                <div class="relative z-10 mt-3 w-full px-4 flex-1 flex flex-col justify-center">
                    <h2 class="font-bold text-xl text-gray-800 uppercase leading-tight line-clamp-2">${student.full_name || 'STUDENT NAME'}</h2>
                    <p class="text-blue-600 font-semibold mt-1">${grade} - ${section}</p>
                    <p class="text-gray-500 text-[10px] mt-2 px-2 line-clamp-2">${address}</p>
                </div>
                
                <!-- Footer Strip -->
                <div class="w-full h-4 bg-blue-600 mt-auto"></div>
            </div>
        `;

        // --- BACK ---
        // Generate QR Code
        const typeNumber = 4;
        const errorCorrectionLevel = 'L';
        const qr = qrcode(typeNumber, errorCorrectionLevel);
        qr.addData(student.id);
        qr.make();
        const qrSrc = qr.createImgTag(4).match(/src="([^"]*)"/)[1];

        backContainer.innerHTML = `
            <div class="w-full h-full bg-white relative overflow-hidden flex flex-col items-center text-center border border-gray-200 p-4">
                <div class="flex-1 flex flex-col items-center justify-center w-full space-y-4">
                    <!-- QR Code -->
                    <div class="border-2 border-gray-800 p-1 rounded">
                        <img src="${qrSrc}" class="w-32 h-32">
                    </div>
                    
                    <div class="space-y-1">
                         <p class="text-xs text-gray-500 uppercase">Student ID</p>
                         <p class="font-bold text-lg tracking-widest font-mono">${student.id}</p>
                    </div>

                    <div class="w-full border-t border-gray-300 pt-3">
                        <div class="mb-2">
                            <p class="text-[10px] text-gray-500 uppercase">Parent / Guardian</p>
                            <p class="font-bold text-sm">${parent.full_name || parent.name || 'N/A'}</p>
                        </div>
                        <div>
                            <p class="text-[10px] text-gray-500 uppercase">Emergency Contact</p>
                            <p class="font-bold text-sm">${parent.phone || 'N/A'}</p>
                        </div>
                    </div>
                </div>
                
                <div class="mt-auto text-[10px] text-gray-500 italic border-t border-gray-200 pt-2 w-full">
                    If found, please return to:<br>
                    <strong>Educare Colleges Inc.</strong><br>
                    Purok 4 Irisan Baguio City
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
            pdf.addImage(frontData, 'PNG', 0.2, 0.5, 2.125, 3.375);
            pdf.addImage(backData, 'PNG', 2.5, 0.5, 2.125, 3.375);
            
            pdf.save(`ID_${this.currentViewStudent.id}.pdf`);
            this.hideLoading();
        } catch (error) {
            console.error('Save PDF error:', error);
            this.showNotification('Error saving PDF', 'error');
            this.hideLoading();
        }
    }

    // Utilities
    showLoading() {
        const spinner = document.getElementById('loadingSpinner');
        if (spinner) {
            spinner.classList.remove('hidden');
            spinner.classList.add('flex');
        }
    }

    hideLoading() {
        const spinner = document.getElementById('loadingSpinner');
        if (spinner) {
            spinner.classList.add('hidden');
            spinner.classList.remove('flex');
        }
    }

    showNotification(message, type = 'success') {
        const id = type === 'success' ? 'successNotification' : 'errorNotification';
        const el = document.getElementById(id);
        const msgEl = type === 'success' ? document.getElementById('successMessage') : document.getElementById('errorMessage');
        
        if (el && msgEl) {
            msgEl.textContent = message;
            el.classList.remove('hidden');
            setTimeout(() => el.classList.add('hidden'), 3000);
        } else {
            alert(message);
        }
    }

    async toggleStudentStatus(studentId) {
        try {
            this.showLoading();
            const student = this.allStudents.find(s => s.id === studentId);
            if (!student) return;

            const newStatus = !student.is_active;
            const { error } = await window.supabaseClient
                .from('students')
                .update({ is_active: newStatus })
                .eq('id', studentId);

            if (error) throw error;
            
            this.showNotification(`Student ${newStatus ? 'activated' : 'deactivated'} successfully`, 'success');
            await this.loadStudents();
            this.hideLoading();
        } catch (error) {
            console.error('Error toggling status:', error);
            this.showNotification('Error updating status', 'error');
            this.hideLoading();
        }
    }
}

// Initialize
const studentManagement = new AdminStudentManagement();
