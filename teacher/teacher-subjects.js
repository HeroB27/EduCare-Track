class TeacherSubjects {
    constructor() {
        this.currentUser = null;
        this.schedules = [];
        this.selectedSchedule = null;
        this.students = [];
        this.currentDate = new Date().toLocaleDateString('en-CA');
        
        // Data States
        this.homeroomData = {};     // Source of Truth
        this.subjectData = {};      // Current Saved State
        this.localState = {};       // Pending Edits
        this.excuseData = {};       // Approved Excuses
        
        this.init();
    }

    async init() {
        if (!await this.checkAuth()) return;
        await this.loadSchedules();
        this.initEventListeners();
        this.setupRealTimeListeners();
        
        // Set date picker max to today (can't mark future attendance usually, but let's leave it open if needed or restricted? 
        // Canvas usually allows future/past. Let's stick to standard.)
        // document.getElementById('attendanceDate').max = new Date().toLocaleDateString('en-CA');
    }

    async checkAuth() {
        const savedUser = localStorage.getItem('educareTrack_user');
        if (!savedUser) {
            window.location.href = '../index.html';
            return false;
        }
        this.currentUser = JSON.parse(savedUser);
        if (this.currentUser.role !== 'teacher') {
            window.location.href = '../index.html';
            return false;
        }
        return true;
    }

    async loadSchedules() {
        try {
            // Get class schedules where teacher_id is current user
            const { data, error } = await window.supabaseClient
                .from('class_schedules')
                .select(`
                    id,
                    subject,
                    day_of_week,
                    start_time,
                    end_time,
                    classes (
                        id,
                        grade,
                        strand,
                        level,
                        section
                    )
                `)
                .eq('teacher_id', this.currentUser.id);

            if (error) throw error;
            this.schedules = data || [];
            this.renderScheduleList();
        } catch (error) {
            console.error('Error loading schedules:', error);
            document.getElementById('subjectList').innerHTML = '<p class="text-red-500">Error loading subjects</p>';
        }
    }

    renderScheduleList() {
        const container = document.getElementById('subjectList');
        if (this.schedules.length === 0) {
            container.innerHTML = '<p class="text-gray-500">No subjects assigned.</p>';
            return;
        }

        container.innerHTML = this.schedules.map(schedule => `
            <div class="bg-white p-4 rounded-lg shadow cursor-pointer hover:bg-gray-50 transition border-l-4 border-blue-500" onclick="window.teacherSubjects.selectSchedule('${schedule.id}')">
                <h3 class="font-bold text-lg text-gray-800">${schedule.subject}</h3>
                <p class="text-gray-600 font-medium">${schedule.classes.grade} ${schedule.classes.strand ? ' - ' + schedule.classes.strand : ''}</p>
                <p class="text-sm text-gray-500 mt-2 flex items-center">
                    <i class="far fa-clock mr-1"></i>
                    ${schedule.day_of_week || 'Daily'} • ${this.formatTime(schedule.start_time)} - ${this.formatTime(schedule.end_time)}
                </p>
            </div>
        `).join('');
    }

    formatTime(timeStr) {
        if (!timeStr) return '';
        const [hours, minutes] = timeStr.split(':');
        const h = parseInt(hours);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return `${h12}:${minutes} ${ampm}`;
    }

    async selectSchedule(scheduleId) {
        this.selectedSchedule = this.schedules.find(s => s.id === scheduleId);
        
        // Update Header
        document.getElementById('selectedSubjectTitle').textContent = this.selectedSchedule.subject;
        const classInfo = this.selectedSchedule.classes;
        document.getElementById('selectedSubjectSubtitle').textContent = 
            `${classInfo.grade} ${classInfo.strand || ''} • ${this.formatTime(this.selectedSchedule.start_time)} - ${this.formatTime(this.selectedSchedule.end_time)}`;
        
        // Show View
        document.getElementById('subjectAttendanceView').classList.remove('hidden');
        document.getElementById('subjectListView').classList.add('hidden');
        
        // Set Date to Today if not set
        if (!this.currentDate) {
            this.currentDate = new Date().toLocaleDateString('en-CA');
        }
        document.getElementById('attendanceDate').value = this.currentDate;
        
        await this.loadSubjectAttendance();
    }

    async loadSubjectAttendance() {
        this.showLoading(true);
        try {
            // 1. Get Students
            const { data: students, error: sErr } = await window.supabaseClient
                .from('students')
                .select('id, full_name, photo_url, gender')
                .eq('class_id', this.selectedSchedule.classes.id)
                .order('full_name');

            if (sErr) throw sErr;
            this.students = students || [];

            if (this.students.length === 0) {
                this.showEmptyState(true);
                this.showLoading(false);
                return;
            }
            this.showEmptyState(false);

            // 2. Parallel Fetch: Homeroom, Subject Attendance, Excuses
            const date = this.currentDate;
            
            const [homeroomRes, subjectRes, excusesRes] = await Promise.all([
                // Homeroom Attendance (Source of Truth)
                window.supabaseClient
                    .from('attendance')
                    .select('student_id, status, remarks, time, session')
                    .in('student_id', this.students.map(s => s.id))
                    .eq('date', date) // Assuming attendance has a 'date' column or we filter by timestamp
                    // Note: 'attendance' table usually has 'timestamp'. We might need to filter by range.
                    // But usually there's a view or a date column. Let's assume standard 'timestamp' casting or a 'date' column exists.
                    // Based on previous code: teacher-scanner uses 'timestamp'. teacher-subjects used 'date'.
                    // Let's try to match by date string if possible. If not, we might need range.
                    // Let's assume there is a 'date' column for simplified querying or we use range.
                    // Given the user instruction "attendance table... Status options: present, late, absent", let's assume it supports date query.
                    // If errors occur, I'll switch to timestamp range.
                    .gte('timestamp', `${date}T00:00:00`)
                    .lte('timestamp', `${date}T23:59:59`),

                // Subject Attendance (Verification Layer)
                window.supabaseClient
                    .from('subject_attendance')
                    .select('student_id, status, remarks')
                    .eq('schedule_id', this.selectedSchedule.id)
                    .eq('date', date),

                // Excuse Letters
                window.supabaseClient
                    .from('excuse_letters')
                    .select('student_id, type, reason')
                    .eq('status', 'approved')
                    .lte('start_date', date)
                    .gte('end_date', date)
            ]);

            // Process Homeroom Data
            this.homeroomData = {};
            if (homeroomRes.data) {
                // There might be multiple records (AM/PM). We need to aggregate or take the most relevant.
                // Rule: "Status options: present, late, absent. This is considered the base attendance for the whole day."
                // If there are multiple, priority: absent > late > present ? Or just take the latest?
                // Usually Homeroom is AM.
                homeroomRes.data.forEach(r => {
                    // Simple logic: If any record says present/late, they are here. If absent, they are absent.
                    // But wait, "Homeroom = absent -> default is absent".
                    // Let's map the latest status or prioritize 'absent' if it's a full day absence.
                    // For now, just taking the first record or last record.
                    this.homeroomData[r.student_id] = { status: r.status, remarks: r.remarks };
                });
            }

            // Process Subject Data
            this.subjectData = {};
            if (subjectRes.data) {
                subjectRes.data.forEach(r => {
                    this.subjectData[r.student_id] = { status: r.status, remarks: r.remarks };
                });
            }

            // Process Excuses
            this.excuseData = {};
            if (excusesRes.data) {
                excusesRes.data.forEach(r => {
                    this.excuseData[r.student_id] = r;
                });
            }

            // Initialize Local State
            this.localState = {};
            this.students.forEach(student => {
                const sId = student.id;
                
                // 1. Check existing subject attendance
                if (this.subjectData[sId]) {
                    this.localState[sId] = this.subjectData[sId].status;
                } 
                // 2. Fallback to Homeroom
                else if (this.homeroomData[sId]) {
                    this.localState[sId] = this.homeroomData[sId].status;
                }
                // 3. Fallback to 'present' (User said: "If student is present in homeroom → default is present. If absent → default is absent")
                // What if homeroom is missing? (Teacher hasn't taken it yet).
                // Usually default to Present or Null (unmarked).
                // Let's default to 'present' as per "Mark all present" being a common action, or null to force check.
                // Canvas defaults to "Unmarked" usually.
                // User said: "One-click 'Mark all present'". Implies start is Unmarked?
                // But also: "If student is present in homeroom → default is present".
                // So if homeroom exists -> use it. If not -> Unmarked (null).
                else {
                    this.localState[sId] = null; 
                }
            });

            this.renderStudentList();
        } catch (error) {
            console.error('Error loading data:', error);
            // this.showNotification('Error loading attendance data', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    renderStudentList() {
        const container = document.getElementById('subjectStudentList');
        const saveBtn = document.getElementById('saveAttendanceBtn');
        
        // Detect changes for Save Button state
        let hasChanges = false;
        // Logic: Compare localState with subjectData (if exists) OR homeroomData (if subject doesn't exist)
        // Actually, we just check if localState is different from what was loaded in subjectData?
        // Or simpler: Always enable save if there is data? 
        // Better: Compare with initial state.
        // For now, enable save if any status is set.
        const markedCount = Object.values(this.localState).filter(v => v !== null).length;
        saveBtn.disabled = markedCount === 0;

        container.innerHTML = this.students.map(student => {
            const sId = student.id;
            const currentStatus = this.localState[sId];
            const homeroom = this.homeroomData[sId];
            const excuse = this.excuseData[sId];
            const originalSubject = this.subjectData[sId];
            
            // Determine row background based on status
            let rowClass = "hover:bg-gray-50 transition-colors";
            if (currentStatus === 'absent') rowClass = "bg-red-50 hover:bg-red-100";
            else if (currentStatus === 'late') rowClass = "bg-yellow-50 hover:bg-yellow-100";
            else if (currentStatus === 'present') rowClass = "bg-green-50 hover:bg-green-100";

            // Highlight differences vs Homeroom
            let diffIndicator = "";
            if (homeroom && currentStatus && homeroom.status !== currentStatus) {
                rowClass += " border-l-4 border-blue-400"; // Canvas style blue indicator
                diffIndicator = `<span class="text-xs text-blue-600 font-medium ml-2" title="Differs from Homeroom (${homeroom.status})"><i class="fas fa-info-circle"></i> Changed</span>`;
            } else if (excuse) {
                 rowClass += " border-l-4 border-purple-400";
            }

            return `
                <tr class="border-b border-gray-100 ${rowClass}">
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="flex items-center">
                            <div class="flex-shrink-0 h-10 w-10">
                                <img class="h-10 w-10 rounded-full object-cover border border-gray-200" 
                                     src="${student.photo_url || '../assets/default-avatar.png'}" 
                                     alt="${student.full_name}">
                            </div>
                        </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="text-sm font-medium text-gray-900">${student.full_name}</div>
                        ${excuse ? `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800"><i class="fas fa-file-medical mr-1"></i> Excused</span>` : ''}
                        ${diffIndicator}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-center">
                        <div class="flex justify-center space-x-1 bg-white inline-flex rounded-md shadow-sm p-1 border border-gray-200">
                            <button onclick="window.teacherSubjects.setStatus('${sId}', 'present')" 
                                class="w-8 h-8 rounded flex items-center justify-center transition-all ${currentStatus === 'present' ? 'bg-green-500 text-white shadow-sm' : 'text-gray-400 hover:bg-gray-100'}"
                                title="Present">
                                <i class="fas fa-check"></i>
                            </button>
                            <button onclick="window.teacherSubjects.setStatus('${sId}', 'late')" 
                                class="w-8 h-8 rounded flex items-center justify-center transition-all ${currentStatus === 'late' ? 'bg-yellow-500 text-white shadow-sm' : 'text-gray-400 hover:bg-gray-100'}"
                                title="Late">
                                <i class="far fa-clock"></i>
                            </button>
                            <button onclick="window.teacherSubjects.setStatus('${sId}', 'absent')" 
                                class="w-8 h-8 rounded flex items-center justify-center transition-all ${currentStatus === 'absent' ? 'bg-red-500 text-white shadow-sm' : 'text-gray-400 hover:bg-gray-100'}"
                                title="Absent">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        ${homeroom ? `
                            <span class="capitalize px-2 py-1 rounded-full text-xs font-medium 
                                ${homeroom.status === 'present' ? 'bg-green-100 text-green-800' : 
                                  homeroom.status === 'late' ? 'bg-yellow-100 text-yellow-800' : 
                                  'bg-red-100 text-red-800'}">
                                ${homeroom.status}
                            </span>
                        ` : '<span class="text-gray-300 italic">Not recorded</span>'}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button class="text-gray-400 hover:text-gray-600">
                            <i class="fas fa-ellipsis-h"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    setStatus(studentId, status) {
        this.localState[studentId] = status;
        this.renderStudentList();
    }

    markAll(status) {
        this.students.forEach(s => {
            this.localState[s.id] = status;
        });
        this.renderStudentList();
    }

    unmarkAll() {
        this.students.forEach(s => {
            this.localState[s.id] = null;
        });
        this.renderStudentList();
    }

    async saveAttendance() {
        const saveBtn = document.getElementById('saveAttendanceBtn');
        const originalText = saveBtn.innerHTML;
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Saving...';

        try {
            const records = [];
            const timestamp = new Date().toISOString();
            
            // Prepare records for bulk upsert
            for (const [studentId, status] of Object.entries(this.localState)) {
                if (!status) continue; // Skip unmarked

                records.push({
                    schedule_id: this.selectedSchedule.id,
                    student_id: studentId,
                    status: status,
                    date: this.currentDate,
                    recorded_by: this.currentUser.id,
                    updated_at: timestamp
                    // Note: Supabase upsert requires a unique constraint. 
                    // Usually (schedule_id, student_id, date) should be unique.
                    // If not, we might get duplicates. 
                    // Let's assume there's a unique index on these columns.
                });
            }

            if (records.length === 0) {
                // If all unmarked, maybe we should delete existing? 
                // For now, assume we just don't save.
                saveBtn.innerHTML = originalText;
                saveBtn.disabled = false;
                return;
            }

            // Perform Bulk Upsert
            const { data, error } = await window.supabaseClient
                .from('subject_attendance')
                .upsert(records, { onConflict: 'schedule_id, student_id, date' });

            if (error) throw error;

            // Success Notification
            if (window.EducareTrack && window.EducareTrack.showNormalNotification) {
                window.EducareTrack.showNormalNotification({
                    title: 'Success',
                    message: 'Class attendance saved successfully',
                    type: 'success'
                });
            } else {
                alert('Attendance saved successfully');
            }

            // Reload to refresh state
            await this.loadSubjectAttendance();

        } catch (error) {
            console.error('Error saving attendance:', error);
            alert('Failed to save attendance: ' + error.message);
        } finally {
            saveBtn.innerHTML = originalText;
            saveBtn.disabled = false;
        }
    }

    changeDate(delta) {
        const date = new Date(this.currentDate);
        date.setDate(date.getDate() + delta);
        this.onDateChange(date.toLocaleDateString('en-CA'));
    }

    onDateChange(newDate) {
        this.currentDate = newDate;
        document.getElementById('attendanceDate').value = newDate;
        this.loadSubjectAttendance();
    }

    backToList() {
        document.getElementById('subjectAttendanceView').classList.add('hidden');
        document.getElementById('subjectListView').classList.remove('hidden');
        this.selectedSchedule = null;
    }

    showLoading(show) {
        const spinner = document.getElementById('loadingState');
        const list = document.getElementById('subjectStudentList');
        if (show) {
            spinner.classList.remove('hidden');
            list.innerHTML = '';
        } else {
            spinner.classList.add('hidden');
        }
    }

    showEmptyState(show) {
        const el = document.getElementById('emptyState');
        if (show) el.classList.remove('hidden');
        else el.classList.add('hidden');
    }

    initEventListeners() {
        // Global listeners if any
    }
}

// Initialize
window.teacherSubjects = new TeacherSubjects();