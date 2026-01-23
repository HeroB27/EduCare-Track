class StudentManagement {
    constructor() {
        this.currentEditingStudent = null;
        this.classes = [];
        this.parents = [];
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

    async loadParents() {
        try {
            // Fetch users with role 'parent' from profiles table
            let parents = [];
            
            // Try using Supabase client directly first
            if (window.supabaseClient) {
                const { data, error } = await window.supabaseClient
                    .from('profiles')
                    .select('*')
                    .eq('role', 'parent');
                    
                if (!error && data) {
                    parents = data;
                }
            }
            
            // Fallback to EducareTrack helper if direct query failed or client not available
            if (parents.length === 0 && window.EducareTrack.getUsersByRole) {
            parents = await window.EducareTrack.getUsersByRole('parent');
        }
        
        this.parents = parents.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
        } catch (error) {
            console.error('Error loading parents:', error);
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
        
        // Preserve current selection if any
        const currentVal = classSelect.value;
        
        classSelect.innerHTML = '<option value="">Select Class</option>';
        this.classes.forEach(cls => {
            // Construct class name safely since name/level might be undefined in DB
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
            
            // Update student count
            document.getElementById('studentCount').textContent = 
                `Total Students: ${this.allStudents.length} (${this.filteredStudents.length} filtered)`;
        } catch (error) {
            if (error?.code === 'PGRST205' || error?.message?.includes("does not exist")) {
                 console.warn('Students table missing or query error, skipping load.');
                 this.allStudents = [];
                 this.filteredStudents = [];
                 this.renderStudentsTable();
                 document.getElementById('studentCount').textContent = 'Total Students: 0 (0 filtered)';
                 return;
            }
            console.error('Error loading students:', error);
            this.showNotification('Error loading students', 'error');
        }
    }

    setupRealtimeUpdates() {
        if (!window.supabaseClient) return;

        // Subscribe to changes in students table
        const channel = window.supabaseClient
            .channel('admin_students_changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'students' },
                (payload) => {
                    console.log('Realtime student update:', payload);
                    // Reload students on any change
                    this.loadStudents();
                }
            )
            .subscribe();
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
                    <div class="text-sm font-mono font-medium text-gray-900">${student.id}</div>
                    ${student.lrn ? `<div class="text-xs text-gray-500">LRN: ${student.lrn}</div>` : ''}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm font-medium text-gray-900">${student.full_name || 'Unknown'}</div>
                    <div class="text-xs text-gray-500">${this.getClassById(student.class_id || student.classId)?.grade || 'N/A'} ${student.strand ? '• ' + student.strand : ''}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm text-gray-500">${this.getClassById(student.class_id || student.classId)?.id || 'N/A'}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    ${this.getClassById(student.class_id || student.classId)?.grade || 'N/A'}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${this.getStatusColor(student.current_status)}">
                        ${this.getStatusText(student.current_status)}
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
                    const gradeValue = grade.replace('Grade ', '');
                    gradeSelect.innerHTML += `<option value="${gradeValue}">${gradeValue}</option>`;
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

            const fullName = document.getElementById('studentName').value.trim();
            const parentId = document.getElementById('studentParent').value || null;
            
            const studentData = {
                full_name: fullName,
                name: fullName, // Backward compatibility
                lrn: document.getElementById('studentLRN').value || '',
                class_id: document.getElementById('studentClass').value,
                strand: document.getElementById('studentStrand').value || '',
                // parent_id removed from students table
            };

            // Validate required fields
            if (!studentData.full_name || !studentData.class_id) {
                this.showNotification('Please fill in all required fields', 'error');
                this.hideLoading();
                return;
            }

            let studentId;

            if (this.currentEditingStudent) {
                // Update existing student
                studentId = this.currentEditingStudent.id;
                const { error } = await window.supabaseClient
                    .from('students')
                    .update({
                        ...studentData,
                        updated_at: new Date()
                    })
                    .eq('id', studentId);
                
                if (error) throw error;
                this.showNotification('Student updated successfully', 'success');
            } else {
                // Create new student
                // We should ideally use EducareTrack.enrollStudent, but that requires parent info.
                // If we are just adding a student record directly (admin bypass), we can do this:
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

            // Handle Parent-Student Link
            if (parentId) {
                // Remove existing links first (simplified approach for 1:1 parent assumption in this UI)
                await window.supabaseClient
                    .from('parent_students')
                    .delete()
                    .eq('student_id', studentId);

                // Add new link
                const { error: linkError } = await window.supabaseClient
                    .from('parent_students')
                    .insert({
                        parent_id: parentId,
                        student_id: studentId,
                        relationship: 'Parent' // Default
                    });
                
                if (linkError) console.error('Error linking parent:', linkError);
            } else if (this.currentEditingStudent) {
                // If parentId is cleared, remove existing link
                await window.supabaseClient
                    .from('parent_students')
                    .delete()
                    .eq('student_id', studentId);
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
        
        // Trigger level change to populate grades and show/hide strand
        const levelEvent = new Event('change');
        document.getElementById('studentLevel').dispatchEvent(levelEvent);
        
        // Set grade after level has populated options
        setTimeout(() => {
            const grade = this.getClassById(classId)?.grade || '';
            document.getElementById('studentGrade').value = grade.replace('Grade ', '');
        }, 100);
    }

    async viewStudent(studentId) {
        try {
            this.showLoading();
            const student = await window.EducareTrack.getStudentById(studentId);
            
            if (!student) {
                throw new Error('Student not found');
            }

            // Load additional student data
            const [attendanceRecords, clinicVisits, parentInfo] = await Promise.all([
                this.getAttendanceByStudent(studentId),
                this.getClinicVisitsByStudent(studentId),
                student.parent_id ? window.EducareTrack.getUserById(student.parent_id) : Promise.resolve(null)
            ]);

            const schoolDays = this.countUniqueEntryDays(attendanceRecords);
            const lateArrivals = this.countUniqueLateDays(attendanceRecords);
            const modalContent = document.getElementById('studentDetailContent');
            
            modalContent.innerHTML = `
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <!-- Student Info -->
                    <div class="lg:col-span-1">
                        <div class="text-center">
                            <div class="w-24 h-24 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4 overflow-hidden">
                                ${student.photo_url || student.photoUrl ? 
                                    `<img src="${student.photo_url || student.photoUrl}" alt="${student.full_name || 'Student'}" class="w-24 h-24 rounded-full object-cover">` :
                                    `<span class="text-blue-600 font-semibold text-2xl">${(student.full_name || 'ST').split(' ').map(n => n[0]).join('').substring(0, 2)}</span>`
                                }
                            </div>
                            <h3 class="text-xl font-bold text-gray-800">${student.full_name || 'Unknown'}</h3>
                            <p class="text-gray-600">${this.getClassById(student.class_id || student.classId)?.grade || 'N/A'} • ${this.getClassById(student.class_id || student.classId)?.id || 'N/A'}</p>
                            ${student.strand ? `<p class="text-gray-600">${student.strand}</p>` : ''}
                            <div class="mt-2">
                                <span class="px-3 py-1 rounded-full text-sm font-medium ${this.getStatusColor(student.current_status)}">
                                    ${this.getStatusText(student.current_status)}
                                </span>
                            </div>
                        </div>

                        <div class="mt-6 space-y-3">
                            <div class="flex justify-between">
                                <span class="text-gray-600">LRN:</span>
                                <span class="font-medium">${student.lrn || 'N/A'}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-600">Student ID:</span>
                                <span class="font-medium">${student.id || 'N/A'}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Parent & Contact Info -->
                    <div class="lg:col-span-2">
                        <div class="bg-gray-50 rounded-lg p-4 mb-6">
                            <h4 class="font-semibold text-gray-800 mb-3">Parent/Guardian Information</h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <p class="text-sm text-gray-600">Name</p>
                                    <p class="font-medium">${parentInfo?.name || 'N/A'}</p>
                                </div>
                                <div>
                                    <p class="text-sm text-gray-600">Relationship</p>
                                    <p class="font-medium">${parentInfo?.relationship || 'Parent'}</p>
                                </div>
                                <div>
                                    <p class="text-sm text-gray-600">Phone</p>
                                    <p class="font-medium">${parentInfo?.phone || 'N/A'}</p>
                                </div>
                                <div>
                                    <p class="text-sm text-gray-600">Emergency Contact</p>
                                    <p class="font-medium">${parentInfo?.emergencyContact || parentInfo?.phone || 'N/A'}</p>
                                </div>
                            </div>
                        </div>

                        <!-- Quick Stats -->
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                            <div class="bg-white border border-gray-200 rounded-lg p-4 text-center">
                                <div class="text-2xl font-bold text-blue-600">${schoolDays}</div>
                                <div class="text-sm text-gray-600">School Days</div>
                            </div>
                            <div class="bg-white border border-gray-200 rounded-lg p-4 text-center">
                                <div class="text-2xl font-bold text-yellow-600">${lateArrivals}</div>
                                <div class="text-sm text-gray-600">Late Arrivals</div>
                            </div>
                            <div class="bg-white border border-gray-200 rounded-lg p-4 text-center">
                                <div class="text-2xl font-bold text-blue-600">${clinicVisits.filter(v => v.checkIn).length}</div>
                                <div class="text-sm text-gray-600">Clinic Visits</div>
                            </div>
                            <div class="bg-white border border-gray-200 rounded-lg p-4 text-center">
                                <div class="text-2xl font-bold text-green-600">${this.calculateAttendanceRate(attendanceRecords)}%</div>
                                <div class="text-sm text-gray-600">Attendance Rate</div>
                            </div>
                        </div>

                        <!-- Recent Activity -->
                        <div>
                            <h4 class="font-semibold text-gray-800 mb-3">Recent Activity</h4>
                            <div class="space-y-2 max-h-40 overflow-y-auto">
                                ${this.getRecentActivity(attendanceRecords, clinicVisits)}
                            </div>
                        </div>
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
    }

    // Helper methods for viewStudent
    async getAttendanceByStudent(studentId) {
        try {
            const snapshot = await window.EducareTrack.db.collection('attendance')
                .where('student_id', '==', studentId)
                .orderBy('timestamp', 'desc')
                .limit(50)
                .get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error('Error getting attendance:', error);
            return [];
        }
    }

    async getClinicVisitsByStudent(studentId) {
        try {
            const { data: visits, error } = await window.supabaseClient
                .from('clinic_visits')
                .select('*')
                .eq('student_id', studentId)
                .order('timestamp', { ascending: false })
                .limit(20);

            if (error) throw error;
            return visits || [];
        } catch (error) {
            console.error('Error getting clinic visits:', error);
            return [];
        }
    }

    calculateAttendanceRate(attendanceRecords) {
        const entryDays = new Set();
        const presentLateDays = new Set();
        attendanceRecords.forEach(a => {
            const ts = a.timestamp;
            if (ts && a.entryType === 'entry') {
                const d = ts.toDate ? ts.toDate() : new Date(ts);
                const key = d.toDateString();
                entryDays.add(key);
                if (a.status === 'present' || a.status === 'late') {
                    presentLateDays.add(key);
                }
            }
        });
        const total = entryDays.size;
        const present = presentLateDays.size;
        return total > 0 ? Math.round((present / total) * 100) : 0;
    }

    countUniqueEntryDays(attendanceRecords) {
        const days = new Set();
        attendanceRecords.forEach(a => {
            const ts = a.timestamp;
            if (ts && a.entryType === 'entry') {
                const d = ts.toDate ? ts.toDate() : new Date(ts);
                days.add(d.toDateString());
            }
        });
        return days.size;
    }

    countUniqueLateDays(attendanceRecords) {
        const days = new Set();
        attendanceRecords.forEach(a => {
            const ts = a.timestamp;
            if (ts && a.entryType === 'entry' && a.status === 'late') {
                const d = ts.toDate ? ts.toDate() : new Date(ts);
                days.add(d.toDateString());
            }
        });
        return days.size;
    }

    getRecentActivity(attendance, clinic) {
        const activities = [
            ...attendance.map(a => ({
                type: 'attendance',
                date: a.timestamp && a.timestamp.toDate ? a.timestamp.toDate() : new Date(a.timestamp),
                details: `${a.entryType === 'entry' ? 'In' : 'Out'} - ${this.getStatusText(a.status)}`
            })),
            ...clinic.map(c => {
                const ts = c.timestamp || c.checkIn;
                return {
                    type: 'clinic',
                    date: ts && (ts.toDate ? ts.toDate() : new Date(ts)),
                    details: `Clinic Visit - ${c.complaint || 'No details'}`
                };
            })
        ].sort((a, b) => b.date - a.date).slice(0, 5);

        if (activities.length === 0) {
            return '<p class="text-sm text-gray-500 italic">No recent activity</p>';
        }

        return activities.map(a => `
            <div class="flex items-start space-x-3 text-sm">
                <div class="min-w-20 text-gray-500">${window.EducareTrack.formatDate(a.date)}</div>
                <div class="flex-1">
                    <span class="font-medium ${a.type === 'clinic' ? 'text-red-600' : 'text-blue-600'}">
                        ${a.type === 'clinic' ? 'Clinic' : 'Attendance'}
                    </span>
                    <span class="text-gray-600"> - ${a.details}</span>
                </div>
            </div>
        `).join('');
    }

    async toggleStudentStatus(studentId) {
        const student = this.allStudents.find(s => s.id === studentId);
        if (student) {
            const newStatus = !student.is_active;
            const confirmMessage = newStatus ? 
                'Are you sure you want to activate this student?' : 
                'Are you sure you want to deactivate this student?';
            
            const ok = window.EducareTrack && typeof window.EducareTrack.confirmAction === 'function'
                ? await window.EducareTrack.confirmAction(confirmMessage, 'Confirm Status Change', newStatus ? 'Activate' : 'Deactivate', 'Cancel')
                : true;
            if (ok) {
                try {
                    this.showLoading();
                    await window.EducareTrack.db.collection('students').doc(studentId).update({
                        is_active: newStatus,
                        updated_at: new Date()
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
            if (cls.is_active !== false) {
                classSelect.innerHTML += `<option value="${cls.id}">${cls.name} - ${cls.grade} (${cls.level})</option>`;
            }
        });
    }

    populateClassFilters() {
        const filterSelect = document.getElementById('classFilter');
        filterSelect.innerHTML = '<option value="">All Classes</option>';
        
        this.classes.forEach(cls => {
            if (cls.is_active !== false) {
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
            const displayName = student.full_name || student.name || '';
            const fullName = displayName.toLowerCase();
            const matchesSearch = fullName.includes(searchTerm) || 
                                (student.id && student.id.toLowerCase().includes(searchTerm)) ||
                                (student.lrn && student.lrn.toLowerCase().includes(searchTerm));
            
            const studentClassId = student.class_id || student.classId;
            const matchesClass = !classFilter || studentClassId === classFilter;
            
            const matchesStatus = !statusFilter || student.current_status === statusFilter;

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
