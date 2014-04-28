var express = require('express');
var uuid = require('node-uuid');
var WebSocketServer = require('ws').Server;
var http = require('http');
var crypto = require('crypto');
var redis = require('redis');
var url = require("url");
var crypto = require('crypto');
var shasum = crypto.createHash('sha1');
var colors = require('colors');

var Server = module.exports = function(data) {
  var server = this;

  var commonRedis = this.redisClient();
  if (process.env.FLUSH == 'true') {
    console.log("flushing!")
    commonRedis.flushall(function(err) {
      console.log("err:"+err);
    });
  }

  this.app = express();
  this.httpServer = http.createServer(this.app);
  this.app.use(express.static(__dirname + "/../public"));
  this.app.use(this.app.router);

  this.app.set('view engine', 'ejs');

  this.app.get("/", function(req, res) {
    res.render("index", { roomId: ''})
  });

  this.app.get("/:room_id", function(req, res) {
    res.render("index", { roomId: req.params.room_id })
  });

  var wss = new WebSocketServer({server: this.httpServer});
  var users = {};

  wss.on('connection', function(ws) {
    var connectionId = uuid.v4();
    var roomId = ws.upgradeReq.url.substring(1);
    var connectionChannel = connectionId+"-data";
    var listener = server.redisClient();

    var fail = function(errorMessage) {
      console.log("connectionId:"+connectionId+" "+errorMessage);
      ws.close();
      client.close();
    }

    var join = function(roomId) {
      if (ws.roomId) return; // todo allow multiple room connections
      if (!roomId) roomId = uuid.v4();
      console.log("joining roomid "+roomId);
      var roomChannel = roomId+"-room";
      commonRedis.sadd(roomChannel, connectionId, function(err, num) {
        if (err) return fail(err);
        listener.on('message', function(channel, message) {
          if (err) return fail(err);
          ws.send(message);
        });
      });
      ws.roomChannel = roomChannel;
      ws.roomId = roomId;
      ws.send(JSON.stringify({command: "join-event", roomId: ws.roomId}));
    }

    ws.on('message', function(msg) {
      var json = JSON.parse(msg);
      if (json.command) {
        switch(json.command) {
          case "join":
            console.log("got join command ... "+JSON.stringify(json.roomId));
            join(json.roomId);
            break;
          default:
            console.log("command not recognized")
            break;
        }
      } else {
        if (!ws.roomChannel) return console.log('you should join first');

        var shasum = crypto.createHash('sha512');
        shasum.update(msg);
        var hash = shasum.digest('hex');
        commonRedis.multi().
          set(hash, msg).
          smembers(ws.roomChannel).
        exec(function (err, replies) {
          if (err) return fail(err);

          var values = replies[replies.length - 1];
          for (var i = 0, len = values.length; i != len; i++) {
            if (values[i] != connectionId) {
              console.log("values - i "+i+" --> "+values[i])
              var recipientId = values[i];
              commonRedis.publish(recipientId+"-data", msg, function(err, num) {
                if (num == 0) {
                  commonRedis.srem(ws.roomChannel, recipientId);
                }
              });
            }
          }
        })
      }

      listener.subscribe(connectionChannel);
      join(roomId);
    });

    ws.on('close', function() {
      console.log('connection '+connectionId+' closing');
      delete users[connectionId];
      commonRedis.srem(ws.roomChannel, connectionId, function(err) {
        listener.unsubscribe(function() {
          listener.end();
        });
      })
    });
  });
}

Server.prototype.redisClient = function() {
  var redisUrl = process.env.REDISTOGO_URL || "redis://localhost:6379";
  var rtg = url.parse(redisUrl);
  var client = redis.createClient(rtg.port, rtg.hostname);
  if (rtg.auth) client.auth(rtg.auth.split(":")[1]);
  return client;
}

Server.prototype.listen = function(port) {
  this.httpServer.listen(port);
}
