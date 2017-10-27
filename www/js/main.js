/////////////////////////////////////////////////////////////////////
// Copyright (c) Autodesk, Inc. All rights reserved
// Written by Forge Partner Development
//
// Permission to use, copy, modify, and distribute this software in
// object code form for any purpose and without fee is hereby granted,
// provided that the above copyright notice appears in all copies and
// that both that copyright notice and the limited warranty and
// restricted rights notice below appear in all supporting
// documentation.
//
// AUTODESK PROVIDES THIS PROGRAM "AS IS" AND WITH ALL FAULTS.
// AUTODESK SPECIFICALLY DISCLAIMS ANY IMPLIED WARRANTY OF
// MERCHANTABILITY OR FITNESS FOR A PARTICULAR USE.  AUTODESK, INC.
// DOES NOT WARRANT THAT THE OPERATION OF THE PROGRAM WILL BE
// UNINTERRUPTED OR ERROR FREE.
/////////////////////////////////////////////////////////////////////

$(document).ready(function () {
  prepareAutodeskSide();
  $("#phone").intlTelInput({
    utilsScript: "/js/libraries/utils.js?10"
  });
});

function prepareAutodeskSide() {
  jQuery.ajax({
    url: '/api/forge/profile',
    success: function (profile) {
      // if profile is OK, then user is logged in
      // start preparing for tree
      var autodeskSide = $('#autodeskSide');
      autodeskSide.empty();
      autodeskSide.css("vertical-align", "top");
      autodeskSide.css('text-align', 'left');
      autodeskSide.append(
        '<h3 class="text-center">1. Select folder:</h3><hr>' +
        '<div class="treeTitle"><img src="" id="autodeskProfilePicture" height="30px" class="profilePicture"> <span id="autodeskProfileName"></span> ' +
        '<span class="glyphicon glyphicon-log-out mlink" title="Sign out" id="autodeskLogoff"> </span>' +
        '<span class="glyphicon glyphicon-refresh refreshIcon mlink" id="refreshAutodeskTree" title="Refresh Autodesk files"/>' +
        '</div>' +
        '<div id="autodeskTree" class="tree"></div>');

      $('#notificationProviders').attr('style','');
      $('#messageSelection').attr('style','');
      $('#autodeskProfileName').text(profile.name);
      $('#autodeskProfilePicture').attr('src', profile.picture);
      $('#autodeskLogoff').click(function () {
        location.href = '/api/app/logoff';
      });

      prepareAutodeskTree('autodeskTree');
      $('#createNotifications').click(function () {
        createNotifications();
      });

    },
    statusCode: {
      401: function () {
        // as profile is not authorized, this user is not authorized
        $('#autodeskSigninButton').click(function () {
          jQuery.ajax({
            url: '/api/forge/signin',
            success: function (forgeOAuthURL) {
              location.href = forgeOAuthURL;
            }
          });
        });
      }
    }
  });
}

$(function () {
  $('.list-group.checked-list-box .list-group-item').each(function () {

    // Settings
    var $widget = $(this),
      $checkbox = $('<input type="checkbox" class="hidden" />'),
      color = ($widget.data('color') ? $widget.data('color') : "primary"),
      style = ($widget.data('style') == "button" ? "btn-" : "list-group-item-"),
      settings = {
        on: {
          icon: 'glyphicon glyphicon-check'
        },
        off: {
          icon: 'glyphicon glyphicon-unchecked'
        }
      };

    $widget.css('cursor', 'pointer')
    $widget.append($checkbox);

    // Event Handlers
    $widget.on('click', function () {
      $checkbox.prop('checked', !$checkbox.is(':checked'));
      $checkbox.triggerHandler('change');
      updateDisplay();
    });
    $checkbox.on('change', function () {
      updateDisplay();
    });


    // Actions
    function updateDisplay() {
      var isChecked = $checkbox.is(':checked');

      // Set the button's state
      $widget.data('state', (isChecked) ? "on" : "off");

      // Set the button's icon
      $widget.find('.state-icon')
        .removeClass()
        .addClass('state-icon ' + settings[$widget.data('state')].icon);

      // Update the button's color
      if (isChecked) {
        $widget.addClass(style + color + ' active');
      } else {
        $widget.removeClass(style + color + ' active');
      }
    }

    // Initialization
    function init() {

      if ($widget.data('checked') == true) {
        $checkbox.prop('checked', !$checkbox.is(':checked'));
      }

      updateDisplay();

      // Inject the icon if applicable
      if ($widget.find('.state-icon').length == 0) {
        $widget.prepend('<span class="state-icon ' + settings[$widget.data('state')].icon + '"></span>');
      }
    }
    init();
  });

  $('#get-checked-data').on('click', function(event) {
    event.preventDefault();
    var checkedItems = {}, counter = 0;
    $("#check-list-box li.active").each(function(idx, li) {
      checkedItems[counter] = $(li).text();
      counter++;
    });
    $('#display-json').html(JSON.stringify(checkedItems, null, '\t'));
  });
});

