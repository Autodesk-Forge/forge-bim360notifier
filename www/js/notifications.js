function createNotifications() {
  var events = [];
  $('.list-group.checked-list-box').each(function () {
    $(this).find('li.active').each(function () {
      events.push(this.id);
    })
  });

  var autodeskTree = $('#autodeskTree').jstree(true);
  var autodeskNode = autodeskTree.get_selected(true)[0];

  if (!autodeskNode || autodeskNode.type != 'folders') {
    $("#createNotifications").notify({
        title: "Please select a Folder"
      },
      {position: "bottom", className: 'error'}
    );
    return;
  }

  $.ajax({
    url: '/api/forge/hook',
    contentType: 'application/json',
    type: 'POST',
    //dataType: 'json', comment this to avoid parsing the response which would result in an error
    data: JSON.stringify({
      'events': events.join(','),
      'folderId': autodeskNode.id,
      'sms': $('#phone').val(),
      'email': $('#email').val()
    }),
    success: function (res) {

    },
    error: function (res) {

    }
  });
}

function showEvents(folderId) {
  var params = folderId.split('/');
  if (params.length > 0)
    folderId = params[params.length - 1];

  $.ajax({
    url: '/api/forge/hook/' + folderId,
    contentType: 'application/json',
    type: 'GET',
    success: function (hook) {
      if (!hook) return;

      $('.list-group.checked-list-box').each(function () {
        $(this).find('li').each(function () {
          if (hook.events.contains(this.id))
            this.addClass('.active');
        });
      });
      $('#phone').val(hook.sms);
      $('#email').val(hook.email);
    },
    error: function (res) {

    }
  });
}