class ParentChildren {
    constructor() {
        this.currentUser = null;
        this.children = [];
        this.currentTab = 'overview';
        this.init();
    }

    async init() {
        try {
            this.showLoading();
            
            // Wait for EducareTrack to be ready
            if (!window.EducareTrack) {
                setTimeout(() => this.init(), 100);
                return;
            }

            // Check if user is logged in
            const savedUser = localStorage.getItem('educareTrack_user');
            if (!savedUser) {
                window.location.href = '../index.html';
                return;
            }

            this.currentUser = JSON.parse(savedUser);
            
            // Verify user is a parent
            if (this.currentUser.role !== 'parent') {
                if (window.EducareTrack && typeof window.EducareTrack.showNormalNotification === 'function') {
                    window.EducareTrack.showNormalNotification({ title: 'Access Denied', message: 'Parent role required.', type: 'error' });
                }
                window.location.href = '../index.html';
                return;
            }

            this.updateUI();
            await this.loadChildrenData();
            this.initEventListeners();
            this.initTabs();
            
            this.hideLoading();
        } catch (error) {
            console.error('Parent children initialization failed:', error);
            this.hideLoading();
        }
    }

    updateUI() {
        document.getElementById('userName').textContent = this.currentUser.name;
        document.getElementById('userRole').textContent = this.currentUser.role;
        document.getElementById('userInitials').textContent = this.currentUser.name
            .split(' ')
            .map(n => n[0])
            .join('')
            .substring(0, 2)
            .toUpperCase();

        this.updateCurrentTime();
        setInterval(() => this.updateCurrentTime(), 60000);
    }

    updateCurrentTime() {
        const now = new Date();
        document.getElementById('currentTime').textContent = now.toLocaleString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    async loadChildrenData() {
        try {
            this.children = await EducareTrack.getStudentsByParent(this.currentUser.id);
            this.updateOverviewTab();
            this.updateDetailsTab();
            this.updateAcademicTab();
            
            // Load notification count
            await this.loadNotificationCount();

        } catch (error) {
            console.error('Error loading children data:', error);
        }
    }

    updateOverviewTab() {
        const container = document.getElementById('overviewContent');
        if (!container) return;
        
        if (this.children.length === 0) {
            container.innerHTML = `
                <div class="col-span-full text-center py-12 bg-white rounded-lg shadow-md">
                    <i class="fas fa-user-graduate text-5xl text-gray-300 mb-4"></i>
                    <h3 class="text-xl font-medium text-gray-600 mb-2">No Children Registered</h3>
                    <p class="text-gray-500 mb-4">Contact school administration to register your children.</p>
                    <button class="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors">
                        <i class="fas fa-plus mr-2"></i>Contact School
                    </button>
                </div>
            `;
            return;
        }

        container.innerHTML = '';
        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6';

        this.children.forEach(child => {
            const card = document.createElement('div');
            card.className = 'bg-white rounded-lg shadow-md overflow-hidden card-hover';
            
            // Determine status color
            let statusColor = 'bg-gray-100 text-gray-800';
            let statusText = 'Unknown';
            if (child.current_status === 'present') {
                statusColor = 'bg-green-100 text-green-800';
                statusText = 'Present';
            } else if (child.current_status === 'absent') {
                statusColor = 'bg-red-100 text-red-800';
                statusText = 'Absent';
            } else if (child.current_status === 'late') {
                statusColor = 'bg-yellow-100 text-yellow-800';
                statusText = 'Late';
            } else if (child.current_status === 'in_clinic') {
                statusColor = 'bg-blue-100 text-blue-800';
                statusText = 'In Clinic';
            } else if (child.current_status === 'excused') {
                statusColor = 'bg-purple-100 text-purple-800';
                statusText = 'Excused';
            }

            // Fallback for missing fields
            const grade = child.grade || child.level || 'N/A';
            const section = child.section || 'N/A';
            const strand = child.strand ? `• ${child.strand}` : '';

            card.innerHTML = `
                <div class="p-6">
                    <div class="flex items-center justify-between mb-4">
                        <div class="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center text-2xl font-bold text-green-600">
                            ${child.photo_url ? `<img src="${child.photo_url}" class="w-full h-full rounded-full object-cover">` : child.full_name.charAt(0)}
                        </div>
                        <span class="px-3 py-1 rounded-full text-xs font-semibold ${statusColor}">
                            ${statusText}
                        </span>
                    </div>
                    
                    <h3 class="text-lg font-bold text-gray-800 mb-1">${child.full_name}</h3>
                    <p class="text-sm text-gray-600 mb-4">${grade} - ${section} ${strand}</p>
                    
                    <div class="space-y-3 border-t border-gray-100 pt-4">
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-500">LRN:</span>
                            <span class="font-medium text-gray-800">${child.lrn || 'N/A'}</span>
                        </div>
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-500">Birth Date:</span>
                            <span class="font-medium text-gray-800">${child.birth_date ? new Date(child.birth_date).toLocaleDateString() : 'N/A'}</span>
                        </div>
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-500">Gender:</span>
                            <span class="font-medium text-gray-800 capitalize">${child.gender || 'N/A'}</span>
                        </div>
                    </div>
                    
                    <div class="mt-6 flex space-x-2">
                        <button onclick="parentChildren.viewDetails('${child.id}')" class="flex-1 bg-green-600 text-white py-2 rounded hover:bg-green-700 transition text-sm">
                            View Details
                        </button>
                        <button onclick="window.location.href='parent-attendance.html?studentId=${child.id}'" class="flex-1 border border-green-600 text-green-600 py-2 rounded hover:bg-green-50 transition text-sm">
                            Attendance
                        </button>
                    </div>
                </div>
            `;
            grid.appendChild(card);
        });

        container.appendChild(grid);
    }

    updateDetailsTab() {
        const tbody = document.getElementById('childrenTableBody');
        if (!tbody) return;

        if (this.children.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-4 text-center text-gray-500">No children found</td></tr>';
            return;
        }

        tbody.innerHTML = this.children.map(child => {
            let statusBadge = `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">Unknown</span>`;
            
            if (child.current_status === 'present') {
                statusBadge = `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Present</span>`;
            } else if (child.current_status === 'absent') {
                statusBadge = `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">Absent</span>`;
            } else if (child.current_status === 'late') {
                statusBadge = `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">Late</span>`;
            } else if (child.current_status === 'in_clinic') {
                statusBadge = `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">In Clinic</span>`;
            }

            return `
                <tr class="hover:bg-gray-50">
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="flex items-center">
                            <div class="flex-shrink-0 h-10 w-10">
                                <div class="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center text-green-600 font-bold">
                                    ${child.photo_url ? `<img src="${child.photo_url}" class="h-10 w-10 rounded-full object-cover">` : child.full_name.charAt(0)}
                                </div>
                            </div>
                            <div class="ml-4">
                                <div class="text-sm font-medium text-gray-900">${child.full_name}</div>
                                <div class="text-sm text-gray-500">${child.lrn || 'No LRN'}</div>
                            </div>
                        </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="text-sm text-gray-900">${child.grade || child.level || 'N/A'}</div>
                        <div class="text-sm text-gray-500">${child.level || ''}</div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="text-sm text-gray-900">${child.section || 'N/A'}</div>
                        <div class="text-sm text-gray-500">${child.strand || ''}</div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        ${statusBadge}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        ${child.lastAttendance ? new Date(child.lastAttendance).toLocaleString() : 'Never'}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button onclick="parentChildren.viewDetails('${child.id}')" class="text-green-600 hover:text-green-900 mr-3">View</button>
                        <button onclick="window.location.href='parent-attendance.html?studentId=${child.id}'" class="text-blue-600 hover:text-blue-900">Attendance</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    updateAcademicTab() {
        const container = document.getElementById('academicContent');
        if (!container) return;

        if (this.children.length === 0) {
            container.innerHTML = '<div class="text-center text-gray-500 py-8">No children data available</div>';
            return;
        }

        container.innerHTML = this.children.map(child => {
            const subjects = EducareTrack.getSubjectsForLevel(child.level, child.strand, child.grade);
            
            return `
                <div class="bg-white rounded-lg shadow-md overflow-hidden mb-6">
                    <div class="p-4 bg-green-50 border-b border-green-100 flex justify-between items-center">
                        <h3 class="font-bold text-gray-800 flex items-center">
                            <i class="fas fa-book-reader text-green-600 mr-2"></i>
                            ${child.full_name}
                        </h3>
                        <span class="text-sm text-gray-600">${child.grade} ${child.strand ? `(${child.strand})` : ''}</span>
                    </div>
                    <div class="p-6">
                        <h4 class="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Current Subjects</h4>
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            ${subjects.length > 0 ? subjects.map(subject => `
                                <div class="flex items-center p-3 bg-gray-50 rounded-lg border border-gray-100">
                                    <div class="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mr-3">
                                        <i class="fas fa-book text-xs"></i>
                                    </div>
                                    <span class="text-gray-700 font-medium text-sm">${subject}</span>
                                </div>
                            `).join('') : '<p class="text-gray-500 italic">No subjects assigned for this level yet.</p>'}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    viewDetails(childId) {
        const child = this.children.find(c => c.id === childId);
        if (!child) return;

        const modal = document.getElementById('childDetailsModal');
        const content = document.getElementById('childDetailsContent');
        
        content.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div class="md:col-span-1 text-center">
                    <div class="w-32 h-32 mx-auto rounded-full bg-green-100 flex items-center justify-center text-4xl font-bold text-green-600 mb-4">
                        ${child.photo_url ? `<img src="${child.photo_url}" class="w-full h-full rounded-full object-cover">` : child.full_name.charAt(0)}
                    </div>
                    <h2 class="text-xl font-bold text-gray-800">${child.full_name}</h2>
                    <p class="text-gray-500">${child.lrn || 'No LRN'}</p>
                    <div class="mt-4">
                        <span class="px-3 py-1 rounded-full text-sm font-semibold bg-green-100 text-green-800 capitalize">
                            ${child.current_status || 'Unknown'}
                        </span>
                    </div>
                </div>
                
                <div class="md:col-span-2 space-y-6">
                    <div>
                        <h3 class="text-lg font-semibold text-gray-800 border-b pb-2 mb-3">Academic Information</h3>
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <p class="text-sm text-gray-500">Level</p>
                                <p class="font-medium">${child.level || 'N/A'}</p>
                            </div>
                            <div>
                                <p class="text-sm text-gray-500">Grade</p>
                                <p class="font-medium">${child.grade || 'N/A'}</p>
                            </div>
                            <div>
                                <p class="text-sm text-gray-500">Section</p>
                                <p class="font-medium">${child.section || 'N/A'}</p>
                            </div>
                            <div>
                                <p class="text-sm text-gray-500">Strand</p>
                                <p class="font-medium">${child.strand || 'N/A'}</p>
                            </div>
                        </div>
                    </div>

                    <div>
                        <h3 class="text-lg font-semibold text-gray-800 border-b pb-2 mb-3">Personal Information</h3>
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <p class="text-sm text-gray-500">Birth Date</p>
                                <p class="font-medium">${child.birth_date ? new Date(child.birth_date).toLocaleDateString() : 'N/A'}</p>
                            </div>
                            <div>
                                <p class="text-sm text-gray-500">Gender</p>
                                <p class="font-medium capitalize">${child.gender || 'N/A'}</p>
                            </div>
                            <div class="col-span-2">
                                <p class="text-sm text-gray-500">Address</p>
                                <p class="font-medium">${child.address || 'N/A'}</p>
                            </div>
                        </div>
                    </div>

                    <div>
                        <h3 class="text-lg font-semibold text-gray-800 border-b pb-2 mb-3">Emergency Contact</h3>
                        <div class="grid grid-cols-1 gap-4">
                            ${child.emergency_contact ? `
                                <div>
                                    <p class="text-sm text-gray-500">Contact Person</p>
                                    <p class="font-medium">${child.emergency_contact.name || 'N/A'}</p>
                                </div>
                                <div>
                                    <p class="text-sm text-gray-500">Phone Number</p>
                                    <p class="font-medium">${child.emergency_contact.phone || 'N/A'}</p>
                                </div>
                            ` : '<p class="text-gray-500 italic">No emergency contact information available.</p>'}
                        </div>
                    </div>
                </div>
            </div>
        `;

        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    closeChildDetailsModal() {
        const modal = document.getElementById('childDetailsModal');
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    async loadNotificationCount() {
        if (!window.EducareTrack || !window.EducareTrack.getUnreadNotificationCount) return;
        const count = await EducareTrack.getUnreadNotificationCount(this.currentUser.id);
        const badge = document.getElementById('notificationBadge');
        if (badge) {
            if (count > 0) {
                badge.textContent = count;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
    }

    initTabs() {
        const tabs = ['overview', 'details', 'academic'];
        tabs.forEach(tab => {
            const btn = document.getElementById(`${tab}Tab`);
            if (btn) {
                btn.addEventListener('click', () => {
                    this.switchTab(tab);
                });
            }
        });
    }

    switchTab(tabId) {
        this.currentTab = tabId;
        
        // Update tab buttons
        ['overview', 'details', 'academic'].forEach(t => {
            const btn = document.getElementById(`${t}Tab`);
            const content = document.getElementById(`${t}Content`);
            
            if (t === tabId) {
                btn.classList.add('tab-active', 'text-green-600');
                btn.classList.remove('text-gray-500', 'hover:text-gray-700');
                content.classList.remove('hidden');
            } else {
                btn.classList.remove('tab-active', 'text-green-600');
                btn.classList.add('text-gray-500', 'hover:text-gray-700');
                content.classList.add('hidden');
            }
        });
    }

    initEventListeners() {
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                localStorage.removeItem('educareTrack_user');
                window.location.href = '../index.html';
            });
        }

        // Mobile sidebar toggle
        const toggleBtn = document.getElementById('sidebarToggle');
        const sidebar = document.querySelector('.sidebar');
        if (toggleBtn && sidebar) {
            toggleBtn.addEventListener('click', () => {
                sidebar.classList.toggle('-translate-x-full');
            });
        }
    }

    showLoading() {
        const spinner = document.getElementById('loadingSpinner');
        if (spinner) spinner.classList.remove('hidden');
    }

    hideLoading() {
        const spinner = document.getElementById('loadingSpinner');
        if (spinner) spinner.classList.add('hidden');
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.parentChildren = new ParentChildren();
});
