class UserManagement {
    constructor() {
        this.currentEditingUser = null;
        this.currentRole = null;
        this.currentStep = 1;
        this.classes = [];
        this.allUsers = [];
        this.filteredUsers = [];
        this.selectedSubjects = [];
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

            document.getElementById('currentUserName').textContent = currentUser.name;

            await this.loadClasses();
            await this.loadUsers();
            this.setupEventListeners();
            
            this.hideLoading();
        } catch (error) {
            console.error('Error initializing user management:', error);
            this.hideLoading();
        }
    }

    async loadUsers() {
        try {
            const users = await window.EducareTrack.getUsers(true);
            this.allUsers = users;
            this.filteredUsers = [...users];
            this.renderUsersTable();
            this.updateUserCount();
        } catch (error) {
            console.error('Error loading users:', error);
            this.showNotification('Error loading users', 'error');
        }
    }

    renderUsersTable() {
        const usersTableBody = document.getElementById('usersTableBody');
        
        if (this.filteredUsers.length === 0) {
            usersTableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="px-6 py-4 text-center text-gray-500">
                        No users found matching your criteria
                    </td>
                </tr>
            `;
            return;
        }

        usersTableBody.innerHTML = this.filteredUsers.map(user => `
            <tr class="hover:bg-gray-50 transition-colors">
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm font-mono text-gray-900">${user.id}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm font-medium text-gray-900">${user.name}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm text-gray-500">${user.email || 'N/A'}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                        ${this.getRoleBadgeClass(user.role)}">
                        ${user.role}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    ${user.phone || 'N/A'}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                        ${user.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
                        ${user.isActive ? 'Active' : 'Inactive'}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button onclick="userManagement.editUser('${user.id}')" 
                            class="text-blue-600 hover:text-blue-900 mr-3 transition-colors" 
                            title="Edit User">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="userManagement.toggleUserStatus('${user.id}', ${!user.isActive})" 
                            class="${user.isActive ? 'text-red-600 hover:text-red-900' : 'text-green-600 hover:text-green-900'} transition-colors"
                            title="${user.isActive ? 'Deactivate' : 'Activate'}">
                        <i class="fas ${user.isActive ? 'fa-ban' : 'fa-check'}"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    getRoleBadgeClass(role) {
        const classes = {
            'admin': 'bg-purple-100 text-purple-800',
            'teacher': 'bg-blue-100 text-blue-800',
            'parent': 'bg-green-100 text-green-800',
            'guard': 'bg-yellow-100 text-yellow-800',
            'clinic': 'bg-red-100 text-red-800'
        };
        return classes[role] || 'bg-gray-100 text-gray-800';
    }

    openAddUserModal(role) {
        this.currentRole = role;
        this.currentEditingUser = null;
        this.currentStep = 1;
        this.renderUserModal();
    }

    renderUserModal() {
        const modal = document.getElementById('addUserModal');
        const modalContent = modal.querySelector('.bg-white');
        
        if (this.currentRole === 'teacher') {
            modalContent.innerHTML = this.getTeacherModalContent();
        } else if (this.currentRole === 'parent') {
            modalContent.innerHTML = this.getParentModalContent();
        } else {
            modalContent.innerHTML = this.getBasicUserModalContent();
        }
        
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    getBasicUserModalContent() {
        const user = this.currentEditingUser;
        const isEditing = !!this.currentEditingUser;
        const roleName = this.currentRole.charAt(0).toUpperCase() + this.currentRole.slice(1);

        return `
            <div class="p-6">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-lg font-medium">${isEditing ? 'Edit' : 'Add'} ${roleName}</h3>
                    <button onclick="userManagement.closeModal()" class="text-gray-400 hover:text-gray-600">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <form id="userForm" class="space-y-4">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                            <input type="text" id="userName" value="${user?.name || ''}" 
                                   class="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" 
                                   required>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                            <input type="email" id="userEmail" value="${user?.email || ''}" 
                                   class="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                            <input type="tel" id="userPhone" value="${user?.phone || ''}" 
                                   class="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                        </div>
                        
                        ${this.currentRole === 'guard' || this.currentRole === 'clinic' ? `
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Employee ID</label>
                            <input type="text" id="userEmployeeId" value="${user?.employeeId || ''}" 
                                   class="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                        </div>
                        ` : ''}
                    </div>
                </form>
                
                <div class="flex justify-end space-x-3 mt-6 pt-4 border-t">
                    <button onclick="userManagement.closeModal()" 
                            class="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors">
                        Cancel
                    </button>
                    <button onclick="userManagement.saveUser()" 
                            class="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors">
                        ${isEditing ? 'Update' : 'Save'} ${roleName}
                    </button>
                </div>
            </div>
        `;
    }

    getTeacherModalContent() {
        const user = this.currentEditingUser;
        const isEditing = !!this.currentEditingUser;

        // Initialize selected subjects if editing
        if (isEditing && user.assignedSubjects) {
            this.selectedSubjects = user.assignedSubjects;
        } else {
            this.selectedSubjects = [];
        }

        return `
            <div class="p-6">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-lg font-medium">${isEditing ? 'Edit' : 'Add'} Teacher</h3>
                    <button onclick="userManagement.closeModal()" class="text-gray-400 hover:text-gray-600">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <!-- Progress Steps -->
                <div class="flex justify-between mb-6">
                    ${[1, 2, 3].map(step => `
                        <div class="flex flex-col items-center">
                            <div class="w-8 h-8 rounded-full flex items-center justify-center 
                                ${this.currentStep >= step ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500'}">
                                ${step}
                            </div>
                            <span class="text-xs mt-1 ${this.currentStep >= step ? 'text-blue-500' : 'text-gray-500'}">
                                ${step === 1 ? 'Basic Info' : step === 2 ? 'Subjects' : 'Preview'}
                            </span>
                        </div>
                    `).join('')}
                </div>
                
                <!-- Step 1: Basic Information -->
                <div id="step1" class="${this.currentStep === 1 ? 'block' : 'hidden'} space-y-4">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                            <input type="text" id="teacherName" value="${user?.name || ''}" 
                                   class="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" 
                                   required>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                            <input type="email" id="teacherEmail" value="${user?.email || ''}" 
                                   class="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                            <input type="tel" id="teacherPhone" value="${user?.phone || ''}" 
                                   class="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Class Assignment *</label>
                            <select id="teacherClass" onchange="userManagement.onClassChange()" 
                                   class="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                                <option value="">Select Class</option>
                                ${this.getClassOptions()}
                            </select>
                        </div>
                    </div>
                    
                    <div class="flex items-center">
                        <input type="checkbox" id="teacherHomeroom" ${user?.isHomeroom ? 'checked' : ''}
                               class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500">
                        <label for="teacherHomeroom" class="ml-2 text-sm text-gray-700">
                            Homeroom Teacher
                        </label>
                    </div>
                    
                    <div class="flex justify-end mt-6">
                        <button onclick="userManagement.nextTeacherStep(2)" 
                                class="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors">
                            Next <i class="fas fa-arrow-right ml-2"></i>
                        </button>
                    </div>
                </div>
                
                <!-- Step 2: Subject Assignment -->
                <div id="step2" class="${this.currentStep === 2 ? 'block' : 'hidden'} space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Select Subjects *</label>
                        <div id="subjectSelection" class="space-y-2 max-h-64 overflow-y-auto border border-gray-200 rounded-md p-4">
                            <p class="text-gray-500">Please select a class first to see available subjects</p>
                        </div>
                        <p class="text-xs text-gray-500 mt-1">Select the subjects this teacher will handle</p>
                    </div>
                    
                    <div class="flex justify-between mt-6">
                        <button onclick="userManagement.nextTeacherStep(1)" 
                                class="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors">
                            <i class="fas fa-arrow-left mr-2"></i>Back
                        </button>
                        <button onclick="userManagement.nextTeacherStep(3)" 
                                class="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors">
                            Next <i class="fas fa-arrow-right ml-2"></i>
                        </button>
                    </div>
                </div>
                
                <!-- Step 3: Preview -->
                <div id="step3" class="${this.currentStep === 3 ? 'block' : 'hidden'}">
                    <div class="bg-gray-50 p-4 rounded-md mb-4">
                        <h4 class="font-medium mb-3 text-gray-800">Teacher Preview</h4>
                        <div id="teacherPreview" class="space-y-2 text-sm">
                            <!-- Preview content will be populated here -->
                        </div>
                    </div>
                    
                    <div class="flex justify-between mt-6">
                        <button onclick="userManagement.nextTeacherStep(2)" 
                                class="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors">
                            <i class="fas fa-arrow-left mr-2"></i>Back
                        </button>
                        <button onclick="userManagement.saveTeacher()" 
                                class="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors">
                            ${isEditing ? 'Update' : 'Save'} Teacher
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    getParentModalContent() {
        const user = this.currentEditingUser;
        const isEditing = !!this.currentEditingUser;

        return `
            <div class="p-6">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-lg font-medium">${isEditing ? 'Edit' : 'Add'} Parent</h3>
                    <button onclick="userManagement.closeModal()" class="text-gray-400 hover:text-gray-600">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <form id="parentForm" class="space-y-4">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                            <input type="text" id="parentName" value="${user?.name || ''}" 
                                   class="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" 
                                   required>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                            <input type="email" id="parentEmail" value="${user?.email || ''}" 
                                   class="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                            <input type="tel" id="parentPhone" value="${user?.phone || ''}" 
                                   class="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Relationship</label>
                            <select id="parentRelationship" class="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="parent" ${user?.relationship === 'parent' ? 'selected' : ''}>Parent</option>
                                <option value="guardian" ${user?.relationship === 'guardian' ? 'selected' : ''}>Guardian</option>
                            </select>
                        </div>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Emergency Contact</label>
                        <input type="tel" id="emergencyContact" value="${user?.emergencyContact || ''}" 
                               class="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    </div>
                </form>
                
                <div class="flex justify-end space-x-3 mt-6 pt-4 border-t">
                    <button onclick="userManagement.closeModal()" 
                            class="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors">
                        Cancel
                    </button>
                    <button onclick="userManagement.saveParent()" 
                            class="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors">
                        ${isEditing ? 'Update' : 'Save'} Parent
                    </button>
                </div>
            </div>
        `;
    }

    // Generate class options based on your requirements
    getClassOptions() {
        const gradeOptions = [
            'Kinder',
            'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5',
            'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10',
            'Grade 11 - STEM', 'Grade 11 - HUMSS', 'Grade 11 - ABM', 'Grade 11 - ICT',
            'Grade 12 - STEM', 'Grade 12 - HUMSS', 'Grade 12 - ABM', 'Grade 12 - ICT'
        ];

        // If we have classes from Firestore, use them, otherwise use default options
        if (this.classes.length > 0) {
            return this.classes.map(cls => 
                `<option value="${cls.id}" ${this.currentEditingUser?.classId === cls.id ? 'selected' : ''}>
                    ${cls.name || cls.grade}${cls.strand ? ' - ' + cls.strand : ''}
                </option>`
            ).join('');
        } else {
            return gradeOptions.map(grade => 
                `<option value="${grade}" ${this.currentEditingUser?.assignedClass === grade ? 'selected' : ''}>
                    ${grade}
                </option>`
            ).join('');
        }
    }

    // Handle class change to update available subjects
    onClassChange() {
        const selectedClass = document.getElementById('teacherClass').value;
        this.updateSubjectSelection(selectedClass);
    }

    // Update subject selection based on class
    updateSubjectSelection(selectedClass) {
        const subjectSelection = document.getElementById('subjectSelection');
        
        if (!selectedClass) {
            subjectSelection.innerHTML = '<p class="text-gray-500">Please select a class first</p>';
            return;
        }

        // Get subjects based on class selection
        const subjects = this.getSubjectsForClass(selectedClass);
        
        if (subjects.length === 0) {
            subjectSelection.innerHTML = '<p class="text-gray-500">No subjects available for this class</p>';
            return;
        }

        let html = '';
        subjects.forEach(subject => {
            const isChecked = this.selectedSubjects.includes(subject) ? 'checked' : '';
            html += `
                <div class="flex items-center">
                    <input type="checkbox" id="subject-${subject.replace(/\s+/g, '-')}" value="${subject}" ${isChecked}
                           class="subject-checkbox w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                           onchange="userManagement.onSubjectChange(this)">
                    <label for="subject-${subject.replace(/\s+/g, '-')}" class="ml-2 text-sm text-gray-700">${subject}</label>
                </div>
            `;
        });

        subjectSelection.innerHTML = html;
    }

    // Get subjects based on class selection
    getSubjectsForClass(selectedClass) {
        // Map class names to curriculum levels and strands
        const classMapping = {
            'Kinder': { level: 'Kindergarten' },
            'Grade 1': { level: 'Elementary', grade: 'Grade 1' },
            'Grade 2': { level: 'Elementary', grade: 'Grade 2' },
            'Grade 3': { level: 'Elementary', grade: 'Grade 3' },
            'Grade 4': { level: 'Elementary', grade: 'Grade 4' },
            'Grade 5': { level: 'Elementary', grade: 'Grade 5' },
            'Grade 6': { level: 'Elementary', grade: 'Grade 6' },
            'Grade 7': { level: 'Highschool', grade: 'Grade 7' },
            'Grade 8': { level: 'Highschool', grade: 'Grade 8' },
            'Grade 9': { level: 'Highschool', grade: 'Grade 9' },
            'Grade 10': { level: 'Highschool', grade: 'Grade 10' },
            'Grade 11': { level: 'Senior High', strand: 'STEM' },
            'Grade 11 ': { level: 'Senior High', strand: 'HUMSS' },
            'Grade 11 ': { level: 'Senior High', strand: 'ABM' },
            'Grade 11 ': { level: 'Senior High', strand: 'TVL' },
            'Grade 12 ': { level: 'Senior High', strand: 'STEM' },
            'Grade 12 ': { level: 'Senior High', strand: 'HUMSS' },
            'Grade 12 ': { level: 'Senior High', strand: 'ABM' },
            'Grade 12 ': { level: 'Senior High', strand: 'TVL' }
        };

        const classInfo = classMapping[selectedClass];
        if (!classInfo) return [];

        let subjects = [];

        if (classInfo.level === 'Kindergarten') {
            subjects = [
                'Makabansa', 'Languages', 'Mathematics', 'GMRC', 
                'Values Education', 'Science', 'Mother Tongue'
            ];
        } else if (classInfo.level === 'Elementary' || classInfo.level === 'Highschool') {
            subjects = [
                'Math', 'English', 'Filipino', 'Araling Panlipunan', 
                'Science', 'TLE', 'MAPEH', 'GMRC'
            ];
        } else if (classInfo.level === 'Senior High') {
            // Core subjects for all Senior High
            const coreSubjects = [
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
                'Understanding Culture, Society, and Politics',
                'Disaster Readiness and Risk Reduction'
            ];

            // Applied subjects for all Senior High
            const appliedSubjects = [
                'English for Academic and Professional Purposes',
                'Practical Research 1 (Qualitative)',
                'Practical Research 2 (Quantitative)',
                'Filipino sa Piling Larang',
                'Empowerment Technologies',
                'Entrepreneurship'
            ];

            subjects = [...coreSubjects, ...appliedSubjects];

            // Add specialized subjects based on strand
            if (classInfo.strand === 'STEM') {
                subjects = subjects.concat([
                    'Pre-Calculus',
                    'Basic Calculus',
                    'General Biology 1',
                    'General Biology 2',
                    'General Chemistry 1',
                    'General Chemistry 2',
                    'General Physics 1',
                    'General Physics 2',
                    'Research',
                    'Capstone'
                ]);
            } else if (classInfo.strand === 'ABM') {
                subjects = subjects.concat([
                    'Applied Economics',
                    'Business Ethics and Social Responsibility',
                    'Fundamentals of Accounting and Business Management 1',
                    'Fundamentals of Accounting and Business Management 2',
                    'Business Mathematics',
                    'Business Finance',
                    'Organization and Business Management',
                    'Principles of Marketing',
                    'Work Immersion/Research/Career Advocacy/Culminating Activity'
                ]);
            } else if (classInfo.strand === 'HUMSS') {
                subjects = subjects.concat([
                    'Creative Writing (Fiction)',
                    'Creative Writing (Non-Fiction)',
                    'Introduction to World Religions and Belief Systems',
                    'Trends, Networks, and Critical Thinking in the 21st Century Culture',
                    'Philippine Politics and Governance',
                    'Community Engagement, Solidarity, and Citizenship',
                    'Discipline and Ideas in the Social Sciences',
                    'Discipline and Ideas in the Applied Social Sciences',
                    'Work Immersion/Research Project/Culminating Activity'
                ]);
            } else if (classInfo.strand === 'TVL') {
                subjects = subjects.concat([
                    'Programming 1',
                    'Programming 2',
                    'Animation',
                    'Computer Servicing',
                    'ICT Specialized Subjects'
                ]);
            }
        }

        return subjects;
    }

    // Handle subject checkbox changes
    onSubjectChange(checkbox) {
        const subject = checkbox.value;
        
        if (checkbox.checked) {
            if (!this.selectedSubjects.includes(subject)) {
                this.selectedSubjects.push(subject);
            }
        } else {
            this.selectedSubjects = this.selectedSubjects.filter(s => s !== subject);
        }
    }

    nextTeacherStep(step) {
        // Validate current step before proceeding
        if (step > this.currentStep && !this.validateCurrentStep()) {
            return;
        }

        this.currentStep = step;
        
        // Hide all steps
        document.getElementById('step1')?.classList.add('hidden');
        document.getElementById('step2')?.classList.add('hidden');
        document.getElementById('step3')?.classList.add('hidden');
        
        // Show current step
        document.getElementById(`step${step}`)?.classList.remove('hidden');
        
        // Initialize step 2 subjects if moving to step 2
        if (step === 2) {
            const selectedClass = document.getElementById('teacherClass').value;
            this.updateSubjectSelection(selectedClass);
        }
        
        // If step 3, generate preview
        if (step === 3) {
            this.generateTeacherPreview();
        }
    }

    validateCurrentStep() {
        if (this.currentStep === 1) {
            const name = document.getElementById('teacherName')?.value;
            const selectedClass = document.getElementById('teacherClass')?.value;
            
            if (!name) {
                this.showNotification('Please enter teacher name', 'error');
                return false;
            }
            if (!selectedClass) {
                this.showNotification('Please select a class', 'error');
                return false;
            }
        } else if (this.currentStep === 2) {
            if (this.selectedSubjects.length === 0) {
                this.showNotification('Please select at least one subject', 'error');
                return false;
            }
        }
        return true;
    }

    generateTeacherPreview() {
        const preview = document.getElementById('teacherPreview');
        const name = document.getElementById('teacherName').value;
        const email = document.getElementById('teacherEmail').value;
        const phone = document.getElementById('teacherPhone').value;
        const selectedClass = document.getElementById('teacherClass').value;
        const isHomeroom = document.getElementById('teacherHomeroom').checked;
        
        preview.innerHTML = `
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email || 'N/A'}</p>
            <p><strong>Phone:</strong> ${phone || 'N/A'}</p>
            <p><strong>Class:</strong> ${selectedClass}</p>
            <p><strong>Homeroom Teacher:</strong> ${isHomeroom ? 'Yes' : 'No'}</p>
            <p><strong>Subjects (${this.selectedSubjects.length}):</strong></p>
            <ul class="list-disc list-inside ml-2">
                ${this.selectedSubjects.map(subject => `<li>${subject}</li>`).join('')}
            </ul>
            <p><strong>Role:</strong> Teacher</p>
        `;
    }

    async saveTeacher() {
        try {
            this.showLoading();

            const selectedClass = document.getElementById('teacherClass').value;
            
            // Find or create class in Firestore
            let classId = selectedClass;
            if (this.classes.length > 0) {
                const existingClass = this.classes.find(cls => 
                    cls.id === selectedClass || cls.name === selectedClass
                );
                if (!existingClass) {
                    // Create new class in Firestore
                    classId = await this.createClassInFirestore(selectedClass);
                } else {
                    classId = existingClass.id;
                }
            }

            const userData = {
                name: document.getElementById('teacherName').value,
                email: document.getElementById('teacherEmail').value || '',
                phone: document.getElementById('teacherPhone').value || '',
                classId: classId,
                assignedClass: selectedClass,
                assignedSubjects: this.selectedSubjects,
                isHomeroom: document.getElementById('teacherHomeroom').checked,
                role: 'teacher',
                isActive: true,
                createdBy: window.EducareTrack.currentUser.id
            };

            if (this.currentEditingUser) {
                await window.EducareTrack.db.collection('users').doc(this.currentEditingUser.id).update({
                    ...userData,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedBy: window.EducareTrack.currentUser.id
                });
                this.showNotification('Teacher updated successfully', 'success');
            } else {
                const teacherId = window.EducareTrack.generateUserId('teacher');
                const teacherData = {
                    ...userData,
                    id: teacherId,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                };

                await window.EducareTrack.db.collection('users').doc(teacherId).set(teacherData);
                this.showNotification('Teacher created successfully', 'success');
            }

            this.closeModal();
            await this.loadUsers();
            this.hideLoading();
        } catch (error) {
            console.error('Error saving teacher:', error);
            this.showNotification('Error saving teacher: ' + error.message, 'error');
            this.hideLoading();
        }
    }

    async createClassInFirestore(className) {
        try {
            // Parse class name to determine level and strand
            let level = 'Elementary';
            let grade = className;
            let strand = null;

            if (className === 'Kinder') {
                level = 'Kindergarten';
            } else if (className.includes('Grade 11') || className.includes('Grade 12')) {
                level = 'Senior High';
                if (className.includes('STEM')) {
                    strand = 'STEM';
                } else if (className.includes('HUMSS')) {
                    strand = 'HUMSS';
                } else if (className.includes('ABM')) {
                    strand = 'ABM';
                } else if (className.includes('ICT')) {
                    strand = 'TVL';
                }
            } else if (className.includes('Grade 7') || className.includes('Grade 8') || 
                       className.includes('Grade 9') || className.includes('Grade 10')) {
                level = 'Highschool';
            }

            const classData = {
                name: className,
                grade: grade,
                level: level,
                strand: strand,
                subjects: this.getSubjectsForClass(className),
                isActive: true,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: window.EducareTrack.currentUser.id
            };

            const classRef = await window.EducareTrack.db.collection('classes').add(classData);
            
            // Add to local classes array
            this.classes.push({ id: classRef.id, ...classData });
            
            return classRef.id;
        } catch (error) {
            console.error('Error creating class:', error);
            return className; // Fallback to class name as ID
        }
    }

    async saveUser() {
        try {
            this.showLoading();

            const userData = {
                name: document.getElementById('userName').value,
                email: document.getElementById('userEmail').value || '',
                phone: document.getElementById('userPhone').value || '',
                role: this.currentRole,
                isActive: true
            };

            // Add employee ID for guard and clinic staff
            if (this.currentRole === 'guard' || this.currentRole === 'clinic') {
                userData.employeeId = document.getElementById('userEmployeeId').value || '';
            }

            if (this.currentEditingUser) {
                // Update existing user
                await window.EducareTrack.db.collection('users').doc(this.currentEditingUser.id).update({
                    ...userData,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedBy: window.EducareTrack.currentUser.id
                });
                this.showNotification('User updated successfully', 'success');
            } else {
                // Create new user - generate ID using EducareTrack method
                const userId = window.EducareTrack.generateUserId(this.currentRole);
                const newUserData = {
                    ...userData,
                    id: userId,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                };

                await window.EducareTrack.db.collection('users').doc(userId).set(newUserData);
                this.showNotification('User created successfully', 'success');
            }

            this.closeModal();
            await this.loadUsers();
            this.hideLoading();
        } catch (error) {
            console.error('Error saving user:', error);
            this.showNotification('Error saving user: ' + error.message, 'error');
            this.hideLoading();
        }
    }

    async saveParent() {
        try {
            this.showLoading();

            const userData = {
                name: document.getElementById('parentName').value,
                email: document.getElementById('parentEmail').value || '',
                phone: document.getElementById('parentPhone').value,
                relationship: document.getElementById('parentRelationship').value,
                emergencyContact: document.getElementById('emergencyContact').value || '',
                children: this.currentEditingUser?.children || [],
                role: 'parent',
                isActive: true
            };

            if (this.currentEditingUser) {
                // Update existing parent
                await window.EducareTrack.db.collection('users').doc(this.currentEditingUser.id).update({
                    ...userData,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedBy: window.EducareTrack.currentUser.id
                });
                this.showNotification('Parent updated successfully', 'success');
            } else {
                // Create new parent - generate ID using EducareTrack method
                const parentId = window.EducareTrack.generateUserId('parent');
                const parentData = {
                    ...userData,
                    id: parentId,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                };

                await window.EducareTrack.db.collection('users').doc(parentId).set(parentData);
                this.showNotification('Parent created successfully', 'success');
            }

            this.closeModal();
            await this.loadUsers();
            this.hideLoading();
        } catch (error) {
            console.error('Error saving parent:', error);
            this.showNotification('Error saving parent: ' + error.message, 'error');
            this.hideLoading();
        }
    }

    async editUser(userId) {
        try {
            this.showLoading();
            const user = await window.EducareTrack.getUserById(userId);
            if (user) {
                this.currentEditingUser = user;
                this.currentRole = user.role;
                this.currentStep = 1;
                this.renderUserModal();
                
                // If editing a teacher, set the selected subjects
                if (user.role === 'teacher' && user.assignedSubjects) {
                    this.selectedSubjects = user.assignedSubjects;
                }
            }
            this.hideLoading();
        } catch (error) {
            console.error('Error loading user:', error);
            this.showNotification('Error loading user', 'error');
            this.hideLoading();
        }
    }

    async toggleUserStatus(userId, newStatus) {
        try {
            this.showLoading();
            await window.EducareTrack.db.collection('users').doc(userId).update({
                isActive: newStatus
            });
            this.showNotification(`User ${newStatus ? 'activated' : 'deactivated'} successfully`, 'success');
            await this.loadUsers();
            this.hideLoading();
        } catch (error) {
            console.error('Error updating user status:', error);
            this.showNotification('Error updating user status', 'error');
            this.hideLoading();
        }
    }

    searchUsers() {
        const searchTerm = document.getElementById('searchUsers').value.toLowerCase();
        this.filterUsers(searchTerm);
    }

    filterUsers(searchTerm = '') {
        const roleFilter = document.getElementById('roleFilter').value;
        const statusFilter = document.getElementById('statusFilter').value;

        this.filteredUsers = this.allUsers.filter(user => {
            const matchesSearch = user.name.toLowerCase().includes(searchTerm) || 
                                user.email?.toLowerCase().includes(searchTerm) ||
                                user.id.toLowerCase().includes(searchTerm);
            const matchesRole = !roleFilter || user.role === roleFilter;
            const matchesStatus = !statusFilter || 
                                (statusFilter === 'active' && user.isActive) ||
                                (statusFilter === 'inactive' && !user.isActive);

            return matchesSearch && matchesRole && matchesStatus;
        });

        this.renderUsersTable();
        this.updateUserCount();
    }

    updateUserCount() {
        document.getElementById('userCount').textContent = this.filteredUsers.length;
    }

    closeModal() {
        const modal = document.getElementById('addUserModal');
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        this.currentEditingUser = null;
        this.currentRole = null;
        this.currentStep = 1;
        this.selectedSubjects = [];
    }

    async loadClasses() {
        try {
            this.classes = await window.EducareTrack.getClasses();
        } catch (error) {
            console.error('Error loading classes:', error);
        }
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
        document.getElementById('addUserModal').addEventListener('click', (e) => {
            if (e.target.id === 'addUserModal') {
                this.closeModal();
            }
        });

        // Escape key to close modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
            }
        });
    }
}

// Initialize user management when the page loads
document.addEventListener('DOMContentLoaded', function() {
    window.userManagement = new UserManagement();
});
