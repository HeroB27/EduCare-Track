class ParentExcuse {
    constructor() {
        this.currentUser = null;
        this.children = [];
        this.excuseLetters = [];
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
            
            // Verify user is a parent
            if (this.currentUser.role !== 'parent') {
                if (window.EducareTrack && typeof window.EducareTrack.showNormalNotification === 'function') {
                    window.EducareTrack.showNormalNotification({ title: 'Access Denied', message: 'Parent role required.', type: 'error' });
                }
                window.location.href = '../index.html';
                return;
            }

            this.updateUI();
            await this.loadChildren();
            await this.loadExcuseLetters();
            this.initEventListeners();
            
            this.hideLoading();
        } catch (error) {
            console.error('Parent excuse initialization failed:', error);
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

    async loadChildren() {
        try {
            this.children = await EducareTrack.getStudentsByParent(this.currentUser.id);
            this.populateChildSelect();
            
            // Load notification count
            await this.loadNotificationCount();

        } catch (error) {
            console.error('Error loading children:', error);
        }

        
    }

    // Add this method to debug student data
debugStudentData() {
    console.log('=== DEBUG: Student Data ===');
    this.children.forEach((child, index) => {
        console.log(`Student ${index + 1}:`, {
            id: child.id,
            name: child.name,
            grade: child.grade,
            level: child.level,
            classId: child.classId,
            className: child.className
        });
    });
    
    // Test the first student to see if they have level data
    if (this.children.length > 0) {
        const testStudent = this.children[0];
        console.log('First student level check:', {
            hasLevel: 'level' in testStudent,
            levelValue: testStudent.level,
            levelType: typeof testStudent.level
        });
    }
}

// Call this after loadChildren to check the data
async loadChildren() {
    try {
        this.children = await EducareTrack.getStudentsByParent(this.currentUser.id);
        this.populateChildSelect();
        
        // Debug: Check student data
        this.debugStudentData();
        
        // Load notification count
        await this.loadNotificationCount();

    } catch (error) {
        console.error('Error loading children:', error);
    }
}

    populateChildSelect() {
        const select = document.getElementById('excuseChild');
        if (!select) {
            console.error('excuseChild element not found');
            return;
        }
        
        // Clear existing options except the first one
        while (select.children.length > 1) {
            select.removeChild(select.lastChild);
        }
        
        // Add children options
        this.children.forEach(child => {
            const option = document.createElement('option');
            option.value = child.id;
            option.textContent = `${child.name} - ${child.grade} ${child.level}`;
            select.appendChild(option);
        });
    }

    async loadExcuseLetters() {
        try {
            // Get excuse letters for all children
            this.excuseLetters = [];
            
            for (const child of this.children) {
                const childExcuses = await this.getChildExcuseLetters(child.id);
                this.excuseLetters = this.excuseLetters.concat(childExcuses);
            }
            
            // Sort by submitted date (newest first)
            this.excuseLetters.sort((a, b) => new Date(b.submittedAt?.toDate()) - new Date(a.submittedAt?.toDate()));
            
            this.updateStatistics();
            this.updateExcuseTable();

        } catch (error) {
            console.error('Error loading excuse letters:', error);
        }
    }

    async getChildExcuseLetters(childId) {
        try {
            const snapshot = await EducareTrack.db.collection('excuseLetters')
                .where('studentId', '==', childId)
                .orderBy('submittedAt', 'desc')
                .get();

            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error(`Error getting excuse letters for child ${childId}:`, error);
            return [];
        }
    }

    updateStatistics() {
        const totalPending = this.excuseLetters.filter(letter => letter.status === 'pending').length;
        const totalApproved = this.excuseLetters.filter(letter => letter.status === 'approved').length;
        const totalRejected = this.excuseLetters.filter(letter => letter.status === 'rejected').length;
        const totalSubmitted = this.excuseLetters.length;

        document.getElementById('totalPending').textContent = totalPending;
        document.getElementById('totalApproved').textContent = totalApproved;
        document.getElementById('totalRejected').textContent = totalRejected;
        document.getElementById('totalSubmitted').textContent = totalSubmitted;
    }

    updateExcuseTable() {
        const container = document.getElementById('excuseTableBody');
        if (!container) {
            console.error('excuseTableBody element not found');
            return;
        }
        
        if (this.excuseLetters.length === 0) {
            container.innerHTML = `
                <tr>
                    <td colspan="7" class="px-6 py-12 text-center text-gray-500">
                        <i class="fas fa-file-medical text-4xl mb-3"></i>
                        <p class="text-lg font-medium">No excuse letters submitted yet</p>
                        <p class="text-sm mb-4">Submit your first excuse letter to get started</p>
                        <button onclick="parentExcuse.openNewExcuseModal()" 
                                class="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors">
                            <i class="fas fa-plus mr-2"></i>Submit First Excuse Letter
                        </button>
                    </td>
                </tr>
            `;
            return;
        }

        container.innerHTML = this.excuseLetters.map(letter => {
            const child = this.children.find(c => c.id === letter.studentId);
            const submittedDate = letter.submittedAt?.toDate();
            
            // Format dates for display
            const datesDisplay = letter.dates && letter.dates.length > 0 ? 
                letter.dates.map(date => this.formatDate(new Date(date))).join(', ') : 
                (letter.absenceDate ? this.formatDate(letter.absenceDate.toDate()) : 'No dates specified');
            
            const shortDates = datesDisplay.length > 50 ? 
                datesDisplay.substring(0, 50) + '...' : datesDisplay;
            
            const shortReason = letter.reason && letter.reason.length > 50 ? 
                letter.reason.substring(0, 50) + '...' : letter.reason;

            return `
                <tr class="hover:bg-gray-50">
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="text-sm text-gray-900">${this.formatDate(submittedDate)}</div>
                        <div class="text-sm text-gray-500">${this.formatTime(submittedDate)}</div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="flex items-center">
                            <div class="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center mr-3">
                                <span class="text-green-600 font-semibold text-xs">${child ? child.name.split(' ').map(n => n[0]).join('').substring(0, 2) : '??'}</span>
                            </div>
                            <div class="text-sm font-medium text-gray-900">${child ? child.name : 'Unknown'}</div>
                        </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <span class="px-2 py-1 rounded-full text-xs font-medium ${this.getTypeColor(letter.type)}">
                            ${this.getExcuseTypeText(letter.type)}
                        </span>
                    </td>
                    <td class="px-6 py-4">
                        <div class="text-sm text-gray-900" title="${datesDisplay}">${shortDates}</div>
                    </td>
                    <td class="px-6 py-4">
                        <div class="text-sm text-gray-900">${shortReason}</div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <span class="px-2 py-1 rounded-full text-xs font-medium ${this.getStatusColor(letter.status)}">
                            ${letter.status ? letter.status.charAt(0).toUpperCase() + letter.status.slice(1) : 'Unknown'}
                        </span>
                        ${letter.reviewedBy && letter.status !== 'pending' ? `
                            <div class="text-xs text-gray-500 mt-1">By ${letter.reviewedByName || 'Staff'}</div>
                        ` : ''}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button onclick="parentExcuse.viewExcuseDetails('${letter.id}')" 
                                class="text-green-600 hover:text-green-900 mr-3">
                            <i class="fas fa-eye mr-1"></i>View
                        </button>
                        ${letter.status === 'pending' ? `
                        <button onclick="parentExcuse.cancelExcuseLetter('${letter.id}')" 
                                class="text-red-600 hover:text-red-900">
                            <i class="fas fa-times mr-1"></i>Cancel
                        </button>
                        ` : ''}
                    </td>
                </tr>
            `;
        }).join('');
    }

    getStatusColor(status) {
        const colors = {
            'pending': 'status-pending',
            'approved': 'status-approved',
            'rejected': 'status-rejected',
            'cancelled': 'bg-gray-100 text-gray-800'
        };
        return colors[status] || 'status-pending';
    }

    getTypeColor(type) {
        const colors = {
            'absence': 'bg-blue-100 text-blue-800',
            'tardy': 'bg-yellow-100 text-yellow-800',
            'early_dismissal': 'bg-purple-100 text-purple-800',
            'other': 'bg-gray-100 text-gray-800'
        };
        return colors[type] || 'bg-gray-100 text-gray-800';
    }

    getExcuseTypeText(type) {
        const texts = {
            'absence': 'Absence',
            'tardy': 'Tardy',
            'early_dismissal': 'Early Dismissal',
            'other': 'Other'
        };
        return texts[type] || 'Unknown';
    }

    openNewExcuseModal() {
        const modal = document.getElementById('newExcuseModal');
        if (!modal) {
            console.error('newExcuseModal element not found');
            return;
        }
        modal.classList.remove('hidden');
        
        // Reset form
        const form = document.getElementById('excuseLetterForm');
        if (form) {
            form.reset();
        }
        
        // Reset date fields
        const dateContainer = document.getElementById('dateRangeContainer');
        if (dateContainer) {
            dateContainer.innerHTML = `
                <div class="flex items-center space-x-2">
                    <input type="date" id="absenceDate" class="flex-1 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500">
                    <button type="button" onclick="parentExcuse.addDateField()" class="bg-gray-200 text-gray-700 px-3 py-2 rounded-md hover:bg-gray-300">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
            `;
        }
    }

    closeNewExcuseModal() {
        const modal = document.getElementById('newExcuseModal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    addDateField() {
        const container = document.getElementById('dateRangeContainer');
        if (!container) {
            console.error('dateRangeContainer element not found');
            return;
        }
        const newField = document.createElement('div');
        newField.className = 'flex items-center space-x-2';
        newField.innerHTML = `
            <input type="date" class="flex-1 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500">
            <button type="button" onclick="this.parentElement.remove()" class="bg-red-200 text-red-700 px-3 py-2 rounded-md hover:bg-red-300">
                <i class="fas fa-times"></i>
            </button>
        `;
        container.appendChild(newField);
    }

    async submitExcuseLetter() {
    try {
        // Get form elements with null checks
        const childSelect = document.getElementById('excuseChild');
        const typeSelect = document.getElementById('excuseType');
        const reasonTextarea = document.getElementById('excuseReason');
        const notesTextarea = document.getElementById('excuseNotes');

        if (!childSelect || !typeSelect || !reasonTextarea) {
            throw new Error('Form elements not found. Please refresh the page and try again.');
        }

        const childId = childSelect.value;
        const type = typeSelect.value;
        const reason = reasonTextarea.value;
        const notes = notesTextarea ? notesTextarea.value : '';
        
        // Get all date fields
        const dateContainer = document.getElementById('dateRangeContainer');
        const dateInputs = dateContainer ? dateContainer.querySelectorAll('input[type="date"]') : [];
        const dates = Array.from(dateInputs)
            .map(input => input.value)
            .filter(date => date !== '');

        // Validate form
        if (!childId) {
            if (window.EducareTrack && typeof window.EducareTrack.showNormalNotification === 'function') {
                window.EducareTrack.showNormalNotification({ title: 'Missing Information', message: 'Please select a child', type: 'warning' });
            }
            return;
        }

        if (!type) {
            if (window.EducareTrack && typeof window.EducareTrack.showNormalNotification === 'function') {
                window.EducareTrack.showNormalNotification({ title: 'Missing Information', message: 'Please select an excuse type', type: 'warning' });
            }
            return;
        }
        
        if (dates.length === 0) {
            if (window.EducareTrack && typeof window.EducareTrack.showNormalNotification === 'function') {
                window.EducareTrack.showNormalNotification({ title: 'Missing Dates', message: 'Please add at least one absence date', type: 'warning' });
            }
            return;
        }
        
        if (!reason) {
            if (window.EducareTrack && typeof window.EducareTrack.showNormalNotification === 'function') {
                window.EducareTrack.showNormalNotification({ title: 'Missing Reason', message: 'Please provide a reason for absence', type: 'warning' });
            }
            return;
        }

        // Show loading
        const submitBtn = document.querySelector('#newExcuseModal button[onclick="parentExcuse.submitExcuseLetter()"]');
        if (submitBtn) {
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Submitting...';
            submitBtn.disabled = true;
        }

        // Get student data to determine classId
        const student = this.children.find(c => c.id === childId);
        if (!student) {
            throw new Error('Selected child not found');
        }

        // DEBUG: Log student data to check classId
        console.log('Student data:', student);
        
        // Get teacher information for the class to ensure proper assignment
        let teacherClassId = student.classId;
        let className = student.className || `Grade ${student.grade} - ${student.level}`;
        
        // If student doesn't have classId, try to find the teacher's class
        if (!teacherClassId) {
            console.warn('Student has no classId, attempting to find teacher class...');
            // Try to get the teacher for this grade/level
            const teachersSnapshot = await EducareTrack.db.collection('users')
                .where('role', '==', 'teacher')
                .where('isActive', '==', true)
                .get();
            
            const teachers = teachersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const matchingTeacher = teachers.find(t => 
                t.grade === student.grade && t.level === student.level
            );
            
            if (matchingTeacher) {
                teacherClassId = matchingTeacher.classId;
                className = matchingTeacher.className || className;
                console.log('Found matching teacher class:', teacherClassId);
            }
        }

        // Handle optional attachment upload
        let attachments = [];
        try {
            const attachmentInput = document.getElementById('excuseAttachment');
            const file = attachmentInput && attachmentInput.files ? attachmentInput.files[0] : null;
            if (file) {
                const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
                if (!allowedTypes.includes(file.type)) {
                    if (window.EducareTrack && typeof window.EducareTrack.showNormalNotification === 'function') {
                        window.EducareTrack.showNormalNotification({ title: 'Invalid Attachment', message: 'Please upload a JPG or PNG image.', type: 'warning' });
                    }
                } else if (file.size > 5 * 1024 * 1024) {
                    if (window.EducareTrack && typeof window.EducareTrack.showNormalNotification === 'function') {
                        window.EducareTrack.showNormalNotification({ title: 'File Too Large', message: 'Maximum allowed is 5MB.', type: 'warning' });
                    }
                } else {
                    if (!EducareTrack.storage) {
                        throw new Error('File upload not available. Firebase Storage not initialized.');
                    }
                    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                    const path = `excuse_letters/${childId}/${Date.now()}_${sanitizedName}`;
                    const storageRef = EducareTrack.storage.ref().child(path);
                    const snapshot = await storageRef.put(file);
                    const downloadURL = await snapshot.ref.getDownloadURL();
                    attachments.push({
                        url: downloadURL,
                        name: file.name,
                        type: file.type,
                        size: file.size
                    });
                }
            }
        } catch (uploadError) {
            console.error('Attachment upload failed:', uploadError);
            this.showNotification('Attachment upload failed: ' + uploadError.message, 'error');
        }

        // FIX: Ensure all required fields have values, provide defaults for undefined fields
        const excuseData = {
            studentId: childId,
            parentId: this.currentUser.id,
            parentName: this.currentUser.name,
            classId: teacherClassId, // Use the determined classId
            type: type,
            reason: reason,
            notes: notes || '',
            // Both single date and array for compatibility
            absenceDate: firebase.firestore.Timestamp.fromDate(new Date(dates[0])),
            dates: dates,
            attachments: attachments,
            status: 'pending',
            submittedAt: new Date().toISOString(),
            // Additional synchronized fields - WITH FIXES FOR UNDEFINED VALUES
            studentName: student.name || 'Unknown Student',
            className: className,
            grade: student.grade || 'Unknown Grade',
            level: student.level || 'Unknown Level' // FIX: Provide default value for level
        };

        // DEBUG: Log the excuse data before saving
        console.log('Submitting excuse data:', excuseData);

        // Validate all fields to ensure no undefined values
        Object.keys(excuseData).forEach(key => {
            if (excuseData[key] === undefined) {
                console.warn(`Field ${key} is undefined, setting to default value`);
                excuseData[key] = ''; // Set to empty string or appropriate default
            }
        });

        const result = await EducareTrack.db.collection('excuseLetters').add(excuseData);
        console.log('Excuse letter saved with ID:', result.id);

        // Success
        this.showNotification('Excuse letter submitted successfully!', 'success');
        this.closeNewExcuseModal();
        
        // Reload data
        await this.loadExcuseLetters();

    } catch (error) {
        console.error('Error submitting excuse letter:', error);
        this.showNotification('Error submitting excuse letter: ' + error.message, 'error');
        
        // Reset button
        const submitBtn = document.querySelector('#newExcuseModal button[onclick="parentExcuse.submitExcuseLetter()"]');
        if (submitBtn) {
            submitBtn.innerHTML = '<i class="fas fa-paper-plane mr-2"></i>Submit Excuse Letter';
            submitBtn.disabled = false;
        }
    }
}



    async viewExcuseDetails(excuseId) {
        try {
            const letter = this.excuseLetters.find(l => l.id === excuseId);
            if (!letter) return;

            const modal = document.getElementById('excuseDetailsModal');
            const content = document.getElementById('excuseDetailsContent');

            if (!modal || !content) {
                console.error('Modal elements not found');
                return;
            }

            const child = this.children.find(c => c.id === letter.studentId);
            const submittedDate = letter.submittedAt?.toDate();
            const reviewedDate = letter.reviewedAt?.toDate();

            // Use absenceDate (teacher model) or dates[0] (parent model)
            const primaryDate = letter.absenceDate ? 
                new Date(letter.absenceDate.toDate ? letter.absenceDate.toDate() : letter.absenceDate) : 
                (letter.dates && letter.dates.length > 0 ? new Date(letter.dates[0]) : null);

            content.innerHTML = `
                <div class="space-y-6">
                    <!-- Header -->
                    <div class="flex items-center justify-between">
                        <div class="flex items-center">
                            <div class="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mr-4">
                                <i class="fas fa-file-medical text-green-600"></i>
                            </div>
                            <div>
                                <h3 class="text-xl font-bold text-gray-800">Excuse Letter</h3>
                                <p class="text-gray-600">Submitted on ${this.formatDate(submittedDate)}</p>
                            </div>
                        </div>
                        <span class="px-3 py-1 rounded-full text-sm font-medium ${this.getStatusColor(letter.status)}">
                            ${letter.status ? letter.status.charAt(0).toUpperCase() + letter.status.slice(1) : 'Unknown'}
                        </span>
                    </div>

                    <!-- Student Information -->
                    <div class="bg-gray-50 rounded-lg p-4">
                        <h4 class="font-semibold text-gray-700 mb-2">Student Information</h4>
                        <div class="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span class="text-gray-600">Name:</span>
                                <p class="font-medium">${child ? child.name : 'Unknown'}</p>
                            </div>
                            <div>
                                <span class="text-gray-600">Grade & Level:</span>
                                <p class="font-medium">${child ? `${child.grade} • ${child.level}` : 'N/A'}</p>
                            </div>
                            <div>
                                <span class="text-gray-600">Class:</span>
                                <p class="font-medium">${letter.className || (child ? child.classId || 'Not assigned' : 'N/A')}</p>
                            </div>
                            <div>
                                <span class="text-gray-600">Excuse Type:</span>
                                <p class="font-medium">${this.getExcuseTypeText(letter.type)}</p>
                            </div>
                        </div>
                    </div>

                    <!-- Absence Details -->
                    <div class="bg-gray-50 rounded-lg p-4">
                        <h4 class="font-semibold text-gray-700 mb-2">Absence Details</h4>
                        <div class="space-y-3">
                            <div>
                                <span class="text-gray-600 block text-sm mb-1">Absence Date${letter.dates && letter.dates.length > 1 ? 's' : ''}:</span>
                                <div class="flex flex-wrap gap-2">
                                    ${primaryDate ? 
                                        `<span class="px-2 py-1 bg-white border rounded text-sm">${this.formatDate(primaryDate)}</span>` :
                                        '<span class="text-gray-500">No date specified</span>'
                                    }
                                    ${letter.dates && letter.dates.length > 1 ? 
                                        `<span class="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm">+${letter.dates.length - 1} more</span>` :
                                        ''
                                    }
                                </div>
                                ${letter.dates && letter.dates.length > 1 ? `
                                <details class="mt-2">
                                    <summary class="text-sm text-blue-600 cursor-pointer">Show all dates</summary>
                                    <div class="mt-2 space-y-1">
                                        ${letter.dates.map(date => `
                                            <div class="text-sm text-gray-700">${this.formatDate(new Date(date))}</div>
                                        `).join('')}
                                    </div>
                                </details>
                                ` : ''}
                            </div>
                            <div>
                                <span class="text-gray-600 block text-sm mb-1">Reason for Absence:</span>
                                <p class="text-gray-700 bg-white p-3 rounded border">${letter.reason || 'Not specified'}</p>
                            </div>
                            ${letter.notes ? `
                            <div>
                                <span class="text-gray-600 block text-sm mb-1">Additional Notes:</span>
                                <p class="text-gray-700 bg-white p-3 rounded border">${letter.notes}</p>
                            </div>
                            ` : ''}
                        </div>
                    </div>

                    <!-- Review Information -->
                    ${letter.status !== 'pending' ? `
                    <div class="bg-gray-50 rounded-lg p-4">
                        <h4 class="font-semibold text-gray-700 mb-2">Review Information</h4>
                        <div class="space-y-2 text-sm">
                            <div class="flex justify-between">
                                <span class="text-gray-600">Reviewed by:</span>
                                <span class="font-medium">${letter.reviewedByName || 'Staff'}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-600">Reviewed on:</span>
                                <span class="font-medium">${this.formatDate(reviewedDate)}</span>
                            </div>
                            ${letter.reviewerNotes ? `
                            <div>
                                <span class="text-gray-600 block mb-1">Reviewer Notes:</span>
                                <p class="text-gray-700 bg-white p-3 rounded border">${letter.reviewerNotes}</p>
                            </div>
                            ` : ''}
                        </div>
                    </div>
                    ` : ''}

                    <!-- Status Message -->
                    ${letter.status === 'pending' ? `
                    <div class="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                        <div class="flex items-center">
                            <i class="fas fa-clock text-yellow-600 mr-2"></i>
                            <span class="text-yellow-800 font-medium">Pending Review</span>
                        </div>
                        <p class="text-yellow-700 text-sm mt-1">
                            Your excuse letter is pending review by school administration. You will be notified once it's processed.
                        </p>
                    </div>
                    ` : letter.status === 'approved' ? `
                    <div class="bg-green-50 rounded-lg p-4 border border-green-200">
                        <div class="flex items-center">
                            <i class="fas fa-check-circle text-green-600 mr-2"></i>
                            <span class="text-green-800 font-medium">Approved</span>
                        </div>
                        <p class="text-green-700 text-sm mt-1">
                            Your excuse letter has been approved. The absence will be marked as excused.
                        </p>
                    </div>
                    ` : letter.status === 'rejected' ? `
                    <div class="bg-red-50 rounded-lg p-4 border border-red-200">
                        <div class="flex items-center">
                            <i class="fas fa-times-circle text-red-600 mr-2"></i>
                            <span class="text-red-800 font-medium">Rejected</span>
                        </div>
                        <p class="text-red-700 text-sm mt-1">
                            Your excuse letter has been rejected. ${letter.reviewerNotes ? `Reason: ${letter.reviewerNotes}` : 'Please contact the school administration for more information.'}
                        </p>
                    </div>
                    ` : letter.status === 'cancelled' ? `
                    <div class="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <div class="flex items-center">
                            <i class="fas fa-times text-gray-600 mr-2"></i>
                            <span class="text-gray-800 font-medium">Cancelled</span>
                        </div>
                        <p class="text-gray-700 text-sm mt-1">
                            This excuse letter has been cancelled.
                        </p>
                    </div>
                    ` : ''}
                </div>
            `;

            modal.classList.remove('hidden');

        } catch (error) {
            console.error('Error loading excuse details:', error);
            this.showNotification('Error loading excuse letter details', 'error');
        }
    }

    async cancelExcuseLetter(excuseId) {
        const ok = window.EducareTrack && typeof window.EducareTrack.confirmAction === 'function'
            ? await window.EducareTrack.confirmAction('Are you sure you want to cancel this excuse letter? This action cannot be undone.', 'Cancel Excuse Letter', 'Cancel', 'Back')
            : true;
        if (!ok) return;

        try {
            await EducareTrack.db.collection('excuseLetters').doc(excuseId).update({
                status: 'cancelled',
                cancelledAt: new Date().toISOString()
            });

            this.showNotification('Excuse letter cancelled successfully', 'success');
            await this.loadExcuseLetters();

        } catch (error) {
            console.error('Error cancelling excuse letter:', error);
            this.showNotification('Error cancelling excuse letter', 'error');
        }
    }

    closeExcuseDetailsModal() {
        const modal = document.getElementById('excuseDetailsModal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    // In parent-excuse.js - Update the loadNotificationCount method
async loadNotificationCount() {
    try {
        const count = await EducareTrack.getUnreadNotificationCount(this.currentUser.id);
        const badge = document.getElementById('notificationBadge');
        
        if (badge && count > 0) {
            badge.textContent = count;
            badge.classList.remove('hidden');
        } else if (badge) {
            badge.classList.add('hidden');
        }
    } catch (error) {
        console.error('Error loading notification count:', error);
        // Don't show error to user for notification count failures
        const badge = document.getElementById('notificationBadge');
        if (badge) {
            badge.classList.add('hidden');
        }
    }
}

    initEventListeners() {
        // Sidebar toggle
        const sidebarToggle = document.getElementById('sidebarToggle');
        if (sidebarToggle) {
            sidebarToggle.addEventListener('click', () => {
                this.toggleSidebar();
            });
        }

        // Logout
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                const ok = window.EducareTrack && typeof window.EducareTrack.confirmAction === 'function'
                    ? await window.EducareTrack.confirmAction('Are you sure you want to logout?', 'Confirm Logout', 'Logout', 'Cancel')
                    : true;
                if (ok) {
                    EducareTrack.logout();
                    window.location.href = '../index.html';
                }
            });
        }

        // New excuse button
        const newExcuseBtn = document.getElementById('newExcuseBtn');
        if (newExcuseBtn) {
            newExcuseBtn.addEventListener('click', () => {
                this.openNewExcuseModal();
            });
        }

        // Close modals on outside click
        const newExcuseModal = document.getElementById('newExcuseModal');
        if (newExcuseModal) {
            newExcuseModal.addEventListener('click', (e) => {
                if (e.target.id === 'newExcuseModal') {
                    this.closeNewExcuseModal();
                }
            });
        }

        const excuseDetailsModal = document.getElementById('excuseDetailsModal');
        if (excuseDetailsModal) {
            excuseDetailsModal.addEventListener('click', (e) => {
                if (e.target.id === 'excuseDetailsModal') {
                    this.closeExcuseDetailsModal();
                }
            });
        }

        // Escape key to close modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeNewExcuseModal();
                this.closeExcuseDetailsModal();
            }
        });

        // Listen for new notifications
        window.addEventListener('educareTrack:newNotifications', () => {
            this.loadNotificationCount();
        });
    }

    toggleSidebar() {
        const sidebar = document.querySelector('.sidebar');
        const mainContent = document.querySelector('.main-content');
        
        if (sidebar && mainContent) {
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
    }

    showLoading() {
        const spinner = document.getElementById('loadingSpinner');
        if (spinner) {
            spinner.classList.remove('hidden');
        }
    }

    hideLoading() {
        const spinner = document.getElementById('loadingSpinner');
        if (spinner) {
            spinner.classList.add('hidden');
        }
    }

    showNotification(message, type = 'info') {
        if (window.EducareTrack && typeof window.EducareTrack.showNormalNotification === 'function') {
            window.EducareTrack.showNormalNotification({ title: type === 'error' ? 'Error' : 'Info', message, type });
        }
    }

    formatDate(date) {
        if (!date) return 'N/A';
        try {
            return new Date(date).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch (error) {
            return 'Invalid Date';
        }
    }

    formatTime(date) {
        if (!date) return 'N/A';
        try {
            return new Date(date).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            return 'Invalid Time';
        }
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    window.parentExcuse = new ParentExcuse();
});
