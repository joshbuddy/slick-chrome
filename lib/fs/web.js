var _ = require('underscore');
var EventEmitter = require('events').EventEmitter;

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

function Reader(fileId, file, chunkSize) {
  this.file = file;
  this.name = file.name;
  this.size = file.size;
  this.type = file.type;
  this.chunkSize = chunkSize;
  console.log("this.chunkSize:"+this.chunkSize);
  this.chunkCount = Math.ceil(file.size / chunkSize);
  console.log("file.size:"+file.size);
  console.log("this.chunkCount:"+this.chunkCount);
  this.tracker = new Array(this.chunkCount);
  for (var i = 0; i != this.chunkCount; i++) {
    this.tracker[i] = Reader.UNSENT;
  }
  this.unsentCount = this.chunkCount;
  this.sentCount = 0;
  this.ackedCount = 0;
}

Reader.UNSENT = 0;
Reader.SENT = 1;
Reader.ACKED = 2;

Reader.prototype.ack = function(index) {
  if (this.acks != Reader.SENT) return;
  this.sentCount--;
  this.ackedCount++;
  this.tracker[index] = Reader.ACKED;
  this.doMoreWork();
}

Reader.prototype.doMoreWork = function() {
  var gap = this.sentCount - this.ackedCount;
  console.log("gap:"+gap);
  // TODO, this gap should be customizable
  if (gap < 20) {
    for (var i = 0; i != this.chunkCount; i++) {
      if (this.tracker[i] == Reader.UNSENT) {
        return this.send(i);
      }
    }
  }
}

Reader.prototype.send = function(index) {
  var reader = this;
  var chunkLength = index == this.chunkCount - 1 ? this.file.size % this.chunkSize : this.chunkSize;
  var blob = this.file.slice(this.chunkSize * index, this.chunkSize * index + chunkLength);
  var fileReader = new FileReader();
  fileReader.onload = function(e) {
    if (e.target.readyState == FileReader.DONE) {
      reader.emit('chunkLoaded', index, chunkLength, e.target.result);
    }
  };
  console.time("reading blob");
  fileReader.readAsArrayBuffer(blob);
  console.timeEnd("reading blob");
  if (this.tracker[index] != Reader.SENT) {
    this.unsentCount--;
    this.sentCount++;
  }
  this.tracker[index] = Reader.SENT;
  this.doMoreWork();
}

function Writer(fileId, chunkCount, filesize, dir) {
  var writer = this;
  this.dir = dir;
  this.fileId = fileId;
  this.chunks = [];
  this.requestIndex = 0;
  this.addedCount = 0;
  this.writtenCount = 0;
  this.bytesReceived = 0;
  this.bytesWritten = 0;
  this.startTime = Date.now();
  this.initialized = false;
  this.chunkCount = chunkCount;
  this.filesize = filesize;
  this.write();
}

Writer.prototype.write = function() {
  var writer = this;
  if (writer.chunks.length == 0) {
    setTimeout(function() { console.log("!!! NO WORK TO DO !!!"); writer.write(); }, 1000);
  } else {
    this.dir.getFile(writer.fileId, {create: true}, function(fileEntry) {
      console.time("creating writer")
      fileEntry.createWriter(function(fileWriter) {
        console.timeEnd("creating writer")
        fileWriter.onwriteend = function(e) {
          if (writer.initialized) {
            writer.emit('fileChunkWritten', writer.fileId, fileWriter.chunkIndex, writer.bytesWritten);
            console.log("finished writing "+writer.writtenCount);
            console.timeEnd("writing "+fileWriter.chunkIndex);
            writer.bytesWritten = writer.bytesWritten + blob.size;
            writer.writtenCount++;
            if (writer.writtenCount == writer.chunkCount) {
              writer.emit('fileComplete', writer.fileId, fileEntry.toURL());
            } else {
              writer.write();
            }
          } else {
            writer.initialized = true;
            writer.write();
          }
        };

        fileWriter.onerror = function(e) {
          console.log('Write failed: ' + e.toString());
        };
        if (!writer.initialized) {
          fileWriter.truncate(writer.filesize);
        } else {
          var next = writer.chunks.shift();
          console.log("writing a chunk, "+writer.chunks.length+" left")
          var blob = new Blob([next[0]]);
          fileWriter.chunkIndex = next[2];
          console.time("seeking to "+next[2]);
          fileWriter.seek(next[1]);
          console.timeEnd("seeking to "+next[2]);
          console.time("writing "+next[2]);
          console.time("sending write");
          fileWriter.write(blob);
          console.timeEnd("sending write");
        }
      }, errorHandler);
    }, errorHandler);
  }
}

Writer.prototype.gap = function() {
  return this.requestIndex - this.writtenCount;
}

Writer.prototype.add = function(chunk, offset, index) {
  this.addedCount++;
  this.chunks.push([chunk, offset, index]);
}

var FS = module.exports = function(size) {
  var fsInterface = this;
  // Allow for vendor prefixes.
  window.requestFileSystem = window.requestFileSystem ||
                             window.webkitRequestFileSystem;
  // Start the app by requesting a FileSystem (if the browser supports the API)

  var quotaSize = 1024 * 1024 * 1024 * 5;
  navigator.webkitPersistentStorage.requestQuota(quotaSize, function(grantedSize) {
    console.log('available size is '+grantedSize);
    // Request a file system with the new size.
    window.requestFileSystem(window.TEMPORARY, grantedSize, function(fs) {
      // Set the filesystem variable to slick's directory on the filesystem
      fs.root.getDirectory("slick", {create: true}, function(dirEntry) {
        fsInterface.setFileSystem(dirEntry);
      }, errorHandler);
    }, errorHandler);
  }, errorHandler);
}

FS.prototype.setFileSystem = function(entry) {
  var fs = this;
  this.entry = entry;
  var dirReader = this.entry.createReader();
    dirReader.readEntries(function(entries) {
      for (var i = 0, entry; entry = entries[i]; ++i) {
        console.log("removing "+entries[i]);
        if (entry.isDirectory) {
          entry.removeRecursively(function() {}, errorHandler);
        } else {
          entry.remove(function() {}, errorHandler);
        }
      }
      fs.emit('ready');
   }, errorHandler);
}

FS.prototype.writer = function(fileId, chunkCount, fileSize) {
  return new Writer(fileId, chunkCount, fileSize, this.entry)
}

FS.prototype.reader = function(fileId, file, chunkSize) {
  return new Reader(fileId, file, chunkSize);
}

_.extend(FS.prototype, EventEmitter.prototype);
_.extend(Writer.prototype, EventEmitter.prototype);
_.extend(Reader.prototype, EventEmitter.prototype);

