var _ = require('underscore'),
    WebSocket = require('ws'),
    EventEmitter = require('events').EventEmitter;

var Connection = module.exports = function(url) {
  var connection = this;
  this.socket = new WebSocket(url);
  this.socket.on('open', function() { connection.emit('open'); });
  this.socket.on('message', function(data) { connection.emit('message', data); });
  this.socket.on('close', function() { connection.emit('close'); });

}

Connection.prototype.send = function(data) {
  console.log("sending data .. "+data);
  this.socket.send(data);
}

_.extend(Connection.prototype, EventEmitter.prototype);
