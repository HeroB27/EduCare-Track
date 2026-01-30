// Data Initializer Logic

const log = (msg, type = 'info') => {
    const box = document.getElementById('statusBox');
    const div = document.createElement('div');
    div.className = type === 'error' ? 'text-red-600' : type === 'success' ? 'text-green-600' : 'text-gray-600';
    div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
    console.log(msg);
};

// Configuration
const EMPLOYEES = {
    ADMIN: { prefix: 'ADM', count: 1 },
    TEACHER: { prefix: 'TCH', count: 0 }, // Calculated dynamically
    GUARD: { prefix: 'GRD', count: 4 },
    CLINIC: { prefix: 'CLC', count: 2 }
};

const CLASSES_CONFIG = [
    // Kindergarten
    { grade: 'Kindergarten', level: 'Kindergarten', strands: [''] },
    
    // Elementary (Grades 1-6)
    { grade: 'Grade 1', level: 'Elementary', strands: [''] },
    { grade: 'Grade 2', level: 'Elementary', strands: [''] },
    { grade: 'Grade 3', level: 'Elementary', strands: [''] },
    { grade: 'Grade 4', level: 'Elementary', strands: [''] },
    { grade: 'Grade 5', level: 'Elementary', strands: [''] },
    { grade: 'Grade 6', level: 'Elementary', strands: [''] },
    
    // Junior High School (Grades 7-10)
    { grade: 'Grade 7', level: 'Junior HS', strands: [''] },
    { grade: 'Grade 8', level: 'Junior HS', strands: [''] },
    { grade: 'Grade 9', level: 'Junior HS', strands: [''] },
    { grade: 'Grade 10', level: 'Junior HS', strands: [''] },
    
    // Senior High School (Grades 11-12)
    { grade: 'Grade 11', level: 'Senior HS', strands: ['STEM', 'ABM', 'HUMSS', 'GAS', 'TVL'] },
    { grade: 'Grade 12', level: 'Senior HS', strands: ['STEM', 'ABM', 'HUMSS', 'GAS', 'TVL'] }
];

const STUDENTS_PER_CLASS = 10;
const FLOATING_TEACHERS = 10;
const START_DATE = new Date('2025-11-01'); // November 2025

// Helpers
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];
const pad = (num, size) => num.toString().padStart(size, '0');

// ID Generator: PREFIX-YEAR-PHONE/LRN-SEQ
const sequences = { ADM: 0, TCH: 0, GRD: 0, CLC: 0, EDU: 0, PAR: 0 };

const generateEmployeeId = (prefix, phoneLast4) => {
    const year = new Date().getFullYear();
    sequences[prefix]++;
    const seq = pad(sequences[prefix], 4);
    return `${prefix}-${year}-${phoneLast4}-${seq}`;
};

const generateStudentId = (lrnLast4) => {
    const year = new Date().getFullYear();
    sequences.EDU++;
    const seq = pad(sequences.EDU, 4);
    return `EDU-${year}-${lrnLast4}-${seq}`;
};

const generateLRN = () => {
    return '1' + pad(randomInt(0, 99999999999), 11);
};

const NAMES = {
    first: [
        'James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda', 'William', 'Elizabeth',
        'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Charles', 'Karen',
        'Juan', 'Maria', 'Jose', 'Ana', 'Luis', 'Sofia', 'Miguel', 'Angel', 'Gabriel', 'Bea',
        'Joshua', 'Angela', 'Mark', 'Christine', 'Paolo', 'Jasmine', 'Christian', 'Nicole', 'Francis', 'Grace',
        'Rafael', 'Joy', 'Daniel', 'Faith', 'Ryan', 'Hope', 'Patrick', 'Precious', 'Vincent', 'Lovely'
    ],
    last: [
        'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
        'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
        'Lee', 'Perez', 'Thompson', 'White', 'Santos', 'Reyes', 'Cruz', 'Bautista', 'Ocampo', 'Aquino',
        'Mendoza', 'Torres', 'Flores', 'Castillo', 'Villanueva', 'Ramos', 'Castro', 'Rivera', 'Dela Cruz', 'Fernandez',
        'Diaz', 'Gomez', 'Morales', 'De Jesus', 'Delos Santos', 'Soriano', 'Gonzales', 'Salazar', 'Corpuz', 'Pascual'
    ]
};

const BAGUIO_BARANGAYS = [
    'Irisan', 'Bakakeng Central', 'Bakakeng North', 'Loakan Proper', 'Camp 7', 'Aurora Hill', 'Trancoville',
    'Pacdal', 'Mines View', 'Burnham-Legarda', 'Sto. Nino', 'Guisad', 'Pinsao', 'Quezon Hill', 'Fairview',
    'Asin Road', 'Campo Filipino', 'City Camp', 'Dominican-Mirador', 'Dontogan', 'Gibraltar', 'Greenwater',
    'Holy Ghost', 'Honeymoon', 'Imelda Village', 'Kias', 'Lualhati', 'Lucnab', 'Magsaysay', 'Malcolm Square',
    'Manuel A. Roxas', 'Middle Quezon Hill', 'Military Cut-off', 'Modern Site', 'New Lucban', 'Outlook Drive',
    'Pinget', 'Poliwes', 'Pucsusan', 'Quirino Hill', 'Rizal Monument', 'Rock Quarry', 'Saint Joseph Village',
    'San Antonio Village', 'San Luis Village', 'San Roque Village', 'San Vicente', 'Scout Barrio', 'Session Road Area',
    'Slaughter House Area', 'South Drive', 'Teodora Alonzo', 'Upper General Luna', 'Upper QM', 'Victoria Village'
];

const generateName = () => `${randomItem(NAMES.first)} ${randomItem(NAMES.last)}`;
const generateAddress = () => {
    const barangay = randomItem(BAGUIO_BARANGAYS);
    const houseNum = randomInt(1, 150);
    return `#${houseNum} ${barangay}, Baguio City`;
};

// Core Functions

async function wipeData() {
    log('Clearing existing data...');
    const tables = ['subject_attendance', 'class_schedules', 'parent_students', 'students', 'parents', 'classes', 'teachers', 'admin_staff', 'guards', 'clinic_staff', 'profiles', 'system_settings'];
    
    // Special handling for parent_students (composite PK) and system_settings (key)
    for (const table of tables) {
        let query = window.supabaseClient.from(table).delete();
        if (table === 'system_settings') {
            query = query.neq('key', 'DO_NOT_DELETE_DUMMY_KEY');
        } else if (table === 'parent_students') {
            query = query.neq('student_id', '00000000-0000-0000-0000-000000000000'); // Dummy condition to delete all
        } else {
            query = query.neq('id', '00000000-0000-0000-0000-000000000000'); // Assuming UUID PKs
        }
        
        const { error } = await query;
        if (error) console.warn(`Error clearing ${table}:`, error.message);
    }
    log('Data cleared.');
}

async function createEmployees(role, count, prefix) {
    log(`Creating ${count} ${role}s...`);
    const employees = [];
    
    for (let i = 0; i < count; i++) {
        const phone = '09' + randomInt(100000000, 999999999);
        const customId = generateEmployeeId(prefix, phone.slice(-4));
        const name = generateName();
        const email = `${role}${i + 1}@educare.com`;
        
        const { data: user, error } = await window.supabaseClient.from('profiles').insert({
            role: role,
            full_name: name,
            phone: phone,
            email: email,
            username: customId, // Using Custom ID as username for login
            password: 'password123',
            is_active: true
        }).select().single();

        if (error) {
            console.error(`Error creating ${role} ${i}:`, error);
            continue;
        }

        // Create Role Specific Entry
        if (role === 'teacher') {
            await window.supabaseClient.from('teachers').insert({
                id: user.id,
                employee_no: customId,
                is_homeroom: false,
                assigned_subjects: ['Math', 'Science', 'English'] // Dummy subjects
            });
        } else if (role === 'admin') {
            await window.supabaseClient.from('admin_staff').insert({
                id: user.id,
                position: 'Administrator',
                permissions: { all: true }
            });
        } else if (role === 'guard') {
            await window.supabaseClient.from('guards').insert({
                id: user.id,
                shift: randomItem(['Morning', 'Afternoon', 'Night']),
                assigned_gate: randomItem(['Main Gate', 'Back Gate'])
            });
        } else if (role === 'clinic') {
             await window.supabaseClient.from('clinic_staff').insert({
                id: user.id,
                position: 'Nurse',
                license_no: `LIC-${randomInt(10000, 99999)}`
            });
        }
        
        employees.push({ ...user, customId });
    }
    return employees;
}

async function createClasses(teachers) {
    log('Creating classes and enrolling students...');
    let teacherIndex = 0;
    const createdClasses = [];
    
    for (const config of CLASSES_CONFIG) {
        for (const strand of config.strands) {
            const className = strand ? `${config.grade} - ${strand}` : config.grade;
            const adviser = teachers[teacherIndex];
            teacherIndex++;
            
            if (!adviser) {
                log(`Warning: No teacher available for ${className}`, 'error');
                continue;
            }

            // Create Class
            const { data: cls, error } = await window.supabaseClient.from('classes').insert({
                grade: config.grade,
                strand: strand || null,
                section: null, // No sections as requested
                adviser_id: adviser.id,
                room: `Room ${randomInt(101, 500)}`
            }).select().single();
            
            if (error) {
                console.error('Error creating class:', error);
                continue;
            }

            // Update Teacher to be Homeroom
            await window.supabaseClient.from('teachers').update({ is_homeroom: true }).eq('id', adviser.id);

            // Create Students
            await createStudentsAndParents(cls, config);
            
            createdClasses.push({ ...cls, adviser_id: adviser.id });
        }
    }
    return createdClasses;
}

async function createStudentsAndParents(cls, config) {
    for (let i = 0; i < STUDENTS_PER_CLASS; i++) {
        const lrn = generateLRN();
        const studentId = generateStudentId(lrn.slice(-4));
        const name = generateName();
        const address = generateAddress();
        
        // Create Student
        const { data: student, error: sError } = await window.supabaseClient.from('students').insert({
            id: studentId,
            lrn: lrn,
            full_name: name,
            gender: randomItem(['Male', 'Female']),
            birth_date: '2015-01-01',
            address: address,
            class_id: cls.id,
            strand: cls.strand,
            current_status: 'enrolled'
        }).select().single();

        if (sError) {
            console.error('Error creating student:', sError);
            continue;
        }

        // Create Parent
        const phone = '09' + randomInt(100000000, 999999999);
        const parentId = generateEmployeeId('PAR', phone.slice(-4));
        const parentName = `${generateName().split(' ')[0]} ${name.split(' ')[1]}`; // Same last name
        
        const { data: parentProfile, error: pError } = await window.supabaseClient.from('profiles').insert({
            role: 'parent',
            full_name: parentName,
            phone: phone,
            email: `parent-${studentId}@educare.com`,
            username: parentId,
            password: 'password123',
            is_active: true
        }).select().single();

        if (!pError) {
            await window.supabaseClient.from('parents').insert({
                id: parentProfile.id,
                address: address,
                occupation: 'Employee'
            });

            // Link
            await window.supabaseClient.from('parent_students').insert({
                parent_id: parentProfile.id,
                student_id: student.id,
                relationship: 'Parent'
            });
        }
    }
}

async function createDefaultSchedules(cls, allTeachers) {
    // Standard Subjects
    const SUBJECTS = ['Math', 'Science', 'English', 'Filipino', 'Araling Panlipunan', 'MAPEH'];
    // For SHS, use strands? For simplicity, stick to core + strand placeholders or just standard for now.
    
    // Define 7 Periods
    const periods = [
        { period: 1, start: '07:30', end: '08:30', isHomeroom: true, subject: 'Homeroom Guidance' },
        { period: 2, start: '08:30', end: '09:30', isHomeroom: false, subject: 'Mathematics' },
        { period: 3, start: '09:45', end: '10:45', isHomeroom: false, subject: 'Science' },
        { period: 4, start: '10:45', end: '11:45', isHomeroom: false, subject: 'English' },
        { period: 5, start: '13:00', end: '14:00', isHomeroom: false, subject: 'Filipino' },
        { period: 6, start: '14:00', end: '15:00', isHomeroom: false, subject: 'Araling Panlipunan' },
        { period: 7, start: '15:00', end: '16:00', isHomeroom: false, subject: 'MAPEH' }
    ];

    const scheduleItems = [];

    for (const p of periods) {
        let teacherId;
        let subject = p.subject;

        if (p.isHomeroom) {
            teacherId = cls.adviser_id; // Homeroom Teacher
        } else {
            // Pick a random teacher, preferably not the adviser to show diversity, 
            // but for simplicity just random from allTeachers
            // Try to filter out non-active if possible, but we assume allTeachers are valid
            const subjectTeacher = randomItem(allTeachers);
            teacherId = subjectTeacher.id;
        }

        scheduleItems.push({
            class_id: cls.id,
            subject: subject,
            teacher_id: teacherId,
            schedule_text: `${p.start} - ${p.end}`,
            day_of_week: 'Mon-Fri',
            start_time: p.start,
            end_time: p.end,
            period_number: p.period
        });
    }

    const { error } = await window.supabaseClient.from('class_schedules').insert(scheduleItems);
    if (error) {
        console.error(`Error creating schedule for class ${cls.id}:`, error);
    }
}

async function startInitialization() {
    const btn = document.getElementById('startBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Initializing...';
    
    // Clear logs
    const statusBox = document.getElementById('statusBox');
    if (statusBox) statusBox.innerHTML = '';

    try {
        if (!window.supabaseClient) {
            throw new Error('Supabase client not initialized');
        }

        log('Starting initialization sequence...');

        // 1. Wipe Data
        await wipeData();

        // 2. Calculate totals
        let totalClasses = 0;
        CLASSES_CONFIG.forEach(c => totalClasses += c.strands.length);
        const totalHomeroomTeachers = totalClasses;
        const totalTeachers = totalHomeroomTeachers + FLOATING_TEACHERS;
        
        log(`Configuration: ${totalClasses} Classes, ${totalTeachers} Teachers`);

        // 3. Create Employees (Profiles + Role Tables)
        const teachers = await createEmployees('teacher', totalTeachers, 'TCH');
        const admins = await createEmployees('admin', EMPLOYEES.ADMIN.count, 'ADM');
        const guards = await createEmployees('guard', EMPLOYEES.GUARD.count, 'GRD');
        const clinic = await createEmployees('clinic', EMPLOYEES.CLINIC.count, 'CLC');

        // 4. Create Classes and Assign Homeroom Teachers
        const classes = await createClasses(teachers.slice(0, totalHomeroomTeachers));

        // 5. Generate Schedules for Classes
        log('Generating default 7-period schedules...');
        const allTeachers = teachers; // Use all teachers for subject assignment
        for (const cls of classes) {
             await createDefaultSchedules(cls, allTeachers);
        }

        alert('Data initialization completed successfully!');

    } catch (error) {
        console.error(error);
        log(`FATAL ERROR: ${error.message}`, 'error');
        alert(`Error: ${error.message}`);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-play mr-2"></i> Start Initialization';
    }
}

async function updateDataAndSchedules() {
    const btn = document.getElementById('updateSchedulesBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Updating...';

    try {
        if (!window.supabaseClient) {
            throw new Error('Supabase client not initialized');
        }

        log('Starting Data & Schedule Update...');

        // 1. Fetch Existing Classes
        log('Fetching existing classes...');
        const { data: classes, error: classError } = await window.supabaseClient.from('classes').select('*');
        if (classError) throw classError;
        if (!classes || classes.length === 0) throw new Error('No classes found. Please run full initialization first.');

        // 2. Fetch Existing Teachers
        log('Fetching existing teachers...');
        const { data: teachers, error: teacherError } = await window.supabaseClient.from('teachers').select('*');
        if (teacherError) throw teacherError;
        if (!teachers || teachers.length === 0) throw new Error('No teachers found. Please run full initialization first.');

        // 3. Wipe ONLY Class Schedules
        log('Clearing existing schedules...');
        const { error: deleteError } = await window.supabaseClient.from('class_schedules').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (deleteError) {
             throw new Error(`Failed to clear schedules: ${deleteError.message}`);
        }
        
        // 4. Re-generate schedules
        log('Regenerating default 7-period schedules...');
        for (const cls of classes) {
             await createDefaultSchedules(cls, teachers);
        }
        
        log('Schedules updated successfully.');
        
        alert('Data updated successfully!');

    } catch (error) {
        console.error(error);
        log(`Update Error: ${error.message}`, 'error');
        alert(`Error: ${error.message}`);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-sync mr-2"></i> Update Data & Schedules';
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
});
