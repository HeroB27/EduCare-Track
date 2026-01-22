;(function(){
  var getRole=function(){
    var c=window.EducareTrack&&window.EducareTrack.currentUserRole;
    if(!c&&window.EducareTrack&&window.EducareTrack.currentUser){c=window.EducareTrack.currentUser.role;}
    return c||'';
  };
  var go=function(url){ try{ window.location.href=url; }catch(_){} };
  window.addEventListener('educareTrack:navigateToStudent',function(e){
    var id=e&&e.detail&&e.detail.studentId; if(!id) return;
    var role=getRole();
    if(role==='parent') { go('parent/parent-attendance.html?child='+id); return; }
    if(role==='admin') { go('admin/attendance.html?studentId='+id); return; }
  });
  window.addEventListener('educareTrack:navigateToClinic',function(e){
    var id=e&&e.detail&&e.detail.studentId; if(!id) return;
    var role=getRole();
    if(role==='parent') { go('parent/parent-clinic.html?child='+id); return; }
    if(role==='admin') { go('admin/admin-records.html?section=clinic&studentId='+id); return; }
  });
  window.addEventListener('educareTrack:navigateToAnnouncements',function(){
    var role=getRole();
    if(role==='parent') { go('parent/parent-notifications.html'); return; }
    if(role==='admin') { go('admin/announcements.html'); return; }
  });
  window.addEventListener('educareTrack:navigateToExcuses',function(){
    var role=getRole();
    if(role==='parent') { go('parent/parent-excuse.html'); return; }
    if(role==='admin') { go('admin/admin-records.html?section=excuses'); return; }
  });
})();
