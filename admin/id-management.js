// ID Management System
class IDManagement {
    constructor() {
        this.currentUser = null;
        this.currentStudent = null;
        this.currentParent = null;
        this.selectedStudentId = null;
        this.allStudents = [];
        this.allParents = [];
        this.allClasses = [];
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
            this.initEventListeners();
            
            // Pre-load all students and parents for search
            await this.loadAllData();
            
            this.hideLoading();
        } catch (error) {
            console.error('ID Management initialization failed:', error);
            this.hideLoading();
        }
    }

    async loadAllData() {
        try {
            this.showLoading();
            
            // Load all students and parents
            const [students, users, classes] = await Promise.all([
                EducareTrack.getStudents(true),
                EducareTrack.getUsers(true),
                EducareTrack.getClasses(true)
            ]);
            
            this.allClasses = classes || [];
            this.allStudents = (students || []).map(student => ({
                ...student,
                name: this.getStudentName(student),
                studentId: this.getStudentIdentifier(student),
                grade: this.getStudentGrade(student)
            }));
            this.allParents = users.filter(user => user.role === 'parent') || [];
            
            console.log('Loaded data:', {
                students: this.allStudents.length,
                parents: this.allParents.length
            });
            
            this.hideLoading();
        } catch (error) {
            console.error('Error loading data:', error);
            this.allStudents = [];
            this.allParents = [];
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

    getStudentName(student) {
        if (!student) return 'Unknown';
        if (student.full_name) return student.full_name;
        if (student.name) return student.name;
        return 'Unknown';
    }

    getStudentIdentifier(student) {
        if (!student) return '';
        return student.studentId || student.id || '';
    }

    getClassById(classId) {
        if (!classId) return null;
        return this.allClasses.find(cls => cls.id === classId) || null;
    }

    getStudentGrade(student) {
        if (!student) return '';
        const clsId = student.class_id || student.classId;
        const cls = this.getClassById(clsId);
        if (cls?.grade) return cls.grade;
        if (student.grade) return student.grade;
        if (student.level) return student.level;
        return '';
    }

    initEventListeners() {
        // Sidebar toggle
        document.getElementById('sidebarToggle').addEventListener('click', () => {
            this.toggleSidebar();
        });

        // Logout
        document.getElementById('logoutBtn').addEventListener('click', async () => {
            const ok = window.EducareTrack && typeof window.EducareTrack.confirmAction === 'function'
                ? await window.EducareTrack.confirmAction('Are you sure you want to logout?', 'Confirm Logout', 'Logout', 'Cancel')
                : true;
            if (ok) {
                localStorage.removeItem('educareTrack_user');
                window.location.href = '../index.html';
            }
        });

        // Search functionality
        document.getElementById('searchBtn').addEventListener('click', () => {
            this.searchStudents();
        });

        document.getElementById('clearSearchBtn').addEventListener('click', () => {
            this.clearSearch();
        });

        document.getElementById('searchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.searchStudents();
            }
        });

        // Real-time search as user types
        document.getElementById('searchInput').addEventListener('input', (e) => {
            const searchTerm = e.target.value.trim();
            if (searchTerm.length >= 2) {
                this.searchStudents();
            } else if (searchTerm.length === 0) {
                this.clearSearch();
            }
        });

        // Grade level change handler
        document.getElementById('studentGrade').addEventListener('change', () => {
            this.toggleStrandField();
            this.loadClassesForGrade();
        });

        // Form actions
        document.getElementById('saveChangesBtn').addEventListener('click', () => {
            this.saveChanges();
        });

        document.getElementById('reissueIDBtn').addEventListener('click', () => {
            this.reissueID();
        });

        document.getElementById('cancelEditBtn').addEventListener('click', () => {
            this.cancelEdit();
        });

        // Photo management
        document.getElementById('updatePhotoBtn').addEventListener('click', () => {
            this.openPhotoModal();
        });

        document.getElementById('browsePhotoBtn').addEventListener('click', () => {
            document.getElementById('photoUpload').click();
        });

        document.getElementById('photoUpload').addEventListener('change', (e) => {
            this.handlePhotoUpload(e);
        });

        document.getElementById('savePhotoBtn').addEventListener('click', () => {
            this.savePhoto();
        });

        document.getElementById('cancelPhotoBtn').addEventListener('click', () => {
            this.closePhotoModal();
        });

        // ID Preview actions
        document.getElementById('printIDBtn').addEventListener('click', () => {
            this.printID();
        });

        document.getElementById('savePNGBtn').addEventListener('click', () => {
            this.saveAsPNG();
        });

        document.getElementById('savePDFBtn').addEventListener('click', () => {
            this.saveAsPDF();
        });

        document.getElementById('closePreviewBtn').addEventListener('click', () => {
            this.closePreview();
        });

        // Success modal
        document.getElementById('closeSuccessBtn').addEventListener('click', () => {
            this.closeSuccessModal();
        });

        // Escape key handlers
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAnyOpenModal();
            }
        });
    }

    async searchStudents() {
        try {
            this.showLoading();
            
            const searchInput = document.getElementById('searchInput').value.trim();
            const gradeFilter = document.getElementById('gradeFilter').value;
            const strandFilter = document.getElementById('strandFilter').value;

            if (!searchInput && !gradeFilter && !strandFilter) {
                // If no search criteria, show message
                this.displaySearchResults([]);
                this.hideLoading();
                return;
            }

            console.log('Searching with:', { searchInput, gradeFilter, strandFilter });

            let students = this.allStudents;

            // Apply search filter
            if (searchInput) {
                const searchLower = searchInput.toLowerCase();
                students = students.filter(student => {
                    const nameMatch = this.getStudentName(student).toLowerCase().includes(searchLower);
                    const lrnMatch = student.lrn && student.lrn.includes(searchInput);
                    const studentIdMatch = this.getStudentIdentifier(student).toLowerCase().includes(searchLower);
                    
                    return nameMatch || lrnMatch || studentIdMatch;
                });
            }

            // Apply grade filter
            if (gradeFilter) {
                students = students.filter(student => this.getStudentGrade(student) === gradeFilter);
            }

            // Apply strand filter
            if (strandFilter) {
                students = students.filter(student => student.strand === strandFilter);
            }

            console.log('Filtered students:', students);
            this.displaySearchResults(students);
            this.hideLoading();
        } catch (error) {
            console.error('Error searching students:', error);
            this.showError('Error searching students: ' + error.message);
            this.hideLoading();
        }
    }

    displaySearchResults(students) {
        const resultsList = document.getElementById('resultsList');
        const searchResults = document.getElementById('searchResults');

        if (students.length === 0) {
            resultsList.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <i class="fas fa-search text-3xl mb-2"></i>
                    <p>No students found matching your criteria</p>
                    <p class="text-sm mt-2">Try adjusting your search terms or filters</p>
                </div>
            `;
        } else {
            resultsList.innerHTML = students.map(student => {
                // Find parent for this student
                // Support both camelCase (old) and snake_case (new)
                const pId = student.parent_id || student.parentId;
                const parent = this.allParents.find(p => p.id === pId);
                const parentName = parent ? parent.name : 'Parent not found';
                const photo = student.photo_url || student.photoUrl;
                
                return `
                <div class="student-result flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-blue-50 transition duration-200" data-student-id="${student.id}">
                    <div class="flex items-center space-x-4">
                        <div class="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                            ${photo ? 
                                `<img src="${photo}" alt="${this.getStudentName(student)}" class="w-full h-full rounded-full object-cover">` :
                                `<i class="fas fa-user text-blue-600"></i>`
                            }
                        </div>
                        <div>
                            <h4 class="font-semibold text-gray-800">${this.getStudentName(student)}</h4>
                            <p class="text-sm text-gray-600">${this.getStudentGrade(student)} ${student.strand ? `• ${student.strand}` : ''}</p>
                            <p class="text-xs text-gray-500">LRN: ${student.lrn || 'N/A'} • ID: ${this.getStudentIdentifier(student) || 'N/A'}</p>
                            <p class="text-xs text-gray-400">Parent: ${parentName}</p>
                        </div>
                    </div>
                    <button class="select-student-btn px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-200">
                        <i class="fas fa-edit mr-1"></i> Edit
                    </button>
                </div>
            `}).join('');

            // Add event listeners to result items
            document.querySelectorAll('.student-result').forEach(item => {
                item.addEventListener('click', (e) => {
                    if (!e.target.closest('.select-student-btn')) {
                        const studentId = item.dataset.studentId;
                        this.selectStudent(studentId);
                    }
                });
            });

            document.querySelectorAll('.select-student-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const studentId = e.target.closest('.student-result').dataset.studentId;
                    this.selectStudent(studentId);
                });
            });
        }

        searchResults.classList.remove('hidden');
    }

    async selectStudent(studentId) {
        try {
            this.showLoading();
            this.selectedStudentId = studentId;

            // Get student data from our loaded data
            this.currentStudent = this.allStudents.find(s => s.id === studentId);
            if (!this.currentStudent) {
                throw new Error('Student not found in loaded data');
            }

            // Get parent data from our loaded data
            const pId = this.currentStudent.parent_id || this.currentStudent.parentId;
            this.currentParent = this.allParents.find(p => p.id === pId);
            if (!this.currentParent) {
                console.warn('Parent not found for student:', this.currentStudent.id);
                // Create a dummy parent object to avoid errors
                this.currentParent = {
                    id: pId,
                    name: 'Parent not found',
                    phone: '',
                    email: '',
                    address: '',
                    relationship: 'Parent'
                };
            }

            // Populate form
            this.populateForm();
            
            // Show form and hide search results
            document.getElementById('searchResults').classList.add('hidden');
            document.getElementById('studentInfoForm').classList.remove('hidden');
            
            this.hideLoading();
        } catch (error) {
            console.error('Error selecting student:', error);
            this.showError('Error loading student data: ' + error.message);
            this.hideLoading();
        }
    }

    populateForm() {
        // Student details
        document.getElementById('studentName').value = this.getStudentName(this.currentStudent);
        document.getElementById('studentLRN').value = this.currentStudent.lrn || '';
        document.getElementById('studentGrade').value = this.getStudentGrade(this.currentStudent);
        
        // Toggle strand field based on grade
        this.toggleStrandField();
        
        if (this.currentStudent.strand) {
            document.getElementById('studentStrand').value = this.currentStudent.strand;
        }

        // Load classes for the grade
        this.loadClassesForGrade().then(() => {
            const clsId = this.currentStudent.class_id || this.currentStudent.classId;
            if (clsId) {
                document.getElementById('studentClass').value = clsId;
            }
        });

        // Parent details
        document.getElementById('parentName').value = this.currentParent.name || '';
        document.getElementById('parentPhone').value = this.currentParent.phone || '';
        document.getElementById('parentEmail').value = this.currentParent.email || '';
        document.getElementById('parentAddress').value = this.currentParent.address || '';
        document.getElementById('parentRelationship').value = this.currentParent.relationship || 'Parent';

        // Load current photo
        this.loadCurrentPhoto();

        // Update ID preview
        this.updateIDPreview();
    }

    toggleStrandField() {
        const grade = document.getElementById('studentGrade').value;
        const strandField = document.getElementById('strandField');
        
        if (grade === 'Grade 11' || grade === 'Grade 12') {
            strandField.classList.remove('hidden');
            document.getElementById('studentStrand').required = true;
        } else {
            strandField.classList.add('hidden');
            document.getElementById('studentStrand').required = false;
            document.getElementById('studentStrand').value = '';
        }
    }

    async loadClassesForGrade() {
        try {
            const grade = document.getElementById('studentGrade').value;
            const classSelect = document.getElementById('studentClass');
            
            // Clear existing options
            classSelect.innerHTML = '<option value="">Select Class</option>';
            
            if (!grade) return;

            const classes = await EducareTrack.getClasses();
            const gradeClasses = classes.filter(cls => 
                cls.grade === grade && 
                (!this.currentStudent.strand || cls.strand === this.currentStudent.strand)
            );

            gradeClasses.forEach(cls => {
                const option = document.createElement('option');
                option.value = cls.id;
                option.textContent = cls.name;
                classSelect.appendChild(option);
            });

            // Select current class if available
            const clsId = this.currentStudent && (this.currentStudent.class_id || this.currentStudent.classId);
            if (clsId) {
                classSelect.value = clsId;
            }
        } catch (error) {
            console.error('Error loading classes:', error);
        }
    }

    // Photo handling functions - MODIFIED TO NOT STORE
    openPhotoModal() {
        document.getElementById('photoModal').classList.remove('hidden');
    }

    closePhotoModal() {
        document.getElementById('photoModal').classList.add('hidden');
        document.getElementById('photoPreview').classList.add('hidden');
        document.getElementById('photoUpload').value = '';
    }

    handlePhotoUpload(event) {
        const file = event.target.files[0];
        if (file) {
            if (file.size > 2 * 1024 * 1024) {
                this.showError('File size must be less than 2MB');
                return;
            }
            
            if (!file.type.startsWith('image/')) {
                this.showError('Please select an image file');
                return;
            }
            
            const reader = new FileReader();
            reader.onload = (e) => {
                document.getElementById('previewImage').src = e.target.result;
                document.getElementById('photoPreview').classList.remove('hidden');
            };
            reader.onerror = () => {
                this.showError('Error reading file. Please try another image.');
            };
            reader.readAsDataURL(file);
        }
    }

    async savePhoto() {
        try {
            const fileInput = document.getElementById('photoUpload');
            if (!fileInput.files[0]) {
                this.showError('Please select a photo first');
                return;
            }

            this.showLoading();

            // Read the photo as data URL
            const reader = new FileReader();
            reader.onload = async (e) => {
                const photoDataUrl = e.target.result;
                
                try {
                    // Update in Supabase
                    await EducareTrack.db.collection('students').doc(this.currentStudent.id).update({
                        photo_url: photoDataUrl,
                        updated_at: new Date()
                    });

                    // Update local state
                    this.currentStudent.photo_url = photoDataUrl;
                    const studentIndex = this.allStudents.findIndex(s => s.id === this.currentStudent.id);
                    if (studentIndex !== -1) {
                        this.allStudents[studentIndex].photo_url = photoDataUrl;
                    }

                    // Update UI
                    this.loadCurrentPhoto();
                    this.updateIDPreview();

                    // Close modal and show success
                    this.closePhotoModal();
                    this.showSuccess('Student photo updated successfully');
                } catch (error) {
                    console.error('Error saving photo:', error);
                    this.showError('Failed to save photo to database');
                } finally {
                    this.hideLoading();
                }
            };
            reader.onerror = () => {
                this.showError('Error reading photo file');
                this.hideLoading();
            };
            reader.readAsDataURL(fileInput.files[0]);

        } catch (error) {
            console.error('Error processing photo:', error);
            this.showError('Error processing photo: ' + error.message);
            this.hideLoading();
        }
    }

    loadCurrentPhoto() {
        const currentPhoto = document.getElementById('currentPhoto');
        const photo = this.currentStudent.photo_url || this.currentStudent.photoUrl;
        
        if (photo) {
            currentPhoto.innerHTML = `<img src="${photo}" alt="Student Photo" class="w-full h-full object-cover rounded-lg">`;
        } else {
            currentPhoto.innerHTML = '<i class="fas fa-user text-gray-400 text-2xl"></i>';
        }
    }

    async saveChanges() {
        try {
            this.showLoading();

            // Validate form
            if (!this.validateForm()) {
                this.hideLoading();
                return;
            }

            // Get updated data
            const updatedStudentData = this.getUpdatedStudentData();
            const updatedParentData = this.getUpdatedParentData();

            // Update in database (without photo - photo is handled separately by savePhoto)
            await this.updateStudentInDatabase(updatedStudentData);
            await this.updateParentInDatabase(updatedParentData);

            // Refresh current data in our local arrays
            Object.assign(this.currentStudent, updatedStudentData);
            Object.assign(this.currentParent, updatedParentData);

            // Update the main arrays
            const studentIndex = this.allStudents.findIndex(s => s.id === this.currentStudent.id);
            if (studentIndex !== -1) {
                this.allStudents[studentIndex] = { ...this.allStudents[studentIndex], ...updatedStudentData };
            }

            const parentIndex = this.allParents.findIndex(p => p.id === this.currentParent.id);
            if (parentIndex !== -1) {
                this.allParents[parentIndex] = { ...this.allParents[parentIndex], ...updatedParentData };
            }

            // Show success message
            this.showSuccess('Student and parent information updated successfully (photo changes not saved)');
            
            // Update ID preview
            this.updateIDPreview();
            
            this.hideLoading();
        } catch (error) {
            console.error('Error saving changes:', error);
            this.showError('Error saving changes: ' + error.message);
            this.hideLoading();
        }
    }

    validateForm() {
        const studentName = document.getElementById('studentName').value.trim();
        const studentLRN = document.getElementById('studentLRN').value.trim();
        const parentName = document.getElementById('parentName').value.trim();
        const parentPhone = document.getElementById('parentPhone').value.trim();

        if (!studentName) {
            this.showError('Student name is required');
            return false;
        }

        if (!studentLRN) {
            this.showError('LRN is required');
            return false;
        }

        if (!/^\d{12}$/.test(studentLRN)) {
            this.showError('LRN must be exactly 12 digits');
            return false;
        }

        if (!parentName) {
            this.showError('Parent name is required');
            return false;
        }

        if (!parentPhone) {
            this.showError('Parent phone number is required');
            return false;
        }

        if (!/^09[0-9]{9}$/.test(parentPhone)) {
            this.showError('Please enter a valid Philippine phone number (09XXXXXXXXX)');
            return false;
        }

        return true;
    }

    getUpdatedStudentData() {
        const grade = document.getElementById('studentGrade').value;
        const strand = (grade === 'Grade 11' || grade === 'Grade 12') ? 
            document.getElementById('studentStrand').value : null;
        const fullName = document.getElementById('studentName').value.trim();

        return {
            full_name: fullName,
            name: fullName, // Backward compatibility
            lrn: document.getElementById('studentLRN').value.trim(),
            strand: strand,
            class_id: document.getElementById('studentClass').value,
            updated_at: new Date(),
            updated_by: this.currentUser.id
            // Note: photo_url is intentionally excluded since we're not storing it yet
        };
    }

    getUpdatedParentData() {
        return {
            name: document.getElementById('parentName').value.trim(),
            phone: document.getElementById('parentPhone').value.trim(),
            email: document.getElementById('parentEmail').value.trim() || null,
            address: document.getElementById('parentAddress').value.trim(),
            relationship: document.getElementById('parentRelationship').value,
            updated_at: new Date(),
            updated_by: this.currentUser.id
        };
    }

    async updateStudentInDatabase(studentData) {
        try {
            await EducareTrack.db.collection('students').doc(this.currentStudent.id).update(studentData);
            console.log('Student updated:', this.currentStudent.id);
        } catch (error) {
            console.error('Error updating student:', error);
            throw error;
        }
    }

    async updateParentInDatabase(parentData) {
        try {
            const parentId = this.currentParent.id;
            
            // 1. Update Profile (name, email, phone)
            const profileData = {};
            if (parentData.name) profileData.full_name = parentData.name;
            if (parentData.email !== undefined) profileData.email = parentData.email;
            if (parentData.phone) profileData.phone = parentData.phone;
            
            if (Object.keys(profileData).length > 0) {
                 await EducareTrack.db.collection('profiles').doc(parentId).update(profileData);
            }

            // 2. Update Parent Details (address)
            const parentDetails = {};
            if (parentData.address) parentDetails.address = parentData.address;
            
            if (Object.keys(parentDetails).length > 0) {
                 await EducareTrack.db.collection('parents').doc(parentId).set(parentDetails); // Use set to upsert
            }
            
            // 3. Update Relationship (parent_students)
            if (parentData.relationship && this.currentStudent) {
                const { error } = await window.supabaseClient
                    .from('parent_students')
                    .upsert({ 
                        parent_id: parentId, 
                        student_id: this.currentStudent.id,
                        relationship: parentData.relationship
                    }, { onConflict: 'parent_id, student_id' });
                    
                if (error) throw error;
            }

            console.log('Parent updated:', parentId);
        } catch (error) {
            console.error('Error updating parent:', error);
            throw error;
        }
    }

    async reissueID() {
        try {
            const ok = window.EducareTrack && typeof window.EducareTrack.confirmAction === 'function'
                ? await window.EducareTrack.confirmAction('Are you sure you want to reissue this ID? This will generate a new student ID.', 'Reissue ID', 'Reissue', 'Cancel')
                : true;
            if (!ok) return;

            this.showLoading();

            // Generate new student ID
            const newStudentId = this.generateNewStudentId();
            
            // Update student record
            await EducareTrack.db.collection('students').doc(this.currentStudent.id).update({
                studentId: newStudentId,
                qrCode: newStudentId,
                idReissued: true,
                previousId: this.getStudentIdentifier(this.currentStudent),
                reissuedAt: new Date(),
                reissuedBy: this.currentUser.id
            });

            // Update current student data
            this.currentStudent.studentId = newStudentId;
            this.currentStudent.qrCode = newStudentId;

            // Update the main array
            const studentIndex = this.allStudents.findIndex(s => s.id === this.currentStudent.id);
            if (studentIndex !== -1) {
                this.allStudents[studentIndex].studentId = newStudentId;
                this.allStudents[studentIndex].qrCode = newStudentId;
            }

            // Show success message
            this.showSuccess('ID reissued successfully. New ID: ' + newStudentId);
            
            // Update ID preview
            this.updateIDPreview();
            
            this.hideLoading();
        } catch (error) {
            console.error('Error reissuing ID:', error);
            this.showError('Error reissuing ID: ' + error.message);
            this.hideLoading();
        }
    }

    generateNewStudentId() {
        const year = new Date().getFullYear();
        const lastFourLRN = this.currentStudent.lrn ? this.currentStudent.lrn.slice(-4) : '0000';
        const randomNum = Math.floor(1000 + Math.random() * 9000); // Random 4-digit number
        
        return `EDU-${year}-${lastFourLRN}-${randomNum}`;
    }

    updateIDPreview() {
        // Update preview student info
        document.getElementById('previewStudentName').textContent = document.getElementById('studentName').value;
        document.getElementById('previewStudentGrade').textContent = document.getElementById('studentGrade').value;
        document.getElementById('previewStudentLRN').textContent = `LRN: ${document.getElementById('studentLRN').value}`;

        // Update preview photo
        const photo = this.currentStudent.photo_url || this.currentStudent.photoUrl;
        if (photo) {
            document.getElementById('previewStudentPhoto').innerHTML = `<img src="${photo}" alt="Student Photo" class="w-full h-full rounded-full object-cover">`;
        }

        // Update ID Preview elements (FRONT)
        document.getElementById('idStudentName').textContent = document.getElementById('studentName').value;
        document.getElementById('idAddress').textContent = document.getElementById('parentAddress').value;
        document.getElementById('idGradeLevel').textContent = `${document.getElementById('studentGrade').value}${document.getElementById('studentStrand').value ? ` - ${document.getElementById('studentStrand').value}` : ''}`;
        const idLrnEl = document.getElementById('idLRN');
        if (idLrnEl) { idLrnEl.textContent = document.getElementById('studentLRN').value; }

        // Update ID Preview elements (BACK)
        document.getElementById('idStudentId').textContent = this.getStudentIdentifier(this.currentStudent);
        document.getElementById('idParentName').innerHTML = `<strong>Parent:</strong> ${document.getElementById('parentName').value}`;
        document.getElementById('idParentPhone').innerHTML = `<strong>Contact:</strong> ${document.getElementById('parentPhone').value}`;

        // Update photo in ID card
        if (photo) {
            document.getElementById('idPreviewImage').src = photo;
            document.getElementById('idPreviewImage').classList.remove('hidden');
            document.getElementById('idPlaceholder').classList.add('hidden');
        } else {
            document.getElementById('idPreviewImage').classList.add('hidden');
            document.getElementById('idPlaceholder').classList.remove('hidden');
        }

        // Generate QR Code
        this.generateQRCode('qrCode', this.getStudentIdentifier(this.currentStudent));

        // Update print version
        document.getElementById('printStudentName').textContent = document.getElementById('studentName').value;
        document.getElementById('printGradeLevel').textContent = `${document.getElementById('studentGrade').value}${document.getElementById('studentStrand').value ? ` - ${document.getElementById('studentStrand').value}` : ''}`;
        document.getElementById('printLRN').textContent = document.getElementById('studentLRN').value;
        document.getElementById('printStudentId').textContent = this.getStudentIdentifier(this.currentStudent);
        document.getElementById('printParentName').innerHTML = `<strong>Parent:</strong> ${document.getElementById('parentName').value}`;
        document.getElementById('printParentPhone').innerHTML = `<strong>Contact:</strong> ${document.getElementById('parentPhone').value}`;
        
        if (photo) {
            document.getElementById('printPreviewImage').src = photo;
            document.getElementById('printPreviewImage').classList.remove('hidden');
            document.getElementById('printPlaceholder').classList.add('hidden');
        } else {
            document.getElementById('printPreviewImage').classList.add('hidden');
            document.getElementById('printPlaceholder').classList.remove('hidden');
        }
        
        this.generateQRCode('printQrCode', this.getStudentIdentifier(this.currentStudent));

        // Show preview section
        document.getElementById('idPreviewSection').classList.remove('hidden');
    }

    generateQRCode(containerId, studentId) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        
        try {
            // Method 1: Try using qrcode-generator library
            if (typeof qrcode !== 'undefined') {
                const qr = qrcode(0, 'M');
                qr.addData(studentId);
                qr.make();
                
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const size = 120;
                canvas.width = size;
                canvas.height = size;
                
                // Get QR code module count
                const moduleCount = qr.getModuleCount();
                const tileSize = size / moduleCount;
                
                // Draw white background
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, size, size);
                
                // Draw QR code modules
                ctx.fillStyle = '#000000';
                for (let row = 0; row < moduleCount; row++) {
                    for (let col = 0; col < moduleCount; col++) {
                        if (qr.isDark(row, col)) {
                            ctx.fillRect(col * tileSize, row * tileSize, tileSize, tileSize);
                        }
                    }
                }
                
                container.appendChild(canvas);
                return;
            }
            
            // Method 2: Fallback to simple canvas-based QR-like pattern
            this.createSimpleQRCode(studentId, container);
            
        } catch (error) {
            console.error('QR Code generation failed:', error);
            // Method 3: Ultimate fallback - text display
            this.showFallbackQR(studentId, container);
        }
    }

    createSimpleQRCode(studentId, container) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const size = 120;
        
        canvas.width = size;
        canvas.height = size;
        
        // Create a simple pattern based on the student ID
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
        
        ctx.fillStyle = '#000000';
        
        // Use student ID to generate deterministic pattern
        let hash = 0;
        for (let i = 0; i < studentId.length; i++) {
            hash = studentId.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        // Simple QR-like pattern
        const moduleSize = 4;
        const modules = Math.floor(size / moduleSize);
        
        for (let x = 0; x < modules; x++) {
            for (let y = 0; y < modules; y++) {
                // Use hash to determine if module should be dark
                const seed = hash + x + y * modules;
                const randomValue = Math.sin(seed) * 10000;
                const normalized = randomValue - Math.floor(randomValue);
                
                if (normalized > 0.5) {
                    ctx.fillRect(x * moduleSize, y * moduleSize, moduleSize, moduleSize);
                }
            }
        }
        
        // Add position markers (like real QR codes)
        ctx.fillRect(2, 2, 5 * moduleSize, 5 * moduleSize);
        ctx.fillRect(modules - 7, 2, 5 * moduleSize, 5 * moduleSize);
        ctx.fillRect(2, modules - 7, 5 * moduleSize, 5 * moduleSize);
        
        container.appendChild(canvas);
    }

    showFallbackQR(studentId, container) {
        container.innerHTML = `
            <div class="text-center">
                <div class="bg-white p-3 rounded-lg inline-block border">
                    <i class="fas fa-qrcode text-4xl text-gray-700 mb-2 block"></i>
                    <p class="text-xs font-mono text-gray-600 break-all max-w-[100px]">${studentId}</p>
                </div>
            </div>
        `;
    }

    printID() {
        // Update print version with current data
        document.getElementById('printStudentName').textContent = document.getElementById('studentName').value;
        document.getElementById('printGradeLevel').textContent = 
            `${document.getElementById('studentGrade').value}${document.getElementById('studentStrand').value ? ` - ${document.getElementById('studentStrand').value}` : ''}`;
        document.getElementById('printAddress').textContent = document.getElementById('parentAddress').value;
        const printLrnEl = document.getElementById('printLRN');
        if (printLrnEl) { printLrnEl.textContent = document.getElementById('studentLRN').value; }
        document.getElementById('printStudentId').textContent = this.currentStudent.studentId;
        document.getElementById('printParentName').innerHTML = `<strong>Parent:</strong> ${document.getElementById('parentName').value}`;
        document.getElementById('printParentPhone').innerHTML = `<strong>Contact:</strong> ${document.getElementById('parentPhone').value}`;
        
        // Show the print version and hide the non-print elements
        document.getElementById('printIDCard').classList.remove('hidden');
        
        // Print the ID card
        window.print();
        
        // Hide the print version after printing
        setTimeout(() => {
            document.getElementById('printIDCard').classList.add('hidden');
        }, 500);
    }

    async saveAsPNG() {
        try {
            this.showLoading();
            
            // Capture both front and back of ID card
            const idCardContainer = document.querySelector('#idPreviewSection .bg-white.border-2.border-blue-200');
            
            const canvas = await html2canvas(idCardContainer, {
                scale: 2,
                backgroundColor: '#ffffff'
            });
            
            // Convert canvas to data URL
            const imageData = canvas.toDataURL('image/png');
            
            // Create a download link
            const link = document.createElement('a');
            link.download = `student-id-${this.currentStudent.studentId}.png`;
            link.href = imageData;
            link.click();
            
            this.hideLoading();
            this.showSuccess('ID saved as PNG successfully');
        } catch (error) {
            console.error('Error saving as PNG:', error);
            this.showError('Error saving as PNG: ' + error.message);
            this.hideLoading();
        }
    }

    async saveAsPDF() {
        try {
            this.showLoading();
            
            // Capture both front and back of ID card
            const idCardContainer = document.querySelector('#idPreviewSection .bg-white.border-2.border-blue-200');
            
            const canvas = await html2canvas(idCardContainer, {
                scale: 2,
                backgroundColor: '#ffffff'
            });
            
            // Convert canvas to data URL
            const imageData = canvas.toDataURL('image/png');
            
            // Create PDF using jsPDF
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });
            
            // Add image to PDF
            const imgProps = pdf.getImageProperties(imageData);
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
            
            pdf.addImage(imageData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            
            // Save the PDF
            pdf.save(`student-id-${this.currentStudent.studentId}.pdf`);
            
            this.hideLoading();
            this.showSuccess('ID saved as PDF successfully');
        } catch (error) {
            console.error('Error saving as PDF:', error);
            this.showError('Error saving as PDF: ' + error.message);
            this.hideLoading();
        }
    }

    closePreview() {
        document.getElementById('idPreviewSection').classList.add('hidden');
    }

    cancelEdit() {
        window.EducareTrack && typeof window.EducareTrack.confirmAction === 'function'
            ? window.EducareTrack.confirmAction('Are you sure you want to cancel? Any unsaved changes will be lost.', 'Cancel Edit', 'Discard', 'Back').then(ok => { if (ok) {
                document.getElementById('studentInfoForm').classList.add('hidden');
                document.getElementById('searchResults').classList.remove('hidden');
                this.clearForm();
            } })
            : (function(){
                document.getElementById('studentInfoForm').classList.add('hidden');
                document.getElementById('searchResults').classList.remove('hidden');
                this.clearForm();
            }).call(this);
    }

    clearForm() {
        document.getElementById('studentInfoForm').reset();
        document.getElementById('strandField').classList.add('hidden');
        document.getElementById('studentClass').innerHTML = '<option value="">Select Class</option>';
        document.getElementById('currentPhoto').innerHTML = '<i class="fas fa-user text-gray-400 text-2xl"></i>';
        
        this.currentStudent = null;
        this.currentParent = null;
        this.selectedStudentId = null;
    }

    clearSearch() {
        document.getElementById('searchInput').value = '';
        document.getElementById('gradeFilter').value = '';
        document.getElementById('strandFilter').value = '';
        document.getElementById('searchResults').classList.add('hidden');
        document.getElementById('resultsList').innerHTML = '';
    }

    showSuccess(message) {
        document.getElementById('successMessage').textContent = message;
        document.getElementById('successModal').classList.remove('hidden');
    }

    showError(message) {
        if (window.EducareTrack && typeof window.EducareTrack.showNormalNotification === 'function') {
            window.EducareTrack.showNormalNotification({ title: 'Error', message: message });
        }
    }

    closeSuccessModal() {
        document.getElementById('successModal').classList.add('hidden');
    }

    closeAnyOpenModal() {
        const modals = document.querySelectorAll('.fixed.inset-0');
        modals.forEach(modal => {
            if (!modal.classList.contains('hidden')) {
                modal.classList.add('hidden');
            }
        });
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
}

// Initialize ID Management when page loads
document.addEventListener('DOMContentLoaded', function() {
    window.idManagement = new IDManagement();
});
