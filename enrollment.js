// enrollment.js - Simplified Enrollment System without Photo Upload
class EnrollmentSystem {
    constructor() {
        this.currentStep = 1;
        this.generatedStudentId = '';
        this.enrollmentData = {
            parent: {},
            student: {}
        };
    }

    // Initialize enrollment system
    init() {
        this.createModal();
        this.bindEvents();
        console.log('Enrollment system initialized');
    }

    // Create enrollment modal HTML
    createModal() {
        const modalHTML = `
            <div id="enrollmentModal" class="fixed inset-0 bg-black bg-opacity-50 z-50 hidden">
                <div class="flex items-center justify-center min-h-screen p-4">
                    <div class="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
                        <!-- Modal Header -->
                        <div class="bg-blue-600 text-white p-4 flex justify-between items-center">
                            <h3 class="text-lg font-semibold" id="enrollmentModalTitle">Enroll New Student</h3>
                            <button id="closeEnrollmentModal" class="text-white hover:text-gray-200">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>

                        <!-- Progress Steps -->
                        <div class="bg-gray-100 p-4">
                            <div class="flex justify-between items-center">
                                ${this.createStepIndicator()}
                            </div>
                        </div>

                        <!-- Modal Content -->
                        <div class="p-6 overflow-y-auto max-h-[60vh]">
                            ${this.createStep1()}
                            ${this.createStep2()}
                            ${this.createStep3()}
                            ${this.createStep4()}
                        </div>

                        <!-- Modal Footer -->
                        <div class="bg-gray-50 px-6 py-4 border-t border-gray-200">
                            <div class="flex justify-between">
                                <button id="prevBtn" class="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded-md font-medium transition duration-200 hidden">
                                    Previous
                                </button>
                                <button id="nextBtn" class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md font-medium transition duration-200 ml-auto">
                                    Next: Student Details
                                </button>
                                <button id="enrollBtn" class="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-md font-medium transition duration-200 hidden">
                                    Complete Enrollment
                                </button>
                                <button id="printBtn" class="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-md font-medium transition duration-200 hidden">
                                    Print ID Card
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Add modal to body if not exists
        if (!document.getElementById('enrollmentModal')) {
            document.body.insertAdjacentHTML('beforeend', modalHTML);
        }
    }

    createStepIndicator() {
        const steps = [
            { number: 1, label: 'Parent Info' },
            { number: 2, label: 'Student Info' },
            { number: 3, label: 'Preview' },
            { number: 4, label: 'ID Card' }
        ];

        return steps.map((step, index) => `
            <div class="flex-1 flex items-center">
                ${index > 0 ? '<div class="h-1 bg-gray-300 flex-1 mx-2"></div>' : ''}
                <div class="step-indicator" data-step="${step.number}">${step.number}</div>
                <div class="step-label">${step.label}</div>
            </div>
        `).join('');
    }

    createStep1() {
        return `
            <div id="step1" class="step-content active">
                <form id="parentForm" class="space-y-4">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Parent Name *</label>
                            <input type="text" id="parentName" required 
                                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Phone Number *</label>
                            <input type="tel" id="parentPhone" required 
                                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                        </div>
                        <div class="md:col-span-2">
                            <label class="block text-sm font-medium text-gray-700 mb-2">Address *</label>
                            <textarea id="parentAddress" required rows="3"
                                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"></textarea>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Email</label>
                            <input type="email" id="parentEmail"
                                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Relationship *</label>
                            <select id="parentRelationship" required
                                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="parent">Parent</option>
                                <option value="guardian">Guardian</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Emergency Contact *</label>
                            <input type="tel" id="emergencyContact" required 
                                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                        </div>
                    </div>
                </form>
            </div>
        `;
    }

    createStep2() {
        return `
            <div id="step2" class="step-content hidden">
                <form id="studentForm" class="space-y-4">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Student Name *</label>
                            <input type="text" id="studentName" required 
                                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">LRN *</label>
                            <input type="text" id="studentLRN" required 
                                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Grade *</label>
                            <input type="text" id="studentGrade" required 
                                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Level *</label>
                            <select id="studentLevel" required
                                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="">Select Level</option>
                                <option value="Elementary">Elementary</option>
                                <option value="Highschool">Highschool</option>
                                <option value="Senior High">Senior High</option>
                            </select>
                        </div>
                    </div>
                    
                    <!-- Simple note about photo -->
                    <div class="mt-6 p-4 bg-blue-50 rounded-lg">
                        <div class="flex items-center">
                            <i class="fas fa-info-circle text-blue-500 mr-3"></i>
                            <p class="text-sm text-blue-700">
                                <strong>Note:</strong> Student photo feature will be available in Capstone 2. 
                                For now, the system will use a default avatar.
                            </p>
                        </div>
                    </div>
                </form>
            </div>
        `;
    }

    createStep3() {
        return `
            <div id="step3" class="step-content hidden">
                <div class="bg-gray-50 rounded-lg p-6">
                    <h3 class="text-lg font-semibold text-gray-800 mb-4">Preview Enrollment Details</h3>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <!-- Parent Information Preview -->
                        <div>
                            <h4 class="font-medium text-gray-700 mb-3">Parent/Guardian Information</h4>
                            <div class="space-y-2 text-sm">
                                <div><span class="font-medium">Name:</span> <span id="previewParentName">-</span></div>
                                <div><span class="font-medium">Phone:</span> <span id="previewParentPhone">-</span></div>
                                <div><span class="font-medium">Email:</span> <span id="previewParentEmail">-</span></div>
                                <div><span class="font-medium">Address:</span> <span id="previewParentAddress">-</span></div>
                                <div><span class="font-medium">Relationship:</span> <span id="previewParentRelationship">-</span></div>
                                <div><span class="font-medium">Emergency Contact:</span> <span id="previewEmergencyContact">-</span></div>
                            </div>
                        </div>
                        
                        <!-- Student Information Preview -->
                        <div>
                            <h4 class="font-medium text-gray-700 mb-3">Student Information</h4>
                            <div class="space-y-2 text-sm">
                                <div><span class="font-medium">Name:</span> <span id="previewStudentName">-</span></div>
                                <div><span class="font-medium">LRN:</span> <span id="previewStudentLRN">-</span></div>
                                <div><span class="font-medium">Grade:</span> <span id="previewStudentGrade">-</span></div>
                                <div><span class="font-medium">Level:</span> <span id="previewStudentLevel">-</span></div>
                                <div><span class="font-medium">Student ID:</span> <span id="previewStudentId">-</span></div>
                            </div>
                            <div class="mt-3 text-xs text-gray-500">
                                <i class="fas fa-info-circle mr-1"></i>
                                Photo feature available in Capstone 2
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    createStep4() {
        return `
            <div id="step4" class="step-content hidden">
                <div class="text-center">
                    <h3 class="text-lg font-semibold text-gray-800 mb-4">Student ID Card</h3>
                    <p class="text-gray-600 mb-6">Preview and print the student ID card</p>
                    
                    <div class="flex flex-col md:flex-row gap-6 justify-center items-start">
                        <!-- ID Front -->
                        <div class="bg-white border-2 border-gray-300 rounded-lg p-6 w-80">
                            <div class="text-center mb-4">
                                <h4 class="font-bold text-blue-800 text-lg">EDUCARETRACK ACADEMY</h4>
                                <p class="text-xs text-gray-600">123 Learning Street, Knowledge City</p>
                            </div>
                            
                            <div class="flex flex-col items-center mb-4">
                                <div class="w-24 h-24 bg-blue-100 rounded-full mb-3 flex items-center justify-center">
                                    <i class="fas fa-user-graduate text-blue-500 text-3xl"></i>
                                </div>
                                <h5 id="idStudentName" class="font-bold text-lg text-center"></h5>
                                <p id="idStudentAddress" class="text-sm text-gray-600 text-center"></p>
                            </div>
                            
                            <div class="border-t pt-3">
                                <div class="flex justify-between text-sm">
                                    <span>Grade Level:</span>
                                    <span id="idStudentGrade" class="font-medium"></span>
                                </div>
                                <div class="flex justify-between text-sm">
                                    <span>Student ID:</span>
                                    <span id="idStudentId" class="font-medium"></span>
                                </div>
                                <div class="flex justify-between text-sm">
                                    <span>Valid Until:</span>
                                    <span id="idValidUntil" class="font-medium"></span>
                                </div>
                            </div>
                        </div>
                        
                        <!-- ID Back -->
                        <div class="bg-white border-2 border-gray-300 rounded-lg p-6 w-80">
                            <div class="text-center mb-4">
                                <h4 class="font-bold text-blue-800 text-lg">STUDENT ID CARD</h4>
                                <p class="text-xs text-gray-600">Back Side</p>
                            </div>
                            
                            <div class="mb-4 flex justify-center">
                                <div id="qrcode" class="w-32 h-32 bg-gray-100 flex items-center justify-center border border-gray-300 rounded">
                                    <div class="text-center">
                                        <i class="fas fa-qrcode text-gray-400 text-2xl mb-2"></i>
                                        <p class="text-gray-500 text-xs">QR Code Placeholder</p>
                                        <p class="text-gray-400 text-xs">Student ID: <span id="qrPlaceholderId"></span></p>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="space-y-2 text-sm">
                                <div class="flex justify-between">
                                    <span class="font-medium">Parent/Guardian:</span>
                                    <span id="idParentName"></span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="font-medium">Contact:</span>
                                    <span id="idParentContact"></span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="font-medium">Emergency:</span>
                                    <span id="idEmergencyContact"></span>
                                </div>
                            </div>
                            
                            <div class="mt-4 text-xs text-gray-500 text-center">
                                <p>This card is property of EducareTrack Academy</p>
                                <p>If found, please return to school office</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // Bind event listeners
    bindEvents() {
        // Modal controls
        document.getElementById('closeEnrollmentModal')?.addEventListener('click', () => this.close());
        document.getElementById('prevBtn')?.addEventListener('click', () => this.previousStep());
        document.getElementById('nextBtn')?.addEventListener('click', () => this.nextStep());
        document.getElementById('enrollBtn')?.addEventListener('click', () => this.completeEnrollment());
        document.getElementById('printBtn')?.addEventListener('click', () => this.printIDCard());
    }

    // Open enrollment modal
    open() {
        document.getElementById('enrollmentModal').classList.remove('hidden');
        this.reset();
    }

    // Close enrollment modal
    close() {
        document.getElementById('enrollmentModal').classList.add('hidden');
        this.reset();
    }

    // Reset enrollment form
    reset() {
        this.currentStep = 1;
        this.generatedStudentId = '';
        this.enrollmentData = { parent: {}, student: {} };
        
        // Reset forms
        document.getElementById('parentForm')?.reset();
        document.getElementById('studentForm')?.reset();
        
        this.updateStepIndicators();
        this.showStep(1);
    }

    // Step navigation
    updateStepIndicators() {
        document.querySelectorAll('.step-indicator').forEach((indicator, index) => {
            if (index + 1 === this.currentStep) {
                indicator.classList.add('active');
            } else if (index + 1 < this.currentStep) {
                indicator.classList.add('active');
            } else {
                indicator.classList.remove('active');
            }
        });
    }

    showStep(step) {
        document.querySelectorAll('.step-content').forEach(content => {
            content.classList.add('hidden');
            content.classList.remove('active');
        });
        
        const stepElement = document.getElementById(`step${step}`);
        if (stepElement) {
            stepElement.classList.remove('hidden');
            stepElement.classList.add('active');
        }

        // Update buttons
        document.getElementById('prevBtn').classList.toggle('hidden', step === 1);
        document.getElementById('nextBtn').classList.toggle('hidden', step === 4);
        document.getElementById('enrollBtn').classList.toggle('hidden', step !== 3);
        document.getElementById('printBtn').classList.toggle('hidden', step !== 4);

        // Update next button text
        const nextBtn = document.getElementById('nextBtn');
        if (step === 1) {
            nextBtn.textContent = 'Next: Student Details';
        } else if (step === 2) {
            nextBtn.textContent = 'Next: Preview';
        } else if (step === 3) {
            nextBtn.textContent = 'Next: ID Card';
        }

        // Update data when showing preview or ID card
        if (step === 3) {
            this.updatePreview();
        } else if (step === 4) {
            this.generateIDCard();
        }
    }

    nextStep() {
        if (this.validateStep(this.currentStep)) {
            this.currentStep++;
            this.updateStepIndicators();
            this.showStep(this.currentStep);
        }
    }

    previousStep() {
        this.currentStep--;
        this.updateStepIndicators();
        this.showStep(this.currentStep);
    }

    validateStep(step) {
        if (step === 1) {
            const requiredFields = ['parentName', 'parentPhone', 'parentAddress', 'emergencyContact'];
            for (const field of requiredFields) {
                const value = document.getElementById(field).value.trim();
                if (!value) {
                    alert(`Please fill in ${field.replace('parent', '').replace(/([A-Z])/g, ' $1').toLowerCase()}`);
                    return false;
                }
            }
            return true;
        } else if (step === 2) {
            const requiredFields = ['studentName', 'studentLRN', 'studentGrade', 'studentLevel'];
            for (const field of requiredFields) {
                const value = document.getElementById(field).value.trim();
                if (!value) {
                    alert(`Please fill in ${field.replace('student', '').replace(/([A-Z])/g, ' $1').toLowerCase()}`);
                    return false;
                }
            }
            return true;
        }
        return true;
    }

    updatePreview() {
        // Store data
        this.enrollmentData.parent = {
            name: document.getElementById('parentName').value,
            phone: document.getElementById('parentPhone').value,
            email: document.getElementById('parentEmail').value,
            address: document.getElementById('parentAddress').value,
            relationship: document.getElementById('parentRelationship').value,
            emergencyContact: document.getElementById('emergencyContact').value
        };

        this.enrollmentData.student = {
            name: document.getElementById('studentName').value,
            lrn: document.getElementById('studentLRN').value,
            grade: document.getElementById('studentGrade').value,
            level: document.getElementById('studentLevel').value
        };

        // Update preview display
        document.getElementById('previewParentName').textContent = this.enrollmentData.parent.name;
        document.getElementById('previewParentPhone').textContent = this.enrollmentData.parent.phone;
        document.getElementById('previewParentEmail').textContent = this.enrollmentData.parent.email || 'Not provided';
        document.getElementById('previewParentAddress').textContent = this.enrollmentData.parent.address;
        document.getElementById('previewParentRelationship').textContent = this.enrollmentData.parent.relationship;
        document.getElementById('previewEmergencyContact').textContent = this.enrollmentData.parent.emergencyContact;

        document.getElementById('previewStudentName').textContent = this.enrollmentData.student.name;
        document.getElementById('previewStudentLRN').textContent = this.enrollmentData.student.lrn;
        document.getElementById('previewStudentGrade').textContent = this.enrollmentData.student.grade;
        document.getElementById('previewStudentLevel').textContent = this.enrollmentData.student.level;

        // Generate student ID
        this.generatedStudentId = this.generateStudentId(this.enrollmentData.student.lrn);
        document.getElementById('previewStudentId').textContent = this.generatedStudentId;
    }

    generateStudentId(lrn) {
        const year = new Date().getFullYear();
        const last4LRN = lrn.slice(-4);
        const studentNumber = Math.floor(1000 + Math.random() * 9000).toString();
        return `EDU-${year}-${last4LRN}-${studentNumber}`;
    }

    generateIDCard() {
        // Set ID card data
        document.getElementById('idStudentName').textContent = this.enrollmentData.student.name;
        document.getElementById('idStudentAddress').textContent = this.enrollmentData.parent.address;
        document.getElementById('idStudentGrade').textContent = this.enrollmentData.student.grade;
        document.getElementById('idStudentId').textContent = this.generatedStudentId;
        
        const nextYear = new Date();
        nextYear.setFullYear(nextYear.getFullYear() + 1);
        document.getElementById('idValidUntil').textContent = nextYear.toLocaleDateString('en-PH');

        document.getElementById('idParentName').textContent = this.enrollmentData.parent.name;
        document.getElementById('idParentContact').textContent = this.enrollmentData.parent.phone;
        document.getElementById('idEmergencyContact').textContent = this.enrollmentData.parent.emergencyContact;

        // Set QR code placeholder
        document.getElementById('qrPlaceholderId').textContent = this.generatedStudentId;

        // Try to generate QR code if library is available
        this.tryGenerateQRCode();
    }

    tryGenerateQRCode() {
        // Check if QRCode library is available
        if (typeof QRCode !== 'undefined') {
            try {
                const qrData = JSON.stringify({
                    studentId: this.generatedStudentId,
                    name: this.enrollmentData.student.name,
                    grade: this.enrollmentData.student.grade
                });
                
                // Clear previous QR code
                const qrElement = document.getElementById('qrcode');
                qrElement.innerHTML = '';
                
                QRCode.toCanvas(qrElement, qrData, function (error) {
                    if (error) {
                        console.warn('QR Code generation failed, using placeholder:', error);
                        // Fallback to placeholder
                        document.getElementById('qrcode').innerHTML = `
                            <div class="text-center">
                                <i class="fas fa-qrcode text-gray-400 text-2xl mb-2"></i>
                                <p class="text-gray-500 text-xs">QR Code Placeholder</p>
                                <p class="text-gray-400 text-xs">Student ID: ${this.generatedStudentId}</p>
                            </div>
                        `;
                    }
                }.bind(this));
            } catch (error) {
                console.warn('QR Code generation error:', error);
                // Use placeholder if QR code fails
                document.getElementById('qrcode').innerHTML = `
                    <div class="text-center">
                        <i class="fas fa-qrcode text-gray-400 text-2xl mb-2"></i>
                        <p class="text-gray-500 text-xs">QR Code Placeholder</p>
                        <p class="text-gray-400 text-xs">Student ID: ${this.generatedStudentId}</p>
                    </div>
                `;
            }
        } else {
            console.warn('QRCode library not available, using placeholder');
            // Use placeholder if QRCode is not defined
            document.getElementById('qrcode').innerHTML = `
                <div class="text-center">
                    <i class="fas fa-qrcode text-gray-400 text-2xl mb-2"></i>
                    <p class="text-gray-500 text-xs">QR Code Placeholder</p>
                    <p class="text-gray-400 text-xs">Student ID: ${this.generatedStudentId}</p>
                </div>
            `;
        }
    }

    async completeEnrollment() {
        try {
            // Validate EducareTrack is available
            if (!window.EducareTrack) {
                throw new Error('EducareTrack core system not available');
            }

            if (!window.EducareTrack.currentUser || window.EducareTrack.currentUser.role !== 'admin') {
                throw new Error('Only admins can enroll students');
            }

            // Show loading state
            const enrollBtn = document.getElementById('enrollBtn');
            enrollBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Enrolling...';
            enrollBtn.disabled = true;

            // Call EducareTrack enrollment without photo
            const result = await EducareTrack.enrollStudentWithParent(
                this.enrollmentData.parent,
                this.enrollmentData.student,
                null // No photo file
            );
            
            // Show success message
            alert('Student enrolled successfully!');
            
            // Move to ID card step
            this.nextStep();
            
        } catch (error) {
            console.error('Enrollment error:', error);
            alert('Error enrolling student: ' + error.message);
            
            // Reset button state
            const enrollBtn = document.getElementById('enrollBtn');
            enrollBtn.innerHTML = 'Complete Enrollment';
            enrollBtn.disabled = false;
        }
    }

    printIDCard() {
        const idCardFront = document.querySelector('.bg-white.border-2.border-gray-300.rounded-lg.p-6.w-80');
        const idCardBack = document.querySelectorAll('.bg-white.border-2.border-gray-300.rounded-lg.p-6.w-80')[1];

        if (!idCardFront || !idCardBack) {
            alert('ID card elements not found');
            return;
        }

        // Use html2canvas if available, otherwise show message
        if (typeof html2canvas !== 'undefined') {
            html2canvas(idCardFront).then(canvas1 => {
                html2canvas(idCardBack).then(canvas2 => {
                    const printWindow = window.open('', '_blank');
                    printWindow.document.write(`
                        <html>
                            <head>
                                <title>Print ID Card - ${this.enrollmentData.student.name}</title>
                                <style>
                                    body { margin: 0; padding: 20px; background: #f3f4f6; }
                                    .id-container { display: flex; gap: 20px; justify-content: center; flex-wrap: wrap; }
                                    img { max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 8px; }
                                    @media print {
                                        body { background: white; padding: 0; }
                                        .id-container { gap: 10px; }
                                    }
                                </style>
                            </head>
                            <body>
                                <div class="id-container">
                                    <img src="${canvas1.toDataURL()}" />
                                    <img src="${canvas2.toDataURL()}" />
                                </div>
                                <script>
                                    window.onload = function() {
                                        window.print();
                                        setTimeout(function() {
                                            window.close();
                                        }, 1000);
                                    }
                                <\/script>
                            </body>
                        </html>
                    `);
                    printWindow.document.close();
                });
            }).catch(error => {
                console.error('Print error:', error);
                alert('Printing failed. Please try taking a screenshot instead.');
            });
        } else {
            alert('Print feature not available. Please take a screenshot of the ID card.');
        }
    }

    // Get enrollment page content for dashboard
    getEnrollmentPageContent() {
        return `
            <div class="bg-white rounded-lg shadow-md p-6">
                <div class="text-center mb-8">
                    <h2 class="text-2xl font-bold text-gray-800 mb-2">Student Enrollment</h2>
                    <p class="text-gray-600">Enroll new students and generate their ID cards</p>
                </div>
                
                <div class="max-w-2xl mx-auto">
                    <!-- Enrollment Stats -->
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                        <div class="bg-blue-50 rounded-lg p-4 text-center">
                            <div class="text-2xl font-bold text-blue-600" id="totalStudents">0</div>
                            <div class="text-sm text-blue-800">Total Students</div>
                        </div>
                        <div class="bg-green-50 rounded-lg p-4 text-center">
                            <div class="text-2xl font-bold text-green-600" id="activeStudents">0</div>
                            <div class="text-sm text-green-800">Active Students</div>
                        </div>
                        <div class="bg-purple-50 rounded-lg p-4 text-center">
                            <div class="text-2xl font-bold text-purple-600" id="thisMonthEnrollments">0</div>
                            <div class="text-sm text-purple-800">This Month</div>
                        </div>
                    </div>

                    <!-- Quick Actions -->
                    <div class="bg-gray-50 rounded-lg p-6 text-center">
                        <i class="fas fa-user-graduate text-4xl text-gray-400 mb-4"></i>
                        <h3 class="text-lg font-semibold text-gray-800 mb-2">Enroll New Student</h3>
                        <p class="text-gray-600 mb-4">Start the enrollment process for a new student and parent</p>
                        <button onclick="window.enrollmentSystem.open()" class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition duration-200">
                            Start Enrollment Process
                        </button>
                    </div>

                    <!-- Recent Enrollments -->
                    <div class="mt-8">
                        <h3 class="text-lg font-semibold text-gray-800 mb-4">Recent Enrollments</h3>
                        <div id="recentEnrollmentsList" class="space-y-3">
                            <!-- Will be populated by JavaScript -->
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // Load enrollment stats
    async loadEnrollmentStats() {
        try {
            if (!window.EducareTrack) {
                console.error('EducareTrack not available');
                return;
            }

            const stats = await EducareTrack.getSystemStats();
            document.getElementById('totalStudents').textContent = stats.totalStudents;
            document.getElementById('activeStudents').textContent = stats.totalStudents;
            document.getElementById('thisMonthEnrollments').textContent = stats.recentEnrollments?.length || 0;
            
            // Load recent enrollments
            const recentList = document.getElementById('recentEnrollmentsList');
            if (stats.recentEnrollments && stats.recentEnrollments.length > 0) {
                recentList.innerHTML = stats.recentEnrollments.map(student => `
                    <div class="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg">
                        <div class="flex items-center">
                            <div class="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                                <i class="fas fa-user text-blue-600"></i>
                            </div>
                            <div>
                                <div class="font-medium text-gray-800">${student.name}</div>
                                <div class="text-sm text-gray-500">${student.grade} • ${student.level}</div>
                            </div>
                        </div>
                        <div class="text-sm text-gray-500">
                            ${EducareTrack.formatDate(student.createdAt?.toDate())}
                        </div>
                    </div>
                `).join('');
            } else {
                recentList.innerHTML = '<p class="text-gray-500 text-center py-4">No recent enrollments</p>';
            }
        } catch (error) {
            console.error('Error loading enrollment stats:', error);
        }
    }
}

// Initialize enrollment system when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    window.enrollmentSystem = new EnrollmentSystem();
    window.enrollmentSystem.init();
});

// Make EnrollmentSystem available globally
window.EnrollmentSystem = EnrollmentSystem;
