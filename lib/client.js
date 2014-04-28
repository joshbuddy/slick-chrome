var EventEmitter = require('events').EventEmitter;
var _ = require('underscore');
var sjcl = require('./sjcl');
var WorkerPool = require('./worker_pool');
var uuid = require('node-uuid');
var crypto = require('crypto');
// remove all usage of inNode
var inNode = (typeof(process) !== 'undefined' && process.versions && process.versions.node);
var Connection = inNode ? require('./connection/node') : require('./connection/web');
var FS = inNode ? require('./fs/node') : require('./fs/web');
var fileTracker = {};

function User(key) {
  this.key = key;
  this.getName = function() {
    if (this.name) {
      return this.name
    } else {
      return this.key.substring(0, 6);
    }
  };
}

function errorHandler(e) {
  var msg = '';

  switch (e.code) {
    case FileError.QUOTA_EXCEEDED_ERR:
      msg = 'QUOTA_EXCEEDED_ERR';
      break;
    case FileError.NOT_FOUND_ERR:
      msg = 'NOT_FOUND_ERR';
      break;
    case FileError.SECURITY_ERR:
      msg = 'SECURITY_ERR';
      break;
    case FileError.INVALID_MODIFICATION_ERR:
      msg = 'INVALID_MODIFICATION_ERR';
      break;
    case FileError.INVALID_STATE_ERR:
      msg = 'INVALID_STATE_ERR';
      break;
    default:
      msg = 'Unknown Error';
      break;
  };
  console.log('Error: ' + msg);
}

var Client = module.exports = function(url, roomId, opts) {
  var client = this;

  this.opts = _.defaults(opts || {}, {
    encrypterCount: 2,
    blockEncrypterCount: 8,
    decrypterCount: 10,
    sendingGap: 20
  });

  this.url = url;
  this.roomId = roomId;
  this.chunkSize = 1024 * 1024;
  this.slickDir;
  this.clientFiles = {}; // files that you have offered
  this.possibleFiles = {}; // files that have been offered to you
  this.sendFiles = {}; // we're going to have to keep track of what we sent so far when we deal with disconnects anyway. though we're going to need an ack for what they actually got. right now I'm only keeping track of bytes sent, but later we'll record which chunks were processed here.
  this.users = {};
  this.readers = {};
  this.writers = {};
  this.password = '';

  this.encrypterWorker = new WorkerPool("encrypter.js", this.opts.encrypterCount);
  this.blockEncrypterWorker = new WorkerPool("encrypter.js", this.opts.blockEncrypterCount);
  this.decrypterWorker = new WorkerPool("decrypter.js", this.opts.decrypterCount);

  this.sendMessage = function() { console.log("you need to join dawg") };
}

Client.prototype.generateKeys = function() {
  var storage;
  if (inNode) {
    var LocalStorage = require('node-localstorage').LocalStorage;
    storage = new LocalStorage('./slick');
  } else {
    storage = localStorage;
  }

  var secHex = storage['sec_key_hex'];
  var pubHex = storage['pub_key_hex'];
  if (!secHex || !pubHex) {
    var keys = sjcl.ecc.ecdsa.generateKeys(384, 1);
    var public_key = keys.pub.get();
    var public_key_hex = sjcl.codec.hex.fromBits(public_key.x) + sjcl.codec.hex.fromBits(public_key.y);
    secHex = storage['sec_key_hex'] = sjcl.codec.hex.fromBits(keys.sec.get());
    pubHex = storage['pub_key_hex'] = public_key_hex;
  }
  return [ secHex, pubHex ];
}

Client.prototype.init = function() {
  var client = this;
  if (!this.fs) this.fs = new FS();
}

Client.prototype.processFileOffer = function(from, availableFiles) {
  var messageSerialization = [{type: 'from', value: from}, {type: 'text', value: 'Offering files: '}];
  for (var i=0; i<availableFiles.length; i++) {
    this.possibleFiles[availableFiles[i]['fileId']] = {name: availableFiles[i]['name'], size: availableFiles[i]['size'], type: availableFiles[i]['type'], from: from, chunkCount: availableFiles[i]['chunkCount']};
    messageSerialization.push({type: 'file', value: availableFiles[i]['fileId']});
  }
  this.emit('message', messageSerialization, 'them')
}

Client.prototype.handleRelay = function(json) {
  var from = json.pub;
  console.log("handing "+json.type);
  console.time("processMessage "+json.type);
  switch (json['type']) {
    case "join":
      this.addUser(from);
      break;
    case "chat":
      this.emit('message', [{type: 'from', value: from}, {type: 'text', value: json['message']}], 'them');
      break;
    case "fileOffer":
      this.processFileOffer(from, json['files']);
      break;
    case "fileRequest":
      var file = this.clientFiles[json['file']];
      this.emit("initiatingFileSending", from, json['file'], this.readers[json['file']]);
      break;
    case "fileChunk":
      // enqueue the chunk
      var writer = this.writers[json['file']];
      console.log("json"+JSON.stringify(json));

      writer.bytesReceived = writer.bytesReceived + json['chunkLength'];
      this.emit("fileChunk", json['file'], json['chunkIndex'], "received");
      writer.add(json['chunk'], json['chunkOffset'], json['chunkIndex']);
      break;
    case "ackChunk":
      // ack the chunk
      var reader = this.readers[json['file']];
      reader.ack(json['chunkIndex']);
      this.emit("fileChunk", json['file'], json['chunkIndex'], "acked");
      break;
    case "nick":
      // this ordering kind of matters
      this.emit('nick', from, json['nick']);
      this.users[from].user.name = json['nick'];
      break;
    case "emote":
      this.emit('emote', from, json['emote']);
      break;
  }
  console.timeEnd("processMessage"+json.type);
}

Client.prototype.isSecure = function() {
  return document.getElementById("password").value.length != 0;
}

Client.prototype.getPassword = function(recipient) {
  var key = this.roomId;
  var saltedPassword = this.password + key;
  return saltedPassword;
}

Client.prototype.removeUser = function(userId) {
  this.emit('removeUser', this.users[userId].user);
  delete this.users[userId];
}

Client.prototype.addUser = function(userId) {
  var client = this;
  if (this.users[userId]) {
    clearTimeout(this.users[userId]['timeout']);
    this.users[userId]['timeout'] = setTimeout(function(){client.removeUser(userId)}, 35000);
    return;
  }
  this.users[userId] = {user: new User(userId), timeout: setTimeout(function(){client.removeUser(userId)}, 35000)};
  this.emit('addUser', this.users[userId].user);

  // since I am adding them they probably don't know I exist either
  this.sendMessage({type: "join"});
}

Client.prototype.setupConnection = function() {
  var connection = new Connection(this.url, this.roomId);

  var client = this;
  var keys = this.generateKeys();
  var secretKey = keys[0];
  this.publicKey = keys[1];
  var client = this;

  client.sendMessage = function(message, opts, cb) {
    if (cb === undefined) {
      cb = opts;
      opts = {};
    }
    opts.priority = true;
    client.sendLowMessage(message, opts, cb);
  }

  client.sendLowMessage = function(message, opts, cb) {
    var transfer = undefined;
    if (opts.transfer) {
      console.log("got a transfer of length: "+opts.transfer.byteLength);
      transfer = [ opts.transfer ];
    }
    console.time("constructing message");
    opts.message = message;
    console.timeEnd("constructing message")
    console.time("getting password");
    opts.password = client.getPassword();
    console.timeEnd("getting password");
    opts.sec = secretKey;
    opts.pub = client.publicKey;
    console.time("getting crypto");
    if (inNode) {
      opts.rand = sjcl.codec.hex.fromBits(crypto.randomBytes(256));
    } else {
      var rand = new Uint32Array(32);
      window.crypto.getRandomValues(rand);
      opts.rand = sjcl.codec.hex.fromBits(rand);
    }
    console.timeEnd("getting crypto");
    console.time("adding job");
    var pool = opts.priority ? "encrypterWorker" : "blockEncrypterWorker";
    client[pool].addJob({msg: opts, transfer: transfer}, function(response) {
      console.time(transfer ? "sending transfer message "+opts.transfer.byteLength : "sending message");
      connection.sendMessage(response.data.encrypted, opts.priority);
      console.timeEnd(transfer ? "sending transfer message "+opts.transfer.byteLength : "sending message");
      if (cb) cb();
    });
    console.timeEnd("adding job");
  }

  var keepConnectionOpen;
  connection.on("open", function() {
    // initial join
    client.emit('open');
    client.sendMessage({type: "join"});
    keepConnectionOpen = setInterval(function() {
      client.sendMessage({type: "join"});
    }, 30000);

    connection.on("joined", function(id) {
      client.emit("joined", id);
    })

    connection.on('message', function(message) {
      // server text is not encrypted because server does not know the password
      client.decrypterWorker.addJob({msg: {message: message, password: client.getPassword()}}, function(response) {
        client.handleRelay(response.data);
      });
    });

    connection.on('close', function() {
      if (keepConnectionOpen) {
        clearInterval(keepConnectionOpen);
      }
    });
  });

  connection.start();
}

Client.prototype.transferFileChunk = function(to, fileId, chunkIndex) {
  this.emit('fileChunk', fileId, chunkIndex, "requested");
  var client = this;
  if (this.readers[fileId]) {
    var reader = this.readers[fileId];
    reader.send(chunkIndex, function(startOffset, endOffset, total) {
      this.emit('fileChunk', fileId, chunkIndex, "sent");
    });
  }
}

Client.prototype.offerFiles = function(files) {
  var client = this;
  var offer = [];
  for (var i = 0; i<files.length; i++) {
    var f = files[i];
    var fileId = uuid.v4();
    var reader = this.readers[fileId] = this.fs.reader(fileId, f, this.chunkSize);
    reader.on('chunkLoaded', function(index, length, chunk) {
      var request = {type: "fileChunk", file: fileId, chunkOffset: client.chunkSize * index, chunkLength:
length, size: reader.size, chunkIndex: index, chunkCount: reader.chunkCount};
      console.log("sending chunk");
      console.dir(request);
      client.sendLowMessage(request, {transfer: chunk});
    });
    reader.on('finished', function(url) {
      client.emit('fileComplete', fileId, url);
    });
    offer.push({fileId: fileId, name: reader.name, size: reader.size, type: reader.type, chunkCount: reader.chunkCount});
  }
  var client = this;
  this.sendMessage({type: "fileOffer", files: offer}, function() {
    client.emit('message', [{type: 'from', value: 'me'}, {type: 'text', value: "Offered files - "+offer.map(function(n) {return n['name']}).join(", ")}], 'me');
  })
}

Client.prototype.createWriter = function(fileId) {
  var client = this;
  var w = this.fs.writer(fileId, this.possibleFiles[fileId].chunkCount, this.possibleFiles[fileId].size);
  w.on('fileChunkWritten', function(fileId, chunkIndex, bytesWritten) {
    client.emit('fileChunk', fileId, chunkIndex, "written");
    client.sendMessage({chunkIndex: chunkIndex, type: "ackChunk", file: fileId});
  });
  w.on('fileComplete', function(fileId, url) {
    client.emit('fileComplete', fileId, url);
  });
  this.writers[fileId] = w;

  var request = {chunkIndex: 0, type: "fileRequest", file: fileId};
  client.sendMessage(request);
}

Client.prototype.handleFileSelect = function(evt) {
  evt.stopPropagation();
  evt.preventDefault();
  var length = evt.dataTransfer.items.length;
  var files = [];
  var client = this;
  var fileCount = 0;
  for (var i = 0; i < length; i++) {
    var entry = evt.dataTransfer.items[i].webkitGetAsEntry();
    if (entry.isFile) {
      fileCount++;
      entry.file(function(file) {
        files.push(file);
      });
    } else if (entry.isDirectory) {
      console.log("TODO: directories!");
    }
  }

  // this shouldn't actually take any time... wrapping in timeout 0 probably enough but just to be sure...
  var waitForFiles = setInterval(function() {
    if (files.length == fileCount) {
      client.offerFiles(files);
      clearInterval(waitForFiles);
    }
  }, 0);


}

Client.prototype.handleDragOver = function(evt) {
  evt.stopPropagation();
  evt.preventDefault();
  evt.dataTransfer.dropEffect = 'copy';
}

_.extend(Client.prototype, EventEmitter.prototype);
