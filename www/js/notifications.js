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
      'email': $('#email').val(),
      'slack': $('#slackchannel').val()
    }),
    success: function (res) {
      console.log(res);
      res.forEach(function(event){
        $.notify("Hook created: " + event, "success");
      });
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
      // clear
      $('.list-group.checked-list-box').each(function () {
        $(this).find('li').each(function () {
            $(this).removeClass('list-group-item-primary').removeClass('active');
            $(this).find('span').removeClass('glyphicon-check').addClass(' glyphicon-unchecked')
        });
      });
      $('#phone').val('');
      $('#email').val('');
      $('#slackchannel').val('');
      $('#createNotifications').html('Create notification');

      if (!hook) return;

      $('.list-group.checked-list-box').each(function () {
        $(this).find('li').each(function () {
          if (hook.events.includes(this.id)) {
            $(this).addClass(' list-group-item-primary active');
            $(this).find('span').removeClass(' glyphicon-unchecked').addClass(' glyphicon-check')
          }
        });
      });
      if (hook.sms) $('#phone').intlTelInput("setNumber",hook.sms);
      if (hook.email) $('#email').val(hook.email);
      if (hook.slack) $('#slackchannel').val(hook.slack);
      $('#createNotifications').html('Update notification');
    },
    error: function (res) {

    }
  });
}