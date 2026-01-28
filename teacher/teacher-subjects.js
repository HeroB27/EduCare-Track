class TeacherSubjects {
    constructor() {
        this.currentUser = null;
        this.schedules = [];
        this.selectedSchedule = null;
        this.students = [];
        this.init();
    }

    async init() {
        if (!await this.checkAuth()) return;
        await this.loadSchedules();
        this.initEventListeners();
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
                        section,
                        level
                    )
                `)
                .eq('teacher_id', this.currentUser.id);

            if (error) throw error;
            this.schedules = data;
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
            <div class="bg-white p-4 rounded-lg shadow cursor-pointer hover:bg-gray-50 transition" onclick="window.teacherSubjects.selectSchedule('${schedule.id}')">
                <h3 class="font-bold text-lg">${schedule.subject}</h3>
                <p class="text-gray-600">${schedule.classes.grade} - ${schedule.classes.section || ''}</p>
                <p class="text-sm text-gray-500">${schedule.day_of_week || 'Daily'} • ${schedule.start_time || ''}-${schedule.end_time || ''}</p>
            </div>
        `).join('');
    }

    async selectSchedule(scheduleId) {
        this.selectedSchedule = this.schedules.find(s => s.id === scheduleId);
        document.getElementById('selectedSubjectTitle').textContent = `${this.selectedSchedule.subject} - ${this.selectedSchedule.classes.grade}`;
        document.getElementById('subjectAttendanceView').classList.remove('hidden');
        document.getElementById('subjectListView').classList.add('hidden');
        
        await this.loadSubjectAttendance();
    }

    async loadSubjectAttendance() {
        try {
            // Get students in the class
            const { data: students, error: sErr } = await window.supabaseClient
                .from('students')
                .select('id, full_name, photo_url')
                .eq('class_id', this.selectedSchedule.classes.id)
                .eq('is_active', true)
                .order('full_name');

            if (sErr) throw sErr;
            this.students = students;

            // Get existing attendance for today
            const today = new Date().toLocaleDateString('en-CA');
            const { data: attendance, error: aErr } = await window.supabaseClient
                .from('subject_attendance')
                .select('student_id, status')
                .eq('schedule_id', this.selectedSchedule.id)
                .eq('date', today);

            if (aErr) throw aErr;

            const attendanceMap = {};
            attendance.forEach(r => attendanceMap[r.student_id] = r.status);

            this.renderStudentList(attendanceMap);
        } catch (error) {
            console.error('Error loading subject attendance:', error);
        }
    }

    renderStudentList(attendanceMap) {
        const container = document.getElementById('subjectStudentList');
        container.innerHTML = this.students.map(student => {
            const status = attendanceMap[student.id] || 'pending';
            return `
                <div class="flex items-center justify-between p-3 border-b hover:bg-gray-50">
                    <div class="flex items-center">
                        <img src="${student.photo_url || '../assets/default-avatar.png'}" class="w-8 h-8 rounded-full mr-3">
                        <span class="font-medium">${student.full_name}</span>
                    </div>
                    <div class="flex space-x-2">
                        <button onclick="window.teacherSubjects.markStatus('${student.id}', 'present')" 
                            class="px-3 py-1 rounded ${status === 'present' ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-700'}">P</button>
                        <button onclick="window.teacherSubjects.markStatus('${student.id}', 'late')" 
                            class="px-3 py-1 rounded ${status === 'late' ? 'bg-yellow-500 text-white' : 'bg-gray-200 text-gray-700'}">L</button>
                        <button onclick="window.teacherSubjects.markStatus('${student.id}', 'absent')" 
                            class="px-3 py-1 rounded ${status === 'absent' ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-700'}">A</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    async markStatus(studentId, status) {
        try {
            // Check if today is a school day
            const todayDate = new Date();
            const classLevel = this.selectedSchedule?.classes?.level;
            const isSchoolDay = window.EducareTrack ? window.EducareTrack.isSchoolDay(todayDate, classLevel) : true;
            if (!isSchoolDay) {
                if (!confirm('Today is marked as a non-school day (Holiday/Weekend/Break) for this level. Are you sure you want to mark attendance?')) {
                    return;
                }
            }

            const today = todayDate.toLocaleDateString('en-CA');
            
            // Check if record exists
            const { data: existing } = await window.supabaseClient
                .from('subject_attendance')
                .select('id')
                .eq('schedule_id', this.selectedSchedule.id)
                .eq('student_id', studentId)
                .eq('date', today)
                .single();

            if (existing) {
                await window.supabaseClient
                    .from('subject_attendance')
                    .update({ status: status, recorded_by: this.currentUser.id })
                    .eq('id', existing.id);
            } else {
                await window.supabaseClient
                    .from('subject_attendance')
                    .insert({
                        schedule_id: this.selectedSchedule.id,
                        student_id: studentId,
                        status: status,
                        date: today,
                        recorded_by: this.currentUser.id
                    });
            }
            
            // Refresh view
            await this.loadSubjectAttendance();
        } catch (error) {
            console.error('Error marking status:', error);
            alert('Failed to update status');
        }
    }
    
    backToList() {
        document.getElementById('subjectAttendanceView').classList.add('hidden');
        document.getElementById('subjectListView').classList.remove('hidden');
        this.selectedSchedule = null;
    }

    initEventListeners() {
        // Add any global listeners here
    }
}

window.teacherSubjects = new TeacherSubjects();
