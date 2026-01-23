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
        this.loadSettings();
    }

    async loadSettings() {
        try {
            if (window.USE_SUPABASE && window.supabaseClient) {
                const { data } = await window.supabaseClient
                    .from('system_settings')
                    .select('value')
                    .eq('key', 'attendance_schedule')
                    .single();
                if (data) this.settings = data.value;
            } else if (typeof firebase !== 'undefined') {
                const doc = await firebase.firestore().collection('system_settings').doc('attendance_schedule').get();
                if (doc.exists) this.settings = doc.data();
            }
        } catch (e) {
            console.error('Error loading settings', e);
        }
        if (!this.settings) this.settings = this.defaultSchedule;
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
                if (window.USE_SUPABASE && window.supabaseClient) {
                    // Get student class info first
                    const { data: student } = await window.supabaseClient
                        .from('students')
                        .select('class_id')
                        .eq('id', studentId)
                        .single();
                    
                    if (student && student.class_id) {
                        // Get class info for grade/level
                        const { data: classInfo } = await window.supabaseClient
                            .from('classes')
                            .select('grade, level')
                            .eq('id', student.class_id)
                            .single();
                        
                        if (classInfo) {
                            studentData = {
                                class_id: student.class_id,
                                grade: classInfo.grade,
                                level: classInfo.level
                            };
                        }
                    }
                } else if (typeof firebase !== 'undefined') {
                    const doc = await firebase.firestore().collection('students').doc(studentId).get();
                    if (doc.exists) studentData = doc.data();
                }
            }

            const schedule = this.getScheduleForStudent(studentData?.level, studentData?.grade);
            
            const startOfDay = new Date(date);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(date);
            endOfDay.setHours(23, 59, 59, 999);
            let records = [];
            if (window.USE_SUPABASE && window.supabaseClient) {
                const { data, error } = await window.supabaseClient
                    .from('attendance')
                    .select('student_id,entry_type,timestamp,time,session,status')
                    .eq('student_id', studentId)
                    .gte('timestamp', startOfDay.toISOString())
                    .lte('timestamp', endOfDay.toISOString())
                    .order('timestamp', { ascending: true });
                if (error) {
                    throw error;
                }
                records = (data || []).map(r => ({
                    ...r,
                    timestamp: r.timestamp ? new Date(r.timestamp) : null
                }));
            } else {
                const attendanceSnapshot = await firebase.firestore()
                    .collection('attendance')
                    .where('student_id', '==', studentId)
                    .where('timestamp', '>=', startOfDay)
                    .where('timestamp', '<=', endOfDay)
                    .orderBy('timestamp', 'asc')
                    .get();
                records = attendanceSnapshot.docs.map(doc => doc.data());
            }
            
            return this.analyzeAttendance(records, date, schedule);
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
            record.session === 'morning' || 
            (record.time >= morningStart && record.time < morningEnd)
        );

        const afternoonRecords = records.filter(record => 
            record.session === 'afternoon' || 
            (record.time >= afternoonStart && record.time < afternoonEnd)
        );

        const morningEntry = morningRecords.find(record => record.entryType === 'entry');
        const morningExit = morningRecords.find(record => record.entryType === 'exit');
        const afternoonEntry = afternoonRecords.find(record => record.entryType === 'entry');
        const afternoonExit = afternoonRecords.find(record => record.entryType === 'exit');

        const currentTime = new Date();
        const isMorningOver = currentTime >= new Date(date.toDateString() + ' ' + morningEnd);
        const isAfternoonOver = currentTime >= new Date(date.toDateString() + ' ' + afternoonEnd);

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

        // Determine overall status
        if (sessionStatus.morning === 'absent' && sessionStatus.afternoon === 'absent') {
            status = 'absent';
            remarks.push('Full day absence');
        } else if (sessionStatus.morning === 'absent' || sessionStatus.afternoon === 'absent') {
            status = 'half_day';
            remarks.push('Half day absence');
        } else if (sessionStatus.morning === 'late' || sessionStatus.afternoon === 'late') {
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
            const startOfDay = new Date(date);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(date);
            endOfDay.setHours(23, 59, 59, 999);
            let allStudents = [];
            let presentStudentIds = new Set();
            if (window.USE_SUPABASE && window.supabaseClient) {
                const [{ data: students, error: sErr }, { data: entries, error: eErr }] = await Promise.all([
                    window.supabaseClient.from('students').select('id,first_name,last_name,class_id,parent_id,current_status'),
                    window.supabaseClient.from('attendance')
                        .select('student_id,entry_type,timestamp')
                        .gte('timestamp', startOfDay.toISOString())
                        .lte('timestamp', endOfDay.toISOString())
                        .eq('entry_type', 'entry')
                ]);
                if (sErr) throw sErr;
                if (eErr) throw eErr;
                allStudents = (students || []).map(s => ({
                    id: s.id,
                    name: s.name || `${s.first_name || ''} ${s.last_name || ''}`.trim(),
                    class_id: s.class_id,
                    parent_id: s.parent_id,
                    current_status: s.current_status
                }));
                presentStudentIds = new Set((entries || []).map(e => e.student_id));
            } else {
                const studentsSnapshot = await firebase.firestore()
                    .collection('students')
                    .where('current_status', 'not-in', ['withdrawn', 'transferred', 'graduated'])
                    .get();
                allStudents = studentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                const attendanceSnapshot = await firebase.firestore()
                    .collection('attendance')
                    .where('timestamp', '>=', startOfDay)
                    .where('timestamp', '<=', endOfDay)
                    .where('entry_type', '==', 'entry')
                    .get();
                presentStudentIds = new Set();
                attendanceSnapshot.docs.forEach(doc => {
                    presentStudentIds.add(doc.data().student_id);
                });
            }

            // Calculate detailed status for each absent student
            const absentStudents = [];
            for (const student of allStudents) {
                if (!presentStudentIds.has(student.id)) {
                    const status = await this.calculateStudentStatus(student.id, date, student);
                    absentStudents.push({
                        ...student,
                        attendance_status: status
                    });
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
            let records = [];
            if (window.USE_SUPABASE && window.supabaseClient) {
                let q = window.supabaseClient
                    .from('attendance')
                    .select('id,student_id,entry_type,timestamp,time,session,status,remarks,recorded_by,recorded_by_name,manual_entry')
                    .gte('timestamp', startDate.toISOString())
                    .lte('timestamp', endDate.toISOString())
                    .order('timestamp', { ascending: false });
                if (studentId) {
                    q = q.eq('student_id', studentId);
                }
                const { data, error } = await q;
                if (error) throw error;
                records = (data || []).map(r => ({
                    id: r.id,
                    ...r,
                    timestamp: r.timestamp ? new Date(r.timestamp) : null
                }));
            } else {
                let query = firebase.firestore()
                    .collection('attendance')
                    .where('timestamp', '>=', startDate)
                    .where('timestamp', '<=', endDate)
                    .orderBy('timestamp', 'desc');
                if (studentId) {
                    query = query.where('student_id', '==', studentId);
                }
                const snapshot = await query.get();
                records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            }

            // Group by student and date
            const report = {};
            records.forEach(record => {
                const dateObj = record.timestamp instanceof Date ? record.timestamp : (record.timestamp?.toDate ? record.timestamp.toDate() : null);
                const date = (dateObj || new Date()).toDateString();
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
            if (window.USE_SUPABASE && window.supabaseClient) {
                const { data: student, error: sErr } = await window.supabaseClient
                    .from('students')
                    .select('id,first_name,last_name,class_id,parent_id')
                    .eq('id', studentId)
                    .single();
                if (sErr || !student) throw new Error('Student not found');
                const timestamp = new Date(date);
                timestamp.setHours(8, 0, 0, 0);
                const row = {
                    student_id: studentId,
                    class_id: student.class_id || '',
                    entry_type: 'entry',
                    timestamp: timestamp,
                    time: '08:00',
                    session: 'morning',
                    status: 'absent',
                    remarks: reason || 'Marked absent by staff',
                    recorded_by: 'system',
                    recorded_by_name: 'System',
                    manual_entry: true
                };
                const { error } = await window.supabaseClient.from('attendance').insert(row);
                if (error) throw error;
                await this.sendAbsenceNotification({
                    id: student.id,
                    name: `${student.first_name || ''} ${student.last_name || ''}`.trim(),
                    parent_id: student.parent_id
                }, reason);
            } else {
                const studentDoc = await firebase.firestore().collection('students').doc(studentId).get();
                if (!studentDoc.exists) {
                    throw new Error('Student not found');
                }
                const student = studentDoc.data();
                const timestamp = new Date(date);
                timestamp.setHours(8, 0, 0, 0);
                const attendanceData = {
                    student_id: studentId,
                    student_name: `${student.first_name || ''} ${student.last_name || ''}`.trim(),
                    class_id: student.class_id,
                    entry_type: 'absent',
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    time: '08:00',
                    session: 'morning',
                    status: 'absent',
                    remarks: reason || 'Marked absent by staff',
                    recorded_by: 'system',
                    recorded_by_name: 'System',
                    manual_entry: true
                };
                await firebase.firestore().collection('attendance').add(attendanceData);
                await this.sendAbsenceNotification(student, reason);
            }

            return true;
        } catch (error) {
            console.error('Error marking student absent:', error);
            throw error;
        }
    }

    async sendAbsenceNotification(student, reason) {
        try {
            const notificationData = {
                type: 'attendance',
                title: 'Student Absence Reported',
                message: `${student.first_name || ''} ${student.last_name || ''}`.trim() + ` was marked absent. ${reason ? `Reason: ${reason}` : ''}`,
                target_users: [student.parent_id],
                student_id: student.id,
                student_name: `${student.first_name || ''} ${student.last_name || ''}`.trim(),
                is_urgent: true
            };
            if (window.EducareTrack && typeof window.EducareTrack.createNotification === 'function') {
                await window.EducareTrack.createNotification(notificationData);
            } else {
                await firebase.firestore().collection('notifications').add({
                    ...notificationData,
                    created_at: new Date().toISOString()
                });
            }
        } catch (error) {
            console.error('Error sending absence notification:', error);
        }
    }

    getCurrentSession() {
        const now = new Date();
        const currentTime = now.getHours() + ':' + now.getMinutes().toString().padStart(2, '0');
        
        if (currentTime >= '7:30' && currentTime < '12:00') {
            return 'morning';
        } else if (currentTime >= '13:00' && currentTime < '16:00') {
            return 'afternoon';
        }
        
        return 'general';
    }

    isLate(time) {
        return time > '7:30';
    }
}

// Make available globally
window.AttendanceLogic = AttendanceLogic;
