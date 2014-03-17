var _ = require('underscore');
var EventEmitter = require('events').EventEmitter;
var Base = require('./base');
var _ = require('underscore');

var Web = module.exports = function(url, roomId) {
  Base.call(this, url, roomId);
}

_.extend(Web.prototype, EventEmitter.prototype);
_.extend(Web.prototype, Base.prototype);

Web.prototype.send = function(data) {
  this.socket.send(data);
}

Web.prototype.bufferedAmount = function() {
  return this.socket.bufferedAmount;
}

Web.prototype.setupSocket = function() {
  if (this.socket) this.socket.close();
  var connection = this;
  this.socket = new WebSocket(this.url);
  this.socket.onopen = function() { connection.joinRoom(); connection.emit('open'); };
  this.socket.onmessage = function(data) { connection.handleMessage(data); };
  this.socket.onclose = function() { connection.emit('close'); };
}
