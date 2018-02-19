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

'use strict'; // http://www.w3schools.com/js/js_strict.asp

// web framework
var express = require('express');
var router = express.Router();
var bodyParser = require('body-parser');
var jsonParser = bodyParser.json();
var request = require('request');
var async = require('async');
var twilio = require('twilio');
var postmark = require("postmark");

// app config settings
var config = require('./../config');
var Credentials = require('./../credentials');

// this is the endpoint that will be exposed
var hookCallbackEntpoint = '/api/forge/hook/callback';

router.post('/api/forge/hook', jsonParser, function (req, res) {
  // session with access token
  var token = new Credentials(req.session);
  var events = req.body.events;
  var folderHttp = req.body.folderId;

  // input from user
  var sms = req.body.sms;
  var email = req.body.email;
  var slack = req.body.slack;
  if (!sms && !email && !slack) {
    res.status(400).end();
    return;
  }

  // extract projectId & folderId from input
  var params = folderHttp.split('/');
  var folderId = params[params.length - 1];
  var projectId = params[params.length - 3];

  // prepare the attributes to create hook
  var attributes = {
    events: events,
    projectId: projectId
  };
  if (sms) attributes['sms'] = sms;
  if (email) attributes['email'] = email;
  if (slack) attributes['slack'] = slack;

  var hooks = new WebHooks(token.getForgeCredentials().access_token, folderId);

  hooks.DeleteHooks(function () {
    hooks.CreateHook(attributes, function (status) {
      res.status(200).json(status);
    })
  });
});

router.get('/api/forge/hook/*', function (req, res) {
  var params = req.url.split('/');
  var folderId = params[params.length - 1];

  var token = new Credentials(req.session);
  var hooks = new WebHooks(token.getForgeCredentials().access_token, folderId);

  hooks.GetHooks(function (hooks) {
    if (hooks.length == 0) {
      res.status(204).end();
      return;
    }

    // get all evens for this folder
    var events = [];
    hooks.forEach(function (hook) {
      events.push(hook.eventType);
    });

    //return to the UI
    res.status(200).json({
      sms: hooks[0].hookAttribute.sms,    // all events should have the same sms & email (for this app)
      email: hooks[0].hookAttribute.email,
      slack: hooks[0].hookAttribute.slack,
      events: events
    });
  });
});

router.post(hookCallbackEntpoint, jsonParser, function (req, res) {
  // Best practice is to tell immediately that you got the call
  // so return the HTTP call and proceed with the business logic
  res.status(202).end();

  var hook = req.body.hook;
  var payload = req.body.payload;

  // check if the current event is one of the events to notifify
  if (hook.hookAttribute.events.indexOf(hook.eventType) == -1) return;

  var eventParams = hook.eventType.split('.');
  var itemType = eventParams[1];
  var eventName = eventParams[2];

  var message = 'BIM360 Notifier: ' + itemType + ' ' + payload.name + ' was ' + eventName + ' on project ' + payload.ancestors[1].name;

  // SMS Notification
  if (hook.hookAttribute.sms && config.twilio.credentials.accountSid) {
    var client = new twilio(config.twilio.credentials.accountSid, config.twilio.credentials.token);
    client.messages.create({
      body: message,
      to: hook.hookAttribute.sms,
      from: config.twilio.fromNumber
    }, function (err, result) {
      console.log(hook.hookAttribute.sms + ': ' + message + ' => ' + result.status);
    });
  }

  // Email notification
  if (hook.hookAttribute.email) {
    var client = new postmark.Client(config.postmark.credentials.accountId);

    client.sendEmail({
      "From": config.postmark.fromEmail,
      "To": hook.hookAttribute.email,
      "Subject": "BIM 360 Notifier",
      "TextBody": message
    }).then(function (res) {
      console.log(hook.hookAttribute.email + ': ' + message + ' => ' + res.Message);
    }).catch(function (err) {
      console.log(err);
    });
  }

  // slack notification
  if (hook.hookAttribute.slack){
    request.post({
      'url' : 'https://hooks.slack.com/services/' + hook.hookAttribute.slack,
      'Content-Type': 'application/json',
      'body' : JSON.stringify({text: message})
    });
  }
});


// *****************************
// WebHook endpoints wrapper
// *****************************

function WebHooks(accessToken, folderId) {
  this._accessToken = accessToken;
  this._folderId = folderId;

  this._url = 'https://developer.api.autodesk.com/webhooks/v1/systems/data';
}

WebHooks.prototype.GetHooks = function (callback) {
  // get all hooks for this user
  var self = this;
  request.get({
    //url : 'https://developer.api.autodesk.com/webhooks/v1/systems/data/events/fs.file.added/hooks',
    url: this._url + '/hooks',
    headers: {
      'Authorization': 'Bearer ' + this._accessToken
    }
  }, function (error, response) {
    var hooks = [];

    if (response.statusCode != 200) {
      callback(hooks);
      return;
    }

    var list = JSON.parse(response.body);
    list.forEach(function (hook) {
      if (hook.scope.folder === self._folderId/* && hook.hookAttribute.events.indexOf(hook.eventType)>-1*/)
        hooks.push(hook);
    });
    callback(hooks);
  });
};

WebHooks.prototype.DeleteHooks = function (callback) {
  var self = this;
  this.GetHooks(function (hooks) {
    var deleteRequests = [];
    hooks.forEach(function (hook) {
      deleteRequests.push(function (callback) {
        request({
          url: self._url + '/events/' + hook.eventType + '/hooks/' + hook.hookId,
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + self._accessToken
          }
        }, function (error, response) {
          callback(null, (response.status == 24 ? hook.eventType : null));
        });
      })
    });

    // process all delete calls in parallel
    async.parallel(deleteRequests, function (err, results) {
      callback(results);
    })
  });
};

WebHooks.prototype.CreateHook = function (attributes, callback) {
  // this is how the hook will callback
  var callbackEndpoint = config.forge.hookCallbackHost + hookCallbackEntpoint;

  var requestBody = {
    callbackUrl: callbackEndpoint,
    scope: {
      folder: this._folderId
    },
    hookAttribute: attributes
  };

  /*
   request.post({
   url: this._url + '/hooks',
   headers: {
   'Content-Type': 'application/json',
   'Authorization': 'Bearer ' + this._accessToken
   },
   body: JSON.stringify(requestBody)
   }, function (error, response) {
   callback((response.statusCode == 201));
   });*/


  var self = this;
  var createEvents = [];
  var events = attributes.events.split(',');
  events.forEach(function (event) {
    createEvents.push(function (callback) {
      request({
        url: self._url + '/events/' + event + '/hooks',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + self._accessToken
        },
        body: JSON.stringify(requestBody)
      }, function (error, response) {
        callback(null, (response.statusCode == 201 ? event : null));
      });
    })
  })

  // process all delete calls in parallel
  async.parallel(createEvents, function (err, results) {
    callback(results);
  })
};

module.exports = router;