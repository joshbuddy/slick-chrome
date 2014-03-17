var Base = module.exports = function(url, roomId) {
  this.url = url;
  this.roomId = roomId;
  this.state = 'init';
  this.messages = [];
}

Base.prototype.start = function() {
  if (this.state != 'init' && this.state != 'close') throw "don't start me dawg";
  if (this.state == 'init') {
    this.startMessageProcessor();
    var base = this;
    this.on('close', function() {
      if (base.state != 'closing') {
        base.reconnect();
      } else {
        base.state = 'closed';
      }
    });
    this.on('open', function() {
      clearTimeout(base.reconnectId);
      base.state = 'open';
    });
  }
  this.reconnect();
}

Base.prototype.joinRoom = function() {
  this.send(JSON.stringify({"command": "join", "roomId": this.roomId == '' ? null : this.roomId}));
}

Base.prototype.sendMessage = function(message, priority) {
  if (this.state == 'init') throw "connection not open";
  if (priority) {
    this.messages.unshift(message);
  } else {
    this.messages.push(message);
  }
}

Base.prototype.startMessageProcessor = function() {
  var base = this;
  if (!this.messageProcessor) {
    this.messageProcessor = setInterval(function() {
      base.processMessageQueue();
    }, 100);
  }
}

Base.prototype.processMessageQueue = function() {
  if (this.messages.length == 0 || this.state != 'ready') return;
  while (this.messages.length != 0) {
    this.send(this.messages.shift());
  }

}

Base.prototype.reconnect = function() {
  if (this.state == 'opening') return;
  var base = this;
  this.state = 'opening';
  this.reconnectId = setInterval(function() {
    console.log("setting up a new socket");
    base.setupSocket();
  }, 3000);
  base.setupSocket();
}

Base.prototype.handleMessage = function(message) {
  switch (this.state) {
    case "open":
      var json = JSON.parse(message.data);
      if (json.command == 'join-event') {
        this.roomId = json.roomId;
        this.emit('joined', this.roomId);
        this.state = 'ready';
      } else {
        throw "what!"+json.command;
      }

      break;
    case "ready":
      this.emit('message', message.data);
      break;
  }
}