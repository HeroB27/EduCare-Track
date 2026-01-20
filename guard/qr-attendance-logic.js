// Attendance Logic for EducareTrack
class AttendanceLogic {
    constructor() {
        this.morningStart = '7:30';
        this.morningEnd = '12:00';
        this.afternoonStart = '13:00';
        this.afternoonEnd = '16:00';
        this.lateThreshold = '7:30';
    }

    // Calculate student status based on attendance records
    async calculateStudentStatus(studentId, date = new Date()) {
        try {
            const startOfDay = new Date(date);
            startOfDay.setHours(0, 0, 0, 0);
            
            const endOfDay = new Date(date);
            endOfDay.setHours(23, 59, 59, 999);

            // Get all attendance records for the student on this date
            const attendanceSnapshot = await firebase.firestore()
                .collection('attendance')
                .where('studentId', '==', studentId)
                .where('timestamp', '>=', startOfDay)
                .where('timestamp', '<=', endOfDay)
                .orderBy('timestamp', 'asc')
                .get();

            const records = attendanceSnapshot.docs.map(doc => doc.data());
            
            return this.analyzeAttendance(records, date);
        } catch (error) {
            console.error('Error calculating student status:', error);
            return { status: 'absent', remarks: 'Error calculating status' };
        }
    }

    analyzeAttendance(records, date) {
        const morningRecords = records.filter(record => 
            record.session === 'morning' || 
            (record.time >= this.morningStart && record.time < this.morningEnd)
        );

        const afternoonRecords = records.filter(record => 
            record.session === 'afternoon' || 
            (record.time >= this.afternoonStart && record.time < this.afternoonEnd)
        );

        const morningEntry = morningRecords.find(record => record.entryType === 'entry');
        const morningExit = morningRecords.find(record => record.entryType === 'exit');
        const afternoonEntry = afternoonRecords.find(record => record.entryType === 'entry');
        const afternoonExit = afternoonRecords.find(record => record.entryType === 'exit');

        const currentTime = new Date();
        const isMorningOver = currentTime >= new Date(date.toDateString() + ' ' + this.morningEnd);
        const isAfternoonOver = currentTime >= new Date(date.toDateString() + ' ' + this.afternoonEnd);

        let status = 'present';
        let remarks = [];
        let sessionStatus = {
            morning: 'present',
            afternoon: 'present'
        };

        // Morning session analysis
        if (morningEntry) {
            if (morningEntry.time > this.lateThreshold) {
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
            if (afternoonEntry.time > this.afternoonStart) {
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

            // Get all active students
            const studentsSnapshot = await firebase.firestore()
                .collection('students')
                .where('isActive', '==', true)
                .get();

            const allStudents = studentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Get today's attendance entries
            const attendanceSnapshot = await firebase.firestore()
                .collection('attendance')
                .where('timestamp', '>=', startOfDay)
                .where('timestamp', '<=', endOfDay)
                .where('entryType', '==', 'entry')
                .get();

            const presentStudentIds = new Set();
            attendanceSnapshot.docs.forEach(doc => {
                presentStudentIds.add(doc.data().studentId);
            });

            // Calculate detailed status for each absent student
            const absentStudents = [];
            for (const student of allStudents) {
                if (!presentStudentIds.has(student.id)) {
                    const status = await this.calculateStudentStatus(student.id, date);
                    absentStudents.push({
                        ...student,
                        attendanceStatus: status
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
            let query = firebase.firestore()
                .collection('attendance')
                .where('timestamp', '>=', startDate)
                .where('timestamp', '<=', endDate)
                .orderBy('timestamp', 'desc');

            if (studentId) {
                query = query.where('studentId', '==', studentId);
            }

            const snapshot = await query.get();
            const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Group by student and date
            const report = {};
            records.forEach(record => {
                const date = record.timestamp.toDate().toDateString();
                if (!report[record.studentId]) {
                    report[record.studentId] = {};
                }
                if (!report[record.studentId][date]) {
                    report[record.studentId][date] = [];
                }
                report[record.studentId][date].push(record);
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
            const studentDoc = await firebase.firestore().collection('students').doc(studentId).get();
            if (!studentDoc.exists) {
                throw new Error('Student not found');
            }

            const student = studentDoc.data();
            const timestamp = new Date(date);
            timestamp.setHours(8, 0, 0, 0); // Set to 8:00 AM

            const attendanceData = {
                studentId: studentId,
                studentName: student.name,
                classId: student.classId,
                entryType: 'absent',
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                time: '08:00',
                session: 'morning',
                status: 'absent',
                remarks: reason || 'Marked absent by staff',
                recordedBy: 'system',
                recordedByName: 'System',
                manualEntry: true
            };

            await firebase.firestore().collection('attendance').add(attendanceData);

            // Send notification to parent
            await this.sendAbsenceNotification(student, reason);

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
                message: `${student.name} was marked absent. ${reason ? `Reason: ${reason}` : ''}`,
                targetUsers: [student.parentId],
                studentId: student.id,
                studentName: student.name,
                isUrgent: true,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            await firebase.firestore().collection('notifications').add(notificationData);
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

// Enhanced method to get basic absent students (compatible with QR scanner)
async getAbsentStudents(date = new Date()) {
    try {
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        // Get all active students
        const studentsSnapshot = await firebase.firestore()
            .collection('students')
            .where('isActive', '==', true)
            .get();

        const allStudents = studentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Get today's attendance entries
        const attendanceSnapshot = await firebase.firestore()
            .collection('attendance')
            .where('timestamp', '>=', startOfDay)
            .where('timestamp', '<=', endOfDay)
            .where('entryType', '==', 'entry')
            .get();

        const presentStudentIds = new Set();
        attendanceSnapshot.docs.forEach(doc => {
            presentStudentIds.add(doc.data().studentId);
        });

        // Calculate detailed status for each absent student
        const absentStudents = [];
        for (const student of allStudents) {
            if (!presentStudentIds.has(student.id)) {
                const status = await this.calculateStudentStatus(student.id, date);
                absentStudents.push({
                    ...student,
                    attendanceStatus: status
                });
            }
        }

        return absentStudents;
    } catch (error) {
        console.error('Error getting absent students:', error);
        return [];
    }
}

}

// Make available globally
window.AttendanceLogic = AttendanceLogic;