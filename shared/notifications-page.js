document.addEventListener('DOMContentLoaded', async function() {
  const listEl = document.getElementById('notificationsList');
  const summaryEl = document.getElementById('notifSummary');
  const filterAll = document.getElementById('filterAll');
  const filterUnread = document.getElementById('filterUnread');
  const filterUrgent = document.getElementById('filterUrgent');
  const markAllRead = document.getElementById('markAllReadPage');

  let currentFilter = 'all';

  const load = async () => {
    try {
      if (!window.EducareTrack || !EducareTrack.currentUser) return;
      let items = await EducareTrack.getNotificationsForUser(EducareTrack.currentUser.id, false, 200);
      if (currentFilter === 'unread') {
        items = items.filter(n => !n.readBy || !n.readBy.includes(EducareTrack.currentUser.id));
      } else if (currentFilter === 'urgent') {
        items = items.filter(n => n.isUrgent);
      }
      listEl.innerHTML = '';
      items.forEach(n => {
        const unread = !n.readBy || !n.readBy.includes(EducareTrack.currentUser.id);
        const wrapper = document.createElement('div');
        wrapper.className = `px-4 py-3 ${unread ? 'bg-gray-50' : 'bg-white'}`;
        const t = n.title || 'Notification';
        const m = n.message || '';
        const dt = `${n.formattedDate || ''} ${n.formattedTime || ''}`.trim();
        wrapper.innerHTML = `
          <div class="flex items-start justify-between">
            <div>
              <div class="text-sm font-medium text-gray-800">${t}</div>
              <div class="text-xs text-gray-600">${m}</div>
              <div class="text-[10px] text-gray-400 mt-1">${dt}</div>
            </div>
            <div class="flex items-center space-x-2">
              <button data-id="${n.id}" class="text-xs text-blue-600 mark-read-btn">Mark read</button>
            </div>
          </div>
        `;
        listEl.appendChild(wrapper);
      });
      const unreadCount = items.filter(n => !n.readBy || !n.readBy.includes(EducareTrack.currentUser.id)).length;
      summaryEl.textContent = `${items.length} items, ${unreadCount} unread`;
    } catch (_) {}
  };

  filterAll.addEventListener('click', () => {
    currentFilter = 'all';
    filterAll.classList.add('bg-gray-100');
    filterUnread.classList.remove('bg-gray-100');
    filterUrgent.classList.remove('bg-gray-100');
    load();
  });
  filterUnread.addEventListener('click', () => {
    currentFilter = 'unread';
    filterUnread.classList.add('bg-gray-100');
    filterAll.classList.remove('bg-gray-100');
    filterUrgent.classList.remove('bg-gray-100');
    load();
  });
  filterUrgent.addEventListener('click', () => {
    currentFilter = 'urgent';
    filterUrgent.classList.add('bg-gray-100');
    filterAll.classList.remove('bg-gray-100');
    filterUnread.classList.remove('bg-gray-100');
    load();
  });
  markAllRead.addEventListener('click', async () => {
    try { await EducareTrack.markAllNotificationsAsRead(); await load(); } catch (_) {}
  });

  listEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('.mark-read-btn');
    if (btn) {
      const id = btn.getAttribute('data-id');
      try { await EducareTrack.markNotificationAsRead(id); await load(); } catch (_) {}
    }
  });

  await load();
});
