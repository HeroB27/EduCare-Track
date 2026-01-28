// Attendance Logic for EducareTrack
class AttendanceLogic {
    constructor() {
        this.settings = null;
        this.defaultSchedule = {
            kinder_in: '07:30', kinder_out: '11:30',
            g1_3_in: '07:30', g1_3_out: '13:00',
            g4_6_in: '07:30', g4_6_out: '15:00',
            jhs_in: '07:30', jhs_out: '16:00',
            shs_in: '07:30', shs_out: '16:30'
        };
        // Initialize with default settings immediately
        this.settings = { ...this.defaultSchedule };
        // Then try to load from server
        this.settingsLoaded = this.loadSettings();
    }

    async loadSettings() {
        try {
            if (!window.supabaseClient) return;
            
            const { data, error } = await window.supabaseClient
                .from('system_settings')
                .select('value')
                .eq('key', 'attendance_schedule')
                .single();
            
            if (!error && data) {
                this.settings = data.value;
                console.log('Attendance settings loaded:', this.settings);
            }
        } catch (e) {
            console.error('Error loading settings', e);
        }
        // Ensure settings are set (fallback to default if still null)
        if (!this.settings) this.settings = { ...this.defaultSchedule };
    }

    getScheduleForStudent(level, grade) {
        const s = this.settings || this.defaultSchedule;
        
        // Normalize input
        const gradeStr = (grade || '').toString().toLowerCase();
        const levelStr = (level || '').toString().toLowerCase();

        if (levelStr.includes('kinder') || gradeStr.includes('kinder')) {
            return { in: s.kinder_in, out: s.kinder_out };
        }
        
        if (levelStr.includes('senior') || gradeStr.includes('11') || gradeStr.includes('12')) {
            return { in: s.shs_in, out: s.shs_out };
        }

        if (levelStr.includes('junior') || ['7','8','9','10'].some(g => gradeStr.includes(g) && !gradeStr.includes('10') && g!=='1')) {
            // Note: simple check for 7,8,9. 10 is tricky if we just check '1' or '0'.
            // Better parsing:
            const num = parseInt(gradeStr.replace(/\D/g, ''));
            if (num >= 7 && num <= 10) return { in: s.jhs_in, out: s.jhs_out };
        }

        // Elementary parsing
        const num = parseInt(gradeStr.replace(/\D/g, ''));
        if (!isNaN(num)) {
            if (num >= 1 && num <= 3) return { in: s.g1_3_in, out: s.g1_3_out };
            if (num >= 4 && num <= 6) return { in: s.g4_6_in, out: s.g4_6_out };
            if (num >= 7 && num <= 10) return { in: s.jhs_in, out: s.jhs_out }; // Fallback if level check failed
            if (num >= 11 && num <= 12) return { in: s.shs_in, out: s.shs_out };
        }

        // Default to JHS if unknown (safest middle ground?) or maybe G1-3
        return { in: '07:30', out: '16:00' };
    }

    // Calculate student status based on attendance records
    async calculateStudentStatus(studentId, date = new Date(), studentData = null) {
        try {
            // Fetch student data if not provided to determine schedule
            if (!studentData) {
                // Get student class info first
                const { data: student, error: studentError } = await window.supabaseClient
                    .from('students')
                    .select('class_id')
                    .eq('id', studentId)
                    .single();
                
                if (!studentError && student && student.class_id) {
                    // Get class info for grade/level
                    const { data: classInfo, error: classError } = await window.supabaseClient
                        .from('classes')
                        .select('grade, level')
                        .eq('id', student.class_id)
                        .single();
                    
                    if (!classError && classInfo) {
                        studentData = {
                            class_id: student.class_id,
                            grade: classInfo.grade,
                            level: classInfo.level
                        };
                    }
                }
            }

            const schedule = this.getScheduleForStudent(studentData?.level, studentData?.grade);
            
            const startOfDay = new Date(date);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(date);
            endOfDay.setHours(23, 59, 59, 999);
            
            const { data: records, error } = await window.supabaseClient
                .from('attendance')
                .select('student_id, session, status, timestamp')
                .eq('student_id', studentId)
                .gte('timestamp', startOfDay.toISOString())
                .lte('timestamp', endOfDay.toISOString())
                .order('timestamp', { ascending: true });
            
            if (error) throw error;
            
            // Transform data to match expected format
            const transformedRecords = (records || []).map(r => ({
                ...r,
                entryType: r.status === 'out' ? 'exit' : 'entry', // Map status to entryType
                time: new Date(r.timestamp).toTimeString().substring(0, 5)
            }));
            
            return this.analyzeAttendance(transformedRecords, date, schedule);
        } catch (error) {
            console.error('Error calculating student status:', error);
            return { status: 'absent', remarks: 'Error calculating status' };
        }
    }

    analyzeAttendance(records, date, schedule) {
        // Use schedule or defaults
        const morningStart = schedule?.in || '07:30';
        const morningEnd = '12:00'; // Lunch break usually fixed? Or should we assume half day split?
        // Let's assume standard lunch break 12-1
        const afternoonStart = '13:00';
        const afternoonEnd = schedule?.out || '16:00';
        const lateThreshold = morningStart; // Strictly late if after start time

        const morningRecords = records.filter(record => 
            record.session === 'AM' || 
            (record.time >= morningStart && record.time < morningEnd)
        );

        const afternoonRecords = records.filter(record => 
            record.session === 'PM' || 
            (record.time >= afternoonStart && record.time < afternoonEnd)
        );

        const morningEntry = morningRecords.find(record => record.entryType === 'entry');
        const morningExit = morningRecords.find(record => record.entryType === 'exit');
        const afternoonEntry = afternoonRecords.find(record => record.entryType === 'entry');
        const afternoonExit = afternoonRecords.find(record => record.entryType === 'exit');

        const currentTime = new Date();
        const isMorningOver = currentTime >= new Date(date.toDateString() + ' ' + morningEnd);
        const isAfternoonOver = currentTime >= new Date(date.toDateString() + ' ' + afternoonEnd);

        // Check if schedule implies half-day (dismissal before afternoon start)
        // Parse hours to compare
        const dismissalHour = parseInt(afternoonEnd.split(':')[0]);
        const afternoonStartHour = parseInt(afternoonStart.split(':')[0]);
        const isHalfDaySchedule = dismissalHour < afternoonStartHour;

        let status = 'present';
        let remarks = [];
        let sessionStatus = {
            morning: 'present',
            afternoon: 'present'
        };

        // Morning session analysis
        if (morningEntry) {
            if (morningEntry.time > lateThreshold) {
                sessionStatus.morning = 'late';
                remarks.push('Late morning arrival');
            }
        } else {
            if (isMorningOver) {
                sessionStatus.morning = 'absent';
                remarks.push('Absent morning');
            } else {
                sessionStatus.morning = 'not_arrived';
            }
        }

        // Afternoon session analysis
        if (isHalfDaySchedule) {
            sessionStatus.afternoon = 'exempt'; // Or 'not_applicable'
            // For half-day students (Kinder), we don't expect afternoon entry.
            // But we should check if they exited properly? 
            // If they have morning entry but no morning exit/entry in afternoon?
            // Usually they exit around 11:30.
            // If we have morningEntry but NO exit, it's weird but not "absent afternoon".
        } else {
            if (afternoonEntry) {
                if (afternoonEntry.time > afternoonStart) {
                    sessionStatus.afternoon = 'late';
                    remarks.push('Late afternoon arrival');
                }
                
                // Check if student left for lunch and returned late
                if (morningExit && !afternoonEntry) {
                    if (isAfternoonOver) {
                        sessionStatus.afternoon = 'absent';
                        remarks.push('Did not return after lunch');
                    }
                }
            } else {
                if (isAfternoonOver) {
                    sessionStatus.afternoon = 'absent';
                    remarks.push('Absent afternoon');
                } else {
                    sessionStatus.afternoon = 'not_arrived';
                }
            }
        }

        // Determine overall status
        if (sessionStatus.morning === 'absent' && (sessionStatus.afternoon === 'absent' || (isHalfDaySchedule && sessionStatus.morning === 'absent'))) {
             // If half day and absent morning -> Full absent
             status = 'absent';
             remarks.push('Full day absence');
        } else if (sessionStatus.morning === 'absent' && !isHalfDaySchedule && sessionStatus.afternoon !== 'absent') {
             // Absent morning only
             status = 'half_day'; 
             remarks.push('Morning absence');
        } else if (!isHalfDaySchedule && sessionStatus.afternoon === 'absent' && sessionStatus.morning !== 'absent') {
             // Absent afternoon only
             status = 'half_day';
             remarks.push('Afternoon absence');
        } else if (sessionStatus.morning === 'late' || (sessionStatus.afternoon === 'late' && !isHalfDaySchedule)) {
            status = 'late';
        }

        return {
            status: status,
            sessionStatus: sessionStatus,
            remarks: remarks.join(', '),
            records: records
        };
    }

    // Get students who are absent for a specific date
    async getAbsentStudents(date = new Date()) {
        try {
            // First check if it's a school day
            if (window.EducareTrack && typeof window.EducareTrack.isSchoolDay === 'function') {
                // We don't have level info for all students yet, so we do a general check or check per student later
                // For efficiency, check general first (no level passed)
                // If isSchoolDay(date) returns false (meaning NO levels have school), we return empty
                // But isSchoolDay logic might depend on level. 
                // Let's assume if it returns false without level, it means school-wide holiday/weekend
                if (!window.EducareTrack.isSchoolDay(date)) {
                    // Check if it's a level-specific holiday? 
                    // The current implementation of isSchoolDay(date) without level checks for general holidays.
                    // If it returns true, we still need to check per student level.
                } else {
                    // It IS a school day generally, but might be specific level suspension
                }
            }

            const startOfDay = new Date(date);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(date);
            endOfDay.setHours(23, 59, 59, 999);
            
            // Get all enrolled students
            const { data: students, error: sErr } = await window.supabaseClient
                .from('students')
                .select('id, full_name, class_id')
                .in('current_status', ['enrolled', 'active', 'present']);
            
            if (sErr) throw sErr;
            
            // Get today's attendance entries
            const { data: entries, error: eErr } = await window.supabaseClient
                .from('attendance')
                .select('student_id')
                .gte('timestamp', startOfDay.toISOString())
                .lte('timestamp', endOfDay.toISOString())
                .eq('session', 'AM'); // Only check morning entries for presence
            
            if (eErr) throw eErr;
            
            const allStudents = (students || []).map(s => ({
                id: s.id,
                name: s.full_name,
                class_id: s.class_id
            }));
            
            const presentStudentIds = new Set((entries || []).map(e => e.student_id));
            
            // Calculate detailed status for each absent student
            const absentStudents = [];
            for (const student of allStudents) {
                if (!presentStudentIds.has(student.id)) {
                    const status = await this.calculateStudentStatus(student.id, date, student);
                    
                    // Only include if it was actually a school day for them (not 'no_class')
                    if (status.status !== 'no_class') {
                        absentStudents.push({
                            ...student,
                            attendance_status: status
                        });
                    }
                }
            }

            return absentStudents;
        } catch (error) {
            console.error('Error getting absent students:', error);
            return [];
        }
    }

    // Generate attendance report for a date range
    async generateAttendanceReport(startDate, endDate, studentId = null) {
        try {
            let query = window.supabaseClient
                .from('attendance')
                .select('id, student_id, session, status, method, timestamp, recorded_by, students(full_name)')
                .gte('timestamp', startDate.toISOString())
                .lte('timestamp', endDate.toISOString())
                .order('timestamp', { ascending: false });
            
            if (studentId) {
                query = query.eq('student_id', studentId);
            }
            
            const { data, error } = await query;
            
            if (error) throw error;
            
            // Transform data to match expected format
            const records = (data || []).map(r => ({
                id: r.id,
                student_id: r.student_id,
                student_name: r.students?.full_name,
                entryType: r.session === 'AM' ? 'entry' : 'exit',
                entry_type: r.session === 'AM' ? 'entry' : 'exit',
                timestamp: new Date(r.timestamp),
                time: new Date(r.timestamp).toTimeString().substring(0, 5),
                session: r.session,
                status: r.status,
                method: r.method,
                recorded_by: r.recorded_by
            }));

            // Group by student and date
            const report = {};
            records.forEach(record => {
                const dateObj = record.timestamp instanceof Date ? record.timestamp : new Date(record.timestamp);
                const date = dateObj.toDateString();
                if (!report[record.student_id]) {
                    report[record.student_id] = {};
                }
                if (!report[record.student_id][date]) {
                    report[record.student_id][date] = [];
                }
                report[record.student_id][date].push(record);
            });

            return report;
        } catch (error) {
            console.error('Error generating attendance report:', error);
            return {};
        }
    }

    // Mark student as absent manually
    async markStudentAbsent(studentId, date = new Date(), reason = '') {
        try {
            // Get student data
            const { data: student, error: sErr } = await window.supabaseClient
                .from('students')
                .select('id, full_name, class_id')
                .eq('id', studentId)
                .single();
            
            if (sErr || !student) throw new Error('Student not found');
            
            const timestamp = new Date(date);
            timestamp.setHours(8, 0, 0, 0);
            
            const { error } = await window.supabaseClient.from('attendance').insert({
                student_id: studentId,
                class_id: student.class_id || null,
                session: 'AM',
                status: 'absent',
                method: 'manual',
                timestamp: timestamp.toISOString(),
                recorded_by: 'system'
            });
            
            if (error) throw error;
            
            await this.sendAbsenceNotification({
                id: student.id,
                first_name: student.full_name.split(' ')[0],
                last_name: student.full_name.split(' ').slice(1).join(' '),
                full_name: student.full_name
            }, reason);

            return true;
        } catch (error) {
            console.error('Error marking student absent:', error);
            throw error;
        }
    }

    async sendAbsenceNotification(student, reason) {
        try {
            // Get parent-student relationship
            const { data: relationshipData, error: relationshipError } = await window.supabaseClient
                .from('parent_students')
                .select('parent_id')
                .eq('student_id', student.id);
            
            let targetUsers = [];
            if (!relationshipError && relationshipData && relationshipData.length > 0) {
                targetUsers = relationshipData.map(r => r.parent_id);
            }

            // Get homeroom teacher
            if (student.class_id) {
                const { data: classData, error: classError } = await window.supabaseClient
                    .from('classes')
                    .select('adviser_id')
                    .eq('id', student.class_id)
                    .single();
                
                if (!classError && classData && classData.adviser_id) {
                    targetUsers.push(classData.adviser_id);
                }
            }

            // Get admins
            const { data: adminData, error: adminError } = await window.supabaseClient
                .from('profiles')
                .select('id')
                .eq('role', 'admin');
            
            if (!adminError && adminData) {
                const adminIds = adminData.map(a => a.id);
                targetUsers = [...targetUsers, ...adminIds];
            }
            
            // Deduplicate
            targetUsers = [...new Set(targetUsers)].filter(id => id);
            
            if (targetUsers.length === 0) {
                console.warn('No target users found for absence notification');
                return;
            }

            const notificationData = {
                target_users: targetUsers,
                title: 'Student Absence Reported',
                message: `${student.full_name || `${student.first_name || ''} ${student.last_name || ''}`.trim()} was marked absent. ${reason ? `Reason: ${reason}` : ''}`,
                type: 'attendance',
                student_id: student.id
            };
            
            const { error } = await window.supabaseClient
                .from('notifications')
                .insert(notificationData);
            
            if (error) {
                console.error('Error creating notification:', error);
            }
        } catch (error) {
            console.error('Error sending absence notification:', error);
        }
    }

    getCurrentSession() {
        const now = new Date();
        const currentTime = now.getHours() + ':' + now.getMinutes().toString().padStart(2, '0');
        
        if (currentTime >= '7:30' && currentTime < '12:00') {
            return 'AM';
        } else if (currentTime >= '13:00' && currentTime < '16:00') {
            return 'PM';
        }
        
        return 'AM'; // Default to AM if unsure, or maybe handle null
    }

    isLate(time, grade = null, level = null) {
        const s = this.settings || this.defaultSchedule;
        let threshold = null;

        if (grade || level) {
            const g = (grade || '').toString().toLowerCase();
            const l = (level || '').toString().toLowerCase();
            
            if (g.includes('kinder') || l.includes('kinder')) threshold = s.kinder_in;
            else if (l === 'elementary' || l === 'elem') {
                 // Check grade numbers if available
                 if (['1','2','3'].some(num => g.includes(num))) threshold = s.g1_3_in;
                 else if (['4','5','6'].some(num => g.includes(num))) threshold = s.g4_6_in;
                 else threshold = s.g1_3_in; // Default elem
            }
            else if (l === 'jhs' || l.includes('junior')) threshold = s.jhs_in;
            else if (l === 'shs' || l.includes('senior')) threshold = s.shs_in;
            else {
                // Try to guess from grade string if level not precise
                 if (['1','2','3'].some(num => g === num || g === 'grade ' + num)) threshold = s.g1_3_in;
                 else if (['4','5','6'].some(num => g === num || g === 'grade ' + num)) threshold = s.g4_6_in;
                 else if (['7','8','9','10'].some(num => g === num || g === 'grade ' + num)) threshold = s.jhs_in;
                 else if (['11','12'].some(num => g === num || g === 'grade ' + num)) threshold = s.shs_in;
            }
        }

        if (!threshold) {
             // Fallback to earliest time to be safe/strict
             threshold = [s.kinder_in, s.g1_3_in, s.g4_6_in, s.jhs_in, s.shs_in].sort()[0];
        }
        
        return time > threshold;
    }
}

// Make available globally
window.AttendanceLogic = AttendanceLogic;
