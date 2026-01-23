// data-initializer.js - EducareTrack Dummy Data Generator
// COMPLETE K-12 DATA WITH REALISTIC CURRICULUM STRUCTURE
// Updated for new normalized schema and extensive dummy data

const DataInitializer = {
    async initializeDummyData() {
        try {
            this.log('Starting EducareTrack Data Initialization...', 'info');
            if (!window.supabaseClient) {
                throw new Error('Supabase client not initialized');
            }

            // Verify connection first
            const { error } = await window.supabaseClient.from('profiles').select('count', { count: 'exact', head: true });
            if (error && error.code !== 'PGRST205' && error.code !== '42P01') {
                 // PGRST205/42P01 means table missing, which is handled in robustUpsert
                 // Other errors might indicate connection issues
                 console.warn('Connection check warning:', error);
            }

            const classes = await this.createClassesV2();
            const systemUsers = await this.createSystemUsersV2();
            const teachers = await this.createTeachersV2(classes);
            await this.assignTeachersToClasses(classes, teachers);
            await this.createParentsAndStudentsV2(classes);
            await this.createSettingsV2();
            await this.createAnnouncementsV2(systemUsers.adminIds);
            await this.createAttendanceV2();
            await this.createExcuseLettersV2();
            await this.createNotificationsV2(systemUsers.adminIds);
            await this.createClinicVisitsV2(systemUsers.clinicIds);
            
            this.log('✅ EducareTrack Data Initialization Complete!', 'success');
            return true;
        } catch (error) {
            console.error('❌ Data initialization failed:', error);
            this.log('❌ Data initialization failed: ' + error.message, 'error');
            return false;
        }
    },

    log(message, type = 'info') {
        console.log(`[${type.toUpperCase()}] ${message}`);
        if (typeof logProgress === 'function') {
            logProgress(message, type);
        }
    },

    isTableMissingError(error) {
        // 42P01 is Postgres undefined_table
        // PGRST205 is PostgREST error for resource not found (can happen if table missing)
        return error && (error.code === '42P01' || error.code === 'PGRST205');
    },

    async generateDeterministicUUID(seed) {
        const msgBuffer = new TextEncoder().encode(seed);
        const hashBuffer = await crypto.subtle.digest('SHA-1', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return `${hashHex.slice(0, 8)}-${hashHex.slice(8, 12)}-${hashHex.slice(12, 16)}-${hashHex.slice(16, 20)}-${hashHex.slice(20, 32)}`;
    },

    async upsertRows(table, rows, conflictKey) {
        if (!rows || rows.length === 0) return;
        // Batch rows if too large (Supabase limit is typically around 1000 records per request depending on payload size)
        const batchSize = 100;
        for (let i = 0; i < rows.length; i += batchSize) {
            const batch = rows.slice(i, i + batchSize);
            const opts = conflictKey ? { onConflict: conflictKey } : undefined;
            const { error } = await window.supabaseClient.from(table).upsert(batch, opts);
            if (error) {
                console.error(`Error upserting to ${table} (batch ${i}):`, error);
                throw error;
            }
        }
    },

    async robustUpsert(tableSnake, rowsSnake, tableCamel, rowsCamel, conflictKey) {
        // Simplified for this version as we are targeting the new schema directly
        await this.upsertRows(tableSnake, rowsSnake, conflictKey);
        this.log(`✅ Seeded ${tableSnake}`, 'success');
    },

    async createSystemUsersV2() {
        const now = new Date().toISOString();
        const profiles = [];
        const adminStaff = [];
        const guards = [];
        const clinicStaff = [];
        
        const adminIds = [];
        const guardIds = [];
        const clinicIds = [];

        // 1. Create 2 Admins
        const adminNames = ['Dr. Maria Santos', 'Mr. Robert Garcia'];
        for (let i = 0; i < 2; i++) {
            const seed = `admin-${i}@educaretrack.edu.ph`;
            const id = await this.generateDeterministicUUID(seed);
            adminIds.push(id);
            
            profiles.push({
                id: id,
                role: 'admin',
                full_name: adminNames[i],
                username: `admin${i+1}`,
                email: seed,
                password: 'password123',
                phone: `+63912345678${i}`,
                is_active: true,
                created_at: now,
                updated_at: now
            });

            adminStaff.push({
                id: id,
                position: i === 0 ? 'Principal' : 'Administrator',
                permissions: { all: true },
                created_at: now
            });
        }

        // 2. Create 3 Guards
        const guardNames = ['Juan Dela Cruz', 'Pedro Penduko', 'Cardo Dalisay'];
        const shifts = ['Morning', 'Afternoon', 'Night'];
        const gates = ['Main Gate', 'Back Gate', 'Main Gate'];
        
        for (let i = 0; i < 3; i++) {
            const seed = `guard-${i}@educaretrack.edu.ph`;
            const id = await this.generateDeterministicUUID(seed);
            guardIds.push(id);

            profiles.push({
                id: id,
                role: 'guard',
                full_name: guardNames[i],
                username: `guard${i+1}`,
                email: seed,
                password: 'password123',
                phone: `+63912345679${i}`,
                is_active: true,
                created_at: now,
                updated_at: now
            });

            guards.push({
                id: id,
                shift: shifts[i],
                assigned_gate: gates[i],
                created_at: now
            });
        }

        // 3. Create 2 Clinic Staff
        const clinicNames = ['Nurse Anna Reyes', 'Dr. Jose Rizal'];
        const positions = ['School Nurse', 'School Physician'];
        
        for (let i = 0; i < 2; i++) {
            const seed = `clinic-${i}@educaretrack.edu.ph`;
            const id = await this.generateDeterministicUUID(seed);
            clinicIds.push(id);

            profiles.push({
                id: id,
                role: 'clinic',
                full_name: clinicNames[i],
                username: `clinic${i+1}`,
                password: 'password123',
                phone: `+63912345680${i}`,
                is_active: true,
                created_at: now,
                updated_at: now
            });

            clinicStaff.push({
                id: id,
                license_no: `LIC-${1000 + i}`,
                position: positions[i],
                created_at: now
            });
        }

        // Upsert all system users
        await this.upsertRows('profiles', profiles);
        this.log('✅ Seeded profiles (System Users)', 'success');

        await this.upsertRows('admin_staff', adminStaff);
        this.log('✅ Seeded admin_staff', 'success');

        await this.upsertRows('guards', guards);
        this.log('✅ Seeded guards', 'success');

        await this.upsertRows('clinic_staff', clinicStaff);
        this.log('✅ Seeded clinic_staff', 'success');

        return { adminIds, guardIds, clinicIds };
    },

    async createClassesV2() {
        const now = new Date().toISOString();
        // 19 Classes defined - Sections removed, SHS strands expanded
        const classesData = [
            { id: 'KINDER', level: 'Kindergarten', grade: 'Kindergarten', strand: null },
            { id: 'G1', level: 'Elementary', grade: 'Grade 1', strand: null },
            { id: 'G2', level: 'Elementary', grade: 'Grade 2', strand: null },
            { id: 'G3', level: 'Elementary', grade: 'Grade 3', strand: null },
            { id: 'G4', level: 'Elementary', grade: 'Grade 4', strand: null },
            { id: 'G5', level: 'Elementary', grade: 'Grade 5', strand: null },
            { id: 'G6', level: 'Elementary', grade: 'Grade 6', strand: null },
            { id: 'G7', level: 'Junior High School', grade: 'Grade 7', strand: null },
            { id: 'G8', level: 'Junior High School', grade: 'Grade 8', strand: null },
            { id: 'G9', level: 'Junior High School', grade: 'Grade 9', strand: null },
            { id: 'G10', level: 'Junior High School', grade: 'Grade 10', strand: null },
            
            // Senior High School - Grade 11
            { id: 'G11-STEM', level: 'Senior High School', grade: 'Grade 11 (STEM)', strand: 'STEM' },
            { id: 'G11-HUMSS', level: 'Senior High School', grade: 'Grade 11 (HUMSS)', strand: 'HUMSS' },
            { id: 'G11-ABM', level: 'Senior High School', grade: 'Grade 11 (ABM)', strand: 'ABM' },
            { id: 'G11-ICT', level: 'Senior High School', grade: 'Grade 11 (ICT)', strand: 'TVL_ICT' },

            // Senior High School - Grade 12
            { id: 'G12-STEM', level: 'Senior High School', grade: 'Grade 12 (STEM)', strand: 'STEM' },
            { id: 'G12-HUMSS', level: 'Senior High School', grade: 'Grade 12 (HUMSS)', strand: 'HUMSS' },
            { id: 'G12-ABM', level: 'Senior High School', grade: 'Grade 12 (ABM)', strand: 'ABM' },
            { id: 'G12-ICT', level: 'Senior High School', grade: 'Grade 12 (ICT)', strand: 'TVL_ICT' }
        ];
        
        const classesSnake = classesData.map(c => ({
            id: c.id,
            grade: c.grade,
            strand: c.strand,
            is_active: true,
            created_at: now
        }));

        await this.upsertRows('classes', classesSnake);
        this.log('✅ Seeded classes (Complete SHS Strands)', 'success');
        return classesData;
    },

    async createTeachersV2(classes) {
        const now = new Date().toISOString();
        const currentYear = new Date().getFullYear();
        
        // Expanded list of teachers to cover classes and subjects
        const firstNames = ['Mark', 'Liza', 'Erwin', 'Rose', 'John', 'Sarah', 'Michael', 'Jessica', 'David', 'Jennifer', 'James', 'Lisa', 'Robert', 'Mary', 'William', 'Karen', 'Joseph', 'Nancy', 'Thomas', 'Betty', 'Charles', 'Margaret', 'Christopher', 'Sandra', 'Daniel', 'Ashley', 'Matthew', 'Kimberly', 'Anthony', 'Donna'];
        const lastNames = ['Dela Peña', 'Ramos', 'Cruz', 'Villanueva', 'Santos', 'Reyes', 'Bautista', 'Ocampo', 'Garcia', 'Mendoza', 'Torres', 'Flores', 'Gonzales', 'Lopez', 'Castillo', 'Tan', 'Lim', 'Sy', 'Chua', 'Aquino', 'Pascual', 'Salazar', 'Rivera', 'Martinez', 'Delos Santos', 'Diaz', 'Rodriguez', 'Perez', 'Sanchez', 'Hernandez'];
        
        // Define specific capabilities for the first 19 teachers to match the 19 classes
        // Order matches createClassesV2: Kinder, G1-G6, G7-G10, G11 (STEM, HUMSS, ABM, ICT), G12 (STEM, HUMSS, ABM, ICT)
        const adviserCapabilities = [
            ['Kindergarten Education', 'Values Education', 'Arts'], // Kinder
            ['General Education', 'English', 'Math', 'Science'], // G1
            ['General Education', 'Filipino', 'Araling Panlipunan'], // G2
            ['General Education', 'Math', 'Science'], // G3
            ['General Education', 'English', 'Reading'], // G4
            ['General Education', 'Science', 'Health'], // G5
            ['General Education', 'Math', 'TLE'], // G6
            ['English', 'Literature', 'Journalism'], // G7
            ['Math', 'Algebra', 'Geometry'], // G8
            ['Science', 'Biology', 'Earth Science'], // G9
            ['Araling Panlipunan', 'World History', 'Economics'], // G10
            
            // G11 Advisers
            ['Pre-Calculus', 'Basic Calculus', 'General Chemistry'], // G11 STEM
            ['Philippine Politics', 'Creative Writing', 'Disaster Readiness'], // G11 HUMSS
            ['Fundamentals of ABM', 'Business Math', 'Organization and Management'], // G11 ABM
            ['Programming 1', 'Computer Servicing', 'Animation'], // G11 ICT
            
            // G12 Advisers
            ['General Physics', 'Biology', 'Research Project'], // G12 STEM
            ['Trends', 'Community Engagement', 'Work Immersion'], // G12 HUMSS
            ['Applied Economics', 'Business Finance', 'Principles of Marketing'], // G12 ABM
            ['Programming 2', 'ICT Project', 'Empowerment Technologies'] // G12 ICT
        ];

        // Filler capabilities for the remaining teachers
        const fillerCapabilities = [
            ['PE', 'Health', 'Music', 'Arts'],
            ['Computer Science', 'Programming', 'Robotics'],
            ['Library Science', 'Research'],
            ['Guidance', 'Values Education'],
            ['Filipino', 'Panitikan']
        ];

        const profiles = [];
        const teachers = [];

        // Create 30 teachers
        for (let i = 0; i < 30; i++) {
            const firstName = firstNames[i % firstNames.length];
            const lastName = lastNames[i % lastNames.length];
            
            let capabilities;
            if (i < 19) {
                // First 19 are advisers matched to classes
                capabilities = adviserCapabilities[i];
            } else {
                // Rest are subject teachers
                capabilities = fillerCapabilities[i % fillerCapabilities.length];
            }
            
            const seed = `teacher-${i}`;
            const id = await this.generateDeterministicUUID(seed);
            
            const fullName = `${firstName} ${lastName}`;

            profiles.push({
                id,
                role: 'teacher',
                full_name: fullName,
                username: `teacher${i+1}`,
                password: 'password123',
                phone: `+639555${(i+1).toString().padStart(2, '0')}000`,
                is_active: true,
                created_at: now,
                updated_at: now
            });

            teachers.push({
                id,
                employee_no: `TCH-${currentYear}-${(i+1).toString().padStart(3, '0')}`,
                assigned_subjects: capabilities,
                is_homeroom: false, // Will be updated in assignTeachersToClasses
                created_at: now
            });
        }

        await this.upsertRows('profiles', profiles);
        this.log('✅ Seeded profiles (Teachers)', 'success');
        
        await this.upsertRows('teachers', teachers);
        this.log('✅ Seeded teachers', 'success');
        
        return teachers;
    },

    async assignTeachersToClasses(classes, teachers) {
        this.log('Assigning teachers to classes...', 'info');
        
        // Assign first 15 teachers as advisers for the 15 classes
        const updates = [];
        const teacherUpdates = [];

        for (let i = 0; i < classes.length; i++) {
            const cls = classes[i];
            const teacher = teachers[i];
            
            if (teacher) {
                // Update Class with adviser_id
                updates.push(
                    window.supabaseClient
                        .from('classes')
                        .update({ adviser_id: teacher.id })
                        .eq('id', cls.id)
                );
                
                // Update Teacher as homeroom adviser
                teacherUpdates.push(
                    window.supabaseClient
                        .from('teachers')
                        .update({ is_homeroom: true })
                        .eq('id', teacher.id)
                );
            }
        }

        await Promise.all([...updates, ...teacherUpdates]);
        this.log('✅ Assigned teachers to classes', 'success');
    },

    async createParentsAndStudentsV2(classes) {
        const now = new Date().toISOString();
        const currentYear = new Date().getFullYear();
        
        const profiles = [];
        const parents = [];
        const students = [];
        const parentStudents = [];

        // Realistic Names for Data Generation
        const firstNames = ['James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda', 'David', 'Elizabeth', 'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Charles', 'Karen', 'Christopher', 'Nancy', 'Daniel', 'Lisa', 'Matthew', 'Betty', 'Anthony', 'Margaret', 'Mark', 'Sandra'];
        const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson'];

        let studentCounter = 0;

        // Loop through each class
        for (const cls of classes) {
            // Create 10 students per class
            for (let i = 0; i < 10; i++) {
                studentCounter++;
                const seedSuffix = `${cls.id}-${i}`;
                
                // Parent Data
                const parentSeed = `parent-${seedSuffix}`;
                const parentId = await this.generateDeterministicUUID(parentSeed);
                
                // Generate random parent name
                const pFirst = firstNames[Math.floor(Math.random() * firstNames.length)];
                const pLast = lastNames[Math.floor(Math.random() * lastNames.length)];
                const parentName = `${pFirst} ${pLast}`; 
                
                profiles.push({
                    id: parentId,
                    role: 'parent',
                    full_name: parentName,
                    username: `parent${studentCounter}`,
                    email: `${parentSeed}@educaretrack.edu.ph`,
                    password: 'password123',
                    phone: `+639999${(studentCounter % 90).toString().padStart(2, '0')}000`,
                    is_active: true,
                    created_at: now,
                    updated_at: now
                });

                parents.push({
                    id: parentId,
                    address: '123 Sample Street, Manila',
                    occupation: 'Employee',
                    created_at: now
                });

                // Student Data
                const studentId = `EDU-${currentYear}-${studentCounter.toString().padStart(4, '0')}`;
                const lrn = `136${studentCounter.toString().padStart(9, '0')}`;
                
                // Generate random student name (same last name as parent usually)
                const sFirst = firstNames[Math.floor(Math.random() * firstNames.length)];
                const studentName = `${sFirst} ${pLast}`;
                
                students.push({
                    id: studentId,
                    lrn: lrn,
                    full_name: studentName,
                    gender: i % 2 === 0 ? 'Male' : 'Female',
                    birth_date: '2015-01-01', // Simplified
                    address: '123 Sample Street, Manila',
                    class_id: cls.id,
                    strand: cls.strand,
                    current_status: 'enrolled',
                    photo_url: null,
                    created_at: now,
                    updated_at: now
                });

                // Parent-Student Link
                parentStudents.push({
                    parent_id: parentId,
                    student_id: studentId,
                    relationship: 'Parent'
                });
            }
        }

        // Upsert profiles (Parents)
        await this.upsertRows('profiles', profiles);
        this.log('✅ Seeded profiles (Parents)', 'success');

        // Upsert parents
        await this.upsertRows('parents', parents);
        this.log('✅ Seeded parents', 'success');

        // Upsert students
        await this.upsertRows('students', students);
        this.log('✅ Seeded students', 'success');

        // Upsert parent_students
        await this.upsertRows('parent_students', parentStudents);
        this.log('✅ Seeded parent_students', 'success');
        
        return students;
    },

    async createSettingsV2() {
        const schedule = {
            kinder_in: '07:30', kinder_out: '11:30',
            g1_3_in: '07:30', g1_3_out: '13:00',
            g4_6_in: '07:30', g4_6_out: '15:00',
            jhs_in: '07:30', jhs_out: '16:00',
            shs_in: '07:30', shs_out: '16:30'
        };
        const calendar = { enableSaturdayClasses: false, enableSundayClasses: false };
        
        const settings = [
            { key: 'attendance_schedule', value: schedule, updated_at: new Date().toISOString() },
            { key: 'calendar_settings', value: calendar, updated_at: new Date().toISOString() }
        ];

        try {
            await this.upsertRows('system_settings', settings);
            this.log('✅ Seeded system_settings', 'success');
        } catch (error) {
            console.error('Error seeding settings:', error);
        }
    },

    async createAnnouncementsV2(adminIds) {
        const now = new Date().toISOString();
        const adminId = adminIds && adminIds.length > 0 ? adminIds[0] : await this.generateDeterministicUUID('admin-0@educaretrack.edu.ph');
        
        const announcements = [
            {
                id: await this.generateDeterministicUUID('ann-001'),
                title: 'Welcome to the new term',
                message: 'Classes resume this Monday. Please check the updated schedules.',
                audience: ['all'],
                priority: 'normal',
                created_by: adminId,
                created_at: now,
                is_active: true
            },
            {
                id: await this.generateDeterministicUUID('ann-002'),
                title: 'Senior High Strand Orientation',
                message: 'Orientation for Grade 11 strands will be held on Friday.',
                audience: ['teachers'],
                priority: 'high',
                created_by: adminId,
                created_at: now,
                is_active: true
            },
            {
                id: await this.generateDeterministicUUID('ann-003'),
                title: 'Health and Safety Guidelines',
                message: 'Please wear masks at all times in common areas.',
                audience: ['all'],
                priority: 'high',
                created_by: adminId,
                created_at: now,
                is_active: true
            },
            {
                id: await this.generateDeterministicUUID('ann-004'),
                title: 'PTA Meeting',
                message: 'PTA meeting scheduled for next Saturday at 9 AM.',
                audience: ['parents'],
                priority: 'normal',
                created_by: adminId,
                created_at: now,
                is_active: true
            }
        ];

        await this.upsertRows('announcements', announcements);
        this.log('✅ Seeded announcements', 'success');
    },

    async createAttendanceV2() {
        try {
            const { data: students } = await window.supabaseClient
                .from('students')
                .select('id,class_id');
            
            if (!students || students.length === 0) return;

            const startDate = new Date('2025-11-01');
            const endDate = new Date(); // Today
            const records = [];

            // Get an admin ID for recorded_by
            const adminId = await this.generateDeterministicUUID('admin-0@educaretrack.edu.ph');

            // Iterate dates from Nov 2025 to now
            for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                // Skip weekends
                if (d.getDay() === 0 || d.getDay() === 6) continue;
                
                const dateStr = d.toISOString().split('T')[0];

                for (const s of students) {
                    const rand = Math.random();
                    let status = 'present';
                    if (rand > 0.95) status = 'absent';
                    else if (rand > 0.90) status = 'late';

                    const id = await this.generateDeterministicUUID(`${s.id}-${dateStr}`);
                    const timestamp = new Date(dateStr + 'T08:00:00').toISOString();

                    records.push({
                        id,
                        student_id: s.id,
                        class_id: s.class_id,
                        session: 'AM',
                        status: status,
                        method: 'manual',
                        timestamp: timestamp,
                        recorded_by: adminId,
                        remarks: status === 'late' ? 'Late arrival' : null
                    });
                }
            }

            // Batch upsert
            await this.upsertRows('attendance', records);
            this.log('✅ Seeded attendance', 'success');
        } catch (error) {
             console.error('Error seeding attendance:', error);
        }
    },

    async createExcuseLettersV2() {
        try {
             // Get parent-student links
             const { data: links } = await window.supabaseClient
                .from('parent_students')
                .select('student_id,parent_id');
            
             if (!links || links.length === 0) return;

             // Get absences
             const { data: absences } = await window.supabaseClient
                .from('attendance')
                .select('*')
                .eq('status', 'absent')
                .order('timestamp', { ascending: false })
                .limit(50); // Just create letters for recent 50 absences

             if (!absences || absences.length === 0) {
                 this.log('No absences found to create excuse letters for.', 'warning');
                 return;
             }
             
             const letters = [];

             for (const abs of absences) {
                 const link = links.find(l => l.student_id === abs.student_id);
                 if (!link) continue;
                 
                 const id = await this.generateDeterministicUUID(`excuse-${abs.student_id}-${abs.timestamp}`);
                 const reasons = ['Fever', 'Family Emergency', 'Flu', 'Medical Appointment'];
                 const reason = reasons[Math.floor(Math.random() * reasons.length)];
                 
                 const absenceDate = new Date(abs.timestamp);
                 
                 letters.push({
                     id: id,
                     student_id: abs.student_id,
                     parent_id: link.parent_id,
                     reason: reason,
                     dates: [absenceDate.toISOString()],
                     status: Math.random() > 0.5 ? 'approved' : 'pending',
                     created_at: new Date().toISOString()
                 });
             }

             await this.upsertRows('excuse_letters', letters);
             this.log('✅ Seeded excuse_letters', 'success');
        } catch (error) {
            console.error('Error seeding excuse letters:', error);
        }
    },

    async createNotificationsV2(adminIds) {
        try {
            const adminId = adminIds && adminIds.length > 0 ? adminIds[0] : await this.generateDeterministicUUID('admin-0@educaretrack.edu.ph');
            const now = new Date().toISOString();
            
            const notifications = [
                {
                    id: await this.generateDeterministicUUID('notif-welcome'),
                    title: 'Welcome',
                    message: 'Welcome to EducareTrack!',
                    type: 'info',
                    target_users: [adminId],
                    read_by: [],
                    created_at: now
                },
                {
                    id: await this.generateDeterministicUUID('notif-system'),
                    title: 'System Update',
                    message: 'System maintenance scheduled for Sunday 12 AM.',
                    type: 'alert',
                    target_users: [adminId],
                    read_by: [],
                    created_at: now
                },
                {
                    id: await this.generateDeterministicUUID('notif-grades'),
                    title: 'Grade Submission Deadline',
                    message: 'Please submit 1st Quarter grades by Friday.',
                    type: 'action',
                    target_users: [adminId],
                    read_by: [],
                    created_at: now
                },
                {
                    id: await this.generateDeterministicUUID('notif-policy'),
                    title: 'New Policy on Attendance',
                    message: 'Please review the updated attendance policy in the handbook.',
                    type: 'info',
                    target_users: [adminId],
                    read_by: [],
                    created_at: now
                },
                {
                    id: await this.generateDeterministicUUID('notif-meeting'),
                    title: 'Faculty Meeting Reminder',
                    message: 'General assembly at the AV Room tomorrow, 3 PM.',
                    type: 'info',
                    target_users: [adminId],
                    read_by: [],
                    created_at: now
                }
            ];

            await this.upsertRows('notifications', notifications);
            this.log('✅ Seeded notifications', 'success');
        } catch (error) {
            console.error('Error seeding notifications:', error);
        }
    },

    async createClinicVisitsV2(clinicIds) {
        try {
            const { data: students } = await window.supabaseClient
                .from('students')
                .select('id,class_id');

            if (!students || students.length === 0) return;

            const now = new Date();
            const clinicId = clinicIds && clinicIds.length > 0 ? clinicIds[0] : await this.generateDeterministicUUID('clinic-0@educaretrack.edu.ph');
            
            const visits = [];

            // Create some random visits
            for (let i = 0; i < 10; i++) {
                const s = students[i % students.length];
                if (!s) break;

                const id = await this.generateDeterministicUUID(`clinic-${s.id}-${i}`);
                const visitTime = new Date(now.getTime() - i * 3600000 * 24).toISOString(); // Spread over days
                
                visits.push({
                    id: id,
                    student_id: s.id,
                    reason: i % 2 === 0 ? 'Headache' : 'Fever',
                    visit_time: visitTime,
                    notes: 'Sent back to class after rest',
                    treated_by: clinicId,
                    outcome: 'Resolved'
                });
            }

            await this.upsertRows('clinic_visits', visits);
            this.log('✅ Seeded clinic_visits', 'success');
        } catch (error) {
            console.error('Error seeding clinic visits:', error);
        }
    }
};

// Initialize data when the script loads
document.addEventListener('DOMContentLoaded', async function() {
    // Check if button already exists
    if (document.getElementById('init-dummy-data-btn')) return;

    // Add initialization button to the page for easy access
    const initButton = document.createElement('button');
    initButton.id = 'init-dummy-data-btn';
    initButton.textContent = 'Initialize Dummy Data';
    initButton.style.position = 'fixed';
    initButton.style.top = '10px';
    initButton.style.right = '10px';
    initButton.style.zIndex = '10000';
    initButton.style.padding = '10px';
    initButton.style.backgroundColor = '#4CAF50';
    initButton.style.color = 'white';
    initButton.style.border = 'none';
    initButton.style.borderRadius = '5px';
    initButton.style.cursor = 'pointer';
    
    initButton.addEventListener('click', async function() {
        // Confirmation is good
        if (!confirm('This will initialize dummy data. Continue?')) return;
        
        initButton.disabled = true;
        initButton.textContent = 'Initializing...';
        
        const success = await DataInitializer.initializeDummyData();
        
        if (success) {
            alert('Dummy data initialized successfully!');
        } else {
            alert('Failed to initialize dummy data. Check console for details.');
        }
        
        initButton.disabled = false;
        initButton.textContent = 'Initialize Dummy Data';
    });
    
    document.body.appendChild(initButton);
});

// Make DataInitializer available globally
window.DataInitializer = DataInitializer;

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DataInitializer;
}