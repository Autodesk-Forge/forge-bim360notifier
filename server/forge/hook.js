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
  if (events.length > 0 && !sms && !email && !slack) {
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

  Get2LegggedToken(function(two_legged_access_token){
    DeleteAndCreateHooks(two_legged_access_token, token.getForgeCredentials().access_token, folderId, attributes, function(status){
      res.status(200).json(status);
    });
  });
});

function DeleteAndCreateHooks(two_legged_access_token, three_legged_access_token, folderId, attributes, callback)
{
    var hooks = new WebHooks(two_legged_access_token, three_legged_access_token, folderId);
    hooks.DeleteHooks(function () {
      hooks.CreateHook(attributes, function (status) {
        callback(status);
      })
    });
}

router.get('/api/forge/hook/*', function (req, res) {
  var params = req.url.split('/');
  var folderId = params[params.length - 1];

  var token = new Credentials(req.session);
  Get2LegggedToken(function(two_legged_access_token){
    var hooks = new WebHooks(two_legged_access_token, token.getForgeCredentials().access_token, folderId);

    hooks.GetHooks(function (hooks2lo, hooks3lo) {
      if (hooks2lo.length == 0 && hooks3lo.length == 0) {
        res.status(204).end();
        return;
      }

      var allHooks  = [];
      hooks2lo.forEach(function (hook){
        allHooks.push(hook);
      });

      hooks3lo.forEach(function (hook){
        allHooks.push(hook);
      })

      // get all evens for this folder
      var events = [];
      allHooks.forEach(function (hook) {
        events.push(hook.system + '|' + hook.event);
      });

      if (allHooks[0].hookAttribute === undefined) {
        allHooks[0].hookAttribute = {};
      }

      //return to the UI
      res.status(200).json({
        sms: allHooks[0].hookAttribute.sms,    // all events should have the same sms & email (for this app)
        email: allHooks[0].hookAttribute.email,
        slack: allHooks[0].hookAttribute.slack,
        events: events
      });
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
  if (hook.hookAttribute.events.indexOf(hook.event) == -1) return;

  var eventParams = hook.event.split('.');
  var itemType = eventParams[1];
  var eventName = eventParams[2];

  if(hook.event === "model.sync") {

    var stateString = 'started';
    if(payload.state === 'SYNC_COMPLETE')
    {
      stateString = 'completed';
    }

    Get2LegggedToken(function(access_token) {
        request({
          url: 'https://developer.api.autodesk.com/data/v1/projects/' + payload.projectId + '/items/' + req.body.resourceUrn,
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + access_token,
            'x-ads-region': (hook.scope.folder.indexOf('wipemea') > 0 ? 'EMEA' : 'US')
          }
        }, function (nameError, nameResponse) {
          var data = JSON.parse(nameResponse.body);
          var name = data.data.attributes.displayName
          var syncMessage = 'BIM360 Notifier: Model Sync was ' + stateString + ' on model ' + name;
          sendMessage(hook, syncMessage);
        });
    });
  }
  else{
    var normalMessage = 'BIM360 Notifier: ' + itemType + ' ' + payload.name + ' was ' + eventName + ' on project ' + payload.ancestors[1].name
    sendMessage(hook, normalMessage);
  }
});

function sendMessage(hook, message)
{
  // SMS Notification
  if (hook.hookAttribute.sms && config.twilio.credentials.accountSid) {
    var client = new twilio(config.twilio.credentials.accountSid, config.twilio.credentials.token);
    client.messages.create({
      body: message,
      to: hook.hookAttribute.sms,
      from: config.twilio.fromNumber
    }, function (err, result) {
      if (result != undefined)
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
  if (hook.hookAttribute.slack) {
    request.post({
      'url': 'https://hooks.slack.com/services/' + hook.hookAttribute.slack,
      'Content-Type': 'application/json',
      'body': JSON.stringify({ text: message })
    });
  }
}

function Get2LegggedToken(callback)
{
    request.post("https://developer.api.autodesk.com/authentication/v1/authenticate", 
      function (error, response) {
        var access_token = JSON.parse(response.body).access_token;
        callback(access_token);
      }
    ).form({
      client_id: config.forge.credentials.client_id, 
      client_secret: config.forge.credentials.client_secret,
      grant_type: 'client_credentials',
      scope: 'data:read'
    });
}

// *****************************
// WebHook endpoints wrapper
// *****************************

function WebHooks(twoLeggedaccessToken, threeLeggedAccessToken, folderId) {
  this._twoLeggedAccessToken = twoLeggedaccessToken;
  this._threeLeggedAccessToken = threeLeggedAccessToken;
  this._folderId = folderId;

  this._url = 'https://developer.api.autodesk.com/webhooks/v1/';
}

WebHooks.prototype.GetHooks = function (callback) {
  // get all hooks for this user
  var self = this;
  request.get({
    //url : 'https://developer.api.autodesk.com/webhooks/v1/systems/data/events/fs.file.added/hooks',
    url: self._url + '/hooks',
    headers: {
      'Authorization': 'Bearer ' + self._twoLeggedAccessToken,
      'x-ads-region': (self._folderId.indexOf('wipemea') > 0 ? 'EMEA' : 'US')
    }
  }, function (error, response) {

    var hooks2lo = [];
    var hooks3lo = [];
    if (response.statusCode == 200) {
      var list = JSON.parse(response.body);
      list.data.forEach(function (hook) {
        if (hook.scope.folder === self._folderId/* && hook.hookAttribute.events.indexOf(hook.eventType)>-1*/)
        {
          hooks2lo.push(hook);
        }

      });
    }

    request.get({
      //url : 'https://developer.api.autodesk.com/webhooks/v1/systems/data/events/fs.file.added/hooks',
      url: self._url + '/hooks',
      headers: {
        'Authorization': 'Bearer ' + self._threeLeggedAccessToken,
        'x-ads-region': (self._folderId.indexOf('wipemea') > 0 ? 'EMEA' : 'US')
      }
    }, function (error3lo, response3lo) {
      if (response3lo.statusCode != 200) {
        callback(hooks2lo, hooks3lo);
        return;
      }

      list = JSON.parse(response3lo.body);
      list.data.forEach(function (hook) {
        if (hook.scope.folder === self._folderId/* && hook.hookAttribute.events.indexOf(hook.eventType)>-1*/)
        {
          hooks3lo.push(hook);

        }
      });
      callback(hooks2lo, hooks3lo);
    });
  });
};

WebHooks.prototype.DeleteHooks = function (callback) {
  var self = this;
  this.GetHooks(function (hooks2lo, hooks3lo) {
    var deleteRequests = [];
    hooks2lo.forEach(function (hook) {
      deleteRequests.push(function (callback) {
        request({
          url: self._url + 'systems/' +  hook.system + '/events/' + hook.eventType + '/hooks/' + hook.hookId,
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + self._twoLeggedAccessToken,
            'x-ads-region': (self._folderId.indexOf('wipemea') > 0 ? 'EMEA' : 'US')
          }
        }, function (error, response) {
          callback(null, (response.status == 24 ? hook.eventType : null));
        });
      })
    });

    hooks3lo.forEach(function (hook) {
      deleteRequests.push(function (callback) {
        request({
          url: self._url + 'systems/' +  hook.system + '/events/' + hook.eventType + '/hooks/' + hook.hookId,
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + self._threeLeggedAccessToken,
            'x-ads-region': (self._folderId.indexOf('wipemea') > 0 ? 'EMEA' : 'US')
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
  events.forEach(function (eventData) {
    if (eventData === '') return;
    var eventDataArray = eventData.split('|');
    var eventSystem = eventDataArray[0]
    var event = eventDataArray[1];

    var token = self._threeLeggedAccessToken;
    if(eventSystem === "adsk.c4r")
    {
      token = self._twoLeggedAccessToken;
    }

    createEvents.push(function (callback) {
      request({
        url: self._url + 'systems/' + eventSystem + '/events/' + event + '/hooks',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
          'x-ads-region': (self._folderId.indexOf('wipemea') > 0 ? 'EMEA' : 'US')
        },
        body: JSON.stringify(requestBody)
      }, function (error, response) {
        callback(null, (response.statusCode == 201 ? event : null));
      });
    })
  })

  // process all create calls in parallel
  async.parallel(createEvents, function (err, results) {
    callback(results);
  })
};

module.exports = router;