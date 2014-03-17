var _ = require('underscore'),
    EventEmitter = require('events').EventEmitter,
    fs = require('fs'),
    path = require('path');

function errorHandler(err) {
  console.log("something terrible!"+err);
}

function Writer(dir, fileId, chunkCount, filesize, fetcher, complete) {
  this.dir = dir;
  this.fileId = fileId;
  this.complete = complete;
  this.chunks = [];
  this.requestIndex = 0;
  this.addedCount = 0;
  this.writtenCount = 0;
  this.bytesReceived = 0;
  this.bytesWritten = 0;
  this.startTime = Date.now();
  this.initialized = false;
  this.fetcher = fetcher;
  this.chunkCount = chunkCount;
  this.filesize = filesize;
  this.write();
  this.path = path.join(this.dir, this.fileId);
}

Writer.prototype.write = function() {
  var writer = this;
  this.requestWork();
  if (writer.chunks.length == 0) {
    setTimeout(function() { writer.write(); }, 100);
  } else {
    if (!writer.initialized) {
      writer.fd = fs.open(writer.path, "w", function(err) {
        fs.truncate(writer.fd, writer.filesize, function(err) {
          if (err) return errorHandler(err);
          writer.initialized = true;
          writer.write();
        });
      });
    } else {
      var next = writer.chunks.shift(),
          buf = next[0],
          pos = next[1];
      fs.write(writer.fd, buf, buf.length, pos, function(err) {
        if (err) return errorHandler(err);
        writer.write();
      });
    }
  }
}

Writer.prototype.requestWork = function() {
  while (!this.completelyRequested && this.gap() < 4) {
    var index = this.requestIndex;
    this.requestIndex++;
    this.fetcher(index);
    this.completelyRequested = this.requestIndex == this.chunkCount;
  }
}

Writer.prototype.gap = function() {
  return this.requestIndex - this.writtenCount;
}

Writer.prototype.add = function(chunk, offset) {
  this.addedCount++;
  this.chunks.push([chunk, offset]);
}

var FS = module.exports = function(size) {
  this.entry = path.join(process.env.HOME, '.slick');
  if (!fs.existsSync(this.entry)) {
    fs.mkdirSync(this.entry);
  }
}

FS.prototype.writer = function(fileId, chunkCount, fileSize, fetcher, complete) {
  return new Writer(this.entry, fileId, chunkCount, fileSize, fetcher, complete)
}

_.extend(FS.prototype, EventEmitter.prototype);

