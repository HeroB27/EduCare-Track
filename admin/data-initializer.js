// data-initializer.js - EducareTrack Dummy Data Generator
// COMPLETE K-12 DATA WITH REALISTIC CURRICULUM STRUCTURE

const DataInitializer = {
    async initializeDummyData() {
        try {
            console.log('Starting EducareTrack Data Initialization...');

            // Clear existing data first (optional - for development)
            // await this.clearExistingData();

            // Create system users
            await this.createSystemUsers();
            
            // Create classes with complete curriculum
            const classes = await this.createClasses();
            
            // Create teachers and assign to classes/subjects
            await this.createTeachers(classes);
            
            // Create students and parents
            await this.createStudentsAndParents(classes);
            
            // Create sample activity data
            await this.createSampleActivity();

            await this.createMonthlyAttendanceNovDec();
            await this.createExcuseLettersNovDec();
            await this.createClinicRecordsNovDec();
            
            console.log('✅ EducareTrack Data Initialization Complete!');
            return true;
        } catch (error) {
            console.error('❌ Data initialization failed:', error);
            return false;
        }
    },

    async createSystemUsers() {
        console.log('Creating system users...');

        const systemUsers = [
            // Admin
            {
                id: 'ADM-001',
                email: 'admin@educaretrack.edu.ph',
                phone: '+639123456789',
                name: 'Dr. Maria Santos',
                role: 'admin',
                isActive: true,
                createdAt: this.getRandomPastDate(30)
            },
            // Guard
            {
                id: 'GRD-001',
                email: 'guard@educaretrack.edu.ph',
                phone: '+639123456790',
                name: 'Juan Dela Cruz',
                role: 'guard',
                isActive: true,
                createdAt: this.getRandomPastDate(30)
            },
            // Clinic Staff
            {
                id: 'CLN-001',
                email: 'clinic@educaretrack.edu.ph',
                phone: '+639123456791',
                name: 'Nurse Anna Reyes',
                role: 'clinic',
                isActive: true,
                createdAt: this.getRandomPastDate(30)
            }
        ];

        for (const userData of systemUsers) {
            await db.collection('users').doc(userData.id).set(userData);
        }

        console.log(`✅ Created ${systemUsers.length} system users`);
    },

    async createClasses() {
        console.log('Creating classes with curriculum...');

        const classes = [
            // Kindergarten
            {
                id: 'KINDER-001',
                name: 'Kindergarten',
                grade: 'Kindergarten',
                level: 'Kindergarten',
                subjects: [
                    'Makabansa', 'Languages', 'Mathematics', 'GMRC', 
                    'Values Education', 'Science', 'Mother Tongue',
                    'Physical Education', 'Arts and Music'
                ],
                isActive: true,
                createdAt: this.getRandomPastDate(30)
            },

            // Elementary (Grades 1-6)
            {
                id: 'GRADE1-001',
                name: 'Grade 1',
                grade: 'Grade 1',
                level: 'Elementary',
                subjects: [
                    'Math', 'English', 'Filipino', 'Araling Panlipunan', 'Science',
                    'TLE', 'MAPEH', 'GMRC', 'Edukasyon sa Pagpapakatao', 'Mother Tongue'
                ],
                isActive: true,
                createdAt: this.getRandomPastDate(30)
            },
            {
                id: 'GRADE2-001',
                name: 'Grade 2',
                grade: 'Grade 2',
                level: 'Elementary',
                subjects: [
                    'Math', 'English', 'Filipino', 'Araling Panlipunan', 'Science',
                    'TLE', 'MAPEH', 'GMRC', 'Edukasyon sa Pagpapakatao', 'Mother Tongue'
                ],
                isActive: true,
                createdAt: this.getRandomPastDate(30)
            },
            {
                id: 'GRADE3-001',
                name: 'Grade 3',
                grade: 'Grade 3',
                level: 'Elementary',
                subjects: [
                    'Math', 'English', 'Filipino', 'Araling Panlipunan', 'Science',
                    'TLE', 'MAPEH', 'GMRC', 'Edukasyon sa Pagpapakatao', 'Mother Tongue'
                ],
                isActive: true,
                createdAt: this.getRandomPastDate(30)
            },
            {
                id: 'GRADE4-001',
                name: 'Grade 4',
                grade: 'Grade 4',
                level: 'Elementary',
                subjects: [
                    'Math', 'English', 'Filipino', 'Araling Panlipunan', 'Science',
                    'TLE', 'MAPEH', 'GMRC', 'Edukasyon sa Pagpapakatao'
                ],
                isActive: true,
                createdAt: this.getRandomPastDate(30)
            },
            {
                id: 'GRADE5-001',
                name: 'Grade 5',
                grade: 'Grade 5',
                level: 'Elementary',
                subjects: [
                    'Math', 'English', 'Filipino', 'Araling Panlipunan', 'Science',
                    'TLE', 'MAPEH', 'GMRC', 'Edukasyon sa Pagpapakatao'
                ],
                isActive: true,
                createdAt: this.getRandomPastDate(30)
            },
            {
                id: 'GRADE6-001',
                name: 'Grade 6',
                grade: 'Grade 6',
                level: 'Elementary',
                subjects: [
                    'Math', 'English', 'Filipino', 'Araling Panlipunan', 'Science',
                    'TLE', 'MAPEH', 'GMRC', 'Edukasyon sa Pagpapakatao'
                ],
                isActive: true,
                createdAt: this.getRandomPastDate(30)
            },

            // High School (Grades 7-10)
            {
                id: 'GRADE7-001',
                name: 'Grade 7',
                grade: 'Grade 7',
                level: 'Highschool',
                subjects: [
                    'English', 'Filipino', 'Mathematics', 'Science', 'Social Sciences',
                    'MAPEH', 'TLE', 'Edukasyon sa Pagpapakatao', 'Araling Panlipunan'
                ],
                isActive: true,
                createdAt: this.getRandomPastDate(30)
            },
            {
                id: 'GRADE8-001',
                name: 'Grade 8',
                grade: 'Grade 8',
                level: 'Highschool',
                subjects: [
                    'English', 'Filipino', 'Mathematics', 'Science', 'Social Sciences',
                    'MAPEH', 'TLE', 'Edukasyon sa Pagpapakatao', 'Araling Panlipunan'
                ],
                isActive: true,
                createdAt: this.getRandomPastDate(30)
            },
            {
                id: 'GRADE9-001',
                name: 'Grade 9',
                grade: 'Grade 9',
                level: 'Highschool',
                subjects: [
                    'English', 'Filipino', 'Mathematics', 'Science', 'Social Sciences',
                    'MAPEH', 'TLE', 'Edukasyon sa Pagpapakatao', 'Araling Panlipunan'
                ],
                isActive: true,
                createdAt: this.getRandomPastDate(30)
            },
            {
                id: 'GRADE10-001',
                name: 'Grade 10',
                grade: 'Grade 10',
                level: 'Highschool',
                subjects: [
                    'English', 'Filipino', 'Mathematics', 'Science', 'Social Sciences',
                    'MAPEH', 'TLE', 'Edukasyon sa Pagpapakatao', 'Araling Panlipunan'
                ],
                isActive: true,
                createdAt: this.getRandomPastDate(30)
            },

            // Senior High School - STEM (Grades 11-12)
            {
                id: 'STEM11-001',
                name: 'Grade 11 - STEM',
                grade: 'Grade 11',
                level: 'Senior High',
                strand: 'STEM',
                subjects: [
                    // Core Subjects
                    'Oral Communication', 'Reading and Writing',
                    'Komunikasyon at Pananaliksik sa Wika at Kulturang Pilipino',
                    'Pagbasa at Pagsuri ng Iba\'t Ibang Teksto Tungo sa Pananaliksik',
                    '21st Century Literature from the Philippines and the World',
                    'Contemporary Philippine Arts from the Region',
                    'Media and Information Literacy', 'General Mathematics',
                    'Statistics and Probability', 'Earth Science', 'Physical Science',
                    'Introduction to Philosophy of the Human Person',
                    'Physical Education and Health', 'Personal Development',
                    'Understanding Culture, Society, and Politics',
                    // Applied Subjects
                    'English for Academic and Professional Purposes',
                    'Practical Research 1 (Qualitative)', 'Practical Research 2 (Quantitative)',
                    'Filipino sa Piling Larang', 'Empowerment Technologies', 'Entrepreneurship',
                    // Strand Subjects
                    'Pre-Calculus', 'Basic Calculus', 'General Biology 1', 'General Biology 2',
                    'General Chemistry 1', 'General Chemistry 2', 'General Physics 1',
                    'General Physics 2', 'Research in Science, Technology, Engineering, and Mathematics',
                    'Capstone Project'
                ],
                isActive: true,
                createdAt: this.getRandomPastDate(30)
            },
            {
                id: 'STEM12-001',
                name: 'Grade 12 - STEM',
                grade: 'Grade 12',
                level: 'Senior High',
                strand: 'STEM',
                subjects: [
                    // Core Subjects
                    'Oral Communication', 'Reading and Writing',
                    'Komunikasyon at Pananaliksik sa Wika at Kulturang Pilipino',
                    'Pagbasa at Pagsuri ng Iba\'t Ibang Teksto Tungo sa Pananaliksik',
                    '21st Century Literature from the Philippines and the World',
                    'Contemporary Philippine Arts from the Region',
                    'Media and Information Literacy', 'General Mathematics',
                    'Statistics and Probability', 'Earth Science', 'Physical Science',
                    'Introduction to Philosophy of the Human Person',
                    'Physical Education and Health', 'Personal Development',
                    'Understanding Culture, Society, and Politics',
                    // Applied Subjects
                    'English for Academic and Professional Purposes',
                    'Practical Research 1 (Qualitative)', 'Practical Research 2 (Quantitative)',
                    'Filipino sa Piling Larang', 'Empowerment Technologies', 'Entrepreneurship',
                    // Strand Subjects
                    'Pre-Calculus', 'Basic Calculus', 'General Biology 1', 'General Biology 2',
                    'General Chemistry 1', 'General Chemistry 2', 'General Physics 1',
                    'General Physics 2', 'Research in Science, Technology, Engineering, and Mathematics',
                    'Capstone Project'
                ],
                isActive: true,
                createdAt: this.getRandomPastDate(30)
            },

            // Senior High School - ABM (Grades 11-12)
            {
                id: 'ABM11-001',
                name: 'Grade 11 - ABM',
                grade: 'Grade 11',
                level: 'Senior High',
                strand: 'ABM',
                subjects: [
                    // Core Subjects
                    'Oral Communication', 'Reading and Writing',
                    'Komunikasyon at Pananaliksik sa Wika at Kulturang Pilipino',
                    'Pagbasa at Pagsuri ng Iba\'t Ibang Teksto Tungo sa Pananaliksik',
                    '21st Century Literature from the Philippines and the World',
                    'Contemporary Philippine Arts from the Region',
                    'Media and Information Literacy', 'General Mathematics',
                    'Statistics and Probability', 'Earth Science', 'Physical Science',
                    'Introduction to Philosophy of the Human Person',
                    'Physical Education and Health', 'Personal Development',
                    'Understanding Culture, Society, and Politics',
                    // Applied Subjects
                    'English for Academic and Professional Purposes',
                    'Practical Research 1 (Qualitative)', 'Practical Research 2 (Quantitative)',
                    'Filipino sa Piling Larang', 'Empowerment Technologies', 'Entrepreneurship',
                    // Strand Subjects
                    'Applied Economics', 'Business Ethics and Social Responsibility',
                    'Fundamentals of Accounting and Business Management 1',
                    'Fundamentals of Accounting and Business Management 2',
                    'Business Mathematics', 'Business Finance', 'Organization and Business Management',
                    'Principles of Marketing', 'Work Immersion/Research/Career Advocacy/Culminating Activity'
                ],
                isActive: true,
                createdAt: this.getRandomPastDate(30)
            },
            {
                id: 'ABM12-001',
                name: 'Grade 12 - ABM',
                grade: 'Grade 12',
                level: 'Senior High',
                strand: 'ABM',
                subjects: [
                    // Core Subjects
                    'Oral Communication', 'Reading and Writing',
                    'Komunikasyon at Pananaliksik sa Wika at Kulturang Pilipino',
                    'Pagbasa at Pagsuri ng Iba\'t Ibang Teksto Tungo sa Pananaliksik',
                    '21st Century Literature from the Philippines and the World',
                    'Contemporary Philippine Arts from the Region',
                    'Media and Information Literacy', 'General Mathematics',
                    'Statistics and Probability', 'Earth Science', 'Physical Science',
                    'Introduction to Philosophy of the Human Person',
                    'Physical Education and Health', 'Personal Development',
                    'Understanding Culture, Society, and Politics',
                    // Applied Subjects
                    'English for Academic and Professional Purposes',
                    'Practical Research 1 (Qualitative)', 'Practical Research 2 (Quantitative)',
                    'Filipino sa Piling Larang', 'Empowerment Technologies', 'Entrepreneurship',
                    // Strand Subjects
                    'Applied Economics', 'Business Ethics and Social Responsibility',
                    'Fundamentals of Accounting and Business Management 1',
                    'Fundamentals of Accounting and Business Management 2',
                    'Business Mathematics', 'Business Finance', 'Organization and Business Management',
                    'Principles of Marketing', 'Work Immersion/Research/Career Advocacy/Culminating Activity'
                ],
                isActive: true,
                createdAt: this.getRandomPastDate(30)
            },

            // Senior High School - HUMSS (Grades 11-12)
            {
                id: 'HUMSS11-001',
                name: 'Grade 11 - HUMSS',
                grade: 'Grade 11',
                level: 'Senior High',
                strand: 'HUMSS',
                subjects: [
                    // Core Subjects
                    'Oral Communication', 'Reading and Writing',
                    'Komunikasyon at Pananaliksik sa Wika at Kulturang Pilipino',
                    'Pagbasa at Pagsuri ng Iba\'t Ibang Teksto Tungo sa Pananaliksik',
                    '21st Century Literature from the Philippines and the World',
                    'Contemporary Philippine Arts from the Region',
                    'Media and Information Literacy', 'General Mathematics',
                    'Statistics and Probability', 'Earth Science', 'Physical Science',
                    'Introduction to Philosophy of the Human Person',
                    'Physical Education and Health', 'Personal Development',
                    'Understanding Culture, Society, and Politics',
                    // Applied Subjects
                    'English for Academic and Professional Purposes',
                    'Practical Research 1 (Qualitative)', 'Practical Research 2 (Quantitative)',
                    'Filipino sa Piling Larang', 'Empowerment Technologies', 'Entrepreneurship',
                    // Strand Subjects
                    'Creative Writing (Fiction)', 'Creative Writing (Non-Fiction)',
                    'Introduction to World Religions and Belief Systems',
                    'Trends, Networks, and Critical Thinking in the 21st Century Culture',
                    'Philippine Politics and Governance', 'Community Engagement, Solidarity, and Citizenship',
                    'Discipline and Ideas in the Social Sciences',
                    'Discipline and Ideas in the Applied Social Sciences',
                    'Work Immersion/Research Project/Culminating Activity'
                ],
                isActive: true,
                createdAt: this.getRandomPastDate(30)
            },
            {
                id: 'HUMSS12-001',
                name: 'Grade 12 - HUMSS',
                grade: 'Grade 12',
                level: 'Senior High',
                strand: 'HUMSS',
                subjects: [
                    // Core Subjects
                    'Oral Communication', 'Reading and Writing',
                    'Komunikasyon at Pananaliksik sa Wika at Kulturang Pilipino',
                    'Pagbasa at Pagsuri ng Iba\'t Ibang Teksto Tungo sa Pananaliksik',
                    '21st Century Literature from the Philippines and the World',
                    'Contemporary Philippine Arts from the Region',
                    'Media and Information Literacy', 'General Mathematics',
                    'Statistics and Probability', 'Earth Science', 'Physical Science',
                    'Introduction to Philosophy of the Human Person',
                    'Physical Education and Health', 'Personal Development',
                    'Understanding Culture, Society, and Politics',
                    // Applied Subjects
                    'English for Academic and Professional Purposes',
                    'Practical Research 1 (Qualitative)', 'Practical Research 2 (Quantitative)',
                    'Filipino sa Piling Larang', 'Empowerment Technologies', 'Entrepreneurship',
                    // Strand Subjects
                    'Creative Writing (Fiction)', 'Creative Writing (Non-Fiction)',
                    'Introduction to World Religions and Belief Systems',
                    'Trends, Networks, and Critical Thinking in the 21st Century Culture',
                    'Philippine Politics and Governance', 'Community Engagement, Solidarity, and Citizenship',
                    'Discipline and Ideas in the Social Sciences',
                    'Discipline and Ideas in the Applied Social Sciences',
                    'Work Immersion/Research Project/Culminating Activity'
                ],
                isActive: true,
                createdAt: this.getRandomPastDate(30)
            }
        ];

        for (const classData of classes) {
            await db.collection('classes').doc(classData.id).set(classData);
        }

        console.log(`✅ Created ${classes.length} classes with complete curriculum`);
        return classes;
    },

    async createTeachers(classes) {
        console.log('Creating teachers and assigning subjects...');

        const teachers = [
            // Kindergarten Teacher
            {
                id: 'TCH-K-001',
                email: 'teacher.kinder@educaretrack.edu.ph',
                phone: '+639123456792',
                name: 'Ms. Sofia Garcia',
                role: 'teacher',
                classId: 'KINDER-001',
                isHomeroom: true,
                assignedClasses: ['KINDER-001'],
                assignedSubjects: [
                    'Makabansa', 'Languages', 'Mathematics', 'GMRC', 
                    'Values Education', 'Science', 'Mother Tongue',
                    'Physical Education', 'Arts and Music'
                ],
                isActive: true,
                createdAt: this.getRandomPastDate(30)
            },

            // Elementary Teachers (Grades 1-6)
            {
                id: 'TCH-G1-001',
                email: 'teacher.grade1@educaretrack.edu.ph',
                phone: '+639123456793',
                name: 'Mr. Carlos Reyes',
                role: 'teacher',
                classId: 'GRADE1-001',
                isHomeroom: true,
                assignedClasses: ['GRADE1-001'],
                assignedSubjects: [
                    'Math', 'English', 'Filipino', 'Araling Panlipunan', 'Science',
                    'TLE', 'MAPEH', 'GMRC', 'Edukasyon sa Pagpapakatao', 'Mother Tongue'
                ],
                isActive: true,
                createdAt: this.getRandomPastDate(30)
            },
            {
                id: 'TCH-G2-001',
                email: 'teacher.grade2@educaretrack.edu.ph',
                phone: '+639123456794',
                name: 'Ms. Elena Torres',
                role: 'teacher',
                classId: 'GRADE2-001',
                isHomeroom: true,
                assignedClasses: ['GRADE2-001'],
                assignedSubjects: [
                    'Math', 'English', 'Filipino', 'Araling Panlipunan', 'Science',
                    'TLE', 'MAPEH', 'GMRC', 'Edukasyon sa Pagpapakatao', 'Mother Tongue'
                ],
                isActive: true,
                createdAt: this.getRandomPastDate(30)
            },
            {
                id: 'TCH-G3-001',
                email: 'teacher.grade3@educaretrack.edu.ph',
                phone: '+639123456795',
                name: 'Mr. Antonio Cruz',
                role: 'teacher',
                classId: 'GRADE3-001',
                isHomeroom: true,
                assignedClasses: ['GRADE3-001'],
                assignedSubjects: [
                    'Math', 'English', 'Filipino', 'Araling Panlipunan', 'Science',
                    'TLE', 'MAPEH', 'GMRC', 'Edukasyon sa Pagpapakatao', 'Mother Tongue'
                ],
                isActive: true,
                createdAt: this.getRandomPastDate(30)
            },
            {
                id: 'TCH-G4-001',
                email: 'teacher.grade4@educaretrack.edu.ph',
                phone: '+639123456796',
                name: 'Ms. Lourdes Mendoza',
                role: 'teacher',
                classId: 'GRADE4-001',
                isHomeroom: true,
                assignedClasses: ['GRADE4-001'],
                assignedSubjects: [
                    'Math', 'English', 'Filipino', 'Araling Panlipunan', 'Science',
                    'TLE', 'MAPEH', 'GMRC', 'Edukasyon sa Pagpapakatao'
                ],
                isActive: true,
                createdAt: this.getRandomPastDate(30)
            },
            {
                id: 'TCH-G5-001',
                email: 'teacher.grade5@educaretrack.edu.ph',
                phone: '+639123456797',
                name: 'Mr. Ricardo Santos',
                role: 'teacher',
                classId: 'GRADE5-001',
                isHomeroom: true,
                assignedClasses: ['GRADE5-001'],
                assignedSubjects: [
                    'Math', 'English', 'Filipino', 'Araling Panlipunan', 'Science',
                    'TLE', 'MAPEH', 'GMRC', 'Edukasyon sa Pagpapakatao'
                ],
                isActive: true,
                createdAt: this.getRandomPastDate(30)
            },
            {
                id: 'TCH-G6-001',
                email: 'teacher.grade6@educaretrack.edu.ph',
                phone: '+639123456798',
                name: 'Ms. Patricia Lim',
                role: 'teacher',
                classId: 'GRADE6-001',
                isHomeroom: true,
                assignedClasses: ['GRADE6-001'],
                assignedSubjects: [
                    'Math', 'English', 'Filipino', 'Araling Panlipunan', 'Science',
                    'TLE', 'MAPEH', 'GMRC', 'Edukasyon sa Pagpapakatao'
                ],
                isActive: true,
                createdAt: this.getRandomPastDate(30)
            },

            // High School Teachers (Grades 7-10)
            {
                id: 'TCH-G7-001',
                email: 'teacher.grade7@educaretrack.edu.ph',
                phone: '+639123456799',
                name: 'Mr. Roberto Garcia',
                role: 'teacher',
                classId: 'GRADE7-001',
                isHomeroom: true,
                assignedClasses: ['GRADE7-001'],
                assignedSubjects: [
                    'English', 'Filipino', 'Mathematics', 'Science', 'Social Sciences',
                    'MAPEH', 'TLE', 'Edukasyon sa Pagpapakatao', 'Araling Panlipunan'
                ],
                isActive: true,
                createdAt: this.getRandomPastDate(30)
            },
            {
                id: 'TCH-G8-001',
                email: 'teacher.grade8@educaretrack.edu.ph',
                phone: '+639123456800',
                name: 'Ms. Carmen Reyes',
                role: 'teacher',
                classId: 'GRADE8-001',
                isHomeroom: true,
                assignedClasses: ['GRADE8-001'],
                assignedSubjects: [
                    'English', 'Filipino', 'Mathematics', 'Science', 'Social Sciences',
                    'MAPEH', 'TLE', 'Edukasyon sa Pagpapakatao', 'Araling Panlipunan'
                ],
                isActive: true,
                createdAt: this.getRandomPastDate(30)
            },
            {
                id: 'TCH-G9-001',
                email: 'teacher.grade9@educaretrack.edu.ph',
                phone: '+639123456801',
                name: 'Mr. Ferdinand Tan',
                role: 'teacher',
                classId: 'GRADE9-001',
                isHomeroom: true,
                assignedClasses: ['GRADE9-001'],
                assignedSubjects: [
                    'English', 'Filipino', 'Mathematics', 'Science', 'Social Sciences',
                    'MAPEH', 'TLE', 'Edukasyon sa Pagpapakatao', 'Araling Panlipunan'
                ],
                isActive: true,
                createdAt: this.getRandomPastDate(30)
            },
            {
                id: 'TCH-G10-001',
                email: 'teacher.grade10@educaretrack.edu.ph',
                phone: '+639123456802',
                name: 'Ms. Andrea Chua',
                role: 'teacher',
                classId: 'GRADE10-001',
                isHomeroom: true,
                assignedClasses: ['GRADE10-001'],
                assignedSubjects: [
                    'English', 'Filipino', 'Mathematics', 'Science', 'Social Sciences',
                    'MAPEH', 'TLE', 'Edukasyon sa Pagpapakatao', 'Araling Panlipunan'
                ],
                isActive: true,
                createdAt: this.getRandomPastDate(30)
            },

            // Senior High School Teachers
            {
                id: 'TCH-STEM-001',
                email: 'teacher.stem@educaretrack.edu.ph',
                phone: '+639123456803',
                name: 'Dr. Michael Chen',
                role: 'teacher',
                classId: 'STEM11-001',
                isHomeroom: true,
                assignedClasses: ['STEM11-001', 'STEM12-001'],
                assignedSubjects: [
                    'General Mathematics', 'Statistics and Probability', 'Earth Science',
                    'Physical Science', 'Pre-Calculus', 'Basic Calculus', 'General Biology 1',
                    'General Biology 2', 'General Chemistry 1', 'General Chemistry 2',
                    'General Physics 1', 'General Physics 2'
                ],
                isActive: true,
                createdAt: this.getRandomPastDate(30)
            },
            {
                id: 'TCH-ABM-001',
                email: 'teacher.abm@educaretrack.edu.ph',
                phone: '+639123456804',
                name: 'Ms. Isabel Ortega',
                role: 'teacher',
                classId: 'ABM11-001',
                isHomeroom: true,
                assignedClasses: ['ABM11-001', 'ABM12-001'],
                assignedSubjects: [
                    'Business Mathematics', 'Business Finance', 'Applied Economics',
                    'Fundamentals of Accounting and Business Management 1',
                    'Fundamentals of Accounting and Business Management 2',
                    'Organization and Business Management', 'Principles of Marketing'
                ],
                isActive: true,
                createdAt: this.getRandomPastDate(30)
            },
            {
                id: 'TCH-HUMSS-001',
                email: 'teacher.humss@educaretrack.edu.ph',
                phone: '+639123456805',
                name: 'Mr. Jose Ramirez',
                role: 'teacher',
                classId: 'HUMSS11-001',
                isHomeroom: true,
                assignedClasses: ['HUMSS11-001', 'HUMSS12-001'],
                assignedSubjects: [
                    'Creative Writing (Fiction)', 'Creative Writing (Non-Fiction)',
                    'Introduction to World Religions and Belief Systems',
                    'Philippine Politics and Governance', 'Community Engagement, Solidarity, and Citizenship',
                    'Discipline and Ideas in the Social Sciences',
                    'Discipline and Ideas in the Applied Social Sciences'
                ],
                isActive: true,
                createdAt: this.getRandomPastDate(30)
            }
        ];

        for (const teacherData of teachers) {
            await db.collection('users').doc(teacherData.id).set(teacherData);
        }

        console.log(`✅ Created ${teachers.length} teachers with assigned subjects`);
    },

    async createStudentsAndParents(classes) {
        console.log('Creating students and parents...');

        const students = [];
        const parents = [];
        let parentCounter = 1;

        // Filipino names for realistic data
        const firstNames = [
            'Juan', 'Maria', 'Jose', 'Ana', 'Pedro', 'Teresa', 'Miguel', 'Carmen',
            'Antonio', 'Rosa', 'Francisco', 'Elena', 'Carlos', 'Lourdes', 'Ramon',
            'Sofia', 'Ricardo', 'Isabel', 'Fernando', 'Andrea', 'Eduardo', 'Patricia',
            'Alberto', 'Gabriela', 'Roberto', 'Beatriz', 'Manuel', 'Clara', 'Raul',
            'Margarita', 'Javier', 'Dolores', 'Alfredo', 'Concepcion', 'Arturo', 'Mercedes'
        ];

        const lastNames = [
            'Santos', 'Reyes', 'Cruz', 'Bautista', 'Ocampo', 'Garcia', 'Mendoza',
            'Torres', 'Gonzalez', 'Ramos', 'Aquino', 'Villanueva', 'Castillo', 'Fernandez',
            'Lopez', 'Navarro', 'Romero', 'Silva', 'Morales', 'Del Rosario', 'Salazar',
            'Vargas', 'Domingo', 'Rivera', 'Estrada', 'Perez', 'Gutierrez', 'Hernandez',
            'Jimenez', 'Moreno', 'Sanchez', 'Villegas', 'Alvarez', 'Ruiz', 'Medina'
        ];

        // Create 3 students for each class
        for (const classData of classes) {
            for (let i = 1; i <= 3; i++) {
                const studentId = `STU-${classData.id}-${i}`;
                let parentId = `PAR-${parentCounter.toString().padStart(3, '0')}`;

                const reuseExisting = Math.random() < 0.25 && parents.length > 0;
                if (reuseExisting) {
                    const pickIdx = Math.floor(Math.random() * Math.min(5, parents.length));
                    parentId = parents[pickIdx].id;
                } else if (i % 2 === 0 && students.length > 0 && Math.random() < 0.6) {
                    const prevStudent = students[students.length - 1];
                    parentId = prevStudent.parentId;
                } else {
                    parentCounter++;
                }

                const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
                const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
                const studentName = `${firstName} ${lastName}`;

                // Student data
                const studentData = {
                    id: studentId,
                    studentId: studentId,
                    name: studentName,
                    lrn: this.generateLRN(),
                    grade: classData.grade,
                    level: classData.level,
                    classId: classData.id,
                    parentId: parentId,
                    qrCode: studentId,
                    currentStatus: 'out_school',
                    subjects: classData.subjects,
                    isActive: true,
                    createdAt: this.getRandomPastDate(30)
                };

                // Add strand for Senior High students
                if (classData.level === 'Senior High') {
                    studentData.strand = classData.strand;
                }

                students.push(studentData);

                // Create parent if not existing yet
                const existingParent = parents.find(p => p.id === parentId);
                if (!existingParent) {
                    const parentName = `Mr./Mrs. ${lastName}`;
                    const parentData = {
                        id: parentId,
                        email: `parent${parentId}@gmail.com`,
                        phone: `+63917${Math.floor(1000000 + Math.random() * 9000000)}`,
                        name: parentName,
                        role: 'parent',
                        relationship: 'parent',
                        emergencyContact: `+63918${Math.floor(1000000 + Math.random() * 9000000)}`,
                        children: [studentId],
                        isActive: true,
                        createdAt: this.getRandomPastDate(30)
                    };
                    parents.push(parentData);
                } else {
                    // Add student to existing parent's children array
                    existingParent.children.push(studentId);
                }
            }
        }

        // Save parents to database
        for (const parentData of parents) {
            await db.collection('users').doc(parentData.id).set(parentData);
        }

        // Save students to database
        for (const studentData of students) {
            await db.collection('students').doc(studentData.id).set(studentData);
            // Link child to parent document as well
            const parentRef = db.collection('users').doc(studentData.parentId);
            const parentDoc = await parentRef.get();
            const currentChildren = parentDoc.exists && Array.isArray(parentDoc.data().children) ? parentDoc.data().children : [];
            await parentRef.set({ children: Array.from(new Set([...currentChildren, studentData.id])) }, { merge: true });
        }

        console.log(`✅ Created ${students.length} students and ${parents.length} parents`);
        console.log(`📊 Distribution: ${classes.length} classes × 3 students each`);
    },

    async createMonthlyAttendanceNovDec() {
        console.log('Creating monthly attendance (Nov–Dec)...');
        const studentsSnapshot = await db.collection('students').get();
        const students = studentsSnapshot.docs.map(doc => doc.data());

        const now = new Date();
        const year = now.getFullYear();
        const start = new Date(year, 10, 1);
        const end = new Date(year, 11, now.getDate());

        const isWeekend = (d) => {
            const day = d.getDay();
            return day === 0 || day === 6;
        };

        const dayIter = new Date(start);
        while (dayIter <= end) {
            if (!isWeekend(dayIter)) {
                for (const student of students) {
                    const r = Math.random();
                    if (r < 0.8) {
                        const entryTime = new Date(dayIter);
                        entryTime.setHours(7, Math.floor(Math.random() * 20));
                        await db.collection('attendance').add({
                            studentId: student.id,
                            studentName: student.name,
                            classId: student.classId,
                            entryType: 'entry',
                            timestamp: entryTime,
                            time: entryTime.toTimeString().split(' ')[0].substring(0, 5),
                            session: 'morning',
                            status: 'present',
                            recordedBy: 'GRD-001',
                            recordedByName: 'Juan Dela Cruz'
                        });
                        if (Math.random() < 0.85) {
                            const exitTime = new Date(dayIter);
                            exitTime.setHours(15 + Math.floor(Math.random() * 2), Math.floor(Math.random() * 60));
                            await db.collection('attendance').add({
                                studentId: student.id,
                                studentName: student.name,
                                classId: student.classId,
                                entryType: 'exit',
                                timestamp: exitTime,
                                time: exitTime.toTimeString().split(' ')[0].substring(0, 5),
                                session: 'afternoon',
                                status: 'present',
                                recordedBy: 'GRD-001',
                                recordedByName: 'Juan Dela Cruz'
                            });
                        }
                    } else if (r < 0.9) {
                        const entryTime = new Date(dayIter);
                        entryTime.setHours(7 + Math.floor(Math.random() * 2), 30 + Math.floor(Math.random() * 60));
                        await db.collection('attendance').add({
                            studentId: student.id,
                            studentName: student.name,
                            classId: student.classId,
                            entryType: 'entry',
                            timestamp: entryTime,
                            time: entryTime.toTimeString().split(' ')[0].substring(0, 5),
                            session: 'morning',
                            status: 'late',
                            recordedBy: 'GRD-001',
                            recordedByName: 'Juan Dela Cruz'
                        });
                    } else {
                        await db.collection('attendance').add({
                            studentId: student.id,
                            studentName: student.name,
                            classId: student.classId,
                            entryType: 'absent',
                            timestamp: new Date(dayIter),
                            time: 'N/A',
                            session: 'morning',
                            status: 'absent',
                            recordedBy: 'GRD-001',
                            recordedByName: 'Juan Dela Cruz'
                        });
                    }
                }
            }
            dayIter.setDate(dayIter.getDate() + 1);
        }
        console.log('✅ Monthly attendance created for Nov–Dec');
    },

    async createExcuseLettersNovDec() {
        console.log('Creating excuse letters (Nov–Dec)...');
        const studentsSnapshot = await db.collection('students').get();
        const students = studentsSnapshot.docs.map(doc => doc.data());

        const now = new Date();
        const year = now.getFullYear();
        const start = new Date(year, 10, 1);
        const end = new Date(year, 11, now.getDate());

        const reasons = ['Illness', 'Family Emergency', 'Appointment', 'Travel'];
        const statuses = ['approved', 'pending', 'rejected'];

        for (const student of students) {
            const entries = Math.floor(2 + Math.random() * 3);
            for (let i = 0; i < entries; i++) {
                const day = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
                const submitted = new Date(day);
                submitted.setDate(day.getDate() + Math.floor(Math.random() * 3));
                const statusRand = Math.random();
                const status = statusRand < 0.6 ? 'approved' : statusRand < 0.85 ? 'pending' : 'rejected';
                const reason = reasons[Math.floor(Math.random() * reasons.length)];
                await db.collection('excuseLetters').add({
                    studentId: student.id,
                    studentName: student.name,
                    classId: student.classId,
                    type: 'absence',
                    reason: reason,
                    status: status,
                    submittedAt: submitted,
                    notes: `Excuse letter for ${reason.toLowerCase()}`
                });
            }
        }
        console.log('✅ Excuse letters created for Nov–Dec');
    },

    async createClinicRecordsNovDec() {
        console.log('Creating clinic records (Nov–Dec)...');
        const studentsSnapshot = await db.collection('students').get();
        const students = studentsSnapshot.docs.map(doc => doc.data());

        const now = new Date();
        const year = now.getFullYear();
        const start = new Date(year, 10, 1);
        const end = new Date(year, 11, now.getDate());

        const reasons = ['Fever', 'Headache', 'Stomach Ache', 'Injury', 'Dizziness', 'Cough', 'Cold'];
        const isWeekend = (d) => {
            const day = d.getDay();
            return day === 0 || day === 6;
        };

        const dayIter = new Date(start);
        while (dayIter <= end) {
            if (!isWeekend(dayIter)) {
                for (const student of students) {
                    if (Math.random() < 0.06) {
                        const visitTime = new Date(dayIter);
                        visitTime.setHours(9 + Math.floor(Math.random() * 6), Math.floor(Math.random() * 60));
                        const reason = reasons[Math.floor(Math.random() * reasons.length)];
                        await db.collection('clinicVisits').add({
                            studentId: student.id,
                            studentName: student.name,
                            classId: student.classId,
                            checkIn: true,
                            timestamp: visitTime,
                            reason: reason,
                            notes: `Student visited clinic for ${reason.toLowerCase()}`,
                            staffId: 'CLN-001',
                            staffName: 'Nurse Anna Reyes'
                        });
                    }
                }
            }
            dayIter.setDate(dayIter.getDate() + 1);
        }
        console.log('✅ Clinic records created for Nov–Dec');
    },

    async createSampleActivity() {
        console.log('Creating sample activity data...');

        // Get all students
        const studentsSnapshot = await db.collection('students').get();
        const students = studentsSnapshot.docs.map(doc => doc.data());

        // Create attendance records for the last 7 days
        const today = new Date();
        for (let day = 0; day < 7; day++) {
            const date = new Date(today);
            date.setDate(date.getDate() - day);

            for (const student of students) {
                // 90% chance of attendance each day
                if (Math.random() < 0.9) {
                    // Create entry record (morning)
                    const entryTime = new Date(date);
                    entryTime.setHours(7 + Math.floor(Math.random() * 2), Math.floor(Math.random() * 60));
                    
                    const isLate = entryTime.getHours() > 7 || (entryTime.getHours() === 7 && entryTime.getMinutes() > 30);
                    
                    await db.collection('attendance').add({
                        studentId: student.id,
                        studentName: student.name,
                        classId: student.classId,
                        entryType: 'entry',
                        timestamp: entryTime,
                        time: entryTime.toTimeString().split(' ')[0].substring(0, 5),
                        session: 'morning',
                        status: isLate ? 'late' : 'present',
                        recordedBy: 'GRD-001',
                        recordedByName: 'Juan Dela Cruz'
                    });

                    // Create exit record (afternoon) - 80% chance
                    if (Math.random() < 0.8) {
                        const exitTime = new Date(date);
                        exitTime.setHours(15 + Math.floor(Math.random() * 2), Math.floor(Math.random() * 60));
                        
                        await db.collection('attendance').add({
                            studentId: student.id,
                            studentName: student.name,
                            classId: student.classId,
                            entryType: 'exit',
                            timestamp: exitTime,
                            time: exitTime.toTimeString().split(' ')[0].substring(0, 5),
                            session: 'afternoon',
                            status: 'present',
                            recordedBy: 'GRD-001',
                            recordedByName: 'Juan Dela Cruz'
                        });
                    }
                }

                // 5% chance of clinic visit
                if (Math.random() < 0.05) {
                    const visitTime = new Date(date);
                    visitTime.setHours(9 + Math.floor(Math.random() * 6), Math.floor(Math.random() * 60));
                    
                    const reasons = ['Fever', 'Headache', 'Stomach ache', 'Minor injury', 'Dizziness'];
                    const reason = reasons[Math.floor(Math.random() * reasons.length)];
                    
                    await db.collection('clinicVisits').add({
                        studentId: student.id,
                        studentName: student.name,
                        classId: student.classId,
                        checkIn: true,
                        timestamp: visitTime,
                        reason: reason,
                        notes: `Student visited clinic for ${reason.toLowerCase()}`,
                        staffId: 'CLN-001',
                        staffName: 'Nurse Anna Reyes'
                    });
                }
            }
        }

        // Create some announcements
        const announcements = [
            {
                title: 'Welcome to New School Year',
                message: 'We welcome all students and parents to the new academic year 2024-2025. Classes begin on June 3, 2024.',
                audience: 'all',
                isUrgent: true,
                createdBy: 'ADM-001',
                createdByName: 'Dr. Maria Santos',
                createdAt: this.getRandomPastDate(10),
                isActive: true
            },
            {
                title: 'Parent-Teacher Conference',
                message: 'Quarterly parent-teacher conference will be held on June 28, 2024. Please coordinate with your class advisers.',
                audience: 'parents',
                isUrgent: false,
                createdBy: 'ADM-001',
                createdByName: 'Dr. Maria Santos',
                createdAt: this.getRandomPastDate(5),
                isActive: true
            },
            {
                title: 'Science Fair Competition',
                message: 'Annual science fair will be on July 15-16, 2024. All students from Grade 4 to Senior High are encouraged to participate.',
                audience: 'all',
                isUrgent: false,
                createdBy: 'TCH-STEM-001',
                createdByName: 'Dr. Michael Chen',
                createdAt: this.getRandomPastDate(3),
                isActive: true
            }
        ];

        for (const announcement of announcements) {
            await db.collection('announcements').add(announcement);
        }

        console.log('✅ Created sample activity data (attendance, clinic visits, announcements)');
    },

    // Utility methods
    generateLRN() {
        return Math.floor(100000000000 + Math.random() * 900000000000).toString();
    },

    getRandomPastDate(maxDaysAgo = 30) {
        const date = new Date();
        date.setDate(date.getDate() - Math.floor(Math.random() * maxDaysAgo));
        return date;
    },

    async clearExistingData() {
        console.log('⚠️ Clearing existing data...');
        
        const collections = ['users', 'students', 'classes', 'attendance', 'clinicVisits', 'announcements', 'notifications'];
        
        for (const collectionName of collections) {
            const snapshot = await db.collection(collectionName).get();
            const batch = db.batch();
            
            snapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });
            
            await batch.commit();
            console.log(`Cleared ${collectionName}`);
        }
    }
};

// Initialize data when the script loads
document.addEventListener('DOMContentLoaded', async function() {
    // Add initialization button to the page for easy access
    const initButton = document.createElement('button');
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
        const ok = window.EducareTrack && typeof window.EducareTrack.confirmAction === 'function'
            ? await window.EducareTrack.confirmAction('This will initialize dummy data. Continue?', 'Initialize Data', 'Initialize', 'Cancel')
            : true;
        if (!ok) return;
        const success = await DataInitializer.initializeDummyData();
        if (success) {
            if (window.EducareTrack && typeof window.EducareTrack.showNormalNotification === 'function') {
                window.EducareTrack.showNormalNotification({ title: 'Success', message: 'Dummy data initialized successfully!' });
            }
        } else {
            if (window.EducareTrack && typeof window.EducareTrack.showNormalNotification === 'function') {
                window.EducareTrack.showNormalNotification({ title: 'Error', message: 'Failed to initialize dummy data' });
            }
        }
    });
    
    document.body.appendChild(initButton);
});

// Make DataInitializer available globally
window.DataInitializer = DataInitializer;

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DataInitializer;
}
