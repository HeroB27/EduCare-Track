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
                        ${user.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
                        ${user.is_active ? 'Active' : 'Inactive'}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button onclick="userManagement.editUser('${user.id}')" 
                            class="text-blue-600 hover:text-blue-900 mr-3 transition-colors" 
                            title="Edit User">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="userManagement.toggleUserStatus('${user.id}', ${!user.is_active})" 
                            class="${user.is_active ? 'text-red-600 hover:text-red-900' : 'text-green-600 hover:text-green-900'} transition-colors"
                            title="${user.is_active ? 'Deactivate' : 'Activate'}">
                        <i class="fas ${user.is_active ? 'fa-ban' : 'fa-check'}"></i>
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
        this.currentRole = role || null;
        this.currentEditingUser = null;
        this.currentStep = 1;
        this.tempChildren = [];
        this.renderUserModal();
    }

    renderUserModal() {
        const modal = document.getElementById('addUserModal');
        const modalContent = modal.querySelector('.bg-white');
        
        if (!this.currentRole) {
            modalContent.innerHTML = this.getRoleSelectionModalContent();
        } else if (this.currentRole === 'teacher') {
            modalContent.innerHTML = this.getTeacherModalContent();
        } else if (this.currentRole === 'parent') {
            modalContent.innerHTML = this.getParentModalContent();
        } else {
            modalContent.innerHTML = this.getStaffModalContent();
        }
        
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    getRoleSelectionModalContent() {
        return `
            <div class="p-6">
                <div class="flex justify-between items-center mb-6">
                    <h3 class="text-xl font-semibold text-gray-800">Select User Role</h3>
                    <button onclick="userManagement.closeModal()" class="text-gray-400 hover:text-gray-600 transition-colors">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <!-- Teacher -->
                    <button onclick="userManagement.selectRole('teacher')" 
                            class="flex flex-col items-center justify-center p-6 border-2 border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all group">
                        <div class="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4 group-hover:bg-blue-200 transition-colors">
                            <i class="fas fa-chalkboard-teacher text-2xl text-blue-600"></i>
                        </div>
                        <h4 class="text-lg font-medium text-gray-800 mb-2">Teacher</h4>
                        <p class="text-sm text-gray-500 text-center">Add academic staff with class and subject assignments</p>
                    </button>

                    <!-- Clinic -->
                    <button onclick="userManagement.selectRole('clinic')" 
                            class="flex flex-col items-center justify-center p-6 border-2 border-gray-200 rounded-xl hover:border-green-500 hover:bg-green-50 transition-all group">
                        <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4 group-hover:bg-green-200 transition-colors">
                            <i class="fas fa-user-nurse text-2xl text-green-600"></i>
                        </div>
                        <h4 class="text-lg font-medium text-gray-800 mb-2">Clinic Staff</h4>
                        <p class="text-sm text-gray-500 text-center">Add medical personnel for health monitoring</p>
                    </button>

                    <!-- Guard -->
                    <button onclick="userManagement.selectRole('guard')" 
                            class="flex flex-col items-center justify-center p-6 border-2 border-gray-200 rounded-xl hover:border-yellow-500 hover:bg-yellow-50 transition-all group">
                        <div class="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mb-4 group-hover:bg-yellow-200 transition-colors">
                            <i class="fas fa-user-shield text-2xl text-yellow-600"></i>
                        </div>
                        <h4 class="text-lg font-medium text-gray-800 mb-2">Guard</h4>
                        <p class="text-sm text-gray-500 text-center">Add security personnel for gate access control</p>
                    </button>
                </div>

                <div class="mt-8 border-t pt-6">
                    <h4 class="text-sm font-medium text-gray-700 mb-4">Other Options</h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <button onclick="window.location.href='add-parent-student.html'" 
                                class="flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                            <div class="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center mr-4">
                                <i class="fas fa-user-graduate text-purple-600"></i>
                            </div>
                            <div class="text-left">
                                <h5 class="font-medium text-gray-800">Enroll Student & Parent</h5>
                                <p class="text-xs text-gray-500">Go to enrollment page</p>
                            </div>
                            <i class="fas fa-arrow-right ml-auto text-gray-400"></i>
                        </button>

                        <button onclick="userManagement.selectRole('parent')" 
                                class="flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                            <div class="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center mr-4">
                                <i class="fas fa-user text-orange-600"></i>
                            </div>
                            <div class="text-left">
                                <h5 class="font-medium text-gray-800">Add Parent Only</h5>
                                <p class="text-xs text-gray-500">Create parent account manually</p>
                            </div>
                            <i class="fas fa-chevron-right ml-auto text-gray-400"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    selectRole(role) {
        this.currentRole = role;
        this.renderUserModal();
    }


    getStaffModalContent() {
        const user = this.currentEditingUser;
        const isEditing = !!this.currentEditingUser;
        const roleName = this.currentRole.charAt(0).toUpperCase() + this.currentRole.slice(1);

        let roleSpecificFields = '';
        if (this.currentRole === 'guard') {
            roleSpecificFields = '';
        } else if (this.currentRole === 'clinic') {
             roleSpecificFields = `
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                         <label class="block text-sm font-medium text-gray-700 mb-1">License No.</label>
                         <input type="text" id="clinicLicense" value="${user?.licenseNo || user?.license_no || ''}" 
                                class="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    </div>
                    <div>
                         <label class="block text-sm font-medium text-gray-700 mb-1">Position</label>
                         <input type="text" id="clinicPosition" value="${user?.position || ''}" 
                                class="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    </div>
                </div>
            `;
        } else if (this.currentRole === 'admin') {
             const availablePermissions = ['manage_users', 'manage_classes', 'manage_content', 'view_reports', 'system_settings'];
             const rawPermissions = user?.permissions;
             let permissions = [];
             if (Array.isArray(rawPermissions)) {
                permissions = rawPermissions;
             } else if (rawPermissions && typeof rawPermissions === 'object') {
                if (rawPermissions.all) {
                    permissions = [...availablePermissions];
                } else {
                    permissions = availablePermissions.filter(p => rawPermissions[p]);
                }
             }
             
             const permissionCheckboxes = availablePermissions.map(p => `
                <label class="flex items-center space-x-2">
                    <input type="checkbox" class="admin-permission-checkbox rounded text-blue-600 focus:ring-blue-500" value="${p}" ${permissions.includes(p) ? 'checked' : ''}>
                    <span class="text-sm text-gray-700">${p.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
                </label>
             `).join('');

             roleSpecificFields = `
                <div class="grid grid-cols-1 gap-4">
                    <div>
                         <label class="block text-sm font-medium text-gray-700 mb-1">Position</label>
                         <input type="text" id="adminPosition" value="${user?.position || ''}" 
                                class="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Permissions</label>
                        <div class="grid grid-cols-2 gap-2 p-3 bg-gray-50 rounded border border-gray-200">
                            ${permissionCheckboxes}
                        </div>
                    </div>
                </div>
            `;
        }

        return `
            <div class="p-6">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-lg font-medium">${isEditing ? 'Edit' : 'Add'} ${roleName}</h3>
                    <button onclick="userManagement.closeModal()" class="text-gray-400 hover:text-gray-600">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <!-- Progress Steps -->
                <div class="flex justify-between mb-6 max-w-xs mx-auto">
                    ${(isEditing ? [1, 2] : [1, 2, 3]).map(step => `
                        <div class="flex flex-col items-center">
                            <div class="w-8 h-8 rounded-full flex items-center justify-center 
                                ${this.currentStep >= step ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500'}">
                                ${step}
                            </div>
                            <span class="text-xs mt-1 ${this.currentStep >= step ? 'text-blue-500' : 'text-gray-500'}">
                                ${step === 1 ? (isEditing ? 'Details' : 'Info') : (isEditing && step === 2 ? 'Confirm' : (step === 2 ? 'Account' : 'Confirm'))}
                            </span>
                        </div>
                    `).join('')}
                </div>
                
                <form id="userForm" class="space-y-4">
                    <!-- Step 1: Information -->
                    <div id="staffStep1" class="${this.currentStep === 1 ? 'block' : 'hidden'} space-y-4">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                                <input type="text" id="userName" value="${user?.name || ''}" 
                                       class="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" 
                                       required>
                            </div>
                            
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Email${this.currentRole === 'guard' ? '' : ' *'}</label>
                                <input type="email" id="userEmail" value="${user?.email || ''}" 
                                       class="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                       ${this.currentRole === 'guard' ? '' : 'required'}>
                            </div>
                        </div>
                        
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                                <input type="tel" id="userPhone" value="${user?.phone || ''}" 
                                       class="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                       required>
                            </div>
                        </div>
                        
                        ${roleSpecificFields}

                        ${isEditing ? `
                        <div class="border-t pt-4 mt-4">
                            <h4 class="font-medium mb-3 text-gray-800">Account Details</h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">Username *</label>
                                    <input type="text" id="staffUsername" value="${user?.username || ''}" 
                                           class="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" 
                                           required>
                                </div>
                                
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
                                    <input type="password" id="staffPassword" 
                                           class="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                                    <p class="text-xs text-gray-500 mt-1">Leave blank to keep current password</p>
                                </div>
                            </div>
                        </div>
                        ` : ''}
                        
                        <div class="flex justify-end mt-6">
                            <button type="button" onclick="userManagement.nextStaffStep(2)" 
                                    class="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors">
                                Next <i class="fas fa-arrow-right ml-2"></i>
                            </button>
                        </div>
                    </div>

                    <!-- Step 2: Account Creation (Add Mode Only) -->
                    ${!isEditing ? `
                    <div id="staffStep2" class="${this.currentStep === 2 ? 'block' : 'hidden'} space-y-4">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Username *</label>
                                <input type="text" id="staffUsername" value="${user?.username || ''}" 
                                       class="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" 
                                       required>
                            </div>
                            
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                                <input type="password" id="staffPassword" 
                                       class="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" 
                                       required>
                            </div>
                        </div>
                        
                        <div class="flex justify-between mt-6">
                            <button type="button" onclick="userManagement.nextStaffStep(1)" 
                                    class="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors">
                                <i class="fas fa-arrow-left mr-2"></i>Back
                            </button>
                            <button type="button" onclick="userManagement.nextStaffStep(3)" 
                                    class="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors">
                                Next <i class="fas fa-arrow-right ml-2"></i>
                            </button>
                        </div>
                    </div>
                    ` : ''}

                    <!-- Step 3 (or 2 in Edit): Confirmation -->
                    <div id="staffStep3" class="${(isEditing && this.currentStep === 2) || (!isEditing && this.currentStep === 3) ? 'block' : 'hidden'} space-y-4">
                        <div class="bg-gray-50 p-4 rounded-md mb-4">
                            <h4 class="font-medium mb-3 text-gray-800">Review Information</h4>
                            <div id="staffPreview" class="space-y-2 text-sm">
                                <!-- Preview content will be populated here -->
                            </div>
                        </div>
                        
                        <div class="flex justify-between mt-6">
                            <button type="button" onclick="userManagement.nextStaffStep(${isEditing ? 1 : (this.currentStep === 3 ? 2 : 1)})" 
                                    class="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors">
                                <i class="fas fa-arrow-left mr-2"></i>Back
                            </button>
                            <button type="button" onclick="userManagement.saveUser()" 
                                    class="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors">
                                ${isEditing ? 'Update' : 'Save'} ${roleName}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        `;
    }

    nextStaffStep(step) {
        if (step > this.currentStep && !this.validateCurrentStaffStep()) {
            return;
        }

        this.currentStep = step;
        const isEditing = !!this.currentEditingUser;
        
        // Hide all steps
        document.getElementById('staffStep1')?.classList.add('hidden');
        document.getElementById('staffStep2')?.classList.add('hidden');
        document.getElementById('staffStep3')?.classList.add('hidden');
        
        // Show current step
        // In edit mode: Step 1 -> staffStep1, Step 2 -> staffStep3
        if (isEditing && step === 2) {
             document.getElementById('staffStep3')?.classList.remove('hidden');
        } else {
             document.getElementById(`staffStep${step}`)?.classList.remove('hidden');
        }
        
        // Update progress indicators
        // this.renderUserModal(); // Removed to prevent form data loss
        
        // Update progress bar
        const steps = document.querySelectorAll('.flex.flex-col.items-center');
        steps.forEach((el, index) => {
            const circle = el.querySelector('div');
            const label = el.querySelector('span');
            const stepNum = index + 1;
            
            if (this.currentStep >= stepNum) {
                circle.classList.remove('bg-gray-200', 'text-gray-500');
                circle.classList.add('bg-blue-500', 'text-white');
                label.classList.remove('text-gray-500');
                label.classList.add('text-blue-500');
            } else {
                circle.classList.remove('bg-blue-500', 'text-white');
                circle.classList.add('bg-gray-200', 'text-gray-500');
                label.classList.remove('text-blue-500');
                label.classList.add('text-gray-500');
            }
        });

        // Generate preview if last step
        // Edit mode: Step 2 is last. Add mode: Step 3 is last.
        if ((isEditing && step === 2) || (!isEditing && step === 3)) {
            this.generateStaffPreview();
        }
    }

    validateCurrentStaffStep() {
        if (this.currentStep === 1) {
            const name = document.getElementById('userName')?.value;
            const email = document.getElementById('userEmail')?.value;
            const phone = document.getElementById('userPhone')?.value;
            
            if (!name) {
                this.showNotification('Please enter name', 'error');
                return false;
            }
            
            if (this.currentRole !== 'guard' && !email) {
                this.showNotification('Please enter email', 'error');
                return false;
            }

            if (!phone) {
                this.showNotification('Please enter phone number', 'error');
                return false;
            }

            // If editing, validate username too
            if (this.currentEditingUser) {
                const username = document.getElementById('staffUsername')?.value;
                if (!username) {
                    this.showNotification('Please enter username', 'error');
                    return false;
                }
            }
        } else if (this.currentStep === 2) {
            // Only validate username/password here if NOT editing (Add Mode)
            if (!this.currentEditingUser) {
                const username = document.getElementById('staffUsername')?.value;
                const password = document.getElementById('staffPassword')?.value;
                
                if (!username) {
                    this.showNotification('Please enter username', 'error');
                    return false;
                }
                if (!password) {
                    this.showNotification('Please enter password', 'error');
                    return false;
                }
            }
        }
        return true;
    }

    generateStaffPreview() {
        const preview = document.getElementById('staffPreview');
        const name = document.getElementById('userName').value;
        const email = document.getElementById('userEmail').value;
        const phone = document.getElementById('userPhone').value;
        const username = document.getElementById('staffUsername').value;
        const role = this.currentRole;
        const roleName = role.charAt(0).toUpperCase() + role.slice(1);

        let roleSpecificDetails = '';
        if (role === 'guard') {
            roleSpecificDetails = `
                <p><strong>Shift:</strong> Whole Day</p>
                <p><strong>Assigned Gate:</strong> Main Gate</p>
            `;
        } else if (role === 'clinic') {
            const license = document.getElementById('clinicLicense').value;
            const position = document.getElementById('clinicPosition').value;
            roleSpecificDetails = `
                <p><strong>License No.:</strong> ${license || 'N/A'}</p>
                <p><strong>Position:</strong> ${position || 'N/A'}</p>
            `;
        } else if (role === 'admin') {
            const position = document.getElementById('adminPosition').value;
            roleSpecificDetails = `
                <p><strong>Position:</strong> ${position || 'N/A'}</p>
            `;
        }
        
        preview.innerHTML = `
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email || 'N/A'}</p>
            <p><strong>Phone:</strong> ${phone || 'N/A'}</p>
            <p><strong>Username:</strong> ${username}</p>
            <p><strong>Role:</strong> ${roleName}</p>
            ${roleSpecificDetails}
        `;
    }

    getTeacherModalContent() {
        const user = this.currentEditingUser;
        const isEditing = !!this.currentEditingUser;

        // Initialize capabilities if editing
        if (isEditing && user.capabilities) {
            this.teacherCapabilities = user.capabilities;
        } else if (!isEditing && this.currentStep === 1) {
            this.teacherCapabilities = [];
        }

        return `
            <div class="p-6 h-full flex flex-col">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-lg font-medium">${isEditing ? 'Edit' : 'Add'} Teacher</h3>
                    <button onclick="userManagement.closeModal()" class="text-gray-400 hover:text-gray-600">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <!-- Progress Steps -->
                <div class="flex justify-between mb-6 px-4">
                    ${[1, 2, 3, 4, 5].map(step => `
                        <div class="flex flex-col items-center cursor-pointer" onclick="userManagement.nextTeacherStep(${step})">
                            <div class="w-8 h-8 rounded-full flex items-center justify-center transition-colors duration-200
                                ${this.currentStep >= step ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500'}">
                                ${step}
                            </div>
                            <span class="text-xs mt-1 font-medium ${this.currentStep >= step ? 'text-blue-600' : 'text-gray-500'}">
                                ${step === 1 ? 'Info' : step === 2 ? 'Advisory' : step === 3 ? 'Subjects' : step === 4 ? 'Account' : 'Confirm'}
                            </span>
                        </div>
                    `).join('')}
                </div>
                
                <div class="flex-1 overflow-y-auto px-1">
                    <form id="teacherForm" onsubmit="event.preventDefault();">
                        <!-- Step 1: Basic Information -->
                        <div id="step1" class="${this.currentStep === 1 ? 'block' : 'hidden'} space-y-4">
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                                    <input type="text" id="teacherName" value="${user?.name || ''}" 
                                           class="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" 
                                           required>
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">Email Address *</label>
                                    <input type="email" id="teacherEmail" value="${user?.email || ''}" 
                                           class="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                                </div>
                            </div>
                            
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Contact Number *</label>
                                <input type="tel" id="teacherPhone" value="${user?.phone || ''}" 
                                       class="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                            </div>

                            <div class="flex justify-end mt-6">
                                <button type="button" onclick="userManagement.nextTeacherStep(2)" 
                                        class="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors">
                                    Next <i class="fas fa-arrow-right ml-2"></i>
                                </button>
                            </div>
                        </div>

                        <!-- Step 2: Advisory (Homeroom) -->
                        <div id="step2" class="${this.currentStep === 2 ? 'block' : 'hidden'} space-y-4">
                            <div class="bg-blue-50 border-l-4 border-blue-500 p-4 mb-4">
                                <div class="flex">
                                    <div class="flex-shrink-0">
                                        <i class="fas fa-info-circle text-blue-500"></i>
                                    </div>
                                    <div class="ml-3">
                                        <p class="text-sm text-blue-700">
                                            Assigning an advisory class is <strong>optional</strong>. 
                                            If assigned, this teacher will handle attendance and reports for the selected class.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div class="flex items-center mb-4">
                                <input type="checkbox" id="hasAdvisory" onchange="userManagement.toggleAdvisorySelection()"
                                       ${(user?.class_id || user?.classId) ? 'checked' : ''}
                                       class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500">
                                <label for="hasAdvisory" class="ml-2 text-sm font-medium text-gray-700">
                                    Assign as Homeroom/Advisory Teacher
                                </label>
                            </div>

                            <div class="flex items-center mb-4">
                                <input type="checkbox" id="isGatekeeper" 
                                       ${user?.is_gatekeeper ? 'checked' : ''}
                                       class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500">
                                <label for="isGatekeeper" class="ml-2 text-sm font-medium text-gray-700">
                                    Assign as Gatekeeper
                                </label>
                            </div>

                            <div id="advisorySelection" class="${(user?.class_id || user?.classId) ? 'block' : 'hidden'} pl-6 border-l-2 border-gray-200 ml-2">
                                <label class="block text-sm font-medium text-gray-700 mb-1">Select Advisory Class</label>
                                <select id="teacherClass" class="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                                    <option value="">Select Class</option>
                                    ${this.getClassOptions()}
                                </select>
                            </div>
                            
                            <div class="flex justify-between mt-6">
                                <button type="button" onclick="userManagement.nextTeacherStep(1)" 
                                        class="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors">
                                    <i class="fas fa-arrow-left mr-2"></i>Back
                                </button>
                                <button type="button" onclick="userManagement.nextTeacherStep(3)" 
                                        class="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors">
                                    Next <i class="fas fa-arrow-right ml-2"></i>
                                </button>
                            </div>
                        </div>
                        
                        <!-- Step 3: Subject Qualification -->
                        <div id="step3" class="${this.currentStep === 3 ? 'block' : 'hidden'} space-y-4">
                            <div class="bg-yellow-50 border-l-4 border-yellow-500 p-4 mb-4">
                                <p class="text-sm text-yellow-700">
                                    <strong>Important:</strong> Define what this teacher is <em>qualified</em> to teach. 
                                    This does not assign them to a schedule yet.
                                </p>
                            </div>

                            <div id="subjectQualificationsUI" class="space-y-4">
                                <!-- Dynamic Content from renderSubjectQualificationUI -->
                            </div>
                            
                            <div class="flex justify-between mt-6">
                                <button type="button" onclick="userManagement.nextTeacherStep(2)" 
                                        class="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors">
                                    <i class="fas fa-arrow-left mr-2"></i>Back
                                </button>
                                <button type="button" onclick="userManagement.nextTeacherStep(4)" 
                                        class="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors">
                                    Next <i class="fas fa-arrow-right ml-2"></i>
                                </button>
                            </div>
                        </div>

                        <!-- Step 4: Account Creation -->
                        <div id="step4" class="${this.currentStep === 4 ? 'block' : 'hidden'} space-y-4">
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">Username *</label>
                                    <input type="text" id="teacherUsername" value="${user?.username || ''}" 
                                           class="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" 
                                           required>
                                </div>
                                
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                                    <input type="password" id="teacherPassword" 
                                           class="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" 
                                           ${isEditing ? '' : 'required'}>
                                    ${isEditing ? '<p class="text-xs text-gray-500 mt-1">Leave blank to keep current password</p>' : ''}
                                </div>
                            </div>
                            
                            <div class="flex justify-between mt-6">
                                <button type="button" onclick="userManagement.nextTeacherStep(3)" 
                                        class="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors">
                                    <i class="fas fa-arrow-left mr-2"></i>Back
                                </button>
                                <button type="button" onclick="userManagement.nextTeacherStep(5)" 
                                        class="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors">
                                    Next <i class="fas fa-arrow-right ml-2"></i>
                                </button>
                            </div>
                        </div>
                        
                        <!-- Step 5: Confirmation -->
                        <div id="step5" class="${this.currentStep === 5 ? 'block' : 'hidden'}">
                            <div class="bg-gray-50 p-6 rounded-lg border border-gray-200">
                                <h4 class="text-lg font-medium text-gray-800 mb-4 border-b pb-2">Review Information</h4>
                                <div id="teacherPreview" class="space-y-3 text-sm">
                                    <!-- Preview content will be populated here -->
                                </div>
                            </div>
                            
                            <div class="flex justify-between mt-6">
                                <button type="button" onclick="userManagement.nextTeacherStep(4)" 
                                        class="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors">
                                    <i class="fas fa-arrow-left mr-2"></i>Back
                                </button>
                                <button type="button" onclick="userManagement.saveTeacher()" 
                                        class="px-6 py-2 bg-green-600 text-white font-medium rounded-md hover:bg-green-700 transition-colors shadow-sm">
                                    ${isEditing ? 'Update' : 'Confirm & Save'} Teacher
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        `;
    }

    toggleAdvisorySelection() {
        const checkbox = document.getElementById('hasAdvisory');
        const selection = document.getElementById('advisorySelection');
        if (checkbox.checked) {
            selection.classList.remove('hidden');
        } else {
            selection.classList.add('hidden');
            document.getElementById('teacherClass').value = '';
        }
    }

    renderSubjectQualificationUI() {
        const container = document.getElementById('subjectQualificationsUI');
        if (!container) return;

        // Ensure teacherCapabilities is initialized
        if (!this.teacherCapabilities) this.teacherCapabilities = [];

        const categories = {
            'Kinder': ['All Subjects'],
            'Grades 1-3': ['Math', 'English', 'Science', 'Filipino', 'Araling Panlipunan', 'MAPEH', 'ESP'],
            'Grades 4-6': ['Math', 'English', 'Science', 'Filipino', 'Araling Panlipunan', 'MAPEH', 'ESP', 'TLE'],
            'Junior High': ['Math', 'English', 'Science', 'Filipino', 'Araling Panlipunan', 'MAPEH', 'ESP', 'TLE'],
            'Senior High': {
                'Core': ['Oral Communication', 'Reading and Writing', 'General Math', 'Statistics', 'Earth Science', 'Physical Science', 'PE', 'Philosophy'],
                'Applied': ['EAPP', 'Research 1', 'Research 2', 'Filipino sa Piling Larang', 'Empowerment Tech', 'Entrepreneurship'],
                'STEM': ['Pre-Calculus', 'Basic Calculus', 'Gen Bio', 'Gen Chem', 'Gen Physics'],
                'ABM': ['Applied Economics', 'Business Ethics', 'Accounting', 'Business Math'],
                'HUMSS': ['Creative Writing', 'World Religions', 'Politics', 'Social Sciences'],
                'TVL': ['Programming', 'Animation', 'Computer Servicing', 'ICT']
            }
        };

        let html = '';

        for (const [level, content] of Object.entries(categories)) {
            const isSHS = level === 'Senior High';
            
            html += `
                <div class="border border-gray-200 rounded-lg overflow-hidden">
                    <div class="bg-gray-50 px-4 py-2 font-medium text-gray-700 flex justify-between items-center cursor-pointer" 
                         onclick="this.nextElementSibling.classList.toggle('hidden')">
                        <span>${level}</span>
                        <i class="fas fa-chevron-down text-xs"></i>
                    </div>
                    <div class="p-4 bg-white hidden">
            `;

            if (isSHS) {
                // SHS Strands
                for (const [strand, subjects] of Object.entries(content)) {
                    html += `
                        <div class="mb-4 last:mb-0">
                            <h5 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">${strand}</h5>
                            <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
                                ${subjects.map(subj => {
                                    const capId = `${level}:${strand}:${subj}`;
                                    const isChecked = this.teacherCapabilities.some(c => c.id === capId || (c.level === level && c.strand === strand && c.subject === subj));
                                    return `
                                        <label class="flex items-center space-x-2 text-sm p-2 hover:bg-gray-50 rounded cursor-pointer">
                                            <input type="checkbox" class="rounded text-blue-600 focus:ring-blue-500" 
                                                value="${capId}" 
                                                ${isChecked ? 'checked' : ''}
                                                onchange="userManagement.updateCapability('${level}', '${strand}', '${subj}', this.checked)">
                                            <span>${subj}</span>
                                        </label>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    `;
                }
            } else {
                // Regular Levels
                html += `
                    <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
                        ${content.map(subj => {
                            const capId = `${level}:General:${subj}`;
                            const isChecked = this.teacherCapabilities.some(c => c.id === capId || (c.level === level && c.subject === subj));
                            return `
                                <label class="flex items-center space-x-2 text-sm p-2 hover:bg-gray-50 rounded cursor-pointer">
                                    <input type="checkbox" class="rounded text-blue-600 focus:ring-blue-500" 
                                        value="${capId}" 
                                        ${isChecked ? 'checked' : ''}
                                        onchange="userManagement.updateCapability('${level}', 'General', '${subj}', this.checked)">
                                    <span>${subj}</span>
                                </label>
                            `;
                        }).join('')}
                    </div>
                `;
            }

            html += `
                    </div>
                </div>
            `;
        }

        container.innerHTML = html;
    }

    updateCapability(level, strand, subject, isChecked) {
        if (!this.teacherCapabilities) this.teacherCapabilities = [];
        
        const capId = `${level}:${strand}:${subject}`;
        
        if (isChecked) {
            // Check if already exists
            if (!this.teacherCapabilities.some(c => c.id === capId)) {
                this.teacherCapabilities.push({
                    id: capId,
                    level,
                    strand: strand === 'General' ? null : strand,
                    subject
                });
            }
        } else {
            this.teacherCapabilities = this.teacherCapabilities.filter(c => c.id !== capId);
        }
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

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Occupation</label>
                            <input type="text" id="parentOccupation" value="${user?.occupation || ''}" 
                                   class="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                        </div>
                         <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Address</label>
                            <input type="text" id="parentAddress" value="${user?.address || ''}" 
                                   class="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                        </div>
                    </div>
                    
                    <!-- 
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Emergency Contact</label>
                        <input type="tel" id="emergencyContact" value="${user?.emergencyContact || ''}" 
                               class="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    </div>
                    -->

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Username *</label>
                            <input type="text" id="parentUsername" value="${user?.username || ''}" 
                                   class="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" 
                                   required>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                            <input type="password" id="parentPassword" 
                                   class="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" 
                                   ${isEditing ? '' : 'required'}>
                            ${isEditing ? '<p class="text-xs text-gray-500 mt-1">Leave blank to keep current password</p>' : ''}
                        </div>
                    </div>

                    <div class="border-t pt-4 mt-4">
                        <h4 class="font-medium mb-2 text-gray-700">Children</h4>
                        <div id="childrenList" class="space-y-2 mb-3">
                            ${this.tempChildren.length > 0 ? this.tempChildren.map(childId => `
                                <div class="flex justify-between items-center bg-gray-50 p-2 rounded border border-gray-200">
                                    <span class="text-sm font-mono">${childId}</span>
                                    <button type="button" onclick="userManagement.removeChild('${childId}')" 
                                            class="text-red-500 hover:text-red-700 transition-colors">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            `).join('') : '<p class="text-sm text-gray-500 italic">No children linked</p>'}
                        </div>
                        <div class="flex gap-2">
                            <input type="text" id="newChildId" placeholder="Enter Student ID" 
                                   class="flex-1 border border-gray-300 rounded-md px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <button type="button" onclick="userManagement.addChild()" 
                                    class="bg-blue-500 text-white px-3 py-1 rounded-md text-sm hover:bg-blue-600 transition-colors">
                                Add
                            </button>
                        </div>
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

        // If we have classes from Supabase, use them, otherwise use default options
        if (this.classes.length > 0) {
            return this.classes.map(cls => 
                `<option value="${cls.id}" ${(this.currentEditingUser?.classId === cls.id || this.currentEditingUser?.class_id === cls.id) ? 'selected' : ''}>
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

    getClassFromSelection(selection) {
        if (!selection) return null;
        return this.classes.find(cls =>
            cls.id === selection ||
            cls.name === selection ||
            cls.grade === selection ||
            `${cls.grade}${cls.strand ? ' - ' + cls.strand : ''}` === selection
        );
    }

    getClassLabel(selection) {
        if (!selection) return '';
        const cls = this.getClassFromSelection(selection);
        if (!cls) return selection;
        const grade = cls.grade || cls.name || '';
        return `${grade}${cls.strand ? ' - ' + cls.strand : ''}`;
    }

    parseClassName(className) {
        const raw = (className || '').trim();
        if (!raw) return { level: 'Elementary', grade: '', strand: null };
        let grade = raw;
        let strand = null;
        if (raw.includes('-')) {
            const parts = raw.split('-').map(p => p.trim()).filter(Boolean);
            if (parts[0]) grade = parts[0];
            if (parts[1]) strand = parts[1].replace(/[()]/g, '').trim();
        } else {
            const match = raw.match(/^(.*?)\s*\((.*?)\)\s*$/);
            if (match) {
                grade = match[1].trim();
                strand = match[2].trim();
            }
        }

        let level = 'Elementary';
        if (grade.includes('Kinder')) {
            level = 'Kindergarten';
        } else {
            const gradeNum = parseInt(grade.replace(/\D/g, ''), 10);
            if (!Number.isNaN(gradeNum)) {
                if (gradeNum >= 1 && gradeNum <= 6) level = 'Elementary';
                else if (gradeNum >= 7 && gradeNum <= 10) level = 'Highschool';
                else if (gradeNum >= 11 && gradeNum <= 12) level = 'Senior High';
            }
        }

        if (strand) {
            const upper = strand.toUpperCase();
            if (upper.includes('STEM')) strand = 'STEM';
            else if (upper.includes('HUMSS')) strand = 'HUMSS';
            else if (upper.includes('ABM')) strand = 'ABM';
            else if (upper.includes('ICT')) strand = 'ICT';
            else if (upper.includes('TVL')) strand = 'TVL';
        }

        return { level, grade, strand: strand || null };
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
        const classLabel = this.getClassLabel(selectedClass);
        const subjects = this.getSubjectsForClass(classLabel);
        
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
        let level = 'Elementary';
        let strand = null;

        if (selectedClass.includes('Kinder')) {
            level = 'Kindergarten';
        } else if (selectedClass.includes('Grade 11') || selectedClass.includes('Grade 12')) {
            level = 'Senior High';
            if (selectedClass.includes('STEM')) strand = 'STEM';
            else if (selectedClass.includes('HUMSS')) strand = 'HUMSS';
            else if (selectedClass.includes('ABM')) strand = 'ABM';
            else if (selectedClass.includes('ICT') || selectedClass.includes('TVL')) strand = 'TVL';
        } else if (selectedClass.includes('Grade')) {
            const gradeNum = parseInt(selectedClass.replace(/\D/g, ''));
            if (gradeNum >= 7 && gradeNum <= 10) {
                level = 'Highschool';
            }
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
            if (strand === 'STEM') {
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
            } else if (strand === 'ABM') {
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
            } else if (strand === 'HUMSS') {
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
            } else if (strand === 'TVL') {
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

    // Handle subject checkbox changes - DEPRECATED in favor of updateCapability
    
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
        document.getElementById('step4')?.classList.add('hidden');
        document.getElementById('step5')?.classList.add('hidden');
        
        // Show current step
        document.getElementById(`step${step}`)?.classList.remove('hidden');
        
        // Initialize Step 3 (Subjects) if entered
        if (step === 3) {
             this.renderSubjectQualificationUI();
        }

        // Generate preview if last step
        if (step === 5) {
            this.generateTeacherPreview();
        }
        
        // Update UI for steps (bubbles)
        this.updateStepIndicators(step);
    }
    
    updateStepIndicators(step) {
        const form = document.getElementById('teacherForm');
        if (!form) return;
        
        // The form is inside a scrollable wrapper, and the progress steps are the previous sibling of that wrapper
        const progressContainer = form.parentElement?.previousElementSibling;
        
        if (!progressContainer) return;
        
        const steps = progressContainer.children;
        for (let i = 0; i < steps.length; i++) {
            const stepNum = i + 1;
            const circle = steps[i].querySelector('div');
            const label = steps[i].querySelector('span');
            
            if (circle && label) {
                if (step >= stepNum) {
                    circle.classList.remove('bg-gray-200', 'text-gray-500');
                    circle.classList.add('bg-blue-500', 'text-white');
                    label.classList.remove('text-gray-500');
                    label.classList.add('text-blue-600');
                } else {
                    circle.classList.remove('bg-blue-500', 'text-white');
                    circle.classList.add('bg-gray-200', 'text-gray-500');
                    label.classList.remove('text-blue-600');
                    label.classList.add('text-gray-500');
                }
            }
        }
    }

    validateCurrentStep() {
        if (this.currentStep === 1) { // Info
            const name = document.getElementById('teacherName')?.value;
            const email = document.getElementById('teacherEmail')?.value;
            const phone = document.getElementById('teacherPhone')?.value;
            
            if (!name) {
                this.showNotification('Please enter teacher name', 'error');
                return false;
            }
            if (!email) {
                this.showNotification('Please enter teacher email', 'error');
                return false;
            }
            if (!phone) {
                this.showNotification('Please enter teacher phone number', 'error');
                return false;
            }
        } else if (this.currentStep === 2) { // Advisory
            const hasAdvisory = document.getElementById('hasAdvisory')?.checked;
            if (hasAdvisory) {
                const selectedClass = document.getElementById('teacherClass')?.value;
                if (!selectedClass) {
                    this.showNotification('Please select a class for advisory', 'error');
                    return false;
                }
            }
        } else if (this.currentStep === 3) { // Subjects
            if (!this.teacherCapabilities || this.teacherCapabilities.length === 0) {
                 this.showNotification('Please select at least one subject qualification', 'warning');
                 return false;
            }
        } else if (this.currentStep === 4) { // Account
            const username = document.getElementById('teacherUsername')?.value;
            const password = document.getElementById('teacherPassword')?.value;
            
            if (!username) {
                this.showNotification('Please enter username', 'error');
                return false;
            }
            if (!this.currentEditingUser && !password) {
                this.showNotification('Please enter password', 'error');
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
        
        const hasAdvisory = document.getElementById('hasAdvisory').checked;
        const selectedClassValue = hasAdvisory ? document.getElementById('teacherClass').value : '';
        const selectedClass = hasAdvisory ? (this.getClassLabel(selectedClassValue) || selectedClassValue) : 'None';
        
        const username = document.getElementById('teacherUsername').value;
        
        // Group capabilities for display
        const groupedCaps = {};
        this.teacherCapabilities.forEach(cap => {
            if (!groupedCaps[cap.level]) groupedCaps[cap.level] = [];
            groupedCaps[cap.level].push(cap.subject + (cap.strand ? ` (${cap.strand})` : ''));
        });

        let subjectsHtml = '';
        for (const [level, subjects] of Object.entries(groupedCaps)) {
            subjectsHtml += `
                <div class="mb-2">
                    <p class="font-medium text-xs text-gray-500 uppercase">${level}</p>
                    <p class="text-gray-700">${subjects.join(', ')}</p>
                </div>
            `;
        }
        
        preview.innerHTML = `
            <div class="grid grid-cols-2 gap-4 mb-4">
                <div>
                    <p class="text-xs text-gray-500 uppercase">Full Name</p>
                    <p class="font-medium text-gray-900">${name}</p>
                </div>
                <div>
                    <p class="text-xs text-gray-500 uppercase">Role</p>
                    <p class="font-medium text-gray-900">Teacher</p>
                </div>
                <div>
                    <p class="text-xs text-gray-500 uppercase">Email</p>
                    <p class="font-medium text-gray-900">${email || 'N/A'}</p>
                </div>
                <div>
                    <p class="text-xs text-gray-500 uppercase">Phone</p>
                    <p class="font-medium text-gray-900">${phone || 'N/A'}</p>
                </div>
                <div>
                    <p class="text-xs text-gray-500 uppercase">Advisory Class</p>
                    <p class="font-medium text-gray-900">${selectedClass}</p>
                </div>
                <div>
                    <p class="text-xs text-gray-500 uppercase">Username</p>
                    <p class="font-medium text-gray-900">${username}</p>
                </div>
            </div>
            
            <div class="border-t pt-3">
                <p class="text-xs text-gray-500 uppercase mb-2">Teaching Qualifications</p>
                <div class="bg-white p-3 rounded border border-gray-200 text-sm">
                    ${subjectsHtml || '<p class="text-gray-500 italic">No qualifications selected</p>'}
                </div>
            </div>
        `;
    }

    async createAuthUser(email, password, metadata) {
        // Create a temporary client to avoid signing out the admin
        // We need the URL and Key. Assuming supabaseConfig is global or we can get it from the window
        const url = (typeof supabaseConfig !== 'undefined' ? supabaseConfig.url : '') || window.supabaseClient.supabaseUrl;
        const key = (typeof supabaseConfig !== 'undefined' ? supabaseConfig.anonKey : '') || window.supabaseClient.supabaseKey;

        if (!url || !key) {
            throw new Error('Supabase configuration not found. Cannot create auth user.');
        }

        const tempClient = window.supabase.createClient(url, key);
        
        const { data, error } = await tempClient.auth.signUp({
            email,
            password,
            options: {
                data: metadata
            }
        });

        if (error) throw error;
        if (!data.user) throw new Error('User creation failed - no user returned');
        
        return data.user.id;
    }

    async saveTeacher() {
        try {
            this.showLoading();

            const hasAdvisory = document.getElementById('hasAdvisory').checked;
            let classId = null;
            let assignedClass = null;
            
            if (hasAdvisory) {
                assignedClass = document.getElementById('teacherClass').value;
                if (assignedClass) {
                    // Find or create class in Supabase
                    if (this.classes.length > 0) {
                        const existingClass = this.getClassFromSelection(assignedClass);
                        if (!existingClass) {
                            // Create new class
                            classId = await this.createClass(assignedClass);
                        } else {
                            classId = existingClass.id;
                        }
                    } else {
                        classId = await this.createClass(assignedClass);
                    }
                }
            }

            const name = document.getElementById('teacherName').value;
            const phone = document.getElementById('teacherPhone').value || '';
            const username = document.getElementById('teacherUsername').value;
            // Generate a dummy email if not provided, for Auth purposes
            const emailInput = document.getElementById('teacherEmail').value;
            const email = emailInput || `${username.toLowerCase().replace(/\s+/g, '')}@educare.com`;
            
            const password = document.getElementById('teacherPassword').value;

            // Prepare data for 'teachers' table
            const teacherData = {
                employee_no: username, // Mapping Username -> Employee No
                is_homeroom: hasAdvisory,
                assigned_subjects: this.teacherCapabilities.map(cap => cap.subject) // Flatten capabilities to subjects array
            };

            // Prepare data for 'profiles' table
            const profileData = {
                full_name: name,
                phone: phone,
                role: 'teacher',
                is_active: true,
                username: username
            };

            if (password) {
                profileData.password = password;
            }

            if (this.currentEditingUser) {
                // Update existing user
                // 1. Update Profile
                const { error: profileError } = await window.supabaseClient
                    .from('profiles')
                    .update(profileData)
                    .eq('id', this.currentEditingUser.id);
                
                if (profileError) throw profileError;

                // 2. Update Teacher Data
                const { error: teacherError } = await window.supabaseClient
                    .from('teachers')
                    .update(teacherData)
                    .eq('id', this.currentEditingUser.id); // One-to-one mapping

                if (teacherError) throw teacherError;

                // 3. Update Class Adviser if applicable
                if (hasAdvisory && classId) {
                    // Clear previous advisory class for this teacher
                    await window.supabaseClient
                        .from('classes')
                        .update({ adviser_id: null })
                        .eq('adviser_id', this.currentEditingUser.id);

                    // Set new advisory class
                    const { error: classError } = await window.supabaseClient
                        .from('classes')
                        .update({ adviser_id: this.currentEditingUser.id })
                        .eq('id', classId);
                    
                    if (classError) console.error('Error updating class adviser:', classError);
                } else if (!hasAdvisory) {
                    // If advisory was removed, clear it
                    await window.supabaseClient
                        .from('classes')
                        .update({ adviser_id: null })
                        .eq('adviser_id', this.currentEditingUser.id);
                }
                
                // Note: We don't update Auth email/password here as it requires service role or user action
                this.showNotification('Teacher updated successfully', 'success');

            } else {
                // Create new user
                if (!password) throw new Error('Password is required for new users');

                // 1. Create Auth User
                const userId = await this.createAuthUser(email, password, {
                    full_name: name,
                    role: 'teacher'
                });

                // 2. Insert Profile
                const { error: profileError } = await window.supabaseClient
                    .from('profiles')
                    .insert([{
                        id: userId,
                        ...profileData
                    }]);
                
                if (profileError) throw profileError;

                // 3. Insert Teacher Data
                const { error: teacherError } = await window.supabaseClient
                    .from('teachers')
                    .insert([{
                        id: userId,
                        ...teacherData
                    }]);

                if (teacherError) throw teacherError;

                // 4. Update Class Adviser if applicable
                if (hasAdvisory && classId) {
                    const { error: classError } = await window.supabaseClient
                        .from('classes')
                        .update({ adviser_id: userId })
                        .eq('id', classId);
                    
                    if (classError) console.error('Error updating class adviser:', classError);
                }

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

    async createClass(className) {
        try {
            const parsed = this.parseClassName(className);
            const level = parsed.level;
            const grade = parsed.grade || className;
            const strand = parsed.strand;

            // Generate UUID for new class
            const newClassId = crypto.randomUUID();

            const classData = {
                id: newClassId,
                level: level,
                grade: grade,
                strand: strand,
                is_active: true,
                created_at: new Date().toISOString()
            };

            const { data, error } = await window.supabaseClient
                .from('classes')
                .insert([classData])
                .select('id')
                .single();
            
            if (error) throw error;
            const classId = data.id;
            
            // Add to local classes array
            this.classes.push({ ...classData, name: className, level, subjects: this.getSubjectsForClass(className) });
            
            return classId;
        } catch (error) {
            console.error('Error creating class:', error);
            return null;
        }
    }

    async addChild() {
        const input = document.getElementById('newChildId');
        const childId = input.value.trim();
        
        if (!childId) return;
        
        if (this.tempChildren.includes(childId)) {
            this.showNotification('Child already linked', 'info');
            return;
        }

        try {
            // Verify student exists
            let exists = false;
            const { data, error } = await window.supabaseClient
                .from('students')
                .select('id')
                .eq('id', childId)
                .single();
            exists = !!data && !error;

            if (!exists) {
                this.showNotification('Student ID not found', 'error');
                return;
            }
            
            this.tempChildren.push(childId);
            input.value = '';
            this.renderChildrenList();
        } catch (error) {
            console.error('Error verifying student:', error);
            this.showNotification('Error verifying student', 'error');
        }
    }

    removeChild(childId) {
        this.tempChildren = this.tempChildren.filter(id => id !== childId);
        this.renderChildrenList();
    }

    renderChildrenList() {
        const container = document.getElementById('childrenList');
        if (!container) return;
        
        if (this.tempChildren.length === 0) {
            container.innerHTML = '<p class="text-sm text-gray-500 italic">No children linked</p>';
            return;
        }
        
        container.innerHTML = this.tempChildren.map(childId => `
            <div class="flex justify-between items-center bg-gray-50 p-2 rounded border border-gray-200">
                <span class="text-sm font-mono">${childId}</span>
                <button type="button" onclick="userManagement.removeChild('${childId}')" 
                        class="text-red-500 hover:text-red-700 transition-colors">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `).join('');
    }

    async saveUser() {
        try {
            this.showLoading();

            const name = document.getElementById('userName').value;
            const emailInput = document.getElementById('userEmail').value;
            const phone = document.getElementById('userPhone').value;
            const username = document.getElementById('staffUsername').value;
            // Generate dummy email for Auth if not provided
            const authEmail = emailInput || `${username.toLowerCase().replace(/\s+/g, '')}@educare.com`;
            const password = document.getElementById('staffPassword').value;

            // Prepare role-specific data
            let roleData = {};
            let roleTable = '';

            if (this.currentRole === 'guard') {
                roleTable = 'guards';
                roleData = {
                    shift: document.getElementById('guardShift')?.value || 'Whole Day',
                    assigned_gate: document.getElementById('guardGate')?.value || 'Main Gate'
                };
            } else if (this.currentRole === 'clinic') {
                roleTable = 'clinic_staff';
                roleData = {
                    license_no: document.getElementById('clinicLicense').value,
                    position: document.getElementById('clinicPosition').value
                };
            } else if (this.currentRole === 'admin') {
                roleTable = 'admin_staff';
                const permissionCheckboxes = document.querySelectorAll('.admin-permission-checkbox:checked');
                const selectedPermissions = Array.from(permissionCheckboxes).map(cb => cb.value);
                
                roleData = {
                    position: document.getElementById('adminPosition').value,
                    permissions: selectedPermissions
                };
            }

            const profileData = {
                full_name: name,
                phone: phone,
                email: emailInput || null,
                role: this.currentRole,
                is_active: true,
                username: username
            };

            if (password) {
                profileData.password = password;
            }

            if (this.currentEditingUser) {
                // Update existing user
                const { error: profileError } = await window.supabaseClient
                    .from('profiles')
                    .update(profileData)
                    .eq('id', this.currentEditingUser.id);
                
                if (profileError) throw profileError;

                if (roleTable) {
                    const { error: roleError } = await window.supabaseClient
                        .from(roleTable)
                        .update(roleData)
                        .eq('id', this.currentEditingUser.id);

                    if (roleError) throw roleError;
                }
                
                this.showNotification('User updated successfully', 'success');
            } else {
                // Create new user
                if (!password) throw new Error('Password is required for new users');

                const userId = await this.createAuthUser(authEmail, password, {
                    full_name: name,
                    role: this.currentRole
                });

                const { error: profileError } = await window.supabaseClient
                    .from('profiles')
                    .insert([{
                        id: userId,
                        ...profileData
                    }]);
                
                if (profileError) throw profileError;

                if (roleTable) {
                    const { error: roleError } = await window.supabaseClient
                        .from(roleTable)
                        .insert([{
                            id: userId,
                            ...roleData
                        }]);

                    if (roleError) throw roleError;
                }

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

            const name = document.getElementById('parentName').value;
            const emailInput = document.getElementById('parentEmail').value;
            const phone = document.getElementById('parentPhone').value;
            const relationship = document.getElementById('parentRelationship').value;
            // const emergencyContact = document.getElementById('emergencyContact').value || ''; // Removed from UI
            const occupation = document.getElementById('parentOccupation').value || '';
            const address = document.getElementById('parentAddress').value || '';
            
            const username = document.getElementById('parentUsername').value;
            // Generate dummy email for Auth if not provided
            const authEmail = emailInput || `${username.toLowerCase().replace(/\s+/g, '')}@educare.com`;
            
            const password = document.getElementById('parentPassword').value;

            const parentData = {
                address: address,
                occupation: occupation
            };

            const profileData = {
                full_name: name,
                phone: phone,
                email: emailInput || null,
                role: 'parent',
                is_active: true,
                username: username
            };

            if (password) {
                profileData.password = password;
            }

            if (this.currentEditingUser) {
                const { error: profileError } = await window.supabaseClient
                    .from('profiles')
                    .update(profileData)
                    .eq('id', this.currentEditingUser.id);
                
                if (profileError) throw profileError;

                const { error: parentError } = await window.supabaseClient
                    .from('parents')
                    .update(parentData)
                    .eq('id', this.currentEditingUser.id);

                if (parentError) throw parentError;

                // Update Children (Parent Students)
                // Delete existing links first to ensure clean state
                await window.supabaseClient
                    .from('parent_students')
                    .delete()
                    .eq('parent_id', this.currentEditingUser.id);
                    
                if (this.tempChildren && this.tempChildren.length > 0) {
                     const parentStudents = this.tempChildren.map(studentId => ({
                        parent_id: this.currentEditingUser.id,
                        student_id: studentId,
                        relationship: relationship
                     }));
                     
                     const { error: linkError } = await window.supabaseClient
                        .from('parent_students')
                        .insert(parentStudents);
                        
                     if (linkError) throw linkError;
                }
                
                this.showNotification('Parent updated successfully', 'success');
            } else {
                if (!password) throw new Error('Password is required for new users');

                const userId = await this.createAuthUser(authEmail, password, {
                    full_name: name,
                    role: 'parent'
                });

                const { error: profileError } = await window.supabaseClient
                    .from('profiles')
                    .insert([{
                        id: userId,
                        ...profileData
                    }]);
                
                if (profileError) throw profileError;

                const { error: parentError } = await window.supabaseClient
                    .from('parents')
                    .insert([{
                        id: userId,
                        ...parentData
                    }]);

                if (parentError) throw parentError;

                if (this.tempChildren && this.tempChildren.length > 0) {
                     const parentStudents = this.tempChildren.map(studentId => ({
                        parent_id: userId,
                        student_id: studentId,
                        relationship: relationship
                     }));
                     
                     const { error: linkError } = await window.supabaseClient
                        .from('parent_students')
                        .insert(parentStudents);
                        
                     if (linkError) throw linkError;
                }

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
                this.tempChildren = user.children ? [...user.children] : [];
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
            const { error } = await window.supabaseClient
                .from('profiles')
                .update({ is_active: newStatus })
                .eq('id', userId);
                
            if (error) throw error;

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
                                (statusFilter === 'active' && user.is_active) ||
                                (statusFilter === 'inactive' && !user.is_active);

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
