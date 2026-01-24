
class StudentRecords {
    constructor() {
        this.currentEditingStudent = null;
        this.currentViewStudent = null;
        this.classes = [];
        this.parents = [];
        this.allStudents = [];
        this.filteredStudents = [];
        this.attendanceRecords = [];
        this.currentUser = null;
        this.init();
    }

    async init() {
        try {
            this.showLoading();
            
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

            await Promise.all([
                this.loadClasses(),
                this.loadParents(),
                this.loadAttendanceData()
            ]);
            
            await this.loadStudents();
            
            this.populateClassFilters();
            this.setupEventListeners();
            this.populateParentDropdown();
            this.populateClassDropdown();
            
            this.hideLoading();
        } catch (error) {
            console.error('Error initializing student records:', error);
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

        title.textContent = type === 'error' ? 'Error' : (type === 'success' ? 'Success' : 'Notification');
        msg.textContent = message;

        if (type === 'error') {
            notification.classList.replace('border-blue-600', 'border-red-600');
            icon.className = 'mr-3 text-red-600';
            icon.innerHTML = '<i class="fas fa-exclamation-circle"></i>';
        } else if (type === 'success') {
            notification.classList.replace('border-blue-600', 'border-green-600');
            icon.className = 'mr-3 text-green-600';
            icon.innerHTML = '<i class="fas fa-check-circle"></i>';
        } else {
            notification.classList.replace('border-red-600', 'border-blue-600');
            notification.classList.replace('border-green-600', 'border-blue-600');
            icon.className = 'mr-3 text-blue-600';
            icon.innerHTML = '<i class="fas fa-info-circle"></i>';
        }

        notification.classList.remove('translate-y-full');
        setTimeout(() => {
            notification.classList.add('translate-y-full');
        }, 3000);
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
            this.parents = parents.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
        } catch (error) {
            console.error('Error loading parents:', error);
            this.parents = [];
        }
    }

    async loadAttendanceData() {
        try {
            if (window.supabaseClient) {
                const { data, error } = await window.supabaseClient
                    .from('attendance')
                    .select('*');
                if (!error && data) {
                    this.attendanceRecords = data;
                }
            }
        } catch (error) {
            console.error('Error loading attendance:', error);
            this.attendanceRecords = [];
        }
    }

    calculateAttendanceStats(student, schoolDaysByLevel = {}) {
        const studentId = student.id;
        const records = this.attendanceRecords.filter(r => r.student_id === studentId || r.studentId === studentId);
        const present = records.filter(r => r.status === 'present').length;
        const late = records.filter(r => r.status === 'late').length;
        const absent = records.filter(r => r.status === 'absent').length;
        
        // Use expected days if available, otherwise fallback to recorded total
        let total = schoolDaysByLevel[student.level] || (present + late + absent);
        
        // Ensure total covers at least the recorded attendance to avoid > 100% due to data anomalies
        total = Math.max(total, present + late + absent);
        
        // If no records and no school days passed, return 0
        if (total === 0) return { rate: 0, present, late, absent, total };

        // Rate: (Present + Late) / Total * 100
        const rate = Math.round(((present + late) / total) * 100);
        return { rate, present, late, absent, total };
    }

    async loadStudents() {
        try {
            const students = await window.EducareTrack.getStudents(true);

            // Pre-calculate school days by level for accurate attendance rates
            let schoolDaysByLevel = {};
            if (this.attendanceRecords.length > 0 && window.EducareTrack && window.EducareTrack.isSchoolDay) {
                try {
                    // Ensure calendar data is loaded
                    if (window.EducareTrack.fetchCalendarData) {
                        await window.EducareTrack.fetchCalendarData();
                    }

                    // Find date range from records
                    let minTs = new Date().getTime();
                    this.attendanceRecords.forEach(r => {
                        const ts = new Date(r.timestamp).getTime();
                        if (ts < minTs) minTs = ts;
                    });
                    
                    const minDate = new Date(minTs);
                    minDate.setHours(0,0,0,0);
                    
                    const today = new Date();
                    today.setHours(23,59,59,999);
                    
                    // Get unique levels
                    const levels = new Set(students.map(s => s.level).filter(l => l));
                    
                    // Calculate school days for each level
                    levels.forEach(level => {
                        let count = 0;
                        let d = new Date(minDate);
                        // Clone to avoid modifying minDate in loop (though we reset d)
                        // Actually we need a fresh iterator for each level
                        const current = new Date(minDate);
                        while(current <= today) {
                            if (window.EducareTrack.isSchoolDay(current, level)) {
                                count++;
                            }
                            current.setDate(current.getDate() + 1);
                        }
                        schoolDaysByLevel[level] = count;
                    });
                } catch (err) {
                    console.error('Error calculating school days:', err);
                }
            }

            this.allStudents = students.map(student => {
                const stats = this.calculateAttendanceStats(student, schoolDaysByLevel);
                return {
                    ...student,
                    attendanceStats: stats
                };
            });
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
                    <td colspan="6" class="px-6 py-4 text-center text-gray-500">
                        No students found matching your criteria
                    </td>
                </tr>`;
            return;
        }

        tableBody.innerHTML = this.filteredStudents.map(student => {
            const stats = student.attendanceStats;
            let rateColor = 'text-green-600';
            if (stats.rate < 75) rateColor = 'text-red-600';
            else if (stats.rate < 85) rateColor = 'text-yellow-600';

            const cls = this.getClassById(student.class_id || student.classId);
            const className = cls?.name || cls?.grade || 'N/A';
            const classGrade = cls?.grade || '';
            const showGrade = classGrade && classGrade !== className;

            return `
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
                    <div class="text-sm text-gray-900">${className}</div>
                    ${showGrade ? `<div class="text-xs text-gray-500">${classGrade}</div>` : ''}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm font-bold ${rateColor}">${stats.rate}%</div>
                    <div class="text-xs text-gray-500">
                        P: ${stats.present} | L: ${stats.late} | A: ${stats.absent}
                    </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${this.getStatusColor(student.current_status)}">
                        ${this.getStatusText(student.current_status)}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button onclick="studentRecords.viewStudent('${student.id}')" 
                            class="text-blue-600 hover:text-blue-900 mr-3 transition-colors" title="View Details">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button onclick="studentRecords.editStudent('${student.id}')" 
                            class="text-green-600 hover:text-green-900 mr-3 transition-colors" title="Edit Student">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="studentRecords.toggleStudentStatus('${student.id}')" 
                            class="${student.is_active ? 'text-red-600 hover:text-red-900' : 'text-green-600 hover:text-green-900'} mr-3 transition-colors"
                            title="${student.is_active ? 'Deactivate' : 'Activate'} Student">
                        <i class="fas ${student.is_active ? 'fa-user-slash' : 'fa-user-check'}"></i>
                    </button>
                    <button onclick="studentRecords.deleteStudent('${student.id}')" 
                            class="text-red-600 hover:text-red-900 transition-colors" title="Delete Student">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            </tr>
        `}).join('');
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

    openAddStudentModal() {
        this.currentEditingStudent = null;
        document.getElementById('studentModalTitle').textContent = 'Enroll New Student';
        document.getElementById('studentForm').reset();
        
        document.getElementById('editStudentPhotoPreview').classList.add('hidden');
        document.getElementById('editStudentPhotoPlaceholder').classList.remove('hidden');
        document.getElementById('studentIdInput').value = ''; 

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
            const inputId = document.getElementById('studentIdInput').value.trim();
            
            const studentData = {
                full_name: fullName,
                name: fullName,
                lrn: document.getElementById('studentLRN').value || '',
                class_id: document.getElementById('studentClass').value,
                strand: document.getElementById('studentStrand').value || '',
            };

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

            if (this.currentEditingStudent) {
                const studentId = this.currentEditingStudent.id;
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
                     const year = new Date().getFullYear();
                     const random = Math.floor(1000 + Math.random() * 9000);
                     studentData.id = `${year}-${random}`;
                }

                const { data, error } = await window.supabaseClient
                    .from('students')
                    .insert([{ ...studentData, created_at: new Date(), is_active: true }])
                    .select();

                if (error) throw error;
                this.showNotification('Student enrolled successfully', 'success');
            }

            // Link parent if selected
            const parentId = document.getElementById('studentParent').value;
            if (parentId) {
                // Remove existing links for this student
                const studentId = this.currentEditingStudent ? this.currentEditingStudent.id : (inputId || studentData.id);
                await window.supabaseClient
                    .from('parent_students')
                    .delete()
                    .eq('student_id', studentId);
                
                // Add new link
                await window.supabaseClient
                    .from('parent_students')
                    .insert([{ parent_id: parentId, student_id: studentId, relationship: 'Guardian' }]);
            }

            this.closeModal();
            await this.loadStudents();
        } catch (error) {
            console.error('Error saving student:', error);
            this.showNotification('Error saving student: ' + error.message, 'error');
            this.hideLoading();
        }
    }

    async viewStudent(studentId) {
        try {
            this.showLoading();
            const student = this.allStudents.find(s => s.id === studentId);
            if (!student) throw new Error('Student not found');
            
            this.currentViewStudent = student;
            const stats = student.attendanceStats;

            // Build View Content
            const recentRecords = this.attendanceRecords
                .filter(r => (r.student_id === studentId || r.studentId === studentId) && (r.status === 'absent' || r.status === 'late'))
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .slice(0, 5); // Show last 5 records

            const recordsHtml = recentRecords.length > 0 
                ? recentRecords.map(r => `
                    <div class="flex justify-between items-center py-2 border-b last:border-0">
                        <div>
                            <div class="font-medium text-gray-800">${new Date(r.timestamp).toLocaleDateString()}</div>
                            <div class="text-xs text-gray-500">${r.session || 'All Day'}</div>
                        </div>
                        <div class="text-right">
                            <span class="px-2 py-1 text-xs rounded-full ${r.status === 'absent' ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-800'}">
                                ${r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                            </span>
                            <div class="text-xs text-gray-500 mt-1">${r.remarks || 'No reason provided'}</div>
                        </div>
                    </div>
                `).join('')
                : '<div class="text-center text-gray-500 py-4">No recent absences or late arrivals</div>';

            const content = `
                <div class="flex flex-col items-center">
                    <div class="w-32 h-32 rounded-full bg-gray-200 overflow-hidden mb-4 border-4 border-blue-100 shadow-lg">
                        ${student.photo_url ? `<img src="${student.photo_url}" class="w-full h-full object-cover">` : '<i class="fas fa-user text-gray-400 text-5xl flex items-center justify-center h-full"></i>'}
                    </div>
                    <h2 class="text-2xl font-bold text-gray-800">${student.full_name}</h2>
                    <p class="text-gray-500 font-mono">${student.id}</p>
                    <span class="mt-2 px-3 py-1 rounded-full text-sm font-semibold ${this.getStatusColor(student.current_status)}">
                        ${this.getStatusText(student.current_status)}
                    </span>
                </div>
                
                <div class="space-y-4">
                    <div class="bg-gray-50 p-4 rounded-lg">
                        <h4 class="font-semibold text-gray-700 mb-2 border-b pb-1">Academic Info</h4>
                        <div class="grid grid-cols-2 gap-4 text-sm">
                            <div><span class="text-gray-500">Class:</span> <span class="font-medium">${this.getClassById(student.class_id || student.classId)?.name || 'N/A'}</span></div>
                            <div><span class="text-gray-500">Grade:</span> <span class="font-medium">${this.getClassById(student.class_id || student.classId)?.grade || 'N/A'}</span></div>
                            <div><span class="text-gray-500">LRN:</span> <span class="font-medium">${student.lrn || 'N/A'}</span></div>
                            <div><span class="text-gray-500">Strand:</span> <span class="font-medium">${student.strand || 'N/A'}</span></div>
                        </div>
                    </div>

                    <div class="bg-blue-50 p-4 rounded-lg">
                        <h4 class="font-semibold text-blue-800 mb-2 border-b border-blue-200 pb-1">Attendance Summary</h4>
                        <div class="grid grid-cols-2 gap-4 text-sm mb-2">
                             <div><span class="text-gray-500">Attendance Rate:</span> <span class="font-bold text-lg ${stats.rate < 75 ? 'text-red-600' : 'text-green-600'}">${stats.rate}%</span></div>
                             <div><span class="text-gray-500">Total Days:</span> <span class="font-medium">${stats.total}</span></div>
                        </div>
                        <div class="flex justify-between text-xs text-center mb-4">
                            <div class="bg-white p-2 rounded shadow-sm w-[30%]">
                                <div class="font-bold text-green-600 text-lg">${stats.present}</div>
                                <div class="text-gray-500">Present</div>
                            </div>
                            <div class="bg-white p-2 rounded shadow-sm w-[30%]">
                                <div class="font-bold text-orange-500 text-lg">${stats.late}</div>
                                <div class="text-gray-500">Late</div>
                            </div>
                            <div class="bg-white p-2 rounded shadow-sm w-[30%]">
                                <div class="font-bold text-red-600 text-lg">${stats.absent}</div>
                                <div class="text-gray-500">Absent</div>
                            </div>
                        </div>
                        
                        <h5 class="font-semibold text-blue-800 text-sm mb-2 border-t border-blue-200 pt-2">Recent Issues (Last 5)</h5>
                        <div class="bg-white rounded-lg p-2 shadow-sm max-h-40 overflow-y-auto text-sm">
                            ${recordsHtml}
                        </div>
                    </div>
                </div>
            `;

            document.getElementById('studentDetailContent').innerHTML = content;
            
            const modal = document.getElementById('studentDetailModal');
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            
            this.hideLoading();
        } catch (error) {
            console.error('Error viewing student:', error);
            this.showNotification('Error viewing student', 'error');
            this.hideLoading();
        }
    }

    closeViewModal() {
        const modal = document.getElementById('studentDetailModal');
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        this.currentViewStudent = null;
    }

    async editStudent(studentId) {
        this.currentEditingStudent = this.allStudents.find(s => s.id === studentId);
        if (!this.currentEditingStudent) return;

        document.getElementById('studentModalTitle').textContent = 'Edit Student';
        
        document.getElementById('studentName').value = this.currentEditingStudent.full_name || '';
        document.getElementById('studentLRN').value = this.currentEditingStudent.lrn || '';
        document.getElementById('studentIdInput').value = this.currentEditingStudent.id;
        
        const classSelect = document.getElementById('studentClass');
        classSelect.value = this.currentEditingStudent.class_id || this.currentEditingStudent.classId || '';
        
        // Trigger change to update strand visibility
        classSelect.dispatchEvent(new Event('change'));
        
        // Set strand value after options are populated
        setTimeout(() => {
             document.getElementById('studentStrand').value = this.currentEditingStudent.strand || '';
        }, 50);
        
        // Handle photo preview
        const preview = document.getElementById('editStudentPhotoPreview');
        const placeholder = document.getElementById('editStudentPhotoPlaceholder');
        if (this.currentEditingStudent.photo_url) {
            preview.src = this.currentEditingStudent.photo_url;
            preview.classList.remove('hidden');
            placeholder.classList.add('hidden');
        } else {
            preview.classList.add('hidden');
            placeholder.classList.remove('hidden');
        }

        // Try to get parent
        if (window.supabaseClient) {
            const { data } = await window.supabaseClient
                .from('parent_students')
                .select('parent_id')
                .eq('student_id', studentId)
                .single();
            if (data) {
                document.getElementById('studentParent').value = data.parent_id;
                // Trigger change event to populate phone/address
                document.getElementById('studentParent').dispatchEvent(new Event('change'));
            }
        }

        const modal = document.getElementById('addStudentModal');
        modal.classList.remove('hidden');
        modal.classList.add('flex');
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
            
            await this.loadStudents();
            this.showNotification(`Student ${newStatus ? 'activated' : 'deactivated'} successfully`, 'success');
            this.hideLoading();
        } catch (error) {
            console.error('Error toggling status:', error);
            this.showNotification('Error updating status', 'error');
            this.hideLoading();
        }
    }

    async deleteStudent(studentId) {
        if (!confirm('Are you sure you want to PERMANENTLY delete this student? This action cannot be undone.')) return;
        
        try {
            this.showLoading();
            
            const { error } = await window.supabaseClient
                .from('students')
                .delete()
                .eq('id', studentId);

            if (error) throw error;

            this.showNotification('Student deleted successfully', 'success');
            await this.loadStudents();
            this.hideLoading();
        } catch (error) {
            console.error('Error deleting student:', error);
            this.showNotification('Error deleting student: ' + error.message, 'error');
            this.hideLoading();
        }
    }
}

window.studentRecords = new StudentRecords();
