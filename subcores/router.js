;(function(){
  var getRole=function(){
    var c=window.EducareTrack&&window.EducareTrack.currentUserRole;
    if(!c&&window.EducareTrack&&window.EducareTrack.currentUser){c=window.EducareTrack.currentUser.role;}
    return c||'';
  };
  var resolveUrl = function(target) {
    var loc = window.location.pathname;
    var isInSub = loc.includes('/parent/') || loc.includes('/teacher/') || loc.includes('/admin/') || loc.includes('/clinic/') || loc.includes('/guard/');
    
    // Target is like 'parent/page.html'
    if (isInSub) {
        if (target.startsWith('parent/') && loc.includes('/parent/')) return target.replace('parent/', '');
        if (target.startsWith('teacher/') && loc.includes('/teacher/')) return target.replace('teacher/', '');
        if (target.startsWith('admin/') && loc.includes('/admin/')) return target.replace('admin/', '');
        if (target.startsWith('clinic/') && loc.includes('/clinic/')) return target.replace('clinic/', '');
        
        // Cross directory or to root?
        return '../' + target;
    }
    return target;
  };
  var go=function(url){ try{ window.location.href=resolveUrl(url); }catch(_){} };
  
  window.addEventListener('educareTrack:navigateToStudent',function(e){
    var id=e&&e.detail&&e.detail.studentId; if(!id) return;
    var role=getRole();
    if(role==='parent') { go('parent/parent-attendance.html?child='+id); return; }
    if(role==='admin') { go('admin/attendance.html?studentId='+id); return; }
    if(role==='teacher') { go('teacher/teacher-students.html?studentId='+id); return; }
  });
  window.addEventListener('educareTrack:navigateToClinic',function(e){
    var id=e&&e.detail&&e.detail.studentId; if(!id) return;
    var vid=e&&e.detail&&e.detail.visitId;
    var params = '?child='+id + (vid ? '&visitId='+vid : '');
    var teacherParams = '?studentId='+id + (vid ? '&visitId='+vid : '');
    var role=getRole();
    if(role==='parent') { go('parent/parent-clinic.html'+params); return; }
    if(role==='admin') { go('admin/admin-records.html?section=clinic&studentId='+id+(vid ? '&visitId='+vid : '')); return; }
    if(role==='teacher') { go('teacher/teacher-clinic.html'+teacherParams); return; }
  });
  window.addEventListener('educareTrack:navigateToAnnouncements',function(e){
    var aid=e&&e.detail&&e.detail.announcementId;
    var role=getRole();
    if(role==='parent') { go('parent/parent-notifications.html'); return; }
    if(role==='admin') { go('admin/announcements.html'); return; }
    if(role==='teacher') { go('teacher/teacher-announcements.html'); return; }
  });
  window.addEventListener('educareTrack:navigateToExcuses',function(e){
    var eid=e&&e.detail&&e.detail.excuseId;
    var params = eid ? '?excuseId='+eid : '';
    var role=getRole();
    if(role==='parent') { go('parent/parent-excuse.html'+params); return; }
    if(role==='admin') { go('admin/admin-records.html?section=excuses'+(eid ? '&excuseId='+eid : '')); return; }
    if(role==='teacher') { go('teacher/teacher-excuses.html'+params); return; }
  });
})();