
/**
 * ID Card Management Module
 * Handles student search, filtering, ID card preview, and export operations.
 */
class IDManagement {
    constructor() {
        // State management
        this.state = {
            allStudents: [],
            filteredStudents: [],
            classes: [],
            selectedStudent: null,
            currentUser: null,
            filters: {
                search: '',
                classId: '',
                status: ''
            }
        };

        // DOM Elements Cache
        this.elements = {};

        // Configuration
        this.config = {
            searchDebounceMs: 300,
            cardScaleRatio: 1
        };

        this.init();
    }

    /**
     * Initialize the application
     */
    async init() {
        try {
            // Cache DOM elements first
            this.cacheDOM();

            // Check authentication
            if (!this.checkAuth()) return;

            // Initialize UI
            this.updateSidebarUserInfo();
            this.updateCurrentTime();
            this.startClock();
            this.bindEvents();

            // Load initial data
            await this.loadClasses();
            await this.loadStudents();
            
            this.populateClassFilters();
            
            // Initial responsiveness check
            this.handleResize();
            
        } catch (error) {
            console.error('Error initializing ID management:', error);
            this.showToast('Failed to initialize application', 'error');
        }
    }

    /**
     * Cache DOM elements to avoid repeated queries
     */
    cacheDOM() {
        this.elements = {
            // Layout
            sidebar: document.querySelector('.sidebar'),
            sidebarToggle: document.getElementById('sidebarToggle'),
            currentTime: document.getElementById('currentTime'),
            
            // User Info
            userName: document.getElementById('userName'),
            userRole: document.getElementById('userRole'),
            userInitials: document.getElementById('userInitials'),
            logoutBtn: document.getElementById('logoutBtn'),

            // Search & Filter
            searchInput: document.getElementById('searchStudents'),
            classFilter: document.getElementById('classFilter'),
            statusFilter: document.getElementById('statusFilter'),
            
            // Student List
            studentListContainer: document.getElementById('studentListContainer'),
            studentCount: document.getElementById('studentCount'),

            // Preview Area
            previewPlaceholder: document.getElementById('previewPlaceholder'),
            idCardPreviewArea: document.getElementById('idCardPreviewArea'),
            cardContainerWrapper: document.getElementById('cardContainerWrapper'),
            scalableCardContainer: document.getElementById('scalableCardContainer'),
            idCardFront: document.getElementById('idCardFront'),
            idCardBack: document.getElementById('idCardBack'),

            // Actions
            btnPrint: document.getElementById('btnPrint'),
            btnReissue: document.getElementById('btnReissue'),
            btnPng: document.getElementById('btnPng'),
            btnPdf: document.getElementById('btnPdf'),
            printContainer: document.getElementById('printContainer'),
            
            // Toast
            toastContainer: document.getElementById('toastContainer')
        };
    }

    /**
     * Bind event listeners to DOM elements
     */
    bindEvents() {
        // Sidebar
        if (this.elements.sidebarToggle) {
            this.elements.sidebarToggle.addEventListener('click', () => {
                this.elements.sidebar.classList.toggle('-translate-x-full');
            });
        }

        // Logout
        this.elements.logoutBtn.addEventListener('click', () => this.handleLogout());

        // Search (Debounced)
        this.elements.searchInput.addEventListener('input', this.debounce((e) => {
            this.state.filters.search = e.target.value.toLowerCase();
            this.filterStudents();
        }, this.config.searchDebounceMs));

        // Filters
        this.elements.classFilter.addEventListener('change', (e) => {
            this.state.filters.classId = e.target.value;
            this.filterStudents();
        });

        this.elements.statusFilter.addEventListener('change', (e) => {
            this.state.filters.status = e.target.value;
            this.filterStudents();
        });

        // Actions
        this.elements.btnPrint.addEventListener('click', () => this.printID());
        this.elements.btnReissue.addEventListener('click', () => this.reissueID());
        this.elements.btnPng.addEventListener('click', () => this.saveAsPNG());
        this.elements.btnPdf.addEventListener('click', () => this.saveAsPDF());

        // Window Resize
        window.addEventListener('resize', this.debounce(() => this.handleResize(), 100));
    }

    /**
     * Check user authentication and role
     */
    checkAuth() {
        // Wait for global EducareTrack if needed (though init calls this)
        // Here assuming we check localStorage directly for speed
        const savedUser = localStorage.getItem('educareTrack_user');
        if (!savedUser) {
            window.location.href = '../index.html';
            return false;
        }
        
        this.state.currentUser = JSON.parse(savedUser);
        if (this.state.currentUser.role !== 'admin') {
            window.location.href = `../${this.state.currentUser.role}/${this.state.currentUser.role}-dashboard.html`;
            return false;
        }
        return true;
    }

    /**
     * Update user info in sidebar
     */
    updateSidebarUserInfo() {
        if (!this.state.currentUser) return;
        
        this.elements.userName.textContent = this.state.currentUser.name;
        this.elements.userRole.textContent = this.state.currentUser.role;
        this.elements.userInitials.textContent = this.state.currentUser.name
            .split(' ')
            .map(n => n[0])
            .join('')
            .substring(0, 2)
            .toUpperCase();
    }

    /**
     * Start the clock
     */
    startClock() {
        this.updateCurrentTime();
        setInterval(() => this.updateCurrentTime(), 60000);
    }

    updateCurrentTime() {
        if (this.elements.currentTime) {
            this.elements.currentTime.textContent = new Date().toLocaleString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
    }

    /**
     * Handle logout
     */
    async handleLogout() {
        if (confirm('Are you sure you want to logout?')) {
            localStorage.removeItem('educareTrack_user');
            window.location.href = '../index.html';
        }
    }

    /**
     * Load classes from API
     */
    async loadClasses() {
        try {
            // Wait for EducareTrack global to be available if needed
            if (window.EducareTrack && window.EducareTrack.getClasses) {
                this.state.classes = await window.EducareTrack.getClasses();
            } else {
                // Fallback or retry logic could go here
                console.warn('EducareTrack API not found, retrying...');
                setTimeout(() => this.loadClasses(), 500);
            }
        } catch (error) {
            console.error('Error loading classes:', error);
            this.showToast('Error loading classes', 'error');
            this.state.classes = [];
        }
    }

    /**
     * Populate class filter dropdown
     */
    populateClassFilters() {
        if (!this.elements.classFilter) return;
        
        // Keep the first option ("All Classes")
        this.elements.classFilter.innerHTML = '<option value="">All Classes</option>';
        
        this.state.classes.forEach(cls => {
            const displayName = cls.name || cls.grade || cls.id;
            const option = document.createElement('option');
            option.value = cls.id;
            option.textContent = displayName;
            this.elements.classFilter.appendChild(option);
        });
    }

    /**
     * Load students from API
     */
    async loadStudents() {
        try {
            this.setListLoading(true);
            
            if (window.EducareTrack && window.EducareTrack.getStudents) {
                const students = await window.EducareTrack.getStudents(true);
                this.state.allStudents = students.map(student => ({
                    ...student,
                    // Pre-process fields if necessary
                    searchString: `${student.full_name || ''} ${student.lrn || ''} ${student.id || ''}`.toLowerCase()
                }));
                this.state.filteredStudents = [...this.state.allStudents];
                this.renderStudentList();
            } else {
                setTimeout(() => this.loadStudents(), 500);
            }
        } catch (error) {
            console.error('Error loading students:', error);
            this.showToast('Error loading students', 'error');
        } finally {
            this.setListLoading(false);
        }
    }

    /**
     * Set loading state for student list
     */
    setListLoading(isLoading) {
        if (isLoading) {
            this.elements.studentListContainer.innerHTML = `
                <div class="flex flex-col items-center justify-center h-full text-gray-400">
                    <i class="fas fa-spinner fa-spin text-2xl mb-2"></i>
                    <p class="text-sm">Loading students...</p>
                </div>`;
        }
    }

    /**
     * Filter students based on state filters
     */
    filterStudents() {
        const { search, classId, status } = this.state.filters;

        this.state.filteredStudents = this.state.allStudents.filter(student => {
            const matchesSearch = !search || student.searchString.includes(search);
            const matchesClass = !classId || (student.class_id || student.classId) === classId;
            const matchesStatus = !status || student.current_status === status;
            
            return matchesSearch && matchesClass && matchesStatus;
        });
        
        this.renderStudentList();
    }

    /**
     * Render the student list
     */
    renderStudentList() {
        const { filteredStudents, selectedStudent } = this.state;
        const container = this.elements.studentListContainer;
        
        // Update count
        this.elements.studentCount.textContent = filteredStudents.length;

        if (filteredStudents.length === 0) {
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center h-64 text-gray-500">
                    <i class="fas fa-search text-3xl mb-3 opacity-30"></i>
                    <p>No students found</p>
                </div>`;
            return;
        }

        // Use DocumentFragment for better performance
        const fragment = document.createDocumentFragment();

        filteredStudents.forEach(student => {
            const isSelected = selectedStudent && selectedStudent.id === student.id;
            const item = document.createElement('div');
            
            // Tailwind classes
            const baseClasses = "flex items-center p-3 rounded-lg cursor-pointer transition-all duration-200 border group";
            const stateClasses = isSelected 
                ? "bg-blue-50 border-blue-200 shadow-sm ring-1 ring-blue-200" 
                : "bg-white border-transparent hover:bg-gray-50 hover:border-gray-200";
            
            item.className = `${baseClasses} ${stateClasses}`;
            item.setAttribute('role', 'button');
            item.setAttribute('tabindex', '0');
            item.setAttribute('aria-pressed', isSelected);
            
            // Inner HTML
            item.innerHTML = `
                <div class="h-10 w-10 rounded-full bg-gray-200 flex-shrink-0 overflow-hidden mr-3 border border-gray-100">
                    ${student.photo_url 
                        ? `<img src="${student.photo_url}" class="h-full w-full object-cover" alt="${student.full_name}">` 
                        : '<div class="h-full w-full flex items-center justify-center text-gray-400"><i class="fas fa-user"></i></div>'}
                </div>
                <div class="flex-1 min-w-0">
                    <div class="text-sm font-semibold text-gray-900 truncate group-hover:text-blue-700 transition-colors">${student.full_name || 'Unknown'}</div>
                    <div class="text-xs text-gray-500 truncate flex items-center gap-1">
                        <span class="font-mono">${student.id}</span>
                        ${student.lrn ? `<span class="text-gray-300">•</span> <span>${student.lrn}</span>` : ''}
                    </div>
                </div>
                <div class="ml-2">
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide ${this.getStatusColor(student.current_status)}">
                        ${this.getStatusText(student.current_status)}
                    </span>
                </div>
            `;

            // Event Listener
            item.addEventListener('click', () => this.selectStudent(student.id));
            item.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.selectStudent(student.id);
                }
            });

            fragment.appendChild(item);
        });

        container.innerHTML = '';
        container.appendChild(fragment);
    }

    /**
     * Get color class for status
     */
    getStatusColor(status) {
        const colors = {
            'in_school': 'bg-green-100 text-green-800 border border-green-200',
            'out_school': 'bg-gray-100 text-gray-800 border border-gray-200',
            'in_clinic': 'bg-yellow-100 text-yellow-800 border border-yellow-200',
            'present': 'bg-green-100 text-green-800 border border-green-200',
            'absent': 'bg-red-100 text-red-800 border border-red-200',
            'late': 'bg-orange-100 text-orange-800 border border-orange-200'
        };
        return colors[status] || 'bg-gray-100 text-gray-800 border border-gray-200';
    }

    /**
     * Get text for status
     */
    getStatusText(status) {
        if (!status) return 'Not Set';
        const texts = {
            'in_school': 'In School',
            'out_school': 'Out of School',
            'in_clinic': 'In Clinic',
            'present': 'Present',
            'absent': 'Absent',
            'late': 'Late'
        };
        return texts[status] || status;
    }

    /**
     * Handle student selection
     */
    async selectStudent(studentId) {
        try {
            const student = this.state.allStudents.find(s => s.id === studentId);
            if (!student) return;

            this.state.selectedStudent = student;

            // Re-render list to show active state
            this.renderStudentList();

            // Switch view
            this.elements.previewPlaceholder.classList.add('hidden');
            this.elements.idCardPreviewArea.classList.remove('hidden');
            this.elements.idCardPreviewArea.classList.add('flex');

            // Render Card
            await this.renderIDCard(student);
            
            // Adjust scale after rendering
            requestAnimationFrame(() => this.handleResize());

        } catch (error) {
            console.error('Error selecting student:', error);
            this.showToast('Error selecting student', 'error');
        }
    }

    /**
     * Render the ID card content
     */
    async renderIDCard(student) {
        const { idCardFront, idCardBack } = this.elements;
        
        const cls = this.state.classes.find(c => c.id === (student.class_id || student.classId));
        const className = cls?.name || cls?.grade || 'No Class';
        
        // Fetch parent info (with error handling and default)
        let parentName = 'N/A';
        let parentPhone = 'N/A';
        
        try {
            if (window.supabaseClient) {
                const { data: parentLink } = await window.supabaseClient
                    .from('parent_students')
                    .select('parent_id')
                    .eq('student_id', student.id)
                    .single();
                
                if (parentLink) {
                    const { data: parent } = await window.supabaseClient
                        .from('profiles')
                        .select('full_name, phone')
                        .eq('id', parentLink.parent_id)
                        .single();
                    if (parent) {
                        parentName = parent.full_name || 'N/A';
                        parentPhone = parent.phone || 'N/A';
                    }
                }
            }
        } catch (e) {
            console.warn("Could not fetch parent info", e);
        }

        // Generate QR Code
        const qr = qrcode(0, 'H');
        qr.addData(student.id);
        qr.make();
        const qrImg = qr.createImgTag(4);

        // --- Front Card Template ---
        idCardFront.innerHTML = `
            <div class="h-full w-full flex flex-col p-4 relative z-10 font-sans select-none">
                <!-- Background Decoration -->
                <div class="absolute top-0 left-0 w-full h-24 bg-gradient-to-br from-blue-700 to-blue-900 -z-10" style="border-bottom-left-radius: 50% 20px; border-bottom-right-radius: 50% 20px;"></div>
                <div class="absolute top-2 right-2 opacity-10 text-white">
                    <i class="fas fa-university text-4xl"></i>
                </div>

                <!-- School Header -->
                <div class="text-center text-white mb-4 mt-1">
                    <h2 class="text-[0.8rem] font-bold uppercase tracking-wider leading-tight text-shadow-sm">Educare Colleges Inc</h2>
                    <p class="text-[0.55rem] opacity-90 font-light tracking-wide">Purok 4 Irisan Baguio City</p>
                </div>

                <!-- Photo -->
                <div class="mx-auto w-24 h-24 rounded-full border-[3px] border-white shadow-md overflow-hidden mb-3 bg-gray-100 relative group-hover:scale-105 transition-transform duration-300">
                    ${student.photo_url 
                        ? `<img src="${student.photo_url}" class="w-full h-full object-cover" alt="Student Photo">` 
                        : '<div class="w-full h-full flex items-center justify-center text-gray-300"><i class="fas fa-user text-3xl"></i></div>'}
                </div>

                <!-- Student Info -->
                <div class="text-center flex-grow flex flex-col items-center">
                    <h1 class="text-lg font-bold text-gray-900 leading-tight mb-1 line-clamp-2 w-full px-2">${student.full_name || 'STUDENT NAME'}</h1>
                    
                    <div class="inline-block px-3 py-0.5 bg-blue-50 text-blue-800 rounded-full border border-blue-100 text-[0.65rem] font-bold mb-2 uppercase tracking-wide shadow-sm">
                        ${className}
                    </div>
                    
                    <div class="mt-auto mb-1 w-full px-4">
                         <p class="text-[0.6rem] text-gray-500 leading-tight line-clamp-2">${student.address || 'No Address Provided'}</p>
                    </div>
                </div>
                
                <!-- Footer Stripe -->
                <div class="absolute bottom-0 left-0 w-full h-2.5 bg-yellow-400"></div>
                <div class="absolute bottom-2.5 left-0 w-full h-1 bg-yellow-300 opacity-50"></div>
            </div>
        `;

        // --- Back Card Template ---
        idCardBack.innerHTML = `
            <div class="h-full w-full flex flex-col p-5 relative text-center bg-white select-none">
                 <div class="flex-grow flex flex-col items-center justify-center space-y-3">
                    <div class="qr-container bg-white p-1.5 rounded-lg shadow-sm border border-gray-200">
                        ${qrImg.replace('<img', '<img style="width: 110px; height: 110px; display: block;" alt="QR Code"')}
                    </div>
                    <div class="text-[0.65rem] font-mono text-gray-400 tracking-[0.2em] uppercase">${student.id}</div>
                </div>

                <div class="border-t border-gray-100 pt-3 mb-2">
                    <div class="text-[0.6rem] text-gray-400 uppercase tracking-widest mb-1 font-semibold">In case of emergency</div>
                    <p class="font-bold text-gray-800 text-sm leading-tight">${parentName}</p>
                    <p class="text-xs text-gray-600 font-medium">${parentPhone}</p>
                </div>

                <div class="bg-gray-50 rounded-md p-2 border border-gray-100 mt-auto">
                    <p class="text-[0.55rem] text-gray-500 italic leading-tight">
                        This card is non-transferable. If found, please return to Educare Colleges Inc. or call the number above.
                    </p>
                </div>
            </div>
        `;
    }

    /**
     * Handle responsive scaling of the ID card
     */
    handleResize() {
        const wrapper = this.elements.cardContainerWrapper;
        const container = this.elements.scalableCardContainer;
        
        if (!wrapper || !container) return;

        // Reset transform to get natural size
        container.style.transform = 'none';
        
        const wrapperRect = wrapper.getBoundingClientRect();
        // ID card is roughly 650px wide when side-by-side (2.125in * 96dpi * scale) + gap
        // Using approximate content width for side-by-side layout
        const contentWidth = 500; // Minimal width for side-by-side readable
        const availableWidth = wrapperRect.width - 40; // padding

        // Calculate scale
        let scale = 1;
        if (availableWidth < contentWidth) {
            scale = availableWidth / contentWidth;
        }

        // Apply scale if needed (mostly for mobile)
        if (scale < 1) {
            // Check if we are in stacked mode (mobile)
            // If stacked, we scale based on single card width
            if (window.innerWidth < 1280) { // xl breakpoint
                 // Single card width approx 220px
                 const singleCardWidth = 220; 
                 scale = Math.min(1, (availableWidth / singleCardWidth));
            }
            container.style.transform = `scale(${scale})`;
        }
    }

    /**
     * Reissue ID Functionality
     */
    async reissueID() {
        const { selectedStudent } = this.state;
        if (!selectedStudent) {
            this.showToast('Please select a student first', 'warning');
            return;
        }

        if (!confirm(`Are you sure you want to generate a new ID for ${selectedStudent.full_name}? The old ID will be invalid.`)) return;

        try {
            this.showToast('Generating new ID...', 'info');
            
            const year = new Date().getFullYear();
            let newId;
            let isUnique = false;
            
            // Collision check
            while (!isUnique) {
                const random = Math.floor(1000 + Math.random() * 9000);
                newId = `${year}-${random}`;
                const exists = this.state.allStudents.some(s => s.id === newId);
                if (!exists) isUnique = true;
            }

            const { error } = await window.supabaseClient
                .from('students')
                .update({ id: newId, updated_at: new Date() })
                .eq('id', selectedStudent.id);

            if (error) throw error;

            this.showToast(`New ID generated: ${newId}`, 'success');
            
            // Reload
            await this.loadStudents();
            await this.selectStudent(newId);

        } catch (error) {
            console.error('Error reissuing ID:', error);
            this.showToast('Error reissuing ID: ' + error.message, 'error');
        }
    }

    /**
     * Print ID Card
     */
    async printID() {
        if (!this.state.selectedStudent) return;
        
        const { printContainer, idCardFront, idCardBack } = this.elements;
        printContainer.innerHTML = '';

        try {
            this.showToast('Preparing for print...', 'info');

            const front = idCardFront.cloneNode(true);
            const back = idCardBack.cloneNode(true);

            // Wait for images
            const images = [...front.getElementsByTagName('img'), ...back.getElementsByTagName('img')];
            await Promise.all(images.map(img => {
                if (img.complete) return Promise.resolve();
                return new Promise(resolve => { img.onload = resolve; img.onerror = resolve; });
            }));

            printContainer.appendChild(front);
            printContainer.appendChild(back);

            window.print();
            
            setTimeout(() => {
                printContainer.innerHTML = '';
            }, 1000);
        } catch (error) {
            console.error('Print error:', error);
            this.showToast('Failed to print ID card', 'error');
        }
    }

    /**
     * Save as PNG
     */
    saveAsPNG() {
        if (!this.state.selectedStudent) return;
        this.showToast('Generating PNG...', 'info');
        
        const front = this.elements.idCardFront;
        const back = this.elements.idCardBack;
        
        html2canvas(front, { scale: 3, useCORS: true }).then(canvas => {
            this.downloadImage(canvas.toDataURL(), `${this.state.selectedStudent.full_name}_Front.png`);
        });

        setTimeout(() => {
            html2canvas(back, { scale: 3, useCORS: true }).then(canvas => {
                this.downloadImage(canvas.toDataURL(), `${this.state.selectedStudent.full_name}_Back.png`);
                this.showToast('PNGs downloaded successfully', 'success');
            });
        }, 500);
    }

    downloadImage(dataUrl, filename) {
        const link = document.createElement('a');
        link.download = filename;
        link.href = dataUrl;
        link.click();
    }

    /**
     * Save as PDF
     */
    saveAsPDF() {
        if (!this.state.selectedStudent) return;
        this.showToast('Generating PDF...', 'info');
        
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'in',
            format: [8.5, 11]
        });

        const front = this.elements.idCardFront;
        const back = this.elements.idCardBack;

        Promise.all([
            html2canvas(front, { scale: 4, useCORS: true }),
            html2canvas(back, { scale: 4, useCORS: true })
        ]).then(([canvasFront, canvasBack]) => {
            const imgFront = canvasFront.toDataURL('image/png');
            const imgBack = canvasBack.toDataURL('image/png');

            doc.addImage(imgFront, 'PNG', 1, 1, 2.125, 3.375);
            doc.text("Front", 1, 0.9);

            doc.addImage(imgBack, 'PNG', 3.5, 1, 2.125, 3.375);
            doc.text("Back", 3.5, 0.9);

            doc.save(`${this.state.selectedStudent.full_name}_ID_Card.pdf`);
            this.showToast('PDF downloaded successfully', 'success');
        }).catch(err => {
            console.error(err);
            this.showToast('Error generating PDF', 'error');
        });
    }

    /**
     * Debounce utility
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func.apply(this, args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    /**
     * Show Toast Notification
     */
    showToast(message, type = 'info') {
        const container = this.elements.toastContainer;
        if (!container) return;

        const toast = document.createElement('div');
        
        // Colors
        const typeClasses = {
            success: 'bg-green-600 text-white',
            error: 'bg-red-600 text-white',
            warning: 'bg-yellow-500 text-white',
            info: 'bg-blue-600 text-white'
        };

        const iconClasses = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };

        toast.className = `${typeClasses[type] || typeClasses.info} px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 transform transition-all duration-300 translate-y-2 opacity-0 min-w-[300px] pointer-events-auto`;
        
        toast.innerHTML = `
            <i class="fas ${iconClasses[type] || iconClasses.info}"></i>
            <span class="font-medium text-sm">${message}</span>
            <button class="ml-auto hover:opacity-80"><i class="fas fa-times"></i></button>
        `;

        container.appendChild(toast);

        // Animate in
        requestAnimationFrame(() => {
            toast.classList.remove('translate-y-2', 'opacity-0');
        });

        // Close button
        toast.querySelector('button').addEventListener('click', () => {
            removeToast();
        });

        // Auto remove
        const timeout = setTimeout(() => {
            removeToast();
        }, 4000);

        function removeToast() {
            clearTimeout(timeout);
            toast.classList.add('opacity-0', 'translate-x-full');
            setTimeout(() => {
                if (toast.parentNode === container) {
                    container.removeChild(toast);
                }
            }, 300);
        }
    }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    window.idManagement = new IDManagement();
});
